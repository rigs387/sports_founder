import { offseasonOpen, QUARTERS_PER_YEAR, yearOfQuarter } from "./calendar";
import { namePool } from "./flagship";
import { landmarks } from "./records";
import { createRngState, nextFloat, restoreRng } from "./rng";
import type { FamilyHead, FoundingFamily, GameState, Landmark, World } from "./types";

// The founding family (GDD v1.40, tech plan 2.30): flavor only, no number reads it. The founder
// is named at setup; every `family.generationYears` years, in the offseason, the torch passes to
// an heir drawn from the anchor's name pool (daughters and sons alike) on the family's own random
// stream, with a `familyHandoff` landmark and a minor card. Each head who hands over (retiring is
// the last head stepping down) enters the Hall of Fame's Family wing, outside the ballot, on a
// plaque of what happened on their watch.

/** Distinguishes the family's random stream from every other. */
const FAMILY_STREAM = 0x2c1b_3c6d;

/** The anchor's pool's women's and men's given names, women first. */
function givenNames(world: World, anchorCountryId: string) {
  const pool = namePool(world, anchorCountryId);
  return { women: pool?.women ?? [], men: pool?.given ?? [] };
}

/** Whether a given name reads as a daughter's in the anchor's pool. */
export function isDaughterName(world: World, anchorCountryId: string, given: string): boolean {
  const { women, men } = givenNames(world, anchorCountryId);
  return women.includes(given) && !men.includes(given);
}

/** A family name as a daughter carries it: the pool's first matching feminine rule. */
export function feminineName(world: World, anchorCountryId: string, name: string): string {
  const rule = (namePool(world, anchorCountryId)?.feminine ?? []).find((r) =>
    name.endsWith(r.from),
  );
  return rule ? name.slice(0, name.length - rule.from.length) + rule.to : name;
}

/**
 * A head's full name in the anchor's naming order. The founder's family name stands as it was
 * written; an heir who is a daughter takes its feminine form.
 */
export function headName(
  world: World,
  anchorCountryId: string,
  family: FoundingFamily,
  index: number,
): string {
  const head = family.heads[index];
  if (!head) return "";
  const surname =
    index > 0 && head.daughter ? feminineName(world, anchorCountryId, family.name) : family.name;
  return namePool(world, anchorCountryId)?.order === "familyFirst"
    ? `${surname} ${head.given}`
    : `${head.given} ${surname}`;
}

/** The founder's default from the seed: a daughter or a son of the anchor's pool. */
export function defaultFounder(
  world: World,
  seed: number,
  anchorCountryId: string,
): { founderName: string; familyName: string } {
  const pool = namePool(world, anchorCountryId);
  const rng = restoreRng(createRngState((seed ^ FAMILY_STREAM) >>> 0));
  const { women, men } = givenNames(world, anchorCountryId);
  const given = [...women, ...men];
  const family = pool?.family ?? [];
  return {
    founderName: given[Math.floor(nextFloat(rng) * given.length)] ?? "",
    familyName: family[Math.floor(nextFloat(rng) * family.length)] ?? "",
  };
}

/** The heir of generation `generation` (1 for the founder's): a given name not yet in the family. */
function drawHeir(
  world: World,
  seed: number,
  anchorCountryId: string,
  family: FoundingFamily,
  generation: number,
): Pick<FamilyHead, "given" | "daughter"> {
  const rng = restoreRng(
    createRngState((seed ^ FAMILY_STREAM ^ Math.imul(generation, 0x9e37_79b9)) >>> 0),
  );
  const { women, men } = givenNames(world, anchorCountryId);
  const used = new Set(family.heads.map((h) => h.given));
  const open = [
    ...women.map((given) => ({ given, daughter: true })),
    ...men.map((given) => ({ given, daughter: false })),
  ].filter((option) => !used.has(option.given));
  const pick = open[Math.floor(nextFloat(rng) * open.length)];
  return pick ?? { given: men[0] ?? "", daughter: false };
}

/**
 * At End Turn's end: in an offseason generationYears or more after the head took over, the torch
 * passes to an heir, with a `familyHandoff` landmark (its card is the minor `family-handoff`).
 */
export function updateFamily(state: GameState, world: World): GameState {
  const { family } = state.identity;
  const head = family.heads.at(-1);
  if (state.outcome !== null || !head || !offseasonOpen(state)) return state;
  const years = world.config.family.generationYears;
  if (state.quarter - head.tookOver < years * QUARTERS_PER_YEAR) return state;
  const generation = family.heads.length;
  const heir = drawHeir(world, state.seed, state.anchorCountryId, family, generation);
  const heads = [
    ...family.heads.slice(0, -1),
    { ...head, handedOver: state.quarter },
    { ...heir, tookOver: state.quarter, handedOver: null },
  ];
  return {
    ...state,
    identity: { ...state.identity, family: { ...family, heads } },
    landmarks: [
      ...state.landmarks,
      landmarks.familyHandoff(state.turn, state.quarter, state.anchorCountryId, generation),
    ],
  };
}

/** Retiring is the last head stepping down (GDD v1.40): their watch ends now. */
export function stepDown(state: GameState): GameState {
  const { family } = state.identity;
  const head = family.heads.at(-1);
  if (!head || head.handedOver !== null) return state;
  const heads = [...family.heads.slice(0, -1), { ...head, handedOver: state.quarter }];
  return { ...state, identity: { ...state.identity, family: { ...family, heads } } };
}

/** What happened on a head's watch, read from the landmarks of their tenure. */
export interface FamilyWatch {
  /** PP tiers reached. */
  tiers: number[];
  /** Leagues formed abroad. */
  leaguesAbroad: number;
  /** Times the sport became, and stopped being, the world's #1. */
  rankOneTaken: number;
  rankOneLost: number;
  championshipFounded: boolean;
  won: boolean;
}

export interface FamilyHeadSnapshot {
  name: string;
  daughter: boolean;
  /** The quarter they took over (the handoff card's quarter). */
  tookOver: number;
  fromYear: number;
  /** Null while they lead. */
  toYear: number | null;
  /** In the Hall's Family wing once they hand over. */
  inducted: boolean;
  watch: FamilyWatch;
}

function watchOf(
  all: readonly Landmark[],
  anchorCountryId: string,
  from: number,
  to: number | null,
): FamilyWatch {
  const during = all.filter((l) => l.quarter >= from && (to === null || l.quarter < to));
  return {
    tiers: during.flatMap((l) => (l.kind === "ppTierUp" ? [l.to] : [])),
    leaguesAbroad: during.filter(
      (l) => l.kind === "leagueFormed" && l.countryId !== anchorCountryId,
    ).length,
    rankOneTaken: during.filter((l) => l.kind === "rankOneTaken").length,
    rankOneLost: during.filter((l) => l.kind === "rankOneLost").length,
    championshipFounded: during.some((l) => l.kind === "championshipFounded"),
    won: during.some((l) => l.kind === "won"),
  };
}

/** The family as the UI shows it: every head, the founder first, with their watch. */
export function familySnapshot(state: GameState, world: World): FamilyHeadSnapshot[] {
  const { family } = state.identity;
  const year = (quarter: number) => yearOfQuarter(quarter, world.config);
  return family.heads.map((head, index) => ({
    name: headName(world, state.anchorCountryId, family, index),
    daughter: head.daughter,
    tookOver: head.tookOver,
    fromYear: year(head.tookOver),
    toYear: head.handedOver === null ? null : year(head.handedOver),
    inducted: head.handedOver !== null,
    watch: watchOf(state.landmarks, state.anchorCountryId, head.tookOver, head.handedOver),
  }));
}
