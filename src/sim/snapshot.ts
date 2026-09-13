import { seasonalWindowOpen, turnLengthQuarters, yearOfQuarter } from "./calendar";
import { mediaRevenueFactor } from "./countermoves";
import { fandomScore, type SportTotals, sportTotals } from "./fandom";
import { leverMultipliers, similarityEffect } from "./genome";
import { revenuePerQuarter, runningCostPerQuarter } from "./leagues";
import { computeExposure } from "./spread";
import { tierStatus } from "./tiers";
import {
  type EscalationLevel,
  type GameOutcome,
  type GameState,
  type Genome,
  type HealthLevel,
  type LeagueTierId,
  type PendingTierUp,
  PLAYER_INDEX,
  type TimedCountermoveKind,
  type World,
} from "./types";

const QUARTERS_PER_YEAR = 4;

export interface LeagueSnapshot {
  tier: LeagueTierId;
  health: HealthLevel;
  cash: number;
  revenuePerQuarter: number;
  runningCostPerQuarter: number;
  lastFlowPerQuarter: number | null;
}

/** One country as the UI sees it: the player's standing there and why it is moving. */
export interface CountrySnapshot {
  countryId: string;
  population: number;
  casual: number;
  hardcore: number;
  fandomScore: number;
  /** Fandom Score ÷ population. */
  share: number;
  focused: boolean;
  exposure: number;
  affinity: number;
  accessibility: number;
  depth: number;
  /** Similarity to the country's dominant rival, 0–1. */
  rivalSimilarity: number;
  league: LeagueSnapshot | null;
  /** Each rival's escalation here and its countermoves in effect. Budgets stay hidden. */
  rivals: RivalDefenseSnapshot[];
}

/** What the map shows of one rival in one country (GDD Rival AI: budgets are hidden). */
export interface RivalDefenseSnapshot {
  sportId: string;
  level: EscalationLevel;
  countermoves: TimedCountermoveKind[];
}

export interface TierTrackSnapshot {
  peakTier: number;
  /** An announced tier-up ("Approaching National Pastime"). */
  pendingTierUp: PendingTierUp | null;
  /** Turns at risk so far, and turns left before demotion; null when not at risk. */
  atRisk: { turnsBelowLine: number; turnsUntilDemotion: number } | null;
  slotsToDrop: number;
  next: { tier: number; scoreProgress: number; breadthProgress: number } | null;
}

/** What the UI shows after a turn. Plain data, cheap to send across the worker boundary. */
export interface TurnSnapshot {
  seed: number;
  anchorCountryId: string;
  genome: Genome;
  turn: number;
  quarter: number;
  year: number;
  quarterOfYear: number;
  ppTier: number;
  turnLengthQuarters: number;
  pp: number;
  seasonalWindowOpen: boolean;
  tierTrack: TierTrackSnapshot;
  focus: (string | null)[];
  outcome: GameOutcome | null;
  sports: SportTotals[];
  /** Same order as content. */
  countries: CountrySnapshot[];
  landmarkCount: number;
}

export function snapshot(state: GameState, world: World): TurnSnapshot {
  const exposure = computeExposure(state, world);
  const { casualWeight } = world.config.fandomScore;
  const countries = state.countries.map((countryState, index): CountrySnapshot => {
    const country = world.countries[index];
    const fans = countryState.fans[PLAYER_INDEX];
    if (!country || !fans) throw new Error(`Country #${index} is missing from content or state`);
    const levers = leverMultipliers(world, state.genome, index);
    const score = fandomScore(fans.casual, fans.hardcore, casualWeight);
    const league = countryState.league;
    return {
      countryId: country.id,
      population: country.population,
      casual: fans.casual,
      hardcore: fans.hardcore,
      fandomScore: score,
      share: score / country.population,
      focused: exposure[index]?.focused ?? false,
      exposure: exposure[index]?.total ?? 0,
      affinity: levers.affinity,
      accessibility: levers.accessibility,
      depth: levers.depth,
      rivalSimilarity: similarityEffect(
        world,
        state.genome,
        countryState,
        state.sports,
        country.population,
        state.rivals,
      ).similarity,
      league: league
        ? {
            tier: league.tier,
            health: league.health,
            cash: league.cash,
            revenuePerQuarter: revenuePerQuarter(
              world,
              index,
              league.tier,
              fans,
              state.ppTier,
              mediaRevenueFactor(countryState, world.config),
            ).total,
            runningCostPerQuarter: runningCostPerQuarter(world, index, league.tier),
            lastFlowPerQuarter: league.lastFlowPerQuarter,
          }
        : null,
      rivals: countryState.defense.map((front) => ({
        sportId: front.sportId,
        level: front.level,
        countermoves: countryState.countermoves
          .filter((move) => move.sportId === front.sportId)
          .map((move) => move.kind),
      })),
    };
  });
  const track = state.tierTrack;
  const { demotionTurns } = world.config.tierTrack;
  return {
    seed: state.seed,
    anchorCountryId: state.anchorCountryId,
    genome: state.genome,
    turn: state.turn,
    quarter: state.quarter,
    year: yearOfQuarter(state.quarter, world.config),
    quarterOfYear: (state.quarter % QUARTERS_PER_YEAR) + 1,
    ppTier: state.ppTier,
    turnLengthQuarters: turnLengthQuarters(state.ppTier, world.config),
    pp: state.pp,
    seasonalWindowOpen: seasonalWindowOpen(state, world.config),
    tierTrack: {
      peakTier: track.peakTier,
      pendingTierUp: track.pendingTierUp,
      atRisk:
        track.turnsBelowLine > 0
          ? {
              turnsBelowLine: track.turnsBelowLine,
              turnsUntilDemotion: demotionTurns - track.turnsBelowLine,
            }
          : null,
      slotsToDrop: track.slotsToDrop,
      next: tierStatus(state, world).next,
    },
    focus: [...state.focus],
    outcome: state.outcome,
    sports: sportTotals(state, world),
    countries,
    landmarkCount: state.landmarks.length,
  };
}
