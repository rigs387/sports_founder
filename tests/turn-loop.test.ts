import { describe, expect, it } from "vitest";
import { builder } from "../src/runner/policy";
import {
  checkInvariants,
  createCampaign,
  endTurn,
  type GameState,
  runTurns,
  stepQuarter,
} from "../src/sim";
import { presetGenome, setupFor, withConfig, world } from "./helpers";

const setup = setupFor(11);
const UNREACHABLE = Number.MAX_SAFE_INTEGER;

/** Config where no tier-up can happen, so turn length stays fixed. */
const noTierUps = withConfig(world, (config) => {
  for (const tier of config.ppTiers) if (tier.tier > 1) tier.fandomScoreRequired = UNREACHABLE;
});

describe("turn = N quarters, with N set by PP tier", () => {
  it("the shipped tier table actually varies turn length and focus slots", () => {
    const lengths = new Set(world.config.ppTiers.map((tier) => tier.turnLengthQuarters));
    expect(lengths.size).toBeGreaterThan(1);
    const slots = new Set(world.config.ppTiers.map((tier) => tier.focusSlots));
    expect(slots.size).toBeGreaterThan(1);
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

    const turned = endTurn(start, yearTurns);
    // Fans, money, RNG and history match exactly; endTurn only adds the once-per-turn league
    // health bookkeeping on top.
    expect(turned.quarter).toBe(byQuarter.quarter);
    expect(turned.rng).toStrictEqual(byQuarter.rng);
    expect(turned.pp).toBe(byQuarter.pp);
    expect(turned.yearly).toStrictEqual(byQuarter.yearly);
    expect(turned.countries.map((c) => c.fans)).toStrictEqual(
      byQuarter.countries.map((c) => c.fans),
    );
    expect(turned.countries.map((c) => c.league?.cash)).toStrictEqual(
      byQuarter.countries.map((c) => c.league?.cash),
    );
    expect(turned.turn).toBe(start.turn + 1);
    expect(byQuarter.pp).toBeGreaterThan(start.pp);
    expect(byQuarter.yearly).toHaveLength(1);
  });

  it("a tier-up during a turn changes turn length from the next turn on and adds empty slots", () => {
    const quickTierUp = withConfig(world, (config) => {
      config.tierTrack.telegraphTurns = 0;
      for (const tier of config.ppTiers) {
        if (tier.tier === 1) tier.turnLengthQuarters = 1;
        if (tier.tier === 2) {
          tier.fandomScoreRequired = 0;
          tier.breadth = { type: "anchorLeagueTier", leagueTier: "amateur" };
          tier.turnLengthQuarters = 4;
          tier.focusSlots = 3;
        }
        if (tier.tier > 2) tier.fandomScoreRequired = UNREACHABLE;
      }
    });
    const turn1 = createCampaign(quickTierUp, setup);
    expect(turn1.focus).toStrictEqual([setup.anchorCountryId]);
    const turn2 = endTurn(turn1, quickTierUp);
    expect(turn2.quarter).toBe(1);
    expect(turn2.ppTier).toBe(2);
    expect(turn2.focus).toStrictEqual([setup.anchorCountryId, null, null]);
    const turn3 = endTurn(turn2, quickTierUp);
    expect(turn3.quarter).toBe(5);
  });

  it("tiers rise in the shipped config over a long campaign (the loop is exercised end to end)", () => {
    let state = createCampaign(world, setup);
    for (let i = 0; i < 150 && state.outcome === null; i += 1) {
      state = endTurn(builder(state, world).state, world);
    }
    expect(state.outcome).toBeNull();
    expect(state.ppTier).toBeGreaterThanOrEqual(3);
    expect(state.landmarks.filter((l) => l.kind === "ppTierUp").length).toBeGreaterThanOrEqual(2);
  });

  it("without promotions, the anchor league never reaches Semi-Pro, so tier 2 never comes", () => {
    const state = runTurns(createCampaign(world, setup), world, 80);
    expect(state.ppTier).toBe(1);
  });
});

describe("state stays valid", () => {
  it.each(world.countries.map((country) => country.id))(
    "anchor %s: every turn of 120 across two seeds and two genomes keeps state valid",
    (anchor) => {
      for (const seed of [1, 2]) {
        for (const preset of ["backyard-kickball", "long-innings"]) {
          const problems: string[] = [];
          runTurns(
            createCampaign(world, setupFor(seed, anchor, presetGenome(preset))),
            world,
            120,
            (state) => {
              problems.push(...checkInvariants(state, world));
            },
          );
          expect(problems, `seed ${seed} ${preset}`).toEqual([]);
        }
      }
    },
  );

  it("extreme rates fill the hardcore pie without ever exceeding it (hardcore is exclusive)", () => {
    const extreme = withConfig(world, (config) => {
      config.dynamics.noise = 0.9;
      config.dynamics.player = {
        casualConversionRate: 50,
        casualChurnRate: 0,
        casualDecayRate: 0,
        hardcoreConversionRate: 1,
      };
      config.dynamics.rival = {
        casualChurnRate: 0,
        hardcoreConversionRate: 1,
      };
      config.exposure.cap = 1;
      // Rivals only rebuild up to their home level, so the player fills the rest of the pie; with
      // no hardcore losses it can.
      config.turnover.annualRate = 0;
      config.poaching.rate = 0;
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

  it("hardcore fans never go straight to uninterested: every hardcore loss becomes casual", () => {
    // With casual churn and decay switched off, a sport's casual + hardcore in a country can only
    // fall if hardcore fans skipped casual. Poaching, league health, step-downs and folds all run.
    const noChurn = withConfig(world, (config) => {
      config.dynamics.player.casualChurnRate = 0;
      config.dynamics.player.casualDecayRate = 0;
      config.dynamics.rival.casualChurnRate = 0;
    });
    // After turn 80 the player stops converting new hardcore fans, so its losses to rival poaching
    // show up as falling hardcore counts instead of hiding under growth.
    const noNewHardcore = withConfig(noChurn, (config) => {
      config.dynamics.player.hardcoreConversionRate = 0;
    });
    let previous = createCampaign(noChurn, setupFor(21, "austria", presetGenome("ice-paddle")));
    const problems: string[] = [];
    const losses = { player: 0, rivals: 0 };
    for (let turn = 0; turn < 140 && previous.outcome === null; turn += 1) {
      const w = turn < 80 ? noChurn : noNewHardcore;
      const next = endTurn(builder(previous, w).state, w);
      next.countries.forEach((country, i) => {
        country.fans.forEach((fans, s) => {
          const before = previous.countries[i]?.fans[s];
          if (!before) return;
          if (fans.hardcore < before.hardcore) {
            if (s === 0) losses.player += 1;
            else losses.rivals += 1;
          }
          if (fans.casual + fans.hardcore < before.casual + before.hardcore) {
            problems.push(`${country.countryId}/${fans.sportId} on turn ${turn + 1}`);
          }
        });
      });
      previous = next;
    }
    expect(problems).toEqual([]);
    // Hardcore losses really happened on both sides, or the check proves nothing.
    expect(losses.player).toBeGreaterThan(0);
    expect(losses.rivals).toBeGreaterThan(0);
  });
});
