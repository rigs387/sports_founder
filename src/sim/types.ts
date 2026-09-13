import type { Genome, HealthLevel, LeagueTierId } from "../content";

export type {
  AxisId,
  BreadthCondition,
  Climate,
  Config,
  Continent,
  Country,
  CountryDerived,
  Genome,
  HealthLevel,
  LeagueTierId,
  Names,
  PpTier,
  RivalSport,
  SpreadLink,
  World,
} from "../content";
export { HEALTH_LEVELS, LEAGUE_TIERS, OTHER_SPORT_ID, PLAYER_SPORT_ID } from "../content";

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

/** A country's single top league (GDD League tiers). Abstract: numbers only, no players. */
export interface LeagueState {
  tier: LeagueTierId;
  health: HealthLevel;
  /** League cash. May go below zero, which is what collapse means. */
  cash: number;
  /** Operating cash flow per quarter over the last evaluated turn; null before the first. */
  lastFlowPerQuarter: number | null;
  /** Player hardcore fans in the country at the last health evaluation (before demotions). */
  hardcoreAtLastEval: number;
  formedQuarter: number;
  /** Earliest quarter a PP bailout is legal again. */
  bailoutReadyQuarter: number;
}

export interface CountryState {
  countryId: string;
  /** Same order as GameState.sports. */
  fans: SportFans[];
  league: LeagueState | null;
  /** How many leagues have folded here. */
  leaguesFolded: number;
  /** Earliest quarter a league may form (after a fold). */
  formationReadyQuarter: number;
}

export interface PendingTierUp {
  tier: number;
  /** Turns until the tier-up happens. */
  turnsLeft: number;
}

export interface TierTrack {
  /** Highest PP tier ever reached. PP cost multipliers stay at its level. */
  peakTier: number;
  /** Turn of the last tier change, or null if none yet. */
  lastChangeTurn: number | null;
  /** An announced tier-up. It happens when turnsLeft runs out, whatever the player does. */
  pendingTierUp: PendingTierUp | null;
  /** Consecutive turns at risk of demotion. */
  turnsBelowLine: number;
  /** Focus slots the player must drop after a demotion. */
  slotsToDrop: number;
}

/** A permanent history fact (GDD History & Records). Plain data: no text. */
export type Landmark =
  | { kind: "leagueFormed"; turn: number; quarter: number; countryId: string; reformed: boolean }
  | {
      kind: "leaguePromoted" | "leagueSteppedDown";
      turn: number;
      quarter: number;
      countryId: string;
      from: LeagueTierId;
      to: LeagueTierId;
    }
  | {
      kind: "leagueFolded" | "anchorCollapse";
      turn: number;
      quarter: number;
      countryId: string;
      leagueTier: LeagueTierId;
    }
  | { kind: "ppTierUp" | "ppTierDown"; turn: number; quarter: number; from: number; to: number };

export interface YearlySnapshot {
  year: number;
  /** Per country (content order), per sport (state order): casual, then hardcore. */
  fans: number[];
}

/** How a campaign ended. Only anchor collapse exists before the win arrives. */
export interface GameOutcome {
  kind: "anchorCollapse";
  turn: number;
  quarter: number;
  countryId: string;
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
  tierTrack: TierTrack;
  /** Focus slots: the country each slot is on, or null if empty. */
  focus: (string | null)[];
  /** Set once the campaign has ended; nothing may be played after that. */
  outcome: GameOutcome | null;
  /** The player's sport first, then rivals in content order, then the "other" bucket. */
  sports: SportState[];
  /** Same order as World.countries. */
  countries: CountryState[];
  landmarks: Landmark[];
  yearly: YearlySnapshot[];
}

export interface CampaignSetup {
  seed: number;
  anchorCountryId: string;
  genome: Genome;
}

/** Index of the player's sport in GameState.sports and CountryState.fans. */
export const PLAYER_INDEX = 0;
