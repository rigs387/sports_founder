import { z } from "zod";

/** Reserved sport id for the player's own sport. Rivals may not use it. */
export const PLAYER_SPORT_ID = "player";

const id = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, "must be a lowercase id (letters, digits, hyphens)");
const unitInterval = z.number().min(0).max(1);

// Provisional categories until the genome × country affinity model is designed in detail.
export const climateSchema = z.enum(["cold", "temperate", "tropical", "arid"]);

export const countryAttributesSchema = z.strictObject({
  climate: climateSchema,
  wealth: unitInterval,
  urbanDensity: unitInterval,
  sportCulture: unitInterval,
  mediaMarket: unitInterval,
  languageGroup: id,
});

export const fanSharesSchema = z.strictObject({
  casual: unitInterval,
  hardcore: unitInterval,
});

export const countrySchema = z.strictObject({
  id,
  population: z.int().positive(),
  attributes: countryAttributesSchema,
  startingRivalFans: z.record(z.string(), fanSharesSchema).default({}),
});

export const countriesFileSchema = z.strictObject({
  countries: z.array(countrySchema).min(1),
});

export const rivalSportSchema = z.strictObject({ id });

export const sportsFileSchema = z.strictObject({
  rivals: z.array(rivalSportSchema).min(1),
});

export const namesFileSchema = z.strictObject({
  countries: z.record(z.string(), z.string().min(1)),
  sports: z.record(z.string(), z.string().min(1)),
});

const flowRatesSchema = z.strictObject({
  casualConversionRate: unitInterval,
  casualChurnRate: unitInterval,
  hardcoreConversionRate: unitInterval,
});

export const ppTierSchema = z.strictObject({
  tier: z.int().min(1),
  fandomScoreRequired: z.number().min(0),
  turnLengthQuarters: z.int().min(1).max(4),
});

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
  dynamics: z.strictObject({
    noise: z.number().min(0).lt(1),
    player: flowRatesSchema,
    rival: flowRatesSchema,
  }),
});

export type Climate = z.infer<typeof climateSchema>;
export type CountryAttributes = z.infer<typeof countryAttributesSchema>;
export type FanShares = z.infer<typeof fanSharesSchema>;
export type Country = z.infer<typeof countrySchema>;
export type RivalSport = z.infer<typeof rivalSportSchema>;
export type Names = z.infer<typeof namesFileSchema>;
export type PpTier = z.infer<typeof ppTierSchema>;
export type Config = z.infer<typeof configFileSchema>;
export type FlowRates = z.infer<typeof flowRatesSchema>;
