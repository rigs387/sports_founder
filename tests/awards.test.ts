import { describe, expect, it } from "vitest";
import {
  createCampaign,
  deserializeSave,
  endTurn,
  type GameState,
  hallPoints,
  inducteeFacts,
  type PlayerTally,
  playerOfSeason,
  serializeSave,
} from "../src/sim";
import { awardless, setupFor, world } from "./helpers";

// Awards (GDD v1.33, tech plan 2.20).

const tally = (
  playerId: number,
  scores: number,
  extra: Partial<PlayerTally> = {},
): PlayerTally => ({
  playerId,
  matches: 10,
  scores,
  playoffScores: 0,
  finalScores: 0,
  ...extra,
});

/** Brazil's campaign played until its first flagship season has ended. */
function afterFirstSeason(): GameState {
  let state = createCampaign(world, setupFor(5, "brazil"));
  while (state.flagship.seasons.length === 0) state = endTurn(state, world);
  return state;
}

describe("Player of the Season", () => {
  const state = createCampaign(world, setupFor(5, "brazil"));
  const [a, b, c] = state.flagship.players;
  if (!a || !b || !c) throw new Error("No players");
  const { champion, runnerUp, score, finalScore } = world.config.awards;

  it("weighs scores, the club's finish and final scores, not scores alone", () => {
    // The top scorer plays for a mid-table club; the champion's leader scored less.
    const tallies = [tally(a.id, 20), tally(b.id, 20 - champion / score + 1)];
    expect(playerOfSeason(state.flagship, tallies, b.clubId, c.clubId, world)).toBe(b.id);
    // A final settles it the other way when it is worth more than the finish.
    const finals = [tally(a.id, 20, { playoffScores: 6, finalScores: 6 }), tally(b.id, 12)];
    expect(6 * finalScore).toBeGreaterThan(champion);
    expect(playerOfSeason(state.flagship, finals, b.clubId, c.clubId, world)).toBe(a.id);
    // A runner-up's player is lifted too.
    expect(
      playerOfSeason(state.flagship, [tally(a.id, 10), tally(c.id, 10)], b.clubId, c.clubId, world),
    ).toBe(runnerUp > 0 ? c.id : a.id);
  });

  it("breaks ties by fewer matches, then the lower id; nobody when nobody played", () => {
    const fewer = [tally(a.id, 10), tally(b.id, 10, { matches: 8 })];
    expect(playerOfSeason(state.flagship, fewer, 0, 0, world)).toBe(b.id);
    const even = [tally(b.id, 10), tally(a.id, 10)];
    expect(playerOfSeason(state.flagship, even, 0, 0, world)).toBe(Math.min(a.id, b.id));
    expect(
      playerOfSeason(state.flagship, [tally(a.id, 0, { matches: 0 })], 0, 0, world),
    ).toBeNull();
  });

  it("is recorded on every tallied season and named on its season facts", () => {
    const played = afterFirstSeason();
    const summary = played.flagship.seasons[0];
    expect(summary?.playerOfSeason).not.toBeNull();
    const winner = played.flagship.players.find((p) => p.id === summary?.playerOfSeason);
    expect(winner?.career.some((line) => line.season === summary?.season)).toBe(true);
    const card = [...played.events.pending, ...played.events.history].find(
      (event) => event.facts.season?.season === summary?.season,
    );
    if (card) expect(card.facts.season?.playerOfSeasonId).toBe(summary?.playerOfSeason);
  });

  it("counts toward the Hall of Fame", () => {
    const played = afterFirstSeason();
    const winner = played.flagship.players.find(
      (p) => p.id === played.flagship.seasons[0]?.playerOfSeason,
    );
    if (!winner) throw new Error("No winner");
    const facts = inducteeFacts(played, winner);
    expect(facts.awards).toBe(1);
    expect(hallPoints(facts, world) - hallPoints({ ...facts, awards: 0 }, world)).toBe(
      world.config.hallOfFame.points.playerOfSeason,
    );
  });

  it("a format 23 save migrates with no winners and no award facts", () => {
    const played = afterFirstSeason();
    const v23 = awardless(played);
    const raw = JSON.parse(JSON.stringify(v23));
    for (const summary of raw.flagship.seasons) delete summary.playerOfSeason;
    for (const list of [raw.events.pending, raw.events.history])
      for (const event of list) if (event.facts.season) delete event.facts.season.playerOfSeasonId;
    for (const inductee of raw.hallOfFame.inductees)
      if (inductee.facts) delete inductee.facts.awards;
    const loaded = deserializeSave(JSON.stringify({ formatVersion: 23, state: raw }), world);
    expect(serializeSave(loaded)).toBe(serializeSave(awardless(played)));
    expect(loaded.flagship.seasons.every((s) => s.playerOfSeason === null)).toBe(true);
  });
});
