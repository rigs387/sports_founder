import { describe, expect, it } from "vitest";
import {
  checkInvariants,
  createCampaign,
  deserializeSave,
  endTurn,
  type GameState,
  type LeagueTierId,
  newLeague,
  serializeSave,
  snapshot,
  updateStandouts,
} from "../src/sim";
import { countryIndex, setupFor, withConfig, world } from "./helpers";

// Standouts (GDD v1.37): named players in Professional and Elite leagues other than the flagship.

/** The campaign with a league of each given tier, formed now. */
function withLeagues(state: GameState, tiers: Record<string, LeagueTierId | null>): GameState {
  return {
    ...state,
    countries: state.countries.map((country, index) => {
      const tier = tiers[country.countryId];
      if (tier === undefined) return country;
      if (tier === null) return { ...country, league: null };
      return { ...country, league: { ...newLeague(world, index, state.quarter, 0, []), tier } };
    }),
  };
}

const nextSeason = (state: GameState): GameState => ({
  ...state,
  flagship: { ...state.flagship, season: state.flagship.season + 1 },
});

describe("standouts", () => {
  const base = createCampaign(world, setupFor(7, "brazil"));
  const leagues = { japan: "professional", germany: "elite", france: "semi-pro" } as const;
  const founded = updateStandouts(withLeagues(base, { ...leagues, brazil: "elite" }), world);
  const namesIn = (state: GameState, id: string) =>
    state.standouts.players.filter((player) => player.countryId === id);

  it("start with none and leave a campaign without eligible leagues untouched", () => {
    expect(base.standouts.players).toEqual([]);
    expect(updateStandouts(base, world)).toBe(base);
  });

  it("give Professional leagues two and Elite leagues three, never the seat or lower tiers", () => {
    expect(namesIn(founded, "japan")).toHaveLength(2);
    expect(namesIn(founded, "germany")).toHaveLength(3);
    expect(namesIn(founded, "france")).toHaveLength(0);
    expect(namesIn(founded, "brazil")).toHaveLength(0);
    for (const player of founded.standouts.players) {
      const places = world.places[player.countryId]?.map((place) => place.name) ?? [];
      expect(places).toContain(player.birthplace);
    }
    const names = [
      ...founded.flagship.players.map((player) => player.name),
      ...founded.standouts.players.map((player) => player.name),
    ];
    expect(new Set(names).size).toBe(names.length);
    expect(founded.flagship.nextPlayerId).toBe(base.flagship.nextPlayerId + 5);
    expect(checkInvariants(founded, world)).toEqual([]);
  });

  it("never touch the world's or the flagship's random sequence, and repeat exactly", () => {
    expect(founded.rng).toEqual(base.rng);
    expect(founded.flagship.rng).toEqual(base.flagship.rng);
    const again = updateStandouts(withLeagues(base, { ...leagues, brazil: "elite" }), world);
    expect(again.standouts).toEqual(founded.standouts);
    // Nothing happens within a season once every place is filled.
    expect(updateStandouts(founded, world).standouts.players).toEqual(founded.standouts.players);
  });

  it("age with the flagship's seasons, retire after a final season and bring on a young replacement", () => {
    const leaving = founded.standouts.players[0];
    if (!leaving) throw new Error("no standout");
    const announced: GameState = {
      ...founded,
      standouts: {
        ...founded.standouts,
        players: founded.standouts.players.map((player) =>
          player.id === leaving.id ? { ...player, finalSeason: true } : player,
        ),
      },
    };
    const aged = updateStandouts(nextSeason(announced), world);
    expect(aged.standouts.season).toBe(announced.flagship.season + 1);
    expect(aged.standouts.players.some((player) => player.id === leaving.id)).toBe(false);
    expect(namesIn(aged, leaving.countryId)).toHaveLength(
      namesIn(founded, leaving.countryId).length,
    );
    const rookie = aged.standouts.players.find(
      (player) => player.id >= founded.flagship.nextPlayerId,
    );
    const { age } = world.config.flagship.players.replacement;
    const rookieAge = aged.flagship.season - (rookie?.birthSeason ?? 0);
    expect(rookieAge).toBeGreaterThanOrEqual(age.min);
    expect(rookieAge).toBeLessThanOrEqual(age.max);
    expect(checkInvariants(aged, world)).toEqual([]);

    // Left alone, everyone retires by the last age and the places stay filled.
    let state = founded;
    const { lastAge } = world.config.flagship.players.finalSeason;
    for (let year = 0; year < lastAge; year += 1) state = updateStandouts(nextSeason(state), world);
    expect(state.standouts.players).toHaveLength(5);
    const first = new Set(founded.standouts.players.map((player) => player.id));
    expect(state.standouts.players.some((player) => first.has(player.id))).toBe(false);
    for (const player of state.standouts.players)
      expect(state.flagship.season - player.birthSeason).toBeLessThanOrEqual(lastAge);
  });

  it("are lost when a league folds or drops below Professional, the weakest first at a step down", () => {
    const best = [...namesIn(founded, "germany")].sort((a, b) => b.skill - a.skill).slice(0, 2);
    const fallen = updateStandouts(
      withLeagues(founded, { japan: null, germany: "professional" }),
      world,
    );
    expect(namesIn(fallen, "japan")).toHaveLength(0);
    expect(
      namesIn(fallen, "germany")
        .map((player) => player.id)
        .sort(),
    ).toEqual(best.map((player) => player.id).sort());
  });

  it("name a Player of the Year each season once other leagues have standouts", () => {
    const still = withConfig(world, (config) => {
      config.standouts.playerOfYear.form = 0;
    });
    let played = createCampaign(world, setupFor(7, "brazil"));
    while (!played.flagship.offseason) played = endTurn(played, world);
    // No standouts anywhere: no award for the first season.
    expect(played.standouts.playersOfYear).toEqual([]);
    const first = played.flagship.seasons[0];
    if (!first) throw new Error("no season");
    const withStandouts = updateStandouts(withLeagues(played, leagues), still);
    // A second season, told as the first was.
    const second: GameState = {
      ...withStandouts,
      flagship: {
        ...withStandouts.flagship,
        season: 3,
        seasons: [first, { ...first, season: 2 }],
      },
    };
    const { tierWeight, flagshipWeight } = still.config.standouts.playerOfYear;
    const rated = second.standouts.players
      .map((player) => ({
        id: player.id,
        rating: player.skill * tierWeight[leagues[player.countryId as "japan" | "germany"]],
      }))
      .sort((a, b) => b.rating - a.rating);
    const home = second.flagship.players.find((player) => player.id === first.playerOfSeason);
    const homeRating = (home?.skill ?? 0) * tierWeight.amateur * flagshipWeight;
    const awarded = updateStandouts(second, still);
    expect(awarded.standouts.playersOfYear).toHaveLength(1);
    const winner = awarded.standouts.playersOfYear[0];
    expect(winner?.season).toBe(2);
    if ((rated[0]?.rating ?? 0) > homeRating) {
      expect(winner?.playerId).toBe(rated[0]?.id);
      expect(winner?.clubId).toBeNull();
    } else {
      expect(winner?.playerId).toBe(home?.id);
      expect(winner?.clubId).not.toBeNull();
    }
    expect(snapshot(awarded, still).playersOfYear).toEqual(awarded.standouts.playersOfYear);
    expect(deserializeSave(serializeSave(awarded), still).standouts).toEqual(awarded.standouts);
    // The flagship's own winner takes it when the standouts are weak.
    const weak: GameState = {
      ...second,
      standouts: {
        ...second.standouts,
        players: second.standouts.players.map((player) => ({ ...player, skill: 1 })),
      },
    };
    expect(updateStandouts(weak, still).standouts.playersOfYear[0]?.playerId).toBe(home?.id);
  });

  it("are named on the country, best first, without their skill, and survive a save", () => {
    const germany = snapshot(founded, world).countries[countryIndex(world, "germany")];
    const expected = [...namesIn(founded, "germany")].sort((a, b) => b.skill - a.skill);
    expect(germany?.standouts.map((player) => player.name)).toEqual(
      expected.map((player) => player.name),
    );
    expect(Object.keys(germany?.standouts[0] ?? {}).sort()).toEqual(
      ["age", "birthplace", "finalSeason", "name", "playerId"].sort(),
    );
    expect(deserializeSave(serializeSave(founded), world).standouts).toEqual(founded.standouts);
  });
});
