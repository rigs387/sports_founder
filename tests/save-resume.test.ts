import { describe, expect, it } from "vitest";
import { builder } from "../src/runner/policy";
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

/** Plays turns with the builder bot acting first (legal actions only), until the end if sooner. */
function playWithPolicy(state: GameState, turns: number): GameState {
  let current = state;
  for (let i = 0; i < turns && current.outcome === null; i += 1) {
    current = endTurn(builder(current, world).state, world);
  }
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
    // The save must have carried real genome, focus, spread, league and history state.
    expect(midway.genome).toStrictEqual(setup.genome);
    expect(midway.focus.length).toBeGreaterThanOrEqual(1);
    expect(
      uninterrupted.countries.filter((c) => (c.fans[0]?.casual ?? 0) > 0).length,
    ).toBeGreaterThan(3);
    expect(uninterrupted.countries.filter((c) => c.league !== null).length).toBeGreaterThan(1);
    expect(uninterrupted.landmarks.length).toBeGreaterThan(2);
    expect(uninterrupted.yearly.length).toBeGreaterThan(10);
    expect(uninterrupted.ppTier).toBeGreaterThan(1);
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

  /** A saved state reduced to the version 2 shape: no leagues, tier track, outcome or history. */
  function asVersion2(state: GameState) {
    const { tierTrack: _t, outcome: _o, landmarks: _l, yearly: _y, ...rest } = state;
    return {
      ...rest,
      countries: state.countries.map((country) => ({
        countryId: country.countryId,
        fans: country.fans,
      })),
    };
  }

  it("migrates a version 1 save (no genome, no focus, no leagues) to the current format", () => {
    const current = runTurns(createCampaign(world, setupFor(5)), world, 10);
    const { genome: _genome, focus: _focus, ...v1State } = asVersion2(current);
    const v1 = JSON.stringify({ formatVersion: 1, state: v1State });
    const loaded = deserializeSave(v1, world);
    expect(loaded.genome).toStrictEqual(defaultGenome(world));
    expect(loaded.focus).toStrictEqual([firstAnchor]);
    expect(loaded.countries.map((c) => c.fans)).toStrictEqual(current.countries.map((c) => c.fans));
    expect(loaded.rng).toStrictEqual(current.rng);
  });

  it("migrates a version 2 save: the anchor gets its founding league, history starts empty", () => {
    const current = runTurns(createCampaign(world, setupFor(6)), world, 12);
    const v2 = JSON.stringify({ formatVersion: 2, state: asVersion2(current) });
    const loaded = deserializeSave(v2, world);
    expect(loaded.genome).toStrictEqual(current.genome);
    expect(loaded.focus).toStrictEqual(current.focus);
    expect(loaded.countries.map((c) => c.fans)).toStrictEqual(current.countries.map((c) => c.fans));
    const anchor = loaded.countries.find((c) => c.countryId === firstAnchor);
    expect(anchor?.league).toMatchObject({ tier: "amateur", health: "healthy" });
    expect(loaded.countries.filter((c) => c.league !== null)).toHaveLength(1);
    expect(loaded.outcome).toBeNull();
    expect(loaded.landmarks).toEqual([]);
    expect(loaded.yearly).toEqual([]);
    // A migrated campaign keeps playing.
    expect(() => runTurns(loaded, world, 4)).not.toThrow();
  });

  it("rejects a save from a newer format version", () => {
    const text = serializeSave(createCampaign(world, setupFor(3)));
    const future = JSON.stringify({ ...JSON.parse(text), formatVersion: SAVE_FORMAT_VERSION + 1 });
    expect(() => deserializeSave(future, world)).toThrow(SaveError);
    expect(() => deserializeSave(future, world)).toThrow(
      new RegExp(`format version ${SAVE_FORMAT_VERSION + 1}`),
    );
  });

  it("rejects a save whose league is invalid, naming the field", () => {
    const save = JSON.parse(serializeSave(createCampaign(world, setupFor(3))));
    save.state.countries[0].league.health = "thriving";
    expect(() => deserializeSave(JSON.stringify(save), world)).toThrow(
      /state\.countries\[0\]\.league\.health/,
    );
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
