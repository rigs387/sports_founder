import { z } from "zod";
import {
  AXIS_IDS,
  type AxisId,
  dealClauseSchema,
  dealDemandSchema,
  dealSlotSchema,
  escalationLevelSchema,
  formatPath,
  GENOME_AXES,
  genomeSchema,
  hallFirstSchema,
  hallWingSchema,
  healthLevelSchema,
  LEAGUE_TIERS,
  leagueTierSchema,
  timedCountermoveSchema,
  traditionTypeSchema,
} from "../content";
import { tierEntry } from "./calendar";
import { newCulture } from "./culture";
import { newDeals } from "./deals";
import { emptyEvents, eventStateSchema } from "./events-state";
import { newFlagship, staffFlagship } from "./flagship";
import { newHallOfFame } from "./hall-of-fame";
import { defaultGroundName, defaultIdentitySetup, foundingClubOf } from "./identity";
import { invariantsOf } from "./invariants";
import { newLeague } from "./leagues";
import { newFront, newRivalState } from "./rivals";
import { MAX_SEED } from "./rng";
import { defaultGenome } from "./setup";
import type { FlagshipState, GameState, Genome, World } from "./types";

/** Bump when the save shape changes, and add a migration from the previous version. */
export const SAVE_FORMAT_VERSION = 24;

export class SaveError extends Error {
  override name = "SaveError";
}

const count = z.int().min(0);
const axisSchema = z.enum(AXIS_IDS as [AxisId, ...AxisId[]]);

// Key order matches createCampaign and every state update, so a loaded state re-serializes
// byte-identically.
const leagueSchema = z.strictObject({
  tier: leagueTierSchema,
  health: healthLevelSchema,
  cash: z.number(),
  lastFlowPerQuarter: z.number().nullable(),
  hardcoreAtLastEval: count,
  formedQuarter: count,
  bailoutReadyQuarter: count,
  venue: z.strictObject({
    level: z.int().min(1).max(5),
    building: z
      .strictObject({ level: z.int().min(2).max(5), opensSeason: z.int().min(1) })
      .nullable(),
    record: count.nullable(),
  }),
});

const lossReasonSchema = z.enum(["faded", "folded", "broken", "renamed"]);

const landmarkSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("leagueFormed"),
    turn: z.int().min(1),
    quarter: count,
    countryId: z.string().min(1),
    reformed: z.boolean(),
  }),
  z.strictObject({
    kind: z.enum(["leaguePromoted", "leagueSteppedDown"]),
    turn: z.int().min(1),
    quarter: count,
    countryId: z.string().min(1),
    from: leagueTierSchema,
    to: leagueTierSchema,
  }),
  z.strictObject({
    kind: z.enum(["leagueFolded", "anchorCollapse", "birthplaceOutlived"]),
    turn: z.int().min(1),
    quarter: count,
    countryId: z.string().min(1),
    leagueTier: leagueTierSchema,
  }),
  z.strictObject({
    kind: z.enum(["ppTierUp", "ppTierDown"]),
    turn: z.int().min(1),
    quarter: count,
    from: z.int().min(1),
    to: z.int().min(1),
  }),
  z.strictObject({
    kind: z.literal("nodeBought"),
    turn: z.int().min(1),
    quarter: count,
    nodeId: z.string().min(1),
    cost: z.number().min(0),
  }),
  z.strictObject({ kind: z.literal("rankOneTaken"), turn: z.int().min(1), quarter: count }),
  z.strictObject({
    kind: z.literal("rankOneLost"),
    turn: z.int().min(1),
    quarter: count,
    sportId: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal("won"),
    turn: z.int().min(1),
    quarter: count,
    heldTurns: z.int().min(1),
  }),
  z.strictObject({
    kind: z.enum(["rivalEscalated", "rivalDeescalated"]),
    turn: z.int().min(1),
    quarter: count,
    countryId: z.string().min(1),
    sportId: z.string().min(1),
    from: escalationLevelSchema,
    to: escalationLevelSchema,
  }),
  z.strictObject({
    kind: z.literal("ruleAmended"),
    turn: z.int().min(1),
    quarter: count,
    axis: axisSchema,
    from: z.string().min(1),
    to: z.string().min(1),
    demoted: count,
  }),
  z.strictObject({
    kind: z.literal("rivalTournament"),
    turn: z.int().min(1),
    quarter: count,
    sportId: z.string().min(1),
    year: z.int(),
  }),
  z.strictObject({
    kind: z.literal("rivalCountermove"),
    turn: z.int().min(1),
    quarter: count,
    countryId: z.string().min(1),
    sportId: z.string().min(1),
    move: timedCountermoveSchema,
    endQuarter: count,
  }),
  z.strictObject({
    kind: z.literal("seasonChampion"),
    turn: z.int().min(1),
    quarter: count,
    countryId: z.string().min(1),
    season: z.int().min(1),
    clubId: z.int().min(1),
  }),
  z.strictObject({
    kind: z.enum(["firstStar", "starRetired"]),
    turn: z.int().min(1),
    quarter: count,
    countryId: z.string().min(1),
    season: z.int().min(1),
    playerId: z.int().min(1),
    clubId: z.int().min(1),
  }),
  z.strictObject({
    kind: z.literal("starMoved"),
    turn: z.int().min(1),
    quarter: count,
    countryId: z.string().min(1),
    season: z.int().min(1),
    playerId: z.int().min(1),
    from: z.int().min(1),
    to: z.int().min(1),
    backed: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("starFinalSeason"),
    turn: z.int().min(1),
    quarter: count,
    countryId: z.string().min(1),
    season: z.int().min(1),
    playerId: z.int().min(1),
    clubId: z.int().min(1),
    backed: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("scoringRecord"),
    turn: z.int().min(1),
    quarter: count,
    countryId: z.string().min(1),
    season: z.int().min(1),
    playerId: z.int().min(1),
    scores: count,
  }),
  z.strictObject({
    kind: z.literal("starDropped"),
    turn: z.int().min(1),
    quarter: count,
    countryId: z.string().min(1),
    season: z.int().min(1),
    playerId: z.int().min(1),
  }),
  z.strictObject({
    kind: z.literal("dealBroken"),
    turn: z.int().min(1),
    quarter: count,
    countryId: z.string().min(1),
    dealId: z.int().min(1),
    partnerId: z.string().min(1),
    slot: dealSlotSchema,
    demand: dealDemandSchema,
    penalty: z.number().min(0),
  }),
  z.strictObject({
    kind: z.literal("dealWalked"),
    turn: z.int().min(1),
    quarter: count,
    countryId: z.string().min(1),
    dealId: z.int().min(1),
    partnerId: z.string().min(1),
    slot: dealSlotSchema,
    clause: dealClauseSchema,
  }),
  z.strictObject({
    kind: z.literal("dealEnded"),
    turn: z.int().min(1),
    quarter: count,
    countryId: z.string().min(1),
    dealId: z.int().min(1),
    partnerId: z.string().min(1),
    slot: dealSlotSchema,
  }),
  z.strictObject({
    kind: z.literal("seatMoved"),
    turn: z.int().min(1),
    quarter: count,
    from: z.string().min(1),
    countryId: z.string().min(1),
    reason: z.enum(["moved", "returned"]),
  }),
  z.strictObject({
    kind: z.literal("venueOpened"),
    turn: z.int().min(1),
    quarter: count,
    countryId: z.string().min(1),
    level: z.int().min(2).max(5),
    modernized: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("recordCrowd"),
    turn: z.int().min(1),
    quarter: count,
    countryId: z.string().min(1),
    season: z.int().min(1),
    crowd: count,
    clubId: z.int().min(1),
    level: z.int().min(1).max(5),
  }),
  z.strictObject({
    kind: z.literal("traditionBorn"),
    turn: z.int().min(1),
    quarter: count,
    countryId: z.string().min(1),
    traditionId: z.int().min(1),
    type: traditionTypeSchema,
  }),
  z.strictObject({
    kind: z.literal("traditionLost"),
    turn: z.int().min(1),
    quarter: count,
    countryId: z.string().min(1),
    traditionId: z.int().min(1),
    type: traditionTypeSchema,
    reason: lossReasonSchema,
  }),
  z.strictObject({
    kind: z.literal("chantSpread"),
    turn: z.int().min(1),
    quarter: count,
    countryId: z.string().min(1),
    traditionId: z.int().min(1),
  }),
  z.strictObject({
    kind: z.literal("hallOfFameClass"),
    turn: z.int().min(1),
    quarter: count,
    countryId: z.string().min(1),
    season: z.int().min(1),
    inductees: z.int().min(1),
  }),
  z.strictObject({
    kind: z.literal("rivalRuleCopied"),
    turn: z.int().min(1),
    quarter: count,
    countryId: z.string().min(1),
    sportId: z.string().min(1),
    axis: axisSchema,
    from: z.string().min(1),
    to: z.string().min(1),
  }),
]);

