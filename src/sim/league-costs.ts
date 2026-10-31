import { leagueIncomePerQuarter } from "./deals";
import { seatStars, starWage } from "./flagship";
import { leagueTierIndex, nextVenuePrice, runningCostPerQuarter, venueUpkeep } from "./leagues";
import { shapeFactors } from "./shape";
import type { AgreementTerms, CountryState, GameState, LeagueTierId, World } from "./types";

// A league's costs a quarter (GDD v1.30). Every league pays its running cost (tier × wealth ×
// size, cut by growth nodes) and upkeep on venue levels above 1. At the seat the running cost is
// split into operations and the payroll baseline, and each star playing there adds a wage that
// rises with their seasons as a star and their backed influence. Never from skill.
// From Professional up (GDD v1.39) the players are paid a share of the league's income instead
// of the baseline: the flagship's agreement at the seat (its share and minimum wage), the fixed
// share everywhere else.

export interface LeagueCosts {
  /** The running cost less the payroll baseline (all of it away from the seat below Professional). */
  operations: number;
  /** The players: the baseline at the seat, or the players' share of income from Professional up. */
  payroll: number;
  /** Star wages at the seat. */
  wages: number;
  upkeep: number;
  total: number;
}

const NO_COSTS: LeagueCosts = { operations: 0, payroll: 0, wages: 0, upkeep: 0, total: 0 };

type CostState = Pick<GameState, "countries" | "flagship" | "growthNodes" | "ppTier" | "agreement">;

/** The flagship's agreement in force (GDD v1.39), or the default before the first. */
export function termsInForce(state: Pick<GameState, "agreement">, world: World): AgreementTerms {
  const current = state.agreement.current;
  if (!current) return world.config.flagship.agreement.default;
  const { share, term, cap, minWage } = current;
  return { share, term, cap, minWage };
}

/** What an agreement pays the players, as a share of income: its share and minimum wage. */
export function agreementPayShare(terms: AgreementTerms, world: World): number {
  return (terms.share + world.config.flagship.agreement.minWages[terms.minWage]) / 100;
}

/** The players' share of income at this tier, or null below `leagues.players.fromTier`. */
export function playersShare(
  state: Pick<GameState, "flagship" | "agreement">,
  world: World,
  index: number,
  tier: LeagueTierId,
): number | null {
  const { players } = world.config.leagues;
  if (leagueTierIndex(tier) < leagueTierIndex(players.fromTier)) return null;
  return world.countries[index]?.id === state.flagship.countryId
    ? agreementPayShare(termsInForce(state, world), world)
    : players.share;
}

/**
 * A league's costs a quarter. `country` and `tier` default to the state's (a promotion's terms
 * pass the next tier).
 */
export function leagueCosts(
  state: CostState,
  world: World,
  index: number,
  country: CountryState | undefined = state.countries[index],
  tier: LeagueTierId | undefined = country?.league?.tier,
): LeagueCosts {
  const league = country?.league;
  if (!league || tier === undefined) return NO_COSTS;
  const running = runningCostPerQuarter(world, index, tier, state.growthNodes);
  const upkeep = venueUpkeep(world, index, tier, league.venue.level, state.growthNodes);
  const atSeat = world.countries[index]?.id === state.flagship.countryId;
  const share = playersShare(state, world, index, tier);
  if (!atSeat && share === null) {
    return { operations: running, payroll: 0, wages: 0, upkeep, total: running + upkeep };
  }
  const baseline = world.config.flagship.payroll.baselineShare * running;
  const operations = running - baseline;
  const players =
    share === null ? baseline : share * leagueIncomePerQuarter(state, world, index, country, tier);
  if (!atSeat) {
    return { operations, payroll: players, wages: 0, upkeep, total: operations + players + upkeep };
  }
  // A salary cap or star pay scales the payroll and star wages (GDD v1.35).
  const wage = shapeFactors(world, state.growthNodes).wageFactor;
  const payroll = players * wage;
  const wages =
    wage *
    seatStars(state.flagship).reduce(
      (sum, star) => sum + starWage(star, state.flagship, running, world),
      0,
    );
  return { operations, payroll, wages, upkeep, total: operations + payroll + wages + upkeep };
}

/**
 * The cash a league keeps (GDD v1.39): the larger of `payout.reserveYears` of its costs and the
 * price of its next venue level. A quarter's profit above it is paid out to the clubs.
 */
export function leagueReserve(
  state: CostState,
  world: World,
  index: number,
  country: CountryState | undefined = state.countries[index],
): number {
  const league = country?.league;
  if (!league) return 0;
  const years = world.config.leagues.payout.reserveYears;
  const costs = 4 * years * leagueCosts(state, world, index, country).total;
  const venue =
    nextVenuePrice(world, index, league.tier, league.venue.level, state.growthNodes) ?? 0;
  return Math.max(costs, venue);
}
