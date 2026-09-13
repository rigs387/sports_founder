import { parse } from "yaml";
import type { ZodType } from "zod";
import {
  type Config,
  type Country,
  configFileSchema,
  countriesFileSchema,
  type FanShares,
  type Names,
  namesFileSchema,
  PLAYER_SPORT_ID,
  type RivalSport,
  sportsFileSchema,
} from "./schemas";

export const CONTENT_FILES = {
  countries: "countries.yaml",
  sports: "sports.yaml",
  names: "names.yaml",
  config: "config.yaml",
} as const;

export interface ContentSource {
  /** Shown in error messages, e.g. "content/countries.yaml". */
  path: string;
  text: string;
}

export type ContentSources = Record<keyof typeof CONTENT_FILES, ContentSource>;

/** Validated, static game content. The simulation reads it; it never changes during a campaign. */
export interface World {
  countries: Country[];
  rivals: RivalSport[];
  names: Names;
  config: Config;
}

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

/** Starting rival fan counts for a country. Shared by validation and campaign setup. */
export function startingRivalFanCounts(
  population: number,
  shares: FanShares | undefined,
): { casual: number; hardcore: number } {
  if (!shares) return { casual: 0, hardcore: 0 };
  return {
    casual: Math.floor(population * shares.casual),
    hardcore: Math.floor(population * shares.hardcore),
  };
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
  const names = parseSource(sources.names, namesFileSchema, issues);
  const config = parseSource(sources.config, configFileSchema, issues);
  if (!countriesFile || !sportsFile || !names || !config) {
    throw new ContentValidationError(issues);
  }

  const world: World = {
    countries: countriesFile.countries,
    rivals: sportsFile.rivals,
    names,
    config,
  };
  checkCrossReferences(world, sources, issues);
  if (issues.length > 0) throw new ContentValidationError(issues);
  return world;
}

function checkCrossReferences(world: World, sources: ContentSources, issues: ContentIssue[]): void {
  const issue = (source: ContentSource, field: string, message: string) =>
    issues.push({ file: source.path, field, message });

  const rivalIds = new Set<string>();
  world.rivals.forEach((rival, i) => {
    if (rival.id === PLAYER_SPORT_ID) {
      issue(
        sources.sports,
        `rivals[${i}].id`,
        `"${PLAYER_SPORT_ID}" is reserved for the player's sport`,
      );
    }
    if (rivalIds.has(rival.id))
      issue(sources.sports, `rivals[${i}].id`, `duplicate id "${rival.id}"`);
    rivalIds.add(rival.id);
  });

  const countryIds = new Set<string>();
  const { start } = world.config;
  world.countries.forEach((country, i) => {
    const at = `countries[${i}]`;
    if (countryIds.has(country.id))
      issue(sources.countries, `${at}.id`, `duplicate id "${country.id}"`);
    countryIds.add(country.id);

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
    if (rivalHardcore > country.population) {
      issue(
        sources.countries,
        `${at}.startingRivalFans`,
        "hardcore shares across rivals exceed 1 (a person is hardcore about at most one sport)",
      );
    }

    // Every country is a selectable anchor, so the starting fan base must fit in each one.
    if (start.anchorCasualFans + start.anchorHardcoreFans > country.population) {
      issue(
        sources.config,
        "start",
        `starting anchor fans exceed the population of "${country.id}"`,
      );
    }
    if (start.anchorHardcoreFans > country.population - rivalHardcore) {
      issue(
        sources.config,
        "start.anchorHardcoreFans",
        `does not fit in "${country.id}" alongside rival hardcore fans`,
      );
    }

    if (world.names.countries[country.id] === undefined) {
      issue(sources.names, `countries.${country.id}`, "missing display name");
    }
  });

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
  });
  if (start.startingTier > tiers.length) {
    issue(sources.config, "start.startingTier", `no tier ${start.startingTier} in ppTiers`);
  }
}
