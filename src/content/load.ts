import { parse } from "yaml";
import type { ZodType } from "zod";
import { deriveWorld, startingRivalFanCounts, startingSportCulture, type World } from "./derive";
import { eventsFileSchema } from "./events";
import { optionNetDeltaAt } from "./genome";
import { AXIS_IDS, type AxisId, GENOME_AXES } from "./genome-axes";
import {
  COUNTERMOVES,
  configFileSchema,
  countriesFileSchema,
  ESCALATION_LEVELS,
  FAN_FIELD_PREFIX,
  genomeFileSchema,
  growthTreeFileSchema,
  identityFileSchema,
  LEAGUE_TIERS,
  namesFileSchema,
  placesFileSchema,
  RESERVED_SPORT_IDS,
  SOURCED_FIELDS,
  sourcesFileSchema,
  sportsFileSchema,
  TRADITION_EFFECT_TYPES,
} from "./schemas";

export const CONTENT_FILES = {
  countries: "countries.yaml",
  sports: "sports.yaml",
  genome: "genome.yaml",
  growthTree: "growth-tree.yaml",
  events: "events.yaml",
  identity: "identity.yaml",
  names: "names.yaml",
  places: "places.yaml",
  sources: "sources.yaml",
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
  const events = parseSource(sources.events, eventsFileSchema, issues);
  const names = parseSource(sources.names, namesFileSchema, issues);
  const identity = parseSource(sources.identity, identityFileSchema, issues);
  const placesFile = parseSource(sources.places, placesFileSchema, issues);
  const sourcesFile = parseSource(sources.sources, sourcesFileSchema, issues);
  const config = parseSource(sources.config, configFileSchema, issues);
  if (
    !countriesFile ||
    !sportsFile ||
    !genome ||
    !growthTree ||
    !events ||
    !names ||
    !identity ||
    !placesFile ||
    !sourcesFile ||
    !config
  ) {
    throw new ContentValidationError(issues);
  }

  const world = deriveWorld({
    countries: countriesFile.countries,
    rivals: sportsFile.rivals,
    otherSports: sportsFile.otherSports,
    genome,
    growthTree,
    events,
    identity,
    names,
    places: placesFile.places,
    sources: sourcesFile,
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
  // ---- Identity ----------------------------------------------------------------------------
  const { emblem, oddPairings } = world.identity;
  if (Object.keys(emblem.colors).length < 2)
    issue(sources.identity, "emblem.colors", "an emblem needs at least two colors");
  oddPairings.forEach((pairing, i) => {
    for (const [axis, option] of Object.entries(pairing.when)) {
      const known = (AXIS_IDS as readonly string[]).includes(axis)
        ? (GENOME_AXES[axis as keyof typeof GENOME_AXES].options as readonly string[])
        : null;
      if (!known) issue(sources.identity, `oddPairings[${i}].when.${axis}`, "unknown genome axis");
      else if (!known.includes(option))
        issue(sources.identity, `oddPairings[${i}].when.${axis}`, `unknown option "${option}"`);
    }
  });
  // Culture (GDD v1.22): every birthplace and ethos has its multipliers, each balanced near 1.
  const band = world.config.culture.characterBand;
  const geometricMean = (values: readonly number[]) =>
    Math.exp(values.reduce((sum, v) => sum + Math.log(v), 0) / values.length);
  const character = world.identity.culture;
  const checkCharacter = (
    list: readonly string[],
    table: Record<string, Record<string, number>>,
    field: string,
  ) => {
    for (const choice of list) {
      const entry = table[choice];
      if (!entry) {
        issue(sources.identity, `culture.${field}.${choice}`, "missing");
        continue;
      }
      const mean = geometricMean(Object.values(entry));
      if (Math.abs(mean - 1) > band)
        issue(
          sources.identity,
          `culture.${field}.${choice}`,
          `geometric mean ${mean.toFixed(3)} is outside 1 ± ${band}`,
        );
    }
    for (const choice of Object.keys(table))
      if (!list.includes(choice))
        issue(sources.identity, `culture.${field}.${choice}`, "not a choice in this list");
  };
  checkCharacter(world.identity.birthplaces, character.birthplaces, "birthplaces");
  checkCharacter(world.identity.ethos, character.ethos, "ethos");
  const { traditions } = world.names;
  for (const birthplace of world.identity.birthplaces)
    if (!traditions.rites[birthplace])
      issue(sources.names, `traditions.rites.${birthplace}`, "missing rite names");
  if (!traditions.nationalNames.default)
    issue(sources.names, "traditions.nationalNames.default", "missing the default pool");
  for (const [sportId, list] of Object.entries(traditions.rivals)) {
    if (!rivalIds.has(sportId))
      issue(sources.names, `traditions.rivals.${sportId}`, "unknown rival sport");
    list.forEach((tradition, i) => {
      if (!world.countries.some((country) => country.id === tradition.countryId))
        issue(
          sources.names,
          `traditions.rivals.${sportId}[${i}].countryId`,
          `unknown country "${tradition.countryId}"`,
        );
    });
  }
  const tournamentSports = new Set<string>();
  world.config.rivalAI.tournaments.forEach((tournament, i) => {
    const field = `rivalAI.tournaments[${i}].sportId`;
    if (!rivalIds.has(tournament.sportId))
      issue(sources.config, field, `unknown rival sport "${tournament.sportId}"`);
    if (tournamentSports.has(tournament.sportId))
      issue(sources.config, field, `"${tournament.sportId}" has two world championships`);
    tournamentSports.add(tournament.sportId);
    if (!world.names.tournaments[tournament.sportId])
      issue(sources.names, `tournaments.${tournament.sportId}`, "missing display name");
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
    } else if (sportCulture > world.config.worldChecks.maxSportCulture) {
      // A data sanity guard: a country where nearly everyone is already hardcore about something
      // leaves the player no room, and is far more likely to be a bad figure than a real market.
      issue(
        sources.countries,
        `${at}.startingRivalFans`,
        `hardcore shares across rivals and other sports total ${sportCulture.toFixed(3)}, above config worldChecks.maxSportCulture (${world.config.worldChecks.maxSportCulture})`,
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
  // Every club in the largest flagship needs its own place and nickname (GDD v1.14).
  const mostClubs = Math.max(...Object.values(world.config.flagship.clubs));
  const nicknames = world.names.clubNicknames;
  if (new Set(nicknames).size !== nicknames.length) {
    issue(sources.names, "clubNicknames", "has duplicate entries");
  }
  if (new Set(nicknames).size < mostClubs) {
    issue(sources.names, "clubNicknames", `needs at least ${mostClubs} distinct entries`);
  }
  // Every market's players need a pool of invented names (GDD v1.16).
  const { playerNames } = world.names;
  const minPool = world.config.flagship.players.minNamePool;
  const usedPools = new Set<string>();
  for (const country of world.countries) {
    const poolId = playerNames.countries[country.id] ?? country.languages.primary;
    usedPools.add(poolId);
    if (playerNames.pools[poolId] === undefined) {
      issue(sources.names, `playerNames.pools.${poolId}`, `missing: "${country.id}" names from it`);
    }
  }
  for (const [countryId, poolId] of Object.entries(playerNames.countries)) {
    if (!countryIds.has(countryId)) {
      issue(sources.names, `playerNames.countries.${countryId}`, "unknown country id");
    } else if (playerNames.pools[poolId] === undefined) {
      issue(sources.names, `playerNames.countries.${countryId}`, `unknown pool "${poolId}"`);
    }
  }
  for (const [poolId, pool] of Object.entries(playerNames.pools)) {
    if (!usedPools.has(poolId)) {
      issue(sources.names, `playerNames.pools.${poolId}`, "no country names from this pool");
    }
    for (const part of ["given", "family"] as const) {
      const names = pool[part];
      if (new Set(names).size !== names.length) {
        issue(sources.names, `playerNames.pools.${poolId}.${part}`, "has duplicate entries");
      }
      if (names.length < minPool) {
        issue(sources.names, `playerNames.pools.${poolId}.${part}`, `needs at least ${minPool}`);
      }
    }
  }
  // ---- Places: every market has at least one real place for its clubs ------------------------
  for (const country of world.countries) {
    if (world.places[country.id] === undefined) {
      issue(sources.places, `places.${country.id}`, "missing: every market needs a real place");
    }
  }
  for (const placeId of Object.keys(world.places)) {
    if (!countryIds.has(placeId)) issue(sources.places, `places.${placeId}`, "unknown country id");
  }
  const { flagship } = world.config;
  const tierSizes = LEAGUE_TIERS.map((tier) => flagship.clubs[tier]);
  if (tierSizes.some((size, i) => i > 0 && size < (tierSizes[i - 1] ?? 0))) {
    issue(sources.config, "flagship.clubs", "club counts must not shrink at higher league tiers");
  }
  const { players } = flagship;
  if (players.foundingAge.min > players.foundingAge.max) {
    issue(sources.config, "flagship.players.foundingAge", "min must not exceed max");
  }
  if (players.skill.min > players.skill.max) {
    issue(sources.config, "flagship.players.skill", "min must not exceed max");
  }
  if (players.replacement.age.min > players.replacement.age.max) {
    issue(sources.config, "flagship.players.replacement.age", "min must not exceed max");
  }
  if (players.finalSeason.lastAge < players.finalSeason.fromAge) {
    issue(sources.config, "flagship.players.finalSeason", "lastAge must not come before fromAge");
  }
  if (players.credit.min > players.credit.max) {
    issue(sources.config, "flagship.players.credit", "min must not exceed max");
  }
  if (players.career.declineAge < players.career.peakAge) {
    issue(sources.config, "flagship.players.career", "declineAge must not come before peakAge");
  }
  for (const [i, entry] of flagship.playoffs.entries()) {
    if (entry.clubs > entry.minClubs) {
      issue(sources.config, `flagship.playoffs.${i}`, "cannot take more clubs than the league has");
    }
  }
  if (!flagship.playoffs.some((entry) => entry.minClubs <= (tierSizes[0] ?? 0))) {
    issue(sources.config, "flagship.playoffs", "needs an entry for the smallest flagship");
  }
  if (flagship.rating.min >= flagship.rating.max) {
    issue(sources.config, "flagship.rating", "min must be below max");
  }
  if (flagship.match.minRate > flagship.match.maxRate) {
    issue(sources.config, "flagship.match", "minRate must not exceed maxRate");
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
  if (!tiers.some((tier) => tier.tier === world.config.win.requiredTier)) {
    issue(sources.config, "win.requiredTier", "must be one of the PP tiers in ppTiers");
  }
  if (world.config.balanceTargets.turnsInTier.length !== tiers.length) {
    issue(
      sources.config,
      "balanceTargets.turnsInTier",
      `needs ${tiers.length} targets: turns in each of the first ${tiers.length - 1} tiers, then turns in the top tier until the first win`,
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

  checkSources(world, sources, issues);
  checkGrowthTree(world, sources, issues);
  checkDeals(world, sources, issues);
  world.events.cards.forEach((card, index) => {
    if (!world.config.ppTiers.some((tier) => tier.tier === card.minTier))
      issue(sources.events, `cards[${index}].minTier`, "unknown PP tier");
  });
}

/**
 * The sources file (GDD "Real-world data": every field records its source and year). Every market
 * needs a source for every sourced field and for every rival fan bucket it lists, either from
 * `defaults` or from its own entry, and every entry must name a listed dataset or say what its
 * estimate was modeled on.
 */
function checkSources(world: World, sources: ContentSources, issues: ContentIssue[]): void {
  const file = sources.sources;
  const issue = (field: string, message: string) =>
    issues.push({ file: file.path, field, message });
  const { datasets, defaults, countries, markets } = world.sources;
  const datasetIds = new Set(Object.keys(datasets));
  const countryIds = new Set(world.countries.map((country) => country.id));
  const rivalIds = new Set(world.rivals.map((rival) => rival.id));
  const fanField = (rivalId: string) => `${FAN_FIELD_PREFIX}${rivalId}`;
  const knownField = (name: string) =>
    (SOURCED_FIELDS as readonly string[]).includes(name) ||
    (name.startsWith(FAN_FIELD_PREFIX) && rivalIds.has(name.slice(FAN_FIELD_PREFIX.length)));

  const checkEntry = (field: string, entry: { dataset?: string }) => {
    if (entry.dataset !== undefined && !datasetIds.has(entry.dataset)) {
      issue(field, `unknown dataset "${entry.dataset}" (not listed under datasets)`);
    }
  };

  for (const [name, entry] of Object.entries(defaults)) {
    if (!knownField(name)) issue(`defaults.${name}`, `"${name}" is not a sourced country field`);
    checkEntry(`defaults.${name}`, entry);
  }
  for (const field of SOURCED_FIELDS) {
    if (defaults[field] === undefined) {
      issue("defaults", `every sourced field needs a default; "${field}" is missing`);
    }
  }
  for (const [countryId, fields] of Object.entries(countries)) {
    if (!countryIds.has(countryId)) {
      issue(`countries.${countryId}`, `unknown country "${countryId}"`);
      continue;
    }
    for (const [name, entry] of Object.entries(fields)) {
      if (!knownField(name)) {
        issue(`countries.${countryId}.${name}`, `"${name}" is not a sourced country field`);
      }
      checkEntry(`countries.${countryId}.${name}`, entry);
    }
  }
  // Fan buckets are researched per market, so every one a market lists needs its own entry.
  for (const country of world.countries) {
    for (const rivalId of Object.keys(country.startingRivalFans)) {
      const field = fanField(rivalId);
      if (defaults[field] !== undefined || countries[country.id]?.[field] !== undefined) continue;
      issue(
        `countries.${country.id}.${field}`,
        `no source for the ${rivalId} fan figures in countries.yaml (a survey dataset or an estimate saying what it was modeled on)`,
      );
    }
  }
  for (const addedId of Object.keys(markets.added)) {
    if (!countryIds.has(addedId)) {
      issue(`markets.added.${addedId}`, `unknown country "${addedId}"`);
    }
  }
}

/** Growth tree cross-references: categories, prerequisites (no cycles), effects and forks. */
/** Flagship deals (GDD v1.28): rule wishes, the TV fork, tables by tier and partner pools. */
function checkDeals(world: World, sources: ContentSources, issues: ContentIssue[]): void {
  const { deals } = world.config.flagship;
  const config = (field: string, message: string) =>
    issues.push({ file: sources.config.path, field: `flagship.deals.${field}`, message });
  for (const [kind, wishes] of Object.entries(deals.ruleDemand.wishes)) {
    wishes.forEach((wish, i) => {
      const field = `ruleDemand.wishes.${kind}[${i}]`;
      const axis = GENOME_AXES[wish.axis as AxisId];
      if (axis?.kind !== "rule") config(field, `"${wish.axis}" is not a rule trait`);
      else if (!(axis.options as readonly string[]).includes(wish.toward)) {
        config(field, `"${wish.toward}" is not an option of ${wish.axis}`);
      }
    });
  }
  const nodeIds = new Set(world.growthTree.nodes.map((node) => node.id));
  for (const nodeId of Object.keys(deals.tvFork)) {
    if (!nodeIds.has(nodeId)) config(`tvFork.${nodeId}`, "unknown growth node");
  }
  if (deals.capByPpTier.length !== world.config.ppTiers.length) {
    config("capByPpTier", `needs one entry per PP tier (${world.config.ppTiers.length})`);
  }
  const mostSponsors = Math.max(...Object.values(deals.sponsorSlots));
  if (deals.value.sponsorSlotShares.length < mostSponsors) {
    config("value.sponsorSlotShares", `needs a share for each of up to ${mostSponsors} slots`);
  }

  // Partners: unique ids and names, and enough of them for an offseason's offers after shunning.
  const { broadcasters, sponsors } = world.names.dealPartners;
  const names = (field: string, message: string) =>
    issues.push({
      file: sources.names.path,
      field: field ? `dealPartners.${field}` : "dealPartners",
      message,
    });
  const all = [...broadcasters, ...sponsors];
  if (new Set(all.map((p) => p.id)).size !== all.length) names("", "has duplicate ids");
  if (new Set(all.map((p) => p.name)).size !== all.length) names("", "has duplicate names");
  const most = deals.offersPerSlot.max;
  if (broadcasters.length < 2 * most) {
    names("broadcasters", `needs at least ${2 * most} (two offseasons of TV offers)`);
  }
  if (sponsors.length < most * (mostSponsors + 2)) {
    names("sponsors", `needs at least ${most * (mostSponsors + 2)} (sponsor and naming offers)`);
  }
}

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
      const culture = TRADITION_EFFECT_TYPES.includes(effect.type);
      if (culture && node.category !== "culture")
        issue(`${field}.type`, `${effect.type} belongs to Culture nodes only`);
      if (culture && effect.conditions !== undefined)
        issue(`${field}.conditions`, "Culture effects apply everywhere and take no conditions");
      if (!culture && effect.traditionType !== undefined)
        issue(`${field}.traditionType`, `only Culture effects take a tradition type`);
      // Reach may be limited to the proximity or language links (GDD v1.22).
      if (effect.type === "traditionReach" && effect.channel === "media")
        issue(`${field}.channel`, "traditions reach only along proximity or language links");
      if (
        effect.type !== "spreadChannel" &&
        effect.type !== "traditionReach" &&
        effect.channel !== undefined
      ) {
        issue(
          `${field}.channel`,
          `only spreadChannel and traditionReach effects take a channel (this is ${effect.type})`,
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
