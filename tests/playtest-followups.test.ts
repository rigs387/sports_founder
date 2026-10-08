import { describe, expect, it } from "vitest";
import {
  applyAction,
  cardPPFactor,
  checkAction,
  costMultiplier,
  createCampaign,
  type EventRecord,
  endTurn,
  eventChoiceCost,
  eventEffects,
  eventSnapshots,
  flagshipSnapshot,
  type GameState,
  landmarks,
  minorMomentIds,
  nodeSizeFactor,
  type Player,
  seasonFacts,
  updateCulture,
} from "../src/sim";
import { clubIds, fresh, withSeason } from "./culture-helpers";
import { setupFor, withConfig, world } from "./helpers";

// Playtest follow-ups (GDD v1.32, tech plan 2.19 step 1).

/** A pending champion card for the latest recorded season, told at this league tier. */
function championCard(state: GameState, tier: "amateur" | "professional"): GameState {
  const seasons = state.flagship.seasons;
  const card: EventRecord = {
    id: state.events.nextId,
    templateId: "season-champion",
    countryId: state.flagship.countryId,
    turn: state.turn,
    quarter: state.quarter,
    facts: {
      casual: 0,
      hardcore: 0,
      leagueTier: tier,
      health: "healthy",
      rivalId: null,
      season: seasonFacts(seasons, seasons.length - 1),
      star: null,
      tradition: null,
      deal: null,
      venue: null,
      hall: null,
    },
    resolution: null,
  };
  return {
    ...state,
    events: { ...state.events, pending: [card], nextId: card.id + 1 },
  };
}

const weightOf = (state: GameState) => eventSnapshots(state, world)[0]?.weight;

describe("front pages for rare stories only", () => {
  it("a champion at a headline tier is a front page for a first title, not a repeat", () => {
    const base = fresh();
    const [a = 0, b = 0] = clubIds(base).filter((id) => id !== base.identity.foundingClubId);
    const first = withSeason(base, a, b);
    expect(weightOf(championCard(first, "professional"))).toBe("headline");
    // The same club again, second title, no dynasty yet: a back page.
    const again = withSeason(first, a, b);
    expect(weightOf(championCard(again, "professional"))).toBe("big");
    // Below the headline tiers even a first title stays a back page.
    expect(weightOf(championCard(first, "amateur"))).toBe("big");
  });
});

/** The state with a leading player retired after season 1, a long star career behind them. */
function retired(state: GameState, index: number): { state: GameState; player: Player } {
  const player = state.flagship.players[index];
  if (!player) throw new Error("No player");
  const players = state.flagship.players.map((p) =>
    p.id === player.id
      ? {
          ...p,
          starSince: -20,
          retiredSeason: 1,
          finalSeason: false,
          career: [
            {
              season: 1,
              clubId: p.clubId,
              matches: 10,
              scores: 10,
              playoffScores: 0,
              finalScores: 0,
            },
          ],
        }
      : p,
  );
  return { state: { ...state, flagship: { ...state.flagship, players } }, player };
}

describe("Hall of Fame front pages and firsts with scale", () => {
  const now = withConfig(world, (c) => {
    c.hallOfFame.waitSeasons = 0;
    c.hallOfFame.playersPerClass = 1;
    c.hallOfFame.momentsPerClass = 0;
  });

  it("a later class is a front page only for the current scoring record holder", () => {
    const base = fresh();
    const one = retired(base, 0);
    const two = retired(one.state, 1);
    // Champions from other clubs, so neither player wins a title here.
    const [x = 0, y = 0] = clubIds(base).filter(
      (id) =>
        id !== base.identity.foundingClubId && id !== one.player.clubId && id !== two.player.clubId,
    );
    const country = base.flagship.countryId;
    // Two held the record, then one broke it. One (the lower id) goes in first, a front page as
    // the first class; two, no longer the holder, goes in next on a back page.
    let state: GameState = {
      ...two.state,
      landmarks: [
        ...two.state.landmarks,
        landmarks.scoringRecord(1, 0, country, 1, two.player.id, 10),
        landmarks.scoringRecord(1, 0, country, 1, one.player.id, 12),
      ],
    };
    state = updateCulture(withSeason(state, x, y), now);
    state = updateCulture(withSeason(state, x, y), now);
    const classes = state.hallOfFame.inductees.map((i) => i.playerId);
    expect(classes).toHaveLength(2);
    const cards = classes.map((_, i) => ({
      facts: { hall: { season: i + 1, inducteeIds: [state.hallOfFame.inductees[i]?.id ?? 0] } },
    }));
    const weights = cards.map(
      (card) =>
        eventSnapshots(
          {
            ...state,
            events: {
              ...state.events,
              pending: [
                {
                  id: 999,
                  templateId: "hall-of-fame-class",
                  countryId: country,
                  turn: state.turn,
                  quarter: state.quarter,
                  facts: {
                    casual: 0,
                    hardcore: 0,
                    leagueTier: "amateur",
                    health: null,
                    rivalId: null,
                    season: null,
                    star: null,
                    tradition: null,
                    deal: null,
                    venue: null,
                    hall: card.facts.hall,
                  },
                  resolution: null,
                },
              ],
            },
          },
          now,
        )[0]?.weight,
    );
    expect(classes).toEqual([one.player.id, two.player.id]);
    expect(weights).toEqual(["headline", "big"]);
  });

  it("the first record crowd counts only once its league has turned Professional", () => {
    const base = fresh();
    const country = base.flagship.countryId;
    const [x = 0, y = 0] = clubIds(base).filter((id) => id !== base.identity.foundingClubId);
    const firsts = withConfig(world, (c) => {
      c.hallOfFame.moments = ["firstRecordCrowd"];
    });
    const early: GameState = {
      ...base,
      landmarks: [...base.landmarks, landmarks.recordCrowd(1, 1, country, 1, 500, x, 1)],
    };
    const amateur = updateCulture(withSeason(early, x, y), firsts);
    expect(amateur.hallOfFame.inductees).toEqual([]);
    const promoted: GameState = {
      ...amateur,
      landmarks: [
        ...amateur.landmarks,
        landmarks.leaguePromoted(1, 2, country, "semi-pro", "professional"),
        landmarks.recordCrowd(1, 3, country, 2, 900, x, 2),
      ],
    };
    const later = updateCulture(withSeason(promoted, x, y), firsts);
    expect(later.hallOfFame.inductees.map((i) => i.first)).toEqual(["firstRecordCrowd"]);
  });
});

