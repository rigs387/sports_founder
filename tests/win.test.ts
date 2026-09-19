import { describe, expect, it } from "vitest";
import {
  checkInvariants,
  createCampaign,
  deserializeSave,
  endTurn,
  type GameState,
  PLAYER_INDEX,
  playerRank,
  runningCostPerQuarter,
  serializeSave,
  snapshot,
  tierEntry,
  updateWinTrack,
  type World,
} from "../src/sim";
import { countryIndex, setupFor, withConfig, world } from "./helpers";

// The win condition (GDD Win condition, Post-win play), tested through its consequences: #1 by
// global Fandom Score held for holdTurns consecutive turns at the required PP tier wins, winning
// never ends the campaign, #1 can be lost and regained, and after the win an anchor collapse is a
// Moment, not the end.

const ANCHOR = "austria";
const SOCCER_INDEX = 1;

/**
 * Nobody's fans convert or churn and the PP tier never changes, so standings and tiers move only
 * when a test moves them.
 */
function frozen(holdTurns: number, anchorRunningCost?: number): World {
  return withConfig(world, (config) => {
    config.win.holdTurns = holdTurns;
    config.dynamics.noise = 0;
    config.dynamics.player = {
      casualConversionRate: 0,
      casualChurnRate: 0,
      casualDecayRate: 0,
      hardcoreConversionRate: 0,
    };
    config.dynamics.rival = { casualChurnRate: 0, hardcoreConversionRate: 0 };
    for (const tier of config.ppTiers) if (tier.tier > 1) tier.fandomScoreRequired = 1e15;
    config.tierTrack.demotionTurns = 1_000_000;
    if (anchorRunningCost !== undefined) {
      config.leagues.tiers.amateur.runningCost = anchorRunningCost;
    }
  });
}

/** `state` at PP tier `tier`, with that tier's focus slots (extra ones empty). */
function atTier(state: GameState, w: World, tier: number): GameState {
  const slots = tierEntry(tier, w.config).focusSlots;
  const focus = Array.from({ length: slots }, (_, i) => state.focus[i] ?? null);
  return {
    ...state,
    ppTier: tier,
    tierTrack: { ...state.tierTrack, peakTier: Math.max(state.tierTrack.peakTier, tier) },
    focus,
  };
}

/**
 * Swaps the player's fans with soccer's in every country except the anchor, which makes the player
 * the world's #1 sport by a wide margin while leaving the anchor league's business untouched.
 * Calling it again swaps them back.
 */
function swapWithSoccer(state: GameState): GameState {
  return {
    ...state,
    countries: state.countries.map((country) => {
      if (country.countryId === ANCHOR) return country;
      const player = country.fans[PLAYER_INDEX];
      const soccer = country.fans[SOCCER_INDEX];
      if (!player || !soccer) throw new Error(`Missing fans in ${country.countryId}`);
      const fans = [...country.fans];
      fans[PLAYER_INDEX] = { ...player, casual: soccer.casual, hardcore: soccer.hardcore };
      fans[SOCCER_INDEX] = { ...soccer, casual: player.casual, hardcore: player.hardcore };
      return { ...country, fans };
    }),
  };
}

/** Runs the win check on `state` as the end of its turn, then advances the turn number. */
function checkTurn(state: GameState, w: World): GameState {
  const next = updateWinTrack(state, w);
  return { ...next, turn: next.turn + 1 };
}

function checkTurns(state: GameState, w: World, turns: number): GameState {
  let current = state;
  for (let i = 0; i < turns; i += 1) current = checkTurn(current, w);
  return current;
}

const kinds = (state: GameState) => state.landmarks.map((l) => l.kind);
const count = (state: GameState, kind: string) => kinds(state).filter((k) => k === kind).length;

