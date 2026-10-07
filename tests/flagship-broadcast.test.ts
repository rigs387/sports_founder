import { describe, expect, it } from "vitest";
import {
  broadcastEffects,
  computeExposure,
  createCampaign,
  flagshipProblems,
  type GameState,
  type LeagueState,
  PLAYER_INDEX,
  type SeasonSummary,
  seasonInterest,
  stepQuarter,
  type TableRow,
  type World,
} from "../src/sim";
import { countryIndex, setupFor, withConfig, world } from "./helpers";

// The flagship's broadcast (GDD v1.23, tech plan 2.12).

const row = (clubId: number, points: number): TableRow => ({
  clubId,
  played: 14,
  won: 0,
  drawn: 0,
  lost: 0,
  scoreFor: 0,
  scoreAgainst: 0,
  points,
});

/** An eight-club season: runaway needs a gap of 6.3 points, a close finish 3 or less. */
function summary(season: number, championId: number, runnerUpId: number, gap: number) {
  const others = [1, 2, 3, 4, 5, 6, 7, 8].filter((id) => id !== championId && id !== runnerUpId);
  return {
    season,
    quarter: season * 4,
    countryId: "brazil",
    format: "european",
    scoring: "medium",
    championId,
    runnerUpId,
    standings: [
      row(championId, 20 + gap),
      row(runnerUpId, 20),
      ...others.map((id, i) => row(id, 10 - i)),
    ],
    playoffs: [],
    startRatings: [1, 2, 3, 4, 5, 6, 7, 8].map((clubId) => ({ clubId, rating: 40 + clubId })),
    topScorer: null,
    newStarId: null,
    crowd: null,
    recordCrowd: false,
  } satisfies SeasonSummary;
}
const interest = (seasons: SeasonSummary[]) => seasonInterest(seasons, seasons.length - 1, world);

describe("season interest", () => {
  it("reads the last season's stories, the runaway outweighing the rest", () => {
    // Club 5 wins its first title by 5 points: a first title is gripping.
    const first = summary(1, 5, 6, 5);
    expect(interest([first])).toBe("gripping");
    // A second title by 5 points, against a new runner-up: nothing to tell.
    const ordinary = [first, summary(2, 7, 8, 5), summary(3, 5, 4, 5)];
    expect(interest(ordinary)).toBe("ordinary");
    expect(interest([first, summary(2, 5, 4, 5), summary(3, 5, 3, 5)])).toBe("dynasty");
    // A first title won by 7 points is a runaway first.
    expect(interest([summary(1, 5, 6, 7)])).toBe("runaway");
  });
});

/** Brazil (a large media market) at the start: an Amateur, healthy league holds the seat. */
const start = (content: World = world) => createCampaign(content, setupFor(11, "brazil"));
const brazil = countryIndex(world, "brazil");

function withLeague(state: GameState, change: (league: LeagueState) => LeagueState | null) {
  const countries = [...state.countries];
  const country = countries[brazil];
  if (!country?.league) throw new Error("Brazil has no league");
  countries[brazil] = { ...country, league: change(country.league) };
  return { ...state, countries };
}

describe("broadcast", () => {
  const { broadcast } = world.config.flagship;

  it("lifts media reach where it airs by ceiling × interest × health", () => {
    const state = start();
    expect(broadcastEffects(state, world)).toMatchObject({
      countryId: "brazil",
      interest: "ordinary",
      boost: broadcast.ceiling.amateur * broadcast.interest.ordinary,
      pulse: 0,
    });
    const struggling = withLeague(state, (league) => ({ ...league, health: "struggling" }));
    expect(broadcastEffects(struggling, world).boost).toBeCloseTo(
      broadcast.ceiling.amateur * broadcast.interest.ordinary * broadcast.health.struggling,
    );
    const away = withLeague(state, () => null);
    expect(broadcastEffects(away, world)).toMatchObject({ countryId: null, boost: 0 });
    expect(flagshipProblems(away, world)).toEqual([]);
  });

  it("lifts all media reach where it airs, by its link from the seat", () => {
    // A second fan base in the United States, so media reaches markets from two sources.
    const us = countryIndex(world, "united-states");
    const countries = [...start().countries];
    const usa = countries[us];
    if (!usa) throw new Error("No United States");
    countries[us] = {
      ...usa,
      fans: usa.fans.map((f, i) => (i === PLAYER_INDEX ? { ...f, casual: 5_000_000 } : f)),
    };
    const state = { ...start(), countries };
    const silent = withConfig(world, (config) => {
      config.flagship.broadcast.ceiling.amateur = 0;
    });
    const { boost, reach } = broadcastEffects(state, world);
    expect(reach.size).toBeGreaterThan(0);
    expect(Math.max(...reach.values())).toBe(1);
    expect(reach.has(brazil)).toBe(false);
    const on = computeExposure(state, world);
    const off = computeExposure(state, silent);
    on.forEach((exposure, i) => {
      const before = off[i]?.media ?? 0;
      const lift = boost * (reach.get(i) ?? 0);
      if (lift === 0 || before === 0) expect(exposure.broadcast).toBe(0);
      else expect(exposure.broadcast / before).toBeCloseTo(lift, 9);
      expect(exposure.media - exposure.broadcast).toBeCloseTo(before, 12);
    });
    // The United States hears the broadcast on media from Brazil and from its own neighbours.
    expect(on[us]?.broadcast ?? 0).toBeGreaterThan(0);
  });

  it("pulses after a season and fades; a runaway sends no pulse", () => {
    let state = start();
    while (state.flagship.seasons.length < 1) state = stepQuarter(state, world);
    const effects = broadcastEffects(state, world);
    const story = broadcast.pulse.story[effects.interest];
    expect(effects.pulse).toBeCloseTo(broadcast.ceiling.amateur * broadcast.pulse.size * story);
    const later = { ...state, quarter: state.quarter + broadcast.pulse.fadeQuarters };
    expect(broadcastEffects(later, world).pulse).toBe(0);

    const runaway = withConfig(world, (config) => {
      config.flagship.stories.runawayShare = 0;
    });
    expect(broadcastEffects(state, runaway)).toMatchObject({ interest: "runaway", pulse: 0 });
  });

  it("ripples casual losses abroad at Near-Collapse, never at the seat", () => {
    const state = withLeague(start(), (league) => ({ ...league, health: "near-collapse" }));
    const effects = broadcastEffects(state, world);
    expect(effects.boost).toBe(0);
    expect(effects.ripple.has(brazil)).toBe(false);
    expect(Math.max(...effects.ripple.values())).toBeCloseTo(broadcast.rippleShare);
    expect(broadcastEffects(start(), world).ripple.size).toBe(0);

    const target = [...effects.ripple.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1;
    const calm = withConfig(world, (config) => {
      config.flagship.broadcast.rippleShare = 0;
    });
    // Seed the target with casual fans so the drain has something to take.
    const countries = [...state.countries];
    const country = countries[target];
    if (!country) throw new Error("No ripple target");
    countries[target] = {
      ...country,
      fans: country.fans.map((f, i) => (i === PLAYER_INDEX ? { ...f, casual: 1_000_000 } : f)),
    };
    const seeded = { ...state, countries };
    const step = (content: World, index: number) =>
      stepQuarter(seeded, content).countries[index]?.fans[PLAYER_INDEX];
    expect(step(world, target)?.casual).toBeLessThan(step(calm, target)?.casual ?? 0);
    expect(step(world, brazil)).toEqual(step(calm, brazil));
  });
});
