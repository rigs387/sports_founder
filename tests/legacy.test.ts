import { describe, expect, it } from "vitest";
import {
  checkInvariants,
  createCampaign,
  deserializeSave,
  endTurn,
  type GameState,
  heartlands,
  LEGACY_GOALS,
  legacyProgress,
  newLeague,
  offerEvents,
  PLAYER_INDEX,
  serializeSave,
  snapshot,
  updateLegacy,
} from "../src/sim";
import { setupFor, world } from "./helpers";

// Legacy goals (GDD v1.38): long targets, earned at any time and kept for good.

const rules = world.config.legacyGoals;
const of = (state: GameState, goalId: (typeof LEGACY_GOALS)[number]) => {
  const goal = legacyProgress(state, world).find((entry) => entry.goalId === goalId);
  if (!goal) throw new Error(`no goal ${goalId}`);
  return goal;
};

/** The campaign with the player's sport far ahead of every rival in the given countries. */
function leading(state: GameState, indexes: readonly number[]): GameState {
  const chosen = new Set(indexes);
  return {
    ...state,
    countries: state.countries.map((country, index) =>
      chosen.has(index)
        ? {
            ...country,
            fans: country.fans.map((fans, sport) =>
              sport === PLAYER_INDEX
                ? { ...fans, hardcore: world.countries[index]?.population ?? 0 }
                : { ...fans, casual: 0, hardcore: 0 },
            ),
          }
        : country,
    ),
  };
}

describe("legacy goals", () => {
  const base = createCampaign(world, setupFor(7, "brazil"));

  it("are all listed from the start with nothing met, and survive a save", () => {
    const progress = legacyProgress(base, world);
    expect(progress.map((goal) => goal.goalId)).toEqual([...LEGACY_GOALS]);
    expect(progress.every((goal) => goal.need > 0 && goal.have < goal.need)).toBe(true);
    expect(of(base, "everyMarket")).toEqual({ goalId: "everyMarket", have: 1, need: 213 });
    expect(of(base, "eliteLeagues").need).toBe(rules.eliteLeagues);
    expect(base.legacy.done).toEqual([]);
    expect(updateLegacy(base, world)).toBe(base);
    expect(snapshot(base, world).legacy.goals.every((goal) => goal.done === null)).toBe(true);
    expect(deserializeSave(serializeSave(base), world).legacy).toEqual(base.legacy);
  });

  it("count the heartlands where the sport leads soccer, and the continents it leads", () => {
    const home = heartlands(world);
    expect(home).toHaveLength(rules.heartlands.countries);
    const two = leading(base, home.slice(0, 2));
    expect(of(two, "heartlands")).toMatchObject({ have: 2, need: home.length });
    const all = leading(base, home);
    expect(of(all, "heartlands").have).toBe(home.length);
    const everywhere = leading(
      base,
      base.countries.map((_, index) => index),
    );
    expect(of(everywhere, "everyContinent")).toMatchObject({ have: 6, need: 6 });
    expect(of(base, "everyContinent").have).toBe(0);
  });

  it("are met for good with a landmark and a headline, whatever happens after", () => {
    const elite: GameState = {
      ...base,
      countries: base.countries.map((country, index) =>
        index < rules.eliteLeagues
          ? { ...country, league: { ...newLeague(world, index, 0, 0, []), tier: "elite" as const } }
          : country,
      ),
    };
    const met = updateLegacy(elite, world);
    expect(met.legacy.done.map((entry) => entry.goalId)).toEqual(["eliteLeagues"]);
    expect(met.landmarks.at(-1)).toMatchObject({ kind: "legacyGoal", goalId: "eliteLeagues" });
    expect(checkInvariants(met, world)).toEqual([]);
    // Met once: not recorded again.
    expect(updateLegacy(met, world)).toBe(met);
    // The leagues fold; the goal stays met and reads as met.
    const gone: GameState = { ...met, countries: base.countries };
    expect(of(gone, "eliteLeagues").have).toBeLessThan(rules.eliteLeagues);
    const listed = snapshot(gone, world).legacy.goals.find((g) => g.goalId === "eliteLeagues");
    expect(listed).toMatchObject({ have: rules.eliteLeagues, need: rules.eliteLeagues });
    expect(listed?.done?.turn).toBe(met.turn);
    // The card is a headline that takes no slot.
    const told = snapshot(offerEvents(met, world, 1), world).events.find(
      (event) => event.templateId === "legacy-goal",
    );
    expect(told?.weight).toBe("headline");
    expect(told?.facts.legacy).toEqual({ goalId: "eliteLeagues" });
  });

  it("read the championship's record: hosts by continent and the anchor's title", () => {
    const tournament = (hostId: string, championId: string, season: number) => ({
      season,
      year: 2030 + season,
      hostId,
      teams: [],
      rounds: [],
      championId,
    });
    const hosted: GameState = {
      ...base,
      worldChampionship: {
        ...base.worldChampionship,
        tournaments: [tournament("japan", "japan", 1), tournament("france", "germany", 2)],
      },
    };
    expect(of(hosted, "hostEveryContinent")).toMatchObject({ have: 2, need: 6 });
    expect(of(hosted, "anchorChampion").have).toBe(0);
    const champions: GameState = {
      ...hosted,
      worldChampionship: {
        ...hosted.worldChampionship,
        tournaments: [...hosted.worldChampionship.tournaments, tournament("kenya", "brazil", 3)],
      },
    };
    expect(of(champions, "hostEveryContinent").have).toBe(3);
    expect(of(champions, "anchorChampion")).toMatchObject({ have: 1, need: 1 });
  });

  it("count a year at the top only when the year's record has the sport first", () => {
    let state = base;
    while (state.yearly.length < 1) state = endTurn(state, world);
    expect(of(state, "century")).toMatchObject({ have: 0, need: rules.centuryYears });
    // A recorded year with every rival's fans gone: the sport was first that year.
    const sports = state.sports.length;
    const first = state.yearly[0];
    if (!first) throw new Error("no yearly record");
    const fans = first.fans.map((value, i) => {
      const sport = Math.floor(i / 2) % sports;
      return sport === PLAYER_INDEX ? value + 1000 : 0;
    });
    const onTop: GameState = { ...state, yearly: [{ ...first, fans }] };
    expect(of(onTop, "century").have).toBe(1);
  });
});