describe("the win hold", () => {
  const w = frozen(3);
  const top = w.config.win.requiredTier;
  const start = atTier(createCampaign(w, setupFor(1, ANCHOR)), w, top);
  const leader = swapWithSoccer(start);

  it("the swap fixture makes the player #1, and the fresh campaign is not", () => {
    expect(playerRank(start, w)).toBeGreaterThan(1);
    expect(playerRank(leader, w)).toBe(1);
    expect(top).toBe(w.config.ppTiers.length);
  });

  it("a turn below #1 changes nothing", () => {
    const after = updateWinTrack(start, w);
    expect(after.win).toStrictEqual({ atTop: false, turnsHeld: 0, won: null });
    expect(after.landmarks).toBe(start.landmarks);
  });

  it("wins after exactly holdTurns consecutive turns at #1 at the required tier, recorded once", () => {
    let state = checkTurn(leader, w);
    expect(state.win).toStrictEqual({ atTop: true, turnsHeld: 1, won: null });
    expect(state.landmarks.at(-1)).toMatchObject({ kind: "rankOneTaken", turn: 1 });
    state = checkTurn(state, w);
    expect(state.win).toStrictEqual({ atTop: true, turnsHeld: 2, won: null });
    state = checkTurn(state, w);
    expect(state.win.won).toStrictEqual({ turn: 3, quarter: leader.quarter });
    expect(state.landmarks.at(-1)).toMatchObject({ kind: "won", turn: 3, heldTurns: 3 });
    state = checkTurns(state, w, 5);
    expect(state.win.turnsHeld).toBe(8);
    expect(count(state, "won")).toBe(1);
    expect(count(state, "rankOneTaken")).toBe(1);
    expect(state.outcome).toBeNull();
  });

  it("#1 below the required tier is recorded but does not count toward the hold", () => {
    const early = atTier(leader, w, top - 1);
    let state = checkTurns(early, w, 10);
    expect(state.win).toStrictEqual({ atTop: true, turnsHeld: 0, won: null });
    expect(count(state, "rankOneTaken")).toBe(1);
    expect(snapshot(state, w).win).toMatchObject({ rank: 1, holding: false, turnsHeld: 0 });
    // Reaching the required tier starts the hold; it does not take #1 a second time.
    state = checkTurn(atTier(state, w, top), w);
    expect(state.win).toStrictEqual({ atTop: true, turnsHeld: 1, won: null });
    expect(count(state, "rankOneTaken")).toBe(1);
  });

  it("dropping below the required tier restarts the hold, though the sport is still #1", () => {
    let state = checkTurns(leader, w, 2);
    state = checkTurn(atTier(state, w, top - 1), w);
    expect(state.win).toStrictEqual({ atTop: true, turnsHeld: 0, won: null });
    expect(count(state, "rankOneLost")).toBe(0);
  });

  it("dropping below #1 before the win restarts the hold from nothing", () => {
    let state = checkTurns(leader, w, 2);
    expect(state.win.turnsHeld).toBe(2);
    state = checkTurn(swapWithSoccer(state), w);
    expect(state.win).toStrictEqual({ atTop: false, turnsHeld: 0, won: null });
    expect(state.landmarks.at(-1)).toMatchObject({ kind: "rankOneLost", sportId: "soccer" });
    state = checkTurns(swapWithSoccer(state), w, 2);
    expect(state.win).toStrictEqual({ atTop: true, turnsHeld: 2, won: null });
    state = checkTurn(state, w);
    expect(state.win.won).not.toBeNull();
  });

  it("after the win, #1 can be lost and regained; the original win stays", () => {
    let state = checkTurns(leader, w, 3);
    const won = state.win.won;
    expect(won).not.toBeNull();
    state = checkTurn(swapWithSoccer(state), w);
    expect(state.win).toStrictEqual({ atTop: false, turnsHeld: 0, won });
    state = checkTurns(swapWithSoccer(state), w, 4);
    expect(state.win).toStrictEqual({ atTop: true, turnsHeld: 4, won });
    expect(count(state, "won")).toBe(1);
    expect(count(state, "rankOneTaken")).toBe(2);
    expect(count(state, "rankOneLost")).toBe(1);
  });

  it("the snapshot reports rank, the hold and the win", () => {
    const before = snapshot(start, w).win;
    expect(before).toMatchObject({ turnsHeld: 0, holdTurns: 3, holding: false, won: null });
    expect(before.rank).toBeGreaterThan(1);
    expect(before.leadingRivalId).toBe("soccer");
    const state = checkTurns(leader, w, 3);
    expect(snapshot(state, w).win).toStrictEqual({
      rank: 1,
      leadingRivalId: "cricket",
      turnsHeld: 3,
      holdTurns: 3,
      requiredTier: top,
      holding: true,
      won: { turn: 3, quarter: leader.quarter },
    });
  });
});

