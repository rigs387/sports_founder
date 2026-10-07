import { describe, expect, it } from "vitest";
import {
  activeClubs,
  applyAction,
  checkAction,
  checkInvariants,
  closeOffseason,
  createCampaign,
  deserializeSave,
  endTurn,
  type GameState,
  type LeagueTierId,
  matchWinner,
  newLeague,
  offseasonOpen,
  PLAYER_INDEX,
  quartersUntilSeasonEnd,
  rankTable,
  roundPairs,
  runTurns,
  serializeSave,
  stepQuarter,
  totalRounds,
} from "../src/sim";
import { cardless, countryIndex, setupFor, venueless, withConfig, world } from "./helpers";

const start = (format: "european" | "american" = "european", anchor = "brazil", seed = 11) =>
  createCampaign(world, { ...setupFor(seed, anchor), seasonFormat: format });

/** Plays quarters directly until `seasons` seasons have finished. */
function playSeasons(state: GameState, seasons: number): GameState {
  let current = state;
  while (current.flagship.seasons.length < seasons) current = stepQuarter(current, world);
  return current;
}

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

/** Advances quarter by quarter (no turn) until the season ends and the offseason opens. */
function toWindow(state: GameState): GameState {
  let current = state;
  while (!offseasonOpen(current)) current = stepQuarter(current, world);
  return current;
}

const withoutSeasonCards = cardless(world);

describe("the flagship at campaign start", () => {
  it("seats the anchor with eight clubs in real places of the anchor and distinct nicknames", () => {
    const state = start();
    const clubs = activeClubs(state.flagship);
    expect(state.flagship.countryId).toBe("brazil");
    expect(clubs).toHaveLength(world.config.flagship.clubs.amateur);
    const places = new Set(world.places.brazil?.map((place) => place.name));
    for (const club of clubs) expect(places.has(club.place)).toBe(true);
    expect(new Set(clubs.map((club) => club.nickname)).size).toBe(clubs.length);
    expect(state.flagship.table.map((row) => row.clubId)).toEqual(clubs.map((club) => club.id));
    expect(checkInvariants(state, world)).toEqual([]);
  });

  it("gives different markets different clubs for the same seed", () => {
    const a = activeClubs(start("european", "brazil").flagship).map((c) => c.nickname);
    const b = activeClubs(start("european", "england").flagship).map((c) => c.nickname);
    expect(a).not.toEqual(b);
  });

  it("is a season that runs to the offseason's quarter", () => {
    const end = world.config.offseason.seasonEndQuarter - 1;
    for (let quarter = 0; quarter < 8; quarter += 1) {
      const length = quartersUntilSeasonEnd(quarter, world);
      expect((quarter + length - 1) % 4).toBe(end);
      expect(length).toBeGreaterThanOrEqual(1);
      expect(length).toBeLessThanOrEqual(4);
    }
  });
});

describe("the schedule", () => {
  it("pairs every club with every other club home and away exactly once each", () => {
    for (const n of [8, 12, 9]) {
      const ids = Array.from({ length: n }, (_, i) => i + 1);
      const seen = new Map<string, number>();
      for (let round = 0; round < totalRounds(n); round += 1) {
        const pairs = roundPairs(ids, round);
        const playing = pairs.flat();
        expect(new Set(playing).size).toBe(playing.length);
        for (const [home, away] of pairs) {
          seen.set(`${home}-${away}`, (seen.get(`${home}-${away}`) ?? 0) + 1);
        }
      }
      expect(seen.size).toBe(n * (n - 1));
      expect([...seen.values()].every((count) => count === 1)).toBe(true);
    }
  });
});

