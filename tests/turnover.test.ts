import { describe, expect, it } from "vitest";
import { builder } from "../src/runner/policy";
import {
  createCampaign,
  endTurn,
  type GameState,
  PLAYER_INDEX,
  quarterlyTurnoverRate,
  stepQuarter,
  type World,
} from "../src/sim";
import { countryIndex, setupFor, withConfig, world } from "./helpers";

// Generational turnover (GDD Late-Game Pressure) tested through consequences: the measured annual
// loss, where the fans go, the floor, and that rivals still persist in a long campaign.

const ANCHOR = "austria";

/** Only turnover moves fans: no conversion, churn, poaching, countermoves, noise or tier-ups. */
function onlyTurnover(base: World, annualRate = base.config.turnover.annualRate): World {
  return withConfig(base, (config) => {
    config.turnover.annualRate = annualRate;
    config.turnover.rivalReplacement = 0;
    config.dynamics.noise = 0;
    config.dynamics.player = {
      casualConversionRate: 0,
      casualChurnRate: 0,
      casualDecayRate: 0,
      hardcoreConversionRate: 0,
    };
    config.dynamics.rival = {
      casualChurnRate: 0,
      hardcoreConversionRate: 0,
    };
    config.poaching.rate = 0;
    config.rivalAI.movesPerQuarter = 0;
    for (const tier of config.ppTiers) if (tier.tier > 1) tier.fandomScoreRequired = 1e15;
  });
}

function startWithPlayerFans(w: World): GameState {
  const state = createCampaign(w, setupFor(1, ANCHOR));
  const index = countryIndex(w, ANCHOR);
  return {
    ...state,
    countries: state.countries.map((country, i) =>
      i !== index
        ? country
        : {
            ...country,
            fans: country.fans.map((f, s) =>
              s === PLAYER_INDEX ? { ...f, casual: 1_000_000, hardcore: 1_000_000 } : f,
            ),
          },
    ),
  };
}

function quarters(state: GameState, w: World, n: number): GameState {
  let current = state;
  for (let q = 0; q < n; q += 1) current = stepQuarter(current, w);
  return current;
}

