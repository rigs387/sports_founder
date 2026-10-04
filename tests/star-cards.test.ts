import { describe, expect, it } from "vitest";
import { choiceValue, EVENT_WEIGHTS } from "../src/runner/event-policy";
import {
  applyAction,
  backingEffects,
  checkInvariants,
  createCampaign,
  deserializeSave,
  endTurn,
  type GameState,
  keepCost,
  PLAYER_INDEX,
  seasonalWindowOpen,
  seatStars,
  serializeSave,
  type World,
} from "../src/sim";
import { countryIndex, setupFor, withConfig, world } from "./helpers";

// Flagship stars as cards (GDD v1.16, tech plan 2.6 step 6).

/** Every score to the leading player (each season's top scorer clears the bar); no moves. */
const stars = (edit: (config: World["config"]) => void = () => {}) =>
  withConfig(world, (config) => {
    config.flagship.players.credit = { base: 1, perSkill: 0, pivot: 50, min: 1, max: 1 };
    config.flagship.stars.moveChance = 0;
    config.flagship.stars.mentorMaxAge = 99;
    edit(config);
  });
const base = stars();
/** Everyone announces their final season at the next season's end. */
const lastSeason = stars((config) => {
  config.flagship.players.finalSeason = {
    fromAge: 0,
    base: 1,
    perYear: 0,
    perLostShare: 0,
    lastAge: 99,
  };
});
/** A star always moves when it can. */
const moving = stars((config) => {
  config.flagship.stars.moveChance = 1;
});

function turn(state: GameState, content: World): GameState {
  const next = endTurn(state, content);
  expect(checkInvariants(next, content)).toEqual([]);
  return next;
}

/** Plays turns until the flagship has finished `seasons` seasons; the cards are then pending. */
function toSeason(state: GameState, seasons: number, content: World): GameState {
  let current = state;
  while (current.flagship.seasons.length < seasons) current = turn(current, content);
  return current;
}

/** Brazil after its first season, back in the seasonal window, the new star backed. */
function backedStar(): GameState {
  let state = toSeason(createCampaign(base, setupFor(11, "brazil")), 1, base);
  while (!seasonalWindowOpen(state, base.config)) state = turn(state, base);
  state = { ...state, pp: 10_000 };
  const star = seatStars(state.flagship)[0];
  if (!star) throw new Error("No star");
  return applyAction(state, base, { type: "backStar", playerId: star.id });
}

/** As backedStar, with the star old enough that next season must be their last. */
function oldBackedStar(): GameState {
  const state = backedStar();
  const star = seatStars(state.flagship)[0];
  const lastAge = base.config.flagship.players.finalSeason.lastAge;
  const players = state.flagship.players.map((p) =>
    p.id === star?.id ? { ...p, birthSeason: state.flagship.season - lastAge } : p,
  );
  return { ...state, flagship: { ...state.flagship, players } };
}

const pendingCard = (state: GameState, templateId: string) =>
  state.events.pending.find((event) => event.templateId === templateId);

