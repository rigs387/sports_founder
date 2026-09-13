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
  revenueMultiplier: z.number().positive(),
  promotion: z
    .strictObject({
      hardcoreShare: unitInterval,
      reserveQuarters: z.number().min(0),
      costQuarters: z.number().min(0),
    })
    .nullable(),
});

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
  hints: z.strictObject({
    plusPlus: z.number(),
    plus: z.number(),
    minus: z.number(),
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
    pacingTolerance: unitInterval,
    turnsInTier: z.array(z.int().min(1)).min(1),
    naiveBot: z.string().min(1),
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
export type Curve = z.infer<typeof curveSchema>;
export type PpTier = z.infer<typeof ppTierSchema>;
export type LeagueTierConfig = z.infer<typeof leagueTierConfigSchema>;
export type Config = z.infer<typeof configFileSchema>;
export type { AxisId, Genome } from "./genome-axes";
