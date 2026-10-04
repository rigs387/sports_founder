import { describe, expect, it } from "vitest";
import {
  activeClubs,
  checkInvariants,
  createCampaign,
  creditChance,
  deserializeSave,
  type GameState,
  runTurns,
  serializeSave,
  stepQuarter,
  totalRounds,
  type World,
} from "../src/sim";
import { setupFor, withConfig, world } from "./helpers";

// Credited scores and career lines (GDD v1.16, tech plan 2.6 step 3).

const start = (format: "european" | "american" = "european", base: World = world, seed = 11) =>
  createCampaign(base, { ...setupFor(seed, "brazil"), seasonFormat: format });

function playSeasons(state: GameState, seasons: number, base: World = world): GameState {
  let current = state;
  while (current.flagship.seasons.length < seasons) current = stepQuarter(current, base);
  return current;
}

/** Every score to the leading player (share 1) or none (share 0). */
const creditAll = (share: number) =>
  withConfig(world, (config) => {
    config.flagship.players.credit = {
      base: share,
      perSkill: 0,
      pivot: 50,
      min: share,
      max: share,
    };
  });

describe("credited scores", () => {
  it("credits more of a club's scores to a more skilled leading player", () => {
    const { credit } = world.config.flagship.players;
    expect(creditChance(70, world)).toBeGreaterThan(creditChance(50, world));
    expect(creditChance(50, world)).toBeCloseTo(credit.base);
    expect(creditChance(1000, world)).toBe(credit.max);
    expect(creditChance(-1000, world)).toBe(credit.min);
  });

  it("gives every leading player a career line per season: every match, every score", () => {
    for (const [share, expected] of [
      [1, (scoreFor: number) => scoreFor],
      [0, () => 0],
    ] as const) {
      const content = creditAll(share);
      const state = playSeasons(start("european", content), 2, content);
      const rounds = totalRounds(world.config.flagship.clubs.amateur);
      for (const summary of state.flagship.seasons) {
        for (const row of summary.standings) {
          const line = state.flagship.players
            .flatMap((p) => p.career)
            .find((l) => l.season === summary.season && l.clubId === row.clubId);
          expect(line).toMatchObject({
            clubId: row.clubId,
            matches: rounds,
            scores: expected(row.scoreFor),
            playoffScores: 0,
            finalScores: 0,
          });
        }
      }
      expect(checkInvariants(state, content)).toEqual([]);
    }
  });

  it("counts playoff and final scores in the American format and names the top scorer", () => {
    const content = creditAll(1);
    const state = playSeasons(start("american", content), 3, content);
    const rounds = totalRounds(world.config.flagship.clubs.amateur);
    for (const summary of state.flagship.seasons) {
      const final = summary.playoffs.at(-1);
      if (!final) throw new Error("No final");
      const lines = state.flagship.players.flatMap((player) =>
        player.career.filter((line) => line.season === summary.season),
      );
      for (const line of lines) {
        const playoff = summary.playoffs.filter((m) => [m.homeId, m.awayId].includes(line.clubId));
        const own = (m: (typeof playoff)[number]) =>
          m.homeId === line.clubId ? m.homeScore : m.awayScore;
        expect(line.matches).toBe(rounds + playoff.length);
        expect(line.playoffScores).toBe(playoff.reduce((sum, m) => sum + own(m), 0));
        const inFinal = [final.homeId, final.awayId].includes(line.clubId);
        expect(line.finalScores).toBe(inFinal ? own(final) : 0);
      }
      const best = Math.max(...lines.map((line) => line.scores));
      expect(summary.topScorer?.scores).toBe(best);
      const top = lines.find((line) => line.clubId === summary.topScorer?.clubId);
      expect(top?.scores).toBe(best);
    }
    expect(checkInvariants(state, content)).toEqual([]);
  });

  it("never touches the world: the world's dice and fans match whoever scores", () => {
    const cardless = (base: World) => ({
      ...base,
      events: {
        ...base.events,
        cards: base.events.cards.filter((card) => card.trigger !== "seasonEnd"),
      },
    });
    const a = runTurns(start("european", world, 5), cardless(world), 30);
    const b = runTurns(start("european", creditAll(1), 5), cardless(creditAll(1)), 30);
    expect(b.flagship.players).not.toStrictEqual(a.flagship.players);
    expect(b.rng).toStrictEqual(a.rng);
    expect(b.countries).toStrictEqual(a.countries);
  });
});

describe("save format 12", () => {
  it("migrates a version 11 save: the season under way is never tallied, the next one is", () => {
    let played = playSeasons(start(), 1);
    played = stepQuarter(played, world);
    expect(played.flagship.round).toBeGreaterThan(0);
    const v11 = {
      ...played,
      flagship: {
        ...played.flagship,
        players: played.flagship.players.map(({ career: _c, ...player }) => player),
        tallies: undefined,
        seasons: played.flagship.seasons.map(({ topScorer: _t, ...summary }) => summary),
      },
    };
    const text = JSON.stringify({ formatVersion: 11, state: v11 });
    const loaded = deserializeSave(text, world);
    expect(loaded.flagship.tallies).toBeNull();
    expect(loaded.flagship.players.every((p) => p.career.length === 0)).toBe(true);
    expect(loaded.flagship.seasons.every((s) => s.topScorer === null)).toBe(true);
    expect(serializeSave(deserializeSave(serializeSave(loaded), world))).toBe(
      serializeSave(loaded),
    );
    const untallied = playSeasons(loaded, 2);
    expect(untallied.flagship.seasons.at(-1)?.topScorer).toBeNull();
    expect(untallied.flagship.players.every((p) => p.career.length === 0)).toBe(true);
    const tallied = playSeasons(untallied, 3);
    expect(tallied.flagship.seasons.at(-1)?.topScorer).not.toBeNull();
    const clubs = activeClubs(tallied.flagship).length;
    expect(tallied.flagship.players.filter((p) => p.career.length === 1)).toHaveLength(clubs);
    expect(checkInvariants(tallied, world)).toEqual([]);
  });
});
