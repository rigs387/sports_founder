import type { VenueState, World } from "./types";

// Venues (GDD v1.30): the flagship's league has a capacity level 1–5, no individual stadiums. At
// the seat, gate is paid only on hardcore fans up to capacity. A level stays with its country's
// league when the seat moves. Every number is config (`leagues.venue`).

/** A new league's venue: level 1, nothing building, no record crowd. */
export function newVenue(): VenueState {
  return { level: 1, building: null, record: null };
}

/** Hardcore fans a venue at `level` seats in a country. */
export function venueCapacity(world: World, countryIndex: number, level: number): number {
  const shares = world.config.leagues.venue.capacityShare;
  const share = shares[Math.min(shares.length, Math.max(1, level)) - 1] ?? 0;
  return Math.floor(share * (world.countries[countryIndex]?.population ?? 0));
}

/** Hardcore fans seated: the crowd, never above capacity. */
export function seatedCrowd(
  world: World,
  countryIndex: number,
  level: number,
  hardcore: number,
): number {
  return Math.min(hardcore, venueCapacity(world, countryIndex, level));
}