describe("a season", () => {
  it("plays every round and crowns the top of the table in the European format", () => {
    const state = playSeasons(start("european"), 3);
    const rounds = totalRounds(world.config.flagship.clubs.amateur);
    for (const summary of state.flagship.seasons) {
      expect(summary.standings.every((row) => row.played === rounds)).toBe(true);
      expect(summary.championId).toBe(summary.standings[0]?.clubId);
      expect(summary.runnerUpId).toBe(summary.standings[1]?.clubId);
      expect(summary.playoffs).toEqual([]);
      expect(rankTable(summary.standings)).toEqual(summary.standings);
    }
    const champions = state.landmarks.filter((l) => l.kind === "seasonChampion");
    expect(champions).toHaveLength(3);
    expect(checkInvariants(state, world)).toEqual([]);
  });

  it("settles the American format in single-match playoffs", () => {
    const state = playSeasons(start("american"), 4);
    for (const summary of state.flagship.seasons) {
      // Eight clubs: a four-club field, so two semi-finals and a final.
      expect(summary.playoffs).toHaveLength(3);
      const final = summary.playoffs.at(-1);
      if (!final) throw new Error("No final");
      expect(matchWinner(final)).toBe(summary.championId);
      expect([final.homeId, final.awayId]).toContain(summary.runnerUpId);
      const field = summary.standings.slice(0, 4).map((row) => row.clubId);
      for (const match of summary.playoffs) {
        expect(field).toContain(match.homeId);
        expect(field).toContain(match.awayId);
        expect(matchWinner(match)).not.toBeNull();
      }
    }
  });

  it("never touches the world: fans, rivals and the world's dice match in both formats", () => {
    // Season cards (GDD v1.15) are how results reach fans; without them the matches alone
    // must leave the world exactly as it was.
    const european = runTurns(start("european"), withoutSeasonCards, 40);
    const american = runTurns(start("american"), withoutSeasonCards, 40);
    expect(american.countries).toStrictEqual(european.countries);
    expect(american.rng).toStrictEqual(european.rng);
    expect(american.flagship.seasons.length).toBe(european.flagship.seasons.length);
  });

  it("is deterministic and resumes identically from a save", () => {
    const played = runTurns(start("american"), world, 30);
    const loaded = deserializeSave(serializeSave(played), world);
    expect(loaded).toStrictEqual(played);
    expect(runTurns(loaded, world, 10)).toStrictEqual(runTurns(played, world, 10));
  });

  it("grows the league with its tier: expansion clubs join at the next season", () => {
    const promoted = withLeague(start(), "brazil", "semi-pro");
    // Expansion clubs join when the offseason closes (GDD v1.24).
    const state = closeOffseason(playSeasons(promoted, 1), world);
    const clubs = activeClubs(state.flagship);
    expect(clubs).toHaveLength(world.config.flagship.clubs["semi-pro"]);
    expect(state.flagship.table).toHaveLength(clubs.length);
    const places = new Set(world.places.brazil?.map((place) => place.name));
    for (const club of clubs) expect(places.has(club.place)).toBe(true);
    expect(clubs.filter((club) => club.firstSeason === 2)).toHaveLength(4);
    expect(checkInvariants(state, world)).toEqual([]);
  });

  it("drifts ratings toward the league's financial health", () => {
    const pulled = withConfig(world, (config) => {
      config.flagship.rating.drift = 0;
      config.flagship.rating.healthTarget.healthy = 90;
    });
    let state = createCampaign(pulled, setupFor(5, "brazil"));
    const before = activeClubs(state.flagship).reduce((sum, c) => sum + c.rating, 0);
    while (state.flagship.seasons.length < 2) state = stepQuarter(state, pulled);
    const after = activeClubs(state.flagship).reduce((sum, c) => sum + c.rating, 0);
    expect(after).toBeGreaterThan(before);
  });
});

