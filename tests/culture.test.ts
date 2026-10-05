import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_FILES, type ContentSources, loadWorld } from "../src/content";
import { DEFAULT_CONTENT_DIR } from "../src/runner/content-from-disk";
import {
  clubGround,
  createCampaign,
  cultureProblems,
  deserializeSave,
  endTurn,
  serializeSave,
} from "../src/sim";
import { setupFor, world } from "./helpers";

// Culture, first build (GDD v1.22).

function sourcesWith(file: keyof typeof CONTENT_FILES, edit: (text: string) => string) {
  const sources = Object.fromEntries(
    Object.entries(CONTENT_FILES).map(([key, name]) => [
      key,
      { path: name, text: readFileSync(join(DEFAULT_CONTENT_DIR, name), "utf8") },
    ]),
  ) as ContentSources;
  const source = sources[file];
  return { ...sources, [file]: { ...source, text: edit(source.text) } };
}

describe("content", () => {
  it("keeps founding character balanced: a birthplace that only helps is rejected", () => {
    expect(() =>
      loadWorld(
        sourcesWith("identity", (text) =>
          text.replace(
            "schoolyard: { derby: 0.85, rite: 0.9, legacy: 1.3, nationalName: 1.1, venue: 0.9, trophy: 1 }",
            "schoolyard: { derby: 1.5, rite: 1.5, legacy: 1.5, nationalName: 1.5, venue: 1.5, trophy: 1.5 }",
          ),
        ),
      ),
    ).toThrow(/culture\.birthplaces\.schoolyard.*geometric mean/);
  });

  it("needs a rite pool for every birthplace and Culture effects only on Culture nodes", () => {
    expect(() =>
      loadWorld(sourcesWith("names", (text) => text.replace(/\n {4}docks: \[the Lantern.*\]/, ""))),
    ).toThrow(/traditions\.rites\.docks/);
    expect(() =>
      loadWorld(
        sourcesWith("growthTree", (text) =>
          text.replace("type: churnReduction", "type: traditionHold"),
        ),
      ),
    ).toThrow(/traditionHold belongs to Culture nodes only/);
  });
});

describe("state and saves", () => {
  it("starts a campaign with no traditions, counting facts from the first season", () => {
    const state = createCampaign(world, setupFor(7));
    expect(state.culture.traditions).toEqual([]);
    expect(state.culture.startSeason).toBe(1);
    expect(cultureProblems(state, world)).toEqual([]);
  });

  it("migrates a version 17 save with no traditions and no retroactive history", () => {
    let state = createCampaign(world, setupFor(7));
    for (let i = 0; i < 12; i += 1) state = endTurn(state, world);
    const { culture: _c, ...v17 } = state;
    const loaded = deserializeSave(JSON.stringify({ formatVersion: 17, state: v17 }), world);
    expect(loaded.culture.traditions).toEqual([]);
    expect(loaded.culture.startSeason).toBe(state.flagship.season);
    expect(loaded.culture.landmarkCursor).toBe(state.landmarks.length);
    expect(deserializeSave(serializeSave(loaded), world)).toEqual(loaded);
  });

  it("names every club's ground from the club itself; the founding club keeps its own", () => {
    const state = createCampaign(world, setupFor(7));
    const founding = state.flagship.clubs.find((c) => c.id === state.identity.foundingClubId);
    const other = state.flagship.clubs.find((c) => c.id !== state.identity.foundingClubId);
    if (!founding || !other) throw new Error("no clubs");
    expect(clubGround(founding, state.identity, world)).toBe(state.identity.groundName);
    const ground = clubGround(other, state.identity, world);
    expect(ground.startsWith(other.place)).toBe(true);
    expect(clubGround(other, state.identity, world)).toBe(ground);
  });
});
