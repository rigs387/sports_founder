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
    const ice = playerTotals(play(world, seed, "czechia", icePaddle, 30));
    const grass = playerTotals(play(world, seed, "czechia", grassPaddle, 30));
    expect(ice.casual).toBeGreaterThan(grass.casual * 1.3);
  });

  it.each(SEEDS)(
    "seed %i: ice grows clearly less from a tropical anchor than grass does",
    (seed) => {
      const ice = playerTotals(play(world, seed, "bangladesh", icePaddle, 30));
      const grass = playerTotals(play(world, seed, "bangladesh", grassPaddle, 30));
      expect(ice.casual).toBeLessThan(grass.casual * 0.7);
    },
  );
});

describe("Simple rules convert casuals faster than Intricate; Intricate converts hardcore faster", () => {
  const simple: Genome = { ...baseGenome, complexity: "simple" };
  const intricate: Genome = { ...baseGenome, complexity: "intricate" };

  it.each(SEEDS)("seed %i", (seed) => {
    const s = playerTotals(play(world, seed, "austria", simple, 24));
    const i = playerTotals(play(world, seed, "austria", intricate, 24));
    expect(s.casual).toBeGreaterThan(i.casual * 1.15);
    // Hardcore conversion is measured relative to the casual pool it draws from.
    expect(i.hardcore / i.casual).toBeGreaterThan((s.hardcore / s.casual) * 1.15);
  });
});

describe("Similarity to the dominant rival eases casual conversion and slows hardcore conversion", () => {
  // Same player genome, same seed; only the dominant rival's genome changes. Soccer holds
  // 12% hardcore in Austria, above the full-effect share.
  const twin = withWorld(world, (content) => {
    const rival = content.rivals.find((r) => r.id === "soccer");
    if (rival) rival.genome = { ...baseGenome };
  });
  const opposite = withWorld(world, (content) => {
    const rival = content.rivals.find((r) => r.id === "soccer");
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
    const state = createCampaign(world, setupFor(1, "austria"));
    const country = state.countries[countryIndex(world, "austria")];
    if (!country) throw new Error("no valdoria");
    const twinRivals = createCampaign(twin, setupFor(1, "austria")).rivals;
    const oppositeRivals = createCampaign(opposite, setupFor(1, "austria")).rivals;
    const same = similarityEffect(twin, baseGenome, country, state.sports, 9_000_000, twinRivals);
    const diff = similarityEffect(
      opposite,
      baseGenome,
      country,
      state.sports,
      9_000_000,
      oppositeRivals,
    );
    expect(same.similarity).toBe(1);
    expect(same.casualFactor).toBeGreaterThan(1);
    expect(same.hardcoreFactor).toBeLessThan(1);
    expect(diff.similarity).toBe(0);
    expect(diff.casualFactor).toBe(1);
    expect(diff.hardcoreFactor).toBe(1);
  });

  it.each(SEEDS)("seed %i", (seed) => {
    const same = playerIn(play(twin, seed, "austria", baseGenome, 20), twin, "austria");
    const diff = playerIn(play(opposite, seed, "austria", baseGenome, 20), opposite, "austria");
    expect(same.casual).toBeGreaterThan(diff.casual * 1.15);
    expect(same.hardcore / same.casual).toBeLessThan((diff.hardcore / diff.casual) * 0.8);
  });
});

describe("A country with no neighbors, language links or media reach", () => {
  // Vanuatu, cut off: no borders, a language sphere nobody else uses, and its media market is
  // below the media-reach threshold.
  const ISOLATED = "vanuatu";
  const isolated = withWorld(world, (content) => {
    for (const country of content.countries) {
      country.neighbors = country.neighbors.filter((id) => id !== ISOLATED);
      country.seaLinks = country.seaLinks.filter((id) => id !== ISOLATED);
      if (country.id === ISOLATED) {
        country.neighbors = [];
        country.seaLinks = [];
        country.languages = { primary: "vanuatu-only" };
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
    const unfocused = play(isolated, seed, "austria", baseGenome, 60);
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
  // Tuvalu: no land borders, a language sphere nobody else uses once its English secondary sphere
  // is set aside, and a media market far below the media-reach threshold. Both worlds below drop
  // that secondary sphere, so sea links are the only difference between them.
  const ISLAND = "tuvalu";
  const SEA_ANCHOR = "fiji";
  const dropSecondary = (content: {
    countries: { id: string; languages: { secondary?: string } }[];
  }) => {
    const island = content.countries.find((c) => c.id === ISLAND);
    if (island) island.languages = { ...island.languages, secondary: undefined };
  };
  const seaOnly = withWorld(world, (content) => {
    dropSecondary(content);
  });
  const noSeaLinks = withWorld(world, (content) => {
    dropSecondary(content);
    for (const country of content.countries) {
      country.seaLinks = country.seaLinks.filter((id) => id !== ISLAND);
      if (country.id === ISLAND) country.seaLinks = [];
    }
  });

  it("the island is reachable only by sea in the shipped content", () => {
    const island = world.countries[countryIndex(world, ISLAND)];
    expect(island?.neighbors).toEqual([]);
    expect(island?.seaLinks.length).toBeGreaterThan(0);
    const inbound = seaOnly.inbound[countryIndex(seaOnly, ISLAND)] ?? [];
    expect(inbound.length).toBeGreaterThan(0);
    expect(inbound.every((link) => link.proximity > 0)).toBe(true);
    expect(noSeaLinks.inbound[countryIndex(noSeaLinks, ISLAND)]).toEqual([]);
  });

  it.each(SEEDS)(
    "seed %i: fans arrive from a sea-linked anchor, and never without the link",
    (seed) => {
      const linked = play(seaOnly, seed, SEA_ANCHOR, baseGenome, 40);
      const cut = play(noSeaLinks, seed, SEA_ANCHOR, baseGenome, 40);
      expect(playerIn(linked, seaOnly, ISLAND).casual).toBeGreaterThan(100);
      expect(playerIn(cut, noSeaLinks, ISLAND)).toEqual({ casual: 0, hardcore: 0 });
    },
  );
});
