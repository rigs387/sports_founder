import { describe, expect, it } from "vitest";
import {
  checkInvariants,
  createCampaign,
  endTurn,
  type GameState,
  runTurns,
  stepQuarter,
} from "../src/sim";
import { firstAnchor, withConfig, world } from "./helpers";

const setup = { seed: 11, anchorCountryId: firstAnchor };
const UNREACHABLE = Number.MAX_SAFE_INTEGER;

/** Config where no tier-up can happen, so turn length stays fixed. */
const noTierUps = withConfig(world, (config) => {
  for (const tier of config.ppTiers) if (tier.tier > 1) tier.fandomScoreRequired = UNREACHABLE;
});

describe("turn = N quarters, with N set by PP tier", () => {
  it("the shipped tier table actually varies turn length", () => {
    const lengths = new Set(world.config.ppTiers.map((tier) => tier.turnLengthQuarters));
    expect(lengths.size).toBeGreaterThan(1);
  });

  it.each(noTierUps.config.ppTiers.map((tier) => [tier.tier, tier.turnLengthQuarters]))(
    "a turn at PP tier %i simulates %i quarter(s)",
    (tier, quarters) => {
      const start: GameState = { ...createCampaign(noTierUps, setup), ppTier: tier };
      const next = endTurn(start, noTierUps);
      expect(next.quarter - start.quarter).toBe(quarters);
      expect(next.turn).toBe(start.turn + 1);
    },
  );

  it("a turn is exactly its quarters stepped one at a time, with PP summed across them", () => {
    const yearTurns = withConfig(noTierUps, (config) => {
      const tier1 = config.ppTiers[0];
      if (tier1) tier1.turnLengthQuarters = 4;
    });
    const start = createCampaign(yearTurns, setup);
    let byQuarter = start;
    for (let i = 0; i < 4; i += 1) byQuarter = stepQuarter(byQuarter, yearTurns);

    expect(endTurn(start, yearTurns)).toStrictEqual({ ...byQuarter, turn: start.turn + 1 });
    expect(byQuarter.pp).toBeGreaterThan(start.pp);
  });

  it("a tier-up during a turn changes turn length from the next turn on", () => {
    const quickTierUp = withConfig(world, (config) => {
      for (const tier of config.ppTiers) {
        if (tier.tier === 1) tier.turnLengthQuarters = 1;
        if (tier.tier === 2) {
          tier.fandomScoreRequired = 0;
          tier.turnLengthQuarters = 4;
        }
        if (tier.tier > 2) tier.fandomScoreRequired = UNREACHABLE;
      }
    });
    const turn1 = createCampaign(quickTierUp, setup);
    const turn2 = endTurn(turn1, quickTierUp);
    expect(turn2.quarter).toBe(1);
    expect(turn2.ppTier).toBe(2);
    const turn3 = endTurn(turn2, quickTierUp);
    expect(turn3.quarter).toBe(5);
  });

  it("tiers rise in the shipped config over a long campaign (the loop is exercised end to end)", () => {
    const state = runTurns(createCampaign(world, setup), world, 150);
    expect(state.ppTier).toBeGreaterThanOrEqual(3);
  });
});

describe("state stays valid", () => {
  it.each(world.countries.map((country) => country.id))(
    "anchor %s: every turn of 150 across three seeds keeps fan buckets valid",
    (anchor) => {
      for (const seed of [1, 2, 3]) {
        const problems: string[] = [];
        runTurns(createCampaign(world, { seed, anchorCountryId: anchor }), world, 150, (state) => {
          problems.push(...checkInvariants(state, world));
        });
        expect(problems, `seed ${seed}`).toEqual([]);
      }
    },
  );

  it("extreme rates fill the hardcore pie without ever exceeding it (hardcore is exclusive)", () => {
    const extreme = withConfig(world, (config) => {
      config.dynamics.noise = 0.9;
      for (const kind of ["player", "rival"] as const) {
        config.dynamics[kind] = {
          casualConversionRate: 1,
          casualChurnRate: 0,
          hardcoreConversionRate: 1,
        };
      }
    });
    const problems: string[] = [];
    const final = runTurns(createCampaign(extreme, setup), extreme, 60, (state) => {
      problems.push(...checkInvariants(state, extreme));
    });
    expect(problems).toEqual([]);

    const fullest = Math.max(
      ...final.countries.map((countryState, index) => {
        const population = extreme.countries[index]?.population ?? 1;
        return countryState.fans.reduce((sum, fans) => sum + fans.hardcore, 0) / population;
      }),
    );
    expect(fullest).toBeGreaterThan(0.99);
  });
});
