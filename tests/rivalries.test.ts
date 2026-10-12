import { describe, expect, it } from "vitest";
import { type GameState, rivalryFacts, type SeasonSummary, updateCulture } from "../src/sim";
import { clubIds, fresh, ofType, withSeason } from "./culture-helpers";
import { world } from "./helpers";

// Rivalries (GDD v1.36): more than a repeat final founds a derby, and an old rivalry grows.

const rules = world.config.culture.derby;
const w = rules.weights;

function summary(
  won: number[],
  extra: Partial<SeasonSummary> = {},
  ids = won.map((_, i) => i + 1),
): SeasonSummary {
  return {
    season: 1,
    quarter: 4,
    countryId: "x",
    format: "european",
    scoring: "medium",
    championId: ids[0] ?? 0,
    runnerUpId: ids[1] ?? 0,
    standings: ids.map((clubId, i) => ({
      clubId,
      played: 0,
      won: won[i] ?? 0,
      drawn: 0,
      lost: 0,
      scoreFor: 0,
      scoreAgainst: 0,
      points: 0,
    })),
    playoffs: [],
    startRatings: [],
    topScorer: null,
    newStarIds: [],
    crowd: null,
    recordCrowd: false,
    playerOfSeason: null,
    ...extra,
  };
}

const weightOf = (facts: ReturnType<typeof rivalryFacts>, a: number, b: number) =>
  facts.find((f) => f.pair[0] === Math.min(a, b) && f.pair[1] === Math.max(a, b))?.weight ?? 0;

describe("rivalry facts", () => {
  it("the top two count once, twice when the title was close", () => {
    expect(weightOf(rivalryFacts(summary([30, 24, 18, 12]), [], rules), 1, 2)).toBe(w.topTwo);
    expect(weightOf(rivalryFacts(summary([30, 29, 18, 12]), [], rules), 1, 2)).toBe(
      w.topTwo + w.decisive,
    );
  });

  it("clubs finishing side by side near the top count, further down they do not", () => {
    const facts = rivalryFacts(summary([30, 20, 19, 10, 9]), [], rules);
    expect(weightOf(facts, 2, 3)).toBe(w.sideBySide);
    expect(weightOf(facts, 4, 5)).toBe(0);
  });

  it("a playoff meeting counts, and an upset counts twice", () => {
    const meeting = {
      homeId: 3,
      awayId: 4,
      homeScore: 2,
      awayScore: 1,
      decidedFor: null,
    };
    const ratings = [
      { clubId: 3, rating: 50 },
      { clubId: 4, rating: 70 },
    ];
    const upset = rivalryFacts(
      summary([30, 20, 10, 0], { playoffs: [meeting], startRatings: ratings }),
      [],
      rules,
    );
    expect(weightOf(upset, 3, 4)).toBe(w.playoff + w.upset);
    const expected = rivalryFacts(
      summary([30, 20, 10, 0], {
        playoffs: [meeting],
        startRatings: [
          { clubId: 3, rating: 70 },
          { clubId: 4, rating: 50 },
        ],
      }),
      [],
      rules,
    );
    expect(weightOf(expected, 3, 4)).toBe(w.playoff);
  });

  it("two clubs in one town count when both finish in the top half", () => {
    const clubs = [1, 2, 3, 4, 5, 6].map((id) => ({
      id,
      countryId: "x",
      place: id === 1 || id === 3 ? "Springfield" : `Town ${id}`,
      nickname: `Club ${id}`,
      rating: 50,
      active: true,
      firstSeason: 1,
    }));
    const facts = rivalryFacts(summary([60, 50, 40, 30, 20, 10]), clubs, rules);
    expect(weightOf(facts, 1, 3)).toBe(w.neighbours);
    expect(
      weightOf(rivalryFacts(summary([60, 50, 40, 30, 20, 10]), clubs.slice(1), rules), 1, 3),
    ).toBe(0);
  });
});

describe("rivalries as traditions", () => {
  it("two close title races found a derby where two ordinary finals do not", () => {
    const [, a = 0, b = 0] = clubIds(fresh());
    let ordinary = fresh();
    ordinary = updateCulture(withSeason(ordinary, a, b), world);
    ordinary = updateCulture(withSeason(ordinary, a, b), world);
    expect(ofType(ordinary, "derby")).toEqual([]);
    let close = fresh();
    close = updateCulture(withSeason(close, a, b, { close: true }), world);
    close = updateCulture(withSeason(close, a, b, { close: true }), world);
    expect(ofType(close, "derby")).toHaveLength(1);
  });

  it("a rivalry grows with every meeting and keeps its meetings on record", () => {
    const [, a = 0, b = 0] = clubIds(fresh());
    let state: GameState = fresh("beach");
    for (let i = 0; i < 3; i += 1) state = updateCulture(withSeason(state, a, b), world);
    const born = ofType(state, "derby")[0];
    expect(born?.seasons).toHaveLength(3);
    state = updateCulture(withSeason(state, a, b, { close: true }), world);
    const later = ofType(state, "derby")[0];
    expect(later?.seasons).toHaveLength(4);
    expect(later?.strength).toBeGreaterThan(born?.strength ?? 1);
  });
});
