import { describe, expect, it } from "vitest";
import {
  applyAction,
  backingPrice,
  checkAction,
  createCampaign,
  endTurn,
  eventSnapshots,
  type GameState,
  type World,
} from "../src/sim";
import { setupFor, withConfig, world } from "./helpers";

// More stars than slots (GDD v1.35, topic 3): several stars a season, every star after the first
// a breakout decision that offers Back; unbacked stars wander.

/** Every score to the leading player, so every club's leader is a standout; no moves. */
const allStars = (edit: (config: World["config"]) => void = () => {}) =>
  withConfig(world, (config) => {
    config.flagship.players.credit = { base: 1, perSkill: 0, pivot: 50, min: 1, max: 1 };
    config.flagship.stars.moveChance = 0;
    edit(config);
  });

/** Plays turns until the flagship has finished `seasons` seasons. */
function toSeason(content: World, seasons: number, seed = 11): GameState {
  let state = createCampaign(content, setupFor(seed, "brazil"));
  while (state.flagship.seasons.length < seasons) state = endTurn(state, content);
  return { ...state, pp: 1e6 };
}

describe("breakout cards", () => {
  it("tells the first star as the headline and offers Back for every later star", () => {
    const content = allStars();
    const state = toSeason(content, 1);
    const [first, second] = state.flagship.seasons[0]?.newStarIds ?? [];
    const cards = eventSnapshots(state, content);
    const breakout = cards.find((e) => e.templateId === "star-breakout");
    const backable = cards.find((e) => e.templateId === "star-backable");
    expect(breakout?.facts.star?.playerId).toBe(first);
    expect(breakout?.weight).toBe("headline");
    expect(backable?.facts.star?.playerId).toBe(second);
    expect(backable?.kind).toBe("decision");
    const back = backable?.choices.find((c) => c.id === "back");
    expect(back?.cost).toBeCloseTo(backingPrice(state, content));
    expect(back?.blocker).toBeNull();
  });

  it("backs the star from the card at the backing price, both answers paying the breakout's PP", () => {
    const content = allStars();
    const state = toSeason(content, 1);
    const card = state.events.pending.find((e) => e.templateId === "star-backable");
    if (!card) throw new Error("no backable breakout");
    const pp = content.config.flagship.stars.breakoutPP.amateur;
    const backed = applyAction(state, content, {
      type: "chooseEvent",
      eventId: card.id,
      choiceId: "back",
    });
    const star = backed.flagship.players.find((p) => p.id === card.facts.star?.playerId);
    expect(star?.backing).toMatchObject({ influence: 0 });
    expect(backed.pp).toBeCloseTo(state.pp - backingPrice(state, content) + pp);
    const passed = applyAction(state, content, {
      type: "chooseEvent",
      eventId: card.id,
      choiceId: "not-now",
    });
    expect(passed.flagship.players.find((p) => p.id === star?.id)?.backing).toBeNull();
    expect(passed.pp).toBeCloseTo(state.pp + pp);
  });

  it("cannot back from the card when every backing slot is taken", () => {
    const content = allStars();
    const state = toSeason(content, 1);
    const card = state.events.pending.find((e) => e.templateId === "star-backable");
    const other = state.flagship.players.find(
      (p) => p.starSince !== null && p.id !== card?.facts.star?.playerId,
    );
    if (!card || !other) throw new Error("no second star");
    const full = applyAction(state, content, { type: "backStar", playerId: other.id });
    const back = eventSnapshots(full, content)
      .find((e) => e.id === card.id)
      ?.choices.find((c) => c.id === "back");
    expect(back?.blocker).toBe("slots");
    expect(
      checkAction(full, content, { type: "chooseEvent", eventId: card.id, choiceId: "back" }),
    ).not.toBeNull();
  });
});

describe("unbacked stars wander", () => {
  it("moves unbacked stars more often by the unbacked factor", () => {
    const moves = (factor: number) => {
      const content = allStars((config) => {
        config.flagship.stars.moveChance = 0.2;
        config.flagship.stars.unbackedMoveFactor = factor;
      });
      const state = toSeason(content, 8, 7);
      return state.landmarks.filter((l) => l.kind === "starMoved").length;
    };
    expect(moves(5)).toBeGreaterThan(moves(1));
  });
});
