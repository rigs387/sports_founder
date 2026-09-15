import { describe, expect, it } from "vitest";
import {
  AXIS_IDS,
  GENOME_AXES,
  type Genome,
  IDENTITY_AXES,
  NUMERIC_ATTRIBUTES,
  optionNetDeltaAt,
  RULE_AXES,
} from "../src/content";
import { anchorGenomeHints, leverMultipliers, similarity } from "../src/sim";
import { baseGenome, countryIndex, presetGenome, withConfig, world } from "./helpers";

describe("genome axes match the GDD table", () => {
  it("has 10 axes, 4 identity and 6 rule, each with 3–4 options", () => {
    expect(AXIS_IDS).toHaveLength(10);
    expect(IDENTITY_AXES).toEqual(["surface", "equipment", "physical", "footprint"]);
    expect(RULE_AXES).toEqual([
      "contact",
      "teamSize",
      "matchLength",
      "scoring",
      "complexity",
      "structure",
    ]);
    for (const axis of AXIS_IDS) {
      expect(GENOME_AXES[axis].options.length).toBeGreaterThanOrEqual(3);
      expect(GENOME_AXES[axis].options.length).toBeLessThanOrEqual(4);
    }
    expect(GENOME_AXES.surface.options).toEqual(["grass", "indoor", "street", "ice"]);
  });

  it("the rivals carry the GDD's soccer and cricket genomes", () => {
    const soccer = world.rivals.find((r) => r.id === "fieldball")?.genome;
    const cricket = world.rivals.find((r) => r.id === "longbat")?.genome;
    expect(soccer).toStrictEqual({
      surface: "grass",
      equipment: "ball-only",
      physical: "endurance",
      footprint: "large",
      contact: "incidental",
      teamSize: "large",
      matchLength: "standard",
      scoring: "low",
      complexity: "simple",
      structure: "continuous",
    });
    expect(cricket).toStrictEqual({
      surface: "grass",
      equipment: "stick-or-bat",
      physical: "precision",
      footprint: "large",
      contact: "none",
      teamSize: "large",
      matchLength: "long",
      scoring: "high",
      complexity: "intricate",
      structure: "innings",
    });
  });

  it("every shipped option helps in a real share of countries and hurts in a real share", () => {
    const { minHelpShare, minHurtShare, neutralDelta } = world.config.genomeBalance;
    expect(minHelpShare).toBeGreaterThan(0);
    expect(minHurtShare).toBeGreaterThan(0);
    const n = world.derived.length;
    for (const axis of AXIS_IDS) {
      for (const option of GENOME_AXES[axis].options) {
        const modifiers = world.genome.options[axis][option] ?? { base: {}, conditions: {} };
        const nets = world.derived.map((attributes) => optionNetDeltaAt(modifiers, attributes));
        const helps = nets.filter((net) => net > neutralDelta).length;
        const hurts = nets.filter((net) => net < -neutralDelta).length;
        expect(helps / n, `${axis}=${option} helps`).toBeGreaterThanOrEqual(minHelpShare);
        expect(hurts / n, `${axis}=${option} hurts`).toBeGreaterThanOrEqual(minHurtShare);
      }
    }
  });
});

describe("numeric conditions are relative to the world", () => {
  it("positions are 0 at the population-weighted average, ±1 at the most extreme country, in score order", () => {
    const total = world.countries.reduce((sum, c) => sum + c.population, 0);
    for (const attribute of NUMERIC_ATTRIBUTES) {
      const positions = world.derived.map((d) => d.position[attribute]);
      const weightedMean = positions.reduce(
        (sum, p, i) => sum + p * (world.countries[i]?.population ?? 0),
        0,
      );
      expect(weightedMean / total, attribute).toBeCloseTo(0, 12);
      expect(Math.max(...positions.map((p) => Math.abs(p))), attribute).toBeCloseTo(1, 12);
      const byScore = [...world.derived].sort((a, b) => a[attribute] - b[attribute]);
      for (let i = 1; i < byScore.length; i += 1) {
        expect(byScore[i]?.position[attribute]).toBeGreaterThanOrEqual(
          byScore[i - 1]?.position[attribute] ?? Number.NEGATIVE_INFINITY,
        );
      }
    }
  });

  it("a +wealth condition helps richer-than-average countries and hurts poorer ones", () => {
    const modifiers = { base: {}, conditions: { accessibility: { wealth: 0.1 } } };
    world.derived.forEach((attributes, i) => {
      const net = optionNetDeltaAt(modifiers, attributes);
      const id = world.countries[i]?.id;
      expect(net, id).toBeCloseTo(0.1 * attributes.position.wealth, 12);
      if (attributes.position.wealth > 0) expect(net, id).toBeGreaterThan(0);
      if (attributes.position.wealth < 0) expect(net, id).toBeLessThan(0);
    });
  });
});

describe("rival similarity", () => {
  it("is 1 for identical genomes, 0 for genomes with nothing in common", () => {
    expect(similarity(baseGenome, baseGenome, world.config)).toBe(1);
    const opposite: Genome = {
      surface: "ice",
      equipment: "protective-gear",
      physical: "strength",
      footprint: "large",
      contact: "full",
      teamSize: "large",
      matchLength: "long",
      scoring: "low",
      complexity: "intricate",
      structure: "innings",
    };
    expect(similarity(baseGenome, opposite, world.config)).toBe(0);
  });

  it("is the weighted share of matching axes, using the config weights", () => {
    const surfaceOnly = withConfig(world, (config) => {
      for (const axis of AXIS_IDS) config.similarity.axisWeights[axis] = axis === "surface" ? 1 : 0;
    });
    const sameSurface: Genome = { ...presetGenome("long-innings"), surface: baseGenome.surface };
    expect(similarity(baseGenome, sameSurface, surfaceOnly.config)).toBe(1);
    const weights = world.config.similarity.axisWeights;
    const total = AXIS_IDS.reduce((sum, axis) => sum + weights[axis], 0);
    const oneOff: Genome = { ...baseGenome, structure: "innings" };
    expect(similarity(baseGenome, oneOff, world.config)).toBeCloseTo(
      (total - weights.structure) / total,
      10,
    );
  });
});

describe("anchor genome hints", () => {
  it("cover every axis and option with ++, +, − or nothing", () => {
    const hints = anchorGenomeHints(world, "valdoria");
    for (const axis of AXIS_IDS) {
      for (const option of GENOME_AXES[axis].options) {
        expect(["++", "+", "-", null]).toContain(hints[axis][option]);
      }
    }
  });

  it("recommend ice in a cold anchor and warn against it in a tropical one", () => {
    expect(anchorGenomeHints(world, "kestmark").surface.ice).toBe("++");
    expect(anchorGenomeHints(world, "oruna").surface.ice).toBe("-");
  });

  it("agree with the affinity lever's direction", () => {
    const index = countryIndex(world, "kestmark");
    const ice = leverMultipliers(world, presetGenome("ice-paddle"), index).affinity;
    const grass = leverMultipliers(
      world,
      { ...presetGenome("ice-paddle"), surface: "grass" },
      index,
    ).affinity;
    expect(ice).toBeGreaterThan(grass);
  });

  it("reject an unknown anchor", () => {
    expect(() => anchorGenomeHints(world, "atlantis")).toThrow(/Unknown anchor/);
  });
});
