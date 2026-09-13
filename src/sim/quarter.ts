import { QUARTERS_PER_YEAR, yearOfQuarter } from "./calendar";
import { rivalConversionBoosts } from "./countermoves";
import { fandomScore } from "./fandom";
import { leverMultipliers, similarityEffect } from "./genome";
import { type GrowthFactors, growthFactors } from "./growth";
import { stepLeagueQuarter } from "./leagues";
import { poachableHardcore, poachingRates } from "./poaching";
import { yearlySnapshot } from "./records";
import { stepRivals } from "./rivals";
import { nextFloat, type Rng, restoreRng, saveRng } from "./rng";
import { type CountryExposure, computeExposure } from "./spread";
import {
  type Config,
  type CountryState,
  type GameState,
  type Landmark,
  PLAYER_INDEX,
  type SportState,
  type World,
} from "./types";

// Quarterly simulation (GDD Fan Model, Sport Genome, Spread Model, Rival AI, Business Layer). Every
// rate is config.
//
// Player's sport, per country, per quarter:
//   uninterested → casual   uninterested × casualConversionRate × accessibility × affinity
//                           × familiarity (rival similarity) × exposure × focus conversion bonus
//   casual → uninterested   casual × (casualChurnRate + casualDecayRate × (1 − exposure level))
//   casual → hardcore       casual × hardcoreConversionRate × depth × affinity × crowding (rival
//                           similarity) × share of people with no hardcore sport × focus bonus
// Exposure comes from src/sim/spread.ts: local word of mouth, inbound spread over the proximity,
// language and media channels (only casual exposure crosses borders), and focus outreach.
// Growth tree nodes (src/sim/growth.ts) multiply the player's casual conversion, churn and decay,
// and hardcore conversion in each country, and shrink rival countermove boosts there.
// Rivals: slow local drift with no spread and no affinity, boosted where that rival's media blitz
// or youth programs are in effect (src/sim/countermoves.ts). "Other" never converts anyone.
// Hardcore poaching (src/sim/poaching.ts): every sport's hardcore fans demote to casual about the
// same sport at a rate set by the sports pulling on them.
// Generational turnover (GDD Late-Game Pressure): every sport's hardcore fans above a floor age out
// at a small annual rate and demote to casual about the same sport. Hardcore fans never go straight
// to uninterested; the only other hardcore loss is the league causes at the end of a turn.
// Hardcore is exclusive: if the sports together would convert more people than have no hardcore
// sport, the conversions are scaled down to fit.
//
// After fans move, league business runs (src/sim/leagues.ts): leagues form at the hardcore
// threshold, and existing leagues earn revenue and pay running costs. Cash never feeds PP.
// Then the rival AI runs (src/sim/rivals.ts): budgets, escalation and countermoves.
// PP income per quarter: scale × (player Fandom Score ^ exponent) × the growth tree's PP income
// factor, averaged over countries weighted by the player's Fandom Score in each.
// At the end of each in-game year the yearly world snapshot is recorded.

