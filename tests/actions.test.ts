import { describe, expect, it } from "vitest";
import { builder } from "../src/runner/policy";
import {
  applyAction,
  checkAction,
  checkInvariants,
  computeExposure,
  createCampaign,
  endTurn,
  focusCost,
  IllegalActionError,
  runTurns,
} from "../src/sim";
import { countryIndex, firstAnchor, setupFor, world } from "./helpers";

describe("focus slot actions go through one validated function", () => {
  const start = createCampaign(world, setupFor(1));

  it("a fresh campaign has its single slot on the anchor", () => {
    expect(start.focus).toStrictEqual([firstAnchor]);
  });

  it("rejects an action without enough PP", () => {
    const poor = { ...start, pp: 0 };
    const action = { type: "assignFocus" as const, slot: 0, countryId: "czechia" };
    expect(checkAction(poor, world, action)).toMatch(/not enough PP/);
    expect(() => applyAction(poor, world, action)).toThrow(IllegalActionError);
    expect(() => applyAction(poor, world, action)).toThrow(/not enough PP/);
  });

  it("rejects a slot the current tier does not have (too many slots)", () => {
    const rich = { ...start, pp: 10_000 };
    const action = { type: "assignFocus" as const, slot: 1, countryId: "czechia" };
    expect(checkAction(rich, world, action)).toMatch(/slot 1 does not exist/);
    expect(() => applyAction(rich, world, action)).toThrow(IllegalActionError);
    expect(checkAction(rich, world, { ...action, slot: -1 })).toMatch(/does not exist/);
  });

  it("rejects an unknown country and a country that already holds a slot", () => {
    const rich = { ...start, pp: 10_000 };
    expect(
      checkAction(rich, world, { type: "assignFocus", slot: 0, countryId: "atlantis" }),
    ).toMatch(/unknown country/);
    expect(
      checkAction(rich, world, { type: "assignFocus", slot: 0, countryId: firstAnchor }),
    ).toMatch(/already has a focus slot/);
  });

  it("a legal move deducts the PP cost and moves the slot", () => {
    const rich = { ...start, pp: 10_000 };
    const cost = focusCost(rich, world, "czechia");
    const moved = applyAction(rich, world, { type: "assignFocus", slot: 0, countryId: "czechia" });
    expect(moved.focus).toStrictEqual(["czechia"]);
    expect(moved.pp).toBeCloseTo(10_000 - cost, 6);
    expect(checkInvariants(moved, world)).toEqual([]);
  });

  it("a cold launch costs more than pushing into a country with existing exposure", () => {
    // After some turns the anchor's neighbours have exposure; the country the sport has not
    // reached at all does not, and costs the full cold-launch price.
    const later = runTurns(start, world, 40);
    const exposure = computeExposure(later, world);
    const coldestIndex = exposure.reduce(
      (best, e, i) => ((exposure[best]?.organic ?? 1) <= e.organic ? best : i),
      0,
    );
    const coldId = world.countries[coldestIndex]?.id ?? "";
    const neighbourId = world.countries[countryIndex(world, firstAnchor)]?.neighbors[0] ?? "";
    const neighbour = focusCost(later, world, neighbourId);
    const island = focusCost(later, world, coldId);
    const { focus, ppTiers } = world.config;
    const multiplier = ppTiers.find((t) => t.tier === later.ppTier)?.costMultiplier ?? 1;
    // The coldest country has no exposure at all, so its push is a cold launch.
    expect(island).toBeGreaterThan(focus.coldLaunchCost * multiplier * 0.99);
    expect(island).toBeLessThanOrEqual(focus.coldLaunchCost * multiplier);
    expect(neighbour).toBeLessThan(island * 0.8);
    expect(neighbour).toBeGreaterThanOrEqual(focus.exposedCost * multiplier);
  });

  it("extra slots arrive with tier-ups and can be filled", () => {
    // Tier 2 needs a Semi-Pro anchor league, so a bot has to promote it.
    let played = start;
    for (let i = 0; i < 80 && played.ppTier < 2 && played.outcome === null; i += 1) {
      played = endTurn(builder(played, world).state, world);
    }
    const later = { ...played, pp: 10_000 };
    expect(later.ppTier).toBeGreaterThanOrEqual(2);
    expect(later.focus.length).toBeGreaterThanOrEqual(2);
    const filled = applyAction(later, world, {
      type: "assignFocus",
      slot: 1,
      countryId: "italy",
    });
    expect(filled.focus[1]).toBe("italy");
    expect(checkInvariants(filled, world)).toEqual([]);
  });
});
