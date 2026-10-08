import { z } from "zod";
import { healthLevelSchema, leagueTierSchema } from "./schemas";

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
  // Flagship season cards only (GDD v1.15): the champion's rating, or every other active club's,
  // moves by `steps` × flagship.stories.ratingStep.
  z.strictObject({
    type: z.literal("clubRating"),
    target: z.enum(["champion", "field"]),
    steps: z.int().refine((steps) => steps !== 0, "steps must not be 0"),
  }),
  // Star cards only (GDD v1.16): retire a backed star with honors, mentor the named successor,
  // or keep a backed star from moving for flagship league cash.
  z.strictObject({ type: z.literal("starHonors") }),
  z.strictObject({ type: z.literal("starMentor") }),
  z.strictObject({ type: z.literal("starKeep") }),
  // The repeat-final card only (GDD v1.22): one extra meeting toward a derby between the two clubs.
  z.strictObject({ type: z.literal("derbyStoke") }),
]);
/**
 * The tradition facts a card can tell (GDD v1.22): a tradition born or lost, and a chant's first
 * follower abroad (GDD v1.31).
 */
export const TRADITION_CARDS = ["born", "lost", "spread"] as const;
/** The deal facts a deal card tells (GDD v1.28): a breach, or a deal that ran its term. */
export const DEAL_CARDS = ["broken", "ended", "walked"] as const;
export type DealCard = (typeof DEAL_CARDS)[number];
/** The venue facts a card can tell (GDD v1.30): a level opening, a modernizing one, a record. */
export const VENUE_CARDS = ["opened", "modernized", "record"] as const;
export type VenueCard = (typeof VENUE_CARDS)[number];
export type TraditionCard = (typeof TRADITION_CARDS)[number];
/** The flagship star facts a card can tell (GDD v1.16). */
export const STAR_CARDS = [
  "breakout",
  "finalSeason",
  "retired",
  "moved",
  "record",
  "succession",
  "keepOrMove",
  "dropped",
] as const;
export type StarCard = (typeof STAR_CARDS)[number];
const STAR_DECISIONS: readonly StarCard[] = ["succession", "keepOrMove", "dropped"];
const STAR_EFFECT_CARD = {
  starHonors: "succession",
  starMentor: "succession",
  starKeep: "keepOrMove",
};
/** The flagship season facts a card can tell (GDD v1.15), highest priority first after the champion. */
export const SEASON_STORIES = [
  "champion",
  "foregone",
  "runaway",
  "dynasty",
  "repeatFinal",
  "underdog",
  "firstTitle",
  "closeFinish",
] as const;
export type SeasonStory = (typeof SEASON_STORIES)[number];
/** How much a moment matters on the world map (GDD v1.26): a toast, a back page or a front page. */
export const MOMENT_WEIGHTS = ["minor", "big", "headline"] as const;
export type MomentWeight = (typeof MOMENT_WEIGHTS)[number];
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
      "rivalReclaim",
      "rivalTournament",
      "leaguePressure",
      "seasonEnd",
      "star",
      "tradition",
      "deal",
      "venue",
      "hall",
      "award",
    ]),
    /** seasonEnd cards only: the season fact the card tells. */
    story: z.enum(SEASON_STORIES).nullable().default(null),
    /** star cards only: the star fact the card tells. */
    star: z.enum(STAR_CARDS).nullable().default(null),
    /** tradition cards only: whether the card tells a birth or a loss. */
    tradition: z.enum(TRADITION_CARDS).nullable().default(null),
    /** deal cards only: whether the card tells a breach or a deal's end (GDD v1.28). */
    deal: z.enum(DEAL_CARDS).nullable().default(null),
    /** venue cards only: which venue fact the card tells (GDD v1.30). */
    venue: z.enum(VENUE_CARDS).nullable().default(null),
    minQuarter: z.int().nonnegative(),
    minFans: z.int().nonnegative(),
    minHardcore: z.int().nonnegative(),
    minTier: z.int().positive(),
    anchorOnly: z.boolean(),
    scope: z.enum(["campaign", "country"]),
    cooldownTurns: z.int().positive().nullable(),
    /** seasonEnd cards count cooldowns in seasons, since turn length changes with the PP tier. */
    cooldownSeasons: z.int().positive().nullable().default(null),
    health: z.array(healthLevelSchema),
    effects: z.array(eventEffectSchema),
    /** Pressure season cards: effects that land when the card arrives, whatever the answer. */
    arrivalEffects: z.array(timedEventEffectSchema).default([]),
    choices: z.array(choice),
    defaultChoice: z.string().nullable(),
    /** Moments only (GDD v1.26): minor (toast), big (back page) or headline (front page). */
    weight: z.enum(MOMENT_WEIGHTS).nullable().default(null),
  })
  .superRefine((card, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (new Set(card.choices.map((c) => c.id)).size !== card.choices.length)
      issue("Duplicate choice id");
    if (card.kind === "moment" && (card.choices.length || card.defaultChoice !== null))
      issue("Moments have effects, not choices");
    if ((card.kind === "moment") !== (card.weight !== null))
      issue("Every moment has a weight, and only moments");
    if (card.kind === "decision") {
      const fallback = card.choices.find((c) => c.id === card.defaultChoice);
      if (card.choices.length < 2 || card.effects.length)
        issue("Decisions need at least two choices and no automatic effects");
      if (fallback?.cost !== 0 || fallback.effects.length)
        issue("Default choice must be a free, no-effect option");
    }
    const season = card.trigger === "seasonEnd";
    if (season !== (card.story !== null)) issue("Season stories need the seasonEnd trigger");
    const star = card.trigger === "star";
    if (star !== (card.star !== null)) issue("Star cards need the star trigger");
    const tradition = card.trigger === "tradition";
    if (tradition !== (card.tradition !== null))
      issue("Tradition cards need the tradition trigger");
    if (tradition) {
      if (card.kind !== "moment" || card.cooldownTurns !== null)
        issue("Tradition cards are moments that follow recorded facts: no cooldown");
      if (card.scope !== "campaign" || card.anchorOnly || card.health.length)
        issue("Tradition cards tell their own country: campaign scope, no anchor or health filter");
    }
    const deal = card.trigger === "deal";
    if (deal !== (card.deal !== null)) issue("Deal cards need the deal trigger");
    if (deal) {
      if (card.kind !== "moment" || card.cooldownTurns !== null)
        issue("Deal cards are moments that follow recorded facts: no cooldown");
      if (card.scope !== "campaign" || card.anchorOnly || card.health.length)
        issue("Deal cards belong to the flagship: campaign scope, no anchor or health filter");
    }
    const venue = card.trigger === "venue";
    if (venue !== (card.venue !== null)) issue("Venue cards need the venue trigger");
    if (venue) {
      if (card.kind !== "moment" || card.cooldownTurns !== null)
        issue("Venue cards are moments that follow recorded facts: no cooldown");
      if (card.scope !== "campaign" || card.anchorOnly || card.health.length)
        issue("Venue cards belong to the flagship: campaign scope, no anchor or health filter");
    }
    // The Hall of Fame's class card (GDD v1.31): one moment, told from the class recorded.
    if (card.trigger === "hall") {
      if (card.kind !== "moment" || card.cooldownTurns !== null)
        issue("Hall of Fame cards are moments that follow recorded facts: no cooldown");
      if (card.scope !== "campaign" || card.anchorOnly || card.health.length)
        issue("Hall of Fame cards belong to the sport: campaign scope, no anchor or health filter");
    }
    // The first Player of the Season (GDD v1.33): one minor moment, told from the season recorded.
    if (card.trigger === "award") {
      if (card.kind !== "moment" || card.weight !== "minor" || card.cooldownTurns !== null)
        issue("The award card is a minor moment that follows a recorded season: no cooldown");
      if (card.scope !== "campaign" || card.anchorOnly || card.health.length)
        issue("The award card belongs to the flagship: campaign scope, no anchor or health filter");
    }
    if (!season && card.cooldownSeasons !== null)
      issue("Only flagship season cards count cooldowns in seasons");
    if (star) {
      if (card.cooldownTurns !== null) issue("Star cards follow recorded facts: no cooldown");
      if (card.scope !== "campaign" || card.anchorOnly || card.health.length)
        issue("Star cards belong to the flagship: campaign scope, no anchor or health filter");
      if (STAR_DECISIONS.includes(card.star ?? "breakout") !== (card.kind === "decision"))
        issue(
          "Succession, keep-or-let-move and dropped are decisions; other star cards are moments",
        );
    }
    if (season) {
      if (card.cooldownTurns !== null) issue("Season cards count cooldowns in seasons, not turns");
      if (card.scope !== "campaign" || card.anchorOnly || card.health.length)
        issue("Season cards belong to the flagship: campaign scope, no anchor or health filter");
      if ((card.story === "champion") !== (card.kind === "moment"))
        issue("The champion card is the season's moment; every other season card is a decision");
    }
    if (card.arrivalEffects.length && !((season || star) && card.tone === "pressure"))
      issue("Arrival effects belong to pressure season and star cards only");
    for (const effect of [...card.effects, ...card.choices.flatMap((c) => c.effects)]) {
      if (effect.type === "rivalSetback" && card.trigger !== "rivalEscalated")
        issue("Rival setbacks require a recorded rival escalation");
      if (
        effect.type === "leagueHealth" &&
        !["leaguePressure", "leagueFormed", "leaguePromoted", "seasonEnd"].includes(card.trigger)
      )
        issue("Health effects require a league fact");
      if (effect.type === "derbyStoke" && card.story !== "repeatFinal")
        issue("derbyStoke belongs to the repeat-final season card only");
      if (effect.type === "clubRating" && !season)
        issue("Club rating effects belong to flagship season cards only");
      if (
        (effect.type === "starHonors" ||
          effect.type === "starMentor" ||
          effect.type === "starKeep") &&
        card.star !== STAR_EFFECT_CARD[effect.type]
      )
        issue(`${effect.type} belongs to the ${STAR_EFFECT_CARD[effect.type]} star card only`);
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
        /**
         * At these tiers, a season's champion moment is a headline when the season tells one of
         * `headlineStories` (GDD v1.32: rare stories only).
         */
        flagshipHeadlineTiers: z.array(leagueTierSchema),
        headlineStories: z.array(z.enum(SEASON_STORIES)),
      })
      .refine((s) => s.minFactor <= 1 && s.maxFactor >= 1, "Factor bounds must include 1"),
    cards: z.array(template),
  })
  .superRefine((data, ctx) => {
    if (new Set(data.cards.map((c) => c.id)).size !== data.cards.length)
      ctx.addIssue({ code: "custom", path: ["cards"], message: "Duplicate event id" });
    const stories = data.cards.flatMap((c) => (c.story === null ? [] : [c.story]));
    if (new Set(stories).size !== stories.length)
      ctx.addIssue({
        code: "custom",
        path: ["cards"],
        message: "Two cards tell the same season story",
      });
    const told = data.cards.flatMap((c) => (c.tradition === null ? [] : [c.tradition]));
    if (new Set(told).size !== told.length)
      ctx.addIssue({
        code: "custom",
        path: ["cards"],
        message: "Two cards tell the same tradition fact",
      });
    if (data.cards.filter((c) => c.trigger === "hall").length > 1)
      ctx.addIssue({ code: "custom", path: ["cards"], message: "Only one Hall of Fame card" });
    if (data.cards.filter((c) => c.trigger === "award").length > 1)
      ctx.addIssue({ code: "custom", path: ["cards"], message: "Only one award card" });
    const stars = data.cards.flatMap((c) => (c.star === null ? [] : [c.star]));
    if (new Set(stars).size !== stars.length)
      ctx.addIssue({
        code: "custom",
        path: ["cards"],
        message: "Two cards tell the same star fact",
      });
  });
export type EventsContent = z.infer<typeof eventsFileSchema>;
export type EventTemplate = EventsContent["cards"][number];
export type EventEffect = z.infer<typeof eventEffectSchema>;
export type TimedEventEffect = z.infer<typeof timedEventEffectSchema>;
