import { offseasonOpen } from "./calendar";
import { leagueIncomePerQuarter } from "./deals";
import { seatStars } from "./flagship";
import { agreementPayShare, leagueCosts, termsInForce } from "./league-costs";
import { leagueTierIndex } from "./leagues";
import { landmarks } from "./records";
import { createRngState, nextFloat, restoreRng, saveRng } from "./rng";
import {
  type AgreementState,
  type AgreementTerms,
  type GameState,
  MIN_WAGES,
  type MinWage,
  type World,
} from "./types";

// The players' agreement at the flagship (GDD v1.39, tech plan 2.25 step 2). The union forms when
// the seat's league reaches Professional; talks open in the offseason before the first season the
// agreement in force does not cover. The player sets four levers and sees the union's read (will
// sign, a chance of a stoppage, will refuse); confirming makes one roll on the talks' own stream.
// End Turn takes the union's ask, which never rolls. A failed roll is a stoppage: the season is
// lost (its effects are step 4) and the union's ask is signed on the shortest term.

const AGREEMENT_STREAM = 0x510e_527f;

export function newAgreement(seed: number): AgreementState {
  return {
    rng: createRngState((seed ^ AGREEMENT_STREAM) >>> 0),
    current: null,
    stoppageSeason: null,
  };
}

const seatIndex = (state: Pick<GameState, "flagship">, world: World) =>
  world.countries.findIndex((country) => country.id === state.flagship.countryId);

/** Whether the seat's league is at the tier where players are professionals. */
function seatProfessional(state: GameState, world: World): boolean {
  const league = state.countries[seatIndex(state, world)]?.league;
  return (
    !!league &&
    leagueTierIndex(league.tier) >= leagueTierIndex(world.config.leagues.players.fromTier)
  );
}

/** The union exists once the seat's league turned Professional or an agreement was signed. */
export function unionFormed(state: GameState, world: World): boolean {
  return state.agreement.current !== null || seatProfessional(state, world);
}

/**
 * Talks are open in the offseason when the seat's league is Professional or above and the next
 * season (`flagship.season` while the offseason is open) is not covered by an agreement.
 */
export function talksOpen(state: GameState, world: World): boolean {
  if (!offseasonOpen(state) || !seatProfessional(state, world)) return false;
  const current = state.agreement.current;
  return current === null || state.flagship.season > current.throughSeason;
}

/** The seat league's operating margin before the players: (income − other costs) ÷ income. */
function operatingMargin(state: GameState, world: World): number {
  const index = seatIndex(state, world);
  const income = leagueIncomePerQuarter(state, world, index);
  if (income <= 0) return 0;
  const costs = leagueCosts(state, world, index);
  return (income - (costs.total - costs.payroll)) / income;
}

/** What the union counts an offer as worth, in share points (config `agreement.union`). */
function unionValue(terms: AgreementTerms, state: GameState, world: World): number {
  const rules = world.config.flagship.agreement;
  const termIndex = rules.terms.indexOf(terms.term);
  const cap = terms.cap
    ? rules.union.capValue + rules.union.capValuePerStar * seatStars(state.flagship).length
    : 0;
  return (
    terms.share +
    rules.union.minWageWeight * rules.minWages[terms.minWage] -
    cap -
    (rules.union.termValue[termIndex] ?? 0)
  );
}

/**
 * The union's ask: the shortest term, no cap, a standard minimum wage and a share that rises with
 * the league's operating margin, kept in range (so giving the ask is always possible).
 */
export function unionAsk(state: GameState, world: World): AgreementTerms {
  const rules = world.config.flagship.agreement;
  const { baseAsk, profitWeight, profitReference } = rules.union;
  const wanted = baseAsk + profitWeight * (operatingMargin(state, world) - profitReference);
  const share = Math.min(rules.shares[1], Math.max(rules.shares[0], Math.round(wanted)));
  return { share, term: rules.terms[0] ?? 1, cap: false, minWage: "standard" };
}

export type UnionRead = "sign" | "edge" | "refuse";

/** The union's read of an offer: the chance it refuses (a stoppage) and the read it shows. */
export function unionRead(
  state: GameState,
  world: World,
  offer: AgreementTerms,
): { chance: number; read: UnionRead } {
  const gap = unionValue(unionAsk(state, world), state, world) - unionValue(offer, state, world);
  const chance = Math.min(1, Math.max(0, gap / world.config.flagship.agreement.union.edge));
  return { chance, read: chance <= 0 ? "sign" : chance >= 1 ? "refuse" : "edge" };
}

export type AgreementBlocker = "window" | "union" | "inForce" | "terms";

/** Whether the levers are on the table: a whole-percent share in range, a listed term. */
function validTerms(offer: AgreementTerms, world: World): boolean {
  const rules = world.config.flagship.agreement;
  return (
    Number.isInteger(offer.share) &&
    offer.share >= rules.shares[0] &&
    offer.share <= rules.shares[1] &&
    rules.terms.includes(offer.term) &&
    typeof offer.cap === "boolean" &&
    (MIN_WAGES as readonly string[]).includes(offer.minWage)
  );
}

