import type {
  AxisId,
  EscalationLevel,
  GameState,
  Landmark,
  LeagueTierId,
  TimedCountermoveKind,
  YearlySnapshot,
} from "./types";

// History records (GDD History & Records). Landmarks are the permanent layer: plain facts the
// simulation actually produced, with no text. Stories later read these; they never invent.
// Constructors fix the key order so saved states re-serialize byte-identically.

export const landmarks = {
  leagueFormed: (
    turn: number,
    quarter: number,
    countryId: string,
    reformed: boolean,
  ): Landmark => ({
    kind: "leagueFormed",
    turn,
    quarter,
    countryId,
    reformed,
  }),
  leaguePromoted: (
    turn: number,
    quarter: number,
    countryId: string,
    from: LeagueTierId,
    to: LeagueTierId,
  ): Landmark => ({ kind: "leaguePromoted", turn, quarter, countryId, from, to }),
  leagueSteppedDown: (
    turn: number,
    quarter: number,
    countryId: string,
    from: LeagueTierId,
    to: LeagueTierId,
  ): Landmark => ({ kind: "leagueSteppedDown", turn, quarter, countryId, from, to }),
  leagueFolded: (
    turn: number,
    quarter: number,
    countryId: string,
    leagueTier: LeagueTierId,
  ): Landmark => ({ kind: "leagueFolded", turn, quarter, countryId, leagueTier }),
  anchorCollapse: (
    turn: number,
    quarter: number,
    countryId: string,
    leagueTier: LeagueTierId,
  ): Landmark => ({ kind: "anchorCollapse", turn, quarter, countryId, leagueTier }),
  birthplaceOutlived: (
    turn: number,
    quarter: number,
    countryId: string,
    leagueTier: LeagueTierId,
  ): Landmark => ({ kind: "birthplaceOutlived", turn, quarter, countryId, leagueTier }),
  rankOneTaken: (turn: number, quarter: number): Landmark => ({
    kind: "rankOneTaken",
    turn,
    quarter,
  }),
  rankOneLost: (turn: number, quarter: number, sportId: string): Landmark => ({
    kind: "rankOneLost",
    turn,
    quarter,
    sportId,
  }),
  won: (turn: number, quarter: number, heldTurns: number): Landmark => ({
    kind: "won",
    turn,
    quarter,
    heldTurns,
  }),
  ppTierUp: (turn: number, quarter: number, from: number, to: number): Landmark => ({
    kind: "ppTierUp",
    turn,
    quarter,
    from,
    to,
  }),
  ppTierDown: (turn: number, quarter: number, from: number, to: number): Landmark => ({
    kind: "ppTierDown",
    turn,
    quarter,
    from,
    to,
  }),
  nodeBought: (turn: number, quarter: number, nodeId: string, cost: number): Landmark => ({
    kind: "nodeBought",
    turn,
    quarter,
    nodeId,
    cost,
  }),
  rivalEscalated: (
    turn: number,
    quarter: number,
    countryId: string,
    sportId: string,
    from: EscalationLevel,
    to: EscalationLevel,
  ): Landmark => ({ kind: "rivalEscalated", turn, quarter, countryId, sportId, from, to }),
  rivalDeescalated: (
    turn: number,
    quarter: number,
    countryId: string,
    sportId: string,
    from: EscalationLevel,
    to: EscalationLevel,
  ): Landmark => ({ kind: "rivalDeescalated", turn, quarter, countryId, sportId, from, to }),
  rivalCountermove: (
    turn: number,
    quarter: number,
    countryId: string,
    sportId: string,
    move: TimedCountermoveKind,
    endQuarter: number,
  ): Landmark => ({
    kind: "rivalCountermove",
    turn,
    quarter,
    countryId,
    sportId,
    move,
    endQuarter,
  }),
  rivalRuleCopied: (
    turn: number,
    quarter: number,
    countryId: string,
    sportId: string,
    axis: AxisId,
    from: string,
    to: string,
  ): Landmark => ({ kind: "rivalRuleCopied", turn, quarter, countryId, sportId, axis, from, to }),
};

/**
 * Yearly world snapshot (GDD History & Records): fan buckets for every country × sport, flattened
 * as casual then hardcore, per sport in state order, per country in content order.
 */
export function yearlySnapshot(state: Pick<GameState, "countries">, year: number): YearlySnapshot {
  const fans: number[] = [];
  for (const country of state.countries) {
    for (const sport of country.fans) fans.push(sport.casual, sport.hardcore);
  }
  return { year, fans };
}
