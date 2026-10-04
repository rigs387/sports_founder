import { describe, expect, it } from "vitest";
import { choiceValue, chooseEvents, EVENT_WEIGHTS } from "../src/runner/event-policy";
import { builder, randomBot } from "../src/runner/policy";
import { createCampaign, type GameState, offerEvents } from "../src/sim";
import { setupFor, world } from "./helpers";

// A league in trouble at the anchor, offered only the league-under-strain card.
function strained(pp: number) {
  const initial: GameState = { ...createCampaign(world, setupFor(7, "brazil")), turn: 20, pp };
  initial.quarter = 40;
  const index = world.countries.findIndex((c) => c.id === "brazil");
  const country = initial.countries[index];
  if (!country?.league) throw new Error("No founding league");
  initial.countries[index] = {
    ...country,
    league: { ...country.league, health: "near-collapse" },
    fans: country.fans.map((f, i) => (i === 0 ? { ...f, casual: 50000, hardcore: 1000 } : f)),
  };
  const only = {
    ...world,
    events: {
      ...world.events,
      cards: world.events.cards.filter((c) => c.id === "league-under-strain"),
    },
  };
  const state = offerEvents(initial, only, 1);
  const event = state.events.pending[0];
  if (!event) throw new Error("No league-under-strain event");
  return { state, event, only };
}

describe("bot event choices", () => {
  it("values a league rescue above the free default for a bot that prizes league health", () => {
    const { state, event, only } = strained(1000);
    const regroup = choiceValue(state, only, event.id, "regroup", EVENT_WEIGHTS.turtle);
    const hold = choiceValue(state, only, event.id, "hold", EVENT_WEIGHTS.turtle);
    expect(regroup).toBeGreaterThan(hold);
    const answered = chooseEvents(state, only, EVENT_WEIGHTS.turtle, 0);
    expect(answered.actions).toEqual([
      { type: "chooseEvent", eventId: event.id, choiceId: "regroup" },
    ]);
    expect(answered.state.pp).toBeLessThan(state.pp);
  });

  it("keeps its PP reserve, leaving the decision to the free default", () => {
    const { state, only } = strained(40);
    const answered = chooseEvents(state, only, EVENT_WEIGHTS.turtle, 30);
    // Regroup and outreach both cost more than the 10 PP above the reserve.
    expect(answered.actions).toEqual([]);
    expect(answered.state).toBe(state);
  });

  it("answers decisions through the same legal actions as the player", () => {
    const { state, only } = strained(1000);
    for (const play of [builder, randomBot]) {
      const step = play(state, only);
      const answers = step.actions.filter((a) => a.type === "chooseEvent");
      expect(answers.length).toBeLessThanOrEqual(1);
      if (answers.length === 1) expect(step.state.events.pending).toHaveLength(0);
    }
  });
});
