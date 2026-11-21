import { describe, expect, it } from "vitest";
import {
  applyAction,
  bestAbroad,
  broadcastEffects,
  createCampaign,
  directorFactors,
  directorIn,
  type EventRecord,
  endTurn,
  type GameState,
  grantAsk,
  leagueActions,
  leagueCosts,
  leagueIncomePerQuarter,
  newLeague,
  offerEvents,
  syncDirectors,
  type World,
} from "../src/sim";
import { setupFor, world } from "./helpers";

// League directors (GDD v1.40, tech plan 2.26 step 1): one anchor, a few direct calls, one turn.

const index = world.countries.findIndex((c) => c.id === "argentina");

/** A Brazil campaign with an Amateur league in Argentina and Argentina in the first focus slot. */
function withArgentina(): GameState {
  const state = createCampaign(world, setupFor(5, "brazil"));
  const countries = state.countries.map((country, i) =>
    i === index
      ? {
          ...country,
          league: { ...newLeague(world, index, 0, 500, []), cash: 1e9 },
          fans: country.fans.map((fans, f) =>
            f === 0 ? { ...fans, casual: 20_000, hardcore: 2_000 } : fans,
          ),
        }
      : country,
  );
  return { ...state, countries, focus: ["argentina", ...state.focus.slice(1)] };
}

/** The world with every director given one trait (and a certain scandal, for scandal-prone). */
function onlyTrait(trait: string): World {
  const traits = world.config.directors.traits;
  const only = traits[trait];
  if (!only) throw new Error(`No trait ${trait}`);
  return {
    ...world,
    config: {
      ...world.config,
      directors: {
        ...world.config.directors,
        traits: { [trait]: only },
        scandal: { ...world.config.directors.scandal, chancePerYear: 1 },
      },
    },
  };
}

describe("league directors", () => {
  it("serve while focus holds, never at the seat, and their terms are kept", () => {
    const state = syncDirectors(withArgentina(), world);
    const director = directorIn(state, "argentina");
    expect(director?.tierOnArrival).toBe("amateur");
    // The anchor holds the seat and a focus slot: no director there.
    expect(directorIn(state, "brazil")).toBeUndefined();
    // Focus leaves: the term ends with no severance.
    const left = syncDirectors({ ...state, focus: state.focus.map(() => null) }, world);
    expect(left.directors.serving).toHaveLength(0);
    expect(left.directors.past).toMatchObject([{ id: director?.id, reason: "focus" }]);
    expect(left.countries[index]?.league?.cash).toBe(state.countries[index]?.league?.cash);
  });

  it("a trait bends its own league's income and costs, and the salary is a cost line", () => {
    const base = withArgentina();
    const showman = onlyTrait("showman");
    const state = syncDirectors(base, showman);
    const traits = showman.config.directors.traits.showman;
    expect(directorFactors(state, showman, "argentina").income).toBe(traits?.income);
    expect(leagueIncomePerQuarter(state, showman, index)).toBeCloseTo(
      leagueIncomePerQuarter(base, showman, index) * (traits?.income ?? 0),
    );
    const before = leagueCosts(base, showman, index);
    const after = leagueCosts(state, showman, index);
    expect(after.director).toBeGreaterThan(0);
    expect(after.operations).toBeCloseTo(before.operations * (traits?.runningCost ?? 0));
    expect(after.total).toBeCloseTo(after.operations + after.upkeep + after.director);
  });

  it("is replaced only in the offseason, for severance, once", () => {
    const state = syncDirectors(withArgentina(), world);
    const replace = { type: "replaceDirector", countryId: "argentina", candidate: 0 } as const;
    expect(() => applyAction(state, world, replace)).toThrow(/offseason/);
    const open = syncDirectors(
      { ...state, flagship: { ...state.flagship, offseason: true } },
      world,
    );
    const options = open.directors.candidates[0]?.options ?? [];
    expect(options).toHaveLength(world.config.directors.candidates);
    const replaced = applyAction(open, world, replace);
    const now = directorIn(replaced, "argentina");
    expect(now?.name).toBe(options[0]?.name);
    expect(replaced.directors.past.at(-1)?.reason).toBe("replaced");
    expect(replaced.countries[index]?.league?.cash).toBeLessThan(
      open.countries[index]?.league?.cash ?? 0,
    );
    // The league's candidates are spent until the next offseason.
    expect(() => applyAction(replaced, world, replace)).toThrow(/candidate/);
  });

  it("a scandal-prone director's scandal costs hardcore fans and is told by name", () => {
    const scandalous = onlyTrait("scandal-prone");
    const state = syncDirectors(withArgentina(), scandalous);
    const next = endTurn(state, scandalous);
    const scandal = next.landmarks.find((l) => l.kind === "directorScandal");
    expect(scandal).toMatchObject({ countryId: "argentina" });
    if (scandal?.kind !== "directorScandal") throw new Error("No scandal");
    expect(scandal.demoted).toBeGreaterThan(0);
    const card = next.events.pending.find((e) => e.templateId === "director-scandal");
    expect(card?.facts.director?.name).toBe(directorIn(state, "argentina")?.name);
  });
});

