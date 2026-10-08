import { describe, expect, it } from "vitest";
import en from "../src/renderer/src/i18n/locales/en.json";
import {
  createCampaign,
  endTurn,
  eventSnapshots,
  flagshipSnapshot,
  type GameState,
  landmarks,
  outletOf,
  wireOutlet,
} from "../src/sim";
import { clubIds, fresh, withSeason } from "./culture-helpers";
import { setupFor, world } from "./helpers";

// Press (GDD v1.33, tech plan 2.20 step 3): presentation only.

describe("outlets", () => {
  it("a country's own paper arrives with its league; before that the sport's paper", () => {
    const state = createCampaign(world, setupFor(5, "brazil"));
    expect(outletOf(state, world, "argentina", state.quarter)).toEqual({ kind: "sport" });
    const formed: GameState = {
      ...state,
      landmarks: [...state.landmarks, landmarks.leagueFormed(1, 6, "argentina", false)],
    };
    expect(outletOf(formed, world, "argentina", 5)).toEqual({ kind: "sport" });
    const local = outletOf(formed, world, "argentina", 6);
    expect(local).toMatchObject({ kind: "local", place: world.places.argentina?.[0]?.name });
    if (local.kind !== "local") throw new Error("No local outlet");
    expect(world.names.press.words).toContain(local.word);
    // The anchor's league forms at the start: its paper is there from turn 1.
    expect(outletOf(state, world, "brazil", 0).kind).toBe("local");
    // Stable for a campaign: the same seed always names the same paper.
    expect(outletOf(formed, world, "argentina", 9)).toEqual(local);
    expect(wireOutlet(world)).toEqual({ kind: "wire", name: world.names.press.wire });
  });

  it("every event snapshot names its outlet", () => {
    let state = createCampaign(world, setupFor(5, "brazil"));
    while (state.events.pending.length === 0 && state.turn < 20) state = endTurn(state, world);
    const cards = eventSnapshots(state, world);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) expect(["local", "sport", "wire"]).toContain(card.outlet.kind);
  });
});

describe("the season's front page", () => {
  it("leads with a rare story and lists what the season's end brought", () => {
    const base = fresh();
    const [a = 0, b = 0] = clubIds(base).filter((id) => id !== base.identity.foundingClubId);
    // A first title in a European season: the lead is the first title.
    const first = withSeason(base, a, b);
    const page = flagshipSnapshot(first, world).frontPage;
    expect(page?.story).toBe("firstTitle");
    expect(page?.outlet.kind).toBe("local");
    // The same club again, no dynasty yet: an ordinary lead.
    const again = withSeason(first, a, b);
    expect(flagshipSnapshot(again, world).frontPage?.story).toBeNull();
    expect(flagshipSnapshot(base, world).frontPage).toBeNull();
  });
});

describe("headline variants", () => {
  it("every card with variants keeps a base title, and variants run in order", () => {
    const cards = en.events.cards as unknown as Record<string, Record<string, string>>;
    let withVariants = 0;
    for (const [id, card] of Object.entries(cards)) {
      const variants = Object.keys(card).filter((key) => /^title_v\d+$/.test(key));
      if (variants.length === 0) continue;
      withVariants += 1;
      expect(card.title, id).toBeTruthy();
      for (let i = 1; i <= variants.length; i += 1)
        expect(card[`title_v${i}`], `${id} v${i}`).toBeTruthy();
    }
    expect(withVariants).toBe(5);
  });
});
