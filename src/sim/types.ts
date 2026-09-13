export type {
  Climate,
  Config,
  Country,
  CountryAttributes,
  Names,
  RivalSport,
  World,
} from "../content";
export { PLAYER_SPORT_ID } from "../content";

export type SportKind = "player" | "rival";

export interface SportState {
  id: string;
  kind: SportKind;
}

/**
 * One sport's fans in one country (GDD Fan Model). Every person is in exactly one bucket per
 * sport: uninterested = population - casual - hardcore, derived rather than stored so it can
 * never disagree. Casual is non-exclusive across sports; hardcore is exclusive, so the sum of
 * hardcore across all sports in a country never exceeds its population.
 */
export interface SportFans {
  sportId: string;
  casual: number;
  hardcore: number;
}

export interface CountryState {
  countryId: string;
  /** Same order as GameState.sports. */
  fans: SportFans[];
}

/** The complete, serializable state of a campaign. Plain data only. */
export interface GameState {
  seed: number;
  /** Seeded generator state; part of the save so a resumed game rolls identically. */
  rng: number[];
  anchorCountryId: string;
  /** The turn the player is on. Starts at 1. */
  turn: number;
  /** Quarters simulated since the campaign began. */
  quarter: number;
  pp: number;
  ppTier: number;
  /** The player's sport first, then rivals in content order. */
  sports: SportState[];
  /** Same order as World.countries. */
  countries: CountryState[];
}

export interface CampaignSetup {
  seed: number;
  anchorCountryId: string;
}