/** Why an offer cannot be proposed now, or null. */
export function agreementBlocker(
  state: GameState,
  world: World,
  offer: AgreementTerms,
): AgreementBlocker | null {
  if (!offseasonOpen(state)) return "window";
  if (!seatProfessional(state, world)) return "union";
  if (!talksOpen(state, world)) return "inForce";
  return validTerms(offer, world) ? null : "terms";
}

/** Signs `terms` from the next season on, with its landmark. */
function sign(
  state: GameState,
  terms: AgreementTerms,
  rng: number[],
  proposed: boolean,
  stoppage: boolean,
): GameState {
  const fromSeason = state.flagship.season;
  return {
    ...state,
    agreement: {
      rng,
      current: { ...terms, fromSeason, throughSeason: fromSeason + terms.term - 1 },
      stoppageSeason: stoppage ? fromSeason : state.agreement.stoppageSeason,
    },
    landmarks: [
      ...state.landmarks,
      landmarks.agreementSigned(
        state.turn,
        state.quarter,
        state.flagship.countryId,
        fromSeason,
        terms,
        proposed,
        stoppage,
      ),
    ],
  };
}

/**
 * Puts an offer to the union (legality checked by the caller): one roll against its read. Signed,
 * the offer runs from the next season; refused, that season is lost to a stoppage and the
 * union's ask is signed on the shortest term.
 */
export function proposeAgreement(state: GameState, world: World, offer: AgreementTerms): GameState {
  const { chance } = unionRead(state, world, offer);
  const rng = restoreRng(state.agreement.rng);
  const refused = nextFloat(rng) < chance;
  if (!refused) return sign(state, offer, saveRng(rng), true, false);
  const ask = unionAsk(state, world);
  const shortest = world.config.flagship.agreement.terms[0] ?? ask.term;
  return sign(state, { ...ask, term: shortest }, saveRng(rng), true, true);
}

/** End Turn with the talks still open takes the union's ask: it never rolls. */
export function settleAgreement(state: GameState, world: World): GameState {
  if (!talksOpen(state, world)) return state;
  return sign(state, unionAsk(state, world), state.agreement.rng, false, false);
}

export interface AgreementOffer {
  terms: AgreementTerms;
  /** The chance the union refuses it: a stoppage. */
  chance: number;
  read: UnionRead;
}

export interface AgreementSnapshot {
  formed: boolean;
  talksOpen: boolean;
  /** The terms in force (the default before the first agreement). */
  terms: AgreementTerms;
  /** The seasons the agreement in force covers; null before the first. */
  fromSeason: number | null;
  throughSeason: number | null;
  /** The union's ask, while talks are open. */
  ask: AgreementTerms | null;
  /** Every offer on the table with the union's read, while talks are open. */
  offers: AgreementOffer[];
  /** The levers' options. */
  shares: readonly [number, number];
  termOptions: readonly number[];
  /** Payroll points of income each minimum wage adds to the share. */
  minWages: Record<MinWage, number>;
  /** The season lost to the last stoppage, if any. */
  stoppageSeason: number | null;
  /** The seat league's income a quarter, so the screen can price a share. */
  incomePerQuarter: number;
  /** What the terms in force pay the players, as a share of income. */
  payShare: number;
}

/** Every combination of levers, in a stable order. */
function allOffers(world: World): AgreementTerms[] {
  const rules = world.config.flagship.agreement;
  const offers: AgreementTerms[] = [];
  for (let share = rules.shares[0]; share <= rules.shares[1]; share += 1)
    for (const term of rules.terms)
      for (const cap of [false, true])
        for (const minWage of MIN_WAGES) offers.push({ share, term, cap, minWage });
  return offers;
}

export function agreementSnapshot(state: GameState, world: World): AgreementSnapshot {
  const rules = world.config.flagship.agreement;
  const open = talksOpen(state, world);
  const current = state.agreement.current;
  const terms = termsInForce(state, world);
  return {
    formed: unionFormed(state, world),
    talksOpen: open,
    terms,
    fromSeason: current?.fromSeason ?? null,
    throughSeason: current?.throughSeason ?? null,
    ask: open ? unionAsk(state, world) : null,
    offers: open
      ? allOffers(world).map((offer) => ({ terms: offer, ...unionRead(state, world, offer) }))
      : [],
    shares: rules.shares,
    termOptions: rules.terms,
    minWages: rules.minWages,
    stoppageSeason: state.agreement.stoppageSeason,
    incomePerQuarter: leagueIncomePerQuarter(state, world, seatIndex(state, world)),
    payShare: agreementPayShare(terms, world),
  };
}

/** Problems with the agreement's state (src/sim/invariants.ts). */
export function agreementProblems(state: GameState, world: World): string[] {
  const current = state.agreement.current;
  if (!current) return [];
  const problems: string[] = [];
  if (!validTerms(current, world)) problems.push("agreement: terms off the table");
  if (current.throughSeason !== current.fromSeason + current.term - 1)
    problems.push("agreement: seasons do not match its term");
  return problems;
}