/** Advances the simulation by one in-game quarter. Pure: returns a new state. */
export function stepQuarter(state: GameState, world: World): GameState {
  const { config } = world;
  const rng = restoreRng(state.rng);
  const exposure = computeExposure(state, world);
  const growth = growthFactors(world, state.growthNodes);
  const quarter = state.quarter + 1;
  const found: Landmark[] = [];

  const afterBusiness = state.countries.map((countryState, index) => {
    const country = world.countries[index];
    const countryExposure = exposure[index];
    const factors = growth[index];
    if (!country || country.id !== countryState.countryId || !countryExposure || !factors) {
      throw new Error(
        `Game state and content disagree at country #${index} ("${countryState.countryId}")`,
      );
    }
    const levers = leverMultipliers(world, state.genome, index);
    const rivalry = similarityEffect(
      world,
      state.genome,
      countryState,
      state.sports,
      country.population,
      state.rivals,
    );
    const playerRates: PlayerRates = {
      casualConversion:
        config.dynamics.player.casualConversionRate *
        levers.accessibility *
        levers.affinity *
        rivalry.casualFactor *
        countryExposure.total *
        (countryExposure.focused ? config.focus.conversionMultiplier : 1) *
        factors.casualConversion,
      casualChurn:
        (config.dynamics.player.casualChurnRate +
          config.dynamics.player.casualDecayRate *
            (1 - Math.min(1, countryExposure.total / config.exposure.retentionSaturation))) *
        factors.churn,
      hardcoreConversion:
        config.dynamics.player.hardcoreConversionRate *
        levers.depth *
        levers.affinity *
        rivalry.hardcoreFactor *
        (countryExposure.focused ? config.focus.conversionMultiplier : 1) *
        factors.hardcoreConversion,
    };
    const moved = stepCountryFans(
      countryState,
      country.population,
      state.sports,
      playerRates,
      factors,
      config,
      rng,
    );
    const business = stepLeagueQuarter(moved, index, world, state, quarter);
    if (business.landmark) found.push(business.landmark);
    return business.country;
  });

  const defended = stepRivals(state, afterBusiness, quarter, world);
  found.push(...defended.landmarks);
  const countries = defended.countries;
  const ppIncome = quarterPpIncome(countries, growth, config);
  const yearEnded = quarter % QUARTERS_PER_YEAR === 0;

  return {
    ...state,
    rng: saveRng(rng),
    quarter,
    pp: state.pp + ppIncome,
    rivals: defended.rivals,
    countries,
    landmarks: found.length > 0 ? [...state.landmarks, ...found] : state.landmarks,
    yearly: yearEnded
      ? [...state.yearly, yearlySnapshot({ countries }, yearOfQuarter(quarter - 1, config))]
      : state.yearly,
  };
}

/**
 * PP income for a quarter: scale × score ^ exponent × the Fandom-Score-weighted mean of each
 * country's growth tree PP income factor (so an unconditional +8% node adds exactly 8%).
 */
export function quarterPpIncome(
  countries: readonly CountryState[],
  growth: readonly GrowthFactors[],
  config: Config,
): number {
  let score = 0;
  let weighted = 0;
  countries.forEach((country, index) => {
    const fans = country.fans[PLAYER_INDEX];
    if (!fans) return;
    const here = fandomScore(fans.casual, fans.hardcore, config.fandomScore.casualWeight);
    score += here;
    weighted += here * (growth[index]?.ppIncome ?? 1);
  });
  if (score <= 0) return 0;
  return config.ppIncome.scale * score ** config.ppIncome.exponent * (weighted / score);
}

/** Per-quarter turnover rate that compounds to the configured annual rate. */
export function quarterlyTurnoverRate(config: Config): number {
  return 1 - (1 - config.turnover.annualRate) ** (1 / QUARTERS_PER_YEAR);
}

/** The player's effective per-quarter rates in one country, after every multiplier. */
interface PlayerRates {
  casualConversion: number;
  casualChurn: number;
  hardcoreConversion: number;
}

interface Flows {
  casualGain: number;
  casualChurn: number;
  hardcoreGain: number;
  /** Hardcore fans poached or aged out this quarter: they demote to casual about the same sport. */
  hardcoreLoss: number;
}

