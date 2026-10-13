import { describe, expect, it } from "vitest";
import {
  championshipFactors,
  checkInvariants,
  createCampaign,
  deserializeSave,
  endTurn,
  flops,
  type GameState,
  type LeagueTierId,
  nationalTeams,
  newLeague,
  PLAYER_INDEX,
  roundsWon,
  runningCostPerQuarter,
  serializeSave,
  snapshot,
  underdogs,
  type World,
  yearOfQuarter,
} from "../src/sim";
import { setupFor, withConfig, world } from "./helpers";

// The World Championship's tournament, effects and cards (GDD v1.37, tech plan 2.23 step 6).

const rules = world.config.worldChampionship;
const TIERS: LeagueTierId[] = ["elite", "professional", "semi-pro", "semi-pro"];

/**
 * A campaign in its first offseason with a founded championship due after the coming season:
 * sixteen countries besides the seat have leagues (four Elite, four Professional, eight
 * Semi-Pro) and casual fans, and `host` picks which seed hosts.
 */
function dueTournament(host: (teams: string[]) => string): { state: GameState; field: string[] } {
  let state = createCampaign(world, setupFor(7, "brazil"));
  while (!state.flagship.offseason) state = endTurn(state, world);
  let placed = 0;
  state = {
    ...state,
    countries: state.countries.map((country, index) => {
      if (country.countryId === state.flagship.countryId || placed >= 16) return country;
      const tier = TIERS[Math.floor(placed / 4)] ?? "semi-pro";
      placed += 1;
      return {
        ...country,
        fans: country.fans.map((fans, sport) =>
          sport === PLAYER_INDEX ? { ...fans, casual: 1000 } : fans,
        ),
        league: { ...newLeague(world, index, state.quarter, 0, []), tier, cash: 1e12 },
      };
    }),
  };
  const field = nationalTeams(state, world).map((team) => team.countryId);
  return {
    field,
    state: {
      ...state,
      worldChampionship: {
        ...state.worldChampionship,
        founded: {
          name: "The World Cup",
          turn: state.turn,
          year: yearOfQuarter(state.quarter, world.config),
        },
        nextSeason: state.flagship.season,
        hostId: host(field),
      },
    },
  };
}

function playUntilTournament(state: GameState, w: World): GameState {
  let next = state;
  while (next.worldChampionship.tournaments.length === 0) next = endTurn(next, w);
  return next;
}

