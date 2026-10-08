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
  inducteeFacts,
  landmarks,
  newHallOfFame,
  offerEvents,
  type Player,
  serializeSave,
  traditionWeights,
  updateCulture,
} from "../src/sim";
import { clubIds, fresh, withSeason, withTradition } from "./culture-helpers";
import { awardless, countryIndex, migratedHall, setupFor, withConfig, world } from "./helpers";

// The Hall of Fame (GDD v1.31, tech plan 2.18).

/** Brazil's campaign played until its first flagship season has ended. */
function afterFirstSeason(): GameState {
  let state = createCampaign(world, setupFor(5, "brazil"));
  while (state.flagship.seasons.length === 0) state = endTurn(state, world);
  return state;
}

/** The state with a leading player's career rewritten: a star from `starSince`, retired after `last`. */
function retire(state: GameState, playerId: number, starSince: number | null, last: number) {
  const players = state.flagship.players.map((p): Player => {
    if (p.id !== playerId) return p;
    const career = Array.from({ length: last }, (_, i) => ({
      season: i + 1,
      clubId: p.clubId,
      matches: 10,
      scores: 10,
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

/** Two different clubs other than the founding club (whose title is a first), or `first` and one. */
function pair(state: GameState, first?: number): [number, number] {
  const ids = clubIds(state).filter((id) => id !== state.identity.foundingClubId);
  const a = first ?? ids[0] ?? 0;
  return [a, ids.find((id) => id !== a) ?? 0];
}

const firstStar = (state: GameState, player: Player) =>
  landmarks.starLandmark("firstStar", 1, 1, state.flagship.countryId, 1, player.id, player.clubId);

describe("Hall of Fame state (tech plan 2.18 step 1)", () => {
  it("a new campaign starts with an empty Hall counting from its first season", () => {
    const state = createCampaign(world, setupFor(5, "brazil"));
    expect(state.hallOfFame).toEqual(newHallOfFame(1, state.landmarks.length));
    expect(world.config.hallOfFame.moments.length).toBeGreaterThan(0);
  });

  it("a format 22 save migrates to an empty Hall counting from now, with no class facts", () => {
    const played = afterFirstSeason();
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
    expect(loaded.hallOfFame).toEqual(
      newHallOfFame(played.flagship.season, played.landmarks.length),
    );
    expect(serializeSave(loaded)).toBe(
      serializeSave(awardless({ ...played, hallOfFame: migratedHall(played) })),
    );
  });
});

describe("Hall of Fame classes (tech plan 2.18 step 2)", () => {
  it("reads a career from retained records only", () => {
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
    const facts = inducteeFacts(state, leading(state, 0));
    expect(facts).toEqual({
      starSeasons: 4,
      titles: 2,
      topScorerSeasons: 1,
      awards: 0,
      record: true,
      scores: 40,
    });
    const { points } = world.config.hallOfFame;
    expect(hallPoints(facts, world)).toBe(
      4 * points.starSeason + 2 * points.title + points.topScorer + points.record,
    );
  });

  it("inducts after the wait, best first up to the cap; the rest wait for a later class", () => {
    const capped = withConfig(world, (c) => {
      c.hallOfFame.playersPerClass = 2;
      c.hallOfFame.waitSeasons = 2;
      c.hallOfFame.momentsPerClass = 0;
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
        state.hallOfFame.inductees.filter((n) => n.season === season).map((n) => n.playerId ?? 0),
      );
      expect(hallProblems(state)).toEqual([]);
    }
    // The classes of seasons 1 and 2 come too soon (retired after season 1, a wait of 2).
    expect(classes).toEqual([[], [], [a.id, c.id]]);
    state = seasons(state, 1, x, y, capped);
    expect(state.hallOfFame.inductees.at(-1)?.playerId).toBe(b.id);
    const counts = state.landmarks.flatMap((l) =>
      l.kind === "hallOfFameClass" ? [l.inductees] : [],
    );
    expect(counts).toEqual([2, 1]);
  });

  it("never inducts a player retired before the Hall began, or a first recorded before it", () => {
    const base = fresh();
    const p = leading(base, 0);
    let state = retire(base, p.id, -20, 1);
    state = { ...state, landmarks: [...state.landmarks, firstStar(state, p)] };
    state = { ...state, hallOfFame: newHallOfFame(2, state.landmarks.length) };
    const [x, y] = pair(state);
    state = seasons(state, 4, x, y);
    expect(state.hallOfFame.inductees).toEqual([]);
  });

  it("inducts each first once, oldest first, one a class, the season after it happened", () => {
    const base = fresh();
    const founding = base.identity.foundingClubId;
    const [, other] = pair(base, founding);
    let state = { ...base, landmarks: [...base.landmarks, firstStar(base, leading(base, 0))] };
    const firsts = (s: GameState) => s.hallOfFame.inductees.map((i) => i.first);
    // Season 1 is the founding club's first title: its own champion landmark waits a class.
    state = seasons(state, 1, founding, other);
    expect(firsts(state)).toEqual(["firstStar"]);
    state = seasons(state, 1, other, founding);
    expect(firsts(state)).toEqual(["firstStar", "foundingTitle"]);
    state = seasons(state, 2, founding, other);
    expect(firsts(state)).toEqual(["firstStar", "foundingTitle"]);
    expect(state.hallOfFame.inductees.every((i) => i.countryId === base.flagship.countryId)).toBe(
      true,
    );
    expect(checkInvariants(state, world)).toEqual([]);
  });

  it("adds shrine weight at home inside the cap and renews the inductee's star legacy", () => {
    const base = fresh();
    const home = base.flagship.countryId;
    const i = countryIndex(world, home);
    const p = leading(base, 0);
    const now = withConfig(world, (c) => {
      c.hallOfFame.waitSeasons = 0;
    });
    let state = retire(base, p.id, -20, 1);
    state = withTradition(state, "legacy", home, { playerId: p.id, strength: 0.4 });
    const [x, y] = pair(state);
    state = seasons(state, 1, x, y, now);
    expect(state.hallOfFame.inductees.some((n) => n.playerId === p.id)).toBe(true);
    const legacy = state.culture.traditions.find((t) => t.type === "legacy" && t.playerId === p.id);
    expect(legacy?.strength).toBeGreaterThan(0.4);

    const { weightCap } = world.config.culture;
    const without = traditionWeights({ ...state, hallOfFame: newHallOfFame(1, 0) }, now)[i] ?? 0;
    expect(without).toBeLessThan(weightCap);
    expect(traditionWeights(state, now)[i]).toBeCloseTo(
      Math.min(weightCap, without + world.config.hallOfFame.shrineWeight),
    );
    // A country already at the cap gains nothing.
    const full = withTradition(withTradition(state, "derby", home), "rite", home);
    expect(traditionWeights(full, now)[i]).toBe(weightCap);
  });
});

describe("Hall of Fame cards (tech plan 2.18 step 4)", () => {
  it("a class is one card after the champion, taking no slot, paying PP per inductee by wing", () => {
    const base = fresh();
    const [a, b] = [0, 1].map((i) => leading(base, i));
    if (!a || !b) throw new Error("No players");
    // Two retired stars and the first star (a first) wait for the next class.
    let state = retire(retire(base, a.id, -10, 1), b.id, -9, 1);
    state = { ...state, landmarks: [...state.landmarks, firstStar(state, a)] };
    const [x, y] = pair(state);
    const now = withConfig(world, (c) => {
      c.hallOfFame.waitSeasons = 0;
    });
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
    const { pp } = world.config.hallOfFame;
    expect(card?.effects).toEqual([
      { type: "pp", amount: 2 * pp.players[tier] + pp.moments[tier] },
    ]);
  });

  it("a later class without a scoring record holder is a big moment", () => {
    const base = fresh();
    const [a, b] = [0, 1].map((i) => leading(base, i));
    if (!a || !b) throw new Error("No players");
    const now = withConfig(world, (c) => {
      c.hallOfFame.waitSeasons = 0;
      c.hallOfFame.playersPerClass = 1;
    });
    let state = retire(retire(base, a.id, -10, 1), b.id, -9, 1);
    const [x, y] = pair(state);
    state = seasons(state, 1, x, y, now);
    state = offerEvents(seasons(state, 1, x, y, now), now, 4);
    const classes = eventSnapshots(state, now).filter((e) => e.templateId === "hall-of-fame-class");
    expect(classes.map((e) => e.weight)).toEqual(["headline", "big"]);
  });
});

describe("the Almanac's snapshot (tech plan 2.18 step 5)", () => {
  it("lists who waits for the Hall, then inducts them; records come from retained seasons", () => {
    const base = fresh();
    const p = leading(base, 0);
    let state = retire(base, p.id, -20, 1);
    const [x, y] = pair(state);
    state = seasons(state, 1, x, y);
    const waiting = hallSnapshot(state, world);
    expect(waiting.waiting).toEqual([
      expect.objectContaining({
        playerId: p.id,
        retiredSeason: 1,
        eligibleSeason: 1 + world.config.hallOfFame.waitSeasons,
      }),
    ]);
    // A player below the bar never shows.
    expect(waiting.waiting.some((w) => w.playerId !== p.id)).toBe(false);
    state = seasons(state, world.config.hallOfFame.waitSeasons, x, y);
    const inducted = hallSnapshot(state, world);
    expect(inducted.waiting).toEqual([]);
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