describe("the commissioner's seat", () => {
  it("moves only in the offseason, only to a Professional or Elite league", () => {
    let state = withLeague(start(), "argentina", "professional");
    state = withLeague(state, "uruguay", "semi-pro");
    state = closeOffseason(state, world);
    expect(checkAction(state, world, { type: "moveSeat", countryId: "argentina" })).toMatch(
      /offseason/,
    );
    state = toWindow(state);
    expect(checkAction(state, world, { type: "moveSeat", countryId: "uruguay" })).toMatch(
      /Professional or Elite/,
    );
    expect(checkAction(state, world, { type: "moveSeat", countryId: "chile" })).toMatch(
      /no league/,
    );
    expect(checkAction(state, world, { type: "moveSeat", countryId: "brazil" })).toMatch(
      /already there/,
    );
    expect(checkAction(state, world, { type: "moveSeat", countryId: "argentina" })).toBeNull();
  });

  it("moves when the offseason closes, with the purist cost at the anchor it leaves", () => {
    const window = toWindow(withLeague(start(), "argentina", "professional"));
    const state = applyAction(window, world, { type: "moveSeat", countryId: "argentina" });
    expect(state.flagship.pendingCountryId).toBe("argentina");
    const brazil = countryIndex(world, "brazil");
    // The move happens as the offseason closes, before the turn's quarters: the cost is a share
    // of the hardcore fans the anchor had then.
    const stayed = window.countries[brazil]?.fans[PLAYER_INDEX]?.hardcore ?? 0;
    const closed = closeOffseason(state, world);
    const seasonsBefore = state.flagship.seasons.length;
    const after = endTurn(state, world);
    // The season ended before the offseason opened; the next one is played at the new seat.
    expect(after.flagship.seasons.length).toBe(seasonsBefore);
    expect(after.flagship.seasons.at(-1)?.countryId).toBe("brazil");
    expect(after.flagship.offseason).toBe(false);
    expect(after.flagship.quartersPlayed).toBe(1);
    expect(after.flagship.countryId).toBe("argentina");
    expect(after.flagship.pendingCountryId).toBeNull();
    const clubs = activeClubs(after.flagship);
    expect(clubs).toHaveLength(world.config.flagship.clubs.professional);
    expect(clubs.every((club) => club.countryId === "argentina")).toBe(true);
    const share = world.config.flagship.seatMove.anchorHardcoreDemotionShare;
    const lost = stayed - (closed.countries[brazil]?.fans[PLAYER_INDEX]?.hardcore ?? 0);
    expect(lost).toBeGreaterThan(0);
    expect(Math.abs(lost - stayed * share)).toBeLessThanOrEqual(1);
    expect(after.landmarks).toContainEqual(
      expect.objectContaining({ kind: "seatMoved", from: "brazil", countryId: "argentina" }),
    );
    expect(checkInvariants(after, world)).toEqual([]);
  });

  it("can cancel a requested move before the offseason closes", () => {
    let state = toWindow(withLeague(start(), "argentina", "professional"));
    state = applyAction(state, world, { type: "moveSeat", countryId: "argentina" });
    state = applyAction(state, world, { type: "moveSeat", countryId: "brazil" });
    expect(state.flagship.pendingCountryId).toBeNull();
    expect(endTurn(state, world).flagship.countryId).toBe("brazil");
  });

  it("returns home for free when a flagship abroad folds, and the old clubs come back", () => {
    let state = toWindow(withLeague(start(), "argentina", "professional"));
    const homeClubs = activeClubs(state.flagship).map((club) => club.id);
    state = endTurn(applyAction(state, world, { type: "moveSeat", countryId: "argentina" }), world);
    expect(state.flagship.countryId).toBe("argentina");
    // The Argentine league runs dry and collapses.
    const argentina = countryIndex(world, "argentina");
    const brazil = countryIndex(world, "brazil");
    for (let turn = 0; turn < 40 && state.flagship.countryId === "argentina"; turn += 1) {
      const countries = [...state.countries];
      const country = countries[argentina];
      if (country?.league)
        countries[argentina] = { ...country, league: { ...country.league, cash: -1 } };
      state = { ...state, countries };
      const hardcore = state.countries[brazil]?.fans[PLAYER_INDEX]?.hardcore ?? 0;
      state = endTurn(state, world);
      if (state.flagship.countryId === "brazil") {
        // Free: the anchor's hardcore moved only by the simulation, not by a purist cost.
        expect(state.landmarks.at(-1)).toMatchObject({ kind: "seatMoved", reason: "returned" });
        expect(hardcore).toBeGreaterThan(0);
      }
    }
    expect(state.flagship.countryId).toBe("brazil");
    expect(activeClubs(state.flagship).map((club) => club.id)).toEqual(homeClubs);
    expect(checkInvariants(state, world)).toEqual([]);
  });
});

describe("saves before the flagship", () => {
  it("migrates a version 7 save: the anchor holds the seat with a season starting now", () => {
    // A version 7 campaign never saw a season card.
    const played = runTurns(start(), withoutSeasonCards, 12);
    const { seasonFormat: _s, flagship: _f, ...v7State } = played;
    const loaded = deserializeSave(JSON.stringify({ formatVersion: 7, state: v7State }), world);
    expect(loaded.seasonFormat).toBe("european");
    expect(loaded.flagship.countryId).toBe(played.anchorCountryId);
    expect(loaded.flagship.seasons).toEqual([]);
    expect(loaded.countries).toStrictEqual(venueless(played));
    expect(checkInvariants(runTurns(loaded, world, 8), world)).toEqual([]);
  });
});
