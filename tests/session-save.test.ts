import { describe, expect, it, vi } from "vitest";
import { createGameStore } from "../src/renderer/src/state/create-game-store";
import { recordHistory } from "../src/renderer/src/state/history";
import { readSession, writeSession } from "../src/renderer/src/state/session-save";
import { createSimWorkerApi } from "../src/renderer/src/worker/api";
import type { SaveFiles } from "../src/shared/save-files";
import { createCampaign, endTurn, serializeSave, snapshot } from "../src/sim";
import { setupFor, world } from "./helpers";

const copy = { title: "Campaign", filter: "Save", button: "OK" };
function fixture() {
  let state = createCampaign(world, setupFor(424242, "brazil"));
  let history = recordHistory({}, snapshot(state, world), 160);
  for (let i = 0; i < 4; i++) {
    state = endTurn(state, world);
    history = recordHistory(history, snapshot(state, world), 160);
  }
  return { state, history, text: writeSession(state, history, "tuvalu", world) };
}

function host() {
  const api = createSimWorkerApi(world);
  const client = {
    newCampaign: async (...args: Parameters<typeof api.newCampaign>) => api.newCampaign(...args),
    setupOptions: async () => api.setupOptions(),
    names: async () => api.names(),
    endTurn: vi.fn(async () => api.endTurn()),
    applyAction: vi.fn(async (...args: Parameters<typeof api.applyAction>) =>
      api.applyAction(...args),
    ),
    saveCampaign: async (...args: Parameters<typeof api.saveCampaign>) => api.saveCampaign(...args),
    loadCampaign: vi.fn(async (...args: Parameters<typeof api.loadCampaign>) =>
      api.loadCampaign(...args),
    ),
  };
  const files = {
    save: vi.fn<SaveFiles["save"]>(),
    open: vi.fn<SaveFiles["open"]>(),
    closeState: vi.fn(),
    acceptLoad: vi.fn(),
  };
  return { api, client, files, store: createGameStore(client, 160, files) };
}

