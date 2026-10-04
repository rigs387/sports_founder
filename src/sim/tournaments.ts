import { QUARTERS_PER_YEAR } from "./calendar";
import type { Config } from "./types";

// Rivals' world championships (GDD v1.17). Each modeled rival holds one on its real quadrennial
// cycle; for a year it lifts the rival in every country (src/sim/countermoves.ts), whatever the
// player does, and the ground it wins above home ages away afterward. Dates and sizes are config
// (`rivalAI.tournaments`). Quarters are counted from the campaign start: quarter q is the q-th
// quarter simulated (0 for the first), in year calendar.startYear + ⌊q ÷ 4⌋.

export type Tournament = Config["rivalAI"]["tournaments"][number];

/** The quarter index an edition held in `year` starts, counted from the campaign start. */
function startQuarter(tournament: Tournament, year: number, config: Config): number {
  return (year - config.calendar.startYear) * QUARTERS_PER_YEAR + tournament.startQuarterOfYear - 1;
}

/**
 * The start quarter of the edition whose surge covers quarter `quarter`, or null when none does.
 * Editions before the campaign start count too: one already under way at the start is in effect.
 */
export function tournamentEditionAt(
  tournament: Tournament,
  quarter: number,
  config: Config,
): number | null {
  const year = config.calendar.startYear + Math.floor(quarter / QUARTERS_PER_YEAR);
  // The latest edition year at or before this year, then the one before it if that has not
  // started yet (a surge can run into the next calendar year).
  const cycles = Math.floor((year - tournament.firstYear) / tournament.everyYears);
  for (const k of [cycles, cycles - 1]) {
    if (k < 0) continue;
    const start = startQuarter(
      tournament,
      tournament.firstYear + k * tournament.everyYears,
      config,
    );
    if (start <= quarter && quarter < start + tournament.quarters) return start;
  }
  return null;
}

/** The rival's world championship in effect in quarter `quarter`, if any. */
export function activeTournament(
  sportId: string,
  quarter: number,
  config: Config,
): Tournament | null {
  const tournament = config.rivalAI.tournaments.find((t) => t.sportId === sportId);
  if (!tournament) return null;
  return tournamentEditionAt(tournament, quarter, config) === null ? null : tournament;
}

/** The world championships that start in quarter `quarter`. */
export function tournamentsStarting(quarter: number, config: Config): Tournament[] {
  return config.rivalAI.tournaments.filter(
    (tournament) => tournamentEditionAt(tournament, quarter, config) === quarter,
  );
}
