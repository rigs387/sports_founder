import { describe, expect, it } from "vitest";
import {
  applyAction,
  type EventRecord,
  eventEffects,
  type GameState,
  offerEvents,
  PLAYER_INDEX,
  seasonFacts,
  updateCulture,
} from "../src/sim";
import { clubIds, fresh, ofType, withSeason } from "./culture-helpers";
import { world } from "./helpers";

// Culture, first build (GDD v1.22): traditions as cards.

const card = (id: string) => {
  const found = world.events.cards.find((c) => c.id === id);
  if (!found) throw new Error(`no card ${id}`);
  return found;
};

describe("tradition moments", () => {
  it("every birth is a moment that pays PP by the tradition's type", () => {
    const state = fresh();
    const [, a = 0, b = 0] = clubIds(state);
    const offered = offerEvents(updateCulture(withSeason(state, a, b), world), world, 4);
    const born = offered.events.pending.find((e) => e.templateId === "tradition-born");
    expect(born?.facts.tradition).toMatchObject({ type: "trophy" });
    expect(born?.countryId).toBe(state.anchorCountryId);
    if (!born) throw new Error("no birth moment");
    expect(eventEffects(offered, world, card("tradition-born"), born, null)).toEqual([
      { type: "pp", amount: world.config.culture.birthPP.trophy },
    ]);
    const collected = applyAction(offered, world, { type: "collectMoment", eventId: born.id });
    expect(collected.pp).toBeCloseTo(offered.pp + world.config.culture.birthPP.trophy);
  });

  it("every loss is a moment with no reward", () => {
    let state = fresh();
    const [, a = 0, b = 0] = clubIds(state);
    state = offerEvents(updateCulture(withSeason(state, a, b), world), world, 4);
    state = updateCulture({ ...state, quarter: state.quarter + 60 }, world);
    const offered = offerEvents(state, world, 4);
    const lost = offered.events.pending.find((e) => e.templateId === "tradition-lost");
    if (!lost) throw new Error("no loss moment");
    expect(eventEffects(offered, world, card("tradition-lost"), lost, null)).toEqual([]);
  });
});

describe("stoking a repeat final", () => {
  it("records one meeting toward a derby, which a third season can complete", () => {
    // Beach: derbies need 3 meetings.
    let state = fresh("beach");
    const [, a = 0, b = 0] = clubIds(state);
    state = updateCulture(withSeason(state, a, b), world);
    state = updateCulture(withSeason(state, b, a), world);
    const seasons = state.flagship.seasons;
    const fans = state.countries.find((c) => c.countryId === state.anchorCountryId)?.fans[
      PLAYER_INDEX
    ];
    const event: EventRecord = {
      id: state.events.nextId,
      templateId: "season-repeat-final",
      countryId: state.anchorCountryId,
      turn: state.turn,
      quarter: state.quarter,
      facts: {
        casual: fans?.casual ?? 0,
        hardcore: fans?.hardcore ?? 0,
        leagueTier: "amateur",
        health: "healthy",
        rivalId: null,
        season: seasonFacts(seasons, seasons.length - 1, state.flagship.players),
        star: null,
        tradition: null,
      },
      resolution: null,
    };
    const pending: GameState = {
      ...state,
      events: { ...state.events, pending: [event], nextId: event.id + 1 },
    };
    const stoked = applyAction(pending, world, {
      type: "chooseEvent",
      eventId: event.id,
      choiceId: "stoke-it",
    });
    expect(stoked.culture.stokes).toEqual([
      { clubIds: [Math.min(a, b), Math.max(a, b)], season: seasons.at(-1)?.season },
    ]);
    expect(ofType(updateCulture(stoked, world), "derby")).toHaveLength(1);
    expect(ofType(updateCulture(state, world), "derby")).toHaveLength(0);
  });
});
