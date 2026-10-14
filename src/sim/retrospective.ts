import { yearOfQuarter } from "./calendar";
import type { GameState, LegacyGoalId, World } from "./types";

// The retrospective (GDD v1.38): what a retired campaign looks back on. Everything else on the
// page is already in the snapshot (the standings series, the amendments, the Hall of Fame, the
// World Championship's tournaments, the legacy goals); this adds the timeline, read from the
// landmarks and nothing else.

/** One line of the timeline: a turning point of the campaign, with what it names. */
export type TimelineEntry = { turn: number; year: number } & (
  | { kind: "founded"; countryId: string }
  /** The first league outside the birthplace. */
  | { kind: "firstLeagueAbroad"; countryId: string }
  /** A PP tier reached for the first time. */
  | { kind: "tier"; tier: number }
  | { kind: "firstElite"; countryId: string }
  | { kind: "firstStar"; playerId: number }
  | { kind: "rankOneTaken" }
  | { kind: "rankOneLost"; sportId: string }
  | { kind: "won" }
  | { kind: "seatMoved"; countryId: string }
  | { kind: "championshipFounded" }
  | { kind: "birthplaceOutlived"; countryId: string }
  | { kind: "legacyGoal"; goalId: LegacyGoalId }
  | { kind: "retired" }
);

export interface RetrospectiveSnapshot {
  /** The year the sport was founded and the year its founder retired. */
  foundedYear: number;
  retiredYear: number;
  /** Oldest first; it opens with the founding and closes with the retirement. */
  timeline: TimelineEntry[];
}

/** The campaign's turning points so far, oldest first, from the landmarks. */
export function timeline(state: GameState, world: World): TimelineEntry[] {
  const year = (quarter: number) => yearOfQuarter(quarter, world.config);
  const entries: TimelineEntry[] = [
    { kind: "founded", turn: 1, year: year(0), countryId: state.anchorCountryId },
  ];
  let peakTier = 1;
  const once = new Set<string>();
  const first = (kind: string) => !once.has(kind) && once.add(kind).size > 0;
  for (const landmark of state.landmarks) {
    const at = { turn: landmark.turn, year: year(landmark.quarter) };
    switch (landmark.kind) {
      case "leagueFormed":
        if (landmark.countryId !== state.anchorCountryId && first("firstLeagueAbroad"))
          entries.push({ ...at, kind: "firstLeagueAbroad", countryId: landmark.countryId });
        break;
      case "leaguePromoted":
        if (landmark.to === "elite" && first("firstElite"))
          entries.push({ ...at, kind: "firstElite", countryId: landmark.countryId });
        break;
      case "ppTierUp":
        if (landmark.to > peakTier) {
          peakTier = landmark.to;
          entries.push({ ...at, kind: "tier", tier: landmark.to });
        }
        break;
      case "firstStar":
        if (first("firstStar"))
          entries.push({ ...at, kind: "firstStar", playerId: landmark.playerId });
        break;
      case "rankOneTaken":
      case "won":
      case "championshipFounded":
        entries.push({ ...at, kind: landmark.kind });
        break;
      case "rankOneLost":
        entries.push({ ...at, kind: "rankOneLost", sportId: landmark.sportId });
        break;
      case "seatMoved":
        if (landmark.reason === "moved")
          entries.push({ ...at, kind: "seatMoved", countryId: landmark.countryId });
        break;
      case "birthplaceOutlived":
        entries.push({ ...at, kind: "birthplaceOutlived", countryId: landmark.countryId });
        break;
      case "legacyGoal":
        entries.push({ ...at, kind: "legacyGoal", goalId: landmark.goalId });
        break;
    }
  }
  if (state.outcome?.kind === "retired")
    entries.push({
      kind: "retired",
      turn: state.outcome.turn,
      year: year(state.outcome.quarter),
    });
  return entries;
}

/** The retrospective of a retired campaign, or null while it is still played (or was lost). */
export function retrospectiveSnapshot(
  state: GameState,
  world: World,
): RetrospectiveSnapshot | null {
  if (state.outcome?.kind !== "retired") return null;
  return {
    foundedYear: yearOfQuarter(0, world.config),
    retiredYear: yearOfQuarter(state.outcome.quarter, world.config),
    timeline: timeline(state, world),
  };
}
