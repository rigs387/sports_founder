import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { ContentValidationError } from "../src/content";
import { DEFAULT_CONTENT_DIR, loadWorldFromDisk } from "../src/runner/content-from-disk";
import { firstAnchor } from "./helpers";

type Key = string | number;
type Container = Record<Key, unknown>;

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function copyOfContent(): string {
  const dir = mkdtempSync(join(tmpdir(), "sf-content-"));
  cpSync(DEFAULT_CONTENT_DIR, dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

/** Parses a YAML file in `dir`, applies `edit` to the value's parent at `path`, writes it back. */
function editYaml(
  dir: string,
  file: string,
  path: Key[],
  edit: (parent: Container, key: Key) => void,
) {
  const fullPath = join(dir, file);
  const data: unknown = parse(readFileSync(fullPath, "utf8"));
  let parent = data as Container;
  for (const key of path.slice(0, -1)) parent = parent[key] as Container;
  const last = path[path.length - 1];
  if (last === undefined) throw new Error("empty path");
  edit(parent, last);
  writeFileSync(fullPath, stringify(data));
}

const setValue = (value: unknown) => (parent: Container, key: Key) => {
  parent[key] = value;
};
const remove = (parent: Container, key: Key) => {
  delete parent[key];
};

function loadError(dir: string): ContentValidationError {
  try {
    loadWorldFromDisk(dir);
  } catch (error) {
    if (error instanceof ContentValidationError) return error;
    throw error;
  }
  throw new Error("Expected content validation to fail, but the content loaded");
}

describe("content validation", () => {
  it("the shipped content loads", () => {
    expect(() => loadWorldFromDisk()).not.toThrow();
  });

  it("a wrong type names the file and field", () => {
    const dir = copyOfContent();
    editYaml(dir, "countries.yaml", ["countries", 0, "population"], setValue("lots"));
    const error = loadError(dir);
    expect(error.message).toContain("countries.yaml");
    expect(error.message).toContain("countries[0].population");
    expect(error.issues[0]?.field).toBe("countries[0].population");
  });

  it("a missing config value names the file and field", () => {
    const dir = copyOfContent();
    editYaml(dir, "config.yaml", ["dynamics", "player", "casualChurnRate"], remove);
    const error = loadError(dir);
    expect(error.message).toContain("config.yaml");
    expect(error.message).toContain("dynamics.player.casualChurnRate");
  });

  it("an out-of-range value names the file and field", () => {
    const dir = copyOfContent();
    editYaml(dir, "config.yaml", ["dynamics", "noise"], setValue(1.5));
    const error = loadError(dir);
    expect(error.message).toContain("config.yaml at dynamics.noise");
  });

  it("an unknown field is rejected rather than silently ignored", () => {
    const dir = copyOfContent();
    editYaml(dir, "config.yaml", ["fandomScore", "casualWieght"], setValue(0.5));
    const error = loadError(dir);
    expect(error.message).toContain("config.yaml at fandomScore");
    expect(error.message).toContain("casualWieght");
  });

  it("a reference to an unknown rival sport names the file and field", () => {
    const dir = copyOfContent();
    editYaml(
      dir,
      "countries.yaml",
      ["countries", 1, "startingRivalFans", "hockey"],
      setValue({ casual: 0.1, hardcore: 0.05 }),
    );
    const error = loadError(dir);
    expect(error.message).toContain("countries.yaml at countries[1].startingRivalFans.hockey");
  });

  it("a neighbor link to an unknown country names the file and field", () => {
    const dir = copyOfContent();
    editYaml(dir, "countries.yaml", ["countries", 0, "neighbors", 0], setValue("atlantis"));
    const error = loadError(dir);
    expect(error.message).toContain("countries.yaml at countries[0].neighbors[0]");
    expect(error.message).toContain('unknown country "atlantis"');
  });

  it("a sea link to itself and a duplicated link are rejected", () => {
    const dir = copyOfContent();
    editYaml(dir, "countries.yaml", ["countries", 0, "seaLinks"], setValue([firstAnchor]));
    expect(loadError(dir).message).toContain(
      "countries[0].seaLinks[0]: a country cannot link to itself",
    );

    const dir2 = copyOfContent();
    editYaml(dir2, "countries.yaml", ["countries", 0, "seaLinks"], setValue(["kestmark"]));
    expect(loadError(dir2).message).toMatch(
      /countries\[0\]\.seaLinks\[0\]: "kestmark" is linked more than once/,
    );
  });

  it("a genome option outside the GDD table is rejected in a preset and in a rival", () => {
    const dir = copyOfContent();
    editYaml(dir, "genome.yaml", ["presets", 0, "genome", "surface"], setValue("water"));
    expect(loadError(dir).message).toContain("genome.yaml at presets[0].genome.surface");

    const dir2 = copyOfContent();
    editYaml(dir2, "sports.yaml", ["rivals", 1, "genome", "structure"], setValue("sets"));
    expect(loadError(dir2).message).toContain("sports.yaml at rivals[1].genome.structure");
  });

  it("a missing or extra option modifier entry is rejected", () => {
    const dir = copyOfContent();
    editYaml(dir, "genome.yaml", ["options", "surface", "ice"], remove);
    expect(loadError(dir).message).toContain("genome.yaml at options.surface.ice");

    const dir2 = copyOfContent();
    editYaml(dir2, "genome.yaml", ["options", "surface", "water"], setValue({ base: {} }));
    expect(loadError(dir2).message).toContain("genome.yaml at options.surface");
  });

  it("a modifier on an unknown lever, attribute or climate is rejected", () => {
    const dir = copyOfContent();
    editYaml(dir, "genome.yaml", ["options", "surface", "ice", "base", "charm"], setValue(0.5));
    expect(loadError(dir).message).toContain("genome.yaml at options.surface.ice.base");

    const dir2 = copyOfContent();
    editYaml(
      dir2,
      "genome.yaml",
      ["options", "surface", "ice", "conditions", "affinity", "altitude"],
      setValue(0.5),
    );
    expect(loadError(dir2).message).toContain("options.surface.ice.conditions.affinity");

    const dir3 = copyOfContent();
    editYaml(
      dir3,
      "genome.yaml",
      ["options", "surface", "ice", "conditions", "affinity", "climate", "monsoon"],
      setValue(0.5),
    );
    expect(loadError(dir3).message).toContain("options.surface.ice.conditions.affinity.climate");
  });

  it("an option with no downside anywhere is flagged (every option must hurt somewhere)", () => {
    const dir = copyOfContent();
    editYaml(
      dir,
      "genome.yaml",
      ["options", "complexity", "simple"],
      setValue({ base: { accessibility: 0.2 }, conditions: { affinity: { wealth: 0 } } }),
    );
    const error = loadError(dir);
    expect(error.message).toContain("genome.yaml at options.complexity.simple");
    expect(error.message).toContain("no downside anywhere");
  });

  it("an option that never helps is flagged too", () => {
    const dir = copyOfContent();
    editYaml(
      dir,
      "genome.yaml",
      ["options", "scoring", "medium"],
      setValue({ base: { depth: -0.1 } }),
    );
    const error = loadError(dir);
    expect(error.message).toContain("genome.yaml at options.scoring.medium");
    expect(error.message).toContain("no upside anywhere");
  });

  it("hardcore shares across rivals and other sports above 1 are rejected", () => {
    const dir = copyOfContent();
    editYaml(
      dir,
      "countries.yaml",
      ["countries", 0, "startingRivalFans", "fieldball"],
      setValue({ casual: 0.0, hardcore: 0.99 }),
    );
    expect(loadError(dir).message).toContain("countries[0].startingRivalFans");
  });

  it("a missing continent in the other-sports table is rejected", () => {
    const dir = copyOfContent();
    editYaml(dir, "sports.yaml", ["otherSports", "hardcoreShareByContinent", "oceania"], remove);
    expect(loadError(dir).message).toContain("sports.yaml at otherSports.hardcoreShareByContinent");
  });

  it("a missing display name names the file and field", () => {
    const dir = copyOfContent();
    editYaml(dir, "names.yaml", ["countries", firstAnchor], remove);
    const error = loadError(dir);
    expect(error.message).toContain(`names.yaml at countries.${firstAnchor}`);
  });

  it("a YAML syntax error names the file and line", () => {
    const dir = copyOfContent();
    writeFileSync(join(dir, "names.yaml"), "countries:\n  valdoria: Valdoria\n  kestmark: [Kest\n");
    const error = loadError(dir);
    expect(error.message).toContain("names.yaml");
    expect(error.message).toMatch(/line \d+/);
  });

  it("reports problems in several files at once", () => {
    const dir = copyOfContent();
    editYaml(dir, "countries.yaml", ["countries", 0, "population"], setValue(-3));
    editYaml(dir, "config.yaml", ["ppIncome", "exponent"], setValue("steep"));
    const error = loadError(dir);
    expect(error.message).toContain("countries[0].population");
    expect(error.message).toContain("ppIncome.exponent");
  });

  it("bad league config names the file and field", () => {
    const dir = copyOfContent();
    editYaml(
      dir,
      "config.yaml",
      ["leagues", "tiers", "amateur", "promotion"],
      setValue({
        hardcoreShare: 0.001,
        minHardcore: 0,
        reserveQuarters: 1,
        costQuarters: 1,
      }),
    );
    expect(loadError(dir).message).toContain(
      "config.yaml at leagues.tiers.amateur.promotion: the lowest tier cannot be promoted into",
    );

    const dir2 = copyOfContent();
    editYaml(dir2, "config.yaml", ["leagues", "tiers", "elite", "runningCost"], setValue(0.01));
    expect(loadError(dir2).message).toContain("config.yaml at leagues.tiers.elite.runningCost");

    const dir3 = copyOfContent();
    editYaml(
      dir3,
      "config.yaml",
      ["leagues", "health", "nearCollapseRunwayQuarters"],
      setValue(99),
    );
    expect(loadError(dir3).message).toContain("leagues.health.nearCollapseRunwayQuarters");

    const dir4 = copyOfContent();
    editYaml(dir4, "config.yaml", ["leagues", "tiers", "semi-pro", "health"], setValue("fine"));
    expect(loadError(dir4).message).toContain("config.yaml at leagues.tiers.semi-pro");
  });

  it("bad PP tier breadth conditions name the file and field", () => {
    const dir = copyOfContent();
    editYaml(dir, "config.yaml", ["ppTiers", 1, "breadth"], setValue({ type: "none" }));
    expect(loadError(dir).message).toContain(
      "config.yaml at ppTiers[1].breadth: every tier above the first needs a breadth condition",
    );

    const dir2 = copyOfContent();
    editYaml(
      dir2,
      "config.yaml",
      ["ppTiers", 3, "breadth"],
      setValue({ type: "leaguesOnContinents", leagueTier: "legendary", continents: 3 }),
    );
    expect(loadError(dir2).message).toContain("config.yaml at ppTiers[3].breadth.leagueTier");

    const dir3 = copyOfContent();
    editYaml(dir3, "config.yaml", ["seasonalWindow", "quarterOfYear"], setValue(5));
    expect(loadError(dir3).message).toContain("config.yaml at seasonalWindow.quarterOfYear");
  });

  it("bad poaching, rival AI and promotion minimum config names the file and field", () => {
    const cases: [Key[], unknown, string][] = [
      [["poaching", "rate"], 1.5, "config.yaml at poaching.rate"],
      [["poaching", "floorShare"], -0.1, "config.yaml at poaching.floorShare"],
      [
        ["poaching", "defenseResistance", "entrenched"],
        1,
        "config.yaml at poaching.defenseResistance.entrenched: must not be above the defending level's",
      ],
      [
        ["poaching", "defenseResistance", "watching"],
        undefined,
        "poaching.defenseResistance.watching",
      ],
      [
        ["rivalAI", "escalation", "thresholds", "defending"],
        0.0001,
        "config.yaml at rivalAI.escalation.thresholds.defending: must be above the watching threshold",
      ],
      [
        ["rivalAI", "preference"],
        ["mediaBlitz", "youthPrograms"],
        'config.yaml at rivalAI.preference: must list every countermove; "broadcastDeal" is missing',
      ],
      [["rivalAI", "preference", 0], "bribery", "config.yaml at rivalAI.preference[0]"],
      [
        ["rivalAI", "countermoves", "broadcastDeal", "minLevel"],
        "none",
        "config.yaml at rivalAI.countermoves.broadcastDeal.minLevel",
      ],
      [
        ["rivalAI", "countermoves", "sponsorLockout", "mediaRevenueCut"],
        2,
        "config.yaml at rivalAI.countermoves.sponsorLockout.mediaRevenueCut",
      ],
      [
        ["rivalAI", "countermoves", "hostileTakeover"],
        { minLevel: "watching" },
        "config.yaml at rivalAI.countermoves",
      ],
      [["rivalAI", "nearTop", "startRatio"], 1, "config.yaml at rivalAI.nearTop.startRatio"],
      [
        ["leagues", "tiers", "elite", "promotion", "minHardcore"],
        10,
        "config.yaml at leagues.tiers.elite.promotion.minHardcore: must not be lower than the professional tier's",
      ],
    ];
    for (const [path, value, expected] of cases) {
      const dir = copyOfContent();
      editYaml(dir, "config.yaml", path, value === undefined ? remove : setValue(value));
      expect(loadError(dir).message, path.join(".")).toContain(expected);
    }
  });

  it("a missing file is named", () => {
    const dir = copyOfContent();
    rmSync(join(dir, "genome.yaml"));
    const error = loadError(dir);
    expect(error.message).toContain("genome.yaml");
    expect(error.message).toContain("could not be read");
  });
});
