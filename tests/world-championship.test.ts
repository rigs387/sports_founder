import { describe, expect, it } from "vitest";
import {
  applyAction,
  checkInvariants,
  createCampaign,
  deserializeSave,
  endTurn,
  foundBlocker,
  foundingPrice,
  type GameState,
  hostBlocker,
  newLeague,
  serializeSave,
  snapshot,
  yearOfQuarter,
} from "../src/sim";
import { setupFor, world } from "./helpers";

// The World Championship's founding, calendar and hosts (GDD v1.37, tech plan 2.23 step 5).

const rules = world.config.worldChampionship;

/** The campaign with Semi-Pro leagues in `count` countries besides the seat. */
function withTeams(state: GameState, count: number): GameState {
  let left = count;
  return {
    ...state,
    countries: state.countries.map((country, index) => {
      if (country.countryId === state.flagship.countryId || left <= 0) return country;
      left -= 1;
      const league = country.league ?? newLeague(world, index, state.quarter, 0, []);
      return { ...country, league: { ...league, tier: "semi-pro" as const } };
    }),
  };
}

function firstOffseason(): GameState {
  let state = createCampaign(world, setupFor(7, "brazil"));
  while (!state.flagship.offseason) state = endTurn(state, world);
  return { ...withTeams(state, rules.foundingTeams), pp: 1e9 };
}

const found = (state: GameState, name = "  The   World Cup ") =>
  applyAction(state, world, { type: "foundChampionship", name });

describe("the World Championship", () => {
  const ready = firstOffseason();

  it("can be founded only in the offseason, with enough teams, a name and the PP", () => {
    expect(foundBlocker(ready, world, "World Cup")).toBeNull();
    const closed = { ...ready, flagship: { ...ready.flagship, offseason: false } };
    expect(foundBlocker(closed, world, "World Cup")).toBe("window");
    const few = withTeamsOnly(ready, rules.foundingTeams - 1);
    expect(foundBlocker(few, world, "World Cup")).toBe("teams");
    expect(foundBlocker(ready, world, "")).toBe("name");
    expect(foundBlocker({ ...ready, pp: 0 }, world, "World Cup")).toBe("pp");
    expect(() =>
      applyAction(closed, world, { type: "foundChampionship", name: "World Cup" }),
    ).toThrow(/offseason/);
  });

  it("is founded for PP with its name, its first tournament after the coming season, and bids", () => {
    const founded = found(ready);
    const championship = founded.worldChampionship;
    expect(ready.pp - founded.pp).toBeCloseTo(foundingPrice(ready, world));
    expect(championship.founded).toEqual({
      name: "The World Cup",
      turn: ready.turn,
      year: yearOfQuarter(ready.quarter, world.config),
    });
    expect(championship.nextSeason).toBe(ready.flagship.season);
    expect(championship.bids.length).toBeGreaterThanOrEqual(rules.bids.min);
    expect(championship.bids.length).toBeLessThanOrEqual(rules.bids.max);
    expect(new Set(championship.bids).size).toBe(championship.bids.length);
    for (const id of championship.bids)
      expect(founded.countries.find((c) => c.countryId === id)?.league).not.toBeNull();
    expect(founded.landmarks.at(-1)).toMatchObject({ kind: "championshipFounded" });
    expect(founded.rng).toEqual(ready.rng);
    expect(foundBlocker(founded, world, "Another")).toBe("founded");
    const view = snapshot(founded, world).worldChampionship;
    expect(view.founded?.name).toBe("The World Cup");
    expect(view.nextYear).toBe(yearOfQuarter(ready.quarter, world.config) + 1);
    expect(view.bids.map((bid) => bid.countryId)).toEqual(championship.bids);
    expect(view.canPick).toBe(true);
    expect(checkInvariants(founded, world)).toEqual([]);
    expect(deserializeSave(serializeSave(founded), world).worldChampionship).toEqual(championship);
  });

  it("lets the player pick a bidder as host, once", () => {
    const founded = found(ready);
    const [first, second] = founded.worldChampionship.bids;
    if (!first || !second) throw new Error("too few bids");
    const outsider = founded.countries.find(
      (c) => !founded.worldChampionship.bids.includes(c.countryId),
    );
    expect(hostBlocker(founded, outsider?.countryId ?? "")).toBe("bidder");
    const picked = applyAction(founded, world, { type: "pickHost", countryId: second });
    expect(picked.worldChampionship.hostId).toBe(second);
    expect(picked.worldChampionship.bids).toEqual([]);
    expect(picked.landmarks.at(-1)).toMatchObject({
      kind: "championshipHost",
      countryId: second,
      season: ready.flagship.season,
      picked: true,
    });
    expect(hostBlocker(picked, first)).toBe("chosen");
    expect(checkInvariants(picked, world)).toEqual([]);
  });

  it("gives an unpicked tournament to the wealthiest bidder when the offseason closes", () => {
    const founded = found(ready);
    const wealth = (id: string) => {
      const index = world.countries.findIndex((country) => country.id === id);
      return world.derived[index]?.wealthLevel ?? 0;
    };
    const top = Math.max(...founded.worldChampionship.bids.map(wealth));
    const next = endTurn(founded, world);
    const host = next.worldChampionship.hostId;
    expect(host).not.toBeNull();
    expect(founded.worldChampionship.bids).toContain(host);
    expect(wealth(host ?? "")).toBe(top);
    expect(next.landmarks.find((l) => l.kind === "championshipHost")).toMatchObject({
      picked: false,
    });
  });

  it("puts each tournament on record when its season ends and takes bids for the next in its offseason", () => {
    let state = found(ready);
    const firstSeason = ready.flagship.season;
    const [pick] = state.worldChampionship.bids;
    if (!pick) throw new Error("no bids");
    state = applyAction(state, world, { type: "pickHost", countryId: pick });
    while (state.worldChampionship.tournaments.length === 0) state = endTurn(state, world);
    expect(state.worldChampionship.tournaments).toEqual([
      {
        season: firstSeason,
        year: yearOfQuarter(
          state.flagship.seasons.find((s) => s.season === firstSeason)?.quarter ?? -1,
          world.config,
        ),
        hostId: pick,
      },
    ]);
    expect(state.worldChampionship.nextSeason).toBe(firstSeason + rules.everySeasons);
    expect(state.worldChampionship.hostId).toBeNull();
    // No bids until the offseason before the next tournament.
    expect(state.worldChampionship.bids).toEqual([]);
    while (state.worldChampionship.bids.length === 0) {
      state = { ...endTurn(state, world), pp: 1e9 };
      expect(state.outcome).toBeNull();
    }
    expect(state.flagship.offseason).toBe(true);
    expect(state.flagship.season).toBe(firstSeason + rules.everySeasons);
    expect(state.worldChampionship.bids).not.toContain(pick);
    expect(checkInvariants(state, world)).toEqual([]);
  });
});

/** `state` with Semi-Pro leagues in exactly `count` countries besides the seat. */
function withTeamsOnly(state: GameState, count: number): GameState {
  const bare: GameState = {
    ...state,
    countries: state.countries.map((country) =>
      country.countryId === state.flagship.countryId ? country : { ...country, league: null },
    ),
  };
  return withTeams(bare, count);
}
