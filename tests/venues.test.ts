import { describe, expect, it } from "vitest";
import {
  checkInvariants,
  createCampaign,
  deserializeSave,
  endTurn,
  type GameState,
  PLAYER_INDEX,
  serializeSave,
} from "../src/sim";
import { seatedCrowd, venueCapacity } from "../src/sim/venues";
import { countryIndex, setupFor, world } from "./helpers";

// Venues and payroll, step 1 (GDD v1.30, tech plan 2.17): state, crowds and save format 22.

const brazil = countryIndex(world, "brazil");

/** Brazil's campaign played until its first flagship season has ended. */
function afterFirstSeason(): GameState {
  let state = createCampaign(world, setupFor(5, "brazil"));
  while (state.flagship.seasons.length === 0) {
    state = endTurn(state, world);
    expect(checkInvariants(state, world)).toEqual([]);
  }
  return state;
}

describe("venue state (tech plan 2.17 step 1)", () => {
  it("capacity rises with the level as a share of the population", () => {
    const population = world.countries[brazil]?.population ?? 0;
    const shares = world.config.leagues.venue.capacityShare;
    const capacities = [1, 2, 3, 4, 5].map((level) => venueCapacity(world, brazil, level));
    expect(capacities[0]).toBe(Math.floor((shares[0] ?? 0) * population));
    for (let i = 1; i < capacities.length; i += 1)
      expect(capacities[i]).toBeGreaterThan(capacities[i - 1] ?? 0);
    expect(seatedCrowd(world, brazil, 1, 10)).toBe(10);
    expect(seatedCrowd(world, brazil, 1, Number.MAX_SAFE_INTEGER)).toBe(capacities[0]);
  });

  it("a league starts at level 1; a season records its seated crowd", () => {
    const state = afterFirstSeason();
    const league = state.countries[brazil]?.league;
    expect(league?.venue).toEqual({ level: 1, building: null, record: null });
    const summary = state.flagship.seasons[0];
    expect(summary?.crowd).toBeGreaterThan(0);
    const hardcore = state.countries[brazil]?.fans[PLAYER_INDEX]?.hardcore ?? 0;
    expect(summary?.crowd).toBeLessThanOrEqual(Math.max(hardcore, venueCapacity(world, brazil, 1)));
  });

  it("a format 21 save migrates to level 1 venues and crowdless seasons", () => {
    const played = afterFirstSeason();
    const v21 = {
      ...played,
      countries: played.countries.map((c) => {
        if (!c.league) return c;
        const { venue: _v, ...league } = c.league;
        return { ...c, league };
      }),
      flagship: {
        ...played.flagship,
        seasons: played.flagship.seasons.map(({ crowd: _c, recordCrowd: _r, ...season }) => season),
      },
    };
    const loaded = deserializeSave(JSON.stringify({ formatVersion: 21, state: v21 }), world);
    expect(serializeSave(loaded)).toBe(
      serializeSave({
        ...played,
        flagship: {
          ...played.flagship,
          seasons: played.flagship.seasons.map((s) => ({ ...s, crowd: null, recordCrowd: false })),
        },
      }),
    );
  });
});
