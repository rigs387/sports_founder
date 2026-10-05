import { create } from "zustand";
import type { Names } from "../../../content";
import type { ClockInterrupt, MapSettings } from "../../../content/map";
import type { FileDialogCopy, SaveFiles } from "../../../shared/save-files";
import type { Action, CampaignSetup, QuarterFrame, TurnSnapshot } from "../../../sim";
import type { ActionResult, SetupOptions, SimWorkerApi, TurnResult } from "../worker/api";
import { pendingDecisions, turnInterrupts } from "./clock";
import { type CountryHistory, recordHistory } from "./history";

export type ClockSettings = MapSettings["clock"];

/** Headless use (tests): no replay time, and only decisions pause the clock. */
const INSTANT_CLOCK: ClockSettings = {
  quarterMs: [0, 0, 0],
  defaultSpeed: 0,
  interrupts: ["decision"],
};

/** The clock (GDD v1.24): whether time runs, how fast, and why it last stopped itself. */
export interface Clock {
  playing: boolean;
  /** Index into the configured speeds, slowest first. */
  speed: number;
  /** The interrupts that stopped play, empty if the player paused it or it never ran. */
  pausedFor: ClockInterrupt[];
  /** Stopped for a decision: play resumes once no decision is left unanswered. */
  resumeAfterAnswer: boolean;
}

/** The turn just played, replayed quarter by quarter on the map and the date. */
export interface Replay {
  frames: QuarterFrame[];
  /** performance.now() when the replay began, and each quarter's time on screen. */
  startedAt: number;
  quarterMs: number;
}

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
  endTurn: () => Promise<TurnResult>;
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
  clock: Clock;
  replay: Replay | null;
  play: () => void;
  pause: () => void;
  setSpeed: (speed: number) => void;
  /** Ends the replay on screen (it ran out, or the player acted). */
  finishReplay: () => void;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Authoritative worker snapshots; actions and turns share one in-flight guard. */
export const createGameStore = (
  sim: GameClient,
  historyLimit: number,
  files?: SaveFiles,
  clockSettings: ClockSettings = INSTANT_CLOCK,
) => {
  const stopped = (): Clock => ({
    playing: false,
    speed: clockSettings.defaultSpeed,
    pausedFor: [],
    resumeAfterAnswer: false,
  });
  return create<GameStore>()((set, get) => ({
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
    clock: stopped(),
    replay: null,
    play() {
      if (get().snapshot?.outcome) return;
      set({ clock: { ...get().clock, playing: true, pausedFor: [], resumeAfterAnswer: false } });
    },
    pause() {
      set({ clock: { ...get().clock, playing: false, pausedFor: [], resumeAfterAnswer: false } });
    },
    setSpeed(speed) {
      if (speed < 0 || speed >= clockSettings.quarterMs.length) return;
      set({ clock: { ...get().clock, speed } });
    },
    finishReplay() {
      if (get().replay) set({ replay: null });
    },
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
          clock: { ...stopped(), speed: get().clock.speed },
          replay: null,
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
          clock: stopped(),
          replay: null,
        });
      } catch {
        set({ status: "setup", setupError: "start" });
      }
    },

    async endTurn() {
      const before = get().snapshot;
      if (get().status !== "ready" || !before || before.outcome) return;
      set({ status: "simulating", actionError: null, lastAction: null, replay: null });
      try {
        const { snapshot, frames } = await sim.endTurn();
        const clock = get().clock;
        const interrupts = turnInterrupts(before, snapshot, clockSettings.interrupts);
        const stops = clock.playing && (interrupts.length > 0 || snapshot.outcome !== null);
        const quarterMs = clockSettings.quarterMs[clock.speed] ?? 0;
        set({
          status: "ready",
          snapshot,
          history: recordHistory(get().history, snapshot, historyLimit),
          dirty: true,
          fileNotice: null,
          replay:
            quarterMs > 0 && frames.length > 0
              ? { frames, startedAt: performance.now(), quarterMs }
              : null,
          clock: stops
            ? {
                ...clock,
                playing: false,
                pausedFor: interrupts,
                resumeAfterAnswer:
                  interrupts.length === 1 && interrupts[0] === "decision" && !snapshot.outcome,
              }
            : clock,
        });
      } catch (error) {
        set({
          status: "error",
          error: messageOf(error),
          clock: { ...get().clock, playing: false },
        });
      }
    },

    async dispatchAction(action) {
      if (get().status !== "ready" || get().snapshot?.outcome) return;
      set({ status: "acting", actionError: null, lastAction: null, replay: null });
      try {
        const result = await sim.applyAction(action);
        const clock = get().clock;
        // Stopped for a decision: answering the last one resumes play at the same speed.
        const resume = clock.resumeAfterAnswer && pendingDecisions(result.snapshot) === 0;
        set({
          clock: resume
            ? { ...clock, playing: true, pausedFor: [], resumeAfterAnswer: false }
            : clock,
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
};
