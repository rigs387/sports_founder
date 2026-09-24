import { describe, expect, it } from "vitest";
import { createSimWorkerApi } from "../src/renderer/src/worker/api";
import { applyAction, createCampaign, endTurn, focusCost, snapshot } from "../src/sim";
import { setupFor, withConfig, world } from "./helpers";

const funded = withConfig(world, (config) => {
  config.start.startingPP = 1000;
});

describe("worker action boundary", () => {
  it("buys once, rejects duplicates, and carries the purchase into the next simulated turn", () => {
    const api = createSimWorkerApi(funded);
    const before = api.newCampaign(12);
    const action = { type: "buyNode", nodeId: "backyard-clinics" } as const;
    const bought = api.applyAction(action);
    expect(bought.ok).toBe(true);
    expect(bought.snapshot.turn).toBe(before.turn);
    expect(bought.snapshot.quarter).toBe(before.quarter);
    expect(bought.snapshot.pp).toBe(
      before.pp - (before.growthNodes.find((node) => node.nodeId === action.nodeId)?.cost ?? 0),
    );
    expect(bought.snapshot.landmarkCount).toBe(before.landmarkCount + 1);
    expect(
      bought.snapshot.growthNodes.find((node) => node.nodeId === "word-of-mouth")?.status,
    ).toBe("available");
    expect(api.applyAction(action)).toEqual({
      ok: false,
      reason: "illegal-action",
      snapshot: bought.snapshot,
    });
    const expected = applyAction(createCampaign(funded, setupFor(12)), funded, action);
    expect(api.endTurn()).toEqual(snapshot(endTurn(expected, funded), funded));
  });

  it("quotes authoritative focus costs, replaces the selected slot, and rejects a duplicate", () => {
    const api = createSimWorkerApi(funded);
    const before = api.newCampaign(12);
    const state = createCampaign(funded, setupFor(12));
    for (const id of ["albania", "italy", "tuvalu"])
      expect(before.countries.find((country) => country.countryId === id)?.focusCost).toBe(
        focusCost(state, funded, id),
      );
    const action = { type: "assignFocus", slot: 0, countryId: "tuvalu" } as const;
    const assigned = api.applyAction(action);
    expect(assigned.ok).toBe(true);
    expect(assigned.snapshot.focus).toEqual(["tuvalu"]);
    expect(
      assigned.snapshot.countries.find((country) => country.countryId === "tuvalu")?.focused,
    ).toBe(true);
    expect(
      assigned.snapshot.countries.find((country) => country.countryId === before.anchorCountryId)
        ?.focused,
    ).toBe(false);
    expect(assigned.snapshot.pp).toBe(before.pp - focusCost(state, funded, "tuvalu"));
    expect(assigned.snapshot.turn).toBe(before.turn);
    expect(api.applyAction(action).ok).toBe(false);
    expect(api.applyAction({ ...action, slot: 999 }).snapshot).toEqual(assigned.snapshot);
    expect(api.endTurn().focus).toEqual(["tuvalu"]);
  });

  it("enforces prerequisite, tier, fork and budget rules without damaging the campaign", () => {
    const api = createSimWorkerApi(funded);
    const start = api.newCampaign(3);
    for (const nodeId of ["word-of-mouth", "local-radio", "not-a-node"])
      expect(api.applyAction({ type: "buyNode", nodeId })).toEqual({
        ok: false,
        reason: "illegal-action",
        snapshot: start,
      });
    api.applyAction({ type: "buyNode", nodeId: "backyard-clinics" });
    const fork = api.applyAction({ type: "buyNode", nodeId: "street-courts" });
    expect(fork.ok).toBe(true);
    expect(api.applyAction({ type: "buyNode", nodeId: "club-grounds" }).snapshot).toEqual(
      fork.snapshot,
    );
    const poor = createSimWorkerApi(
      withConfig(world, (config) => {
        config.start.startingPP = 0;
      }),
    );
    const empty = poor.newCampaign(4);
    expect(poor.applyAction({ type: "buyNode", nodeId: "backyard-clinics" }).snapshot).toEqual(
      empty,
    );
    expect(
      poor.applyAction({ type: "assignFocus", slot: 0, countryId: "tuvalu" }).snapshot,
    ).toEqual(empty);
    expect(poor.endTurn().turn).toBe(2);
  });

  it("lets the player choose the slot to lose after a demotion", () => {
    const demoting = withConfig(funded, (config) => {
      config.start.startingTier = 2;
      config.tierTrack.demotionTurns = 1;
      config.tierTrack.cooldownTurns = 0;
    });
    const api = createSimWorkerApi(demoting);
    api.newCampaign(4);
    api.applyAction({ type: "assignFocus", slot: 1, countryId: "tuvalu" });
    const demoted = api.endTurn();
    expect(demoted.tierTrack.slotsToDrop).toBe(1);
    const dropped = api.applyAction({ type: "dropFocusSlot", slot: 0 });
    expect(dropped.ok).toBe(true);
    expect(dropped.snapshot.focus).toEqual(["tuvalu"]);
    expect(dropped.snapshot.tierTrack.slotsToDrop).toBe(0);
    expect(dropped.snapshot.pp).toBe(demoted.pp);
    expect(api.applyAction({ type: "dropFocusSlot", slot: 0 }).ok).toBe(false);
  });

  it("refuses an action before any campaign exists", () => {
    expect(() =>
      createSimWorkerApi(world).applyAction({ type: "buyNode", nodeId: "backyard-clinics" }),
    ).toThrow("No campaign");
  });
});
