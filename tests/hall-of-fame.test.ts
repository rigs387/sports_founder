import { describe, expect, it } from "vitest";
import {
  checkInvariants,
  createCampaign,
  deserializeSave,
  endTurn,
  eventSnapshots,
  type GameState,
  hallPoints,
  hallProblems,
  hallSnapshot,
  historySnapshot,
  inducteeFacts,
  landmarks,
  newHallOfFame,
  offerEvents,
  type Player,
  scoreUnit,
  serializeSave,
  traditionWeights,
  updateCulture,
} from "../src/sim";
import { clubIds, fresh, withSeason, withTradition } from "./culture-helpers";
import {
  awardless,
  countryIndex,
  migratedHall,
  setupFor,
  withConfig,
  withoutHallEvents,
  world,
} from "./helpers";

// The Hall of Fame (GDD v1.31, tech plan 2.18; careers, the ballot and history, GDD v1.35).

/** Brazil's campaign played until its first flagship season has ended. */
function afterFirstSeason(): GameState {
  let state = createCampaign(world, setupFor(5, "brazil"));
  while (state.flagship.seasons.length === 0) state = endTurn(state, world);
  return state;
}

/**
 * The state with a leading player's career rewritten: a star from `starSince`, retired after
 * `last`, scoring `scores` a season.
 */
function retire(
  state: GameState,
  playerId: number,
  starSince: number | null,
  last: number,
  scores = 10,
) {
  const players = state.flagship.players.map((p): Player => {
    if (p.id !== playerId) return p;
    const career = Array.from({ length: last }, (_, i) => ({
      season: i + 1,
      clubId: p.clubId,
      matches: 10,
      scores,
      playoffScores: 0,
      finalScores: 0,
    }));
    return { ...p, starSince, retiredSeason: last, finalSeason: false, career };
  });
  return { ...state, flagship: { ...state.flagship, players } };
}

/** Records `count` seasons with this champion, running culture's turn after each. */
function seasons(
  state: GameState,
  count: number,
  championId: number,
  runnerUpId: number,
  w = world,
): GameState {
  let next = state;
  for (let i = 0; i < count; i += 1)
    next = updateCulture(withSeason(next, championId, runnerUpId), w);
  return next;
}

function leading(state: GameState, index: number): Player {
  const player = state.flagship.players[index];
  if (!player) throw new Error("No leading player");
  return player;
}

/** Two different clubs other than the founding club, or `first` and one. */
function pair(state: GameState, first?: number): [number, number] {
  const ids = clubIds(state).filter((id) => id !== state.identity.foundingClubId);
  const a = first ?? ids[0] ?? 0;
  return [a, ids.find((id) => id !== a) ?? 0];
}

/** No wait after retirement. */
const now = withConfig(world, (c) => {
  c.hallOfFame.waitSeasons = 0;
});

describe("Hall of Fame state (tech plan 2.18 step 1)", () => {
  it("a new campaign starts with an empty Hall counting from its first season", () => {
    const state = createCampaign(world, setupFor(5, "brazil"));
    expect(state.hallOfFame).toEqual(newHallOfFame(1));
    expect(world.config.hallOfFame.firsts.length).toBeGreaterThan(0);
  });

  it("a format 22 save migrates to an empty Hall counting from now, with no class facts", () => {
    const played = withoutHallEvents(afterFirstSeason());
    const strip = (list: GameState["events"]["pending"]) =>
      list.map(({ facts: { hall: _h, ...facts }, ...event }) => ({ ...event, facts }));
    const { hallOfFame: _hall, ...rest } = played;
    const v22 = {
      ...rest,
      events: {
        ...played.events,
        pending: strip(played.events.pending),
        history: strip(played.events.history),
      },
    };
    const loaded = deserializeSave(JSON.stringify({ formatVersion: 22, state: v22 }), world);
    expect(loaded.hallOfFame).toEqual(newHallOfFame(played.flagship.season));
    expect(serializeSave(loaded)).toBe(
      serializeSave(awardless({ ...played, hallOfFame: migratedHall(played) })),
    );
  });
});

