import { type GameState, PLAYER_INDEX, type VenueState, type World } from "./types";

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

/**
 * The seat venue's lift on hardcore conversion in its country (GDD v1.30): 1 + conversionBoost ×
 * level, fading by capacity ÷ hardcore while fans overflow (no seat, no habit). 1 elsewhere.
 */
export function venueConversion(
  state: Pick<GameState, "countries" | "flagship">,
  world: World,
  countryIndex: number,
): number {
  const country = state.countries[countryIndex];
  if (!country?.league || world.countries[countryIndex]?.id !== state.flagship.countryId) return 1;
  const level = country.league.venue.level;
  const hardcore = country.fans[PLAYER_INDEX]?.hardcore ?? 0;
  const capacity = venueCapacity(world, countryIndex, level);
  const seated = hardcore > capacity ? capacity / hardcore : 1;
  return 1 + world.config.leagues.venue.conversionBoost * level * seated;
}
