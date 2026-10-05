import { describe, expect, it } from "vitest";
import { eventsFileSchema } from "../src/content";
import { createCampaign, endTurn, eventSnapshots, type GameState } from "../src/sim";
import { setupFor, world } from "./helpers";

// Moments have weight (GDD v1.26): minor toasts, big back pages, headline front pages.

/** Plays until a card from `templateId` is pending. */
function until(templateId: string, state: GameState): GameState {
  let current = state;
  for (let i = 0; i < 40; i += 1) {
    if (current.events.pending.some((event) => event.templateId === templateId)) return current;
    current = endTurn(current, world);
  }
  throw new Error(`No ${templateId} card in 40 turns`);
}

const weightOf = (state: GameState, templateId: string) =>
  eventSnapshots(state, world).find((event) => event.templateId === templateId)?.weight;

describe("moment weight", () => {
  it("gives every moment a weight and no decision one", () => {
    for (const card of world.events.cards)
      expect(card.weight === null).toBe(card.kind === "decision");
    const content = structuredClone({ settings: world.events.settings, cards: world.events.cards });
    const moment = content.cards.find((card) => card.kind === "moment");
    if (!moment) throw new Error("No moment card");
    moment.weight = null;
    expect(eventsFileSchema.safeParse(content).success).toBe(false);
  });

  it("raises a big flagship moment to a headline at the headline tiers", () => {
    const state = until("season-champion", createCampaign(world, setupFor(3, "brazil")));
    expect(weightOf(state, "season-champion")).toBe("big");
    const professional: GameState = {
      ...state,
      events: {
        ...state.events,
        pending: state.events.pending.map((event) =>
          event.templateId === "season-champion"
            ? { ...event, facts: { ...event.facts, leagueTier: "professional" } }
            : event,
        ),
      },
    };
    expect(weightOf(professional, "season-champion")).toBe("headline");
  });

  it("makes the sport's first star a headline and keeps minor moments minor", () => {
    const state = until("star-breakout", createCampaign(world, setupFor(3, "brazil")));
    expect(state.landmarks.some((landmark) => landmark.kind === "firstStar")).toBe(true);
    expect(weightOf(state, "star-breakout")).toBe("headline");
    const opening = until("first-following", createCampaign(world, setupFor(3, "brazil")));
    expect(weightOf(opening, "first-following")).toBe("minor");
  });
});
