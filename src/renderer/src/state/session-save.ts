import { z } from "zod";
import { deserializeSave, type GameState, serializeSave, snapshot, type World } from "../../../sim";
import { type CountryHistory, recordHistory } from "./history";

// The simulation keeps its own migrations. This wrapper versions presentation history separately.
export const SESSION_FORMAT_VERSION = 1;
const sessionSchema = z.strictObject({
  sessionFormatVersion: z.literal(SESSION_FORMAT_VERSION),
  campaign: z.unknown(),
  history: z.record(
    z.string(),
    z.array(
      z.strictObject({
        turn: z.int().min(1),
        quarter: z.int().min(0),
        share: z.number().min(0).max(1),
      }),
    ),
  ),
  selectedCountryId: z.string().nullable(),
});

function validateHistory(history: CountryHistory, state: GameState, world: World) {
  const ids = new Set(world.countries.map((country) => country.id));
  for (const [id, points] of Object.entries(history)) {
    if (!ids.has(id)) throw new Error("Unknown history market");
    let turn = 0;
    let quarter = -1;
    for (const point of points) {
      if (
        point.turn <= turn ||
        point.quarter <= quarter ||
        point.turn > state.turn ||
        point.quarter > state.quarter
      )
        throw new Error("Invalid history chronology");
      turn = point.turn;
      quarter = point.quarter;
    }
  }
}

export function readSession(text: string, world: World, limit: number) {
  const raw: unknown = JSON.parse(text);
  // Earlier headless saves contain only the simulation; unavailable history starts here.
  const legacy = typeof raw === "object" && raw !== null && !("sessionFormatVersion" in raw);
  const data = legacy ? null : sessionSchema.parse(raw);
  const state = deserializeSave(data ? JSON.stringify(data.campaign) : text, world);
  const view = snapshot(state, world);
  const history = data?.history ?? {};
  validateHistory(history, state, world);
  if (data)
    for (const country of view.countries) {
      const latest = history[country.countryId]?.at(-1);
      if (
        !latest ||
        latest.turn !== view.turn ||
        latest.quarter !== view.quarter ||
        latest.share !== country.share
      )
        throw new Error("History does not match the saved campaign");
    }
  if (data?.selectedCountryId && !world.countries.some((c) => c.id === data.selectedCountryId))
    throw new Error("Unknown selected market");
  return {
    state,
    snapshot: view,
    history: recordHistory(history, view, limit),
    selectedCountryId: data ? data.selectedCountryId : state.anchorCountryId,
  };
}

export function writeSession(
  state: GameState,
  history: CountryHistory,
  selectedCountryId: string | null,
  world: World,
) {
  const text = JSON.stringify({
    sessionFormatVersion: SESSION_FORMAT_VERSION,
    campaign: JSON.parse(serializeSave(state)),
    history,
    selectedCountryId,
  });
  // Validate before writing too: never label a malformed session a successful save.
  readSession(text, world, Number.MAX_SAFE_INTEGER);
  return text;
}
