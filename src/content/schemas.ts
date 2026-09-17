import { z } from "zod";
import { AXIS_IDS, type AxisId, GENOME_AXES, type Genome } from "./genome-axes";

/** Reserved sport id for the player's own sport. Rivals may not use it. */
export const PLAYER_SPORT_ID = "player";
/** Reserved sport id for the passive "other sports" hardcore bucket. */
export const OTHER_SPORT_ID = "other";
export const RESERVED_SPORT_IDS: readonly string[] = [PLAYER_SPORT_ID, OTHER_SPORT_ID];

const id = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, "must be a lowercase id (letters, digits, hyphens)");
const unitInterval = z.number().min(0).max(1);
const delta = z.number().min(-2).max(2);

// ---- Countries -----------------------------------------------------------------------------

export const climateSchema = z.enum(["tropical", "arid", "temperate", "cold"]);
export const CLIMATES = climateSchema.options;

export const continentSchema = z.enum([
  "africa",
  "asia",
  "europe",
  "north-america",
  "south-america",
  "oceania",
]);
export const CONTINENTS = continentSchema.options;

export const fanSharesSchema = z.strictObject({
  casual: unitInterval,
  hardcore: unitInterval,
});

export const countrySchema = z.strictObject({
  id,
  continent: continentSchema,
  population: z.int().positive(),
  climate: climateSchema,
  incomePerPerson: z.number().positive(),
  urbanShare: unitInterval,
  languages: z.strictObject({ primary: id, secondary: id.optional() }),
  neighbors: z.array(id).default([]),
  seaLinks: z.array(id).default([]),
  otherHardcoreShare: unitInterval.optional(),
  startingRivalFans: z.record(z.string(), fanSharesSchema).default({}),
});

export const countriesFileSchema = z.strictObject({
  countries: z.array(countrySchema).min(1),
});

// ---- Sources (GDD "Real-world data": every field records its source and year) ----------------

/** Country fields that must carry a source, either a default or a per-market entry. */
export const SOURCED_FIELDS = [
  "population",
  "incomePerPerson",
  "urbanShare",
  "climate",
  "continent",
  "languages",
  "neighbors",
  "seaLinks",
  "otherHardcoreShare",
] as const;
export type SourcedField = (typeof SOURCED_FIELDS)[number];
/** Starting fan buckets are sourced per rival sport: "startingRivalFans.<rival id>". */
export const FAN_FIELD_PREFIX = "startingRivalFans.";

export const sourceEntrySchema = z
  .strictObject({
    /** A dataset listed under `datasets`. */
    dataset: id.optional(),
    year: z.int().optional(),
    /** A figure modeled for this project: says what it was modeled on. */
    estimate: z.string().min(1).optional(),
    note: z.string().min(1).optional(),
  })
  .refine((entry) => (entry.dataset === undefined) !== (entry.estimate === undefined), {
    message: 'needs exactly one of "dataset" (a published source) or "estimate" (a modeled figure)',
  });

export const sourcesFileSchema = z.strictObject({
  datasets: z.record(
    id,
    z.strictObject({
      title: z.string().min(1),
      url: z.string().min(1).optional(),
      retrieved: z.string().min(1).optional(),
    }),
  ),
  /** Applies to every market unless the market overrides it. */
  defaults: z.record(z.string(), sourceEntrySchema),
  countries: z.record(z.string(), z.record(z.string(), sourceEntrySchema)).default({}),
  markets: z.strictObject({
    added: z.record(z.string(), z.string().min(1)).default({}),
    omitted: z.record(z.string(), z.string().min(1)).default({}),
    "borders-dropped": z.record(z.string(), z.string().min(1)).default({}),
    "sea-links-folded-into-land-borders": z.array(z.string()).default([]),
  }),
});

// ---- Genome --------------------------------------------------------------------------------

/** A complete genome: exactly one option per axis, no extra axes. */
export const genomeSchema: z.ZodType<Genome> = z.strictObject({
  surface: z.enum(GENOME_AXES.surface.options),
  equipment: z.enum(GENOME_AXES.equipment.options),
  physical: z.enum(GENOME_AXES.physical.options),
  footprint: z.enum(GENOME_AXES.footprint.options),
  contact: z.enum(GENOME_AXES.contact.options),
  teamSize: z.enum(GENOME_AXES.teamSize.options),
  matchLength: z.enum(GENOME_AXES.matchLength.options),
  scoring: z.enum(GENOME_AXES.scoring.options),
  complexity: z.enum(GENOME_AXES.complexity.options),
  structure: z.enum(GENOME_AXES.structure.options),
});