function stepCountryFans(
  countryState: CountryState,
  population: number,
  sports: readonly SportState[],
  playerRates: PlayerRates,
  factors: GrowthFactors,
  config: Config,
  rng: Rng,
): CountryState {
  const { noise } = config.dynamics;
  const totalHardcore = countryState.fans.reduce((sum, fans) => sum + fans.hardcore, 0);
  const unattached = population - totalHardcore;
  const unattachedShare = unattached / population;
  const poaching = poachingRates(countryState, sports, population, config);
  const turnoverRate = quarterlyTurnoverRate(config);
  const turnoverFloor = Math.ceil(config.turnover.floorShare * population);

  // All flows are computed from the start-of-quarter snapshot, so sport order does not matter.
  // Each sport kind draws the same rolls every quarter whatever the config, so the random
  // sequence stays aligned when rates change.
  const flows: Flows[] = countryState.fans.map((fans, index) => {
    const sport = sports[index];
    if (!sport || sport.id !== fans.sportId) {
      throw new Error(`Sport order mismatch in "${countryState.countryId}" at #${index}`);
    }
    const uninterested = population - fans.casual - fans.hardcore;
    const poached = drawFlow(
      rng,
      poachableHardcore(fans.hardcore, population, config),
      poaching[index] ?? 0,
      noise,
    );
    const agedOut = drawFlow(
      rng,
      Math.max(0, fans.hardcore - poached - turnoverFloor),
      turnoverRate,
      noise,
    );
    const hardcoreLoss = poached + agedOut;
    if (sport.kind === "player") {
      const casualGain = drawFlow(rng, uninterested, playerRates.casualConversion, noise);
      const casualChurn = drawFlow(rng, fans.casual, playerRates.casualChurn, noise);
      const hardcoreGain = drawFlow(
        rng,
        fans.casual - casualChurn,
        playerRates.hardcoreConversion * unattachedShare,
        noise,
      );
      return { casualGain, casualChurn, hardcoreGain, hardcoreLoss };
    }
    if (sport.kind === "rival") {
      const rates = config.dynamics.rival;
      const boosts = rivalConversionBoosts(
        countryState,
        sport.id,
        config,
        factors.countermoveEffect,
      );
      const reach = (fans.casual + fans.hardcore) / population;
      const casualGain = drawFlow(
        rng,
        uninterested,
        rates.casualConversionRate * reach * boosts.casual,
        noise,
      );
      const casualChurn = drawFlow(rng, fans.casual, rates.casualChurnRate, noise);
      const hardcoreGain = drawFlow(
        rng,
        fans.casual - casualChurn,
        rates.hardcoreConversionRate * unattachedShare * boosts.hardcore,
        noise,
      );
      return { casualGain, casualChurn, hardcoreGain, hardcoreLoss };
    }
    return { casualGain: 0, casualChurn: 0, hardcoreGain: 0, hardcoreLoss };
  });

  const requested = flows.reduce((sum, flow) => sum + flow.hardcoreGain, 0);
  const scale = requested > unattached ? unattached / requested : 1;
  let remaining = unattached;

  return {
    ...countryState,
    fans: countryState.fans.map((fans, index) => {
      const flow = flows[index];
      if (!flow) throw new Error(`No flows for sport #${index}`);
      const hardcoreGain = Math.min(remaining, Math.floor(flow.hardcoreGain * scale));
      remaining -= hardcoreGain;
      return {
        sportId: fans.sportId,
        casual: fans.casual + flow.casualGain - flow.casualChurn - hardcoreGain + flow.hardcoreLoss,
        hardcore: fans.hardcore + hardcoreGain - flow.hardcoreLoss,
      };
    }),
  };
}

/**
 * A whole number of people moving out of `pool`: pool × rate × random noise, rounded
 * stochastically so small flows still happen. Always consumes exactly two rolls, so the random
 * sequence stays aligned when config values change (comparisons across configs stay fair).
 */
function drawFlow(rng: Rng, pool: number, rate: number, noise: number): number {
  const multiplier = 1 + noise * (2 * nextFloat(rng) - 1);
  const roundingRoll = nextFloat(rng);
  if (pool <= 0 || rate <= 0) return 0;
  const expected = pool * rate * multiplier;
  const whole = Math.floor(expected);
  const flow = whole + (roundingRoll < expected - whole ? 1 : 0);
  return Math.min(pool, Math.max(0, flow));
}

export type { CountryExposure };
