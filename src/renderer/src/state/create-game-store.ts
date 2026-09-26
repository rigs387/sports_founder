import { create } from "zustand";
import type { Names } from "../../../content";
import type { FileDialogCopy, SaveFiles } from "../../../shared/save-files";
import type { Action, CampaignSetup, TurnSnapshot } from "../../../sim";
import type { ActionResult, SetupOptions, SimWorkerApi } from "../worker/api";
import { type CountryHistory, recordHistory } from "./history";

type Status =
  | "idle"
  | "loading"
  | "setup"
  | "ready"
  | "acting"
  | "simulating"
  | "saving"
  | "opening"
  | "error";

export interface GameClient {
  newCampaign: (setup: CampaignSetup) => Promise<TurnSnapshot>;
  setupOptions: () => Promise<SetupOptions>;
  names: () => Promise<Names>;
  endTurn: () => Promise<TurnSnapshot>;
  applyAction: (action: Action) => Promise<ActionResult>;
  saveCampaign: (...args: Parameters<SimWorkerApi["saveCampaign"]>) => Promise<string>;
  loadCampaign: (
    ...args: Parameters<SimWorkerApi["loadCampaign"]>
  ) => Promise<ReturnType<SimWorkerApi["loadCampaign"]>>;
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
  dirty: boolean;
  fileName: string | null;
  fileNotice: "saved" | "loaded" | "saveError" | "openError" | "invalid" | null;
  campaignRevision: number;
  saveCampaign: (copy: FileDialogCopy) => Promise<void>;
  loadCampaign: (copy: FileDialogCopy) => Promise<void>;
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
export const createGameStore = (sim: GameClient, historyLimit: number, files?: SaveFiles) =>
  create<GameStore>()((set, get) => ({
    status: "idle",
    snapshot: null,
    names: null,
    setupOptions: null,
    setupError: null,
    error: null,
    actionError: null,
    lastAction: null,
    dirty: false,
    fileName: null,
    fileNotice: null,
    campaignRevision: 0,
    history: {},
    selectedCountryId: null,
    async saveCampaign(copy) {
      if (!files || get().status !== "ready") return;
      set({ status: "saving", fileNotice: null });
      try {
        const text = await sim.saveCampaign(get().history, get().selectedCountryId);
        const result = await files.save(text, copy);
        if (result.status === "ok")
          set({ dirty: false, fileName: result.value, fileNotice: "saved" });
        if (result.status === "error") set({ fileNotice: "saveError" });
      } catch {
        set({ fileNotice: "saveError" });
      } finally {
        set({ status: "ready" });
      }
    },
    async loadCampaign(copy) {
      const previous = get().status;
      if (!files || !["ready", "setup", "error"].includes(previous)) return;
      set({ status: "opening", fileNotice: null });
      let requestedLoad = false;
      try {
        const file = await files.open(copy);
        if (file.status === "cancelled") {
          set({ status: previous });
          return;
        }
        if (file.status === "error") {
          set({ status: previous, fileNotice: "openError" });
          return;
        }
        const names = get().names ?? (await sim.names());
        requestedLoad = true;
        const loaded = await sim.loadCampaign(file.value.text, historyLimit);
        if (!loaded.ok) {
          set({ status: previous, fileNotice: "invalid" });
          return;
        }
        files.acceptLoad();
        set({
          status: "ready",
          snapshot: loaded.snapshot,
          names,
          history: loaded.history,
          selectedCountryId: loaded.selectedCountryId,
          dirty: false,
          fileName: file.value.name,
          fileNotice: "loaded",
          error: null,
          actionError: null,
          lastAction: null,
          campaignRevision: get().campaignRevision + 1,
        });
      } catch {
        // A transport failure may have committed a load; block actions against stale state.
        set({ status: requestedLoad ? "error" : previous, fileNotice: "openError" });
      }
    },
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
          dirty: true,
          fileName: null,
          fileNotice: null,
          campaignRevision: get().campaignRevision + 1,
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
          dirty: true,
          fileNotice: null,
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
          dirty: get().dirty || result.ok,
          fileNotice: null,
        });
      } catch {
        // A transport failure is not a rules rejection: don't allow another spend against stale state.
        set({ status: "error", actionError: "unavailable", dirty: true });
      }
    },
  }));
