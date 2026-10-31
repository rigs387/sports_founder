import { describe, expect, it } from "vitest";
import {
  createCampaign,
  type GameState,
  type LeagueTierId,
  leagueCosts,
  leagueIncomePerQuarter,
  leagueReserve,
  PLAYER_INDEX,
  runningCostPerQuarter,
  stepLeagueQuarter,
  venueCostBasis,
} from "../src/sim";
import { evaluateLeagues } from "../src/sim/leagues";
import { newVenue } from "../src/sim/venues";
import { countryIndex, setupFor, world } from "./helpers";

// The late surplus, step 1 (GDD v1.39, tech plan 2.25): every league pays its profit above a
// reserve out to the clubs, and from Professional up the players are paid a share of income.

const brazil = countryIndex(world, "brazil");
const argentina = countryIndex(world, "argentina");

/** Brazil's campaign (the seat) with a league in `index` at `tier`, holding `cash`. */
function withLeague(index: number, tier: LeagueTierId, cash: number): GameState {
  const state = createCampaign(world, setupFor(5, "brazil"));
  const countries = [...state.countries];
  const country = countries[index];
  if (!country) throw new Error("no country");
  const fans = country.fans.map((sport, s) =>
    s === PLAYER_INDEX ? { ...sport, casual: 5_000_000, hardcore: 500_000 } : sport,
  );
  countries[index] = {
    ...country,
    fans,
    league: {
      tier,
      health: "healthy",
      cash,
      paidOut: 0,
      lastFlowPerQuarter: null,
      hardcoreAtLastEval: 500_000,
      formedQuarter: 0,
      bailoutReadyQuarter: 0,
      venue: newVenue(),
    },
  };
  return { ...state, countries };
}

describe("the players' share (tech plan 2.25 step 1)", () => {
  it("from Professional up the players take a share of income; below it the costs are as before", () => {
    const pro = withLeague(argentina, "professional", 0);
    const income = leagueIncomePerQuarter(pro, world, argentina);
    const running = runningCostPerQuarter(world, argentina, "professional", pro.growthNodes);
    const costs = leagueCosts(pro, world, argentina);
    expect(costs.payroll).toBeCloseTo(world.config.leagues.players.share * income, 9);
    expect(costs.operations).toBeCloseTo(
      (1 - world.config.flagship.payroll.baselineShare) * running,
      9,
    );
    const semi = withLeague(argentina, "semi-pro", 0);
    const semiCosts = leagueCosts(semi, world, argentina);
    expect(semiCosts.payroll).toBe(0);
    expect(semiCosts.operations).toBeCloseTo(
      runningCostPerQuarter(world, argentina, "semi-pro", semi.growthNodes),
      9,
    );
  });

  it("at the seat the players take the agreement's share", () => {
    const seat = withLeague(brazil, "elite", 0);
    const income = leagueIncomePerQuarter(seat, world, brazil);
    expect(leagueCosts(seat, world, brazil).payroll).toBeCloseTo(
      world.config.flagship.agreement.share * income,
      9,
    );
  });
});

describe("the payout (tech plan 2.25 step 1)", () => {
  it("the reserve is the larger of a few years of costs and the next venue level", () => {
    const state = withLeague(argentina, "elite", 0);
    const reserve = leagueReserve(state, world, argentina);
    const years = world.config.leagues.payout.reserveYears;
    const venue =
      (world.config.leagues.venue.priceQuarters[0] ?? 0) *
      venueCostBasis(world, argentina, "elite", 2, state.growthNodes);
    expect(reserve).toBeCloseTo(
      Math.max(4 * years * leagueCosts(state, world, argentina).total, venue),
      6,
    );
  });

  it("pays out profit above the reserve, never more than the quarter's profit", () => {
    const state = withLeague(argentina, "elite", 0);
    const country = state.countries[argentina];
    if (!country) throw new Error("no country");
    const step = (cash: number, income: number, cost: number) => {
      const start = { ...country, league: country.league && { ...country.league, cash } };
      return stepLeagueQuarter(start, argentina, world, state, 1, income, cost, 100).country.league;
    };
    // Below the reserve the league keeps everything.
    expect(step(50, 30, 10)).toMatchObject({ cash: 70, paidOut: 0 });
    // Crossing it, only the part above is paid out.
    expect(step(90, 30, 10)).toMatchObject({ cash: 100, paidOut: 10 });
    // Already above it (a host's windfall), only this quarter's profit goes.
    expect(step(150, 30, 10)).toMatchObject({ cash: 150, paidOut: 20 });
    // A loss is never topped up or paid out.
    expect(step(150, 10, 30)).toMatchObject({ cash: 130, paidOut: 0 });
  });

  it("a league that pays out its profit stays healthy: the payout is not a loss", () => {
    const start = withLeague(argentina, "elite", 100);
    const at = (cash: number, paidOut: number): GameState => {
      const countries = [...start.countries];
      const country = countries[argentina];
      if (!country?.league) throw new Error("no league");
      countries[argentina] = { ...country, league: { ...country.league, cash, paidOut } };
      return { ...start, countries };
    };
    const priorFlow = (state: GameState) => {
      const countries = [...state.countries];
      const country = countries[argentina];
      if (!country?.league) throw new Error("no league");
      countries[argentina] = { ...country, league: { ...country.league, lastFlowPerQuarter: 0 } };
      return { ...state, countries };
    };
    // Cash dipped by 10 in a quarter while 40 was paid out in the other: a flow of +15 a quarter,
    // not a growing loss (cash alone would read -5 after a flow of 0).
    const evaluated = evaluateLeagues(priorFlow(start), at(90, 40), world, 2);
    const league = evaluated.countries[argentina]?.league;
    expect(league?.lastFlowPerQuarter).toBeCloseTo(15, 9);
    expect(league?.health).toBe("healthy");
    expect(league?.paidOut).toBe(0);
  });
});
