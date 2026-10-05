import { describe, expect, it } from "vitest";
import { eventsFileSchema } from "../src/content";
import en from "../src/renderer/src/i18n/locales/en.json";
import {
  applyAction,
  checkAction,
  checkInvariants,
  computeExposure,
  createCampaign,
  deserializeSave,
  emptyEvents,
  endTurn,
  eventFactors,
  eventSnapshots,
  type GameState,
  offerEvents,
  runTurns,
  serializeSave,
  settleEvents,
  snapshot,
  stepQuarter,
} from "../src/sim";
import { setupFor, withConfig, world } from "./helpers";

const start = () => createCampaign(world, setupFor(424242, "brazil"));
function firstDecision() {
  const state = endTurn(start(), world);
  const event = state.events.pending.find((e) => e.templateId === "open-doors");
  if (!event) throw new Error("No opening decision");
  return { state, event };
}
function templateEvent(templateId: string, edit?: (state: GameState) => GameState) {
  const initial = { ...start(), turn: 20, quarter: 40, pp: 1000 };
  const index = world.countries.findIndex((c) => c.id === "brazil");
  const country = initial.countries[index];
  if (!country?.league) throw new Error("No founding league");
  initial.countries[index] = {
    ...country,
    league: { ...country.league, health: "near-collapse" },
    fans: country.fans.map((f, i) => (i === 0 ? { ...f, casual: 50000, hardcore: 1000 } : f)),
  };
  const customized = edit ? edit(initial) : initial;
  const selectedWorld = {
    ...world,
    events: { ...world.events, cards: world.events.cards.filter((c) => c.id === templateId) },
  };
  const state = offerEvents(customized, selectedWorld, 1);
  const event = state.events.pending[0];
  if (!event) throw new Error(`No ${templateId} event`);
  return { state, event, index, selectedWorld };
}

describe("event content", () => {
  it("ships twenty-eight translated cards with real triggers and a neutral decision default", () => {
    expect(world.events.cards).toHaveLength(28);
    expect(eventsFileSchema.safeParse(world.events).success).toBe(true);
    const text = en.events.cards as unknown as Record<
      string,
      Record<string, string> & { title: string; choices?: Record<string, string> }
    >;
    for (const card of world.events.cards) {
      expect(text[card.id]?.title).toBeTruthy();
      // Season cards vary their body by season format (i18next context) or by a count.
      const bodies = Object.keys(text[card.id] ?? {}).filter((key) => key.startsWith("body"));
      expect(bodies.length).toBeGreaterThan(0);
      for (const choice of card.choices) expect(text[card.id]?.choices?.[choice.id]).toBeTruthy();
    }
  });
  it("rejects paid defaults, unknown effects, duplicate templates and invented rival context", () => {
    const base = structuredClone(world.events);
    const card = base.cards[0];
    if (!card) throw new Error("No cards");
    const fallback = card.choices.find((c) => c.id === card.defaultChoice);
    if (!fallback) throw new Error("No default");
    fallback.cost = 1;
    expect(eventsFileSchema.safeParse(base).success).toBe(false);
    expect(
      eventsFileSchema.safeParse({ ...world.events, cards: [...world.events.cards, card] }).success,
    ).toBe(false);
    expect(
      eventsFileSchema.safeParse({
        ...world.events,
        cards: [{ ...card, effects: [{ type: "inventWinner" }] }],
      }).success,
    ).toBe(false);
    const rival = world.events.cards.find((c) => c.id === "rival-pushback");
    expect(
      eventsFileSchema.safeParse({ ...world.events, cards: [{ ...rival, trigger: "audience" }] })
        .success,
    ).toBe(false);
  });
});

