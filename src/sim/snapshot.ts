import { focusCostFromExposure } from "./actions";
import { seasonalWindowOpen, turnLengthQuarters, yearOfQuarter } from "./calendar";
import { mediaRevenueFactor } from "./countermoves";
import { fandomScore, type SportTotals, sportTotals } from "./fandom";
import { leverMultipliers, similarityEffect } from "./genome";
import { growthFactorsAt, type NodeBlocker, nodeBlocker, nodeCost } from "./growth";
import { revenuePerQuarter, runningCostPerQuarter } from "./leagues";
import { computeExposure } from "./spread";
import { tierStatus } from "./tiers";
import {
  type EscalationLevel,
  type GameOutcome,
  type GameState,
  type Genome,
  type GrowthCategory,
  type HealthLevel,
  type LeagueTierId,
  type PendingTierUp,
  PLAYER_INDEX,
  type TimedCountermoveKind,
  type World,
} from "./types";
import { countsTowardHold, standing } from "./win";

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
  /** Current PP price of assigning a slot here, computed from organic exposure. */
  focusCost: number;
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

/** The race for #1 (GDD Win condition). */
export interface WinSnapshot {
  /** The player's rank by global Fandom Score among modeled sports, 1 = first. */
  rank: number;
  /** The rival with the highest Fandom Score. */
  leadingRivalId: string | null;
  /** Consecutive turns ended at #1 at the required PP tier so far: the win hold. */
  turnsHeld: number;
  /** Turns the hold must last to win, and the PP tier it must be held at. */
  holdTurns: number;
  requiredTier: number;
  /** Whether this turn's standing counts toward the hold (#1 at the required tier). */
  holding: boolean;
  /** When the win landed, or null before it. Stays set if #1 is lost later. */
  won: { turn: number; quarter: number } | null;
}

/** One growth tree node as the UI sees it (GDD PP Growth Tree). No text: the UI names it. */
export interface GrowthNodeSnapshot {
  nodeId: string;
  category: GrowthCategory;
  /** owned; available (every rule met, whether or not the PP is there); locked. */
  status: "owned" | "available" | "locked";
  /** Price right now: base cost × the PP cost multiplier. */
  cost: number;
  affordable: boolean;
  /** Why it cannot be bought (null when available or owned). */
  lock: Exclude<NodeBlocker, { kind: "owned" }> | null;
  requires: string[];
  /** Fork siblings this node would lock out, or that lock it out. */
  forkSiblings: string[];
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
  win: WinSnapshot;
  outcome: GameOutcome | null;
  sports: SportTotals[];
  /** Same order as content. */
  countries: CountrySnapshot[];
  /** Every growth tree node in content order, with its status and current price. */
  growthNodes: GrowthNodeSnapshot[];
  landmarkCount: number;
}

export function growthNodeSnapshots(state: GameState, world: World): GrowthNodeSnapshot[] {
  return world.growthTree.nodes.map((node): GrowthNodeSnapshot => {
    const blocker = nodeBlocker(state, world, node.id);
    const cost = nodeCost(state, world, node.id);
    const fork = world.growthTree.forks.find((candidate) => candidate.nodes.includes(node.id));
    return {
      nodeId: node.id,
      category: node.category,
      status: blocker === null ? "available" : blocker.kind === "owned" ? "owned" : "locked",
      cost,
      affordable: state.pp >= cost,
      lock: blocker === null || blocker.kind === "owned" ? null : blocker,
      requires: [...node.requires],
      forkSiblings: fork ? fork.nodes.filter((id) => id !== node.id) : [],
    };
  });
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
      focusCost: focusCostFromExposure(exposure[index]?.organic ?? 0, state, world, index),
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
              mediaRevenueFactor(
                countryState,
                world.config,
                growthFactorsAt(world, state.growthNodes, index).countermoveEffect,
              ),
            ).total,
            runningCostPerQuarter: runningCostPerQuarter(
              world,
              index,
              league.tier,
              state.growthNodes,
            ),
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
    win: (() => {
      const { rank, leadingRivalId } = standing(state, world);
      return {
        rank,
        leadingRivalId,
        turnsHeld: state.win.turnsHeld,
        holdTurns: world.config.win.holdTurns,
        requiredTier: world.config.win.requiredTier,
        holding: countsTowardHold(rank, state.ppTier, world),
        won: state.win.won,
      };
    })(),
    outcome: state.outcome,
    sports: sportTotals(state, world),
    countries,
    growthNodes: growthNodeSnapshots(state, world),
    landmarkCount: state.landmarks.length,
  };
}
