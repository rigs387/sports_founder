import { parse } from "yaml";
import type { ZodType } from "zod";
import { deriveWorld, startingRivalFanCounts, startingSportCulture, type World } from "./derive";
import { optionDeltaRange } from "./genome";
import { AXIS_IDS, GENOME_AXES } from "./genome-axes";
import {
  COUNTERMOVES,
  configFileSchema,
  countriesFileSchema,
  ESCALATION_LEVELS,
  genomeFileSchema,
  LEAGUE_TIERS,
  LEVERS,
  namesFileSchema,
  RESERVED_SPORT_IDS,
  sportsFileSchema,
} from "./schemas";

export const CONTENT_FILES = {
  countries: "countries.yaml",
  sports: "sports.yaml",
  genome: "genome.yaml",
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
  const names = parseSource(sources.names, namesFileSchema, issues);
  const config = parseSource(sources.config, configFileSchema, issues);
  if (!countriesFile || !sportsFile || !genome || !names || !config) {
    throw new ContentValidationError(issues);
  }

  const world = deriveWorld({
    countries: countriesFile.countries,
    rivals: sportsFile.rivals,
    otherSports: sportsFile.otherSports,
    genome,
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
  // Design rule (GDD "No universal best option"): every option helps somewhere and hurts
  // somewhere. Checked over the whole attribute space, lever by lever.
  for (const axis of AXIS_IDS) {
    for (const option of GENOME_AXES[axis].options) {
      const modifiers = world.genome.options[axis][option];
      if (!modifiers) continue;
      const ranges = optionDeltaRange(modifiers);
      const hasDownside = LEVERS.some((lever) => ranges[lever].min < 0);
      const hasUpside = LEVERS.some((lever) => ranges[lever].max > 0);
      const field = `options.${axis}.${option}`;
      if (!hasDownside) {
        issue(
          sources.genome,
          field,
          "has no downside anywhere: no lever ever goes negative for any country attributes (every option must hurt somewhere)",
        );
      }
      if (!hasUpside) {
        issue(
          sources.genome,
          field,
          "has no upside anywhere: no lever ever goes positive for any country attributes",
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
}