// Asks (GDD v1.41, tech plan 2.26 step 2).
describe("directors' asks", () => {
  /** Argentina directed by a grassroots director, with the offseason open. */
  function offseason(trait = "grassroots"): { state: GameState; world: World } {
    const only = onlyTrait(trait);
    const state = syncDirectors(withArgentina(), only);
    return { state: { ...state, flagship: { ...state.flagship, offseason: true } }, world: only };
  }

  /** The ask answered: its card resolved in the journal with `choiceId`. */
  function answer(state: GameState, choiceId: string): GameState {
    const card = state.events.pending.find((e) => e.facts.director?.ask);
    if (!card) throw new Error("No ask card");
    const resolved: EventRecord = {
      ...card,
      resolution: {
        choiceId,
        automatic: false,
        turn: state.turn,
        quarter: state.quarter,
        cost: 0,
        ppGained: 0,
        reward: null,
      },
    };
    return {
      ...state,
      events: {
        ...state.events,
        pending: state.events.pending.filter((e) => e.id !== card.id),
        history: [...state.events.history, resolved],
      },
    };
  }

  it("one ask an offseason, told by name; two declines and the director resigns", () => {
    const { state, world: only } = offseason();
    const asked = offerEvents(syncDirectors(state, only, 1), only, 1);
    const card = asked.events.pending.find((e) => e.templateId === "director-community");
    expect(card?.facts.director?.name).toBe(directorIn(state, "argentina")?.name);
    // Only one this offseason.
    expect(
      syncDirectors(asked, only, 1).landmarks.filter((l) => l.kind === "directorAsk"),
    ).toHaveLength(1);
    // Declined once: patience left.
    const once = syncDirectors(answer(asked, "decline"), only);
    expect(directorIn(once, "argentina")?.declines).toBe(1);
    // Next offseason, declined again: they resign, the league loses a rung, a new one is drawn.
    const again = offerEvents(
      syncDirectors(
        { ...once, flagship: { ...once.flagship, season: once.flagship.season + 1 } },
        only,
        1,
      ),
      only,
      1,
    );
    const resigned = syncDirectors(answer(again, "decline"), only);
    expect(resigned.directors.past.at(-1)).toMatchObject({ reason: "resigned" });
    expect(resigned.countries[index]?.league?.health).toBe("struggling");
    expect(directorIn(resigned, "argentina")?.declines).toBe(0);
    expect(resigned.landmarks.at(-1)?.kind).toBe("directorResigned");
  });

  it("granting restores patience", () => {
    const { state, world: only } = offseason();
    const asked = offerEvents(syncDirectors(state, only, 1), only, 1);
    const granted = syncDirectors(answer(asked, "grant"), only);
    expect(directorIn(granted, "argentina")?.declines).toBe(0);
    expect(granted.directors.openAsk).toBeNull();
  });

  it("each ask does what it says", () => {
    const { state } = offseason("showman");
    const director = directorIn(state, "argentina");
    const card = (
      ask: "promotion-push" | "hold-the-money" | "host-something",
      standoutId?: number,
    ) =>
      ({
        countryId: "argentina",
        facts: { director: { name: "x", directorId: director?.id, ask, standoutId } },
      }) as unknown as EventRecord;
    // Promotion push: up now, with part of the usual investment.
    const promoted = grantAsk(state, world, card("promotion-push"));
    expect(promoted.countries[index]?.league?.tier).toBe("semi-pro");
    const investment = leagueActions(state, world, index)?.promoteLeague.terms?.investment ?? 0;
    expect(promoted.countries[index]?.league?.cash).toBeCloseTo(
      (state.countries[index]?.league?.cash ?? 0) +
        world.config.directors.asks["promotion-push"].investmentShare * investment,
    );
    // Hold the money: no promotion while it holds.
    const held = grantAsk(state, world, card("hold-the-money"));
    expect(leagueActions(held, world, index)?.promoteLeague.blocker?.kind).toBe("held");
    // Host something, no bids open: a flagship exhibition airs there.
    const hosted = grantAsk(state, world, card("host-something"));
    expect(broadcastEffects(hosted, world).reach.get(index) ?? 0).toBeGreaterThan(
      broadcastEffects(state, world).reach.get(index) ?? 0,
    );
    // Keep our star: the talent pull passes the kept standout by.
    const star = {
      id: 900,
      name: "A B",
      countryId: "argentina",
      birthplace: "x",
      birthSeason: 1,
      peakSkill: 90,
      skill: 90,
      finalSeason: false,
    };
    const withStar = { ...state, standouts: { ...state.standouts, players: [star] } };
    expect(bestAbroad(withStar, 10)?.id).toBe(900);
    expect(
      bestAbroad({ ...withStar, directors: { ...withStar.directors, kept: [900] } }, 10),
    ).toBeNull();
  });
});
