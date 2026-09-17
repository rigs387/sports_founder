import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { ContentValidationError } from "../src/content";
import { DEFAULT_CONTENT_DIR, loadWorldFromDisk } from "../src/runner/content-from-disk";
import { firstAnchor, world } from "./helpers";

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
    const neighbour = world.countries[0]?.neighbors[0] ?? "";
    editYaml(dir2, "countries.yaml", ["countries", 0, "seaLinks"], setValue([neighbour]));
    expect(loadError(dir2).message).toMatch(
      new RegExp(`countries\\[0\\]\\.seaLinks\\[0\\]: "${neighbour}" is linked more than once`),
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

  it("an option that hurts in too few real countries is flagged (no universal best option)", () => {
    const dir = copyOfContent();
    editYaml(
      dir,
      "genome.yaml",
      ["options", "complexity", "simple"],
      setValue({ base: { accessibility: 0.2 }, conditions: { affinity: { wealth: 0 } } }),
    );
    const error = loadError(dir);
    expect(error.message).toContain("genome.yaml at options.complexity.simple");
    expect(error.message).toContain(`hurts in only 0 of ${world.countries.length} countries`);
  });

  it("an option that helps in too few real countries is flagged too", () => {
    const dir = copyOfContent();
    editYaml(
      dir,
      "genome.yaml",
      ["options", "scoring", "medium"],
      setValue({ base: { depth: -0.1 } }),
    );
    const error = loadError(dir);
    expect(error.message).toContain("genome.yaml at options.scoring.medium");
    expect(error.message).toContain(`helps in only 0 of ${world.countries.length} countries`);
  });

  it("hardcore shares across rivals and other sports above 1 are rejected", () => {
    const dir = copyOfContent();
    editYaml(
      dir,
      "countries.yaml",
      ["countries", 0, "startingRivalFans", "soccer"],
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
    writeFileSync(join(dir, "names.yaml"), "countries:\n  valdoria: Austria\n  kestmark: [Kest\n");
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

describe("growth tree content validation", () => {
  // Node order in the shipped growth-tree.yaml: 0 backyard-clinics, 1 word-of-mouth,
  // 2 weekend-leagues, ..., 10 local-radio.
  const TREE = "growth-tree.yaml";

  it("an unknown effect names the file and field and lists the vocabulary", () => {
    const dir = copyOfContent();
    editYaml(dir, TREE, ["nodes", 0, "effects", 0, "type"], setValue("fanDiscount"));
    const error = loadError(dir);
    expect(error.message).toContain("growth-tree.yaml at nodes[0].effects[0].type");
    expect(error.message).toContain('unknown node effect "fanDiscount"');
    expect(error.message).toContain("casualConversion");
  });

  it("a GDD effect the simulation cannot apply yet is rejected with that reason", () => {
    const dir = copyOfContent();
    editYaml(dir, TREE, ["nodes", 0, "effects", 0, "type"], setValue("backlashResistance"));
    expect(loadError(dir).message).toContain("cannot apply it yet");
  });

  it("a prerequisite that does not exist names the node and field", () => {
    const dir = copyOfContent();
    editYaml(dir, TREE, ["nodes", 1, "requires", 0], setValue("ghost-node"));
    expect(loadError(dir).message).toContain(
      'growth-tree.yaml at nodes[1].requires[0]: unknown node "ghost-node"',
    );
  });

  it("cyclic prerequisites are rejected, showing the cycle", () => {
    const dir = copyOfContent();
    editYaml(dir, TREE, ["nodes", 0, "requires"], setValue(["weekend-leagues"]));
    const error = loadError(dir);
    expect(error.message).toContain("growth-tree.yaml at nodes[");
    expect(error.message).toMatch(/cyclic prerequisites: .*backyard-clinics.*weekend-leagues/);
  });

  it("a fork pointing at a missing node names the fork and field", () => {
    const dir = copyOfContent();
    editYaml(dir, TREE, ["forks", 0, "nodes", 1], setValue("ghost-node"));
    expect(loadError(dir).message).toContain(
      'growth-tree.yaml at forks[0].nodes[1]: unknown node "ghost-node"',
    );
  });

  it("a fork whose node requires its sibling, or that spans categories, is rejected", () => {
    const dir = copyOfContent();
    editYaml(dir, TREE, ["forks", 0, "nodes"], setValue(["backyard-clinics", "word-of-mouth"]));
    expect(loadError(dir).message).toContain('"word-of-mouth" requires "backyard-clinics"');

    const dir2 = copyOfContent();
    editYaml(dir2, TREE, ["forks", 0, "nodes"], setValue(["street-courts", "local-radio"]));
    expect(loadError(dir2).message).toContain(
      "forks[0].nodes: a fork's nodes must share one category",
    );
  });

  it("a prerequisite in another category and a spread effect without a channel are rejected", () => {
    const dir = copyOfContent();
    editYaml(dir, TREE, ["nodes", 10, "requires"], setValue(["backyard-clinics"]));
    editYaml(dir, TREE, ["nodes", 1, "effects", 0, "channel"], remove);
    const message = loadError(dir).message;
    expect(message).toContain("nodes[10].requires[0]");
    expect(message).toContain("prerequisites must be in the same category");
    expect(message).toContain(
      "nodes[1].effects[0].channel: a spreadChannel effect needs a channel",
    );
  });

  it("duplicate ids, zero amounts and an unlock tier beyond the tier table are rejected", () => {
    const dir = copyOfContent();
    editYaml(dir, TREE, ["nodes", 2, "id"], setValue("word-of-mouth"));
    editYaml(dir, TREE, ["categories", "media", "unlockTier"], setValue(9));
    const message = loadError(dir).message;
    expect(message).toContain('nodes[2].id: duplicate node id "word-of-mouth"');
    expect(message).toContain("categories.media.unlockTier: no tier 9 in config ppTiers");

    const dir2 = copyOfContent();
    editYaml(dir2, TREE, ["nodes", 0, "effects", 0, "amount"], setValue(0));
    expect(loadError(dir2).message).toContain("nodes[0].effects[0].amount: must not be zero");
  });

  it("a missing growth tree file is named", () => {
    const dir = copyOfContent();
    rmSync(join(dir, TREE));
    expect(loadError(dir).message).toContain("growth-tree.yaml");
  });
});
