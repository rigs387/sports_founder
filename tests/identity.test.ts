import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_FILES, type ContentSources, loadWorld } from "../src/content";
import { DEFAULT_CONTENT_DIR } from "../src/runner/content-from-disk";
import {
  createCampaign,
  defaultIdentitySetup,
  deserializeSave,
  type GameState,
  type IdentitySetup,
  oddPairings,
  serializeSave,
  snapshot,
  stepQuarter,
  suggestSportName,
} from "../src/sim";
import { presetGenome, setupFor, world } from "./helpers";

// Sport identity (GDD v1.18, tech plan 2.8 step 1).

const brazil = (identity?: IdentitySetup) => ({ ...setupFor(7, "brazil"), identity });

function custom(): IdentitySetup {
  const defaults = defaultIdentitySetup(world, 7, "brazil");
  return {
    ...defaults,
    sportName: "  Kettle   Run ",
    foundingPlace: world.places.brazil?.[3]?.name ?? "",
    clubName: "Pioneers",
    groundName: "The Old Yard",
    birthplace: "docks",
    ethos: "rebel-game",
    terms: { score: "goal", match: "fixture", season: "campaign" },
    emblem: { shape: "pennant", icon: "bolt", primary: "crimson", secondary: "gold" },
  };
}

describe("identity defaults", () => {
  it("come from the seed, fit the content, and change with the seed", () => {
    const a = defaultIdentitySetup(world, 7, "brazil");
    expect(defaultIdentitySetup(world, 7, "brazil")).toEqual(a);
    expect(a.foundingPlace).toBe(world.places.brazil?.[0]?.name);
    expect(a.groundName.startsWith(a.foundingPlace)).toBe(true);
    expect(a.emblem.primary).not.toBe(a.emblem.secondary);
    expect(a.terms).toEqual({ score: "score", match: "match", season: "season" });
    const names = new Set(Array.from({ length: 12 }, (_, seed) => suggestSportName(world, seed)));
    expect(names.size).toBeGreaterThan(6);
    // A re-roll gives another name for the same seed.
    expect(suggestSportName(world, 7, 1)).not.toBe(suggestSportName(world, 7, 0));
  });
});

describe("founding the sport", () => {
  it("bases the founding club in the chosen place under the chosen name", () => {
    const state = createCampaign(world, brazil(custom()));
    const club = state.flagship.clubs.find((c) => c.id === state.identity.foundingClubId);
    expect(club).toMatchObject({
      countryId: "brazil",
      place: custom().foundingPlace,
      nickname: "Pioneers",
    });
    expect(state.identity).toMatchObject({
      sportName: "Kettle Run",
      groundName: "The Old Yard",
      birthplace: "docks",
      ethos: "rebel-game",
      terms: { score: "goal", match: "fixture", season: "campaign" },
    });
  });

  it("rejects a place outside the anchor, bad names, unknown ids and matching colors", () => {
    const bad = (edit: Partial<IdentitySetup>) => () =>
      createCampaign(world, brazil({ ...custom(), ...edit }));
    expect(bad({ foundingPlace: "Paris" })).toThrow(/not a place in brazil/);
    expect(bad({ sportName: "x" })).toThrow(/sportName must be/);
    expect(bad({ clubName: "A".repeat(40) })).toThrow(/clubName must be/);
    expect(bad({ birthplace: "moon" })).toThrow(/unknown birthplace/);
    expect(bad({ terms: { score: "slam", match: "match", season: "season" } })).toThrow(
      /unknown score term/,
    );
    expect(
      bad({ emblem: { shape: "shield", icon: "star", primary: "navy", secondary: "navy" } }),
    ).toThrow(/two colors must differ/);
  });

  it("renames another club that would share the founding club's place and name", () => {
    const plain = createCampaign(world, setupFor(7, "brazil"));
    const founding = plain.identity.foundingClubId;
    const other = plain.flagship.clubs.find((c) => c.countryId === "brazil" && c.id !== founding);
    if (!other) throw new Error("No second club");
    const state = createCampaign(
      world,
      brazil({ ...custom(), foundingPlace: other.place, clubName: other.nickname }),
    );
    const same = state.flagship.clubs.filter(
      (c) => c.active && c.place === other.place && c.nickname === other.nickname,
    );
    expect(same.map((c) => c.id)).toEqual([founding]);
  });

  it("never changes the world or the flagship's matches", () => {
    let plain: GameState = createCampaign(world, setupFor(7, "brazil"));
    let named: GameState = createCampaign(world, brazil(custom()));
    for (let q = 0; q < 12; q += 1) {
      plain = stepQuarter(plain, world);
      named = stepQuarter(named, world);
    }
    expect(named.countries).toEqual(plain.countries);
    expect(named.rng).toEqual(plain.rng);
    expect(named.flagship.seasons.map((s) => s.championId)).toEqual(
      plain.flagship.seasons.map((s) => s.championId),
    );
    expect(named.flagship.table).toEqual(plain.flagship.table);
  });
});

describe("the identity snapshot", () => {
  it("resolves emblem colors and lists odd trait pairings", () => {
    const genome = {
      ...presetGenome(world.genome.presets[0]?.id ?? ""),
      surface: "ice",
      structure: "innings",
    } as const;
    const state = createCampaign(world, { ...brazil(custom()), genome });
    const view = snapshot(state, world).identity;
    expect(view.colors).toEqual({
      primary: world.identity.emblem.colors.crimson,
      secondary: world.identity.emblem.colors.gold,
    });
    expect(view.oddPairings[0]).toBe("ice-innings");
    expect(view.oddPairings.length).toBeLessThanOrEqual(world.identity.maxOddLines);
    expect(
      oddPairings({ ...genome, surface: "grass", structure: "continuous" }, world),
    ).not.toContain("ice-innings");
    expect(view.foundedYear).toBe(world.config.calendar.startYear);
  });
});

describe("saves", () => {
  it("round-trip the identity", () => {
    const state = createCampaign(world, brazil(custom()));
    expect(deserializeSave(serializeSave(state), world)).toEqual(state);
  });

  it("migrate a version 15 save to the seed's defaults, the oldest club founding the sport", () => {
    const state = createCampaign(world, setupFor(7, "brazil"));
    const { identity: _i, ...v15 } = state;
    const loaded = deserializeSave(JSON.stringify({ formatVersion: 15, state: v15 }), world);
    expect(serializeSave(loaded)).toBe(serializeSave(state));
  });
});

describe("content", () => {
  function sourcesWith(identityText: string): ContentSources {
    const sources = Object.fromEntries(
      Object.entries(CONTENT_FILES).map(([key, file]) => [
        key,
        { path: file, text: readFileSync(join(DEFAULT_CONTENT_DIR, file), "utf8") },
      ]),
    ) as ContentSources;
    return { ...sources, identity: { path: "identity.yaml", text: identityText } };
  }
  const text = readFileSync(join(DEFAULT_CONTENT_DIR, "identity.yaml"), "utf8");

  it("rejects an odd pairing on an unknown option", () => {
    expect(() =>
      loadWorld(
        sourcesWith(text.replace("{ surface: ice, structure: innings }", "{ surface: lava }")),
      ),
    ).toThrow(/unknown option "lava"/);
  });
});
