import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGameStore, type GameClient } from "../src/renderer/src/state/create-game-store";
import { type ActionResult, createSimWorkerApi } from "../src/renderer/src/worker/api";
import { withConfig, world } from "./helpers";

const sim = {
  newCampaign: vi.fn<GameClient["newCampaign"]>(),
  names: vi.fn<GameClient["names"]>(),
  endTurn: vi.fn<GameClient["endTurn"]>(),
  applyAction: vi.fn<GameClient["applyAction"]>(),
};
let useGameStore = createGameStore(sim, 160);
const funded = withConfig(world, (config) => {
  config.start.startingPP = 1000;
});
let api = createSimWorkerApi(funded);
beforeEach(async () => {
  vi.resetAllMocks();
  useGameStore = createGameStore(sim, 160);
  api = createSimWorkerApi(funded);
  vi.mocked(sim.newCampaign).mockImplementation(async (seed) => api.newCampaign(seed));
  vi.mocked(sim.names).mockResolvedValue(world.names);
  vi.mocked(sim.endTurn).mockImplementation(async () => api.endTurn());
  vi.mocked(sim.applyAction).mockImplementation(async (action) => api.applyAction(action));
  await useGameStore.getState().startCampaign();
});

describe("UI decision serialization", () => {
  it("blocks a double-click and Next Turn until the worker has acknowledged the purchase", async () => {
    let resolve: (result: ActionResult) => void = () => {
      throw new Error("Not pending");
    };
    vi.mocked(sim.applyAction).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const action = { type: "buyNode", nodeId: "backyard-clinics" } as const;
    const selected = useGameStore.getState().selectedCountryId;
    const pending = useGameStore.getState().dispatchAction(action);
    expect(useGameStore.getState().status).toBe("acting");
    await useGameStore.getState().dispatchAction(action);
    await useGameStore.getState().endTurn();
    expect(sim.applyAction).toHaveBeenCalledTimes(1);
    expect(sim.endTurn).not.toHaveBeenCalled();
    resolve(api.applyAction(action));
    await pending;
    expect(useGameStore.getState().status).toBe("ready");
    expect(useGameStore.getState().selectedCountryId).toBe(selected);
    expect(useGameStore.getState().history[selected ?? ""]).toHaveLength(1);
    await useGameStore.getState().endTurn();
    expect(useGameStore.getState().history[selected ?? ""]).toHaveLength(2);
  });

  it("keeps rules rejections recoverable and accepts the next legal decision", async () => {
    await useGameStore.getState().dispatchAction({ type: "buyNode", nodeId: "word-of-mouth" });
    expect(useGameStore.getState().status).toBe("ready");
    expect(useGameStore.getState().actionError).toBe("rejected");
    await useGameStore.getState().dispatchAction({ type: "buyNode", nodeId: "backyard-clinics" });
    expect(useGameStore.getState().actionError).toBeNull();
    expect(useGameStore.getState().lastAction).toEqual({
      type: "buyNode",
      nodeId: "backyard-clinics",
    });
  });

  it("stops further mutations when the worker cannot confirm an action", async () => {
    vi.mocked(sim.applyAction).mockRejectedValueOnce(new Error("Worker disconnected"));
    await useGameStore.getState().dispatchAction({ type: "buyNode", nodeId: "backyard-clinics" });
    expect(useGameStore.getState().actionError).toBe("unavailable");
    await useGameStore.getState().endTurn();
    expect(sim.endTurn).not.toHaveBeenCalled();
  });
});
