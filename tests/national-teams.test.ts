import { describe, expect, it } from "vitest";
import {
  createCampaign,
  type GameState,
  type LeagueTierId,
  nationalTeams,
  newLeague,
  PLAYER_INDEX,
  snapshot,
  updateStandouts,
} from "../src/sim";
import { countryIndex, setupFor, world } from "./helpers";

// National teams (GDD v1.37, tech plan 2.23 step 4): read from the state, never saved.

function withLeagues(state: GameState, tiers: Record<string, LeagueTierId>): GameState {
  return {
    ...state,
    countries: state.countries.map((country, index) => {
      const tier = tiers[country.countryId];
      if (tier === undefined) return country;
      const league = country.league ?? newLeague(world, index, state.quarter, 0, []);
      return { ...country, league: { ...league, tier } };
    }),
  };
}

function withHardcore(state: GameState, countryId: string, share: number): GameState {
  const index = countryIndex(world, countryId);
  const population = world.countries[index]?.population ?? 0;
  return {
    ...state,
    countries: state.countries.map((country, i) =>
      i === index
        ? {
            ...country,
            fans: country.fans.map((fans, sport) =>
              sport === PLAYER_INDEX ? { ...fans, hardcore: share * population } : fans,
            ),
          }
        : country,
    ),
  };
}

describe("national teams", () => {
  const base = createCampaign(world, setupFor(7, "brazil"));
  const rules = world.config.nationalTeams;
  const tiers = { france: "semi-pro", japan: "professional", germany: "elite" } as const;
  const leagues = withLeagues(base, tiers);
  const strengthOf = (state: GameState, id: string) =>
    nationalTeams(state, world).find((team) => team.countryId === id)?.strength ?? Number.NaN;

  it("are fielded by Semi-Pro leagues and better, and by no one at the start", () => {
    // The anchor's founding league is Amateur.
    expect(nationalTeams(base, world)).toEqual([]);
    expect(nationalTeams(leagues, world).map((team) => team.countryId)).toEqual([
      "germany",
      "japan",
      "france",
    ]);
    expect(strengthOf(leagues, "france")).toBe(rules.tierBase["semi-pro"]);
    expect(nationalTeams(leagues, world).every((team) => team.players.length === 0)).toBe(true);
  });

  it("are stronger where the sport has more hardcore fans, up to the full share", () => {
    const some = withHardcore(leagues, "france", rules.hardcore.fullShare / 2);
    const full = withHardcore(leagues, "france", rules.hardcore.fullShare);
    const over = withHardcore(leagues, "france", rules.hardcore.fullShare * 2);
    expect(strengthOf(some, "france")).toBeCloseTo(
      rules.tierBase["semi-pro"] + rules.hardcore.weight / 2,
    );
    expect(strengthOf(full, "france")).toBeCloseTo(
      rules.tierBase["semi-pro"] + rules.hardcore.weight,
    );
    expect(strengthOf(over, "france")).toBeCloseTo(strengthOf(full, "france"));
  });

  it("count the best three named nationals, standouts and flagship players alike", () => {
    const named = updateStandouts(leagues, world);
    const germans = named.standouts.players
      .filter((player) => player.countryId === "germany")
      .sort((a, b) => b.skill - a.skill);
    expect(germans).toHaveLength(3);
    const germany = nationalTeams(named, world).find((team) => team.countryId === "germany");
    expect(germany?.players.map((player) => player.playerId)).toEqual(
      germans.map((player) => player.id),
    );
    expect(germany?.strength).toBeCloseTo(
      rules.tierBase.elite +
        rules.skillWeight * germans.reduce((sum, player) => sum + player.skill, 0),
    );

    // A French player leading a flagship club lifts France, which has no standouts of its own;
    // a fourth German, however good, replaces only the weakest of the three.
    const leader = named.flagship.players[0];
    if (!leader) throw new Error("no flagship player");
    const abroad: GameState = {
      ...named,
      flagship: {
        ...named.flagship,
        players: named.flagship.players.map((player, i) =>
          i === 0
            ? { ...player, countryId: "france", skill: 90 }
            : i === 1
              ? { ...player, countryId: "germany", skill: 95 }
              : player,
        ),
      },
    };
    const france = nationalTeams(abroad, world).find((team) => team.countryId === "france");
    expect(france?.players).toEqual([
      { playerId: leader.id, name: leader.name, skill: 90, atFlagship: true },
    ]);
    expect(france?.strength).toBeCloseTo(rules.tierBase["semi-pro"] + rules.skillWeight * 90);
    const lifted = nationalTeams(abroad, world).find((team) => team.countryId === "germany");
    expect(lifted?.players).toHaveLength(rules.players);
    expect(lifted?.players[0]?.atFlagship).toBe(true);
    expect(lifted?.strength).toBeCloseTo(
      (germany?.strength ?? 0) + rules.skillWeight * (95 - (germans[2]?.skill ?? 0)),
    );
    // One star abroad is worth most of a league tier.
    expect(strengthOf(abroad, "france")).toBeGreaterThan(rules.tierBase.professional - 5);
  });

  it("reach the screen as an order and names, with no strength or skill", () => {
    const named = updateStandouts(leagues, world);
    const listed = snapshot(named, world).nationalTeams;
    expect(listed.map((team) => team.rank)).toEqual([1, 2, 3]);
    expect(listed.map((team) => team.countryId)).toEqual(
      nationalTeams(named, world).map((team) => team.countryId),
    );
    expect(Object.keys(listed[0] ?? {}).sort()).toEqual(["countryId", "players", "rank"]);
    expect(Object.keys(listed[0]?.players[0] ?? {}).sort()).toEqual([
      "atFlagship",
      "name",
      "playerId",
    ]);
  });
});
