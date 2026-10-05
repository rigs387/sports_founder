import { describe, expect, it } from "vitest";
import {
  createCampaign,
  fitScale,
  growthFactors,
  leverMultipliers,
  marketValue,
  PLAYER_INDEX,
  ppWeights,
  quarterPpIncome,
  snapshot,
} from "../src/sim";
import { countryIndex, presetGenome, setupFor, withConfig, world } from "./helpers";

// Big and rich markets (GDD v1.21).

const level = (id: string) =>
  world.config.wealthLevels.levels[world.derived[countryIndex(world, id)]?.wealthLevel ?? -1]?.id;

describe("wealth levels", () => {
  it("follow the World Bank's income groups for the GNI per person in the data", () => {
    expect(level("united-states")).toBe("affluent");
    expect(level("germany")).toBe("affluent");
    expect(level("china")).toBe("comfortable");
    expect(level("brazil")).toBe("comfortable");
    expect(level("india")).toBe("modest");
    expect(level("nigeria")).toBe("modest");
    const ids = world.config.wealthLevels.levels.map((l) => l.id);
    expect(ids).toEqual(["shoestring", "modest", "comfortable", "affluent"]);
    // Every level is used somewhere.
    for (let l = 0; l < ids.length; l += 1)
      expect(world.derived.some((d) => d.wealthLevel === l)).toBe(true);
  });

  it("weigh Prestige income: the same fans earn more in a richer market", () => {
    const state = createCampaign(world, setupFor(1, "brazil"));
    const fansIn = (id: string) =>
      state.countries.map((country, i) => ({
        ...country,
        fans: country.fans.map((fans, f) =>
          f === PLAYER_INDEX
            ? i === countryIndex(world, id)
              ? { ...fans, casual: 1_000_000, hardcore: 100_000 }
              : { ...fans, casual: 0, hardcore: 0 }
            : fans,
        ),
      }));
    const growth = growthFactors(world, []);
    const weights = ppWeights(world);
    const rich = quarterPpIncome(fansIn("germany"), growth, world.config, weights);
    const modest = quarterPpIncome(fansIn("india"), growth, world.config, weights);
    // Income has diminishing returns (score ^ exponent), so the weights' ratio shows through it.
    const [, modestLevel, , affluentLevel] = world.config.wealthLevels.levels;
    const ratio = (affluentLevel?.ppWeight ?? 1) / (modestLevel?.ppWeight ?? 1);
    expect(rich / modest).toBeCloseTo(ratio ** world.config.ppIncome.exponent);
    expect(rich).toBeGreaterThan(modest);
    // Without weights the two are the same.
    expect(quarterPpIncome(fansIn("germany"), growth, world.config)).toBeCloseTo(
      quarterPpIncome(fansIn("india"), growth, world.config),
    );
    expect(
      snapshot(state, world).countries.find((c) => c.countryId === "germany")?.wealthLevel,
    ).toBe("affluent");
  });
});

describe("a giant market is many audiences", () => {
  it("softens genome fit with population, never below the floor", () => {
    const { minScale } = world.config.bigMarkets;
    expect(fitScale(world, countryIndex(world, "india"))).toBeLessThan(0.5);
    expect(fitScale(world, countryIndex(world, "india"))).toBeGreaterThanOrEqual(minScale);
    expect(fitScale(world, countryIndex(world, "united-states"))).toBeLessThan(
      fitScale(world, countryIndex(world, "germany")),
    );
    expect(fitScale(world, countryIndex(world, "tuvalu"))).toBe(1);
    // The same genome moves the levers less in India than it would without softening.
    const flat = withConfig(world, (config) => {
      config.bigMarkets.fitExponent = 0;
    });
    const genome = presetGenome("ice-paddle");
    const india = countryIndex(world, "india");
    const soft = leverMultipliers(world, genome, india);
    const sharp = leverMultipliers(flat, genome, india);
    expect(Math.abs(soft.affinity - 1)).toBeLessThan(Math.abs(sharp.affinity - 1));
  });
});

describe("rivals fight hardest where it matters most", () => {
  it("value big rich markets over small poor ones, within the configured range", () => {
    const { min, max } = world.config.rivalAI.marketValue;
    const value = (id: string) => marketValue(world, countryIndex(world, id));
    expect(value("germany")).toBeGreaterThan(value("ethiopia"));
    expect(value("united-states")).toBeGreaterThan(value("germany"));
    expect(value("tuvalu")).toBe(min);
    for (let i = 0; i < world.countries.length; i += 1) {
      expect(marketValue(world, i)).toBeGreaterThanOrEqual(min);
      expect(marketValue(world, i)).toBeLessThanOrEqual(max);
    }
  });
});
