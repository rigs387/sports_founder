import type { Genome } from "../content";

export type {
  AxisId,
  Climate,
  Config,
  Continent,
  Country,
  CountryDerived,
  Genome,
  Names,
  PpTier,
  RivalSport,
  SpreadLink,
  World,
} from "../content";
export { OTHER_SPORT_ID, PLAYER_SPORT_ID } from "../content";

/** "other" is the passive bucket of every unmodeled sport's hardcore fans (GDD Rival AI). */
export type SportKind = "player" | "rival" | "other";

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
  /** The player's sport genome (GDD Sport Genome). Identity axes never change. */
  genome: Genome;
  /** The turn the player is on. Starts at 1. */
  turn: number;
  /** Quarters simulated since the campaign began. */
  quarter: number;
  pp: number;
  ppTier: number;
  /** Focus slots: the country each slot is on, or null if unassigned. Length = the tier's slots. */
  focus: (string | null)[];
  /** The player's sport first, then rivals in content order, then the "other" bucket. */
  sports: SportState[];
  /** Same order as World.countries. */
  countries: CountryState[];
}

export interface CampaignSetup {
  seed: number;
  anchorCountryId: string;
  genome: Genome;
}

/** Index of the player's sport in GameState.sports and CountryState.fans. */
export const PLAYER_INDEX = 0;
