import type { Names, World } from "../../../content";
import {
  type Action,
  anchorGenomeHints,
  applyAction,
  type CampaignSetup,
  createCampaign,
  defaultIdentitySetup,
  endTurn,
  type GameState,
  IllegalActionError,
  MAX_SEED,
  snapshot,
  suggestSportName,
  type TurnSnapshot,
} from "../../../sim";
import type { CountryHistory } from "../state/history";
import { readSession, writeSession } from "../state/session-save";

export type ActionResult =
  | { ok: true; snapshot: TurnSnapshot }
  | { ok: false; snapshot: TurnSnapshot; reason: "illegal-action" };

/** One worker-owned campaign. The renderer never receives or edits simulation state. */
export function createSimWorkerApi(world: World) {
  let state: GameState | null = null;
  return {
    saveCampaign(history: CountryHistory, selectedCountryId: string | null) {
      if (!state) throw new Error("No campaign in progress");
      return writeSession(state, history, selectedCountryId, world);
    },
    loadCampaign(text: string, historyLimit: number) {
      try {
        const loaded = readSession(text, world, historyLimit);
        state = loaded.state;
        return {
          ok: true as const,
          snapshot: loaded.snapshot,
          history: loaded.history,
          selectedCountryId: loaded.selectedCountryId,
        };
      } catch {
        // All validation, migrations and snapshot construction finish before replacing the campaign.
        return { ok: false as const };
      }
    },
    setupOptions() {
      return {
        seedMax: MAX_SEED,
        countries: world.countries.map(({ id, population, continent }) => ({
          id,
          population,
          continent,
        })),
        presets: world.genome.presets.map(({ id, genome }) => ({ id, genome: { ...genome } })),
        identity: {
          birthplaces: [...world.identity.birthplaces],
          ethos: [...world.identity.ethos],
          terms: structuredClone(world.identity.terms),
          emblem: structuredClone(world.identity.emblem),
          limits: { ...world.config.identity },
          oddPairings: structuredClone(world.identity.oddPairings),
          maxOddLines: world.identity.maxOddLines,
        },
      };
    },
    /** The anchor's real places (biggest first) and the seed's default identity there. */
    identityDefaults(seed: number, anchorCountryId: string) {
      return {
        places: (world.places[anchorCountryId] ?? []).map((place) => place.name),
        defaults: defaultIdentitySetup(world, seed, anchorCountryId),
      };
    },
    suggestSportName(seed: number, attempt: number) {
      return suggestSportName(world, seed, attempt);
    },
    anchorHints(countryId: string) {
      return anchorGenomeHints(world, countryId);
    },
    newCampaign(setup: CampaignSetup): TurnSnapshot {
      state = createCampaign(world, setup);
      return snapshot(state, world);
    },
    endTurn(): TurnSnapshot {
      if (!state) throw new Error("No campaign in progress");
      state = endTurn(state, world);
      return snapshot(state, world);
    },
    applyAction(action: Action): ActionResult {
      if (!state) throw new Error("No campaign in progress");
      try {
        state = applyAction(state, world, action);
      } catch (error) {
        if (!(error instanceof IllegalActionError)) throw error;
        // Expected rejections leave the campaign intact and refresh stale UI prices/locks.
        return { ok: false, reason: "illegal-action", snapshot: snapshot(state, world) };
      }
      return { ok: true, snapshot: snapshot(state, world) };
    },
    names(): Names {
      return world.names;
    },
  };
}

export type SimWorkerApi = ReturnType<typeof createSimWorkerApi>;
export type SetupOptions = ReturnType<SimWorkerApi["setupOptions"]>;
