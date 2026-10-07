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
/** One value for each scoring frequency option (low, medium, high). */
const byScoring = <T extends z.ZodType>(value: T) =>
  z.strictObject({ low: value, medium: value, high: value });

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

// ---- Culture (GDD v1.22) -------------------------------------------------------------------

/** The closed tradition vocabulary of the first build: four traditions and two artifacts. */
export const TRADITION_TYPES = [
  "derby",
  "rite",
  "legacy",
  "nationalName",
  "venue",
  "trophy",
] as const;
export const traditionTypeSchema = z.enum(TRADITION_TYPES);
export type TraditionType = z.infer<typeof traditionTypeSchema>;
const byTradition = <T extends z.ZodType>(value: T) =>
  z.strictObject({
    derby: value,
    rite: value,
    legacy: value,
    nationalName: value,
    venue: value,
    trophy: value,
  });

// ---- Sport identity (GDD v1.18) ------------------------------------------------------------

const idList = z.array(id).min(1);
export const identityFileSchema = z.strictObject({
  birthplaces: idList,
  ethos: idList,
  /** The first of each list is the default. */
  terms: z.strictObject({ score: idList, match: idList, season: idList }),
  emblem: z.strictObject({
    shapes: idList,
    icons: idList,
    colors: z.record(id, z.string().regex(/^#[0-9a-f]{6}$/i)),
  }),
  playersPerSide: z.strictObject({
    small: z.int().min(1),
    medium: z.int().min(1),
    large: z.int().min(1),
  }),
  maxOddLines: z.int().min(0),
  /** A deadpan rulebook line where every listed axis has the listed option. */
  oddPairings: z.array(z.strictObject({ id, when: z.record(z.string(), z.string()) })),
  /**
   * Founding character in Culture (GDD v1.22): each birthplace's ease per tradition type, and
   * each ethos's multipliers on the three betrayals.
   */
  culture: z.strictObject({
    birthplaces: z.record(id, byTradition(z.number().positive())),
    ethos: z.record(
      id,
      z.strictObject({
        rules: z.number().positive(),
        seat: z.number().positive(),
        rename: z.number().positive(),
      }),
    ),
  }),
});
export type IdentityContent = z.infer<typeof identityFileSchema>;

// ---- Names ---------------------------------------------------------------------------------

export const namesFileSchema = z.strictObject({
  countries: z.record(z.string(), z.string().min(1)),
  sports: z.record(z.string(), z.string().min(1)),
  /** Each rival's world championship (GDD v1.17): generic names, never the real tournament's. */
  tournaments: z.record(z.string(), z.string().min(1)),
  /** Generated default sport names (GDD v1.18): a first part and a second part joined. */
  sportNameParts: z.strictObject({
    first: z.array(z.string().min(1)).min(1),
    second: z.array(z.string().min(1)).min(1),
  }),
  /**
   * Flagship deal partners (GDD v1.28): invented names, never real brands or broadcasters. Ids are
   * stable (a shunned partner is remembered by id).
   */
  dealPartners: z.strictObject({
    broadcasters: z.array(z.strictObject({ id, name: z.string().min(1) })).min(1),
    sponsors: z.array(z.strictObject({ id, name: z.string().min(1), sector: id })).min(1),
  }),
  /** The default founding ground is the club's town and one of these words. */
  groundWords: z.array(z.string().min(1)).min(1),
  /** Culture (GDD v1.22): tradition name pools and the rivals' flavor traditions. */
  traditions: z.strictObject({
    rites: z.record(id, z.array(z.string().min(1)).min(1)),
    /** By language sphere; `default` for spheres without a pool. */
    nationalNames: z.record(id, z.array(z.string().min(1)).min(1)),
    rivals: z.record(
      id,
      z.array(
        z.strictObject({
          id,
          type: traditionTypeSchema,
          countryId: z.string().min(1),
          name: z.string().min(1),
        }),
      ),
    ),
  }),
  /**
   * Invented flagship club nicknames (GDD v1.14). The place is real (places.yaml); the nickname is
   * not. Needs at least as many distinct entries as the largest flagship has clubs.
   */
  clubNicknames: z.array(z.string().min(1)).min(1),
  /**
   * Invented flagship player names (GDD v1.16), by pool. A country uses the pool of its primary
   * language sphere unless `countries` names a regional pool for it.
   */
  playerNames: z.strictObject({
    countries: z.record(z.string(), id),
    pools: z.record(
      id,
      z.strictObject({
        order: z.enum(["givenFirst", "familyFirst"]).default("givenFirst"),
        given: z.array(z.string().min(1)),
        family: z.array(z.string().min(1)),
      }),
    ),
  }),
});

// ---- Places (GDD v1.14: clubs belong to real places) ---------------------------------------

export const placeSchema = z.strictObject({
  name: z.string().min(1),
  population: z.int().min(0),
});
export const placesFileSchema = z.strictObject({
  places: z.record(z.string(), z.array(placeSchema).min(1)),
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
  // Culture (GDD v1.22): nurture traditions that exist, never create one.
  "traditionStrength",
  "traditionReach",
  "traditionProtection",
  "traditionHold",
] as const;
/** The Culture effects: global (no conditions), optionally limited to one tradition type. */
export const TRADITION_EFFECT_TYPES: readonly NodeEffectType[] = [
  "traditionStrength",
  "traditionReach",
  "traditionProtection",
  "traditionHold",
];
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
  /** Only for the Culture effects: limits the effect to one tradition type. */
  traditionType: traditionTypeSchema.optional(),
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
  /** How a node's price grows with the sport's size (GDD PP Growth Tree, decided 2026-09-19). */
  costScaling: z.strictObject({
    referenceFandomScore: z.number().positive(),
    exponent: z.number().min(0),
  }),
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
/** How gripping the flagship's last season was, for its broadcast (GDD v1.23). */
export const seasonInterestSchema = z.enum(["gripping", "ordinary", "dynasty", "runaway"]);
export type SeasonInterest = z.infer<typeof seasonInterestSchema>;
const seasonInterestMap = <T extends z.ZodType>(value: T) =>
  z.strictObject({ gripping: value, ordinary: value, dynasty: value, runaway: value });

/** The homegrown gear brand's partner id (GDD v1.28): reserved, never in names.yaml. */
export const GEAR_BRAND_ID = "gear-brand";
/** A flagship deal slot's kind (GDD v1.28). */
export const dealSlotSchema = z.enum(["tv", "sponsor", "namingRights"]);
export type DealSlot = z.infer<typeof dealSlotSchema>;
/** What a deal can demand (GDD v1.28). Demands never block: doing the thing breaks the deal. */
export const dealDemandSchema = z.enum([
  "ruleChange",
  "tierFloor",
  "seatLock",
  "exclusivity",
  "balance",
  "star",
  "fans",
]);
/**
 * Clauses (GDD v1.29): what a partner wants of the product, judged at each season's end. Soft: a
 * miss is no breach; enough misses in a row and the partner walks.
 */
export const DEAL_CLAUSES = ["balance", "star", "fans"] as const;
export const dealClauseSchema = z.enum(DEAL_CLAUSES);
export type DealClause = (typeof DEAL_CLAUSES)[number];
export type DealDemand = z.infer<typeof dealDemandSchema>;

const byLeagueTier = <T extends z.ZodType>(value: T) =>
  z.strictObject({ amateur: value, "semi-pro": value, professional: value, elite: value });
/** A rule a partner wants: one step of `axis` toward `toward`. Checked against the genome at load. */
const ruleWishSchema = z.strictObject({ axis: z.string().min(1), toward: z.string().min(1) });

const dealsSchema = z
  .strictObject({
    /** Share of today's media line the flagship keeps with no deals. */
    baselineShare: unitInterval,
    /** Sponsor slots by the flagship league's tier; the first is the main sponsor. */
    sponsorSlots: byLeagueTier(z.int().min(1)),
    /** Offers per open slot each offseason. At least 2, so one is always without a rule demand. */
    offersPerSlot: z.strictObject({ min: z.int().min(2), max: z.int().min(2) }),
    /** Deal lengths in seasons. */
    seasons: z.strictObject({ min: z.int().min(1), max: z.int().min(1) }),
    /**
     * An ordinary offer's value a quarter (× 4 for its annual value), before demands and the cap,
     * like today's media line: × the league tier's revenue multiplier and the PP tier's media
     * revenue multiplier, × uniform(1 ± spread):
     *   tv           = casual × tvPerCasual × media market factor
     *   sponsor      = (casual + hardcore) × sponsorPerFan × wealth factor × slot share
     *   namingRights = hardcore × namingPerHardcore × wealth factor
     */
    value: z.strictObject({
      tvPerCasual: z.number().min(0),
      sponsorPerFan: z.number().min(0),
      namingPerHardcore: z.number().min(0),
      /** Each sponsor slot's share of the full sponsor value, main sponsor first. */
      sponsorSlotShares: z.array(z.number().min(0)).min(1),
      spread: unitInterval,
    }),
    /** An offer is at most this × the league's annual running cost, by PP tier (1 first). */
    capByPpTier: z.array(z.number().min(0)).min(1),
    /** Each demand's chance on an offer and its premium on the value. One demand per offer. */
    demands: z.strictObject({
      tierFloor: z.strictObject({ chance: unitInterval, premium: z.number().min(0) }),
      seatLock: z.strictObject({ chance: unitInterval, premium: z.number().min(0) }),
      exclusivity: z.strictObject({ chance: unitInterval, premium: z.number().min(0) }),
      ruleChange: z.strictObject({ premium: z.number().min(0) }),
      /** Clauses (GDD v1.29): balance on TV offers, star on sponsor offers, fans on any. */
      balance: z.strictObject({ chance: unitInterval, premium: z.number().min(0) }),
      star: z.strictObject({ chance: unitInterval, premium: z.number().min(0) }),
      fans: z.strictObject({ chance: unitInterval, premium: z.number().min(0) }),
    }),
    /**
     * Judging clauses at each season's end (GDD v1.29): met pays bonusShare of the annual value
     * and adds renewalEdgePerMet to the partner's renewal edge; walkAfterMisses misses in a row and
     * the partner walks.
     */
    clauses: z.strictObject({
      bonusShare: z.number().min(0),
      renewalEdgePerMet: z.number().min(0),
      walkAfterMisses: z.int().min(1),
      /** The fans clause is met while fans stay within this share below the mark. */
      fansTolerance: unitInterval,
    }),
    /** No tier floor below this league tier: an Amateur floor would be no demand. */
    tierFloorMinTier: leagueTierSchema,
    /**
     * Rule demands are rare and never required (GDD v1.28): at most one offer with one per
     * offseason, only with chancePerOffseason, none while a signed deal's rule demand is due. It is
     * due by the close of the deal's dueOffseasons-th offseason. Wishes by partner kind.
     */
    ruleDemand: z.strictObject({
      chancePerOffseason: unitInterval,
      dueOffseasons: z.int().min(1),
      wishes: z.strictObject({
        tv: z.array(ruleWishSchema).min(1),
        sponsor: z.array(ruleWishSchema).min(1),
      }),
    }),
    /** A breach: penaltySeasons × the annual value in cash; the partner shuns for shunSeasons. */
    breach: z.strictObject({ penaltySeasons: z.number().min(0), shunSeasons: z.int().min(0) }),
    /** A renewal from the current partner: today's value × (1 + edge). */
    renewalEdge: z.number().min(0),
    /** The homegrown gear brand: a demand-free main-sponsor offer at valueShare of an ordinary one. */
    gearBrand: z.strictObject({ valueShare: z.number().min(0), renewalEdge: z.number().min(0) }),
    /** The growth tree's TV fork shapes TV offers (node ids checked at load). */
    tvFork: z.record(
      z.string().min(1),
      z.strictObject({ value: z.number().min(0), exclusivityChance: z.number().min(0) }),
    ),
    /** TV exclusivity cuts the broadcast's lift by this share while it runs. */
    exclusivityLiftCut: unitInterval,
    /** A rival's sponsor lockout in the seat country: sponsor offers × value, offersCut fewer. */
    sponsorLockout: z.strictObject({ value: unitInterval, offersCut: z.int().min(0) }),
    /**
     * Naming rights on a famous ground betray it (GDD v1.28): hardcoreDemotionShare × the
     * tradition's weight × ethos of seat-country hardcore fans turn casual, the tradition wears by
     * traditionWear, and its pilgrimage is cut by pilgrimageCut while the name stands. On the
     * founding ground the club rite is offended the same way.
     */
    namingRights: z.strictObject({
      hardcoreDemotionShare: unitInterval,
      traditionWear: unitInterval,
      pilgrimageCut: unitInterval,
    }),
  })
  .refine((d) => d.offersPerSlot.max >= d.offersPerSlot.min, "offersPerSlot.max is below min")
  .refine((d) => d.seasons.max >= d.seasons.min, "seasons.max is below min");

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
  backingSlots: z.int().min(0),
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
  "reclaim",
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
  "reclaim",
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
    nearTop: z
      .strictObject({
        startRatio: z.number().min(0).lt(1),
        peakRatio: z.number().gt(0),
        maxIntensity: z.number().min(1),
        positionPressure: z.number().min(0),
      })
      .refine((near) => near.peakRatio > near.startRatio, {
        message: "peakRatio must be greater than startRatio",
      }),
    /** How much a market matters to rivals (GDD v1.21): it divides escalation thresholds there. */
    marketValue: z.strictObject({
      referencePopulation: z.number().positive(),
      exponent: z.number().min(0),
      min: z.number().positive(),
      max: z.number().positive(),
    }),
    budget: z.strictObject({
      incomePerFandomScore: z.number().min(0),
      capQuarters: z.number().positive(),
    }),
    movesPerQuarter: z.int().min(0),
    costPopulationExponent: z.number().min(0).max(1),
    preference: z.array(countermoveSchema),
    countermoves: z.strictObject({
      reclaim: z.strictObject({
        ...timedMoveBase,
        /** Share of the player's hardcore fans there (above the turnover floor) won back per quarter. */
        sharePerQuarter: unitInterval,
        /** Bought only at or past this point of the near-top ramp (0 at intensity 1, 1 at max). */
        minNearTopProgress: unitInterval,
      }),
      mediaBlitz: z.strictObject({ ...timedMoveBase, casualConversionBoost: z.number().min(0) }),
      youthPrograms: z.strictObject({
        ...timedMoveBase,
        hardcoreConversionBoost: z.number().min(0),
        homeLift: z.number().min(0),
      }),
      broadcastDeal: z.strictObject(timedMoveBase),
      sponsorLockout: z.strictObject({ ...timedMoveBase, mediaRevenueCut: unitInterval }),
      ruleCopying: z.strictObject({
        minLevel: escalatedLevelSchema,
        cost: z.number().min(0),
        cooldownQuarters: z.int().min(0),
      }),
    }),
    /** Each rival's quadrennial world championship (GDD v1.17), on its real cycle. */
    tournaments: z.array(
      z.strictObject({
        sportId: z.string().min(1),
        firstYear: z.int(),
        everyYears: z.int().min(1),
        /** The quarter of the year it starts, 1–4. */
        startQuarterOfYear: z.int().min(1).max(4),
        /** Quarters the surge lasts from the start. */
        quarters: z.int().min(1),
        casualConversionBoost: z.number().min(0),
        hardcoreConversionBoost: z.number().min(0),
        homeLift: z.number().min(0),
      }),
    ),
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
  offseason: z.strictObject({ seasonEndQuarter: z.int().min(1).max(4) }),
  /**
   * A giant market is many audiences (GDD v1.21): genome fit (every option's lever deltas) in a
   * country is × min(1, (referencePopulation ÷ population) ^ fitExponent), never below minScale.
   */
  bigMarkets: z.strictObject({
    referencePopulation: z.number().positive(),
    fitExponent: z.number().min(0),
    minScale: unitInterval,
  }),
  /**
   * Wealth levels (GDD v1.21): income per person at or above each threshold moves a market up one
   * level. Each level weighs Prestige income and how hard rivals defend there.
   */
  wealthLevels: z
    .strictObject({
      thresholds: z.array(z.number().positive()),
      levels: z
        .array(
          z.strictObject({
            id,
            ppWeight: z.number().positive(),
            defenseWeight: z.number().positive(),
          }),
        )
        .min(1),
    })
    .refine((w) => w.levels.length === w.thresholds.length + 1, {
      message: "one more level than thresholds",
    })
    .refine((w) => w.thresholds.every((t, i) => i === 0 || t > (w.thresholds[i - 1] ?? 0)), {
      message: "thresholds must rise",
    }),
  /** Rules evolution, first build (GDD v1.20). */
  rulesEvolution: z.strictObject({
    basePrice: z.number().min(0),
    /** Jumps for traits whose options have no order; others count steps between options. */
    fixedJump: z.record(z.string(), z.int().min(1)),
    backlash: z.strictObject({
      sharePerJump: unitInterval,
      fullAgeYears: z.number().positive(),
      anchorFactor: z.number().min(1),
      fitWeight: z.number().min(0),
      /** Per step the new rule sits from the sport's founding rule. */
      driftWeight: z.number().min(0),
      /** Multiplies the backlash of a move back toward the founding rule. */
      returnFactor: unitInterval,
      maxShare: unitInterval,
    }),
    /** Markets besides the anchor whose fit hints a review shows. */
    previewMarkets: z.int().min(0),
  }),
  /** Culture, first build (GDD v1.22). */
  culture: z.strictObject({
    startStrength: unitInterval,
    renewal: unitInterval,
    decayPerYear: unitInterval,
    honorsBonus: unitInterval,
    derby: z.strictObject({ meetings: z.int().min(1), seasons: z.int().min(1) }),
    legacy: z.strictObject({ starSeasons: z.int().min(1) }),
    venue: z.strictObject({ fameFacts: z.int().min(1), foundingFacts: z.int().min(0) }),
    weightCap: z.number().positive(),
    turnoverCut: unitInterval,
    poachCut: unitInterval,
    pilgrimage: z.number().min(0),
    championBonus: z.number().min(0),
    backlashWeight: z.number().min(0),
    amendmentDamage: unitInterval,
    seatWeight: z.number().min(0),
    renameShare: unitInterval,
    reach: z.strictObject({
      minStrength: unitInterval,
      chancePerReach: z.number().min(0),
      followerShare: unitInterval,
      minHardcoreShare: unitInterval,
    }),
    birthPP: byTradition(z.number().min(0)),
    characterBand: unitInterval,
  }),
  /** Sport identity (GDD v1.18): limits on the names the player types, after trimming. */
  identity: z.strictObject({
    nameMinLength: z.int().min(1),
    sportNameMaxLength: z.int().min(1),
    clubNameMaxLength: z.int().min(1),
    groundNameMaxLength: z.int().min(1),
    trophyNameMaxLength: z.int().min(1),
  }),
  flagship: z.strictObject({
    clubs: z.strictObject({
      amateur: z.int().min(2),
      "semi-pro": z.int().min(2),
      professional: z.int().min(2),
      elite: z.int().min(2),
    }),
    /** American format: the playoff field for the most clubs at or above each size. */
    playoffs: z.array(z.strictObject({ minClubs: z.int().min(2), clubs: z.int().min(2) })).min(1),
    points: z.strictObject({ win: z.int().min(0), draw: z.int().min(0) }),
    /** By the genome's scoring frequency (GDD v1.16): chances per side and the scoring rate. */
    match: z.strictObject({
      chances: byScoring(z.int().min(1)),
      baseRate: byScoring(unitInterval),
      ratingEffect: byScoring(z.number().min(0)),
      homeAdvantage: z.number().min(0),
      minRate: unitInterval,
      maxRate: unitInterval,
      maxDeciders: z.int().min(1),
    }),
    rating: z.strictObject({
      start: z.number(),
      startSpread: z.number().min(0),
      min: z.number(),
      max: z.number(),
      drift: z.number().min(0),
      reversion: unitInterval,
      financePull: unitInterval,
      healthTarget: z.strictObject({
        healthy: z.number(),
        struggling: z.number(),
        "near-collapse": z.number(),
      }),
      expansionPenalty: z.number().min(0),
    }),
    /** A new club's place is drawn with weight population ^ placeWeightExponent. */
    placeWeightExponent: z.number().min(0),
    /** Backing stars (GDD v1.16). */
    backing: z.strictObject({
      basePrice: z.number().min(0),
      influenceSeasons: z.int().min(1),
      casualConversion: z.number().min(0),
      mediaReach: z.number().min(0),
    }),
    /** Stars (GDD v1.16). */
    stars: z.strictObject({
      share: z.strictObject({ low: unitInterval, medium: unitInterval, high: unitInterval }),
      places: z.strictObject({
        amateur: z.int().min(0),
        "semi-pro": z.int().min(0),
        professional: z.int().min(0),
        elite: z.int().min(0),
      }),
      strengthPerSkill: z.number().min(0),
      moveChance: unitInterval,
      breakoutPP: z.strictObject({
        amateur: z.number().min(0),
        "semi-pro": z.number().min(0),
        professional: z.number().min(0),
        elite: z.number().min(0),
      }),
      keepCashQuarters: z.number().min(0),
      mentorMaxAge: z.int().min(0),
      mentorCreditLift: unitInterval,
      mentorShare: unitInterval,
      afterglowSeasons: z.int().min(1),
      dropDemotionShare: unitInterval,
      recordMinSeasons: z.int().min(1),
    }),
    /** Leading players (GDD v1.16). */
    players: z.strictObject({
      foundingAge: z.strictObject({ min: z.int().min(0), max: z.int().min(0) }),
      skill: z.strictObject({ min: z.number(), max: z.number() }),
      peakSkill: z.strictObject({ mean: z.number(), spread: z.number().min(0) }),
      career: z.strictObject({
        peakAge: z.int().min(0),
        declineAge: z.int().min(0),
        risePerYear: unitInterval,
        declinePerYear: unitInterval,
        wobble: z.number().min(0),
      }),
      finalSeason: z.strictObject({
        fromAge: z.int().min(0),
        base: unitInterval,
        perYear: z.number().min(0),
        perLostShare: z.number().min(0),
        lastAge: z.int().min(0),
      }),
      replacement: z.strictObject({
        age: z.strictObject({ min: z.int().min(0), max: z.int().min(0) }),
        ratingLean: z.number().min(0),
      }),
      nameRetries: z.int().min(0),
      minNamePool: z.int().min(1),
      credit: z.strictObject({
        base: unitInterval,
        perSkill: z.number().min(0),
        pivot: z.number(),
        min: unitInterval,
        max: unitInterval,
      }),
    }),
    seatEligibleTiers: z.array(leagueTierSchema).min(1),
    seatMove: z.strictObject({
      hardcoreDemotionShare: unitInterval,
      anchorHardcoreDemotionShare: unitInterval,
    }),
    /** The flagship season as cards (GDD v1.15). */
    stories: z
      .strictObject({
        championPP: z.strictObject({
          amateur: z.number().min(0),
          "semi-pro": z.number().min(0),
          professional: z.number().min(0),
          elite: z.number().min(0),
        }),
        ratingStep: z.number().positive(),
        dynastyTitles: z.int().min(2),
        foregoneTitles: z.int().min(3),
        runawayShare: z.number().positive(),
        closeFinishWins: z.number().min(0),
        closeFinalMargin: byScoring(z.int().min(0)),
        underdogDivisor: z.int().min(2),
      })
      .refine(
        (s) => s.foregoneTitles > s.dynastyTitles,
        "foregoneTitles must exceed dynastyTitles (a foregone league replaces a dynasty)",
      ),
    /** The flagship's broadcast (GDD v1.23): media reach out of the seat country. */
    broadcast: z.strictObject({
      ceiling: z.strictObject({
        amateur: z.number().min(0),
        "semi-pro": z.number().min(0),
        professional: z.number().min(0),
        elite: z.number().min(0),
      }),
      interest: seasonInterestMap(unitInterval),
      health: z.strictObject({
        healthy: unitInterval,
        struggling: unitInterval,
        "near-collapse": unitInterval,
      }),
      pulse: z.strictObject({
        size: z.number().min(0),
        fadeQuarters: z.int().min(1),
        story: seasonInterestMap(z.number().min(0)),
      }),
      rippleShare: unitInterval,
    }),
    /** Flagship deals (GDD v1.28, tech plan 2.15). */
    deals: dealsSchema,
  }),
  tierTrack: z.strictObject({
    telegraphTurns: z.int().min(0),
    demotionLine: z.number().gt(0).lt(1),
    demotionTurns: z.int().min(1),
    cooldownTurns: z.int().min(0),
  }),
  win: z.strictObject({ holdTurns: z.int().min(1), requiredTier: z.int().min(1) }),
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
    nodeDominanceBots: z.array(z.string().min(1)).min(1),
    nodeDominanceGenomesPerBot: z.int().min(1),
    experimentAnchors: z.int().min(1),
    hardAnchor: z.string().min(1),
    /** The flagship broadcast's share of the player's world media reach exposure (GDD v1.23). */
    flagshipBroadcastShare: z.tuple([unitInterval, unitInterval]),
    /** A full slate of ordinary deals as a share of the media line it replaces (GDD v1.28). */
    dealSlateShare: z.tuple([z.number().min(0), z.number().min(0)]),
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
export type Place = z.infer<typeof placeSchema>;
export type Places = z.infer<typeof placesFileSchema>["places"];
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
