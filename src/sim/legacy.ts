import { CONTINENTS } from "../content";
import { yearOfQuarter } from "./calendar";
import type { EventState } from "./events-state";
import { landmarks } from "./records";
import { countryStandings, standingsSnapshot } from "./standings";
import {
  type GameState,
  type Landmark,
  LEGACY_GOALS,
  type LegacyGoalId,
  PLAYER_INDEX,
  PLAYER_SPORT_ID,
  type World,
} from "./types";

// Legacy goals (GDD v1.38): long targets for a sport that means to last. They are listed from the
// start and earned at any time, before or after the win; a goal once met stays met. Each is read
// from the state and its records, pays nothing, and is told once as a headline.

export function newLegacy(): GameState["legacy"] {
  return { done: [] };
}

/** How far each goal has come: `have` of `need`, in the list's order. */
export interface LegacyProgress {
  goalId: LegacyGoalId;
  have: number;
  need: number;
}

/** The countries where the heartland sport started with the most hardcore fans. */
export function heartlands(world: World): number[] {
  const { sportId, countries } = world.config.legacyGoals.heartlands;
  return world.countries
    .map((country, index) => ({
      index,
      fans: (country.startingRivalFans[sportId]?.hardcore ?? 0) * country.population,
    }))
    .filter((entry) => entry.fans > 0)
    .sort((a, b) => b.fans - a.fans || a.index - b.index)
    .slice(0, countries)
    .map((entry) => entry.index);
}

export function legacyProgress(state: GameState, world: World): LegacyProgress[] {
  const rules = world.config.legacyGoals;
  const continentOf = (id: string) => world.countries.find((c) => c.id === id)?.continent;

  // #1 on a continent: the player's Fandom Score there beats every rival's.
  const ledContinents = CONTINENTS.filter((continent) => {
    const totals = new Map<string, number>();
    state.countries.forEach((_, index) => {
      if (world.countries[index]?.continent !== continent) return;
      for (const sport of countryStandings(state, world, index))
        totals.set(sport.sportId, (totals.get(sport.sportId) ?? 0) + sport.fandomScore);
    });
    const own = totals.get(PLAYER_SPORT_ID) ?? 0;
    return own > 0 && [...totals].every(([id, score]) => id === PLAYER_SPORT_ID || own > score);
  }).length;

  const home = heartlands(world);
  const heartlandRival = state.sports.findIndex((s) => s.id === rules.heartlands.sportId);
  const wonHeartlands = home.filter((index) => {
    const fans = state.countries[index]?.fans;
    const score = (i: number) =>
      (fans?.[i]?.hardcore ?? 0) + (fans?.[i]?.casual ?? 0) * world.config.fandomScore.casualWeight;
    return score(PLAYER_INDEX) > score(heartlandRival);
  }).length;

  const elite = state.countries.filter((country) => country.league?.tier === "elite").length;
  const withLeague = state.countries.filter((country) => country.league !== null).length;
  const yearsOnTop = standingsSnapshot(state, world).series.filter((year) => {
    const own = year.scores[PLAYER_SPORT_ID] ?? 0;
    return (
      own > 0 && Object.entries(year.scores).every(([id, s]) => id === PLAYER_SPORT_ID || own > s)
    );
  }).length;
  const { tournaments } = state.worldChampionship;
  const hosted = new Set(tournaments.map((tournament) => continentOf(tournament.hostId)));
  hosted.delete(undefined);
  const anchorTitles = tournaments.filter((t) => t.championId === state.anchorCountryId).length;

  const progress: Record<LegacyGoalId, [number, number]> = {
    everyContinent: [ledContinents, CONTINENTS.length],
    heartlands: [wonHeartlands, home.length],
    eliteLeagues: [elite, rules.eliteLeagues],
    everyMarket: [withLeague, state.countries.length],
    century: [yearsOnTop, rules.centuryYears],
    hostEveryContinent: [hosted.size, CONTINENTS.length],
    anchorChampion: [Math.min(1, anchorTitles), 1],
  };
  return LEGACY_GOALS.map((goalId) => ({
    goalId,
    have: Math.min(progress[goalId][0], progress[goalId][1]),
    need: progress[goalId][1],
  }));
}