describe("a World Championship tournament", () => {
  const due = dueTournament((teams) => teams[5] ?? "");
  const played = playUntilTournament(due.state, world);
  const tournament = played.worldChampionship.tournaments[0];
  if (!tournament) throw new Error("no tournament");

  it("is a seeded knockout of the sixteen strongest teams, kept whole", () => {
    expect(tournament.season).toBe(due.state.flagship.season);
    expect(tournament.teams.map((team) => team.seed)).toEqual(
      Array.from({ length: 16 }, (_, i) => i + 1),
    );
    expect(tournament.teams.map((team) => team.countryId).sort()).toEqual([...due.field].sort());
    expect(tournament.rounds.map((round) => round.length)).toEqual([8, 4, 2, 1]);
    // 1 meets 16, 2 meets 15: the top two seeds can only meet in the final.
    const seedOf = (id: string) => tournament.teams.find((t) => t.countryId === id)?.seed ?? 0;
    for (const match of tournament.rounds[0] ?? [])
      expect(seedOf(match.a) + seedOf(match.b)).toBe(17);
    expect(tournament.rounds.at(-1)?.[0]?.winner).toBe(tournament.championId);
    expect(roundsWon(tournament, tournament.championId)).toBe(4);
    expect(played.landmarks.find((l) => l.kind === "championshipPlayed")).toMatchObject({
      countryId: tournament.championId,
      season: tournament.season,
      hostId: tournament.hostId,
    });
    expect(played.worldChampionship.nextSeason).toBe(tournament.season + rules.everySeasons);
    expect(played.worldChampionship.hostId).toBeNull();
    expect(checkInvariants(played, world)).toEqual([]);
    expect(deserializeSave(serializeSave(played), world).worldChampionship).toEqual(
      played.worldChampionship,
    );
    // The same campaign plays the same tournament.
    expect(playUntilTournament(due.state, world).worldChampionship.tournaments[0]).toEqual(
      tournament,
    );
  });

  it("lifts the sport where its teams came from, more the further they went, for a year", () => {
    const lifts = played.worldChampionship.lifts;
    expect(lifts.map((lift) => lift.countryId).sort()).toEqual([...due.field].sort());
    const surprise = new Set(underdogs(tournament, world));
    for (const lift of lifts) {
      const won = roundsWon(tournament, lift.countryId);
      expect(lift.casual).toBeCloseTo(
        1 +
          rules.casualPerRound * (won + 1) +
          (lift.countryId === tournament.championId ? rules.championBonus : 0) +
          (surprise.has(lift.countryId) ? rules.underdog.bonus : 0),
      );
      expect(lift.hardcore).toBe(lift.countryId === tournament.hostId ? rules.hostHardcore : 1);
      expect(lift.endQuarter).toBe(played.quarter + rules.liftQuarters);
    }
    const champion = championshipFactors(played, tournament.championId);
    expect(champion.casual).toBeGreaterThan(1 + rules.casualPerRound * 4);
    expect(championshipFactors(played, "brazil")).toEqual({ casual: 1, hardcore: 1 });
    // A year on, the lifts are gone.
    let later = played;
    while (later.quarter < played.quarter + rules.liftQuarters) later = endTurn(later, world);
    expect(later.worldChampionship.lifts).toEqual([]);
    expect(championshipFactors(later, tournament.championId)).toEqual({ casual: 1, hardcore: 1 });
  });

  it("tells the champion as a headline from the champion's country", () => {
    const view = snapshot(played, world);
    const card = view.events.find((event) => event.templateId === "championship-champion");
    expect(card?.countryId).toBe(tournament.championId);
    expect(card?.weight).toBe("headline");
    expect(card?.facts.championship).toMatchObject({
      season: tournament.season,
      number: 1,
      hostId: tournament.hostId,
      roundsWon: 4,
      rounds: 4,
      champion: true,
    });
    const final = tournament.rounds.at(-1)?.[0];
    const beaten = final?.a === tournament.championId ? final?.b : final?.a;
    expect(card?.facts.championship?.opponentId).toBe(beaten);
    // Brazil's Amateur league fields no team, so there is no seat story.
    expect(view.events.some((event) => event.templateId === "championship-seat-run")).toBe(false);
    expect(view.worldChampionship.tournaments).toEqual([
      {
        season: tournament.season,
        year: tournament.year,
        hostId: tournament.hostId,
        championId: tournament.championId,
      },
    ]);
  });

  it("goes to the favorites when upsets are impossible", () => {
    const sure = withConfig(world, (config) => {
      config.worldChampionship.upsetScale = 0.001;
      config.worldChampionship.hostBonus = 0;
    });
    const result = playUntilTournament(due.state, sure).worldChampionship.tournaments[0];
    if (!result) throw new Error("no tournament");
    const seedOf = (id: string) => result.teams.find((t) => t.countryId === id)?.seed ?? 0;
    for (const match of result.rounds.flat())
      expect(seedOf(match.winner)).toBe(Math.min(seedOf(match.a), seedOf(match.b)));
    expect(seedOf(result.championId)).toBe(1);
    expect(flops(result, sure)).toEqual([]);
    expect(underdogs(result, sure)).toEqual([]);
  });

  it("makes a weak host an underdog, pays its league, and costs a flopped top seed casual fans", () => {
    // The sixteenth seed hosts and cannot lose at home: it meets the top seed first.
    const rigged = withConfig(world, (config) => {
      config.worldChampionship.upsetScale = 0.001;
      config.worldChampionship.hostBonus = 1000;
      // Every first-round loser counts as a flop, whichever seed the host draws.
      config.worldChampionship.topSeeds = 16;
    });
    const home = dueTournament((teams) => teams[15] ?? "");
    const before = home.state;
    const after = playUntilTournament(before, rigged);
    const result = after.worldChampionship.tournaments[0];
    if (!result) throw new Error("no tournament");
    const hostId = result.hostId;
    const opening = result.rounds[0]?.find((match) => match.winner === hostId);
    const top = (opening?.a === hostId ? opening?.b : opening?.a) ?? "";
    expect(result.championId).toBe(hostId);
    expect(underdogs(result, rigged)).toContain(hostId);
    expect(flops(result, rigged)).toContain(top);
    expect(flops(result, rigged)).toHaveLength(8);
    const lift = after.worldChampionship.lifts.find((entry) => entry.countryId === hostId);
    expect(lift?.casual).toBeCloseTo(
      1 +
        rigged.config.worldChampionship.casualPerRound * 5 +
        rules.championBonus +
        rules.underdog.bonus,
    );
    expect(lift?.hardcore).toBe(rules.hostHardcore);
    // The tournament lands in the turn the season ends: compare with the same turn unplayed.
    const unfounded: GameState = {
      ...before,
      worldChampionship: {
        ...before.worldChampionship,
        founded: null,
        nextSeason: null,
        hostId: null,
      },
    };
    let plain = unfounded;
    while (plain.turn < after.turn) plain = endTurn(plain, rigged);
    const at = (state: GameState, id: string) => {
      const index = state.countries.findIndex((country) => country.countryId === id);
      return { index, country: state.countries[index] };
    };
    const hosted = at(after, hostId);
    const unhosted = at(plain, hostId);
    const cost = runningCostPerQuarter(
      rigged,
      hosted.index,
      hosted.country?.league?.tier ?? "semi-pro",
      after.growthNodes,
    );
    expect((hosted.country?.league?.cash ?? 0) - (unhosted.country?.league?.cash ?? 0)).toBeCloseTo(
      rules.hostCashQuarters * cost,
      0,
    );
    const casual = (state: GameState, id: string) =>
      at(state, id).country?.fans[PLAYER_INDEX]?.casual ?? 0;
    expect(casual(after, top) / casual(plain, top)).toBeCloseTo(1 - rules.flopCasualLoss, 2);
    expect(Number.isInteger(casual(after, top))).toBe(true);
    expect(checkInvariants(after, rigged)).toEqual([]);
  });
});
