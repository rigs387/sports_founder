import type { Config, GameState, PpTier } from "./types";

// Calendar and tier-table lookups shared by the turn loop, actions and snapshots.

export const QUARTERS_PER_YEAR = 4;

export function tierEntry(tier: number, config: Config): PpTier {
  const entry = config.ppTiers.find((candidate) => candidate.tier === tier);
  if (!entry) throw new Error(`No PP tier ${tier} in config`);
  return entry;
}

export function turnLengthQuarters(tier: number, config: Config): number {
  return tierEntry(tier, config).turnLengthQuarters;
}

/** The in-game year a quarter falls in. */
export function yearOfQuarter(quarter: number, config: Config): number {
  return config.calendar.startYear + Math.floor(quarter / QUARTERS_PER_YEAR);
}

/**
 * Whether the offseason is open (GDD v1.24): from the flagship season's end until the next turn
 * ends. League business happens only in it, once a year.
 */
export function offseasonOpen(state: Pick<GameState, "flagship">): boolean {
  return state.flagship.offseason;
}
