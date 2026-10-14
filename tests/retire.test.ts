import { describe, expect, it } from "vitest";
import { BOT_IDS, runBot } from "../src/runner/policy";
import {
  applyAction,
  CampaignOverError,
  checkAction,
  checkInvariants,
  createCampaign,
  deserializeSave,
  endTurn,
  type GameState,
  IllegalActionError,
  landmarks,
  serializeSave,
  snapshot,
  timeline,
} from "../src/sim";
import { setupFor, world } from "./helpers";

// Retiring and the retrospective (GDD v1.38): after the win the player may end the campaign; the
// retired campaign plays no more, stays loadable and looks back on its retained records.

const ANCHOR = "austria";
const played = endTurn(endTurn(createCampaign(world, setupFor(11, ANCHOR)), world), world);
/** The campaign as if it had been won on its first turn. */
const won: GameState = { ...played, win: { ...played.win, won: { turn: 1, quarter: 1 } } };

describe("retiring", () => {
  it("is illegal before the win", () => {
    expect(checkAction(played, world, { type: "retire" })).toMatch(/after the win/);
    expect(() => applyAction(played, world, { type: "retire" })).toThrow(IllegalActionError);
    expect(snapshot(played, world).canRetire).toBe(false);
    expect(snapshot(played, world).retrospective).toBeNull();
  });

  it("ends the campaign after the win: no more turns, no more actions", () => {
    expect(snapshot(won, world).canRetire).toBe(true);
    const retired = applyAction(won, world, { type: "retire" });
    expect(retired.outcome).toEqual({
      kind: "retired",
      turn: won.turn,
      quarter: won.quarter,
      countryId: ANCHOR,
    });
    expect(checkInvariants(retired, world)).toEqual([]);
    expect(() => endTurn(retired, world)).toThrow(CampaignOverError);
    expect(checkAction(retired, world, { type: "retire" })).toMatch(/ended/);
    expect(snapshot(retired, world).canRetire).toBe(false);
    // Everything but the outcome is as it was.
    expect({ ...retired, outcome: null }).toEqual(won);
  });

  it("stays loadable: the save round-trips with its retrospective", () => {
    const retired = applyAction(won, world, { type: "retire" });
    const loaded = deserializeSave(serializeSave(retired), world);
    expect(loaded).toEqual(retired);
    expect(snapshot(loaded, world).retrospective).toEqual(snapshot(retired, world).retrospective);
  });

  it("is never chosen by a bot", () => {
    for (const bot of BOT_IDS)
      expect(runBot(bot, won, world).actions.map((action) => action.type)).not.toContain("retire");
  });
});

describe("the retrospective", () => {
  it("opens with the founding and closes with the retirement", () => {
    const retired = applyAction(won, world, { type: "retire" });
    const view = snapshot(retired, world).retrospective;
    expect(view?.foundedYear).toBe(world.config.calendar.startYear);
    expect(view?.timeline[0]).toMatchObject({ kind: "founded", countryId: ANCHOR, turn: 1 });
    expect(view?.timeline.at(-1)).toEqual({
      kind: "retired",
      turn: retired.turn,
      year: view?.retiredYear,
    });
  });

  it("tells the turning points from the landmarks, firsts only once", () => {
    const state: GameState = {
      ...won,
      landmarks: [
        { kind: "leagueFormed", turn: 1, quarter: 0, countryId: ANCHOR, reformed: false },
        { kind: "leagueFormed", turn: 2, quarter: 4, countryId: "germany", reformed: false },
        { kind: "leagueFormed", turn: 2, quarter: 5, countryId: "italy", reformed: false },
        landmarks.ppTierUp(2, 6, 1, 2),
        { kind: "ppTierDown", turn: 2, quarter: 7, from: 2, to: 1 },
        landmarks.ppTierUp(2, 8, 1, 2),
        landmarks.ppTierUp(2, 9, 2, 3),
        { kind: "rankOneTaken", turn: 2, quarter: 9 },
        landmarks.rankOneLost(2, 10, "soccer"),
        landmarks.seatMoved(2, 10, ANCHOR, "germany", "moved"),
        landmarks.seatMoved(2, 11, "germany", ANCHOR, "returned"),
        landmarks.legacyGoal(2, 11, ANCHOR, "eliteLeagues"),
      ],
    };
    expect(timeline(state, world).map((entry) => entry.kind)).toEqual([
      "founded",
      "firstLeagueAbroad",
      "tier",
      "tier",
      "rankOneTaken",
      "rankOneLost",
      "seatMoved",
      "legacyGoal",
    ]);
    const year = world.config.calendar.startYear;
    expect(timeline(state, world)[1]).toEqual({
      kind: "firstLeagueAbroad",
      countryId: "germany",
      turn: 2,
      year: year + 1,
    });
    expect(timeline(state, world).filter((entry) => entry.kind === "tier")).toMatchObject([
      { tier: 2 },
      { tier: 3 },
    ]);
  });
});