describe("Hall of Fame classes (tech plan 2.18 step 2, GDD v1.35)", () => {
  it("reads a career from retained records only, in the scoring rule's units", () => {
    const base = fresh();
    const p = leading(base, 0);
    const [club, other] = pair(base, p.clubId);
    let state = retire(base, p.id, 1, 4);
    state = seasons(state, 1, other, club);
    state = seasons(state, 2, club, other);
    state = seasons(state, 1, other, club);
    state = {
      ...state,
      flagship: {
        ...state.flagship,
        seasons: state.flagship.seasons.map((s) =>
          s.season === 3 ? { ...s, topScorer: { playerId: p.id, clubId: club, scores: 9 } } : s,
        ),
      },
      landmarks: [
        ...state.landmarks,
        landmarks.scoringRecord(1, 1, state.flagship.countryId, 3, p.id, 30),
      ],
    };
    const facts = inducteeFacts(state, world, leading(state, 0));
    const units = 40 / scoreUnit(world, "medium");
    expect(facts).toEqual({
      starSeasons: 4,
      titles: 2,
      topScorerSeasons: 1,
      awards: 0,
      record: true,
      scores: 40,
      careerUnits: expect.closeTo(units, 9),
      allTimeRank: 1,
    });
    const { points } = world.config.hallOfFame;
    expect(hallPoints(facts, world)).toBe(
      4 * points.starSeason +
        2 * points.title +
        points.topScorer +
        points.record +
        Math.floor(units / points.careerUnits) +
        points.topTen,
    );
  });

  it("a long career alone can earn a place: no star seasons, titles or awards", () => {
    const base = fresh();
    const p = leading(base, 0);
    const { bar, points } = world.config.hallOfFame;
    // Enough career units for the bar with the all-time top-ten points.
    const units = (bar - points.topTen) * points.careerUnits;
    // One season on record (the league is young) holding the whole career's scores.
    const scores = Math.ceil(units * scoreUnit(world, "medium"));
    let state = retire(base, p.id, null, 1, scores);
    const [x, y] = pair(state);
    state = seasons(state, 1, x, y, now);
    expect(state.hallOfFame.inductees.map((i) => i.playerId)).toEqual([p.id]);
    expect(state.hallOfFame.inductees[0]?.facts.starSeasons).toBe(0);
  });

  it("inducts after the wait, best first up to the cap; the rest are passed over and wait", () => {
    const capped = withConfig(world, (c) => {
      c.hallOfFame.playersPerClass = 2;
      c.hallOfFame.waitSeasons = 2;
    });
    const base = fresh();
    const [a, b, c] = [0, 1, 2].map((i) => leading(base, i));
    if (!a || !b || !c) throw new Error("No players");
    // All three retire after season 1; long star careers put a first, then c, then b.
    let state = retire(retire(retire(base, a.id, -10, 1), b.id, -7, 1), c.id, -8, 1);
    const [x, y] = pair(state);
    const classes: number[][] = [];
    for (let i = 0; i < 3; i += 1) {
      state = seasons(state, 1, x, y, capped);
      const season = state.flagship.season - 1;
      classes.push(
        state.hallOfFame.inductees.filter((n) => n.season === season).map((n) => n.playerId),
      );
      expect(hallProblems(state)).toEqual([]);
    }
    // The classes of seasons 1 and 2 come too soon (retired after season 1, a wait of 2).
    expect(classes).toEqual([[], [], [a.id, c.id]]);
    expect(state.hallOfFame.ballots).toEqual([{ playerId: b.id, classes: 1 }]);
    const missed = state.landmarks.filter((l) => l.kind === "hallOfFameClass").at(-1);
    expect(missed).toMatchObject({ inductees: 2, nearMissId: b.id });
    state = seasons(state, 1, x, y, capped);
    expect(state.hallOfFame.inductees.at(-1)?.playerId).toBe(b.id);
    expect(state.hallOfFame.ballots).toEqual([]);
  });

  it("drops a player off the ballot after ballotClasses classes below the bar", () => {
    const strict = withConfig(world, (c) => {
      c.hallOfFame.waitSeasons = 0;
      c.hallOfFame.ballotClasses = 2;
    });
    const base = fresh();
    const p = leading(base, 0);
    const { bar, ballotShare, points } = world.config.hallOfFame;
    // Points between the ballot line and the bar: star seasons and the all-time top ten.
    const starSeasons = Math.ceil((ballotShare * bar - points.topTen) / points.starSeason);
    let state = retire(base, p.id, 2 - starSeasons, 1, 0);
    const reading = inducteeFacts(state, strict, leading(state, 0));
    const score = hallPoints(reading, strict);
    expect(score).toBeGreaterThanOrEqual(ballotShare * bar);
    expect(score).toBeLessThan(bar);
    const [x, y] = pair(state);
    state = seasons(state, 1, x, y, strict);
    expect(hallSnapshot(state, strict).ballot.map((b) => b.playerId)).toEqual([p.id]);
    state = seasons(state, 1, x, y, strict);
    expect(state.hallOfFame.ballots).toEqual([{ playerId: p.id, classes: 2 }]);
    expect(hallSnapshot(state, strict).ballot).toEqual([]);
    state = seasons(state, 2, x, y, strict);
    expect(state.hallOfFame.inductees).toEqual([]);
  });

  it("never inducts a player retired before the Hall began", () => {
    const base = fresh();
    const p = leading(base, 0);
    let state = retire(base, p.id, -20, 1);
    state = { ...state, hallOfFame: newHallOfFame(2) };
    const [x, y] = pair(state);
    state = seasons(state, 4, x, y);
    expect(state.hallOfFame.inductees).toEqual([]);
  });

  it("founds the inductee's star legacy, renews a living one, and adds shrine weight at home", () => {
    const base = fresh();
    const home = base.flagship.countryId;
    const i = countryIndex(world, home);
    const [p, q] = [0, 1].map((n) => leading(base, n));
    if (!p || !q) throw new Error("No players");
    let state = retire(retire(base, p.id, -20, 1), q.id, -19, 1);
    state = withTradition(state, "legacy", home, { playerId: q.id, strength: 0.4 });
    const [x, y] = pair(state);
    state = seasons(state, 1, x, y, now);
    const legacy = (id: number) =>
      state.culture.traditions.filter((t) => t.type === "legacy" && t.playerId === id);
    expect(legacy(p.id)).toHaveLength(1);
    expect(legacy(q.id)).toHaveLength(1);
    expect(legacy(q.id)[0]?.strength).toBeGreaterThan(0.4);

    const { weightCap } = world.config.culture;
    const lone = {
      ...state,
      hallOfFame: { ...state.hallOfFame, inductees: state.hallOfFame.inductees.slice(0, 1) },
    };
    const without = traditionWeights({ ...lone, hallOfFame: newHallOfFame(1) }, now)[i] ?? 0;
    expect(traditionWeights(lone, now)[i]).toBeCloseTo(
      Math.min(weightCap, without + world.config.hallOfFame.shrineWeight),
    );
    expect(hallProblems(state)).toEqual([]);
  });
});