describe("campaign file sessions", () => {
  it("round-trips every history point, selection and state; next turn is identical", () => {
    const { state, history, text } = fixture();
    const loaded = readSession(text, world, 160);
    expect(loaded.state).toStrictEqual(state);
    expect(loaded.history).toStrictEqual(history);
    expect(loaded.selectedCountryId).toBe("tuvalu");
    expect(writeSession(loaded.state, loaded.history, loaded.selectedCountryId, world)).toBe(text);
    expect(endTurn(loaded.state, world)).toStrictEqual(endTurn(state, world));
  });

  it("imports old simulation-only files without inventing past history", () => {
    const { state } = fixture();
    const loaded = readSession(serializeSave(state), world, 160);
    expect(loaded.state).toStrictEqual(state);
    expect(loaded.selectedCountryId).toBe(state.anchorCountryId);
    expect(Object.values(loaded.history).every((points) => points.length === 1)).toBe(true);
  });

  it("rejects corrupt, future, incompatible and invalid-history files without changing the worker", () => {
    const { text, history } = fixture();
    const api = createSimWorkerApi(world);
    const first = api.newCampaign(setupFor(123));
    const before = api.saveCampaign(recordHistory({}, first, 160), null);
    const edits = [
      (raw: ReturnType<typeof JSON.parse>) => {
        raw.history = {};
      },
      (raw: ReturnType<typeof JSON.parse>) => {
        raw.history.brazil.at(-1).share = 0;
      },
      (raw: ReturnType<typeof JSON.parse>) => {
        raw.sessionFormatVersion = 2;
      },
      (raw: ReturnType<typeof JSON.parse>) => {
        raw.campaign.formatVersion = 999;
      },
      (raw: ReturnType<typeof JSON.parse>) => {
        raw.campaign.state.countries[0].countryId = "missing-market";
      },
      (raw: ReturnType<typeof JSON.parse>) => {
        raw.history.brazil[0].share = -1;
      },
      (raw: ReturnType<typeof JSON.parse>) => {
        raw.history.brazil[0].turn = 999999;
      },
      (raw: ReturnType<typeof JSON.parse>) => {
        raw.history.brazil.reverse();
      },
      (raw: ReturnType<typeof JSON.parse>) => {
        raw.selectedCountryId = "missing-market";
      },
    ];
    expect(api.loadCampaign("{", 160).ok).toBe(false);
    for (const edit of edits) {
      const raw = JSON.parse(text);
      edit(raw);
      expect(api.loadCampaign(JSON.stringify(raw), 160).ok).toBe(false);
      expect(api.saveCampaign(recordHistory({}, first, 160), null)).toBe(before);
    }
    const loaded = api.loadCampaign(text, 3);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.history.brazil).toStrictEqual(history.brazil?.slice(-3));
  });

  it("keeps dirty progress on cancel/failure and blocks all mutations during disk writes", async () => {
    const { store, files, client } = host();
    await store.getState().loadSetup();
    await store.getState().startCampaign(setupFor(3));
    files.save.mockResolvedValueOnce({ status: "cancelled" });
    await store.getState().saveCampaign(copy);
    expect(store.getState().dirty).toBe(true);
    files.save.mockResolvedValueOnce({ status: "error" });
    await store.getState().saveCampaign(copy);
    expect(store.getState().fileNotice).toBe("saveError");
    expect(store.getState().dirty).toBe(true);
    let resolve: (value: Awaited<ReturnType<SaveFiles["save"]>>) => void = () => {};
    files.save.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = store.getState().saveCampaign(copy);
    await vi.waitFor(() => expect(files.save).toHaveBeenCalledTimes(3));
    expect(store.getState().status).toBe("saving");
    await store.getState().endTurn();
    await store.getState().dispatchAction({ type: "assignFocus", slot: 0, countryId: "tuvalu" });
    await store.getState().saveCampaign(copy);
    await store.getState().loadCampaign(copy);
    expect(client.endTurn).not.toHaveBeenCalled();
    expect(client.applyAction).not.toHaveBeenCalled();
    expect(files.open).not.toHaveBeenCalled();
    expect(files.save).toHaveBeenCalledTimes(3);
    resolve({ status: "ok", value: "campaign.sfsave" });
    await pending;
    expect(store.getState().dirty).toBe(false);
    await store.getState().endTurn();
    expect(store.getState().dirty).toBe(true);
    expect(store.getState().fileNotice).toBeNull();
  });

  it("loads from setup and preserves the current campaign on cancel, read error or invalid input", async () => {
    const { store, files } = host();
    const { text, history, state } = fixture();
    await store.getState().loadSetup();
    files.open.mockResolvedValueOnce({ status: "ok", value: { text, name: "brazil.sfsave" } });
    await store.getState().loadCampaign(copy);
    expect(store.getState().snapshot).toStrictEqual(snapshot(state, world));
    expect(store.getState().history).toStrictEqual(history);
    expect(store.getState().selectedCountryId).toBe("tuvalu");
    expect(files.acceptLoad).toHaveBeenCalledTimes(1);
    await store.getState().endTurn();
    const before = store.getState();
    for (const result of [
      { status: "cancelled" },
      { status: "error" },
      { status: "ok", value: { text: "{}", name: "bad.sfsave" } },
    ] as const) {
      files.open.mockResolvedValueOnce(result);
      await store.getState().loadCampaign(copy);
      expect(store.getState().snapshot).toBe(before.snapshot);
      expect(store.getState().history).toBe(before.history);
      expect(store.getState().dirty).toBe(true);
      expect(store.getState().status).toBe("ready");
      expect(store.getState().fileName).toBe("brazil.sfsave");
      expect(files.acceptLoad).toHaveBeenCalledTimes(1);
    }
  });

  it("blocks stale actions if the load acknowledgement is lost", async () => {
    const { store, files, client } = host();
    await store.getState().loadSetup();
    files.open.mockResolvedValue({
      status: "ok",
      value: { text: fixture().text, name: "save.sfsave" },
    });
    client.loadCampaign.mockRejectedValueOnce(new Error("Worker disconnected"));
    await store.getState().loadCampaign(copy);
    expect(store.getState().status).toBe("error");
    await store.getState().endTurn();
    expect(client.endTurn).not.toHaveBeenCalled();
    await store.getState().loadCampaign(copy);
    expect(store.getState().status).toBe("ready");
  });
});
