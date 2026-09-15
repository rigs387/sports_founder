import { parse } from "yaml";
import type { ZodType } from "zod";
import { deriveWorld, startingRivalFanCounts, startingSportCulture, type World } from "./derive";
import { optionNetDeltaAt } from "./genome";
import { AXIS_IDS, GENOME_AXES } from "./genome-axes";
import {
  COUNTERMOVES,
  configFileSchema,
  countriesFileSchema,
  ESCALATION_LEVELS,
  genomeFileSchema,
  growthTreeFileSchema,
  LEAGUE_TIERS,
  namesFileSchema,
  RESERVED_SPORT_IDS,
  sportsFileSchema,
} from "./schemas";

export const CONTENT_FILES = {
  countries: "countries.yaml",
  sports: "sports.yaml",
  genome: "genome.yaml",
  growthTree: "growth-tree.yaml",
  names: "names.yaml",
  config: "config.yaml",
} as const;

export interface ContentSource {
  /** Shown in error messages, e.g. "content/countries.yaml". */
  path: string;
  text: string;
}

export type ContentSources = Record<keyof typeof CONTENT_FILES, ContentSource>;

export interface ContentIssue {
  file: string;
  field: string;
  message: string;
}

export class ContentValidationError extends Error {
  readonly issues: readonly ContentIssue[];

  constructor(issues: readonly ContentIssue[]) {
    const lines = issues.map((issue) => `  ${issue.file} at ${issue.field}: ${issue.message}`);
    super(`Invalid game content (${issues.length} problem(s)):\n${lines.join("\n")}`);
    this.name = "ContentValidationError";
    this.issues = issues;
  }
}

/** Formats a validation path like `countries[2].attributes.wealth`. */
export function formatPath(path: readonly PropertyKey[]): string {
  let out = "";
  for (const key of path) {
    if (typeof key === "number") out += `[${key}]`;
    else out += out === "" ? String(key) : `.${String(key)}`;
  }
  return out === "" ? "(root)" : out;
}

