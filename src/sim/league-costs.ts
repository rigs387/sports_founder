import { seatStars, starWage } from "./flagship";
import { runningCostPerQuarter } from "./leagues";
import type { CountryState, GameState, LeagueTierId, World } from "./types";

// A league's costs a quarter (GDD v1.30). Every league pays its running cost (tier × wealth ×
// size, cut by growth nodes) and upkeep on venue levels above 1. At the seat the running cost is
// split into operations and the payroll baseline, and each star playing there adds a wage that
// rises with their seasons as a star and their backed influence. Never from skill.

export interface LeagueCosts {
  /** The running cost less the payroll baseline (all of it away from the seat). */
  operations: number;
  /** The payroll baseline: the leading players. Zero away from the seat. */
  payroll: number;
  /** Star wages at the seat. */
  wages: number;
  upkeep: number;
  total: number;
}

const NO_COSTS: LeagueCosts = { operations: 0, payroll: 0, wages: 0, upkeep: 0, total: 0 };

/**
 * A league's costs a quarter. `country` and `tier` default to the state's (a promotion's terms
 * pass the next tier).
 */
export function leagueCosts(
  state: Pick<GameState, "countries" | "flagship" | "growthNodes">,
  world: World,
  index: number,
  country: CountryState | undefined = state.countries[index],
  tier: LeagueTierId | undefined = country?.league?.tier,
): LeagueCosts {
  const league = country?.league;
  if (!league || tier === undefined) return NO_COSTS;
  const running = runningCostPerQuarter(world, index, tier, state.growthNodes);
  const upkeep = world.config.leagues.venue.upkeepShare * (league.venue.level - 1) * running;
  if (world.countries[index]?.id !== state.flagship.countryId) {
    return { operations: running, payroll: 0, wages: 0, upkeep, total: running + upkeep };
  }
  const payroll = world.config.flagship.payroll.baselineShare * running;
  const wages = seatStars(state.flagship).reduce(
    (sum, star) => sum + starWage(star, state.flagship, running, world),
    0,
  );
  const operations = running - payroll;
  return { operations, payroll, wages, upkeep, total: running + wages + upkeep };
}
