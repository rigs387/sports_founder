import { describe, expect, it } from "vitest";
import { RULE_AXES, TRADITION_TYPES } from "../src/content";
import en from "../src/renderer/src/i18n/locales/en.json";
import {
  applyAction,
  type EventRecord,
  eventEffects,
  type GameState,
  offerEvents,
  PLAYER_INDEX,
  seasonFacts,
  snapshot,
  updateCulture,
} from "../src/sim";
import { clubIds, fresh, ofType, withSeason, withTradition } from "./culture-helpers";
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
        deal: null,
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

describe("the Culture category: reach", () => {
  /** England with a full-strength derby and fans across the region, ten years on. */
  function tenYears(nodes: string[]): GameState {
    const base = fresh("beach", 3);
    let state: GameState = {
      ...withTradition(base, "derby", "england", { renewedYear: 9999 }),
      growthNodes: nodes,
      countries: base.countries.map((country) => ({
        ...country,
        fans: country.fans.map((f, s) =>
          s === PLAYER_INDEX ? { ...f, hardcore: Math.max(f.hardcore, 1_000_000) } : f,
        ),
      })),
    };
    for (let year = 0; year < 10; year += 1)
      state = updateCulture({ ...state, quarter: state.quarter + 4 }, world);
    return state;
  }

  it("spreads followers only with reach nodes, and only along the links they name", () => {
    expect(ofType(tenYears([]), "derby")[0]?.followers).toEqual(["england"]);
    const followers = ofType(tenYears(["derby-days", "travelling-support"]), "derby")[0]?.followers;
    expect(followers?.length).toBeGreaterThan(1);
    // Travelling support reaches along borders and sea links only.
    const index = new Map(world.countries.map((c, i) => [c.id, i]));
    const followerIndexes = new Set((followers ?? []).map((id) => index.get(id)));
    for (const id of followers?.slice(1) ?? []) {
      const links = world.inbound[index.get(id) ?? -1] ?? [];
      expect(links.some((l) => l.proximity > 0 && followerIndexes.has(l.source))).toBe(true);
    }
  });
});

describe("what the player sees", () => {
  it("snapshots traditions, the trophy's rename cost and rivals' flavor traditions", () => {
    const state = fresh();
    const [, a = 0, b = 0] = clubIds(state);
    const view = snapshot(updateCulture(withSeason(state, a, b), world), world);
    const [trophy] = view.culture.traditions;
    expect(trophy).toMatchObject({
      type: "trophy",
      lost: null,
      followers: [state.anchorCountryId],
    });
    expect(trophy?.rules.map((r) => r.axis)).toEqual(RULE_AXES);
    expect(view.culture.naming).toBe(trophy?.id);
    expect(view.culture.rename).toMatchObject({ trophyId: trophy?.id, blocker: "naming" });
    expect(view.culture.rivals.length).toBeGreaterThan(0);
    expect(view.flagship.clubs.every((club) => club.ground.length > 0)).toBe(true);
  });

  it("has words for every tradition type, origin fact, loss and card", () => {
    const culture = en.culture as unknown as Record<string, Record<string, string>>;
    const cards = en.events.cards as unknown as Record<string, Record<string, string>>;
    for (const type of TRADITION_TYPES) {
      expect(culture.types?.[type]).toBeTruthy();
      expect(culture.byType?.[type]).toBeTruthy();
      expect(culture.facts?.[type]).toBeTruthy();
      expect(cards["tradition-born"]?.[`body_${type}`]).toBeTruthy();
    }
    for (const reason of ["faded", "folded", "broken", "renamed"]) {
      expect(culture.lost?.[reason]).toBeTruthy();
      expect(cards["tradition-lost"]?.[`body_${reason}`]).toBeTruthy();
    }
  });
});
