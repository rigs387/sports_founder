import { describe, expect, it } from "vitest";
import type { World } from "../src/content";
import { createCampaign, runTurns, type SportTotals, snapshot } from "../src/sim";
import { firstAnchor, withConfig, world } from "./helpers";

// Tests a promise through its consequences: with seed and anchor held constant, changing one
// config value must move outcomes in the intended direction, for every seed, by a real margin.

const SEEDS = [1, 2, 3, 4, 5, 6];
const TURNS = 40;

function playerAfterCampaign(w: World, seed: number): SportTotals {
  const state = runTurns(createCampaign(w, { seed, anchorCountryId: firstAnchor }), w, TURNS);
  const player = snapshot(state, w).sports.find((sport) => sport.kind === "player");
  if (!player) throw new Error("no player sport");
  return player;
}

describe("config changes move outcomes in the expected direction", () => {
  it("doubling the player's hardcore conversion rate yields clearly more hardcore fans", () => {
    const boosted = withConfig(world, (config) => {
      config.dynamics.player.hardcoreConversionRate *= 2;
    });
    for (const seed of SEEDS) {
      const base = playerAfterCampaign(world, seed);
      const high = playerAfterCampaign(boosted, seed);
      expect(base.hardcore, `seed ${seed}`).toBeGreaterThan(0);
      expect(high.hardcore, `seed ${seed}`).toBeGreaterThan(base.hardcore * 1.3);
    }
  });

  it("raising the player's casual churn rate yields clearly fewer casual fans", () => {
    const churny = withConfig(world, (config) => {
      config.dynamics.player.casualChurnRate *= 2;
    });
    for (const seed of SEEDS) {
      const base = playerAfterCampaign(world, seed);
      const high = playerAfterCampaign(churny, seed);
      expect(high.casual, `seed ${seed}`).toBeLessThan(base.casual * 0.8);
    }
  });

  it("changing only the casual weight changes the Fandom Score but not the fan counts at turn 1", () => {
    const heavier = withConfig(world, (config) => {
      config.fandomScore.casualWeight = 0.6;
    });
    const setup = { seed: 1, anchorCountryId: firstAnchor };
    const base = snapshot(createCampaign(world, setup), world).sports[0];
    const heavy = snapshot(createCampaign(heavier, setup), heavier).sports[0];
    expect(heavy?.casual).toBe(base?.casual);
    expect(heavy?.fandomScore).toBeGreaterThan(base?.fandomScore ?? Number.POSITIVE_INFINITY);
  });
});
