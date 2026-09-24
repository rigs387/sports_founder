import type { Names, World } from "../../../content";
import {
  type Action,
  applyAction,
  createCampaign,
  defaultGenome,
  endTurn,
  type GameState,
  IllegalActionError,
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
    newCampaign(seed: number): TurnSnapshot {
      const anchor = world.countries[0];
      if (!anchor) throw new Error("Content has no countries");
      state = createCampaign(world, {
        seed,
        anchorCountryId: anchor.id,
        genome: defaultGenome(world),
      });
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
