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

/**
 * PP cost multiplier. After a demotion, costs stay at the highest tier ever reached until the
 * player climbs back (GDD Global PP Tier Track), so the peak tier applies.
 */
export function costMultiplier(state: Pick<GameState, "tierTrack">, config: Config): number {
  return tierEntry(state.tierTrack.peakTier, config).costMultiplier;
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
