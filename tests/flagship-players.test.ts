import { describe, expect, it } from "vitest";
import {
  activeClubs,
  applyAction,
  checkInvariants,
  closeOffseason,
  createCampaign,
  deserializeSave,
  endTurn,
  type GameState,
  type LeagueTierId,
  newLeague,
  offseasonOpen,
  PLAYER_INDEX,
  type Player,
  runTurns,
  serializeSave,
  stepQuarter,
} from "../src/sim";
import {
  cardless,
  countryIndex,
  setupFor,
  withConfig,
  withoutTraditionEvents,
  world,
} from "./helpers";

// Leading players (GDD v1.16, tech plan 2.6 step 2).

const start = (anchor = "brazil", seed = 11) => createCampaign(world, setupFor(seed, anchor));

/** Gives `countryId` a healthy league at `tier` with plenty of fans and cash. */
function withLeague(state: GameState, countryId: string, tier: LeagueTierId): GameState {
  const index = countryIndex(world, countryId);
  const countries = [...state.countries];
  const country = countries[index];
  if (!country) throw new Error("No country");
  countries[index] = {
    ...country,
    fans: country.fans.map((f, i) => (i === PLAYER_INDEX ? { ...f, hardcore: 50_000 } : f)),
    league: { ...newLeague(world, index, state.quarter, 50_000, []), tier, cash: 1e9 },
  };
  return { ...state, countries };
}

/** Every name a pool can make, in its written order. */
function poolNames(poolId: string): Set<string> {
  const pool = world.names.playerNames.pools[poolId];
  if (!pool) throw new Error(`No pool ${poolId}`);
  const names = new Set<string>();
  for (const given of pool.given) {
    for (const family of pool.family) {
      names.add(pool.order === "familyFirst" ? `${family} ${given}` : `${given} ${family}`);
    }
  }
  return names;
}

/** Who players are: what never changes once they are born. */
const identities = (players: readonly Player[]) =>
  players.map(({ id, name, countryId, birthplace, birthSeason, peakSkill }) => ({
    id,
    name,
    countryId,
    birthplace,
    birthSeason,
    peakSkill,
  }));

const withoutSeasonCards = cardless(world);

describe("leading players", () => {
  it("gives every founding club one, born in a real place of the market", () => {
    const state = start();
    const { players, season } = state.flagship;
    const clubs = activeClubs(state.flagship);
    expect(players.map((p) => p.clubId).sort()).toEqual(clubs.map((c) => c.id).sort());
    const places = new Set(world.places.brazil?.map((place) => place.name));
    const names = poolNames("portuguese");
    const { foundingAge, skill } = world.config.flagship.players;
    for (const player of players) {
      expect(player.countryId).toBe("brazil");
      expect(places.has(player.birthplace)).toBe(true);
      expect(names.has(player.name)).toBe(true);
      const age = season - player.birthSeason;
      expect(age).toBeGreaterThanOrEqual(foundingAge.min);
      expect(age).toBeLessThanOrEqual(foundingAge.max);
      expect(player.skill).toBeLessThanOrEqual(player.peakSkill);
      expect(player.skill).toBeGreaterThanOrEqual(skill.min);
    }
    expect(new Set(players.map((p) => p.name)).size).toBe(players.length);
    expect(checkInvariants(state, world)).toEqual([]);
  });

  it("names players from the market's pool: family name first in China, a regional pool in Nigeria", () => {
    const china = poolNames("chinese");
    for (const player of start("china").flagship.players) expect(china.has(player.name)).toBe(true);
    const nigeria = poolNames("west-african-anglophone");
    for (const player of start("nigeria").flagship.players) {
      expect(nigeria.has(player.name)).toBe(true);
    }
  });

  it("staffs expansion clubs at the next season and leaves the first clubs' players alone", () => {
    let state = withLeague(start(), "brazil", "semi-pro");
    const founders = state.flagship.players;
    while (state.flagship.seasons.length < 1) state = stepQuarter(state, world);
    // Expansion clubs join when the offseason closes (GDD v1.24).
    expect(state.flagship.offseason).toBe(true);
    state = closeOffseason(state, world);
    expect(state.flagship.players).toHaveLength(world.config.flagship.clubs["semi-pro"]);
    expect(identities(state.flagship.players.slice(0, founders.length))).toStrictEqual(
      identities(founders),
    );
    expect(checkInvariants(state, world)).toEqual([]);
  });

  it("keeps players with their dormant clubs when the seat moves; the new league gets its own", () => {
    let state = withLeague(start(), "argentina", "professional");
    while (!offseasonOpen(state)) state = stepQuarter(state, world);
    const brazilians = state.flagship.players;
    state = endTurn(applyAction(state, world, { type: "moveSeat", countryId: "argentina" }), world);
    expect(state.flagship.countryId).toBe("argentina");
    expect(identities(state.flagship.players.slice(0, brazilians.length))).toStrictEqual(
      identities(brazilians),
    );
    const argentines = state.flagship.players.slice(brazilians.length);
    expect(argentines).toHaveLength(world.config.flagship.clubs.professional);
    expect(argentines.every((p) => p.countryId === "argentina")).toBe(true);
    expect(checkInvariants(state, world)).toEqual([]);
  });

  it("never touches the world: the world's dice and fans match whoever the players are", () => {
    const older = withConfig(world, (config) => {
      config.flagship.players.foundingAge = { min: 30, max: 34 };
    });
    const olderNoCards = cardless(older);
    const a = runTurns(start("brazil", 5), withoutSeasonCards, 30);
    const b = runTurns(createCampaign(older, setupFor(5, "brazil")), olderNoCards, 30);
    expect(b.flagship.players).not.toStrictEqual(a.flagship.players);
    expect(b.rng).toStrictEqual(a.rng);
    expect(b.countries).toStrictEqual(a.countries);
  });
});

describe("save format 11", () => {
  it("migrates a version 10 save: fresh players at active clubs, none at dormant ones", () => {
    let played = withLeague(start("brazil", 3), "argentina", "professional");
    while (!offseasonOpen(played)) played = stepQuarter(played, world);
    played = endTurn(
      applyAction(played, world, { type: "moveSeat", countryId: "argentina" }),
      world,
    );
    // A format 10 save has no players, tallies or top scorers.
    const { players: _p, nextPlayerId: _n, tallies: _t, ...rest } = played.flagship;
    const flagship = { ...rest, seasons: rest.seasons.map(({ topScorer: _s, ...s }) => s) };
    const events = withoutTraditionEvents(played.events);
    const v10 = JSON.stringify({ formatVersion: 10, state: { ...played, flagship, events } });
    const loaded = deserializeSave(v10, world);
    const active = activeClubs(loaded.flagship).map((club) => club.id);
    expect(loaded.flagship.players.map((p) => p.clubId)).toEqual(active);
    expect(loaded.flagship.players.every((p) => p.countryId === "argentina")).toBe(true);
    expect(checkInvariants(loaded, world)).toEqual([]);
    // Deterministic, and it re-saves byte for byte.
    expect(deserializeSave(v10, world)).toStrictEqual(loaded);
    const text = serializeSave(loaded);
    expect(serializeSave(deserializeSave(text, world))).toBe(text);
  });
});
