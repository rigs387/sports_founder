import { create } from "zustand";
import type { Names } from "../../../content";
import type { TurnSnapshot } from "../../../sim";
import { sim } from "../worker/client";

type Status = "idle" | "loading" | "ready" | "simulating" | "error";

interface GameStore {
  status: Status;
  snapshot: TurnSnapshot | null;
  names: Names | null;
  error: string | null;
  startCampaign: () => Promise<void>;
  endTurn: () => Promise<void>;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** What the screen currently shows. Updated once per turn from a simulation snapshot. */
export const useGameStore = create<GameStore>()((set, get) => ({
  status: "idle",
  snapshot: null,
  names: null,
  error: null,

  async startCampaign() {
    if (get().status !== "idle") return;
    set({ status: "loading" });
    try {
      // Seed choice happens outside the simulation; everything after it is deterministic.
      const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
      const [snapshot, names] = await Promise.all([sim.newCampaign(seed), sim.names()]);
      set({ status: "ready", snapshot, names });
    } catch (error) {
      set({ status: "error", error: messageOf(error) });
    }
  },

  async endTurn() {
    if (get().status !== "ready") return;
    set({ status: "simulating" });
    try {
      const snapshot = await sim.endTurn();
      set({ status: "ready", snapshot });
    } catch (error) {
      set({ status: "error", error: messageOf(error) });
    }
  },
}));
