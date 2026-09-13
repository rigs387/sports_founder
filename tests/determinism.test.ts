import { describe, expect, it } from "vitest";
import { builder, randomBot } from "../src/runner/policy";
import {
  applyAction,
  createCampaign,
  endTurn,
  type GameState,
  runTurns,
  serializeSave,
} from "../src/sim";
import { firstAnchor, presetGenome, setupFor, world } from "./helpers";

const TURNS = 80;

/** Plays turns with a bot acting before each one (legal actions only), until the end if sooner. */
function runWithPolicy(state: GameState, turns: number, bot = builder): GameState {
  let current = state;
  for (let i = 0; i < turns && current.outcome === null; i += 1) {
    current = endTurn(bot(current, world).state, world);
  }
  return current;
}

describe("determinism", () => {
  it("the same seed and inputs produce an identical complete state", () => {
    const setup = setupFor(4471);
    // A bot promotes the anchor league, so tiers rise and multi-quarter turns are reached.
    const a = runWithPolicy(createCampaign(world, setup), TURNS);
    const b = runWithPolicy(createCampaign(world, setup), TURNS);

    expect(b).toStrictEqual(a);
    expect(serializeSave(b)).toBe(serializeSave(a));
    // The horizon must include multi-quarter turns, or the turn loop is not really covered.
    expect(a.quarter).toBeGreaterThan(TURNS);
    // Spread must have happened, or cross-border code is not really covered.
    expect(a.countries.filter((c) => (c.fans[0]?.casual ?? 0) > 0).length).toBeGreaterThan(5);
  });

  it("is deterministic with focus, promotion and rescue actions (a bot acting every turn)", () => {
    const setup = setupFor(17, firstAnchor, presetGenome("street-court"));
    const a = runWithPolicy(createCampaign(world, setup), TURNS);
    const b = runWithPolicy(createCampaign(world, setup), TURNS);
    expect(b).toStrictEqual(a);
    expect(serializeSave(b)).toBe(serializeSave(a));
    expect(a.focus.length).toBeGreaterThan(1);
    expect(a.focus.filter((id) => id !== null && id !== firstAnchor).length).toBeGreaterThan(0);
    expect(a.landmarks.some((l) => l.kind === "leaguePromoted")).toBe(true);
    expect(a.yearly.length).toBe(Math.floor(a.quarter / 4));
  });

  it("is deterministic under the random bot, whose dice never touch the simulation's RNG", () => {
    const setup = setupFor(23, "oruna", presetGenome("ice-paddle"));
    const a = runWithPolicy(createCampaign(world, setup), TURNS, randomBot);
    const b = runWithPolicy(createCampaign(world, setup), TURNS, randomBot);
    expect(b).toStrictEqual(a);
  });

  it.each(world.countries.map((country) => country.id))(
    "is deterministic from anchor %s",
    (anchor) => {
      const setup = setupFor(99, anchor);
      const a = runTurns(createCampaign(world, setup), world, 40);
      const b = runTurns(createCampaign(world, setup), world, 40);
      expect(b).toStrictEqual(a);
    },
  );

  it("different seeds diverge, so the seeded RNG really drives outcomes", () => {
    const a = runTurns(createCampaign(world, setupFor(1)), world, 20);
    const b = runTurns(createCampaign(world, setupFor(2)), world, 20);
    expect(b.rng).not.toStrictEqual(a.rng);
    expect(b.countries).not.toStrictEqual(a.countries);
  });

  it("different genomes diverge with the same seed", () => {
    const a = runTurns(createCampaign(world, setupFor(1)), world, 20);
    const b = runTurns(
      createCampaign(world, setupFor(1, firstAnchor, presetGenome("ice-paddle"))),
      world,
      20,
    );
    expect(b.countries).not.toStrictEqual(a.countries);
  });

  it("ending a turn and applying an action do not mutate the previous state", () => {
    const state = { ...createCampaign(world, setupFor(7)), pp: 1000 };
    const before = structuredClone(state);
    endTurn(state, world);
    applyAction(state, world, { type: "assignFocus", slot: 0, countryId: "kestmark" });
    expect(state).toStrictEqual(before);
  });
});
