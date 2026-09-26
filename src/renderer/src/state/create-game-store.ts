import { create } from "zustand";
import type { Names } from "../../../content";
import type { Action, CampaignSetup, TurnSnapshot } from "../../../sim";
import type { ActionResult, SetupOptions } from "../worker/api";
import { type CountryHistory, recordHistory } from "./history";

type Status = "idle" | "loading" | "setup" | "ready" | "acting" | "simulating" | "error";

export interface GameClient {
  newCampaign: (setup: CampaignSetup) => Promise<TurnSnapshot>;
  setupOptions: () => Promise<SetupOptions>;
  names: () => Promise<Names>;
  endTurn: () => Promise<TurnSnapshot>;
  applyAction: (action: Action) => Promise<ActionResult>;
}

interface GameStore {
  status: Status;
  snapshot: TurnSnapshot | null;
  names: Names | null;
  setupOptions: SetupOptions | null;
  setupError: "load" | "start" | null;
  error: string | null;
  actionError: "rejected" | "unavailable" | null;
  lastAction: Action | null;
  history: CountryHistory;
  selectedCountryId: string | null;
  selectCountry: (id: string | null) => void;
  loadSetup: () => Promise<void>;
  startCampaign: (setup: CampaignSetup) => Promise<void>;
  endTurn: () => Promise<void>;
  dispatchAction: (action: Action) => Promise<void>;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Authoritative worker snapshots; actions and turns share one in-flight guard. */
export const createGameStore = (sim: GameClient, historyLimit: number) =>
  create<GameStore>()((set, get) => ({
    status: "idle",
    snapshot: null,
    names: null,
    setupOptions: null,
    setupError: null,
    error: null,
    actionError: null,
    lastAction: null,
    history: {},
    selectedCountryId: null,
    selectCountry(id) {
      if (id !== null && !get().snapshot?.countries.some((country) => country.countryId === id))
        return;
      set({ selectedCountryId: id });
    },

    async loadSetup() {
      if (get().snapshot || !["idle", "error"].includes(get().status)) return;
      set({ status: "loading", setupError: null });
      try {
        const [setupOptions, names] = await Promise.all([sim.setupOptions(), sim.names()]);
        set({ status: "setup", setupOptions, names });
      } catch {
        set({ status: "error", setupError: "load" });
      }
    },

    async startCampaign(setup) {
      if (get().status !== "setup") return;
      set({ status: "loading", setupError: null });
      try {
        const snapshot = await sim.newCampaign(setup);
        set({
          status: "ready",
          snapshot,
          history: recordHistory({}, snapshot, historyLimit),
          selectedCountryId: snapshot.anchorCountryId,
        });
      } catch {
        set({ status: "setup", setupError: "start" });
      }
    },

    async endTurn() {
      if (get().status !== "ready" || get().snapshot?.outcome) return;
      set({ status: "simulating", actionError: null, lastAction: null });
      try {
        const snapshot = await sim.endTurn();
        set({
          status: "ready",
          snapshot,
          history: recordHistory(get().history, snapshot, historyLimit),
        });
      } catch (error) {
        set({ status: "error", error: messageOf(error) });
      }
    },

    async dispatchAction(action) {
      if (get().status !== "ready" || get().snapshot?.outcome) return;
      set({ status: "acting", actionError: null, lastAction: null });
      try {
        const result = await sim.applyAction(action);
        set({
          status: "ready",
          snapshot: result.snapshot,
          history: recordHistory(get().history, result.snapshot, historyLimit),
          actionError: result.ok ? null : "rejected",
          lastAction: result.ok ? action : null,
        });
      } catch {
        // A transport failure is not a rules rejection: don't allow another spend against stale state.
        set({ status: "error", actionError: "unavailable" });
      }
    },
  }));