function parseSource<T>(
  source: ContentSource,
  schema: ZodType<T>,
  issues: ContentIssue[],
): T | undefined {
  let data: unknown;
  try {
    data = parse(source.text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const linePos = (error as { linePos?: { line: number }[] }).linePos;
    const line = linePos?.[0]?.line;
    issues.push({
      file: source.path,
      field: line === undefined ? "(YAML syntax)" : `line ${line}`,
      message: `YAML syntax error: ${message.split("\n")[0] ?? message}`,
    });
    return undefined;
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    for (const issue of result.error.issues) {
      issues.push({ file: source.path, field: formatPath(issue.path), message: issue.message });
    }
    return undefined;
  }
  return result.data;
}

/** Parses and validates all content. Throws ContentValidationError naming every bad file and field. */
export function loadWorld(sources: ContentSources): World {
  const issues: ContentIssue[] = [];
  const countriesFile = parseSource(sources.countries, countriesFileSchema, issues);
  const sportsFile = parseSource(sources.sports, sportsFileSchema, issues);
  const genome = parseSource(sources.genome, genomeFileSchema, issues);
  const growthTree = parseSource(sources.growthTree, growthTreeFileSchema, issues);
  const names = parseSource(sources.names, namesFileSchema, issues);
  const config = parseSource(sources.config, configFileSchema, issues);
  if (!countriesFile || !sportsFile || !genome || !growthTree || !names || !config) {
    throw new ContentValidationError(issues);
  }

  const world = deriveWorld({
    countries: countriesFile.countries,
    rivals: sportsFile.rivals,
    otherSports: sportsFile.otherSports,
    genome,
    growthTree,
    names,
    config,
  });
  checkCrossReferences(world, sources, issues);
  if (issues.length > 0) throw new ContentValidationError(issues);
  return world;
}

function checkCrossReferences(world: World, sources: ContentSources, issues: ContentIssue[]): void {
  const issue = (source: ContentSource, field: string, message: string) =>
    issues.push({ file: source.path, field, message });

  // ---- Sports ------------------------------------------------------------------------------
  const rivalIds = new Set<string>();
  world.rivals.forEach((rival, i) => {
    if (RESERVED_SPORT_IDS.includes(rival.id)) {
      issue(sources.sports, `rivals[${i}].id`, `"${rival.id}" is a reserved sport id`);
    }
    if (rivalIds.has(rival.id))
      issue(sources.sports, `rivals[${i}].id`, `duplicate id "${rival.id}"`);
    rivalIds.add(rival.id);
  });

  // ---- Countries ---------------------------------------------------------------------------
  const countryIds = new Set(world.countries.map((country) => country.id));
  const seen = new Set<string>();
  const { start } = world.config;
  world.countries.forEach((country, i) => {
    const at = `countries[${i}]`;
    if (seen.has(country.id)) issue(sources.countries, `${at}.id`, `duplicate id "${country.id}"`);
    seen.add(country.id);

    const linked = new Set<string>();
    for (const list of ["neighbors", "seaLinks"] as const) {
      country[list].forEach((otherId, j) => {
        const field = `${at}.${list}[${j}]`;
        if (!countryIds.has(otherId)) {
          issue(sources.countries, field, `unknown country "${otherId}"`);
        } else if (otherId === country.id) {
          issue(sources.countries, field, "a country cannot link to itself");
        } else if (linked.has(otherId)) {
          issue(sources.countries, field, `"${otherId}" is linked more than once`);
        }
        linked.add(otherId);
      });
    }
    if (country.languages.secondary === country.languages.primary) {
      issue(
        sources.countries,
        `${at}.languages.secondary`,
        "secondary language sphere must differ from the primary",
      );
    }

    let rivalHardcore = 0;
    for (const [sportId, shares] of Object.entries(country.startingRivalFans)) {
      const field = `${at}.startingRivalFans.${sportId}`;
      if (!rivalIds.has(sportId)) {
        issue(sources.countries, field, `unknown rival sport "${sportId}" (not in sports.yaml)`);
      }
      if (shares.casual + shares.hardcore > 1) {
        issue(sources.countries, field, "casual + hardcore shares exceed 1");
      }
      rivalHardcore += startingRivalFanCounts(country.population, shares).hardcore;
    }
    const sportCulture = startingSportCulture(country, world.otherSports);
    if (sportCulture > 1) {
      issue(
        sources.countries,
        `${at}.startingRivalFans`,
        `hardcore shares across rivals and other sports total ${sportCulture.toFixed(3)}, above 1 (a person is hardcore about at most one sport)`,
      );
    }
    const otherHardcore = Math.floor(
      country.population * (world.derived[i]?.otherHardcoreShare ?? 0),
    );

    // Every country is a selectable anchor, so the starting fan base must fit in each one.
    if (start.anchorCasualFans + start.anchorHardcoreFans > country.population) {
      issue(
        sources.config,
        "start",
        `starting anchor fans exceed the population of "${country.id}"`,
      );
    }
    if (start.anchorHardcoreFans > country.population - rivalHardcore - otherHardcore) {
      issue(
        sources.config,
        "start.anchorHardcoreFans",
        `does not fit in "${country.id}" alongside rival and other hardcore fans`,
      );
    }

    if (world.names.countries[country.id] === undefined) {
      issue(sources.names, `countries.${country.id}`, "missing display name");
    }
  });

  // ---- Names -------------------------------------------------------------------------------
  for (const nameId of Object.keys(world.names.countries)) {
    if (!countryIds.has(nameId)) issue(sources.names, `countries.${nameId}`, "unknown country id");
  }
  for (const rivalId of rivalIds) {
    if (world.names.sports[rivalId] === undefined) {
      issue(sources.names, `sports.${rivalId}`, "missing display name");
    }
  }
  for (const nameId of Object.keys(world.names.sports)) {
    if (!rivalIds.has(nameId)) issue(sources.names, `sports.${nameId}`, "unknown sport id");
  }

  // ---- Genome ------------------------------------------------------------------------------
  // Design rule (GDD "No universal best option"): every option helps in a real share of the
  // actual countries and hurts in a real share of them (net lever delta: affinity + accessibility +
  // depth), so every choice is a trade-off on this map (decided 2026-09-14).
  const balance = world.config.genomeBalance;
  const countryCount = world.derived.length;
  for (const axis of AXIS_IDS) {
    for (const option of GENOME_AXES[axis].options) {
      const modifiers = world.genome.options[axis][option];
      if (!modifiers || countryCount === 0) continue;
      const nets = world.derived.map((attributes) => optionNetDeltaAt(modifiers, attributes));
      const helps = nets.filter((net) => net > balance.neutralDelta).length;
      const hurts = nets.filter((net) => net < -balance.neutralDelta).length;
      const field = `options.${axis}.${option}`;
      const percent = (share: number) => `${Math.round(share * 100)}%`;
      if (helps / countryCount < balance.minHelpShare) {
        issue(
          sources.genome,
          field,
          `helps in only ${helps} of ${countryCount} countries; every option must help in at least ${percent(balance.minHelpShare)} of them (no universal worst option)`,
        );
      }
      if (hurts / countryCount < balance.minHurtShare) {
        issue(
          sources.genome,
          field,
          `hurts in only ${hurts} of ${countryCount} countries; every option must hurt in at least ${percent(balance.minHurtShare)} of them (no universal best option)`,
        );
      }
    }
  }
  const presetIds = new Set<string>();
  world.genome.presets.forEach((preset, i) => {
    if (presetIds.has(preset.id))
      issue(sources.genome, `presets[${i}].id`, `duplicate id "${preset.id}"`);
    presetIds.add(preset.id);
  });

  // ---- Config ------------------------------------------------------------------------------
  const tiers = world.config.ppTiers;
  tiers.forEach((tier, i) => {
    if (tier.tier !== i + 1) {
      issue(
        sources.config,
        `ppTiers[${i}].tier`,
        `expected tier ${i + 1} (tiers must be listed 1, 2, 3, ...)`,
      );
    }
    const previous = tiers[i - 1];
    if (previous && tier.fandomScoreRequired < previous.fandomScoreRequired) {
      issue(
        sources.config,
        `ppTiers[${i}].fandomScoreRequired`,
        "must not be lower than the previous tier's",
      );
    }
    if (previous && tier.focusSlots < previous.focusSlots) {
      issue(
        sources.config,
        `ppTiers[${i}].focusSlots`,
        "must not be lower than the previous tier's",
      );
    }
  });
  if (start.startingTier > tiers.length) {
    issue(sources.config, "start.startingTier", `no tier ${start.startingTier} in ppTiers`);
  }
  const weightTotal = AXIS_IDS.reduce(
    (sum, axis) => sum + world.config.similarity.axisWeights[axis],
    0,
  );
  if (weightTotal <= 0) {
    issue(sources.config, "similarity.axisWeights", "at least one axis weight must be positive");
  }
  tiers.forEach((tier, i) => {
    const field = `ppTiers[${i}].breadth`;
    if (i === 0 && tier.breadth.type !== "none") {
      issue(sources.config, field, 'the starting tier has no breadth condition (use type "none")');
    }
    if (i > 0 && tier.breadth.type === "none") {
      issue(sources.config, field, "every tier above the first needs a breadth condition");
    }
  });

  const { leagues } = world.config;
  LEAGUE_TIERS.forEach((leagueTier, i) => {
    const entry = leagues.tiers[leagueTier];
    const field = `leagues.tiers.${leagueTier}`;
    if (i === 0 && entry.promotion !== null) {
      issue(
        sources.config,
        `${field}.promotion`,
        "the lowest tier cannot be promoted into (use null)",
      );
    }
    if (i > 0 && entry.promotion === null) {
      issue(sources.config, `${field}.promotion`, "needs promotion thresholds");
    }
    const lower = LEAGUE_TIERS[i - 1];
    if (lower === undefined) return;
    if (entry.runningCost < leagues.tiers[lower].runningCost) {
      issue(sources.config, `${field}.runningCost`, `must not be lower than the ${lower} tier's`);
    }
    if (entry.minRunningCost < leagues.tiers[lower].minRunningCost) {
      issue(
        sources.config,
        `${field}.minRunningCost`,
        `must not be lower than the ${lower} tier's`,
      );
    }
    const lowerPromotion = leagues.tiers[lower].promotion;
    if (
      entry.promotion &&
      lowerPromotion &&
      entry.promotion.hardcoreShare < lowerPromotion.hardcoreShare
    ) {
      issue(
        sources.config,
        `${field}.promotion.hardcoreShare`,
        `must not be lower than the ${lower} tier's`,
      );
    }
  });
  if (leagues.health.nearCollapseRunwayQuarters >= leagues.health.strugglingRunwayQuarters) {
    issue(
      sources.config,
      "leagues.health.nearCollapseRunwayQuarters",
      "must be shorter than strugglingRunwayQuarters",
    );
  }
  if (world.config.balanceTargets.turnsInTier.length < tiers.length - 1) {
    issue(
      sources.config,
      "balanceTargets.turnsInTier",
      `needs a target for each of the first ${tiers.length - 1} tiers`,
    );
  }
  LEAGUE_TIERS.forEach((leagueTier, i) => {
    const lower = LEAGUE_TIERS[i - 1];
    const promotion = leagues.tiers[leagueTier].promotion;
    const lowerPromotion = lower === undefined ? null : leagues.tiers[lower].promotion;
    if (promotion && lowerPromotion && promotion.minHardcore < lowerPromotion.minHardcore) {
      issue(
        sources.config,
        `leagues.tiers.${leagueTier}.promotion.minHardcore`,
        `must not be lower than the ${lower} tier's`,
      );
    }
  });

  // ---- Poaching and rival AI ---------------------------------------------------------------
  const { rivalAI, poaching } = world.config;
  const resistance = poaching.defenseResistance;
  ESCALATION_LEVELS.forEach((level, i) => {
    const lower = ESCALATION_LEVELS[i - 1];
    if (lower !== undefined && resistance[level] > resistance[lower]) {
      issue(
        sources.config,
        `poaching.defenseResistance.${level}`,
        `must not be above the ${lower} level's (higher escalation defends at least as hard)`,
      );
    }
  });
  const thresholds = rivalAI.escalation.thresholds;
  if (thresholds.defending <= thresholds.watching) {
    issue(
      sources.config,
      "rivalAI.escalation.thresholds.defending",
      "must be above the watching threshold",
    );
  }
  if (thresholds.entrenched <= thresholds.defending) {
    issue(
      sources.config,
      "rivalAI.escalation.thresholds.entrenched",
      "must be above the defending threshold",
    );
  }
  const listed = new Set<string>();
  rivalAI.preference.forEach((move, i) => {
    if (listed.has(move)) {
      issue(sources.config, `rivalAI.preference[${i}]`, `"${move}" is listed more than once`);
    }
    listed.add(move);
  });
  for (const move of COUNTERMOVES) {
    if (!listed.has(move)) {
      issue(
        sources.config,
        "rivalAI.preference",
        `must list every countermove; "${move}" is missing`,
      );
    }
  }
  if (world.config.focus.exposedCost > world.config.focus.coldLaunchCost) {
    issue(
      sources.config,
      "focus.exposedCost",
      "must not exceed coldLaunchCost (existing exposure makes a push cheaper)",
    );
  }

  checkGrowthTree(world, sources, issues);
}

/** Growth tree cross-references: categories, prerequisites (no cycles), effects and forks. */
function checkGrowthTree(world: World, sources: ContentSources, issues: ContentIssue[]): void {
  const tree = world.growthTree;
  const issue = (field: string, message: string) =>
    issues.push({ file: sources.growthTree.path, field, message });
  const tierCount = world.config.ppTiers.length;

  for (const [category, entry] of Object.entries(tree.categories)) {
    if (entry && entry.unlockTier > tierCount) {
      issue(
        `categories.${category}.unlockTier`,
        `no tier ${entry.unlockTier} in config ppTiers (there are ${tierCount})`,
      );
    }
  }

  const byId = new Map<string, number>();
  tree.nodes.forEach((node, i) => {
    if (byId.has(node.id)) issue(`nodes[${i}].id`, `duplicate node id "${node.id}"`);
    else byId.set(node.id, i);
  });

  tree.nodes.forEach((node, i) => {
    const at = `nodes[${i}]`;
    if (tree.categories[node.category] === undefined) {
      issue(`${at}.category`, `category "${node.category}" has no entry under categories`);
    }
    const seenRequires = new Set<string>();
    node.requires.forEach((requiredId, j) => {
      const field = `${at}.requires[${j}]`;
      const required = tree.nodes[byId.get(requiredId) ?? -1];
      if (!required) issue(field, `unknown node "${requiredId}"`);
      else if (requiredId === node.id) issue(field, "a node cannot require itself");
      else if (required.category !== node.category) {
        issue(
          field,
          `"${requiredId}" is in category ${required.category}; prerequisites must be in the same category (${node.category})`,
        );
      }
      if (seenRequires.has(requiredId)) issue(field, `"${requiredId}" is listed more than once`);
      seenRequires.add(requiredId);
    });
    node.effects.forEach((effect, j) => {
      const field = `${at}.effects[${j}]`;
      if (effect.type === "spreadChannel" && effect.channel === undefined) {
        issue(`${field}.channel`, "a spreadChannel effect needs a channel");
      }
      if (effect.type !== "spreadChannel" && effect.channel !== undefined) {
        issue(
          `${field}.channel`,
          `only spreadChannel effects take a channel (this is ${effect.type})`,
        );
      }
    });
  });

  // Cycles: depth-first search over prerequisites.
  const state = new Map<string, "visiting" | "done">();
  const reported = new Set<string>();
  const visit = (id: string, path: string[]) => {
    if (state.get(id) === "done") return;
    if (state.get(id) === "visiting") {
      const cycle = [...path.slice(path.indexOf(id)), id];
      const key = [...cycle].sort().join("|");
      if (!reported.has(key)) {
        reported.add(key);
        issue(`nodes[${byId.get(id)}].requires`, `cyclic prerequisites: ${cycle.join(" → ")}`);
      }
      return;
    }
    state.set(id, "visiting");
    for (const next of tree.nodes[byId.get(id) ?? -1]?.requires ?? []) {
      if (byId.has(next)) visit(next, [...path, id]);
    }
    state.set(id, "done");
  };
  for (const node of tree.nodes) visit(node.id, []);

  const forkIds = new Set<string>();
  const inFork = new Map<string, string>();
  tree.forks.forEach((fork, i) => {
    const at = `forks[${i}]`;
    if (forkIds.has(fork.id)) issue(`${at}.id`, `duplicate fork id "${fork.id}"`);
    forkIds.add(fork.id);
    const categories = new Set<string>();
    fork.nodes.forEach((nodeId, j) => {
      const field = `${at}.nodes[${j}]`;
      const node = tree.nodes[byId.get(nodeId) ?? -1];
      if (!node) {
        issue(field, `unknown node "${nodeId}"`);
        return;
      }
      categories.add(node.category);
      const other = inFork.get(nodeId);
      if (other !== undefined) {
        issue(field, `"${nodeId}" is already in fork "${other}" (a node belongs to one fork)`);
      }
      inFork.set(nodeId, fork.id);
    });
    if (categories.size > 1) issue(`${at}.nodes`, "a fork's nodes must share one category");
    // A fork node that needs a sibling could never be bought.
    for (const nodeId of fork.nodes) {
      const ancestors = prerequisiteClosure(tree.nodes, byId, nodeId);
      for (const sibling of fork.nodes) {
        if (sibling !== nodeId && ancestors.has(sibling)) {
          issue(
            `${at}.nodes`,
            `"${nodeId}" requires "${sibling}", its fork sibling, so it could never be bought`,
          );
        }
      }
    }
  });
}

function prerequisiteClosure(
  nodes: World["growthTree"]["nodes"],
  byId: Map<string, number>,
  start: string,
): Set<string> {
  const found = new Set<string>();
  const stack = [...(nodes[byId.get(start) ?? -1]?.requires ?? [])];
  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined || found.has(id)) continue;
    found.add(id);
    stack.push(...(nodes[byId.get(id) ?? -1]?.requires ?? []));
  }
  return found;
}