describe("the sport's history (GDD v1.35)", () => {
  it("lists each first once, oldest first, and never inducts one", () => {
    const base = fresh();
    const founding = base.identity.foundingClubId;
    const [, other] = pair(base, founding);
    const star = leading(base, 0);
    let state: GameState = {
      ...base,
      landmarks: [
        ...base.landmarks,
        landmarks.starLandmark("firstStar", 1, 1, base.flagship.countryId, 1, star.id, star.clubId),
      ],
    };
    state = seasons(state, 2, founding, other);
    const history = historySnapshot(state, world);
    expect(history.map((h) => h.first)).toEqual(["firstStar", "foundingTitle"]);
    expect(history[0]).toMatchObject({ playerId: star.id, clubId: star.clubId });
    expect(history[1]).toMatchObject({ clubId: founding, countryId: base.flagship.countryId });
    expect(state.hallOfFame.inductees).toEqual([]);
  });
});

describe("Hall of Fame cards (tech plan 2.18 step 4)", () => {
  it("a class is one card after the champion, taking no slot, paying PP per inductee", () => {
    const base = fresh();
    const [a, b] = [0, 1].map((i) => leading(base, i));
    if (!a || !b) throw new Error("No players");
    let state = retire(retire(base, a.id, -10, 1), b.id, -9, 1);
    const [x, y] = pair(state);
    // No moment slots at all: the class card still arrives.
    const settings = {
      ...now.events.settings,
      baseMoments: 0,
      momentsPerQuarter: 0,
      marketsPerExtraMoment: 1e9,
    };
    const noSlots = { ...now, events: { ...now.events, settings } };
    state = offerEvents(seasons(state, 1, x, y, noSlots), noSlots, 4);
    const cards = eventSnapshots(state, noSlots);
    const champion = cards.findIndex((e) => e.story === "champion");
    const hall = cards.findIndex((e) => e.templateId === "hall-of-fame-class");
    expect(hall).toBeGreaterThan(champion);
    const card = cards[hall];
    expect(card?.facts.hall?.inducteeIds).toEqual(state.hallOfFame.inductees.map((i) => i.id));
    expect(card?.weight).toBe("headline");
    const tier = card?.facts.leagueTier ?? "amateur";
    expect(card?.effects).toEqual([{ type: "pp", amount: 2 * world.config.hallOfFame.pp[tier] }]);
  });

  it("names the class's near-miss, and a later class without the record holder is big news", () => {
    const base = fresh();
    const [a, b] = [0, 1].map((i) => leading(base, i));
    if (!a || !b) throw new Error("No players");
    const one = withConfig(world, (c) => {
      c.hallOfFame.waitSeasons = 0;
      c.hallOfFame.playersPerClass = 1;
    });
    let state = retire(retire(base, a.id, -10, 1), b.id, -9, 1);
    const [x, y] = pair(state);
    state = seasons(state, 1, x, y, one);
    state = offerEvents(seasons(state, 1, x, y, one), one, 4);
    const classes = eventSnapshots(state, one).filter((e) => e.templateId === "hall-of-fame-class");
    expect(classes.map((e) => e.weight)).toEqual(["headline", "big"]);
    expect(classes.map((e) => e.facts.hall?.nearMissId)).toEqual([b.id, null]);
  });
});

