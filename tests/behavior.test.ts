import { describe, expect, it } from "vitest";
import type { Genome, World } from "../src/content";
import {
  applyAction,
  createCampaign,
  type GameState,
  leverMultipliers,
  PLAYER_INDEX,
  runTurns,
  similarityEffect,
} from "../src/sim";
import { baseGenome, countryIndex, presetGenome, setupFor, withWorld, world } from "./helpers";

// Tests the GDD's promises through their consequences (technical lessons, item 1): with seed and
// anchor held constant, changing one genome trait or one world fact must move outcomes in the
// intended direction, for every seed, by a real margin.

const SEEDS = [1, 2, 3, 4, 5, 6];

interface PlayerTotals {
  casual: number;
  hardcore: number;
}

function playerTotals(state: GameState): PlayerTotals {
  let casual = 0;
  let hardcore = 0;
  for (const country of state.countries) {
    const fans = country.fans[PLAYER_INDEX];
    if (fans) {
      casual += fans.casual;
      hardcore += fans.hardcore;
    }
  }
  return { casual, hardcore };
}

function playerIn(state: GameState, w: World, countryId: string): PlayerTotals {
  const fans = state.countries[countryIndex(w, countryId)]?.fans[PLAYER_INDEX];
  return { casual: fans?.casual ?? 0, hardcore: fans?.hardcore ?? 0 };
}

function play(w: World, seed: number, anchor: string, genome: Genome, turns: number): GameState {
  return runTurns(createCampaign(w, setupFor(seed, anchor, genome)), w, turns);
}

describe("Ice raises affinity in Cold countries and lowers it in Tropical ones", () => {
  const icePaddle = presetGenome("ice-paddle");
  const grassPaddle: Genome = { ...icePaddle, surface: "grass" };
  const cold = world.countries.filter((c) => c.climate === "cold").map((c) => c.id);
  const tropical = world.countries.filter((c) => c.climate === "tropical").map((c) => c.id);

  it("the affinity lever itself moves the right way in every cold and tropical country", () => {
    expect(cold.length).toBeGreaterThan(1);
    expect(tropical.length).toBeGreaterThan(1);
    for (const id of cold) {
      const index = countryIndex(world, id);
      const ice = leverMultipliers(world, icePaddle, index).affinity;
      const grass = leverMultipliers(world, grassPaddle, index).affinity;
      expect(ice, id).toBeGreaterThan(grass * 1.3);
    }
    for (const id of tropical) {
      const index = countryIndex(world, id);
      const ice = leverMultipliers(world, icePaddle, index).affinity;
      const grass = leverMultipliers(world, grassPaddle, index).affinity;
      expect(ice, id).toBeLessThan(grass * 0.7);
    }
  });

  it.each(SEEDS)("seed %i: ice grows clearly more from a cold anchor than grass does", (seed) => {
    const ice = playerTotals(play(world, seed, "kestmark", icePaddle, 30));
    const grass = playerTotals(play(world, seed, "kestmark", grassPaddle, 30));
    expect(ice.casual).toBeGreaterThan(grass.casual * 1.3);
  });

  it.each(SEEDS)(
    "seed %i: ice grows clearly less from a tropical anchor than grass does",
    (seed) => {
      const ice = playerTotals(play(world, seed, "oruna", icePaddle, 30));
      const grass = playerTotals(play(world, seed, "oruna", grassPaddle, 30));
      expect(ice.casual).toBeLessThan(grass.casual * 0.7);
    },
  );
});

describe("Simple rules convert casuals faster than Intricate; Intricate converts hardcore faster", () => {
  const simple: Genome = { ...baseGenome, complexity: "simple" };
  const intricate: Genome = { ...baseGenome, complexity: "intricate" };

  it.each(SEEDS)("seed %i", (seed) => {
    const s = playerTotals(play(world, seed, "valdoria", simple, 24));
    const i = playerTotals(play(world, seed, "valdoria", intricate, 24));
    expect(s.casual).toBeGreaterThan(i.casual * 1.15);
    // Hardcore conversion is measured relative to the casual pool it draws from.
    expect(i.hardcore / i.casual).toBeGreaterThan((s.hardcore / s.casual) * 1.15);
  });
});

