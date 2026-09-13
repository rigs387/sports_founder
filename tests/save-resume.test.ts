import { describe, expect, it } from "vitest";
import { greedySpread } from "../src/runner/policy";
import {
  applyAction,
  createCampaign,
  defaultGenome,
  deserializeSave,
  endTurn,
  type GameState,
  runTurns,
  SAVE_FORMAT_VERSION,
  SaveError,
  serializeSave,
} from "../src/sim";
import { firstAnchor, presetGenome, setupFor, world } from "./helpers";

const TOTAL_TURNS = 90;

function playWithPolicy(state: GameState, turns: number): GameState {
  let current = state;
  for (let i = 0; i < turns; i += 1) current = endTurn(greedySpread(current, world).state, world);
  return current;
}

describe("save and resume", () => {
  it.each([
    [1, 37],
    [17, 5],
    [4471, 61],
  ])("seed %i saved after turn %i and resumed matches an uninterrupted run", (seed, saveAfter) => {
    const setup = setupFor(seed, firstAnchor, presetGenome("long-innings"));

    const uninterrupted = playWithPolicy(createCampaign(world, setup), TOTAL_TURNS);

    const midway = playWithPolicy(createCampaign(world, setup), saveAfter);
    const saveText = serializeSave(midway);
    const resumed = playWithPolicy(deserializeSave(saveText, world), TOTAL_TURNS - saveAfter);

    expect(resumed).toStrictEqual(uninterrupted);
    expect(serializeSave(resumed)).toBe(serializeSave(uninterrupted));
    // The save must have carried real genome, focus, and spread state.
    expect(midway.genome).toStrictEqual(setup.genome);
    expect(midway.focus.length).toBeGreaterThanOrEqual(1);
    expect(
      uninterrupted.countries.filter((c) => (c.fans[0]?.casual ?? 0) > 0).length,
    ).toBeGreaterThan(3);
  });

  it("a loaded save re-serializes byte-identically, including RNG, genome and focus", () => {
    let state = runTurns(createCampaign(world, setupFor(3)), world, 25);
    state = applyAction({ ...state, pp: 500 }, world, {
      type: "assignFocus",
      slot: 0,
      countryId: "kestmark",
    });
    const text = serializeSave(state);
    const loaded = deserializeSave(text, world);
    expect(loaded.rng).toStrictEqual(state.rng);
    expect(loaded.genome).toStrictEqual(state.genome);
    expect(loaded.focus[0]).toBe("kestmark");
    expect(loaded.focus).toStrictEqual(state.focus);
    expect(serializeSave(loaded)).toBe(text);
  });

  it("every save records its format version", () => {
    const text = serializeSave(createCampaign(world, setupFor(3)));
    expect(JSON.parse(text).formatVersion).toBe(SAVE_FORMAT_VERSION);
  });

  it("migrates a version 1 save (no genome, no focus) to the current format", () => {
    const current = runTurns(createCampaign(world, setupFor(5)), world, 10);
    const { genome: _genome, focus: _focus, ...v1State } = current;
    const v1 = JSON.stringify({ formatVersion: 1, state: v1State });
    const loaded = deserializeSave(v1, world);
    expect(loaded.genome).toStrictEqual(defaultGenome(world));
    expect(loaded.focus).toStrictEqual([firstAnchor]);
    expect(loaded.countries).toStrictEqual(current.countries);
    expect(loaded.rng).toStrictEqual(current.rng);
  });

  it("rejects a save from a newer format version", () => {
    const text = serializeSave(createCampaign(world, setupFor(3)));
    const future = JSON.stringify({ ...JSON.parse(text), formatVersion: SAVE_FORMAT_VERSION + 1 });
    expect(() => deserializeSave(future, world)).toThrow(SaveError);
    expect(() => deserializeSave(future, world)).toThrow(/format version 3/);
  });

  it("rejects a corrupted save and names the bad field", () => {
    const save = JSON.parse(serializeSave(createCampaign(world, setupFor(3))));
    save.state.countries[0].fans[1].casual = -5;
    expect(() => deserializeSave(JSON.stringify(save), world)).toThrow(
      /state\.countries\[0\]\.fans\[1\]\.casual/,
    );
  });

  it("rejects a save with an invalid genome option", () => {
    const save = JSON.parse(serializeSave(createCampaign(world, setupFor(3))));
    save.state.genome.surface = "water";
    expect(() => deserializeSave(JSON.stringify(save), world)).toThrow(/state\.genome\.surface/);
  });

  it("rejects a save whose focus does not fit the tier or content", () => {
    const save = JSON.parse(serializeSave(createCampaign(world, setupFor(3))));
    save.state.focus = ["atlantis"];
    expect(() => deserializeSave(JSON.stringify(save), world)).toThrow(/atlantis/);
    save.state.focus = [firstAnchor, firstAnchor];
    expect(() => deserializeSave(JSON.stringify(save), world)).toThrow(/focus slot/);
  });

  it("rejects a save that does not match the current content", () => {
    const text = serializeSave(createCampaign(world, setupFor(3)));
    const reordered = { ...world, countries: [...world.countries].reverse() };
    expect(() => deserializeSave(text, reordered)).toThrow(/does not fit the current game content/);
  });
});