describe("star cards", () => {
  it("tells the breakout from the record, without taking a moment slot, for PP by tier", () => {
    const state = toSeason(createCampaign(base, setupFor(11, "brazil")), 1, base);
    const summary = state.flagship.seasons[0];
    const card = pendingCard(state, "star-breakout");
    const star = state.flagship.players.find((p) => p.id === summary?.newStarId);
    const line = star?.career[0];
    expect(card?.facts.star).toMatchObject({
      playerId: star?.id,
      clubId: line?.clubId,
      season: 1,
      scores: line?.scores,
      matches: line?.matches,
    });
    expect(card?.facts.star?.clubScores).toBeGreaterThanOrEqual(line?.scores ?? 0);
    const collected = applyAction(state, base, { type: "collectMoment", eventId: card?.id ?? 0 });
    expect(collected.pp - state.pp).toBe(base.config.flagship.stars.breakoutPP.amateur);
  });

  it("names the champion's leading player and the top scorer on season cards", () => {
    const state = toSeason(createCampaign(base, setupFor(11, "brazil")), 1, base);
    const summary = state.flagship.seasons[0];
    const facts = pendingCard(state, "season-champion")?.facts.season;
    const leader = state.flagship.players.find((p) =>
      p.career.some((l) => l.season === 1 && l.clubId === summary?.championId),
    );
    expect(facts?.championPlayerId).toBe(leader?.id);
    expect(facts?.topScorerId).toBe(summary?.topScorer?.playerId);
    expect(facts?.topScorerScores).toBe(summary?.topScorer?.scores);
  });

  it("announces an unbacked star's final season, then their retirement", () => {
    let state = toSeason(createCampaign(base, setupFor(11, "brazil")), 1, base);
    const star = seatStars(state.flagship)[0];
    state = toSeason(state, 2, lastSeason);
    expect(pendingCard(state, "star-final-season")?.facts.star?.playerId).toBe(star?.id);
    state = toSeason(state, 3, lastSeason);
    const retired = pendingCard(state, "star-retired")?.facts.star;
    expect(retired?.playerId).toBe(star?.id);
    expect(retired?.seasons).toBe(3);
  });

  it("asks a backed star's succession: mentoring passes on part of the influence", () => {
    let state = toSeason(oldBackedStar(), 2, base);
    const card = pendingCard(state, "star-succession");
    const facts = card?.facts.star;
    expect(facts?.candidateId).not.toBeNull();
    state = applyAction(state, base, {
      type: "chooseEvent",
      eventId: card?.id ?? 0,
      choiceId: "mentor",
    });
    const mentor = state.flagship.players.find((p) => p.id === facts?.playerId);
    const influence = mentor?.backing?.influence ?? 0;
    expect(mentor?.backing?.mentee).toBe(facts?.candidateId);
    state = toSeason(state, 3, base);
    const mentee = state.flagship.players.find((p) => p.id === facts?.candidateId);
    // The mentor's influence grew once more in their final season before passing on.
    const grown = Math.min(1, influence + 1 / base.config.flagship.backing.influenceSeasons);
    expect(mentee?.backing?.influence).toBeCloseTo(base.config.flagship.stars.mentorShare * grown);
    expect(state.flagship.players.find((p) => p.id === facts?.playerId)?.backing).toBeNull();
  });

  it("retiring with honors leaves an afterglow that fades; letting go ends the backing", () => {
    const asked = toSeason(oldBackedStar(), 2, base);
    const card = pendingCard(asked, "star-succession");
    const id = card?.facts.star?.playerId;
    const honored = toSeason(
      applyAction(asked, base, {
        type: "chooseEvent",
        eventId: card?.id ?? 0,
        choiceId: "honors",
      }),
      3,
      base,
    );
    const glow = honored.flagship.players.find((p) => p.id === id);
    expect(glow?.retiredSeason).toBe(3);
    expect(glow?.backing?.honors).toBe(true);
    expect(backingEffects(honored.flagship, base).casualConversion).toBeGreaterThan(1);
    const faded = toSeason(honored, 3 + base.config.flagship.stars.afterglowSeasons, base);
    expect(faded.flagship.players.find((p) => p.id === id)?.backing).toBeNull();
    const letGo = toSeason(asked, 3, base);
    expect(letGo.flagship.players.find((p) => p.id === id)?.backing).toBeNull();
  });

  it("asks before a backed star moves: keeping them costs league cash and undoes the move", () => {
    let state = toSeason(backedStar(), 2, moving);
    const card = pendingCard(state, "star-keep");
    const facts = card?.facts.star;
    if (!card || !facts) throw new Error("No keep card");
    expect(state.flagship.players.find((p) => p.id === facts.playerId)?.clubId).toBe(facts.clubId);
    const brazil = countryIndex(moving, "brazil");
    const cash = state.countries[brazil]?.league?.cash ?? 0;
    const cost = keepCost(state, moving, "brazil");
    state = applyAction(state, moving, { type: "chooseEvent", eventId: card.id, choiceId: "keep" });
    expect(state.flagship.players.find((p) => p.id === facts.playerId)?.clubId).toBe(
      facts.otherClubId,
    );
    expect(state.countries[brazil]?.league?.cash).toBeCloseTo(cash - cost);
  });

  it("raises a pressure card when a star is dropped at full influence", () => {
    let state = backedStar();
    const star = seatStars(state.flagship)[0];
    if (!star) throw new Error("No star");
    state = {
      ...state,
      flagship: {
        ...state.flagship,
        players: state.flagship.players.map((p) =>
          p.id === star.id && p.backing ? { ...p, backing: { ...p.backing, influence: 1 } } : p,
        ),
      },
    };
    const brazil = countryIndex(base, "brazil");
    const hardcore = state.countries[brazil]?.fans[PLAYER_INDEX]?.hardcore ?? 0;
    state = applyAction(state, base, { type: "dropStar", playerId: star.id });
    expect(state.countries[brazil]?.fans[PLAYER_INDEX]?.hardcore).toBeLessThan(hardcore);
    state = turn(state, base);
    const card = pendingCard(state, "star-dropped");
    expect(card?.facts.star?.playerId).toBe(star.id);
    expect(state.events.modifiers.some((m) => m.eventId === card?.id)).toBe(true);
  });

  it("records a new all-time top scorer once the league has a history", () => {
    const records = stars((config) => {
      config.flagship.stars.recordMinSeasons = 1;
    });
    const state = toSeason(createCampaign(records, setupFor(11, "brazil")), 3, records);
    const found = state.landmarks.filter((l) => l.kind === "scoringRecord");
    expect(found.length).toBeGreaterThan(0);
    for (const record of found) {
      if (record.kind !== "scoringRecord") continue;
      const upTo = (id: number) =>
        state.flagship.players
          .find((p) => p.id === id)
          ?.career.filter((l) => l.season <= record.season)
          .reduce((sum, l) => sum + l.scores, 0) ?? 0;
      expect(upTo(record.playerId)).toBe(record.scores);
      for (const p of state.flagship.players) expect(upTo(p.id)).toBeLessThanOrEqual(record.scores);
    }
  });

  it("bots value honors and mentoring by the influence they keep", () => {
    const state = toSeason(oldBackedStar(), 2, base);
    const card = pendingCard(state, "star-succession");
    for (const choiceId of ["honors", "mentor"]) {
      const value = choiceValue(state, base, card?.id ?? 0, choiceId, EVENT_WEIGHTS.builder);
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});

describe("save format 15", () => {
  it("migrates a version 14 save: no star facts, no honors or mentees, moves never backed", () => {
    const state = toSeason(backedStar(), 2, base);
    const raw = JSON.parse(serializeSave(state));
    raw.formatVersion = 14;
    const flagship = raw.state.flagship;
    for (const player of flagship.players) {
      if (player.backing) {
        delete player.backing.honors;
        delete player.backing.mentee;
      }
    }
    for (const landmark of raw.state.landmarks)
      if (landmark.kind === "starMoved") delete landmark.backed;
    for (const list of [raw.state.events.pending, raw.state.events.history]) {
      for (const record of list) {
        delete record.facts.star;
        if (record.facts.season) {
          delete record.facts.season.championPlayerId;
          delete record.facts.season.topScorerId;
          delete record.facts.season.topScorerScores;
        }
      }
    }
    // A version 14 save has no star cards and no star landmarks it could not have made.
    raw.state.events.pending = raw.state.events.pending.filter(
      (e: { templateId: string }) => !e.templateId.startsWith("star-"),
    );
    raw.state.events.history = raw.state.events.history.filter(
      (e: { templateId: string }) => !e.templateId.startsWith("star-"),
    );
    raw.state.landmarks = raw.state.landmarks.filter(
      (l: { kind: string }) =>
        !["starFinalSeason", "scoringRecord", "starDropped"].includes(l.kind),
    );
    raw.state.events.landmarkCursor = Math.min(
      raw.state.events.landmarkCursor,
      raw.state.landmarks.length,
    );
    const loaded = deserializeSave(JSON.stringify(raw), base);
    const all = [...loaded.events.pending, ...loaded.events.history];
    expect(all.every((e) => e.facts.star === null)).toBe(true);
    expect(all.every((e) => e.facts.season === null || e.facts.season.topScorerId === null)).toBe(
      true,
    );
    const backed = loaded.flagship.players.filter((p) => p.backing !== null);
    expect(backed.every((p) => p.backing?.honors === false && p.backing.mentee === null)).toBe(
      true,
    );
    expect(serializeSave(deserializeSave(serializeSave(loaded), base))).toBe(serializeSave(loaded));
  });
});
