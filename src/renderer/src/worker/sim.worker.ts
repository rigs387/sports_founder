import { expose } from "comlink";
import type { Names } from "../../../content";
import {
  createCampaign,
  defaultGenome,
  endTurn,
  type GameState,
  snapshot,
  type TurnSnapshot,
} from "../../../sim";
import { loadBundledWorld } from "./bundled-content";

// The simulation runs here, off the UI thread. The UI calls these functions through Comlink and
// receives plain snapshots once per turn.

const world = loadBundledWorld();
let state: GameState | null = null;

const api = {
  newCampaign(seed: number): TurnSnapshot {
    const anchor = world.countries[0];
    if (!anchor) throw new Error("Content has no countries");
    // Genome design has no screen yet: campaigns use the first quick-start preset.
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

  names(): Names {
    return world.names;
  },
};

export type SimWorkerApi = typeof api;

expose(api);