describe("generational turnover", () => {
  it("compounds to the configured annual rate, on fans above the floor, for the player and every rival", () => {
    const w = onlyTurnover(world);
    const rate = w.config.turnover.annualRate;
    expect(rate).toBeGreaterThan(0);
    expect(1 - (1 - quarterlyTurnoverRate(w.config)) ** 4).toBeCloseTo(rate, 12);
    const start = startWithPlayerFans(w);
    const year = quarters(start, w, 4);
    let checked = 0;
    const kinds = new Set<string>();
    start.countries.forEach((country, c) => {
      country.fans.forEach((before, s) => {
        const after = year.countries[c]?.fans[s];
        if (!after || before.hardcore < 200_000) return;
        if (start.sports[s]?.kind === "other") {
          expect(after.hardcore, `${country.countryId}/other`).toBe(before.hardcore);
          return;
        }
        const population = w.countries[c]?.population ?? 0;
        const floor = Math.ceil(w.config.turnover.floorShare * population);
        const expected = floor + (before.hardcore - floor) * (1 - rate);
        expect(after.hardcore / expected, `${country.countryId}/${before.sportId}`).toBeCloseTo(
          1,
          4,
        );
        checked += 1;
        kinds.add(start.sports[s]?.kind ?? "");
      });
    });
    expect(checked).toBeGreaterThan(20);
    expect([...kinds].sort()).toStrictEqual(["player", "rival"]);
  });

  it("aged-out hardcore fans become casual about the same sport: nobody skips a bucket", () => {
    const w = onlyTurnover(world);
    const start = startWithPlayerFans(w);
    const next = quarters(start, w, 3);
    let moved = 0;
    start.countries.forEach((country, c) => {
      country.fans.forEach((before, s) => {
        const after = next.countries[c]?.fans[s];
        if (!after) throw new Error("fans missing");
        const lost = before.hardcore - after.hardcore;
        expect(lost).toBeGreaterThanOrEqual(0);
        // Every hardcore fan lost is a casual fan gained: casual + hardcore (and so uninterested)
        // is unchanged.
        expect(after.casual - before.casual).toBe(lost);
        moved += lost;
      });
    });
    expect(moved).toBeGreaterThan(100_000);
  });

  it("rivals recruit replacements for their aging fans from their casual fans; the player does not", () => {
    const aging = onlyTurnover(world);
    const replacing = withConfig(aging, (config) => {
      config.turnover.rivalReplacement = 1;
    });
    const start = startWithPlayerFans(aging);
    const without = quarters(start, aging, 4);
    const withReplacement = quarters(start, replacing, 4);
    let checked = 0;
    start.countries.forEach((country, c) => {
      country.fans.forEach((before, s) => {
        const kind = start.sports[s]?.kind;
        const aged = without.countries[c]?.fans[s];
        const replaced = withReplacement.countries[c]?.fans[s];
        if (!aged || !replaced || before.hardcore < 200_000) return;
        const lost = before.hardcore - aged.hardcore;
        if (kind === "rival") {
          // Every aging fan is replaced, so the hardcore base holds; the casual pool pays for it.
          expect(lost, country.countryId).toBeGreaterThan(1000);
          expect(
            Math.abs(replaced.hardcore - before.hardcore),
            country.countryId,
          ).toBeLessThanOrEqual(4);
          expect(replaced.casual + replaced.hardcore).toBe(before.casual + before.hardcore);
          checked += 1;
        } else {
          expect(replaced, `${country.countryId}/${before.sportId}`).toStrictEqual(aged);
        }
      });
    });
    expect(checked).toBeGreaterThan(10);
  });

  it("with a zero rate nothing moves", () => {
    const w = onlyTurnover(world, 0);
    const start = startWithPlayerFans(w);
    expect(quarters(start, w, 4).countries.map((c) => c.fans)).toStrictEqual(
      start.countries.map((c) => c.fans),
    );
  });

  it("never takes a sport below the floor share of a country", () => {
    const w = onlyTurnover(world, 1);
    const start = startWithPlayerFans(w);
    const next = stepQuarter(start, w);
    start.countries.forEach((country, c) => {
      const population = w.countries[c]?.population ?? 0;
      const floor = Math.ceil(w.config.turnover.floorShare * population);
      country.fans.forEach((before, s) => {
        const expected =
          start.sports[s]?.kind === "other" ? before.hardcore : Math.min(before.hardcore, floor);
        expect(next.countries[c]?.fans[s]?.hardcore).toBe(expected);
      });
    });
  });

  it("rivals still persist through a long campaign with turnover on", () => {
    let state = createCampaign(world, setupFor(4471, ANCHOR));
    const start = state.countries.map((country) => country.fans.map((f) => f.hardcore));
    for (let turn = 0; turn < 160 && state.outcome === null; turn += 1) {
      state = endTurn(builder(state, world).state, world);
    }
    // The campaign has to be long for turnover to bite, and it has to be the whole 160 turns: an
    // early collapse would leave the rival check below meaningless. The quarter count depends on
    // when the PP tiers land (turn length is 1, 2 then 4 quarters), so the floor is set at 80
    // in-game years rather than at a number that tracks tier pacing.
    expect(state.outcome).toBeNull();
    expect(state.quarter).toBeGreaterThan(320);
    state.sports.forEach((sport, s) => {
      if (sport.kind !== "rival") return;
      state.countries.forEach((country, c) => {
        if ((start[c]?.[s] ?? 0) > 0) {
          expect(country.fans[s]?.hardcore, `${sport.id} in ${country.countryId}`).toBeGreaterThan(
            0,
          );
        }
      });
    });
  });
});
