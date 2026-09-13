import { describe, expect, it } from "vitest";
import { createCampaign, endTurn, runTurns, serializeSave } from "../src/sim";
import { firstAnchor, world } from "./helpers";

const TURNS = 80;

describe("determinism", () => {
  it("the same seed and inputs produce an identical complete state", () => {
    const setup = { seed: 4471, anchorCountryId: firstAnchor };
    const a = runTurns(createCampaign(world, setup), world, TURNS);
    const b = runTurns(createCampaign(world, setup), world, TURNS);

    expect(b).toStrictEqual(a);
    expect(serializeSave(b)).toBe(serializeSave(a));
    // The horizon must include multi-quarter turns, or the turn loop is not really covered.
    expect(a.quarter).toBeGreaterThan(TURNS);
  });

  it.each(world.countries.map((country) => country.id))(
    "is deterministic from anchor %s",
    (anchor) => {
      const setup = { seed: 99, anchorCountryId: anchor };
      const a = runTurns(createCampaign(world, setup), world, 40);
      const b = runTurns(createCampaign(world, setup), world, 40);
      expect(b).toStrictEqual(a);
    },
  );

  it("different seeds diverge, so the seeded RNG really drives outcomes", () => {
    const a = runTurns(createCampaign(world, { seed: 1, anchorCountryId: firstAnchor }), world, 20);
    const b = runTurns(createCampaign(world, { seed: 2, anchorCountryId: firstAnchor }), world, 20);
    expect(b.rng).not.toStrictEqual(a.rng);
    expect(b.countries).not.toStrictEqual(a.countries);
  });

  it("ending a turn does not mutate the previous state", () => {
    const state = createCampaign(world, { seed: 7, anchorCountryId: firstAnchor });
    const before = structuredClone(state);
    endTurn(state, world);
    expect(state).toStrictEqual(before);
  });
});