describe("the Almanac's snapshot (tech plan 2.18 step 5)", () => {
  it("lists the ballot, then inducts them; records come from retained seasons", () => {
    const base = fresh();
    const p = leading(base, 0);
    let state = retire(base, p.id, -20, 1);
    const [x, y] = pair(state);
    state = seasons(state, 1, x, y);
    const waiting = hallSnapshot(state, world);
    expect(waiting.ballot).toEqual([
      expect.objectContaining({
        playerId: p.id,
        passedOver: 0,
        eligibleSeason: 1 + world.config.hallOfFame.waitSeasons,
      }),
    ]);
    expect(waiting.ballot[0]?.points).toBeGreaterThanOrEqual(waiting.bar);
    state = seasons(state, world.config.hallOfFame.waitSeasons, x, y);
    const inducted = hallSnapshot(state, world);
    expect(inducted.ballot).toEqual([]);
    expect(inducted.inductees.map((i) => i.playerId)).toContain(p.id);
    expect(inducted.records.champions.map((c) => c.season)).toEqual(
      [...state.flagship.seasons].reverse().map((s) => s.season),
    );
    expect(inducted.records.scorers[0]).toMatchObject({
      playerId: p.id,
      scores: 10,
      retired: true,
    });
    expect(inducted.records.scorers.length).toBeLessThanOrEqual(world.config.hallOfFame.leaders);
  });
});
