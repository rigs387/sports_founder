import { offseasonOpen, QUARTERS_PER_YEAR, yearOfQuarter } from "./calendar";
import { drawName } from "./flagship";
import { demoteHardcore, runningCostPerQuarter } from "./leagues";
import { landmarks } from "./records";
import { createRngState, nextFloat, type Rng, restoreRng, saveRng } from "./rng";
import {
  type Director,
  type DirectorCandidate,
  type DirectorLeaving,
  type DirectorsState,
  type DirectorTerm,
  type GameState,
  type Landmark,
  type LeagueTierId,
  PLAYER_INDEX,
  type World,
} from "./types";

// League directors (GDD v1.40, tech plan 2.26 step 1). A league in a focus country, other than
// the seat's, has a director while the country holds a focus slot: focus made a person. Each has
// one trait (config `directors.traits`) that bends the simple model for their own league only:
// its running cost and income, and the conversion rates in its country. The salary comes from
// league cash. Directors are drawn on their own random stream, when End Turn starts (so the focus
// the player set this turn decides who serves through its quarters) and again at its end (a
// league formed, folded or the seat moved). Focus leaving ends the term with no severance;
// replacing a director is an offseason action. Every finished term is kept for the Builders wing.

const DIRECTORS_STREAM = 0x5be0_cd19;

export function newDirectors(seed: number): DirectorsState {
  return {
    rng: createRngState((seed ^ DIRECTORS_STREAM) >>> 0),
    nextId: 1,
    serving: [],
    past: [],
    candidates: [],
  };
}

export interface TraitFactors {
  runningCost: number;
  income: number;
  casualConversion: number;
  hardcoreConversion: number;
}

const NEUTRAL: TraitFactors = {
  runningCost: 1,
  income: 1,
  casualConversion: 1,
  hardcoreConversion: 1,
};

/** The trait ids in content order. */
export function directorTraits(world: World): string[] {
  return Object.keys(world.config.directors.traits);
}

/** The director serving in a country's league now, if any. */
export function directorIn(
  state: Pick<GameState, "directors">,
  countryId: string,
): Director | undefined {
  return state.directors.serving.find((director) => director.countryId === countryId);
}

/** What a country's director does to its numbers; neutral where none serves, and at the seat. */
export function directorFactors(
  state: Pick<GameState, "directors" | "flagship">,
  world: World,
  countryId: string,
): TraitFactors {
  if (countryId === state.flagship.countryId) return NEUTRAL;
  const director = directorIn(state, countryId);
  if (!director) return NEUTRAL;
  return world.config.directors.traits[director.trait] ?? NEUTRAL;
}

/** A director's salary a quarter: a share of the league's running cost by its tier. */
export function directorSalary(
  state: Pick<GameState, "directors" | "flagship" | "growthNodes">,
  world: World,
  index: number,
  tier: LeagueTierId,
): number {
  const countryId = world.countries[index]?.id;
  if (countryId === undefined || countryId === state.flagship.countryId) return 0;
  if (!directorIn(state, countryId)) return 0;
  return (
    world.config.directors.salaryShare[tier] *
    runningCostPerQuarter(world, index, tier, state.growthNodes)
  );
}

/** The severance a director's replacement costs their league now. */
export function severance(state: GameState, world: World, countryId: string): number {
  const index = world.countries.findIndex((country) => country.id === countryId);
  const tier = state.countries[index]?.league?.tier;
  if (tier === undefined) return 0;
  return world.config.directors.severanceQuarters * directorSalary(state, world, index, tier);
}

/** Countries whose league should have a director now: focused, with a league, not the seat. */
function directedCountries(state: GameState): string[] {
  const seen = new Set<string>();
  for (const countryId of state.focus) {
    if (countryId === null || countryId === state.flagship.countryId) continue;
    if (!state.countries.find((c) => c.countryId === countryId)?.league) continue;
    seen.add(countryId);
  }
  return [...seen];
}

function takenNames(directors: DirectorsState): Set<string> {
  return new Set([
    ...directors.serving.map((d) => d.name),
    ...directors.past.map((d) => d.name),
    ...directors.candidates.flatMap((c) => c.options.map((o) => o.name)),
  ]);
}

