import { playerFandomScore } from "./fandom";
import { nextFloat, type Rng, restoreRng, saveRng } from "./rng";
import type { Config, CountryState, GameState, SportState, World } from "./types";

// PLACEHOLDER DYNAMICS. These stand in for the real fan, spread, and PP models so the turn
// engine, saves, runner, and UI have something to move. Every rate comes from config.
//
// Per country, per sport, per quarter:
//   uninterested → casual   uninterested × casualConversionRate × local reach (word of mouth)
//   casual → uninterested   casual × casualChurnRate
//   casual → hardcore       casual × hardcoreConversionRate × share of people with no hardcore sport
// Hardcore is exclusive: if the sports together would convert more people than have no hardcore
// sport, the conversions are scaled down to fit. Hardcore fans are never lost here; the GDD's
// demotion causes arrive with the systems that produce them. There is no cross-border spread yet.
// PP income per quarter: scale × (player Fandom Score ^ exponent).

/** Advances the simulation by one in-game quarter. Pure: returns a new state. */
export function stepQuarter(state: GameState, world: World): GameState {
  const { config } = world;
  const rng = restoreRng(state.rng);

  const countries = state.countries.map((countryState, index) => {
    const country = world.countries[index];
    if (!country || country.id !== countryState.countryId) {
      throw new Error(
        `Game state and content disagree at country #${index} ("${countryState.countryId}")`,
      );
    }
    return stepCountry(countryState, country.population, state.sports, config, rng);
  });

  const score = playerFandomScore(state.sports, countries, config.fandomScore.casualWeight);
  const ppIncome = config.ppIncome.scale * score ** config.ppIncome.exponent;

  return {
    ...state,
    rng: saveRng(rng),
    quarter: state.quarter + 1,
    pp: state.pp + ppIncome,
    countries,
  };
}

interface Flows {
  casualGain: number;
  casualChurn: number;
  hardcoreGain: number;
}

function stepCountry(
  countryState: CountryState,
  population: number,
  sports: readonly SportState[],
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
    const rates = config.dynamics[sport.kind];
    const uninterested = population - fans.casual - fans.hardcore;
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
  });

  const requested = flows.reduce((sum, flow) => sum + flow.hardcoreGain, 0);
  const scale = requested > unattached ? unattached / requested : 1;
  let remaining = unattached;

  return {
    countryId: countryState.countryId,
    fans: countryState.fans.map((fans, index) => {
      const flow = flows[index] ?? { casualGain: 0, casualChurn: 0, hardcoreGain: 0 };
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
