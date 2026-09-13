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

  it("resumes identically from a turn with escalated rivals, spent budgets and countermoves in effect", () => {
    const setup = setupFor(4471, firstAnchor, presetGenome("long-innings"));
    const rivalsActive = (state: GameState) =>
      state.countries.some((c) => c.countermoves.length > 0) &&
      state.countries.some((c) => c.defense.some((front) => front.level !== "none")) &&
      state.rivals.some((rival) => rival.budgetSpent > 0);
    let midway = createCampaign(world, setup);
    let saveAfter = 0;
    while (saveAfter < 150 && midway.outcome === null && !rivalsActive(midway)) {
      midway = playWithPolicy(midway, 1);
      saveAfter += 1;
    }
    expect(rivalsActive(midway)).toBe(true);

    const uninterrupted = playWithPolicy(createCampaign(world, setup), saveAfter + 40);
    const resumed = playWithPolicy(deserializeSave(serializeSave(midway), world), 40);
    expect(resumed).toStrictEqual(uninterrupted);
    expect(serializeSave(resumed)).toBe(serializeSave(uninterrupted));
    // The continuation kept the rival AI busy, so resumed rival state was really exercised.
    expect(
      uninterrupted.landmarks
        .slice(midway.landmarks.length)
        .some((l) => l.kind === "rivalCountermove"),
    ).toBe(true);
  });

  /** A saved state reduced to the version 2 shape: no leagues, tier track, outcome or history. */
  function asVersion2(state: GameState) {
    const { tierTrack: _t, outcome: _o, landmarks: _l, yearly: _y, rivals: _r, ...rest } = state;
    return {
      ...rest,
      countries: state.countries.map((country) => ({
        countryId: country.countryId,
        fans: country.fans,
      })),
    };
  }

  /** A saved state reduced to the version 3 shape: no rival state, fronts or countermoves. */
  function asVersion3(state: GameState) {
    const { rivals: _r, ...rest } = state;
    return {
      ...rest,
      countries: state.countries.map(({ defense: _d, countermoves: _c, ...country }) => country),
    };
  }

  it("migrates a version 3 save: rival genomes come from content, budgets start empty, nobody is watching", () => {
    const current = playWithPolicy(
      createCampaign(world, setupFor(8, firstAnchor, presetGenome("long-innings"))),
      70,
    );
    expect(current.landmarks.some((l) => l.kind === "rivalEscalated")).toBe(true);
    const v3 = JSON.stringify({ formatVersion: 3, state: asVersion3(current) });
    const loaded = deserializeSave(v3, world);
    expect(loaded.rivals).toStrictEqual(
      world.rivals.map((rival) => ({
        sportId: rival.id,
        genome: rival.genome,
        budget: 0,
        budgetSpent: 0,
        ruleCopyReadyQuarter: 0,
      })),
    );
    for (const country of loaded.countries) {
      expect(country.defense.map((front) => front.level)).toEqual(world.rivals.map(() => "none"));
      expect(country.countermoves).toEqual([]);
    }
    expect(loaded.countries.map((c) => c.fans)).toStrictEqual(current.countries.map((c) => c.fans));
    expect(loaded.countries.map((c) => c.league)).toStrictEqual(
      current.countries.map((c) => c.league),
    );
    expect(loaded.landmarks).toStrictEqual(current.landmarks);
    expect(loaded.tierTrack).toStrictEqual(current.tierTrack);
    expect(loaded.rng).toStrictEqual(current.rng);
    // A migrated campaign keeps playing, and re-saves in the current format.
    const later = playWithPolicy(loaded, 6);
    expect(JSON.parse(serializeSave(later)).formatVersion).toBe(SAVE_FORMAT_VERSION);
  });

  it("rejects a save with an unknown escalation level or a countermove by a sport that is not a rival", () => {
    const save = JSON.parse(serializeSave(createCampaign(world, setupFor(3))));
    save.state.countries[0].defense[0].level = "furious";
    expect(() => deserializeSave(JSON.stringify(save), world)).toThrow(
      /state\.countries\[0\]\.defense\[0\]\.level/,
    );
    const save2 = JSON.parse(serializeSave(createCampaign(world, setupFor(3))));
    save2.state.countries[0].countermoves = [
      { kind: "mediaBlitz", sportId: "curling", endQuarter: 9 },
    ];
    expect(() => deserializeSave(JSON.stringify(save2), world)).toThrow(/curling/);
  });

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

describe("saves with the growth tree (format 5)", () => {
  const setup = setupFor(4471, firstAnchor, presetGenome("long-innings"));
  const bought = (state: GameState) => state.landmarks.filter((l) => l.kind === "nodeBought");

  it("resumes identically when the bot bought nodes before the save and keeps buying after", () => {
    let midway = createCampaign(world, setup);
    let saveAfter = 0;
    while (bought(midway).length < 4 && saveAfter < 100) {
      midway = playWithPolicy(midway, 1);
      saveAfter += 1;
    }
    expect(bought(midway).length).toBeGreaterThanOrEqual(4);
    expect(new Set(bought(midway).map((l) => l.turn)).size).toBeGreaterThan(1);

    const uninterrupted = playWithPolicy(createCampaign(world, setup), saveAfter + 50);
    const resumed = playWithPolicy(deserializeSave(serializeSave(midway), world), 50);
    expect(resumed).toStrictEqual(uninterrupted);
    expect(serializeSave(resumed)).toBe(serializeSave(uninterrupted));
    expect(bought(uninterrupted).length).toBeGreaterThan(bought(midway).length);
    expect(uninterrupted.growthNodes).toStrictEqual(bought(uninterrupted).map((l) => l.nodeId));
  });

  it("migrates a version 4 save: no nodes owned, everything else kept, same key order", () => {
    const current = playWithPolicy(createCampaign(world, setup), 60);
    expect(current.growthNodes.length).toBeGreaterThan(0);
    const withoutTree: GameState = {
      ...current,
      growthNodes: [],
      landmarks: current.landmarks.filter((l) => l.kind !== "nodeBought"),
    };
    const { growthNodes: _g, ...v4State } = withoutTree;
    const loaded = deserializeSave(JSON.stringify({ formatVersion: 4, state: v4State }), world);
    expect(loaded.growthNodes).toStrictEqual([]);
    expect(serializeSave(loaded)).toBe(serializeSave(withoutTree));
    const later = playWithPolicy(loaded, 6);
    expect(JSON.parse(serializeSave(later)).formatVersion).toBe(5);
  });

  it("rejects a save with an unknown node, both sides of a fork, or a node before its prerequisite", () => {
    const base = JSON.parse(serializeSave(createCampaign(world, setupFor(3))));
    const load = (nodes: string[]) =>
      deserializeSave(
        JSON.stringify({ ...base, state: { ...base.state, growthNodes: nodes } }),
        world,
      );
    expect(() => load(["hall-of-fame"])).toThrow(/"hall-of-fame" is not in the growth tree/);
    expect(() => load(["backyard-clinics", "street-courts", "club-grounds"])).toThrow(
      /both owned in fork where-to-play/,
    );
    expect(() => load(["word-of-mouth", "backyard-clinics"])).toThrow(
      /bought before its prerequisite "backyard-clinics"/,
    );
    expect(load(["backyard-clinics", "word-of-mouth"]).growthNodes).toHaveLength(2);
  });
});