describe("event triggers and settlement", () => {
  it("records actual facts, obeys caps, and never rerolls on snapshot delivery", () => {
    const { state, event } = firstDecision();
    const fans = state.countries.find((c) => c.countryId === event.countryId)?.fans[0];
    expect(event.facts.casual).toBe(fans?.casual);
    expect(event.facts.hardcore).toBe(fans?.hardcore);
    expect(event.countryId).toBe("brazil");
    const before = serializeSave(state);
    expect(snapshot(state, world)).toStrictEqual(snapshot(state, world));
    expect(serializeSave(state)).toBe(before);
    let current = state;
    for (let i = 0; i < 40 && !current.outcome; i++) {
      expect(
        current.events.pending.filter(
          (e) => world.events.cards.find((c) => c.id === e.templateId)?.kind === "decision",
        ).length,
      ).toBeLessThanOrEqual(world.events.settings.maxDecisions);
      expect(current.events.pending.length).toBeLessThanOrEqual(
        world.events.settings.maxMoments + world.events.settings.maxDecisions,
      );
      expect(checkInvariants(current, world)).toEqual([]);
      current = endTurn(current, world);
    }
    // The first receipt may have aged out of the bounded journal; its once-only marker must not.
    expect(current.events.offered["open-doors"]).toBe(state.turn);
    expect(current.events.history.length).toBeLessThanOrEqual(world.events.settings.historyLimit);
  });
  it("quotes cost, rejects unaffordable/stale/wrong-kind actions, and charges only once", () => {
    const { state, event } = firstDecision();
    const action = { type: "chooseEvent", eventId: event.id, choiceId: "welcome" } as const;
    expect(checkAction({ ...state, pp: 0 }, world, action)).toBe("prestige");
    expect(checkAction(state, world, { type: "collectMoment", eventId: event.id })).toBe("choice");
    const funded = { ...state, pp: 1000 };
    const quote = eventSnapshots(funded, world)
      .find((e) => e.id === event.id)
      ?.choices.find((c) => c.id === "welcome");
    const before = serializeSave(funded);
    const chosen = applyAction(funded, world, action);
    expect(chosen.pp).toBe(1000 - (quote?.cost ?? 0));
    expect(chosen.turn).toBe(funded.turn);
    expect(chosen.quarter).toBe(funded.quarter);
    expect(serializeSave(funded)).toBe(before);
    expect(() => applyAction(chosen, world, action)).toThrow();
    expect(checkInvariants(chosen, world)).toEqual([]);
  });
  it("auto-collects every reward and chooses only neutral defaults without losing PP", () => {
    const { state } = templateEvent("first-following");
    const reward = eventSnapshots(state, world)
      .flatMap((e) => e.effects)
      .reduce((sum, e) => sum + (e.type === "pp" ? e.amount : 0), 0);
    const collected = settleEvents(state, world);
    expect(collected.pp).toBe(state.pp + reward);
    expect(collected.events.pending).toEqual([]);
    expect(settleEvents(collected, world)).toStrictEqual(collected);
    const decision = firstDecision().state;
    const held = settleEvents(decision, world);
    expect(held.countries).toStrictEqual(decision.countries);
    expect(held.events.modifiers).toEqual([]);
    expect(
      held.events.history.find((e) => e.templateId === "open-doors")?.resolution?.choiceId,
    ).toBe("hold");
  });
  it("uses only new landmark facts and skips historical promotions when migrating a save", () => {
    const state = start();
    const noPromotion = {
      ...world,
      events: { ...world.events, cards: world.events.cards.filter((c) => c.id === "moving-up") },
    };
    expect(offerEvents(state, noPromotion, 1).events.pending).toEqual([]);
    const old = runTurns(state, world, 3);
    const { events: _events, ...rest } = old;
    const loaded = deserializeSave(JSON.stringify({ formatVersion: 6, state: rest }), world);
    expect(loaded.events).toStrictEqual(emptyEvents(loaded.landmarks.length));
    expect(loaded.countries).toStrictEqual(old.countries);
  });
});

