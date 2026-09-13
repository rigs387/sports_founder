import { costMultiplier, tierEntry } from "./calendar";
import { mediaRevenueFactor } from "./countermoves";
import { growthFactorsAt } from "./growth";
import { landmarks } from "./records";
import {
  type Config,
  type CountryState,
  type GameOutcome,
  type GameState,
  HEALTH_LEVELS,
  type HealthLevel,
  type Landmark,
  LEAGUE_TIERS,
  type LeagueState,
  type LeagueTierId,
  PLAYER_INDEX,
  type SportFans,
  type World,
} from "./types";

// Abstract leagues (GDD League tiers, Business Layer Phase 0 subset, League Health Ladder).
// One top league per country. Cash is per country, accrues per quarter, and never produces PP.
// Health is evaluated once per turn and moves at most one rung; a league must spend a full turn
// at Near-Collapse before it can collapse. Every number is config. Growth tree nodes (`owned`) cut
// running costs and formation thresholds, and resist sponsor lockouts (src/sim/growth.ts).

export function leagueTierIndex(tier: LeagueTierId): number {
  return LEAGUE_TIERS.indexOf(tier);
}

function countryAt(world: World, countryIndex: number) {
  const country = world.countries[countryIndex];
  const derived = world.derived[countryIndex];
  if (!country || !derived) throw new Error(`No country #${countryIndex} in content`);
  return { country, derived };
}

/** Running cost per quarter of a league at `tier` in a country, with the growth nodes `owned`. */
export function runningCostPerQuarter(
  world: World,
  countryIndex: number,
  tier: LeagueTierId,
  owned: readonly string[],
): number {
  const { costs, tiers } = world.config.leagues;
  const { country, derived } = countryAt(world, countryIndex);
  const wealthFactor = costs.wealthFloor + (1 - costs.wealthFloor) * derived.wealth;
  const size = (country.population / costs.referencePopulation) ** costs.populationExponent;
  const factor = growthFactorsAt(world, owned, countryIndex).runningCost;
  const base = Math.max(tiers[tier].minRunningCost, tiers[tier].runningCost * wealthFactor * size);
  return base * factor;
}

export interface Revenue {
  gate: number;
  media: number;
  total: number;
}

/**
 * League revenue per quarter from the player's fans in that country. `mediaFactor` scales the
 * media and sponsor line (a rival's sponsor lockout; see mediaRevenueFactor).
 */
export function revenuePerQuarter(
  world: World,
  countryIndex: number,
  tier: LeagueTierId,
  fans: SportFans,
  ppTier: number,
  mediaFactor = 1,
): Revenue {
  const { revenue, tiers } = world.config.leagues;
  const { derived } = countryAt(world, countryIndex);
  const multiplier = tiers[tier].revenueMultiplier;
  const wealthFactor = revenue.wealthFloor + (1 - revenue.wealthFloor) * derived.wealth;
  const marketFactor =
    revenue.mediaMarketFloor + (1 - revenue.mediaMarketFloor) * derived.mediaMarket;
  const gate = fans.hardcore * revenue.gatePerHardcore * wealthFactor * multiplier;
  const media =
    fans.casual *
    revenue.mediaPerCasual *
    marketFactor *
    multiplier *
    tierEntry(ppTier, world.config).mediaRevenueMultiplier *
    mediaFactor;
  return { gate, media, total: gate + media };
}

/** Player hardcore fans needed for a league to form in a country, with the growth nodes `owned`. */
export function formationThreshold(
  world: World,
  countryIndex: number,
  owned: readonly string[],
): number {
  const { formation } = world.config.leagues;
  const { country } = countryAt(world, countryIndex);
  const base = Math.max(
    formation.minHardcore,
    Math.ceil(formation.hardcoreShare * country.population),
  );
  const factor = growthFactorsAt(world, owned, countryIndex).formationThreshold;
  return Math.max(1, Math.ceil(base * factor));
}

/** A newly formed Amateur league. */
export function newLeague(
  world: World,
  countryIndex: number,
  quarter: number,
  hardcore: number,
  owned: readonly string[],
): LeagueState {
  const cash =
    world.config.leagues.formation.startingCashQuarters *
    runningCostPerQuarter(world, countryIndex, "amateur", owned);
  return {
    tier: "amateur",
    health: "healthy",
    cash,
    lastFlowPerQuarter: null,
    hardcoreAtLastEval: hardcore,
    formedQuarter: quarter,
    bailoutReadyQuarter: quarter,
  };
}

