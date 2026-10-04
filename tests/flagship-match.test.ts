import { describe, expect, it } from "vitest";
import { GENOME_AXES } from "../src/content";
import {
  createCampaign,
  deserializeSave,
  type GameState,
  runTurns,
  type ScoringOption,
  scoringRate,
  stepQuarter,
} from "../src/sim";
import { baseGenome, setupFor, world } from "./helpers";

// Scoring frequency in the flagship's matches (GDD v1.16, tech plan 2.6 step 1).

const SCORING_OPTIONS = GENOME_AXES.scoring.options;

/** P(k scores) for each k in 0..n, for n chances that each score with probability p. */
function binomial(n: number, p: number): number[] {
  const out: number[] = [];
  let ways = 1;
  for (let k = 0; k <= n; k += 1) {
    out.push(ways * p ** k * (1 - p) ** (n - k));
    ways = (ways * (n - k)) / (k + 1);
  }
  return out;
}

/**
 * The exact odds of a league match between clubs `gap` rating points apart, averaged over the
 * stronger club playing at home and away: its win, draw and loss chances.
 */
function odds(scoring: ScoringOption, gap: number) {
  const chances = world.config.flagship.match.chances[scoring];
  let win = 0;
  let draw = 0;
  for (const home of [true, false]) {
    const strong = binomial(chances, scoringRate(50 + gap, 50, home, scoring, world));
    const weak = binomial(chances, scoringRate(50, 50 + gap, !home, scoring, world));
    strong.forEach((ps, i) => {
      weak.forEach((pw, j) => {
        if (i > j) win += (ps * pw) / 2;
        else if (i === j) draw += (ps * pw) / 2;
      });
    });
  }
  return { win, draw, loss: 1 - win - draw };
}

const GAPS = [5, 10, 20];

describe("scoring frequency", () => {
  it("lets the stronger club win about as often at every frequency", () => {
    // Measured 2026-10-03 (stronger club's win %, gaps 5/10/20): low 47/61/85, medium 50/62/83,
    // high 53/63/82.
    for (const gap of GAPS) {
      const medium = odds("medium", gap).win;
      for (const scoring of SCORING_OPTIONS) {
        expect(Math.abs(odds(scoring, gap).win - medium)).toBeLessThan(0.04);
      }
    }
  });

  it("draws more in low-scoring sports and fewer in high-scoring ones", () => {
    for (const gap of [0, ...GAPS]) {
      expect(odds("low", gap).draw).toBeGreaterThan(odds("medium", gap).draw);
      expect(odds("medium", gap).draw).toBeGreaterThan(odds("high", gap).draw);
    }
  });
});

/** Steps quarters until the flagship has recorded `seasons` seasons. */
function playSeasons(state: GameState, seasons: number): GameState {
  let current = state;
  while (current.flagship.seasons.length < seasons) current = stepQuarter(current, world);
  return current;
}

const withScoring = (scoring: ScoringOption, seed = 11) =>
  createCampaign(world, setupFor(seed, "brazil", { ...baseGenome, scoring }));

describe("the season's scoring rule", () => {
  it("is fixed at the season start: a changed rule waits for the next season", () => {
    let state = stepQuarter(withScoring("high"), world);
    expect(state.flagship.scoring).toBe("high");
    // No action changes the genome yet; a later rules change would land mid-season like this.
    state = { ...state, genome: { ...state.genome, scoring: "low" } };
    const season = state.flagship.season;
    while (state.flagship.season === season) {
      expect(state.flagship.scoring).toBe("high");
      state = stepQuarter(state, world);
    }
    expect(state.flagship.seasons.at(-1)?.scoring).toBe("high");
    expect(state.flagship.scoring).toBe("low");
    state = playSeasons(state, state.flagship.seasons.length + 1);
    const low = world.config.flagship.match.chances.low;
    for (const row of state.flagship.seasons.at(-1)?.standings ?? []) {
      expect(row.scoreFor).toBeLessThanOrEqual(row.played * low);
    }
  });

  it("never touches the world: the world's dice and fans match under every rule", () => {
    const noSeasonCards = {
      ...world,
      events: {
        ...world.events,
        cards: world.events.cards.filter(
          (card) => card.trigger !== "seasonEnd" && card.trigger !== "star",
        ),
      },
    };
    const base = withScoring("medium", 5);
    const played = SCORING_OPTIONS.map((scoring) =>
      runTurns({ ...base, flagship: { ...base.flagship, scoring } }, noSeasonCards, 30),
    );
    const [low, medium, high] = played;
    if (!low || !medium || !high) throw new Error("No campaign");
    for (const other of [low, high]) {
      expect(other.rng).toStrictEqual(medium.rng);
      expect(other.countries).toStrictEqual(medium.countries);
      expect(other.flagship.seasons).not.toStrictEqual(medium.flagship.seasons);
    }
  });
});

describe("save format 10", () => {
  it("migrates a version 9 save: seasons so far are medium, the genome's rule starts next season", () => {
    const played = playSeasons(withScoring("high", 3), 2);
    const { scoring: _s, ...flagship } = played.flagship;
    const v9 = {
      ...played,
      flagship: { ...flagship, seasons: flagship.seasons.map(({ scoring: _r, ...s }) => s) },
    };
    const loaded = deserializeSave(JSON.stringify({ formatVersion: 9, state: v9 }), world);
    expect(loaded).toStrictEqual({
      ...played,
      flagship: {
        ...played.flagship,
        scoring: "medium",
        seasons: played.flagship.seasons.map((s) => ({ ...s, scoring: "medium" })),
      },
    });
    const next = playSeasons(loaded, 3);
    expect(next.flagship.seasons.at(-1)?.scoring).toBe("medium");
    expect(next.flagship.scoring).toBe("high");
  });
});
