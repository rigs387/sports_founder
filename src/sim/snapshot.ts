import { type SportTotals, sportTotals } from "./fandom";
import { turnLengthQuarters } from "./turn";
import type { GameState, World } from "./types";

const QUARTERS_PER_YEAR = 4;

/** What the UI shows after a turn. Plain data, cheap to send across the worker boundary. */
export interface TurnSnapshot {
  seed: number;
  anchorCountryId: string;
  turn: number;
  quarter: number;
  year: number;
  quarterOfYear: number;
  ppTier: number;
  turnLengthQuarters: number;
  pp: number;
  sports: SportTotals[];
}

export function snapshot(state: GameState, world: World): TurnSnapshot {
  return {
    seed: state.seed,
    anchorCountryId: state.anchorCountryId,
    turn: state.turn,
    quarter: state.quarter,
    year: world.config.calendar.startYear + Math.floor(state.quarter / QUARTERS_PER_YEAR),
    quarterOfYear: (state.quarter % QUARTERS_PER_YEAR) + 1,
    ppTier: state.ppTier,
    turnLengthQuarters: turnLengthQuarters(state.ppTier, world.config),
    pp: state.pp,
    sports: sportTotals(state, world),
  };
}