const clubRatingSchema = z.strictObject({ clubId: z.int().min(1), rating: z.number() });
const tableRowSchema = z.strictObject({
  clubId: z.int().min(1),
  played: count,
  won: count,
  drawn: count,
  lost: count,
  scoreFor: count,
  scoreAgainst: count,
  points: count,
});
const matchSchema = z.strictObject({
  homeId: z.int().min(1),
  awayId: z.int().min(1),
  homeScore: count,
  awayScore: count,
  decidedFor: z.int().min(1).nullable(),
});
const tallyFields = {
  matches: count,
  scores: count,
  playoffScores: count,
  finalScores: count,
};
const seasonFormatSchema = z.enum(["european", "american"]);
const dealTermsFields = {
  id: z.int().min(1),
  slot: dealSlotSchema,
  position: count,
  partnerId: z.string().min(1),
  annualValue: z.number().min(0),
  seasons: z.int().min(1),
  demand: z
    .discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("tierFloor"), tier: leagueTierSchema }),
      z.strictObject({ kind: z.literal("seatLock"), countryId: z.string().min(1) }),
      z.strictObject({ kind: z.literal("exclusivity") }),
      z.strictObject({ kind: z.literal("balance") }),
      z.strictObject({ kind: z.literal("star") }),
      z.strictObject({ kind: z.literal("fans") }),
      z.strictObject({
        kind: z.literal("ruleChange"),
        axis: z.enum(AXIS_IDS as [AxisId, ...AxisId[]]),
        option: z.string().min(1),
        dueSeason: z.int().min(1),
      }),
    ])
    .nullable(),
  renewal: z.boolean(),
};
const dealsSchema = z.strictObject({
  rng: z.array(z.number()).min(1),
  signed: z.array(
    z.strictObject({
      ...dealTermsFields,
      firstSeason: z.int().min(1),
      lastSeason: z.int().min(1),
      countryId: z.string().min(1),
      clauseMet: count,
      clauseMisses: count,
      fansMark: z.number().min(0),
    }),
  ),
  offers: z.array(z.strictObject(dealTermsFields)),
  shunned: z.array(z.strictObject({ partnerId: z.string().min(1), untilSeason: z.int().min(1) })),
  nextId: z.int().min(1),
  offeredSeason: z.int().min(1).nullable(),
});
const scoringSchema = z.enum(GENOME_AXES.scoring.options);
const flagshipSchema = z.strictObject({
  countryId: z.string().min(1),
  pendingCountryId: z.string().min(1).nullable(),
  offseason: z.boolean(),
  rng: z.array(z.number()).min(1),
  season: z.int().min(1),
  scoring: scoringSchema,
  seasonQuarters: z.int().min(1),
  quartersPlayed: count,
  round: count,
  clubs: z.array(
    z.strictObject({
      id: z.int().min(1),
      countryId: z.string().min(1),
      place: z.string().min(1),
      nickname: z.string().min(1),
      rating: z.number(),
      active: z.boolean(),
      firstSeason: z.int().min(1),
    }),
  ),
  nextClubId: z.int().min(1),
  players: z.array(
    z.strictObject({
      id: z.int().min(1),
      name: z.string().min(1),
      countryId: z.string().min(1),
      birthplace: z.string().min(1),
      clubId: z.int().min(1),
      birthSeason: z.int(),
      peakSkill: z.number(),
      skill: z.number(),
      starSince: z.int().min(1).nullable(),
      finalSeason: z.boolean(),
      retiredSeason: z.int().min(1).nullable(),
      backing: z
        .strictObject({
          season: z.int().min(1),
          influence: z.number().min(0).max(1),
          honors: z.boolean(),
          mentee: z.int().min(1).nullable(),
        })
        .nullable(),
      career: z.array(
        z.strictObject({ season: z.int().min(1), clubId: z.int().min(1), ...tallyFields }),
      ),
    }),
  ),
  nextPlayerId: z.int().min(1),
  tallies: z.array(z.strictObject({ playerId: z.int().min(1), ...tallyFields })).nullable(),
  table: z.array(tableRowSchema),
  startRatings: z.array(clubRatingSchema),
  lastRound: z.array(matchSchema),
  seasons: z.array(
    z.strictObject({
      season: z.int().min(1),
      quarter: count,
      countryId: z.string().min(1),
      format: seasonFormatSchema,
      scoring: scoringSchema,
      championId: z.int().min(1),
      runnerUpId: z.int().min(1),
      standings: z.array(tableRowSchema),
      playoffs: z.array(matchSchema),
      startRatings: z.array(clubRatingSchema),
      topScorer: z
        .strictObject({ playerId: z.int().min(1), clubId: z.int().min(1), scores: count })
        .nullable(),
      newStarId: z.int().min(1).nullable(),
      crowd: count.nullable(),
      recordCrowd: z.boolean(),
      playerOfSeason: z.int().min(1).nullable(),
    }),
  ),
  deals: dealsSchema,
});