/** Moves `share` of hardcore fans down to casual (GDD: hardcore loss is demotion). */
export function demoteHardcore(fans: SportFans, share: number): SportFans {
  const moved = Math.floor(fans.hardcore * share);
  if (moved <= 0) return fans;
  return { sportId: fans.sportId, casual: fans.casual + moved, hardcore: fans.hardcore - moved };
}

export interface PromotionTerms {
  to: LeagueTierId;
  hardcoreNeeded: number;
  reserveNeeded: number;
  cost: number;
}

/** What promoting a country's league one tier would require, or null at the top tier. */
export function promotionTerms(
  world: World,
  countryIndex: number,
  from: LeagueTierId,
  owned: readonly string[],
): PromotionTerms | null {
  const to = LEAGUE_TIERS[leagueTierIndex(from) + 1];
  if (to === undefined) return null;
  const promotion = world.config.leagues.tiers[to].promotion;
  if (!promotion) return null;
  const { country } = countryAt(world, countryIndex);
  const cost = runningCostPerQuarter(world, countryIndex, to, owned);
  return {
    to,
    hardcoreNeeded: Math.max(
      promotion.minHardcore,
      Math.ceil(promotion.hardcoreShare * country.population),
    ),
    reserveNeeded: promotion.reserveQuarters * cost,
    cost: promotion.costQuarters * cost,
  };
}

export interface BailoutTerms {
  ppCost: number;
  cash: number;
}

export function bailoutTerms(state: GameState, world: World, countryIndex: number): BailoutTerms {
  const league = state.countries[countryIndex]?.league;
  const { bailout } = world.config.leagues;
  return {
    ppCost: bailout.ppCost * costMultiplier(state, world.config),
    cash: league
      ? bailout.cashQuarters *
        runningCostPerQuarter(world, countryIndex, league.tier, state.growthNodes)
      : 0,
  };
}

// ---- Per-quarter league business ----------------------------------------------------------

export interface QuarterLeagueResult {
  country: CountryState;
  landmark: Landmark | null;
}

/**
 * One quarter of league business in a country, after its fans have moved: a league forms when
 * hardcore fans cross the threshold; an existing league earns revenue and pays running costs.
 */
export function stepLeagueQuarter(
  country: CountryState,
  countryIndex: number,
  world: World,
  state: Pick<GameState, "turn" | "ppTier" | "growthNodes">,
  quarter: number,
): QuarterLeagueResult {
  const fans = country.fans[PLAYER_INDEX];
  if (!fans) throw new Error(`No player fans in "${country.countryId}"`);

  if (country.league === null) {
    if (quarter < country.formationReadyQuarter) return { country, landmark: null };
    if (fans.hardcore < formationThreshold(world, countryIndex, state.growthNodes)) {
      return { country, landmark: null };
    }
    const league = newLeague(world, countryIndex, quarter, fans.hardcore, state.growthNodes);
    return {
      country: { ...country, league },
      landmark: landmarks.leagueFormed(
        state.turn,
        quarter,
        country.countryId,
        country.leaguesFolded > 0,
      ),
    };
  }

  const league = country.league;
  const income = revenuePerQuarter(
    world,
    countryIndex,
    league.tier,
    fans,
    state.ppTier,
    mediaRevenueFactor(
      country,
      world.config,
      growthFactorsAt(world, state.growthNodes, countryIndex).countermoveEffect,
    ),
  ).total;
  const cost = runningCostPerQuarter(world, countryIndex, league.tier, state.growthNodes);
  return {
    country: { ...country, league: { ...league, cash: league.cash + income - cost } },
    landmark: null,
  };
}

// ---- Per-turn health evaluation -----------------------------------------------------------

export interface HealthSignals {
  cash: number;
  /** Operating cash flow per quarter over this turn. */
  flowPerQuarter: number;
  /** Flow per quarter over the previous evaluated turn, or null. */
  previousFlowPerQuarter: number | null;
  /** Relative change in player hardcore per quarter since the last evaluation. */
  hardcoreRatePerQuarter: number;
}

