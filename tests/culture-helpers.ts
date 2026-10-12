import {
  activeClubs,
  createCampaign,
  type GameState,
  landmarks,
  ruleTraits,
  type SeasonSummary,
  type Tradition,
} from "../src/sim";
import { setupFor, world } from "./helpers";

// Helpers for the culture tests (GDD v1.22).

/** A recorded flagship season with this champion and runner-up, as the flagship records one. */
export function withSeason(
  state: GameState,
  championId: number,
  runnerUpId: number,
  options: {
    format?: "european" | "american";
    host?: number;
    newStarIds?: number[];
    recordCrowd?: boolean;
    /** An unbeaten champion (GDD v1.35: the Invincibles); otherwise every club lost once. */
    unbeaten?: boolean;
    /** The runner-up finished one win behind (GDD v1.36: a decisive meeting); else three. */
    close?: boolean;
  } = {},
): GameState {
  const clubs = activeClubs(state.flagship);
  const order = [championId, runnerUpId, ...clubs.map((c) => c.id)].filter(
    (id, i, all) => all.indexOf(id) === i,
  );
  const season = state.flagship.season;
  const quarter = state.quarter + 4;
  const summary: SeasonSummary = {
    season,
    quarter,
    countryId: state.flagship.countryId,
    format: options.format ?? "european",
    scoring: "medium",
    championId,
    runnerUpId,
    // Wins fall three a place (a close title race: the runner-up one behind), so only a
    // chosen race counts as a rivalry fact beyond the top two.
    standings: order.map((clubId, place) => ({
      clubId,
      played: 0,
      won: 30 - place * 3 + (options.close && place === 1 ? 2 : 0),
      drawn: 0,
      lost: options.unbeaten && clubId === championId ? 0 : 1,
      scoreFor: 0,
      scoreAgainst: 0,
      points: 0,
    })),
    playoffs:
      options.format === "american"
        ? [
            {
              homeId: options.host ?? championId,
              awayId: options.host === runnerUpId ? championId : runnerUpId,
              homeScore: 1,
              awayScore: 0,
              decidedFor: null,
            },
          ]
        : [],
    startRatings: [],
    topScorer: null,
    newStarIds: options.newStarIds ?? [],
    crowd: null,
    recordCrowd: options.recordCrowd ?? false,
    playerOfSeason: null,
  };
  return {
    ...state,
    quarter,
    flagship: {
      ...state.flagship,
      season: season + 1,
      seasons: [...state.flagship.seasons, summary],
    },
    landmarks: [
      ...state.landmarks,
      landmarks.seasonChampion(state.turn, quarter, summary.countryId, season, championId),
    ],
  };
}

export function fresh(birthplace = "schoolyard", seed = 11): GameState {
  const state = createCampaign(world, setupFor(seed));
  return { ...state, identity: { ...state.identity, birthplace } };
}

export const clubIds = (state: GameState) => activeClubs(state.flagship).map((c) => c.id);
export const ofType = (state: GameState, type: string) =>
  state.culture.traditions.filter((t) => t.type === type);

/** A state holding one living tradition (built directly, for effect tests). */
export function withTradition(
  state: GameState,
  type: Tradition["type"],
  countryId: string,
  extra: Partial<Tradition> = {},
): GameState {
  const tradition: Tradition = {
    id: state.culture.nextId,
    type,
    countryId,
    clubIds: [],
    playerId: null,
    name: null,
    seasons: [],
    rules: ruleTraits(state.genome),
    bornTurn: state.turn,
    bornQuarter: state.quarter,
    strength: 1,
    renewedYear: state.culture.year + 1,
    followers: [countryId],
    lost: null,
    ...extra,
  };
  return {
    ...state,
    culture: {
      ...state.culture,
      traditions: [...state.culture.traditions, tradition],
      nextId: tradition.id + 1,
    },
  };
}
