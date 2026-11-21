import { describe, expect, it } from "vitest";
import {
  builderBallot,
  builderFacts,
  builderPoints,
  chooseBuilders,
  createCampaign,
  type DirectorTerm,
  type GameState,
  hallProblems,
  landmarks,
  newLeague,
  offerHallCards,
  type SeasonSummary,
  syncDirectors,
} from "../src/sim";
import { setupFor, world } from "./helpers";

// The Builders wing (GDD v1.40, tech plan 2.26 step 4): one anchor, direct calls.

const config = world.config.hallOfFame.builders;
const index = world.countries.findIndex((c) => c.id === "argentina");

/** A Brazil campaign with an Amateur league in Argentina and Argentina in the first focus slot. */
function withArgentina(): GameState {
  const state = createCampaign(world, setupFor(5, "brazil"));
  const countries = state.countries.map((country, i) =>
    i === index
      ? {
          ...country,
          league: newLeague(world, index, 0, 500, []),
          fans: country.fans.map((fans, f) => (f === 0 ? { ...fans, hardcore: 2_000 } : fans)),
        }
      : country,
  );
  return { ...state, countries, focus: ["argentina", ...state.focus.slice(1)] };
}

/** A long finished term: one promotion, hardcore fans four times over (10 points at defaults). */
function term(overrides: Partial<DirectorTerm> = {}): DirectorTerm {
  return {
    id: 1,
    name: "A. Director",
    countryId: "argentina",
    trait: "frugal",
    fromQuarter: 0,
    tierOnArrival: "amateur",
    declines: 0,
    hardcoreOnArrival: 1_000,
    toQuarter: config.minQuarters,
    tierOnLeaving: "semi-pro",
    promotions: 1,
    reason: "focus",
    hardcoreOnLeaving: 4_000,
    healthOnLeaving: "healthy",
    ...overrides,
  };
}

const summary = (season: number) => ({ season }) as SeasonSummary;

describe("the Builders wing", () => {
  it("a term records the hardcore fans and the league's health at both ends", () => {
    const state = syncDirectors(withArgentina(), world);
    const grown = {
      ...state,
      quarter: state.quarter + 16,
      focus: state.focus.map(() => null),
      countries: state.countries.map((c, i) =>
        i === index
          ? { ...c, fans: c.fans.map((f, j) => (j === 0 ? { ...f, hardcore: 8_000 } : f)) }
          : c,
      ),
    };
    const [past] = syncDirectors(grown, world).directors.past;
    expect(past).toMatchObject({ hardcoreOnArrival: 2_000, hardcoreOnLeaving: 8_000 });
    expect(past?.healthOnLeaving).toBe(state.countries[index]?.league?.health);
  });

  it("scores promotions, Elite and hardcore doublings; short, fired, quit or wrecked earn nothing", () => {
    const facts = builderFacts(term(), world);
    expect(facts && builderPoints(facts, world)).toBe(
      config.points.promotion + 2 * config.points.hardcoreDoubling,
    );
    const elite = builderFacts(
      term({ tierOnArrival: "professional", tierOnLeaving: "elite" }),
      world,
    );
    expect(elite?.reachedElite).toBe(true);
    for (const bad of [
      term({ toQuarter: config.minQuarters - 1 }),
      term({ reason: "replaced" }),
      term({ reason: "resigned" }),
      term({ healthOnLeaving: "near-collapse" }),
      term({ tierOnLeaving: null, healthOnLeaving: null, reason: "league" }),
    ])
      expect(builderFacts(bad, world)).toBeNull();
  });

  it("a class inducts the best after the wait, up to the cap, once each", () => {
    const base = withArgentina();
    const past = [1, 2, 3].map((id) => term({ id, promotions: id }));
    const state = { ...base, directors: { ...base.directors, past } };
    const end = config.minQuarters;
    expect(builderBallot(state, world, end + config.waitYears * 4 - 1)).toHaveLength(0);
    const quarter = end + config.waitYears * 4;
    const chosen = chooseBuilders(state, world, summary(4), 9, quarter);
    expect(chosen.map((b) => b.directorId)).toEqual([3, 2, 1].slice(0, config.perClass));
    const after = { ...state, hallOfFame: { ...state.hallOfFame, builders: chosen } };
    expect(hallProblems(after)).toEqual([]);
    expect(builderBallot(after, world, quarter).map((c) => c.term.id)).toEqual(
      [3, 2, 1].slice(config.perClass),
    );
  });

  it("a class of builders only still gets its card", () => {
    const base = withArgentina();
    const state = {
      ...base,
      ppTier: 5,
      directors: { ...base.directors, past: [term()] },
    };
    const [builder] = chooseBuilders(state, world, summary(4), 9, 100);
    if (!builder) throw new Error("no builder");
    const inducted = { ...state, hallOfFame: { ...state.hallOfFame, builders: [builder] } };
    const landmark = landmarks.hallOfFameClass(9, 100, "brazil", 4, 0, null, 1);
    const events = offerHallCards(inducted, world, [landmark], inducted.events);
    expect(events.pending.at(-1)?.facts.hall).toMatchObject({ season: 4, inducteeIds: [] });
  });
});