export const leverSchema = z.enum(["affinity", "accessibility", "depth"]);
export const LEVERS = leverSchema.options;
export type Lever = z.infer<typeof leverSchema>;

/** Country attributes an option may condition on. */
export const numericAttributeSchema = z.enum([
  "wealth",
  "urbanDensity",
  "sportCulture",
  "mediaMarket",
]);
export const NUMERIC_ATTRIBUTES = numericAttributeSchema.options;
export type NumericAttribute = z.infer<typeof numericAttributeSchema>;

const numericConditions = Object.fromEntries(
  NUMERIC_ATTRIBUTES.map((attribute) => [attribute, delta.optional()]),
) as { [K in NumericAttribute]: z.ZodOptional<z.ZodNumber> };

/** Conditions for one lever: categorical (climate → delta) and numeric (attribute → weight). */
export const leverConditionsSchema = z.strictObject({
  climate: z.partialRecord(climateSchema, delta).optional(),
  ...numericConditions,
});

export const optionModifiersSchema = z.strictObject({
  base: z.partialRecord(leverSchema, delta).default({}),
  conditions: z.partialRecord(leverSchema, leverConditionsSchema).default({}),
});

const optionTables = Object.fromEntries(
  AXIS_IDS.map((axis) => [
    axis,
    z.strictObject(
      Object.fromEntries(
        GENOME_AXES[axis].options.map((option) => [option, optionModifiersSchema]),
      ),
    ),
  ]),
);

export const genomePresetSchema = z.strictObject({ id, genome: genomeSchema });

export const genomeFileSchema = z.strictObject({
  options: z.strictObject(optionTables) as unknown as z.ZodType<
    Record<AxisId, Record<string, OptionModifiers>>
  >,
  presets: z.array(genomePresetSchema).min(1),
});

// ---- Sports --------------------------------------------------------------------------------

export const rivalSportSchema = z.strictObject({ id, genome: genomeSchema });

export const sportsFileSchema = z.strictObject({
  rivals: z.array(rivalSportSchema).min(1),
  otherSports: z.strictObject({
    hardcoreShareByContinent: z.record(continentSchema, unitInterval),
  }),
});

// ---- Names ---------------------------------------------------------------------------------

export const namesFileSchema = z.strictObject({
  countries: z.record(z.string(), z.string().min(1)),
  sports: z.record(z.string(), z.string().min(1)),
});

// ---- Growth tree (GDD PP Growth Tree) ------------------------------------------------------

/** The GDD's growth categories. Phase 0 content defines Grassroots and Media only. */
export const growthCategorySchema = z.enum([
  "grassroots",
  "media",
  "infrastructure",
  "culture",
  "global",
]);
export type GrowthCategory = z.infer<typeof growthCategorySchema>;

/**
 * The closed node effect vocabulary the simulation can apply today (GDD PP Growth Tree). The GDD
 * also lists cash opportunity unlocks and backlash resistance; content using them is rejected until
 * the systems they act on exist.
 */
export const NODE_EFFECT_TYPES = [
  "spreadChannel",
  "casualConversion",
  "hardcoreConversion",
  "churnReduction",
  "formationThresholdReduction",
  "coldLaunchCostReduction",
  "ppIncome",
  "runningCostReduction",
  "countermoveResistance",
] as const;
export type NodeEffectType = (typeof NODE_EFFECT_TYPES)[number];
const NOT_YET_BUILT = ["cashOpportunityUnlock", "backlashResistance"];

export const nodeEffectTypeSchema = z.enum(NODE_EFFECT_TYPES, {
  error: (issue) => {
    const input = String(issue.input);
    const later = NOT_YET_BUILT.includes(input)
      ? " (in the GDD vocabulary, but the simulation cannot apply it yet)"
      : "";
    return `unknown node effect "${input}"${later}; allowed: ${NODE_EFFECT_TYPES.join(", ")}`;
  },
});

export const spreadChannelSchema = z.enum(["proximity", "language", "media"]);
export type SpreadChannel = z.infer<typeof spreadChannelSchema>;

export const nodeEffectSchema = z.strictObject({
  type: nodeEffectTypeSchema,
  /** Only for spreadChannel. */
  channel: spreadChannelSchema.optional(),
  amount: z
    .number()
    .min(-1)
    .max(1)
    .refine((value) => value !== 0, { message: "must not be zero" }),
  conditions: leverConditionsSchema.optional(),
});

export const growthNodeSchema = z.strictObject({
  id,
  category: growthCategorySchema,
  cost: z.number().positive(),
  requires: z.array(id).default([]),
  effects: z.array(nodeEffectSchema).min(1),
});

