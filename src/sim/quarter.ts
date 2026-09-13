import { QUARTERS_PER_YEAR, yearOfQuarter } from "./calendar";
import { playerFandomScore } from "./fandom";
import { leverMultipliers, similarityEffect } from "./genome";
import { stepLeagueQuarter } from "./leagues";
import { yearlySnapshot } from "./records";
import { nextFloat, type Rng, restoreRng, saveRng } from "./rng";
import { type CountryExposure, computeExposure } from "./spread";
import type { Config, CountryState, GameState, Landmark, SportState, World } from "./types";

// Quarterly simulation (GDD Fan Model, Sport Genome, Spread Model, Business Layer). Every rate is
// config.
//
// Player's sport, per country, per quarter:
//   uninterested → casual   uninterested × casualConversionRate × accessibility × affinity
//                           × familiarity (rival similarity) × exposure × focus conversion bonus
//   casual → uninterested   casual × (casualChurnRate + casualDecayRate × (1 − exposure level))
//   casual → hardcore       casual × hardcoreConversionRate × depth × affinity × crowding (rival
//                           similarity) × share of people with no hardcore sport × focus bonus
// Exposure comes from src/sim/spread.ts: local word of mouth, inbound spread over the proximity,
// language and media channels (only casual exposure crosses borders), and focus outreach.
// Hardcore is exclusive: if the sports together would convert more people than have no hardcore
// sport, the conversions are scaled down to fit. Hardcore loss happens only through league
// causes (src/sim/leagues.ts), at the end of a turn.
//
// After fans move, league business runs (src/sim/leagues.ts): leagues form at the hardcore
// threshold, and existing leagues earn revenue and pay running costs. Cash never feeds PP.
// Rivals (PLACEHOLDER until the rival AI): slow local drift, no spread. "Other" never moves.
// PP income per quarter: scale × (player Fandom Score ^ exponent).
// At the end of each in-game year the yearly world snapshot is recorded.

/** Advances the simulation by one in-game quarter. Pure: returns a new state. */
export function stepQuarter(state: GameState, world: World): GameState {
  const { config } = world;
  const rng = restoreRng(state.rng);
  const exposure = computeExposure(state, world);
  const quarter = state.quarter + 1;
  const found: Landmark[] = [];

  const countries = state.countries.map((countryState, index) => {
    const country = world.countries[index];
    const countryExposure = exposure[index];
    if (!country || country.id !== countryState.countryId || !countryExposure) {
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
    );
    const playerRates: PlayerRates = {
      casualConversion:
        config.dynamics.player.casualConversionRate *
        levers.accessibility *
        levers.affinity *
        rivalry.casualFactor *
        countryExposure.total *
        (countryExposure.focused ? config.focus.conversionMultiplier : 1),
      casualChurn:
        config.dynamics.player.casualChurnRate +
        config.dynamics.player.casualDecayRate *
          (1 - Math.min(1, countryExposure.total / config.exposure.retentionSaturation)),
      hardcoreConversion:
        config.dynamics.player.hardcoreConversionRate *
        levers.depth *
        levers.affinity *
        rivalry.hardcoreFactor *
        (countryExposure.focused ? config.focus.conversionMultiplier : 1),
    };
    const moved = stepCountryFans(
      countryState,
      country.population,
      state.sports,
      playerRates,
      config,
      rng,
    );
    const business = stepLeagueQuarter(moved, index, world, state, quarter);
    if (business.landmark) found.push(business.landmark);
    return business.country;
  });

  const score = playerFandomScore(state.sports, countries, config.fandomScore.casualWeight);
  const ppIncome = config.ppIncome.scale * score ** config.ppIncome.exponent;
  const yearEnded = quarter % QUARTERS_PER_YEAR === 0;

  return {
    ...state,
    rng: saveRng(rng),
    quarter,
    pp: state.pp + ppIncome,
    countries,
    landmarks: found.length > 0 ? [...state.landmarks, ...found] : state.landmarks,
    yearly: yearEnded
      ? [...state.yearly, yearlySnapshot({ countries }, yearOfQuarter(quarter - 1, config))]
      : state.yearly,
  };
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
}

const NO_FLOWS: Flows = { casualGain: 0, casualChurn: 0, hardcoreGain: 0 };

function stepCountryFans(
  countryState: CountryState,
  population: number,
  sports: readonly SportState[],
  playerRates: PlayerRates,
  config: Config,
  rng: Rng,
): CountryState {
  const { noise } = config.dynamics;
  const totalHardcore = countryState.fans.reduce((sum, fans) => sum + fans.hardcore, 0);
  const unattached = population - totalHardcore;
  const unattachedShare = unattached / population;

  // All flows are computed from the start-of-quarter snapshot, so sport order does not matter.
  const flows: Flows[] = countryState.fans.map((fans, index) => {
    const sport = sports[index];
    if (!sport || sport.id !== fans.sportId) {
      throw new Error(`Sport order mismatch in "${countryState.countryId}" at #${index}`);
    }
    const uninterested = population - fans.casual - fans.hardcore;
    if (sport.kind === "player") {
      const casualGain = drawFlow(rng, uninterested, playerRates.casualConversion, noise);
      const casualChurn = drawFlow(rng, fans.casual, playerRates.casualChurn, noise);
      const hardcoreGain = drawFlow(
        rng,
        fans.casual - casualChurn,
        playerRates.hardcoreConversion * unattachedShare,
        noise,
      );
      return { casualGain, casualChurn, hardcoreGain };
    }
    if (sport.kind === "rival") {
      const rates = config.dynamics.rival;
      const reach = (fans.casual + fans.hardcore) / population;
      const casualGain = drawFlow(rng, uninterested, rates.casualConversionRate * reach, noise);
      const casualChurn = drawFlow(rng, fans.casual, rates.casualChurnRate, noise);
      const hardcoreGain = drawFlow(
        rng,
        fans.casual - casualChurn,
        rates.hardcoreConversionRate * unattachedShare,
        noise,
      );
      return { casualGain, casualChurn, hardcoreGain };
    }
    return NO_FLOWS;
  });

  const requested = flows.reduce((sum, flow) => sum + flow.hardcoreGain, 0);
  const scale = requested > unattached ? unattached / requested : 1;
  let remaining = unattached;

  return {
    ...countryState,
    fans: countryState.fans.map((fans, index) => {
      const flow = flows[index] ?? NO_FLOWS;
      const hardcoreGain = Math.min(remaining, Math.floor(flow.hardcoreGain * scale));
      remaining -= hardcoreGain;
      return {
        sportId: fans.sportId,
        casual: fans.casual + flow.casualGain - flow.casualChurn - hardcoreGain,
        hardcore: fans.hardcore + hardcoreGain,
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
