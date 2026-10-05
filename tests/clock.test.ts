import { describe, expect, it, vi } from "vitest";
import { CLOCK_INTERRUPTS } from "../src/content/map";
import { turnInterrupts } from "../src/renderer/src/state/clock";
import { createGameStore, type GameClient } from "../src/renderer/src/state/create-game-store";
import { createSimWorkerApi } from "../src/renderer/src/worker/api";
import { setupFor, withConfig, world } from "./helpers";

// The clock (GDD v1.24, tech plan 2.13 step 3).

const funded = withConfig(world, (config) => {
  config.start.startingPP = 1000;
});

/** A store over a real worker API, with every interrupt enabled and no replay time. */
async function playingStore() {
  const api = createSimWorkerApi(funded);
  const sim: GameClient = {
    newCampaign: async (setup) => api.newCampaign(setup),
    names: async () => world.names,
    setupOptions: async () => api.setupOptions(),
    endTurn: vi.fn(async () => api.endTurn()),
    applyAction: async (action) => api.applyAction(action),
    saveCampaign: async () => "",
    loadCampaign: async () => {
      throw new Error("unused");
    },
  };
  const store = createGameStore(sim, 160, undefined, {
    quarterMs: [0, 0, 0],
    defaultSpeed: 0,
    interrupts: [...CLOCK_INTERRUPTS],
  });
  await store.getState().loadSetup();
  await store.getState().startCampaign(setupFor(12, "brazil"));
  return { store, api, sim };
}

describe("the replay", () => {
  it("returns one frame per simulated quarter, ending where the turn ends", () => {
    const yearTurns = withConfig(world, (config) => {
      for (const tier of config.ppTiers) tier.turnLengthQuarters = 4;
    });
    const api = createSimWorkerApi(yearTurns);
    const start = api.newCampaign(setupFor(5, "brazil"));
    const { snapshot, frames } = api.endTurn();
    expect(frames.map((frame) => frame.quarter)).toEqual([1, 2, 3, 4]);
    expect(frames[0]?.quarter).toBe(start.quarter + 1);
    const last = frames.at(-1);
    expect(last?.year).toBe(snapshot.year);
    expect(last?.quarterOfYear).toBe(snapshot.quarterOfYear);
    for (const country of snapshot.countries)
      expect(last?.shares[country.countryId]).toBeCloseTo(country.share, 12);
  });
});

describe("interrupts", () => {
  it("names what a turn brought, keeping only the enabled ones", () => {
    const api = createSimWorkerApi(funded);
    let before = api.newCampaign(setupFor(12, "brazil"));
    let after = api.endTurn().snapshot;
    // The opening decision arrives on the first turn.
    expect(turnInterrupts(before, after, CLOCK_INTERRUPTS)).toContain("decision");
    expect(turnInterrupts(before, after, ["offseason"])).toEqual([]);
    while (!after.offseasonOpen) {
      before = after;
      after = api.endTurn().snapshot;
    }
    expect(turnInterrupts(before, after, CLOCK_INTERRUPTS)).toContain("offseason");
    expect(turnInterrupts(after, after, CLOCK_INTERRUPTS)).not.toContain("offseason");
  });
});

describe("play and pause", () => {
  it("starts paused, stops itself for a decision and resumes once it is answered", async () => {
    const { store } = await playingStore();
    expect(store.getState().clock.playing).toBe(false);
    store.getState().play();
    await store.getState().endTurn();
    const clock = store.getState().clock;
    expect(clock.playing).toBe(false);
    expect(clock.pausedFor).toEqual(["decision"]);
    expect(clock.resumeAfterAnswer).toBe(true);
    const decision = store.getState().snapshot?.events.find((event) => event.kind === "decision");
    if (!decision) throw new Error("No decision");
    await store.getState().dispatchAction({
      type: "chooseEvent",
      eventId: decision.id,
      choiceId: "welcome",
    });
    expect(store.getState().clock.playing).toBe(true);
    expect(store.getState().clock.pausedFor).toEqual([]);
  });

  it("stops for the offseason and stays paused until the player plays again", async () => {
    const { store } = await playingStore();
    let guard = 0;
    while (!store.getState().snapshot?.offseasonOpen && guard++ < 12) {
      // Answer anything pending so only the offseason can stop the clock.
      const pending = store.getState().snapshot?.events.find((e) => e.kind === "decision");
      if (pending)
        await store.getState().dispatchAction({
          type: "chooseEvent",
          eventId: pending.id,
          choiceId: pending.choices[0]?.id ?? "",
        });
      store.getState().play();
      await store.getState().endTurn();
    }
    const clock = store.getState().clock;
    expect(clock.playing).toBe(false);
    expect(clock.pausedFor).toContain("offseason");
    expect(clock.resumeAfterAnswer).toBe(false);
  });

  it("does not stop a turn played by step while paused", async () => {
    const { store } = await playingStore();
    await store.getState().endTurn();
    expect(store.getState().clock).toMatchObject({ playing: false, pausedFor: [] });
  });
});
