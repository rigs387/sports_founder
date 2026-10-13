import { describe, expect, it } from "vitest";
import {
  activeClubs,
  checkInvariants,
  createCampaign,
  deserializeSave,
  finalSeasonChance,
  type GameState,
  type Player,
  runTurns,
  seatStars,
  serializeSave,
  starStrength,
  stepQuarter,
  type World,
} from "../src/sim";
import {
  awardless,
  cardless,
  crowdless,
  migratedChampionship,
  migratedCulture,
  migratedHall,
  migratedLegacy,
  migratedStandouts,
  setupFor,
  venueless,
  withConfig,
  world,
} from "./helpers";

// Stars and careers (GDD v1.16, tech plan 2.6 step 4).

const start = (base: World = world, seed = 11) => createCampaign(base, setupFor(seed, "brazil"));

function playSeasons(state: GameState, seasons: number, base: World = world): GameState {
  let current = state;
  while (current.flagship.seasons.length < seasons) {
    current = stepQuarter(current, base);
    expect(checkInvariants(current, base)).toEqual([]);
  }
  return current;
}

/** Every score to the leading player: every season's top scorer clears the star bar. */
const allToStars = (moveChance = 0) =>
  withConfig(world, (config) => {
    config.flagship.players.credit = { base: 1, perSkill: 0, pivot: 50, min: 1, max: 1 };
    config.flagship.stars.moveChance = moveChance;
  });

describe("stars", () => {
  it("makes standout seasons stars, standouts first, several a season while places are open", () => {
    const content = allToStars();
    const state = playSeasons(start(content), 6, content);
    const [first] = state.flagship.seasons;
    const places = content.config.flagship.stars.places.amateur;
    // Every leading player carries their club: the places fill in the first season.
    expect(first?.newStarIds).toHaveLength(places);
    const standouts = [first?.playerOfSeason, first?.topScorer?.playerId];
    expect(standouts).toContain(first?.newStarIds[0]);
    expect(state.landmarks.filter((l) => l.kind === "firstStar")).toEqual([
      expect.objectContaining({ season: 1, playerId: first?.newStarIds[0] }),
    ]);
    expect(seatStars(state.flagship).length).toBeLessThanOrEqual(places);
  });

  it("makes only the standouts stars when no club leader reaches the club share", () => {
    const content = withConfig(world, (config) => {
      config.flagship.stars.clubShare = { low: 1.01, medium: 1.01, high: 1.01 };
    });
    const state = playSeasons(start(content), 4, content);
    for (const summary of state.flagship.seasons)
      for (const id of summary.newStarIds)
        expect([summary.playerOfSeason, summary.topScorer?.playerId]).toContain(id);
  });

  it("makes no star when no place is open", () => {
    const content = withConfig(world, (config) => {
      config.flagship.stars.places = { amateur: 0, "semi-pro": 0, professional: 0, elite: 0 };
    });
    const state = playSeasons(start(content), 4, content);
    expect(state.flagship.players.every((p) => p.starSince === null)).toBe(true);
    expect(state.flagship.seasons.every((s) => s.newStarIds.length === 0)).toBe(true);
  });

  it("adds strength to a star's club only", () => {
    const state = playSeasons(start(allToStars()), 1, allToStars());
    const star = seatStars(state.flagship)[0];
    if (!star) throw new Error("No star");
    const { strengthPerSkill } = world.config.flagship.stars;
    expect(starStrength(state.flagship, star.clubId, world)).toBeCloseTo(
      strengthPerSkill * star.skill,
    );
    const other = activeClubs(state.flagship).find((club) => club.id !== star.clubId);
    expect(starStrength(state.flagship, other?.id ?? 0, world)).toBe(0);
  });

  it("moves a star up to a stronger club; the clubs swap leading players", () => {
    const content = allToStars(1);
    const state = playSeasons(start(content), 4, content);
    const moves = state.landmarks.filter((l) => l.kind === "starMoved");
    expect(moves.length).toBeGreaterThan(0);
    for (const move of moves) {
      if (move.kind !== "starMoved") continue;
      const ratings = state.flagship.seasons.find((s) => s.season === move.season)?.startRatings;
      const rating = (id: number) => ratings?.find((r) => r.clubId === id)?.rating ?? 0;
      expect(rating(move.to)).toBeGreaterThan(rating(move.from));
    }
  });
});