const gameStateSchema = z.strictObject({
  seed: z.int().min(0).max(MAX_SEED),
  rng: z.array(z.number()).min(1),
  anchorCountryId: z.string().min(1),
  genome: genomeSchema,
  turn: z.int().min(1),
  quarter: count,
  pp: z.number().min(0),
  ppTier: z.int().min(1),
  tierTrack: z.strictObject({
    peakTier: z.int().min(1),
    lastChangeTurn: z.int().min(1).nullable(),
    pendingTierUp: z.strictObject({ tier: z.int().min(1), turnsLeft: z.int().min(1) }).nullable(),
    turnsBelowLine: count,
    slotsToDrop: count,
  }),
  focus: z.array(z.string().min(1).nullable()),
  growthNodes: z.array(z.string().min(1)),
  win: z.strictObject({
    atTop: z.boolean(),
    turnsHeld: count,
    won: z.strictObject({ turn: z.int().min(1), quarter: count }).nullable(),
  }),
  outcome: z
    .strictObject({
      kind: z.literal("anchorCollapse"),
      turn: z.int().min(1),
      quarter: count,
      countryId: z.string().min(1),
    })
    .nullable(),
  sports: z.array(
    z.strictObject({ id: z.string().min(1), kind: z.enum(["player", "rival", "other"]) }),
  ),
  rivals: z.array(
    z.strictObject({
      sportId: z.string().min(1),
      genome: genomeSchema,
      budget: z.number().min(0),
      budgetSpent: z.number().min(0),
      ruleCopyReadyQuarter: count,
    }),
  ),
  countries: z.array(
    z.strictObject({
      countryId: z.string().min(1),
      fans: z.array(z.strictObject({ sportId: z.string().min(1), casual: count, hardcore: count })),
      league: leagueSchema.nullable(),
      leaguesFolded: count,
      formationReadyQuarter: count,
      defense: z.array(
        z.strictObject({
          sportId: z.string().min(1),
          level: escalationLevelSchema,
          pressure: z.number().min(0),
          quartersAtLevel: count,
          calmQuarters: count,
        }),
      ),
      countermoves: z.array(
        z.strictObject({
          kind: timedCountermoveSchema,
          sportId: z.string().min(1),
          endQuarter: count,
        }),
      ),
    }),
  ),
  landmarks: z.array(landmarkSchema),
  yearly: z.array(z.strictObject({ year: z.int(), fans: z.array(count) })),
  events: eventStateSchema,
  seasonFormat: seasonFormatSchema,
  flagship: flagshipSchema,
  identity: z.strictObject({
    sportName: z.string().min(1),
    foundingClubId: z.int().min(1),
    groundName: z.string().min(1),
    birthplace: z.string().min(1),
    ethos: z.string().min(1),
    terms: z.strictObject({
      score: z.string().min(1),
      match: z.string().min(1),
      season: z.string().min(1),
    }),
    emblem: z.strictObject({
      shape: z.string().min(1),
      icon: z.string().min(1),
      primary: z.string().min(1),
      secondary: z.string().min(1),
    }),
  }),
  rules: z.strictObject({
    amendments: z.array(
      z.strictObject({
        turn: z.int().min(1),
        quarter: count,
        year: z.int(),
        axis: axisSchema,
        from: z.string().min(1),
        to: z.string().min(1),
        jump: z.int().min(1),
        demoted: count,
      }),
    ),
  }),
  culture: z.strictObject({
    startSeason: z.int().min(1),
    landmarkCursor: count,
    year: z.int(),
    rng: z.array(z.number()).min(1),
    traditions: z.array(
      z.strictObject({
        id: z.int().min(1),
        type: traditionTypeSchema,
        countryId: z.string().min(1),
        clubIds: z.array(z.int().min(1)),
        playerId: z.int().min(1).nullable(),
        name: z.string().min(1).nullable(),
        seasons: z.array(z.int().min(1)),
        rules: z.partialRecord(axisSchema, z.string().min(1)),
        bornTurn: z.int().min(1),
        bornQuarter: count,
        strength: z.number().min(0).max(1),
        renewedYear: z.int(),
        followers: z.array(z.string().min(1)).min(1),
        lost: z
          .strictObject({ turn: z.int().min(1), quarter: count, reason: lossReasonSchema })
          .nullable(),
      }),
    ),
    nextId: z.int().min(1),
    stokes: z.array(z.strictObject({ clubIds: z.array(z.int().min(1)), season: z.int().min(1) })),
    naming: z.int().min(1).nullable(),
  }),
  hallOfFame: z.strictObject({
    startSeason: z.int().min(1),
    landmarkStart: count,
    inductees: z.array(
      z.strictObject({
        id: z.int().min(1),
        wing: hallWingSchema,
        season: z.int().min(1),
        turn: z.int().min(1),
        quarter: count,
        countryId: z.string().min(1),
        playerId: z.int().min(1).nullable(),
        facts: z
          .strictObject({
            starSeasons: count,
            titles: count,
            topScorerSeasons: count,
            awards: count,
            record: z.boolean(),
            scores: count,
          })
          .nullable(),
        first: hallFirstSchema.nullable(),
        landmarkIndex: count.nullable(),
      }),
    ),
    nextId: z.int().min(1),
  }),
});

const saveFileSchema = z.strictObject({
  formatVersion: z.literal(SAVE_FORMAT_VERSION),
  state: gameStateSchema,
});

type RawSave = { formatVersion: number; state: Record<string, unknown> };
type RawCountry = Record<string, unknown>;

const rawCountries = (state: Record<string, unknown>): RawCountry[] =>
  Array.isArray(state.countries) ? (state.countries as RawCountry[]) : [];

/**
 * Migrations from each older format version to the next. A save at version N is passed through
 * migrations[N], then migrations[N + 1], ... until it reaches the current version.
 */