describe("Similarity to the dominant rival eases casual conversion and slows hardcore conversion", () => {
  // Same player genome, same seed; only the dominant rival's genome changes. Fieldball holds
  // 12% hardcore in Valdoria, above the full-effect share.
  const twin = withWorld(world, (content) => {
    const rival = content.rivals.find((r) => r.id === "fieldball");
    if (rival) rival.genome = { ...baseGenome };
  });
  const opposite = withWorld(world, (content) => {
    const rival = content.rivals.find((r) => r.id === "fieldball");
    if (rival) {
      rival.genome = {
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
    }
  });

  it("the similarity effect reads 1 for a twin and 0 for an opposite", () => {
    const state = createCampaign(world, setupFor(1, "valdoria"));
    const country = state.countries[countryIndex(world, "valdoria")];
    if (!country) throw new Error("no valdoria");
    const same = similarityEffect(twin, baseGenome, country, state.sports, 9_000_000);
    const diff = similarityEffect(opposite, baseGenome, country, state.sports, 9_000_000);
    expect(same.similarity).toBe(1);
    expect(same.casualFactor).toBeGreaterThan(1);
    expect(same.hardcoreFactor).toBeLessThan(1);
    expect(diff.similarity).toBe(0);
    expect(diff.casualFactor).toBe(1);
    expect(diff.hardcoreFactor).toBe(1);
  });

  it.each(SEEDS)("seed %i", (seed) => {
    const same = playerIn(play(twin, seed, "valdoria", baseGenome, 20), twin, "valdoria");
    const diff = playerIn(play(opposite, seed, "valdoria", baseGenome, 20), opposite, "valdoria");
    expect(same.casual).toBeGreaterThan(diff.casual * 1.15);
    expect(same.hardcore / same.casual).toBeLessThan((diff.hardcore / diff.casual) * 0.8);
  });
});

describe("A country with no neighbors, language links or media reach", () => {
  // Umbari, cut off: no borders, a language sphere nobody else uses, and its media market is
  // below the media-reach threshold.
  const ISOLATED = "umbari";
  const isolated = withWorld(world, (content) => {
    for (const country of content.countries) {
      country.neighbors = country.neighbors.filter((id) => id !== ISOLATED);
      country.seaLinks = country.seaLinks.filter((id) => id !== ISOLATED);
      if (country.id === ISOLATED) {
        country.neighbors = [];
        country.seaLinks = [];
        country.languages = { primary: "umbaric-only" };
      }
    }
  });

  it("really has no inbound links in the derived world", () => {
    expect(isolated.inbound[countryIndex(isolated, ISOLATED)]).toEqual([]);
    expect(isolated.derived[countryIndex(isolated, ISOLATED)]?.mediaMarket).toBeLessThan(
      isolated.config.spread.media.minMarketScore,
    );
  });

  it.each(SEEDS)("seed %i: gains no fans without focus, and gains fans once focused", (seed) => {
    const unfocused = play(isolated, seed, "valdoria", baseGenome, 60);
    expect(playerIn(unfocused, isolated, ISOLATED)).toEqual({ casual: 0, hardcore: 0 });
    // Plenty of other countries were reached, so the isolation is the only difference.
    const reached = unfocused.countries.filter((c) => (c.fans[PLAYER_INDEX]?.casual ?? 0) > 0);
    expect(reached.length).toBeGreaterThan(10);

    const focused = applyAction({ ...unfocused, pp: 10_000 }, isolated, {
      type: "assignFocus",
      slot: 0,
      countryId: ISOLATED,
    });
    const after = runTurns(focused, isolated, 8);
    expect(playerIn(after, isolated, ISOLATED).casual).toBeGreaterThan(1000);
  });
});

describe("Island sea links let spread reach islands", () => {
  // Sallavi Isles: no land borders, its own language sphere, tiny media market; reachable only
  // through hand-listed sea links.
  const ISLAND = "sallavi-isles";
  const noSeaLinks = withWorld(world, (content) => {
    for (const country of content.countries) {
      country.seaLinks = country.seaLinks.filter((id) => id !== ISLAND);
      if (country.id === ISLAND) country.seaLinks = [];
    }
  });

  it("the island is reachable only by sea in the shipped content", () => {
    const island = world.countries[countryIndex(world, ISLAND)];
    expect(island?.neighbors).toEqual([]);
    expect(island?.seaLinks.length).toBeGreaterThan(0);
    expect(world.inbound[countryIndex(world, ISLAND)]?.length).toBeGreaterThan(0);
    expect(noSeaLinks.inbound[countryIndex(noSeaLinks, ISLAND)]).toEqual([]);
  });

  it.each(SEEDS)(
    "seed %i: fans arrive from a sea-linked anchor, and never without the link",
    (seed) => {
      const linked = play(world, seed, "oruna", baseGenome, 40);
      const cut = play(noSeaLinks, seed, "oruna", baseGenome, 40);
      expect(playerIn(linked, world, ISLAND).casual).toBeGreaterThan(100);
      expect(playerIn(cut, noSeaLinks, ISLAND)).toEqual({ casual: 0, hardcore: 0 });
    },
  );
});
