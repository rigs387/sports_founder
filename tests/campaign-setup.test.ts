import { describe, expect, it, vi } from "vitest";
import { createGameStore } from "../src/renderer/src/state/create-game-store";
import { createSimWorkerApi } from "../src/renderer/src/worker/api";
import { anchorGenomeHints, type CampaignSetup, createCampaign, snapshot } from "../src/sim";
import { presetGenome, setupFor, world } from "./helpers";

function host() {
  const api = createSimWorkerApi(world);
  const client = {
    saveCampaign: async (...args: Parameters<typeof api.saveCampaign>) => api.saveCampaign(...args),
    loadCampaign: async (...args: Parameters<typeof api.loadCampaign>) => api.loadCampaign(...args),
    setupOptions: vi.fn(async () => api.setupOptions()),
    names: vi.fn(async () => api.names()),
    newCampaign: vi.fn(async (setup: CampaignSetup) => api.newCampaign(setup)),
    endTurn: vi.fn(async () => api.endTurn()),
    applyAction: vi.fn(async (action: Parameters<typeof api.applyAction>[0]) =>
      api.applyAction(action),
    ),
  };
  return { api, client, store: createGameStore(client, 160) };
}

describe("campaign setup", () => {
  it("loads all markets, presets and anchor hints without starting a campaign", async () => {
    const { api, client, store } = host();
    await store.getState().loadSetup();
    expect(store.getState().status).toBe("setup");
    expect(store.getState().snapshot).toBeNull();
    expect(store.getState().history).toEqual({});
    expect(client.newCampaign).not.toHaveBeenCalled();
    expect(api.setupOptions().countries.map((country) => country.id)).toEqual(
      world.countries.map((country) => country.id),
    );
    expect(api.setupOptions().presets).toEqual(world.genome.presets);
    for (const id of ["tuvalu", "brazil"])
      expect(api.anchorHints(id)).toEqual(anchorGenomeHints(world, id));
    expect(() => api.endTurn()).toThrow("No campaign");
  });
  it("starts the exact chosen anchor, custom genome and seed at turn one", async () => {
    const { store } = host();
    const setup = setupFor(0, "tuvalu", { ...presetGenome("ice-paddle"), contact: "none" });
    await store.getState().loadSetup();
    await store.getState().startCampaign(setup);
    expect(store.getState().snapshot).toEqual(snapshot(createCampaign(world, setup), world));
    expect(store.getState().snapshot?.focus).toEqual(["tuvalu"]);
    expect(store.getState().selectedCountryId).toBe("tuvalu");
    expect(store.getState().history.tuvalu).toHaveLength(1);
    await store.getState().endTurn();
    expect(store.getState().snapshot?.genome).toEqual(setup.genome);
    expect(store.getState().snapshot?.anchorCountryId).toBe("tuvalu");
  });
  it("blocks duplicate starts and mutations while launch is pending", async () => {
    const { api, client, store } = host();
    await store.getState().loadSetup();
    const setup = setupFor(42, "brazil", presetGenome("street-court"));
    let finish = () => {};
    client.newCampaign.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(api.newCampaign(setup));
        }),
    );
    const pending = store.getState().startCampaign(setup);
    await store.getState().startCampaign(setupFor(9));
    await store.getState().endTurn();
    await store.getState().dispatchAction({ type: "buyNode", nodeId: "backyard-clinics" });
    expect(client.newCampaign).toHaveBeenCalledTimes(1);
    expect(client.endTurn).not.toHaveBeenCalled();
    expect(client.applyAction).not.toHaveBeenCalled();
    finish();
    await pending;
    await store.getState().startCampaign(setupFor(9));
    expect(client.newCampaign).toHaveBeenCalledTimes(1);
    expect(store.getState().snapshot?.seed).toBe(42);
  });
  it("keeps setup retryable after loading or starting fails", async () => {
    const { client, store } = host();
    client.setupOptions.mockRejectedValueOnce(new Error("Unavailable"));
    await store.getState().loadSetup();
    expect(store.getState().setupError).toBe("load");
    await store.getState().loadSetup();
    const setup = setupFor(7, "brazil");
    await store.getState().startCampaign({ ...setup, seed: -1 });
    expect(store.getState().status).toBe("setup");
    expect(store.getState().setupError).toBe("start");
    expect(store.getState().snapshot).toBeNull();
    await store.getState().startCampaign(setup);
    expect(store.getState().status).toBe("ready");
    expect(store.getState().setupError).toBeNull();
  });
  it("validates the complete setup at the worker boundary", () => {
    const { api } = host();
    const setup = setupFor(12);
    expect(() => api.newCampaign({ ...setup, anchorCountryId: "missing" })).toThrow();
    for (const seed of [-1, 1.5, api.setupOptions().seedMax + 1])
      expect(() => api.newCampaign({ ...setup, seed })).toThrow();
    const invalid = { ...setup, genome: { ...setup.genome, surface: "lava" } };
    expect(() => api.newCampaign(invalid as CampaignSetup)).toThrow();
    expect(() => api.endTurn()).toThrow("No campaign");
    expect(api.newCampaign(setup).turn).toBe(1);
  });
});