function drawCandidate(
  world: World,
  rng: Rng,
  countryId: string,
  taken: Set<string>,
): DirectorCandidate {
  const traits = directorTraits(world);
  const name = drawName(world, rng, countryId, taken);
  taken.add(name);
  const trait = traits[Math.floor(nextFloat(rng) * traits.length)] ?? traits[0] ?? "";
  return { name, trait };
}

function tierIn(state: GameState, countryId: string): LeagueTierId | null {
  return state.countries.find((c) => c.countryId === countryId)?.league?.tier ?? null;
}

/** Ends a term: the record the Builders wing reads. */
function endTerm(state: GameState, director: Director, reason: DirectorLeaving): DirectorTerm {
  const promotions = state.landmarks.filter(
    (l) =>
      l.kind === "leaguePromoted" &&
      l.countryId === director.countryId &&
      l.quarter >= director.fromQuarter,
  ).length;
  return {
    ...director,
    toQuarter: state.quarter,
    tierOnLeaving: tierIn(state, director.countryId),
    promotions,
    reason,
  };
}

/**
 * Brings the directors in line with the focus slots and leagues now: terms end where focus left,
 * the league folded or the seat arrived, and a director is drawn for each focused league without
 * one. While the offseason is open each serving director's league has its candidates; once it
 * closes they are gone. With `quarters` (End Turn's end), each scandal-prone director may have a
 * scandal over that many quarters.
 */
export function syncDirectors(state: GameState, world: World, quarters = 0): GameState {
  if (state.outcome !== null) return state;
  const wanted = new Set(directedCountries(state));
  const current = state.directors;
  const unchanged =
    current.serving.length === wanted.size &&
    current.serving.every((d) => wanted.has(d.countryId)) &&
    (offseasonOpen(state)
      ? current.candidates.length === current.serving.length
      : current.candidates.length === 0) &&
    quarters === 0;
  if (unchanged) return state;

  const rng = restoreRng(current.rng);
  const past = [...current.past];
  const serving: Director[] = [];
  for (const director of current.serving) {
    if (wanted.has(director.countryId)) {
      serving.push(director);
      continue;
    }
    const reason: DirectorLeaving =
      director.countryId === state.flagship.countryId
        ? "seat"
        : tierIn(state, director.countryId) === null
          ? "league"
          : "focus";
    past.push(endTerm(state, director, reason));
  }
  let nextId = current.nextId;
  const taken = takenNames(current);
  for (const countryId of wanted) {
    if (serving.some((d) => d.countryId === countryId)) continue;
    const drawn = drawCandidate(world, rng, countryId, taken);
    // Key order follows the save schema, so a resumed game re-serializes identically.
    serving.push({
      id: nextId++,
      name: drawn.name,
      countryId,
      trait: drawn.trait,
      fromQuarter: state.quarter,
      tierOnArrival: tierIn(state, countryId) ?? "amateur",
    });
  }
  // Candidates for each league while the offseason is open, drawn once.
  const candidates = offseasonOpen(state)
    ? serving.map(
        (director) =>
          current.candidates.find((c) => c.countryId === director.countryId) ?? {
            countryId: director.countryId,
            options: Array.from({ length: world.config.directors.candidates }, () =>
              drawCandidate(world, rng, director.countryId, taken),
            ),
          },
      )
    : [];

  // Scandals over the turn just played.
  let countries = state.countries;
  const found: Landmark[] = [];
  if (quarters > 0) {
    const { chancePerYear, hardcoreLoss } = world.config.directors.scandal;
    const chance = 1 - (1 - chancePerYear) ** (quarters / QUARTERS_PER_YEAR);
    for (const director of serving) {
      if (!world.config.directors.traits[director.trait]?.scandals) continue;
      if (nextFloat(rng) >= chance) continue;
      const index = countries.findIndex((c) => c.countryId === director.countryId);
      const country = countries[index];
      const fans = country?.fans[PLAYER_INDEX];
      if (!country || !fans) continue;
      const after = demoteHardcore(fans, hardcoreLoss);
      const demoted = fans.hardcore - after.hardcore;
      if (demoted <= 0) continue;
      const nextFans = [...country.fans];
      nextFans[PLAYER_INDEX] = after;
      countries = countries.map((c, i) => (i === index ? { ...country, fans: nextFans } : c));
      found.push(
        landmarks.directorScandal(
          state.turn,
          state.quarter,
          director.countryId,
          director.id,
          demoted,
        ),
      );
    }
  }

  return {
    ...state,
    countries,
    landmarks: found.length > 0 ? [...state.landmarks, ...found] : state.landmarks,
    directors: { rng: saveRng(rng), nextId, serving, past, candidates },
  };
}