describe("card PP grows with the sport", () => {
  it("rewards and choice costs scale by the node price factor", () => {
    const base = fresh();
    const big: GameState = {
      ...base,
      tierTrack: { ...base.tierTrack, peakTier: 4 },
      countries: base.countries.map((c) => ({
        ...c,
        fans: c.fans.map((f, i) =>
          i === 0 ? { ...f, casual: 5_000_000, hardcore: 1_000_000 } : f,
        ),
      })),
    };
    const factor = cardPPFactor(big, world);
    expect(factor).toBeCloseTo(costMultiplier(big, world.config) * nodeSizeFactor(big, world));
    expect(factor).toBeGreaterThan(costMultiplier(big, world.config));
    const card = world.events.cards.find((c) =>
      c.choices.some((choice) => choice.id === "welcome"),
    );
    if (!card) throw new Error("No card with the welcome choice");
    expect(eventChoiceCost(big, world, card, "welcome")).toBeCloseTo(8 * factor);
    const champion = world.events.cards.find((c) => c.story === "champion");
    if (!champion) throw new Error("No champion card");
    const record = championCard(withSeason(big, ...pairOf(big)), "amateur").events.pending[0];
    if (!record) throw new Error("No card");
    const [pp] = eventEffects(big, world, champion, record, null);
    const championPP = world.config.flagship.stories.championPP.amateur;
    expect(pp).toMatchObject({ type: "pp" });
    expect(pp?.type === "pp" ? pp.amount : 0).toBeCloseTo(championPP * factor);
  });
});

function pairOf(state: GameState): [number, number] {
  const [a = 0, b = 0] = clubIds(state).filter((id) => id !== state.identity.foundingClubId);
  return [a, b];
}

describe("presentation (tech plan 2.19 step 2)", () => {
  it("collects every minor moment at once, and only minor ones", () => {
    let state = createCampaign(world, setupFor(5, "brazil"));
    while (minorMomentIds(state, world).length < 2 && state.turn < 40)
      state = endTurn(state, world);
    const minor = minorMomentIds(state, world);
    expect(minor.length).toBeGreaterThanOrEqual(2);
    const others = state.events.pending.filter((e) => !minor.includes(e.id)).map((e) => e.id);
    const after = applyAction(state, world, { type: "collectMinorMoments" });
    expect(minorMomentIds(after, world)).toEqual([]);
    expect(after.events.pending.map((e) => e.id)).toEqual(others);
    expect(after.pp).toBeGreaterThan(state.pp);
    expect(checkAction(after, world, { type: "collectMinorMoments" })).not.toBeNull();
  });

  it("the offseason shows the season just finished, not the new season's empty tallies", () => {
    let state = createCampaign(world, setupFor(5, "brazil"));
    while (!state.flagship.offseason) state = endTurn(state, world);
    const last = state.flagship.seasons.at(-1);
    const view = flagshipSnapshot(state, world);
    expect(view.leaders.length).toBeGreaterThan(0);
    for (const leader of view.leaders) {
      const player = state.flagship.players.find((p) => p.id === leader.playerId);
      const line = player?.career.find((entry) => entry.season === last?.season);
      expect(leader.scores).toBe(line?.scores ?? 0);
    }
    expect(view.leaders.some((leader) => (leader.scores ?? 0) > 0)).toBe(true);
  });
});
