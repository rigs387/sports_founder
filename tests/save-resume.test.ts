import { describe, expect, it } from "vitest";
import {
  createCampaign,
  deserializeSave,
  runTurns,
  SAVE_FORMAT_VERSION,
  SaveError,
  serializeSave,
} from "../src/sim";
import { firstAnchor, world } from "./helpers";

const TOTAL_TURNS = 90;

describe("save and resume", () => {
  it.each([
    [1, 37],
    [17, 5],
    [4471, 61],
  ])("seed %i saved after turn %i and resumed matches an uninterrupted run", (seed, saveAfter) => {
    const setup = { seed, anchorCountryId: firstAnchor };

    const uninterrupted = runTurns(createCampaign(world, setup), world, TOTAL_TURNS);

    const midway = runTurns(createCampaign(world, setup), world, saveAfter);
    const saveText = serializeSave(midway);
    const resumed = runTurns(deserializeSave(saveText, world), world, TOTAL_TURNS - saveAfter);

    expect(resumed).toStrictEqual(uninterrupted);
    expect(serializeSave(resumed)).toBe(serializeSave(uninterrupted));
  });

  it("a loaded save re-serializes byte-identically, including RNG state", () => {
    const state = runTurns(
      createCampaign(world, { seed: 3, anchorCountryId: firstAnchor }),
      world,
      25,
    );
    const text = serializeSave(state);
    const loaded = deserializeSave(text, world);
    expect(loaded.rng).toStrictEqual(state.rng);
    expect(serializeSave(loaded)).toBe(text);
  });

  it("every save records its format version", () => {
    const text = serializeSave(createCampaign(world, { seed: 3, anchorCountryId: firstAnchor }));
    expect(JSON.parse(text).formatVersion).toBe(SAVE_FORMAT_VERSION);
  });

  it("rejects a save from an unknown format version", () => {
    const text = serializeSave(createCampaign(world, { seed: 3, anchorCountryId: firstAnchor }));
    const future = JSON.stringify({ ...JSON.parse(text), formatVersion: SAVE_FORMAT_VERSION + 1 });
    expect(() => deserializeSave(future, world)).toThrow(SaveError);
    expect(() => deserializeSave(future, world)).toThrow(/format version 2/);
  });

  it("rejects a corrupted save and names the bad field", () => {
    const save = JSON.parse(
      serializeSave(createCampaign(world, { seed: 3, anchorCountryId: firstAnchor })),
    );
    save.state.countries[0].fans[1].casual = -5;
    expect(() => deserializeSave(JSON.stringify(save), world)).toThrow(
      /state\.countries\[0\]\.fans\[1\]\.casual/,
    );
  });

  it("rejects a save that does not match the current content", () => {
    const text = serializeSave(createCampaign(world, { seed: 3, anchorCountryId: firstAnchor }));
    const reordered = { ...world, countries: [...world.countries].reverse() };
    expect(() => deserializeSave(text, reordered)).toThrow(/does not fit the current game content/);
  });
});
