import type { Names, World } from "../../../content";
import {
  type Action,
  anchorGenomeHints,
  applyAction,
  type CampaignSetup,
  createCampaign,
  endTurn,
  type GameState,
  IllegalActionError,
  MAX_SEED,
  snapshot,
  type TurnSnapshot,
} from "../../../sim";

export type ActionResult =
  | { ok: true; snapshot: TurnSnapshot }
  | { ok: false; snapshot: TurnSnapshot; reason: "illegal-action" };

/** One worker-owned campaign. The renderer never receives or edits simulation state. */
export function createSimWorkerApi(world: World) {
  let state: GameState | null = null;
  return {
    setupOptions() {
      return {
        seedMax: MAX_SEED,
        countries: world.countries.map(({ id, population, continent }) => ({
          id,
          population,
          continent,
        })),
        presets: world.genome.presets.map(({ id, genome }) => ({ id, genome: { ...genome } })),
      };
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
