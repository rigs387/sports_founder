import { z } from "zod";
import {
  AXIS_IDS,
  type AxisId,
  escalationLevelSchema,
  formatPath,
  genomeSchema,
  healthLevelSchema,
  leagueTierSchema,
  timedCountermoveSchema,
} from "../content";
import { tierEntry } from "./calendar";
import { invariantsOf } from "./invariants";
import { newLeague } from "./leagues";
import { newFront, newRivalState } from "./rivals";
import { MAX_SEED } from "./rng";
import { defaultGenome } from "./setup";
import type { GameState, World } from "./types";

/** Bump when the save shape changes, and add a migration from the previous version. */
export const SAVE_FORMAT_VERSION = 5;

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
});

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
    kind: z.enum(["leagueFolded", "anchorCollapse"]),
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
    kind: z.literal("rivalCountermove"),
    turn: z.int().min(1),
    quarter: count,
    countryId: z.string().min(1),
    sportId: z.string().min(1),
    move: timedCountermoveSchema,
    endQuarter: count,
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