const migrations: Record<number, (save: RawSave, world: World) => RawSave> = {
  // 23 → 24: awards (GDD v1.33). No retroactive awards: past seasons have no Player of the Season,
  // season cards name none, and Hall of Fame inductees have no award count.
  23: (save) => {
    const flagship = save.state.flagship as FlagshipState;
    const events = save.state.events as Record<string, unknown>;
    const hall = save.state.hallOfFame as { inductees: Record<string, unknown>[] };
    const told = (list: unknown) =>
      (Array.isArray(list) ? list : []).map((event: Record<string, unknown>) => {
        const facts = event.facts as Record<string, unknown>;
        const season = facts.season as Record<string, unknown> | null;
        return season
          ? { ...event, facts: { ...facts, season: { ...season, playerOfSeasonId: null } } }
          : event;
      });
    return {
      formatVersion: 24,
      state: {
        ...save.state,
        events: { ...events, pending: told(events.pending), history: told(events.history) },
        flagship: {
          ...flagship,
          seasons: flagship.seasons.map((summary) => ({ ...summary, playerOfSeason: null })),
        },
        hallOfFame: {
          ...hall,
          inductees: hall.inductees.map((inductee) => {
            const facts = inductee.facts as Record<string, unknown> | null;
            if (!facts) return inductee;
            const { starSeasons, titles, topScorerSeasons, record, scores } = facts;
            return {
              ...inductee,
              facts: { starSeasons, titles, topScorerSeasons, awards: 0, record, scores },
            };
          }),
        },
      },
    };
  },
  // 22 → 23: the Hall of Fame (GDD v1.31). An empty Hall with no retroactive inductions: only
  // players retiring from the season under way, and firsts recorded from now on, count. Recorded
  // events tell no class.
  22: (save) => {
    const flagship = save.state.flagship as FlagshipState;
    const landmarks = Array.isArray(save.state.landmarks) ? save.state.landmarks : [];
    const events = save.state.events as Record<string, unknown>;
    const told = (list: unknown) =>
      (Array.isArray(list) ? list : []).map((event: Record<string, unknown>) => ({
        ...event,
        facts: { ...(event.facts as Record<string, unknown>), hall: null },
      }));
    return {
      formatVersion: 23,
      state: {
        ...save.state,
        events: { ...events, pending: told(events.pending), history: told(events.history) },
        hallOfFame: newHallOfFame(flagship.season, landmarks.length),
      },
    };
  },
  // 21 → 22: venues (GDD v1.30). Every league starts at level 1 with nothing building and no
  // record crowd; past seasons carry no crowd and set no record; recorded events tell no venue.
  21: (save) => {
    const flagship = save.state.flagship as FlagshipState;
    const events = save.state.events as Record<string, unknown>;
    const told = (list: unknown) =>
      (Array.isArray(list) ? list : []).map((event: Record<string, unknown>) => ({
        ...event,
        facts: { ...(event.facts as Record<string, unknown>), venue: null },
      }));
    return {
      formatVersion: 22,
      state: {
        ...save.state,
        events: { ...events, pending: told(events.pending), history: told(events.history) },
        countries: rawCountries(save.state).map((country) =>
          country.league
            ? {
                ...country,
                league: {
                  ...(country.league as object),
                  venue: { level: 1, building: null, record: null },
                },
              }
            : country,
        ),
        flagship: {
          ...flagship,
          seasons: flagship.seasons.map((summary) => ({
            ...summary,
            crowd: null,
            recordCrowd: false,
          })),
        },
      },
    };
  },
  // 20 → 21: deal clauses (GDD v1.29). Signed deals start with no clause record, judged against
  // the seat country's fans now.
  20: (save) => {
    const flagship = save.state.flagship as FlagshipState;
    const seat = rawCountries(save.state).find((c) => c.countryId === flagship.countryId) as
      | { fans?: { casual: number; hardcore: number }[] }
      | undefined;
    const fans = seat?.fans?.[0];
    const mark = fans ? fans.casual + fans.hardcore : 0;
    return {
      formatVersion: 21,
      state: {
        ...save.state,
        flagship: {
          ...flagship,
          deals: {
            ...flagship.deals,
            signed: flagship.deals.signed.map((deal) => ({
              ...deal,
              clauseMet: 0,
              clauseMisses: 0,
              fansMark: mark,
            })),
          },
        },
      },
    };
  },
  // 19 → 20: flagship deals (GDD v1.28). Nothing signed and no offers made: the media baseline
  // cut starts at the next offseason, when the first offers arrive. An offseason already open
  // makes none: the next End Turn closes it before offers are made. Recorded events tell no deal.
  19: (save) => {
    const flagship = save.state.flagship as Omit<FlagshipState, "deals">;
    const events = save.state.events as Record<string, unknown>;
    const told = (list: unknown) =>
      (Array.isArray(list) ? list : []).map((event: Record<string, unknown>) => ({
        ...event,
        facts: { ...(event.facts as Record<string, unknown>), deal: null },
      }));
    return {
      formatVersion: 20,
      state: {
        ...save.state,
        events: { ...events, pending: told(events.pending), history: told(events.history) },
        flagship: { ...flagship, deals: newDeals(Number(save.state.seed)) },
      },
    };
  },
  // 18 → 19: the offseason (GDD v1.24). The season under way plays on; the offseason first opens
  // when it ends. A save made just after a season ended keeps the season already started; one
  // whose season has run its quarters without a new one starting is in the offseason.
  18: (save) => {
    const flagship = save.state.flagship as FlagshipState;
    const over = flagship.quartersPlayed >= flagship.seasonQuarters;
    return {
      formatVersion: 19,
      state: { ...save.state, flagship: { ...flagship, offseason: over } },
    };
  },
  // 17 → 18: culture (GDD v1.22). No traditions and no retroactive history: facts count from the
  // flagship season under way, and only landmarks recorded from now on are read.
  17: (save, world) => {
    const flagship = save.state.flagship as FlagshipState;
    const landmarks = Array.isArray(save.state.landmarks) ? save.state.landmarks : [];
    // Recorded events tell no tradition.
    const events = save.state.events as Record<string, unknown>;
    const told = (list: unknown) =>
      (Array.isArray(list) ? list : []).map((event: Record<string, unknown>) => ({
        ...event,
        facts: {
          ...(event.facts as Record<string, unknown>),
          tradition: (event.facts as Record<string, unknown>).tradition ?? null,
        },
      }));
    return {
      formatVersion: 18,
      state: {
        ...save.state,
        events: { ...events, pending: told(events.pending), history: told(events.history) },
        culture: newCulture(
          Number(save.state.seed),
          flagship.season,
          landmarks.length,
          Number(save.state.quarter),
          world,
        ),
      },
    };
  },
  // 16 → 17: rules evolution (GDD v1.20). No amendments yet; every rule has stood since the start.
  16: (save) => ({
    formatVersion: 17,
    state: { ...save.state, rules: { amendments: [] } },
  }),
  // 15 → 16: sport identity (GDD v1.18). Generated defaults from the seed; the anchor's oldest
  // club becomes the founding club with its place and name unchanged, its ground named after its
  // town.
  15: (save, world) => {
    const seed = Number(save.state.seed);
    const anchor = String(save.state.anchorCountryId);
    const flagship = save.state.flagship as FlagshipState;
    const club = foundingClubOf(flagship.clubs, anchor);
    const defaults = defaultIdentitySetup(world, seed, anchor);
    return {
      formatVersion: 16,
      state: {
        ...save.state,
        identity: {
          sportName: defaults.sportName,
          foundingClubId: club?.id ?? 0,
          groundName: defaultGroundName(world, seed, club?.place ?? defaults.foundingPlace),
          birthplace: defaults.birthplace,
          ethos: defaults.ethos,
          terms: defaults.terms,
          emblem: defaults.emblem,
        },
      },
    };
  },
  // 14 → 15: star cards (GDD v1.16). Backings carry no honors and no mentee; earlier star moves
  // were never backed; recorded events tell no star fact, and season cards name no players.
  14: (save) => {
    const flagship = save.state.flagship as Record<string, unknown>;
    const players = (Array.isArray(flagship.players) ? flagship.players : []).map(
      (player: Record<string, unknown>) => {
        const backing = player.backing as Record<string, unknown> | null;
        return {
          ...player,
          backing: backing && {
            ...backing,
            honors: backing.honors ?? false,
            mentee: backing.mentee ?? null,
          },
        };
      },
    );
    const landmarkList = (Array.isArray(save.state.landmarks) ? save.state.landmarks : []).map(
      (landmark: Record<string, unknown>) =>
        landmark.kind === "starMoved"
          ? { ...landmark, backed: landmark.backed ?? false }
          : landmark,
    );
    const events = save.state.events as Record<string, unknown>;
    const withStar = (records: unknown) =>
      (Array.isArray(records) ? records : []).map((record: { facts: Record<string, unknown> }) => {
        const season = record.facts.season as Record<string, unknown> | null;
        return {
          ...record,
          facts: {
            ...record.facts,
            season: season && {
              ...season,
              championPlayerId: null,
              topScorerId: null,
              topScorerScores: null,
            },
            star: null,
          },
        };
      });
    return {
      formatVersion: 15,
      state: {
        ...save.state,
        landmarks: landmarkList,
        events: { ...events, pending: withStar(events.pending), history: withStar(events.history) },
        flagship: { ...flagship, players },
      },
    };
  },
  // 13 → 14: backing stars (GDD v1.16). Nobody is backed.
  13: (save) => {
    const flagship = save.state.flagship as Record<string, unknown>;
    const players = (Array.isArray(flagship.players) ? flagship.players : []).map(
      ({ career, ...player }: Record<string, unknown>) => ({
        ...player,
        backing: player.backing ?? null,
        career,
      }),
    );
    // Key order follows the schema, so the migrated state re-serializes byte-identically.
    return { formatVersion: 14, state: { ...save.state, flagship: { ...flagship, players } } };
  },
  // 12 → 13: stars and careers (GDD v1.16). Nobody is a star, nobody has announced a final
  // season and nobody has retired; no past season made a star.
  12: (save) => {
    const flagship = save.state.flagship as Record<string, unknown>;
    const players = (Array.isArray(flagship.players) ? flagship.players : []).map(
      ({ career, ...player }: Record<string, unknown>) => ({
        ...player,
        starSince: player.starSince ?? null,
        finalSeason: player.finalSeason ?? false,
        retiredSeason: player.retiredSeason ?? null,
        career,
      }),
    );
    const seasons = (Array.isArray(flagship.seasons) ? flagship.seasons : []).map(
      (summary: Record<string, unknown>) => ({ ...summary, newStarId: summary.newStarId ?? null }),
    );
    // Key order follows the schema, so the migrated state re-serializes byte-identically.
    return {
      formatVersion: 13,
      state: { ...save.state, flagship: { ...flagship, players, seasons } },
    };
  },
  // 11 → 12: credited scores and career lines (GDD v1.16). Players start with empty careers;
  // the season in progress was not tallied from its start, so it is never tallied (no partial
  // career lines) and tallies begin with the next season. No past season has a top scorer.
  11: (save) => {
    const flagship = save.state.flagship as Record<string, unknown>;
    // Key order follows the schema, so the migrated state re-serializes byte-identically.
    const migrated: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(flagship)) {
      if (key === "tallies") continue;
      if (key === "players" && Array.isArray(value)) {
        migrated.players = value.map((player: Record<string, unknown>) => ({
          ...player,
          career: player.career ?? [],
        }));
      } else if (key === "seasons" && Array.isArray(value)) {
        migrated.seasons = value.map((summary: Record<string, unknown>) => ({
          ...summary,
          topScorer: summary.topScorer ?? null,
        }));
      } else {
        migrated[key] = value;
      }
      if (key === "nextPlayerId") migrated.tallies = flagship.tallies ?? null;
    }
    return { formatVersion: 12, state: { ...save.state, flagship: migrated } };
  },
  // 10 → 11: leading players (GDD v1.16). Every active club gets a fresh leading player, with
  // ages spread as at founding, drawn on the flagship's own stream; no stars and no invented
  // careers. Dormant clubs get theirs when they return.
  10: (save, world) => {
    const flagship = save.state.flagship as Record<string, unknown>;
    // Key order follows the schema, so the migrated state re-serializes byte-identically.
    const shaped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(flagship)) {
      shaped[key] = value;
      if (key === "nextClubId") {
        shaped.players = [];
        shaped.nextPlayerId = 1;
      }
    }
    const staffed = staffFlagship(shaped as unknown as FlagshipState, world);
    return { formatVersion: 11, state: { ...save.state, flagship: staffed } };
  },
  // 9 → 10: the flagship's match rule follows the genome's scoring frequency (GDD v1.16). Every
  // season before this format was played under the old single rule, which is the medium rule, and
  // a season in progress finishes under it; the genome's rule starts with the next season, so no
  // season mixes two rules. A flagship founded by the 7 → 8 migration already started its season
  // under the genome's rule.
  9: (save) => {
    const flagship = save.state.flagship as Record<string, unknown>;
    // Key order follows the schema, so the migrated state re-serializes byte-identically.
    const withScoring = (record: Record<string, unknown>, after: string) => {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(record)) {
        if (key === "scoring") continue;
        out[key] = value;
        if (key === after) out.scoring = record.scoring ?? "medium";
      }
      return out;
    };
    const migrated = withScoring(flagship, "season");
    migrated.seasons = (Array.isArray(flagship.seasons) ? flagship.seasons : []).map(
      (summary: Record<string, unknown>) => withScoring(summary, "format"),
    );
    return { formatVersion: 10, state: { ...save.state, flagship: migrated } };
  },
  // 8 → 9: the flagship season as cards (GDD v1.15). Ratings never moved mid-season before this
  // format, so the current season's start ratings are the active clubs' ratings now. Finished
  // seasons keep no start ratings (no underdog story is told about them). Every recorded event
  // gets no season facts, and no season card has been offered yet.
  8: (save) => {
    const flagship = save.state.flagship as Record<string, unknown>;
    const clubs = (Array.isArray(flagship.clubs) ? flagship.clubs : []) as {
      id: number;
      countryId: string;
      rating: number;
      active: boolean;
    }[];
    const startRatings = clubs
      .filter((club) => club.active && club.countryId === flagship.countryId)
      .sort((a, b) => a.id - b.id)
      .map((club) => ({ clubId: club.id, rating: club.rating }));
    // Key order follows the schema, so the migrated state re-serializes byte-identically.
    const migrated: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(flagship)) {
      migrated[key] =
        key === "seasons" && Array.isArray(value)
          ? value.map((summary: object) => ({ ...summary, startRatings: [] }))
          : value;
      if (key === "table") migrated.startRatings = startRatings;
    }
    const events = save.state.events as Record<string, unknown>;
    const withSeason = (records: unknown) =>
      (Array.isArray(records) ? records : []).map((record: { facts: object }) => ({
        ...record,
        facts: { ...record.facts, season: null },
      }));
    return {
      formatVersion: 9,
      state: {
        ...save.state,
        events: {
          nextId: events.nextId,
          landmarkCursor: events.landmarkCursor,
          offered: events.offered,
          seasonOffered: {},
          pending: withSeason(events.pending),
          history: withSeason(events.history),
          modifiers: events.modifiers,
        },
        flagship: migrated,
      },
    };
  },
  // 7 → 8: the flagship league arrived (GDD v1.11, v1.14). The anchor holds the seat with fresh
  // clubs for its league's tier and a season that starts now; no past seasons are invented. Old
  // campaigns play the European format.
  7: (save, world) => {
    const { seed, anchorCountryId, quarter } = save.state;
    const anchorIndex = world.countries.findIndex((country) => country.id === anchorCountryId);
    const league = rawCountries(save.state)[anchorIndex]?.league as { tier?: unknown } | null;
    const tier = LEAGUE_TIERS.find((candidate) => candidate === league?.tier) ?? "amateur";
    return {
      formatVersion: 8,
      state: {
        ...save.state,
        seasonFormat: "european",
        flagship: newFlagship(
          world,
          Number(seed) || 0,
          String(anchorCountryId),
          tier,
          Number(quarter) || 0,
          (save.state.genome as Genome).scoring,
        ),
      },
    };
  },
  // 6 → 7: no retroactive rewards for old landmarks; future turns start the event deck.
  6: (save) => ({
    formatVersion: 7,
    state: {
      ...save.state,
      events: emptyEvents(Array.isArray(save.state.landmarks) ? save.state.landmarks.length : 0),
    },
  }),
  // 1 → 2: the genome, focus slots and the "other sports" bucket arrived. Version 1 saves came
  // from the pre-genome foundation build; they get the default genome and a focus slot on the
  // anchor. Their sports and countries must still match the current content to load.
  1: (save, world) => {
    const { seed, rng, anchorCountryId, turn, quarter, pp, ppTier, sports, countries } = save.state;
    return {
      formatVersion: 2,
      state: {
        seed,
        rng,
        anchorCountryId,
        genome: defaultGenome(world),
        turn,
        quarter,
        pp,
        ppTier,
        focus: [anchorCountryId],
        sports,
        countries,
      },
    };
  },

  // 2 → 3: leagues, the tier track, the campaign outcome, landmarks and yearly snapshots arrived.
  // The anchor gets its founding Amateur league with starting cash; no other country has a league
  // (formation re-checks every quarter, so qualifying countries form one on the next quarter).
  // History before the migration was never recorded, so landmarks and snapshots start empty.
  2: (save, world) => {
    const { seed, rng, anchorCountryId, genome, turn, quarter, pp, ppTier, focus, sports } =
      save.state;
    const anchorIndex = world.countries.findIndex((country) => country.id === anchorCountryId);
    const tier = typeof ppTier === "number" ? ppTier : 1;
    const slots = world.config.ppTiers.some((entry) => entry.tier === tier)
      ? tierEntry(tier, world.config).focusSlots
      : 1;
    const focusList = Array.isArray(focus) ? focus : [];
    return {
      formatVersion: 3,
      state: {
        seed,
        rng,
        anchorCountryId,
        genome,
        turn,
        quarter,
        pp,
        ppTier,
        tierTrack: {
          peakTier: tier,
          lastChangeTurn: null,
          pendingTierUp: null,
          turnsBelowLine: 0,
          slotsToDrop: Math.max(0, focusList.length - slots),
        },
        focus,
        outcome: null,
        sports,
        countries: rawCountries(save.state).map((country, index) => {
          const fans = Array.isArray(country.fans) ? country.fans : [];
          const hardcore = Number((fans[0] as { hardcore?: unknown } | undefined)?.hardcore ?? 0);
          return {
            countryId: country.countryId,
            fans: country.fans,
            league:
              index === anchorIndex
                ? { ...newLeague(world, index, Number(quarter) || 0, hardcore, []) }
                : null,
            leaguesFolded: 0,
            formationReadyQuarter: 0,
          };
        }),
        landmarks: [],
        yearly: [],
      },
    };
  },

  // 3 → 4: rival defense arrived. Rival genomes become campaign state, starting from content;
  // budgets start empty, no rival is paying attention anywhere yet, and no countermove is in
  // effect. The next quarters rebuild pressure from the player's hardcore gains.
  3: (save, world) => {
    const {
      seed,
      rng,
      anchorCountryId,
      genome,
      turn,
      quarter,
      pp,
      ppTier,
      tierTrack,
      focus,
      outcome,
      sports,
      landmarks,
      yearly,
    } = save.state;
    return {
      formatVersion: 4,
      state: {
        seed,
        rng,
        anchorCountryId,
        genome,
        turn,
        quarter,
        pp,
        ppTier,
        tierTrack,
        focus,
        outcome,
        sports,
        rivals: world.rivals.map((rival) => newRivalState(rival.id, rival.genome)),
        countries: rawCountries(save.state).map((country) => ({
          countryId: country.countryId,
          fans: country.fans,
          league: country.league,
          leaguesFolded: country.leaguesFolded,
          formationReadyQuarter: country.formationReadyQuarter,
          defense: world.rivals.map((rival) => newFront(rival.id)),
          countermoves: [],
        })),
        landmarks,
        yearly,
      },
    };
  },

  // 4 → 5: the growth tree arrived. Nothing was ever bought, so the campaign owns no nodes.
  // Generational turnover needs no state and starts with the next quarter.
  4: (save) => {
    const { focus, ...rest } = save.state;
    const state: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rest)) {
      state[key] = value;
      if (key === "tierTrack") {
        state.focus = focus;
        state.growthNodes = [];
      }
    }
    return { formatVersion: 5, state };
  },

  // 5 → 6: the win condition arrived. No version 5 campaign can have won, and its standing was never
  // recorded, so the hold starts from nothing and the next turn that ends at #1 records taking #1.
  // No #1 landmarks exist for the past.
  5: (save) => {
    const state: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(save.state)) {
      state[key] = value;
      if (key === "growthNodes") state.win = { atTop: false, turnsHeld: 0, won: null };
    }
    return { formatVersion: 6, state };
  },
};

