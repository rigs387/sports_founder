import { z } from "zod";
import { healthLevelSchema, leagueTierSchema, timedEventEffectSchema } from "../content";

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
export type EventState = z.infer<typeof eventStateSchema>;
export const emptyEvents = (landmarkCursor: number): EventState => ({
  nextId: 1,
  landmarkCursor,
  offered: {},
  pending: [],
  history: [],
  modifiers: [],
});