export type DirectorBlocker = "offseason" | "noDirector" | "candidate" | "cash";

/** Why a director cannot be replaced by candidate `pick` now, or null. */
export function replaceBlocker(
  state: GameState,
  world: World,
  countryId: string,
  pick: number,
): DirectorBlocker | null {
  if (!offseasonOpen(state)) return "offseason";
  if (!directorIn(state, countryId)) return "noDirector";
  const options = state.directors.candidates.find((c) => c.countryId === countryId)?.options;
  if (!options?.[pick]) return "candidate";
  const cash = state.countries.find((c) => c.countryId === countryId)?.league?.cash ?? 0;
  if (cash < severance(state, world, countryId)) return "cash";
  return null;
}

/**
 * Replaces a country's director with this offseason's candidate `pick` (GDD v1.40): severance
 * from the league's cash, the old term on record, and that league's candidates spent.
 */
export function replaceDirector(
  state: GameState,
  world: World,
  countryId: string,
  pick: number,
): GameState {
  const director = directorIn(state, countryId);
  const options = state.directors.candidates.find((c) => c.countryId === countryId)?.options;
  const chosen = options?.[pick];
  if (!director || !chosen) return state;
  const cost = severance(state, world, countryId);
  const directors = state.directors;
  return {
    ...state,
    countries: state.countries.map((c) =>
      c.countryId === countryId && c.league
        ? { ...c, league: { ...c.league, cash: c.league.cash - cost } }
        : c,
    ),
    directors: {
      ...directors,
      nextId: directors.nextId + 1,
      serving: directors.serving.map((d) =>
        d.id === director.id
          ? {
              id: directors.nextId,
              name: chosen.name,
              countryId,
              trait: chosen.trait,
              fromQuarter: state.quarter,
              tierOnArrival: tierIn(state, countryId) ?? director.tierOnArrival,
            }
          : d,
      ),
      past: [...directors.past, endTerm(state, director, "replaced")],
      // One replacement a league an offseason: its candidates are spent, not drawn again.
      candidates: directors.candidates.map((c) =>
        c.countryId === countryId ? { countryId, options: [] } : c,
      ),
    },
  };
}

export interface DirectorSnapshot {
  id: number;
  name: string;
  countryId: string;
  trait: string;
  /** The year the term began. */
  fromYear: number;
  /** Years served so far, whole. */
  years: number;
  salaryPerQuarter: number;
}

export interface DirectorsSnapshot {
  serving: DirectorSnapshot[];
  /** Finished terms, newest first. */
  past: {
    id: number;
    name: string;
    countryId: string;
    trait: string;
    fromYear: number;
    toYear: number;
    promotions: number;
    reason: DirectorLeaving;
  }[];
  /** This offseason's replacements, with the severance each league would pay. */
  candidates: { countryId: string; severance: number; options: DirectorCandidate[] }[];
}

export function directorsSnapshot(state: GameState, world: World): DirectorsSnapshot {
  const { config } = world;
  return {
    serving: state.directors.serving.map((director) => {
      const index = world.countries.findIndex((c) => c.id === director.countryId);
      const tier = state.countries[index]?.league?.tier;
      return {
        id: director.id,
        name: director.name,
        countryId: director.countryId,
        trait: director.trait,
        fromYear: yearOfQuarter(director.fromQuarter, config),
        years: Math.floor((state.quarter - director.fromQuarter) / QUARTERS_PER_YEAR),
        salaryPerQuarter: tier ? directorSalary(state, world, index, tier) : 0,
      };
    }),
    past: [...state.directors.past].reverse().map((term) => ({
      id: term.id,
      name: term.name,
      countryId: term.countryId,
      trait: term.trait,
      fromYear: yearOfQuarter(term.fromQuarter, config),
      toYear: yearOfQuarter(term.toQuarter, config),
      promotions: term.promotions,
      reason: term.reason,
    })),
    candidates: state.directors.candidates.map((c) => ({
      countryId: c.countryId,
      severance: severance(state, world, c.countryId),
      options: c.options,
    })),
  };
}
