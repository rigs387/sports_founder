import { describe, expect, it } from "vitest";
import {
  createCampaign,
  deserializeSave,
  endTurn,
  eventSnapshots,
  type GameState,
  hallPoints,
  hallSnapshot,
  inducteeFacts,
  offerEvents,
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

describe("award names and lines (tech plan 2.20 step 2)", () => {
  it("names the award after the first Hall of Fame player, and lists the most awarded", () => {
    const played = afterFirstSeason();
    const view = hallSnapshot(played, world);
    expect(view.awardNamerId).toBeNull();
    const winner = played.flagship.seasons[0]?.playerOfSeason ?? 0;
    expect(view.records.mostAwards).toEqual([
      expect.objectContaining({ playerId: winner, awards: 1 }),
    ]);
    expect(view.records.champions[0]?.playerOfSeason).toBe(winner);
    const [first] = played.flagship.players;
    if (!first) throw new Error("No player");
    const inducted: GameState = {
      ...played,
      hallOfFame: {
        ...played.hallOfFame,
        inductees: [
          {
            id: 1,
            wing: "players",
            season: 1,
            turn: 1,
            quarter: 1,
            countryId: first.countryId,
            playerId: first.id,
            facts: null,
            first: null,
            landmarkIndex: null,
          },
        ],
        nextId: 2,
      },
    };
    expect(hallSnapshot(inducted, world).awardNamerId).toBe(first.id);
  });

  it("the first award is a minor toast, offered once a campaign", () => {
    let state = createCampaign(world, setupFor(5, "brazil"));
    let offered = 0;
    while (state.flagship.seasons.length < 3) {
      state = endTurn(state, world);
      offered += state.events.pending.filter((e) => e.templateId === "first-award").length;
      state = {
        ...state,
        events: {
          ...state.events,
          pending: state.events.pending.filter((e) => e.templateId !== "first-award"),
        },
      };
    }
    expect(offered).toBe(1);
    // Offered again from scratch: a minor moment naming the first winner.
    const again = offerEvents(
      { ...state, events: { ...state.events, offered: {}, landmarkCursor: 0 } },
      world,
      4,
    );
    const toast = eventSnapshots(again, world).find((e) => e.templateId === "first-award");
    expect(toast?.weight).toBe("minor");
    expect(toast?.facts.season?.playerOfSeasonId).toBe(state.flagship.seasons[0]?.playerOfSeason);
  });
});