/**
 * The legacy goals' turn, at the end of `endTurn`: every goal newly met is recorded for good,
 * with a landmark. Leading by fans can be lost again; the goal stays met.
 */
export function updateLegacy(state: GameState, world: World): GameState {
  if (state.legacy.done.length === LEGACY_GOALS.length) return state;
  const met = new Set(state.legacy.done.map((entry) => entry.goalId));
  const fresh = legacyProgress(state, world).filter(
    (goal) => !met.has(goal.goalId) && goal.need > 0 && goal.have >= goal.need,
  );
  if (fresh.length === 0) return state;
  const year = yearOfQuarter(state.quarter, world.config);
  return {
    ...state,
    legacy: {
      done: [
        ...state.legacy.done,
        ...fresh.map((goal) => ({ goalId: goal.goalId, turn: state.turn, year })),
      ],
    },
    landmarks: [
      ...state.landmarks,
      ...fresh.map((goal) =>
        landmarks.legacyGoal(state.turn, state.quarter, state.anchorCountryId, goal.goalId),
      ),
    ],
  };
}

/** Each goal as the UI lists it: its progress, and when it was met. */
export interface LegacySnapshot {
  /** The rival the heartlands goal is about. */
  heartlandSportId: string;
  goals: (LegacyProgress & { done: { turn: number; year: number } | null })[];
}

export function legacySnapshot(state: GameState, world: World): LegacySnapshot {
  return {
    heartlandSportId: world.config.legacyGoals.heartlands.sportId,
    goals: legacyProgress(state, world).map((goal) => {
      const done = state.legacy.done.find((entry) => entry.goalId === goal.goalId);
      return {
        ...goal,
        // A goal once met reads as met, whatever has happened since.
        have: done ? goal.need : goal.have,
        done: done ? { turn: done.turn, year: done.year } : null,
      };
    }),
  };
}

/** Offers a headline for each legacy goal the recent landmarks record. It takes no slot. */
export function offerLegacyCards(
  state: GameState,
  world: World,
  recent: readonly Landmark[],
  events: EventState,
): EventState {
  const card = world.events.cards.find((c) => c.trigger === "legacy");
  if (!card || state.ppTier < card.minTier) return events;
  const pending = [...events.pending];
  let nextId = events.nextId;
  for (const landmark of recent) {
    if (landmark.kind !== "legacyGoal") continue;
    const country = state.countries.find((c) => c.countryId === landmark.countryId);
    const fans = country?.fans[PLAYER_INDEX];
    if (!country || !fans) continue;
    pending.push({
      id: nextId++,
      templateId: card.id,
      countryId: country.countryId,
      turn: state.turn,
      quarter: landmark.quarter,
      facts: {
        casual: fans.casual,
        hardcore: fans.hardcore,
        leagueTier: country.league?.tier ?? null,
        health: country.league?.health ?? null,
        rivalId: null,
        season: null,
        star: null,
        tradition: null,
        deal: null,
        venue: null,
        hall: null,
        countermove: null,
        championship: null,
        legacy: { goalId: landmark.goalId },
      },
      resolution: null,
    });
  }
  return { ...events, pending, nextId };
}

/** Every way the legacy record is invalid. */
export function legacyProblems(state: GameState): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const entry of state.legacy.done) {
    if (!LEGACY_GOALS.includes(entry.goalId) || seen.has(entry.goalId))
      problems.push(`legacy goal "${entry.goalId}" is unknown or recorded twice`);
    seen.add(entry.goalId);
    if (entry.turn > state.turn) problems.push(`legacy goal "${entry.goalId}" is in the future`);
  }
  return problems;
}
