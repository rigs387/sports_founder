import { z } from "zod";
import { healthLevelSchema, leagueTierSchema, timedEventEffectSchema } from "../content";

/** The recorded flagship season a season card tells (GDD v1.15). */
export const seasonFactsSchema = z.strictObject({
  season: z.int().positive(),
  format: z.enum(["european", "american"]),
  championId: z.int().positive(),
  runnerUpId: z.int().positive(),
  /** The champion's titles in a row, this one included. */
  streak: z.int().positive(),
  /** Points between the top two of the final table. */
  pointsGap: z.int().nonnegative(),
  /** American format: the final's score margin (0 when deciders settled it). Null in European. */
  finalMargin: z.int().nonnegative().nullable(),
});

export const eventRecordSchema = z.strictObject({
  id: z.int().positive(),
  templateId: z.string(),
  countryId: z.string(),
  turn: z.int().positive(),
  quarter: z.int().nonnegative(),
  facts: z.strictObject({
    casual: z.int().nonnegative(),
    hardcore: z.int().nonnegative(),
    leagueTier: leagueTierSchema.nullable(),
    health: healthLevelSchema.nullable(),
    rivalId: z.string().nullable(),
    season: seasonFactsSchema.nullable(),
  }),
  resolution: z
    .strictObject({
      choiceId: z.string().nullable(),
      automatic: z.boolean(),
      turn: z.int().positive(),
      quarter: z.int().nonnegative(),
      cost: z.number().nonnegative(),
      ppGained: z.number().nonnegative(),
    })
    .nullable(),
});
export const eventStateSchema = z.strictObject({
  nextId: z.int().positive(),
  landmarkCursor: z.int().nonnegative(),
  offered: z.record(z.string(), z.int().positive()),
  /** Season card id → the flagship season it was last offered for (cooldowns in seasons). */
  seasonOffered: z.record(z.string(), z.int().positive()),
  pending: z.array(eventRecordSchema),
  history: z.array(eventRecordSchema),
  modifiers: z.array(
    z.strictObject({
      eventId: z.int().positive(),
      countryId: z.string(),
      effect: timedEventEffectSchema,
      endQuarter: z.int().positive(),
    }),
  ),
});
export type EventRecord = z.infer<typeof eventRecordSchema>;
export type SeasonFacts = z.infer<typeof seasonFactsSchema>;
export type EventState = z.infer<typeof eventStateSchema>;
export const emptyEvents = (landmarkCursor: number): EventState => ({
  nextId: 1,
  landmarkCursor,
  offered: {},
  seasonOffered: {},
  pending: [],
  history: [],
  modifiers: [],
});
