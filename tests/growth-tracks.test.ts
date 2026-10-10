import { describe, expect, it } from "vitest";
import {
  applyAction,
  clubTarget,
  createCampaign,
  deserializeSave,
  type GameState,
  leverMultipliers,
  PLAYER_INDEX,
  serializeSave,
  shapeFactors,
  updateCulture,
} from "../src/sim";
import { clubIds, fresh, ofType, withSeason } from "./culture-helpers";
import { countryIndex, setupFor, world } from "./helpers";

// Growth tracks (GDD v1.35, topic 5): four tracks of 12 levels with forks at 4, 8 and 12, and the
// fork sides that shape the sport.

describe("the tracks", () => {
  it("are four tracks of 12 levels, a fork of two sides at levels 4, 8 and 12", () => {
    const { categories, nodes, forks } = world.growthTree;
    expect(Object.keys(categories).sort()).toEqual(
      ["culture", "grassroots", "institutions", "media"].sort(),
    );
    expect(categories.institutions?.unlockTier).toBe(3);
    expect(categories.culture?.unlockTier).toBe(3);
    for (const track of Object.keys(categories)) {
      const levels = nodes.filter((n) => n.category === track);
      for (let level = 1; level <= 12; level += 1) {
        const at = levels.filter((n) => n.level === level);
        expect(at).toHaveLength(level % 4 === 0 ? 2 : 1);
        if (level % 4 === 0)
          expect(forks.some((f) => at.every((n) => f.nodes.includes(n.id)))).toBe(true);
      }
    }
  });
});

describe("shaping the sport", () => {
  it("indoor halls make climate count half as much in the sport's fit", () => {
    const state = createCampaign(world, setupFor(4, "brazil"));
    const shape = shapeFactors(world, ["indoor-halls"]);
    expect(shape.climateFit).toBeCloseTo(0.5);
    // Some country's fit moves with the climate weight; none moves without climate deltas.
    const moved = world.countries.some((_, i) => {
      const plain = leverMultipliers(world, state.genome, i);
      const halls = leverMultipliers(world, state.genome, i, shape.climateFit);
      return plain.affinity !== halls.affinity || plain.depth !== halls.depth;
    });
    expect(moved).toBe(true);
  });

  it("expansion adds flagship clubs; a compact league removes them", () => {
    expect(clubTarget("elite", world, shapeFactors(world, ["expansion"]))).toBe(22);
    expect(clubTarget("elite", world, shapeFactors(world, ["compact-league"]))).toBe(18);
    expect(clubTarget("elite", world)).toBe(20);
  });

  it("broadcast breaks cost the anchor's purists once, at purchase", () => {
    const base = createCampaign(world, setupFor(4, "brazil"));
    const anchor = countryIndex(world, base.anchorCountryId);
    const media = [
      "backyard-clinics",
      "local-radio",
      "highlight-reels",
      "newspaper-columns",
      "free-to-air",
      "match-programs",
      "dubbed-broadcasts",
      "star-profiles",
    ];
    const ready: GameState = {
      ...base,
      ppTier: 2,
      pp: 1e6,
      growthNodes: media,
      countries: base.countries.map((country, i) =>
        i === anchor
          ? {
              ...country,
              fans: country.fans.map((f, s) =>
                s === PLAYER_INDEX ? { ...f, hardcore: 100_000 } : f,
              ),
            }
          : country,
      ),
    };
    const bought = applyAction(ready, world, { type: "buyNode", nodeId: "broadcast-breaks" });
    const fans = (s: GameState) => s.countries[anchor]?.fans[PLAYER_INDEX];
    expect(fans(bought)?.hardcore).toBe(97_000);
    expect((fans(bought)?.casual ?? 0) - (fans(ready)?.casual ?? 0)).toBe(3_000);
  });

  it("club-driven coverage and a compact league make derbies come sooner", () => {
    const base = fresh();
    const [, a = 0, b = 0] = clubIds(base);
    const twice = (state: GameState) =>
      updateCulture(withSeason(updateCulture(withSeason(state, a, b), world), a, b), world);
    expect(ofType(twice(base), "derby")).toEqual([]);
    expect(
      ofType(twice({ ...base, growthNodes: ["club-coverage", "compact-league"] }), "derby"),
    ).toHaveLength(1);
  });
});

describe("saves", () => {
  it("a format 25 save keeps old nodes the tracks still have, while their rules hold", () => {
    const base = JSON.parse(serializeSave(createCampaign(world, setupFor(3))));
    const old = {
      formatVersion: 25,
      state: {
        ...base.state,
        // The old tree let word-of-mouth follow backyard-clinics; the tracks put weekend-leagues
        // between them, so word-of-mouth goes, as do the old tree's nodes.
        growthNodes: ["backyard-clinics", "word-of-mouth", "pay-tv-exclusivity", "local-radio"],
      },
    };
    const loaded = deserializeSave(JSON.stringify(old), world);
    expect(loaded.growthNodes).toEqual(["backyard-clinics", "local-radio"]);
  });
});