describe("careers", () => {
  it("announces a final season from 31 and retires everyone by the last age", () => {
    const { fromAge, lastAge } = world.config.flagship.players.finalSeason;
    const player = { peakSkill: 60, skill: 60 } as Player;
    expect(finalSeasonChance(player, fromAge - 1, world)).toBe(0);
    expect(finalSeasonChance(player, fromAge + 2, world)).toBeGreaterThan(
      finalSeasonChance(player, fromAge, world),
    );
    expect(finalSeasonChance({ ...player, skill: 40 }, fromAge, world)).toBeGreaterThan(
      finalSeasonChance(player, fromAge, world),
    );
    expect(finalSeasonChance(player, lastAge, world)).toBe(1);
  });

  it("retires players after a final season and replaces them with young players at the club", () => {
    // Stars stay put, so a retired player's club is still theirs when the replacement arrives.
    const content = withConfig(world, (config) => {
      config.flagship.stars.moveChance = 0;
    });
    const state = playSeasons(start(content), 12, content);
    const { players } = state.flagship;
    const retired = players.filter((p) => p.retiredSeason !== null);
    expect(retired.length).toBeGreaterThan(0);
    const { lastAge } = world.config.flagship.players.finalSeason;
    const young = world.config.flagship.players.replacement.age;
    for (const player of retired) {
      const season = player.retiredSeason ?? 0;
      expect(season - player.birthSeason).toBeLessThanOrEqual(lastAge);
      expect(player.career.at(-1)?.season).toBe(season);
      const next = players.find((p) => p.clubId === player.clubId && p.id > player.id);
      if (!next) continue;
      const age = season + 1 - next.birthSeason;
      expect(age).toBeGreaterThanOrEqual(young.min);
      expect(age).toBeLessThanOrEqual(young.max);
    }
    const playing = players.filter((p) => p.retiredSeason === null);
    expect(playing.map((p) => p.clubId).sort()).toEqual(
      activeClubs(state.flagship)
        .map((c) => c.id)
        .sort(),
    );
  });

  it("never touches the world: the world's dice and fans match with stronger stars", () => {
    const strong = withConfig(world, (config) => {
      config.flagship.stars.strengthPerSkill = 1;
    });
    const a = runTurns(start(world, 5), cardless(world), 30);
    const b = runTurns(start(strong, 5), cardless(strong), 30);
    expect(b.flagship.seasons).not.toStrictEqual(a.flagship.seasons);
    expect(b.rng).toStrictEqual(a.rng);
    expect(b.countries).toStrictEqual(a.countries);
  });
});

describe("save format 13", () => {
  it("migrates a version 12 save: no stars, no final seasons, nobody retired", () => {
    // After one season nobody has retired yet, as in any real version 12 save.
    const played = playSeasons(start(), 1);
    expect(played.flagship.players.every((p) => p.retiredSeason === null)).toBe(true);
    const plain = played.flagship.players.map((p) => ({
      ...p,
      starSince: null,
      finalSeason: false,
      retiredSeason: null,
    }));
    const v12 = {
      ...played,
      flagship: {
        ...played.flagship,
        players: plain.map(({ starSince: _s, finalSeason: _f, retiredSeason: _r, ...p }) => p),
        seasons: played.flagship.seasons.map(({ newStarIds: _n, ...s }) => s),
      },
    };
    const loaded = deserializeSave(JSON.stringify({ formatVersion: 12, state: v12 }), world);
    const expected: GameState = {
      ...played,
      countries: venueless(played),
      flagship: {
        ...played.flagship,
        players: plain,
        seasons: crowdless(played.flagship.seasons).map((s) => ({ ...s, newStarIds: [] })),
      },
      culture: migratedCulture(played),
      hallOfFame: migratedHall(played),
      standouts: migratedStandouts(played),
      worldChampionship: migratedChampionship(played),
      legacy: migratedLegacy(),
    };
    expect(serializeSave(loaded)).toBe(serializeSave(awardless(expected)));
  });
});
