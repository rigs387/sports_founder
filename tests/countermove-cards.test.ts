import { describe, expect, it } from "vitest";
import en from "../src/renderer/src/i18n/locales/en.json";
import { createCampaign, type GameState, landmarks, offerEvents, takesNoSlot } from "../src/sim";
import { setupFor, world } from "./helpers";

// GDD v1.34 topic C: a rival's countermove at the seat is big news, told from the landmark.
describe("rival countermoves at the seat", () => {
  const start = { ...createCampaign(world, setupFor(3, "brazil")), turn: 30, quarter: 60 };
  const card = world.events.cards.find((c) => c.trigger === "countermove");
  const only = { ...world, events: { ...world.events, cards: card ? [card] : [] } };
  const withMove = (state: GameState, countryId: string, move: "broadcastDeal" | "reclaim") => ({
    ...state,
    landmarks: [
      ...state.landmarks,
      landmarks.rivalCountermove(30, 59, countryId, "soccer", move, 75),
    ],
  });

  it("is a big moment that takes no slot, naming the rival, the move and its end", () => {
    expect(card).toMatchObject({ kind: "moment", weight: "big" });
    expect(takesNoSlot(card)).toBe(true);
    const offered = offerEvents(withMove(start, "brazil", "broadcastDeal"), only, 1);
    const event = offered.events.pending.find((e) => e.templateId === card?.id);
    expect(event?.facts.rivalId).toBe("soccer");
    expect(event?.facts.countermove).toMatchObject({ move: "broadcastDeal", endQuarter: 75 });
    expect(event?.facts.countermove?.endYear).toBeGreaterThan(2026);
  });

  it("is told only at the seat, and never for a reclaim (it has its own card)", () => {
    const abroad = offerEvents(withMove(start, "argentina", "broadcastDeal"), only, 1);
    expect(abroad.events.pending).toHaveLength(0);
    const reclaim = offerEvents(withMove(start, "brazil", "reclaim"), only, 1);
    expect(reclaim.events.pending).toHaveLength(0);
  });

  it("has words for every timed countermove", () => {
    const text = (en.events.cards as unknown as Record<string, Record<string, string>>)[
      "rival-countermove"
    ];
    for (const move of ["broadcastDeal", "sponsorLockout", "mediaBlitz", "youthPrograms"]) {
      expect(text?.[`title_${move}`]).toBeTruthy();
      expect(text?.[`body_${move}`]).toBeTruthy();
    }
  });
});