export const growthTreeFileSchema = z.strictObject({
  categories: z.partialRecord(growthCategorySchema, z.strictObject({ unlockTier: z.int().min(1) })),
  limits: z.strictObject({ minFactor: z.number().gt(0).max(1) }),
  forks: z.array(z.strictObject({ id, nodes: z.array(id).min(2) })).default([]),
  nodes: z.array(growthNodeSchema).min(1),
});

// ---- Config --------------------------------------------------------------------------------

const rate = unitInterval;

export const curveSchema = z
  .strictObject({
    type: z.enum(["log", "linear"]),
    low: z.number(),
    high: z.number(),
  })
  .refine((curve) => curve.high > curve.low, { message: "high must be greater than low" })
  .refine((curve) => curve.type !== "log" || curve.low > 0, {
    message: "a log curve needs low > 0",
  });

const clampSchema = z
  .strictObject({ min: z.number().min(0), max: z.number().min(0) })
  .refine((c) => c.max >= c.min, { message: "max must be at least min" });

// ---- Leagues (GDD League tiers, League Health Ladder) ---------------------------------------

/** League professionalization tiers, lowest first. Fixed by design; numbers live in config. */
export const leagueTierSchema = z.enum(["amateur", "semi-pro", "professional", "elite"]);
export const LEAGUE_TIERS = leagueTierSchema.options;
export type LeagueTierId = z.infer<typeof leagueTierSchema>;

/** Standing League Health Ladder rungs. "Collapsed" is not a standing rung: the league folds. */
export const healthLevelSchema = z.enum(["healthy", "struggling", "near-collapse"]);
export const HEALTH_LEVELS = healthLevelSchema.options;
export type HealthLevel = z.infer<typeof healthLevelSchema>;

/** A PP tier's breadth condition (GDD Global PP Tier Track). */
export const breadthConditionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("none") }),
  z.strictObject({ type: z.literal("anchorLeagueTier"), leagueTier: leagueTierSchema }),
  z.strictObject({ type: z.literal("anchorHardcoreShare"), share: z.number().gt(0).max(1) }),
  z.strictObject({
    type: z.literal("leaguesOnContinents"),
    leagueTier: leagueTierSchema,
    continents: z.int().min(1).max(6),
  }),
  z.strictObject({ type: z.literal("globalRank"), rank: z.int().min(1) }),
]);
export type BreadthCondition = z.infer<typeof breadthConditionSchema>;

export const ppTierSchema = z.strictObject({
  tier: z.int().min(1),
  fandomScoreRequired: z.number().min(0),
  breadth: breadthConditionSchema,
  turnLengthQuarters: z.int().min(1).max(4),
  focusSlots: z.int().min(1),
  costMultiplier: z.number().positive(),
  mediaRevenueMultiplier: z.number().positive(),
});

const leagueTierConfigSchema = z.strictObject({
  runningCost: z.number().min(0),
  minRunningCost: z.number().min(0),
  revenueMultiplier: z.number().positive(),
  promotion: z
    .strictObject({
      hardcoreShare: unitInterval,
      minHardcore: z.int().min(0),
      reserveQuarters: z.number().min(0),
      costQuarters: z.number().min(0),
    })
    .nullable(),
});

// ---- Rivals (GDD Rival AI) -----------------------------------------------------------------

/** A rival's per-country escalation ladder, lowest first. "none" means not yet paying attention. */
export const escalationLevelSchema = z.enum(["none", "watching", "defending", "entrenched"]);
export const ESCALATION_LEVELS = escalationLevelSchema.options;
export type EscalationLevel = z.infer<typeof escalationLevelSchema>;

/** The closed countermove list (GDD Rival AI). */
export const countermoveSchema = z.enum([
  "mediaBlitz",
  "youthPrograms",
  "broadcastDeal",
  "sponsorLockout",
  "ruleCopying",
]);
export const COUNTERMOVES = countermoveSchema.options;
export type CountermoveKind = z.infer<typeof countermoveSchema>;

/** Countermoves with an effect that lasts for a period; rule copying is instant and permanent. */
export const timedCountermoveSchema = z.enum([
  "mediaBlitz",
  "youthPrograms",
  "broadcastDeal",
  "sponsorLockout",
]);
export type TimedCountermoveKind = z.infer<typeof timedCountermoveSchema>;

const escalatedLevelSchema = z.enum(["watching", "defending", "entrenched"]);

const timedMoveBase = {
  minLevel: escalatedLevelSchema,
  baseCost: z.number().min(0),
  durationQuarters: z.int().min(1),
};