describe("local event effects and saves", () => {
  it("boosts only the selected incoming spread channel and leaves other markets unchanged", () => {
    const { state, event, index } = templateEvent("local-airtime");
    const source = world.inbound[index]?.find((link) => link.media > 0)?.source;
    if (source === undefined) throw new Error("No media link");
    const fans = state.countries[source]?.fans[0];
    if (!fans) throw new Error("No source fans");
    fans.casual = Math.floor((world.countries[source]?.population ?? 0) / 10);
    const before = computeExposure(state, world);
    const after = applyAction(state, world, {
      type: "chooseEvent",
      eventId: event.id,
      choiceId: "broadcast",
    });
    const exposure = computeExposure(after, world);
    expect(before[index]?.media).toBeGreaterThan(0);
    expect(exposure[index]?.media).toBeCloseTo((before[index]?.media ?? 0) * 1.5, 12);
    expect(exposure[index]?.language).toBe(before[index]?.language);
    expect(exposure.filter((_, i) => i !== index)).toStrictEqual(
      before.filter((_, i) => i !== index),
    );
    expect(eventFactors(after, world, "brazil").hardcore).toBe(0.9);
  });
  it("a rival setback demotes only the recorded rival and never hands its fans to the player", () => {
    const rivalId = world.rivals[0]?.id;
    if (!rivalId) throw new Error("No rival");
    const { state, event, index } = templateEvent("rival-pushback", (state) => ({
      ...state,
      landmarks: [
        ...state.landmarks,
        {
          kind: "rivalEscalated",
          countryId: "brazil",
          sportId: rivalId,
          turn: state.turn,
          quarter: state.quarter,
          from: "none",
          to: "watching",
        },
      ],
    }));
    const before = state.countries[index]?.fans;
    const after = applyAction(state, world, {
      type: "chooseEvent",
      eventId: event.id,
      choiceId: "challenge",
    });
    expect(after.countries[index]?.fans[0]).toStrictEqual(before?.[0]);
    const rivalBefore = before?.find((f) => f.sportId === rivalId);
    const rivalAfter = after.countries[index]?.fans.find((f) => f.sportId === rivalId);
    const moved = Math.floor((rivalBefore?.hardcore ?? 0) * 0.005);
    expect(moved).toBeGreaterThan(0);
    expect(rivalAfter?.hardcore).toBe((rivalBefore?.hardcore ?? 0) - moved);
    expect(rivalAfter?.casual).toBe((rivalBefore?.casual ?? 0) + moved);
  });
  it("fundraising gives the advertised PP and records its recruitment trade-off", () => {
    const { state, event } = templateEvent("crowded-sidelines");
    const after = applyAction(state, world, {
      type: "chooseEvent",
      eventId: event.id,
      choiceId: "fundraise",
    });
    expect(after.pp).toBe(state.pp + 12);
    expect(after.events.history.at(-1)?.resolution?.ppGained).toBe(12);
    expect(eventFactors(after, world, "brazil").casual).toBe(0.85);
  });
  it("applies conversion only in the named market for exactly the advertised quarters", () => {
    const { state, event } = firstDecision();
    let chosen = applyAction(state, world, {
      type: "chooseEvent",
      eventId: event.id,
      choiceId: "regulars",
    });
    const end = state.quarter + 4;
    for (let quarter = state.quarter; quarter < end; quarter++) {
      expect(eventFactors(chosen, world, "brazil").hardcore).toBe(1.2);
      expect(eventFactors(chosen, world, "tuvalu").hardcore).toBe(1);
      chosen = stepQuarter(chosen, world);
    }
    expect(chosen.events.modifiers).toEqual([]);
    expect(eventFactors(chosen, world, "brazil").hardcore).toBe(1);
    expect(checkInvariants(chosen, world)).toEqual([]);
  });
  it("moves fans between buckets without exceeding the population or hardcore capacity", () => {
    const { state, event, index } = templateEvent("crowded-sidelines");
    const before = state.countries[index]?.fans[0];
    const after = applyAction(state, world, {
      type: "chooseEvent",
      eventId: event.id,
      choiceId: "recruit",
    });
    const fans = after.countries[index]?.fans[0];
    expect(fans?.hardcore).toBe((before?.hardcore ?? 0) + 1000);
    expect((fans?.casual ?? 0) + (fans?.hardcore ?? 0)).toBe(
      (before?.casual ?? 0) + (before?.hardcore ?? 0),
    );
    const full = structuredClone(state);
    const country = full.countries[index];
    const pop = world.countries[index]?.population ?? 0;
    if (!country) throw new Error("Missing market");
    const other = country.fans.at(-1);
    if (!other) throw new Error("Missing bucket");
    other.hardcore += pop - country.fans.reduce((sum, f) => sum + f.hardcore, 0);
    const capped = applyAction(full, world, {
      type: "chooseEvent",
      eventId: event.id,
      choiceId: "recruit",
    });
    expect(capped.countries[index]?.fans[0]).toStrictEqual(full.countries[index]?.fans[0]);
  });
  it("health relief improves one rung, demotes the quoted share, and never creates cash", () => {
    const { state, event, index } = templateEvent("league-under-strain");
    const after = applyAction(state, world, {
      type: "chooseEvent",
      eventId: event.id,
      choiceId: "regroup",
    });
    expect(after.countries[index]?.league?.health).toBe("struggling");
    expect(after.countries[index]?.league?.cash).toBe(state.countries[index]?.league?.cash);
    expect(after.countries[index]?.fans[0]?.hardcore).toBe(980);
  });
  it("persists pending decisions and active effects and continues byte-identically", () => {
    const { state, event } = firstDecision();
    const loaded = deserializeSave(serializeSave(state), world);
    expect(loaded).toStrictEqual(state);
    const action = { type: "chooseEvent", eventId: event.id, choiceId: "regulars" } as const;
    const chosen = applyAction(state, world, action);
    const resumed = deserializeSave(serializeSave(applyAction(loaded, world, action)), world);
    expect(runTurns(resumed, world, 12)).toStrictEqual(runTurns(chosen, world, 12));
    const corrupt = JSON.parse(serializeSave(chosen));
    corrupt.state.events.modifiers[0].endQuarter = chosen.quarter;
    expect(() => deserializeSave(JSON.stringify(corrupt), world)).toThrow("event modifier");
    const unknown = JSON.parse(serializeSave(state));
    unknown.state.events.pending[0].templateId = "invented";
    expect(() => deserializeSave(JSON.stringify(unknown), world)).toThrow("event content");
  });
});

describe("when a card's fact happened (GDD v1.24)", () => {
  it("dates every card inside its turn, and the champion card at the season's end", () => {
    const yearTurns = withConfig(world, (config) => {
      for (const tier of config.ppTiers) tier.turnLengthQuarters = 4;
    });
    let state = createCampaign(yearTurns, setupFor(3, "brazil"));
    let champions = 0;
    for (let turn = 0; turn < 6; turn += 1) {
      const startQuarter = state.quarter;
      state = endTurn(state, yearTurns);
      for (const card of state.events.pending.filter((e) => e.turn === state.turn)) {
        expect(card.quarter).toBeGreaterThanOrEqual(startQuarter);
        expect(card.quarter).toBeLessThanOrEqual(state.quarter);
        if (card.templateId !== "season-champion") continue;
        champions += 1;
        const season = state.flagship.seasons.find((s) => s.season === card.facts.season?.season);
        expect(card.quarter).toBe(season?.quarter);
      }
    }
    expect(champions).toBeGreaterThan(1);
  });
});
