import { offseasonOpen } from "./calendar";
import { modernizeGrounds } from "./culture";
import { venueCostBasis } from "./leagues";
import { landmarks } from "./records";
import type { GameState, Landmark, World } from "./types";
import { groundSize, venueCapacity } from "./venues";

// Building venues (GDD v1.30): the seat's league buys the next level with cash in the offseason,
// one level at a time. It opens when the offseason before `opensSeason` closes; the old capacity
// keeps working while it builds. A level at or past `modernize.fromLevel` betrays famous grounds.

export interface VenueTerms {
  /** The level that would be built. */
  level: number;
  price: number;
  /** Seasons of building: it opens when the offseason before `opensSeason` closes. */
  seasons: number;
  opensSeason: number;
  capacity: number;
  /** Each club's ground at that level, as the screen shows it (GDD v1.34). */
  groundSize: number;
  /** Upkeep a quarter once it opens, on top of today's. */
  upkeep: number;
  modernizes: boolean;
}

export type VenueBlocker = "window" | "league" | "top" | "building" | "cash";

const seatIndex = (state: Pick<GameState, "flagship">, world: World) =>
  world.countries.findIndex((country) => country.id === state.flagship.countryId);

/** What building the seat's next venue level would take, or null with no league or at the top. */
export function venueTerms(state: GameState, world: World): VenueTerms | null {
  const index = seatIndex(state, world);
  const league = state.countries[index]?.league;
  if (!league) return null;
  const settings = world.config.leagues.venue;
  const level = league.venue.level + 1;
  const priceQuarters = settings.priceQuarters[level - 2];
  const seasons = settings.buildSeasons[level - 2];
  if (priceQuarters === undefined || seasons === undefined) return null;
  const basis = venueCostBasis(world, index, league.tier, level, state.growthNodes);
  return {
    level,
    price: priceQuarters * basis,
    seasons,
    opensSeason: state.flagship.season + seasons,
    capacity: venueCapacity(world, index, level),
    groundSize: groundSize(world, level),
    upkeep: settings.upkeepShare * basis,
    modernizes: level >= settings.modernize.fromLevel,
  };
}

/** Why the seat's league cannot start building its next venue level now, or null. */
export function venueBlocker(state: GameState, world: World): VenueBlocker | null {
  if (!offseasonOpen(state)) return "window";
  const league = state.countries[seatIndex(state, world)]?.league;
  if (!league) return "league";
  if (league.venue.building) return "building";
  const terms = venueTerms(state, world);
  if (!terms) return "top";
  return league.cash < terms.price ? "cash" : null;
}

/** Pays for the seat's next venue level and starts building it (legality checked by the caller). */
export function buildVenue(state: GameState, world: World): GameState {
  const index = seatIndex(state, world);
  const terms = venueTerms(state, world);
  const country = state.countries[index];
  const league = country?.league;
  if (!terms || !country || !league) throw new Error("unreachable: building was checked");
  const countries = [...state.countries];
  countries[index] = {
    ...country,
    league: {
      ...league,
      cash: league.cash - terms.price,
      venue: { ...league.venue, building: { level: terms.level, opensSeason: terms.opensSeason } },
    },
  };
  return { ...state, countries };
}

/**
 * Opens every venue level due by the flagship's current season (run as the offseason closes).
 * Modernizing levels betray the famous grounds in their country.
 */
export function openVenues(state: GameState, world: World): GameState {
  let next = state;
  const found: Landmark[] = [];
  state.countries.forEach((country, index) => {
    const building = country.league?.venue.building;
    if (!building || building.opensSeason > state.flagship.season) return;
    const current = next.countries[index];
    const league = current?.league;
    if (!current || !league) return;
    const countries = [...next.countries];
    countries[index] = {
      ...current,
      league: { ...league, venue: { ...league.venue, level: building.level, building: null } },
    };
    next = { ...next, countries };
    const modernized = building.level >= world.config.leagues.venue.modernize.fromLevel;
    if (modernized) next = modernizeGrounds(next, world, index);
    found.push(
      landmarks.venueOpened(
        state.turn,
        state.quarter,
        country.countryId,
        building.level,
        modernized,
      ),
    );
  });
  return found.length > 0 ? { ...next, landmarks: [...next.landmarks, ...found] } : next;
}