/** Target severity: 0 Healthy, 1 Struggling, 2 Near-Collapse, 3 collapse. See config comments. */
export function targetSeverity(signals: HealthSignals, config: Config): number {
  const health = config.leagues.health;
  if (signals.cash < 0) return 3;
  let severity = 0;
  if (signals.flowPerQuarter < 0) {
    const runway = signals.cash / -signals.flowPerQuarter;
    if (runway < health.nearCollapseRunwayQuarters) severity = 2;
    else if (runway < health.strugglingRunwayQuarters) severity = 1;
    const previous = signals.previousFlowPerQuarter;
    if (previous !== null && signals.flowPerQuarter < previous) severity += 1;
  }
  if (signals.hardcoreRatePerQuarter < -health.hardcoreFallingRate) severity += 1;
  return Math.min(2, severity);
}

export type HealthStep =
  | { kind: "stay"; health: HealthLevel }
  | { kind: "worse"; health: Exclude<HealthLevel, "healthy"> }
  | { kind: "better"; health: HealthLevel }
  | { kind: "collapse" };

/**
 * One rung toward the target, never more. Collapse only from Near-Collapse held since the start
 * of the turn, so the player always had a full turn of warning.
 */
export function stepHealth(startOfTurn: HealthLevel, severity: number): HealthStep {
  const current = HEALTH_LEVELS.indexOf(startOfTurn);
  if (severity > current) {
    const worse = HEALTH_LEVELS[current + 1];
    if (worse === undefined) return { kind: "collapse" };
    return { kind: "worse", health: worse as Exclude<HealthLevel, "healthy"> };
  }
  if (severity < current) {
    const better = HEALTH_LEVELS[current - 1];
    if (better !== undefined) return { kind: "better", health: better };
  }
  return { kind: "stay", health: startOfTurn };
}

export interface LeagueEvaluation {
  countries: CountryState[];
  landmarks: Landmark[];
  outcome: GameOutcome | null;
}

/**
 * End-of-turn health evaluation for every league that existed for the whole turn. `start` is the
 * state after the player's actions, before the turn's quarters; `end` is after them.
 */
export function evaluateLeagues(
  start: GameState,
  end: GameState,
  world: World,
  quarters: number,
): LeagueEvaluation {
  const { health: healthConfig, formation } = world.config.leagues;
  const found: Landmark[] = [];
  let outcome: GameOutcome | null = null;

  const countries = end.countries.map((country, index): CountryState => {
    const league = country.league;
    const prior = start.countries[index]?.league ?? null;
    if (league === null || prior === null || prior.formedQuarter !== league.formedQuarter) {
      return country;
    }
    const fans = country.fans[PLAYER_INDEX];
    if (!fans) throw new Error(`No player fans in "${country.countryId}"`);

    const flowPerQuarter = (league.cash - prior.cash) / quarters;
    const base = Math.max(1, league.hardcoreAtLastEval);
    const signals: HealthSignals = {
      cash: league.cash,
      flowPerQuarter,
      previousFlowPerQuarter: prior.lastFlowPerQuarter,
      hardcoreRatePerQuarter: (fans.hardcore - league.hardcoreAtLastEval) / base / quarters,
    };
    const step = stepHealth(prior.health, targetSeverity(signals, world.config));
    const evaluated: LeagueState = {
      ...league,
      lastFlowPerQuarter: flowPerQuarter,
      hardcoreAtLastEval: fans.hardcore,
    };
    const withFans = (share: number) =>
      country.fans.map((sport, sportIndex) =>
        sportIndex === PLAYER_INDEX ? demoteHardcore(sport, share) : sport,
      );

    if (step.kind === "collapse") {
      const isAnchor = country.countryId === start.anchorCountryId;
      if (isAnchor) {
        outcome = {
          kind: "anchorCollapse",
          turn: start.turn,
          quarter: end.quarter,
          countryId: country.countryId,
        };
        found.push(
          landmarks.anchorCollapse(start.turn, end.quarter, country.countryId, league.tier),
        );
      } else {
        found.push(landmarks.leagueFolded(start.turn, end.quarter, country.countryId, league.tier));
      }
      return {
        countryId: country.countryId,
        fans: withFans(healthConfig.demotionShare.collapsed),
        league: null,
        leaguesFolded: country.leaguesFolded + 1,
        formationReadyQuarter: end.quarter + formation.reformCooldownQuarters,
        defense: country.defense,
        countermoves: country.countermoves,
      };
    }

    if (step.kind === "worse") {
      return {
        ...country,
        fans: withFans(healthConfig.demotionShare[step.health]),
        league: { ...evaluated, health: step.health },
      };
    }
    return { ...country, league: { ...evaluated, health: step.health } };
  });

  return { countries, landmarks: found, outcome };
}
