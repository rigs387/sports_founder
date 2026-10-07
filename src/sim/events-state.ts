import { z } from "zod";
import {
  dealDemandSchema,
  dealSlotSchema,
  healthLevelSchema,
  leagueTierSchema,
  timedEventEffectSchema,
  traditionTypeSchema,
} from "../content";

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
  /** The champion's leading player and the season's top scorer, where recorded (GDD v1.16). */
  championPlayerId: z.int().positive().nullable(),
  topScorerId: z.int().positive().nullable(),
  topScorerScores: z.int().nonnegative().nullable(),
});

/**
 * The recorded flagship star fact a star card tells (GDD v1.16). Counts are the season's (breakout)
 * or the career's (every other card). `otherClubId` is the club a star moved from; `candidateId`
 * the successor a succession card names.
 */
export const starFactsSchema = z.strictObject({
  playerId: z.int().positive(),
  clubId: z.int().positive(),
  otherClubId: z.int().positive().nullable(),
  candidateId: z.int().positive().nullable(),
  season: z.int().positive(),
  scores: z.int().nonnegative(),
  matches: z.int().nonnegative(),
  clubScores: z.int().nonnegative(),
  seasons: z.int().nonnegative(),
});

/** The tradition a tradition card tells (GDD v1.22): its id and type, as recorded. */
export const traditionFactsSchema = z.strictObject({
  traditionId: z.int().positive(),
  type: traditionTypeSchema,
});

/** The deal a deal card tells (GDD v1.28), as recorded when it broke or ended. */
export const dealFactsSchema = z.strictObject({
  dealId: z.int().positive(),
  partnerId: z.string().min(1),
  slot: dealSlotSchema,
  /** The broken demand; null for a deal that ran its term. */
  demand: dealDemandSchema.nullable(),
  /** Cash the breach cost the league (0 for a deal that ran its term). */
  penalty: z.number().nonnegative(),
});

export const eventRecordSchema = z.strictObject({
  id: z.int().positive(),
  templateId: z.string(),
  countryId: z.string(),
  turn: z.int().positive(),
  /**
   * When the card's fact happened (quarters simulated by then; GDD v1.24): a landmark's quarter, or
   * the turn's end for cards judged then. Records offered before v1.24 hold the turn's end.
   */
  quarter: z.int().nonnegative(),
  facts: z.strictObject({
    casual: z.int().nonnegative(),
    hardcore: z.int().nonnegative(),
    leagueTier: leagueTierSchema.nullable(),
    health: healthLevelSchema.nullable(),
    rivalId: z.string().nullable(),
    season: seasonFactsSchema.nullable(),
    star: starFactsSchema.nullable(),
    tradition: traditionFactsSchema.nullable(),
    deal: dealFactsSchema.nullable(),
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
export type StarFacts = z.infer<typeof starFactsSchema>;
export type TraditionFacts = z.infer<typeof traditionFactsSchema>;
export type DealFacts = z.infer<typeof dealFactsSchema>;
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