export function serializeSave(state: GameState): string {
  return JSON.stringify({ formatVersion: SAVE_FORMAT_VERSION, state });
}

function isRawSave(raw: unknown): raw is RawSave {
  return (
    typeof raw === "object" &&
    raw !== null &&
    typeof (raw as RawSave).formatVersion === "number" &&
    typeof (raw as RawSave).state === "object" &&
    (raw as RawSave).state !== null
  );
}

/** Parses a save, migrates it if older, and checks it against the current content. */
export function deserializeSave(text: string, world: World): GameState {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SaveError("Save file is not valid JSON");
  }
  if (!isRawSave(raw)) {
    throw new SaveError("Save file has no format version or state");
  }

  let save = raw;
  while (save.formatVersion !== SAVE_FORMAT_VERSION) {
    const migrate = migrations[save.formatVersion];
    if (!migrate || save.formatVersion > SAVE_FORMAT_VERSION) {
      throw new SaveError(
        `Unsupported save format version ${save.formatVersion}; this build reads version ${SAVE_FORMAT_VERSION} and has no migration for it`,
      );
    }
    save = migrate(save, world);
  }

  const result = saveFileSchema.safeParse(save);
  if (!result.success) {
    const details = result.error.issues.map(
      (issue) => `${formatPath(issue.path)}: ${issue.message}`,
    );
    throw new SaveError(`Save file is invalid:\n  ${details.join("\n  ")}`);
  }

  const state: GameState = result.data.state;
  const problems = invariantsOf(state, world);
  if (problems.length > 0) {
    throw new SaveError(`Save does not fit the current game content:\n  ${problems.join("\n  ")}`);
  }
  return state;
}