const perLevel = <T extends z.ZodType>(value: T) =>
  z.strictObject({ none: value, watching: value, defending: value, entrenched: value });

const axisWeights = Object.fromEntries(AXIS_IDS.map((axis) => [axis, z.number().min(0)])) as {
  [A in AxisId]: z.ZodNumber;
};

export const configFileSchema = z.strictObject({
  calendar: z.strictObject({ startYear: z.int() }),
  start: z.strictObject({
    anchorHardcoreFans: z.int().min(0),
    anchorCasualFans: z.int().min(0),
    startingPP: z.number().min(0),
    startingTier: z.int().min(1),
  }),
  fandomScore: z.strictObject({ casualWeight: unitInterval }),
  ppIncome: z.strictObject({
    scale: z.number().min(0),
    exponent: z.number().gt(0).max(1),
  }),
  ppTiers: z.array(ppTierSchema).min(1),
  attributeCurves: z.strictObject({
    wealth: curveSchema,
    urbanDensity: curveSchema,
    mediaMarket: curveSchema,
  }),
  levers: z.strictObject({
    affinity: clampSchema,
    accessibility: clampSchema,
    depth: clampSchema,
  }),
  similarity: z.strictObject({
    axisWeights: z.strictObject(axisWeights),
    casualFamiliarityBonus: z.number().min(0),
    hardcoreCrowdingPenalty: unitInterval,
    fullEffectHardcoreShare: z.number().gt(0).max(1),
  }),
  spread: z.strictObject({
    proximity: z.strictObject({ weight: z.number().min(0) }),
    language: z.strictObject({ weight: z.number().min(0), secondaryWeight: unitInterval }),
    media: z.strictObject({ weight: z.number().min(0), minMarketScore: unitInterval }),
  }),
  exposure: z.strictObject({
    localWeight: z.number().min(0),
    cap: z.number().positive(),
    retentionSaturation: z.number().positive(),
  }),
  focus: z.strictObject({
    inboundMultiplier: z.number().min(1),
    conversionMultiplier: z.number().min(1),
    outreachPeople: z.number().min(0),
    coldLaunchCost: z.number().min(0),
    exposedCost: z.number().min(0),
    costSaturationExposure: z.number().positive(),
  }),
  dynamics: z.strictObject({
    noise: z.number().min(0).lt(1),
    player: z.strictObject({
      casualConversionRate: z.number().min(0),
      casualChurnRate: rate,
      casualDecayRate: rate,
      hardcoreConversionRate: z.number().min(0),
    }),
    rival: z.strictObject({
      casualConversionRate: rate,
      casualChurnRate: rate,
      hardcoreConversionRate: rate,
    }),
  }),
  turnover: z.strictObject({
    annualRate: rate,
    floorShare: z.number().min(0).lt(1),
    rivalReplacement: z.number().min(0).max(1),
  }),
  poaching: z.strictObject({
    rate: rate,
    referenceShare: z.number().gt(0).max(1),
    maxStrength: z.number().min(0),
    floorShare: z.number().min(0).lt(1),
    defenseResistance: perLevel(unitInterval),
  }),
  rivalAI: z.strictObject({
    meaningfulHardcoreShare: z.number().gt(0).max(1),
    pressureSmoothing: z.number().gt(0).max(1),
    escalation: z.strictObject({
      thresholds: z.strictObject({
        watching: z.number().gt(0),
        defending: z.number().gt(0),
        entrenched: z.number().gt(0),
      }),
      minQuartersAtLevel: z.int().min(0),
      deescalationRatio: z.number().gt(0).max(1),
      deescalationQuarters: z.int().min(1),
    }),
    nearTop: z.strictObject({
      startRatio: z.number().min(0).lt(1),
      maxIntensity: z.number().min(1),
    }),
    budget: z.strictObject({
      incomePerFandomScore: z.number().min(0),
      capQuarters: z.number().positive(),
    }),
    movesPerQuarter: z.int().min(0),
    costPopulationExponent: z.number().min(0).max(1),
    preference: z.array(countermoveSchema),
    countermoves: z.strictObject({
      mediaBlitz: z.strictObject({ ...timedMoveBase, casualConversionBoost: z.number().min(0) }),
      youthPrograms: z.strictObject({
        ...timedMoveBase,
        hardcoreConversionBoost: z.number().min(0),
      }),
      broadcastDeal: z.strictObject(timedMoveBase),
      sponsorLockout: z.strictObject({ ...timedMoveBase, mediaRevenueCut: unitInterval }),
      ruleCopying: z.strictObject({
        minLevel: escalatedLevelSchema,
        cost: z.number().min(0),
        cooldownQuarters: z.int().min(0),
      }),
    }),
  }),
  hints: z.strictObject({
    plusPlus: z.number(),
    plus: z.number(),
    minus: z.number(),
  }),
  genomeBalance: z.strictObject({
    minHelpShare: unitInterval,
    minHurtShare: unitInterval,
    neutralDelta: z.number().min(0),
  }),
  worldChecks: z.strictObject({
    /** A country's hardcore shares across every sport may not exceed this (data sanity). */
    maxSportCulture: z.number().gt(0).max(1),
  }),
  leagues: z.strictObject({
    tiers: z.strictObject({
      amateur: leagueTierConfigSchema,
      "semi-pro": leagueTierConfigSchema,
      professional: leagueTierConfigSchema,
      elite: leagueTierConfigSchema,
    }),
    formation: z.strictObject({
      minHardcore: z.int().min(1),
      hardcoreShare: unitInterval,
      startingCashQuarters: z.number().min(0),
      reformCooldownQuarters: z.int().min(0),
    }),
    costs: z.strictObject({
      wealthFloor: unitInterval,
      referencePopulation: z.number().positive(),
      populationExponent: z.number().min(0).max(1),
    }),
    revenue: z.strictObject({
      gatePerHardcore: z.number().min(0),
      mediaPerCasual: z.number().min(0),
      wealthFloor: unitInterval,
      mediaMarketFloor: unitInterval,
    }),
    health: z.strictObject({
      strugglingRunwayQuarters: z.number().positive(),
      nearCollapseRunwayQuarters: z.number().positive(),
      hardcoreFallingRate: z.number().min(0),
      demotionShare: z.strictObject({
        struggling: unitInterval,
        "near-collapse": unitInterval,
        collapsed: unitInterval,
      }),
    }),
    stepDown: z.strictObject({ hardcoreDemotionShare: unitInterval }),
    bailout: z.strictObject({
      ppCost: z.number().min(0),
      cashQuarters: z.number().min(0),
      cooldownQuarters: z.int().min(0),
    }),
  }),
  seasonalWindow: z.strictObject({ quarterOfYear: z.int().min(1).max(4) }),
  tierTrack: z.strictObject({
    telegraphTurns: z.int().min(0),
    demotionLine: z.number().gt(0).lt(1),
    demotionTurns: z.int().min(1),
    cooldownTurns: z.int().min(0),
  }),
  balanceTargets: z.strictObject({
    differentiationTopN: z.int().min(1),
    differentiationSharedShare: unitInterval,
    dominanceLimit: unitInterval,
    dominanceZ: z.number().min(0),
    optionsGenomesPerAnchor: z.int().min(1),
    pacingTolerance: unitInterval,
    pacingAnchorPopulationQuantiles: z.tuple([unitInterval, unitInterval]),
    earlyCollapseTurn: z.int().min(1),
    turnsInTier: z.array(z.int().min(1)).min(1),
    naiveBot: z.string().min(1),
    naiveBotCollapseSeeds: z.int().min(1),
    experimentAnchors: z.int().min(1),
    hardAnchor: z.string().min(1),
  }),
});

