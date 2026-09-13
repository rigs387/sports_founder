import { fandomScore, type SportTotals, sportTotals } from "./fandom";
import { leverMultipliers, similarityEffect } from "./genome";
import { computeExposure } from "./spread";
import { turnLengthQuarters } from "./turn";
import { type GameState, type Genome, PLAYER_INDEX, type World } from "./types";

const QUARTERS_PER_YEAR = 4;

/** One country as the UI sees it: the player's standing there and why it is moving. */
export interface CountrySnapshot {
  countryId: string;
  population: number;
  casual: number;
  hardcore: number;
  fandomScore: number;
  /** Fandom Score ÷ population. */
  share: number;
  focused: boolean;
  exposure: number;
  affinity: number;
  accessibility: number;
  depth: number;
  /** Similarity to the country's dominant rival, 0–1. */
  rivalSimilarity: number;
}

/** What the UI shows after a turn. Plain data, cheap to send across the worker boundary. */
export interface TurnSnapshot {
  seed: number;
  anchorCountryId: string;
  genome: Genome;
  turn: number;
  quarter: number;
  year: number;
  quarterOfYear: number;
  ppTier: number;
  turnLengthQuarters: number;
  pp: number;
  focus: (string | null)[];
  sports: SportTotals[];
  /** Same order as content. */
  countries: CountrySnapshot[];
}

export function snapshot(state: GameState, world: World): TurnSnapshot {
  const exposure = computeExposure(state, world);
  const { casualWeight } = world.config.fandomScore;
  const countries = state.countries.map((countryState, index): CountrySnapshot => {
    const country = world.countries[index];
    const fans = countryState.fans[PLAYER_INDEX];
    if (!country || !fans) throw new Error(`Country #${index} is missing from content or state`);
    const levers = leverMultipliers(world, state.genome, index);
    const score = fandomScore(fans.casual, fans.hardcore, casualWeight);
    return {
      countryId: country.id,
      population: country.population,
      casual: fans.casual,
      hardcore: fans.hardcore,
      fandomScore: score,
      share: score / country.population,
      focused: exposure[index]?.focused ?? false,
      exposure: exposure[index]?.total ?? 0,
      affinity: levers.affinity,
      accessibility: levers.accessibility,
      depth: levers.depth,
      rivalSimilarity: similarityEffect(
        world,
        state.genome,
        countryState,
        state.sports,
        country.population,
      ).similarity,
    };
  });
  return {
    seed: state.seed,
    anchorCountryId: state.anchorCountryId,
    genome: state.genome,
    turn: state.turn,
    quarter: state.quarter,
    year: world.config.calendar.startYear + Math.floor(state.quarter / QUARTERS_PER_YEAR),
    quarterOfYear: (state.quarter % QUARTERS_PER_YEAR) + 1,
    ppTier: state.ppTier,
    turnLengthQuarters: turnLengthQuarters(state.ppTier, world.config),
    pp: state.pp,
    focus: [...state.focus],
    sports: sportTotals(state, world),
    countries,
  };
}
