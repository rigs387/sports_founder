import { create } from "zustand";
import type { Names } from "../../../content";
import type { TurnSnapshot } from "../../../sim";
import { mapSettings } from "../map/model";
import { sim } from "../worker/client";
import { type CountryHistory, recordHistory } from "./history";

type Status = "idle" | "loading" | "ready" | "simulating" | "error";

interface GameStore {
  status: Status;
  snapshot: TurnSnapshot | null;
  names: Names | null;
  error: string | null;
  history: CountryHistory;
  selectedCountryId: string | null;
  selectCountry: (id: string | null) => void;
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
  history: {},
  selectedCountryId: null,
  selectCountry(id) {
    if (id !== null && !get().snapshot?.countries.some((country) => country.countryId === id))
      return;
    set({ selectedCountryId: id });
  },

  async startCampaign() {
    if (get().status !== "idle") return;
    set({ status: "loading" });
    try {
      // Seed choice happens outside the simulation; everything after it is deterministic.
      const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
      const [snapshot, names] = await Promise.all([sim.newCampaign(seed), sim.names()]);
      set({
        status: "ready",
        snapshot,
        names,
        history: recordHistory({}, snapshot, mapSettings.historyLimit),
        selectedCountryId: snapshot.anchorCountryId,
      });
    } catch (error) {
      set({ status: "error", error: messageOf(error) });
    }
  },

  async endTurn() {
    if (get().status !== "ready" || get().snapshot?.outcome) return;
    set({ status: "simulating" });
    try {
      const snapshot = await sim.endTurn();
      set({
        status: "ready",
        snapshot,
        history: recordHistory(get().history, snapshot, mapSettings.historyLimit),
      });
    } catch (error) {
      set({ status: "error", error: messageOf(error) });
    }
  },
}));
