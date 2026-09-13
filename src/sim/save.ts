import { z } from "zod";
import { formatPath } from "../content";
import { checkInvariants } from "./invariants";
import { MAX_SEED } from "./rng";
import type { GameState, World } from "./types";

/** Bump when the save shape changes, and add a migration from the previous version. */
export const SAVE_FORMAT_VERSION = 1;

export class SaveError extends Error {
  override name = "SaveError";
}

const count = z.int().min(0);

// Key order matches createCampaign, so a loaded state re-serializes byte-identically.
const gameStateSchema = z.strictObject({
  seed: z.int().min(0).max(MAX_SEED),
  rng: z.array(z.number()).min(1),
  anchorCountryId: z.string().min(1),
  turn: z.int().min(1),
  quarter: z.int().min(0),
  pp: z.number().min(0),
  ppTier: z.int().min(1),
  sports: z.array(z.strictObject({ id: z.string().min(1), kind: z.enum(["player", "rival"]) })),
  countries: z.array(
    z.strictObject({
      countryId: z.string().min(1),
      fans: z.array(z.strictObject({ sportId: z.string().min(1), casual: count, hardcore: count })),
    }),
  ),
});

const saveFileSchema = z.strictObject({
  formatVersion: z.literal(SAVE_FORMAT_VERSION),
  state: gameStateSchema,
});

export function serializeSave(state: GameState): string {
  return JSON.stringify({ formatVersion: SAVE_FORMAT_VERSION, state });
}

/** Parses a save and checks it against the current content. Throws SaveError if unusable. */
export function deserializeSave(text: string, world: World): GameState {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SaveError("Save file is not valid JSON");
  }

  const version =
    typeof raw === "object" && raw !== null && "formatVersion" in raw
      ? raw.formatVersion
      : undefined;
  if (version !== SAVE_FORMAT_VERSION) {
    throw new SaveError(
      `Unsupported save format version ${String(version)}; this build reads version ${SAVE_FORMAT_VERSION} and has no migration for it`,
    );
  }

  const result = saveFileSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues.map(
      (issue) => `${formatPath(issue.path)}: ${issue.message}`,
    );
    throw new SaveError(`Save file is invalid:\n  ${details.join("\n  ")}`);
  }

  const state: GameState = result.data.state;
  const problems = checkInvariants(state, world);
  if (problems.length > 0) {
    throw new SaveError(`Save does not fit the current game content:\n  ${problems.join("\n  ")}`);
  }
  return state;
}
