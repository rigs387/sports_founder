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
  options: { format?: "european" | "american"; host?: number; newStarId?: number } = {},
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
    standings: order.map((clubId) => ({
      clubId,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
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
    newStarId: options.newStarId ?? null,
    crowd: null,
    recordCrowd: false,
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
