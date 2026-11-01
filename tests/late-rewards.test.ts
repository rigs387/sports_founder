import { describe, expect, it } from "vitest";
import { eventsFileSchema } from "../src/content";
import {
  applyAction,
  type EventRecord,
  eventEffects,
  type GameState,
  lateIncomeFactor,
  offerEvents,
  updateCulture,
} from "../src/sim";
import { clubIds, fresh, withSeason } from "./culture-helpers";
import { world } from "./helpers";

// Late card rewards by kind (GDD v1.39, decision 8a): from lateRewards.fromTier a card's PP is
// paid in cash or tradition weight, and the PP becomes base income.

const late = world.events.settings.lateRewards;
const card = (id: string) => {
  const found = world.events.cards.find((c) => c.id === id);
  if (!found) throw new Error(`no card ${id}`);
  return found;
};
const atTier = (state: GameState, ppTier: number): GameState => ({ ...state, ppTier });
const seatLeague = (state: GameState) =>
  state.countries.find((c) => c.countryId === state.flagship.countryId)?.league;

/** A season with a trophy born, its cards offered, at PP tier `tier`. */
function offeredAt(tier: number): GameState {
  const state = fresh();
  const [, a = 0, b = 0] = clubIds(state);
  return offerEvents(atTier(updateCulture(withSeason(state, a, b), world), tier), world, 4);
}

describe("late card rewards", () => {
  it("a tradition birth strengthens its tradition instead of paying PP", () => {
    const offered = offeredAt(late.fromTier);
    const born = offered.events.pending.find((e) => e.templateId === "tradition-born");
    if (!born?.facts.tradition) throw new Error("no birth moment");
    const effects = eventEffects(offered, world, card("tradition-born"), born, null);
    expect(effects).toEqual([
      {
        type: "traditionWeight",
        traditionId: born.facts.tradition.traditionId,
        strength: late.traditionStrength,
      },
    ]);
    const before = offered.culture.traditions.find(
      (t) => t.id === born.facts.tradition?.traditionId,
    );
    const collected = applyAction(offered, world, { type: "collectMoment", eventId: born.id });
    const after = collected.culture.traditions.find((t) => t.id === before?.id);
    expect(collected.pp).toBe(offered.pp);
    expect(after?.strength).toBeCloseTo((before?.strength ?? 0) + late.traditionStrength);
    const settled = collected.events.history.find((e) => e.id === born.id);
    expect(settled?.resolution?.reward).toEqual({
      kind: "tradition",
      amount: late.traditionStrength,
    });
  });

  it("before the late tiers the same birth still pays PP", () => {
    const offered = offeredAt(late.fromTier - 1);
    const born = offered.events.pending.find((e) => e.templateId === "tradition-born");
    if (!born) throw new Error("no birth moment");
    const [effect] = eventEffects(offered, world, card("tradition-born"), born, null);
    expect(effect?.type).toBe("pp");
  });

  it("the champion card pays cash into the flagship league, which the payout leaves", () => {
    const offered = offeredAt(late.fromTier);
    const champion = offered.events.pending.find((e) => e.templateId === "season-champion");
    if (!champion) throw new Error("no champion moment");
    const [effect, ...rest] = eventEffects(offered, world, card("season-champion"), champion, null);
    expect(effect).toMatchObject({ type: "leagueCash", countryId: offered.flagship.countryId });
    expect(rest.some((e) => e.type === "pp")).toBe(false);
    const collected = applyAction(offered, world, { type: "collectMoment", eventId: champion.id });
    const amount = effect?.type === "leagueCash" ? effect.amount : 0;
    expect(seatLeague(collected)?.cash).toBeCloseTo((seatLeague(offered)?.cash ?? 0) + amount);
  });

  it("a sport card pays cash into its country's league, and nothing without one", () => {
    const state = atTier(fresh(), late.fromTier);
    const event: Pick<EventRecord, "facts" | "countryId"> = {
      countryId: state.anchorCountryId,
      facts: {
        casual: 0,
        hardcore: 0,
        leagueTier: null,
        health: null,
        rivalId: null,
        season: null,
        star: null,
        tradition: null,
        deal: null,
        venue: null,
        hall: null,
        countermove: null,
        championship: null,
        legacy: null,
        stoppage: null,
      },
    };
    const [effect] = eventEffects(state, world, card("moving-up"), event, null);
    expect(effect).toMatchObject({ type: "leagueCash", countryId: state.anchorCountryId });
    const noLeague = {
      ...state,
      countries: state.countries.map((c) =>
        c.countryId === state.anchorCountryId ? { ...c, league: null } : c,
      ),
    };
    expect(eventEffects(noLeague, world, card("moving-up"), event, null)).toEqual([]);
  });

  it("the PP cards stop paying becomes base income from the late tiers", () => {
    expect(lateIncomeFactor({ ppTier: late.fromTier - 1 }, world)).toBe(1);
    expect(lateIncomeFactor({ ppTier: late.fromTier }, world)).toBe(1 + late.incomeShare);
  });

  it("content may not write a late reward on a card", () => {
    const [first, ...others] = world.events.cards;
    if (!first) throw new Error("no cards");
    const bad = {
      ...world.events,
      cards: [
        { ...first, effects: [{ type: "leagueCash", countryId: "x", amount: 1 }] },
        ...others,
      ],
    };
    const result = eventsFileSchema.safeParse(bad);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("late reward");
  });
});