// ---- Types ---------------------------------------------------------------------------------

export type Climate = z.infer<typeof climateSchema>;
export type Continent = z.infer<typeof continentSchema>;
export type FanShares = z.infer<typeof fanSharesSchema>;
export type Country = z.infer<typeof countrySchema>;
export type LeverConditions = z.infer<typeof leverConditionsSchema>;
export type OptionModifiers = z.infer<typeof optionModifiersSchema>;
export type GenomePreset = z.infer<typeof genomePresetSchema>;
export type GenomeContent = z.infer<typeof genomeFileSchema>;
export type RivalSport = z.infer<typeof rivalSportSchema>;
export type SportsContent = z.infer<typeof sportsFileSchema>;
export type Names = z.infer<typeof namesFileSchema>;
export type SourceEntry = z.infer<typeof sourceEntrySchema>;
export type Sources = z.infer<typeof sourcesFileSchema>;
export type NodeEffect = z.infer<typeof nodeEffectSchema>;
export type GrowthNode = z.infer<typeof growthNodeSchema>;
export type GrowthTreeContent = z.infer<typeof growthTreeFileSchema>;
export type Curve = z.infer<typeof curveSchema>;
export type PpTier = z.infer<typeof ppTierSchema>;
export type LeagueTierConfig = z.infer<typeof leagueTierConfigSchema>;
export type Config = z.infer<typeof configFileSchema>;
export type { AxisId, Genome } from "./genome-axes";
