import { z } from "zod";
import { healthLevelSchema } from "./schemas";

export const timedEventEffectSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("conversion"),
    target: z.enum(["casual", "hardcore"]),
    factor: z.number().positive(),
    quarters: z.int().positive(),
  }),
  z.strictObject({
    type: z.literal("spread"),
    target: z.enum(["proximity", "language", "media"]),
    factor: z.number().positive(),
    quarters: z.int().positive(),
  }),
]);
export const eventEffectSchema = z.union([
  timedEventEffectSchema,
  z.strictObject({ type: z.literal("pp"), amount: z.number().nonnegative() }),
  z.strictObject({
    type: z.literal("fanShift"),
    target: z.enum(["uninterestedToCasual", "casualToHardcore"]),
    share: z.number().min(0).max(1),
  }),
  z.strictObject({ type: z.literal("hardcoreDemotion"), share: z.number().min(0).max(1) }),
  z.strictObject({ type: z.literal("rivalSetback"), share: z.number().min(0).max(1) }),
  z.strictObject({
    type: z.literal("leagueHealth"),
    steps: z.union([z.literal(-1), z.literal(1)]),
  }),
]);
const choice = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  cost: z.number().nonnegative(),
  effects: z.array(eventEffectSchema),
});
const template = z
  .strictObject({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    kind: z.enum(["moment", "decision"]),
    tone: z.enum(["positive", "pressure"]),
    priority: z.int(),
    trigger: z.enum([
      "audience",
      "leagueFormed",
      "leaguePromoted",
      "rivalEscalated",
      "leaguePressure",
    ]),
    minQuarter: z.int().nonnegative(),
    minFans: z.int().nonnegative(),
    minHardcore: z.int().nonnegative(),
    minTier: z.int().positive(),
    anchorOnly: z.boolean(),
    scope: z.enum(["campaign", "country"]),
    cooldownTurns: z.int().positive().nullable(),
    health: z.array(healthLevelSchema),
    effects: z.array(eventEffectSchema),
    choices: z.array(choice),
    defaultChoice: z.string().nullable(),
  })
  .superRefine((card, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (new Set(card.choices.map((c) => c.id)).size !== card.choices.length)
      issue("Duplicate choice id");
    if (card.kind === "moment" && (card.choices.length || card.defaultChoice !== null))
      issue("Moments have effects, not choices");
    if (card.kind === "decision") {
      const fallback = card.choices.find((c) => c.id === card.defaultChoice);
      if (card.choices.length < 2 || card.effects.length)
        issue("Decisions need at least two choices and no automatic effects");
      if (fallback?.cost !== 0 || fallback.effects.length)
        issue("Default choice must be a free, no-effect option");
    }
    for (const effect of [...card.effects, ...card.choices.flatMap((c) => c.effects)]) {
      if (effect.type === "rivalSetback" && card.trigger !== "rivalEscalated")
        issue("Rival setbacks require a recorded rival escalation");
      if (
        effect.type === "leagueHealth" &&
        !["leaguePressure", "leagueFormed", "leaguePromoted"].includes(card.trigger)
      )
        issue("Health effects require a league fact");
    }
  });
export const eventsFileSchema = z
  .strictObject({
    settings: z
      .strictObject({
        baseMoments: z.int().nonnegative(),
        momentsPerQuarter: z.number().nonnegative(),
        marketsPerExtraMoment: z.int().positive(),
        maxMoments: z.int().positive(),
        maxDecisions: z.int().positive(),
        activeFans: z.int().positive(),
        historyLimit: z.int().positive(),
        minFactor: z.number().positive(),
        maxFactor: z.number().positive(),
      })
      .refine((s) => s.minFactor <= 1 && s.maxFactor >= 1, "Factor bounds must include 1"),
    cards: z.array(template),
  })
  .superRefine((data, ctx) => {
    if (new Set(data.cards.map((c) => c.id)).size !== data.cards.length)
      ctx.addIssue({ code: "custom", path: ["cards"], message: "Duplicate event id" });
  });
export type EventsContent = z.infer<typeof eventsFileSchema>;
export type EventTemplate = EventsContent["cards"][number];
export type EventEffect = z.infer<typeof eventEffectSchema>;
export type TimedEventEffect = z.infer<typeof timedEventEffectSchema>;