describe("post-win play", () => {
  /** The swapped leader at the required tier, with an anchor league that loses money. */
  function sinkingLeader(holdTurns: number) {
    const w = frozen(holdTurns, 1000);
    const start = createCampaign(w, setupFor(1, ANCHOR));
    const index = countryIndex(w, ANCHOR);
    const cost = runningCostPerQuarter(w, index, "amateur", []);
    const countries = start.countries.map((country, i) =>
      i === index && country.league
        ? { ...country, league: { ...country.league, cash: cost * 30 } }
        : country,
    );
    return {
      w,
      state: atTier(swapWithSoccer({ ...start, countries }), w, w.config.win.requiredTier),
    };
  }

  /** Plays until the anchor league is gone or the turn limit, checking invariants every turn. */
  function playUntilAnchorFalls(w: World, state: GameState, limit = 200): GameState {
    let current = state;
    const index = countryIndex(w, ANCHOR);
    for (let turn = 0; turn < limit && current.outcome === null; turn += 1) {
      current = endTurn(current, w);
      expect(checkInvariants(current, w)).toStrictEqual([]);
      if (current.countries[index]?.league === null) break;
    }
    return current;
  }

  const collapseTurn = (() => {
    const { w, state } = sinkingLeader(1000);
    return playUntilAnchorFalls(w, state).outcome?.turn ?? 0;
  })();

  it("before the win, an anchor collapse still ends the campaign", () => {
    // Health moves one rung per turn, so a collapse needs three turns from Healthy.
    expect(collapseTurn).toBeGreaterThanOrEqual(3);
    const { w, state } = sinkingLeader(1000);
    const ended = playUntilAnchorFalls(w, state);
    expect(ended.outcome).toMatchObject({ kind: "anchorCollapse", countryId: ANCHOR });
    expect(ended.win.won).toBeNull();
    expect(ended.win.turnsHeld).toBe(collapseTurn - 1);
  });

  it("a collapse on the turn the hold would complete ends the campaign: the loss comes first", () => {
    const { w, state } = sinkingLeader(collapseTurn);
    const ended = playUntilAnchorFalls(w, state);
    expect(ended.outcome).toMatchObject({ kind: "anchorCollapse", turn: collapseTurn });
    expect(ended.win.won).toBeNull();
    expect(kinds(ended)).not.toContain("won");
  });

  it("after the win, an anchor collapse is a Moment and the campaign goes on", () => {
    const { w, state } = sinkingLeader(collapseTurn - 1);
    const fallen = playUntilAnchorFalls(w, state);
    const index = countryIndex(w, ANCHOR);
    expect(fallen.win.won?.turn).toBe(collapseTurn - 1);
    expect(fallen.outcome).toBeNull();
    expect(fallen.countries[index]?.league).toBeNull();
    expect(fallen.countries[index]?.leaguesFolded).toBe(1);
    expect(fallen.landmarks.at(-1)).toMatchObject({
      kind: "birthplaceOutlived",
      turn: collapseTurn,
      countryId: ANCHOR,
    });
    expect(kinds(fallen)).not.toContain("anchorCollapse");
    // The campaign keeps playing, and a save of it loads and resumes identically.
    const text = serializeSave(fallen);
    let uninterrupted = fallen;
    let resumed = deserializeSave(text, w);
    for (let i = 0; i < 5; i += 1) {
      uninterrupted = endTurn(uninterrupted, w);
      resumed = endTurn(resumed, w);
    }
    expect(resumed).toStrictEqual(uninterrupted);
    expect(uninterrupted.outcome).toBeNull();
    expect(checkInvariants(uninterrupted, w)).toStrictEqual([]);
  });
});
