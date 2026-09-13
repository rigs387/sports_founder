import { turnLengthQuarters } from "./calendar";
import { evaluateLeagues } from "./leagues";
import { stepQuarter } from "./quarter";
import { applyDefaultSlotDrops, updateTierTrack } from "./tiers";
import type { GameState, World } from "./types";

export class CampaignOverError extends Error {
  override name = "CampaignOverError";
}

/**
 * Ends the current turn (GDD Turn anatomy, Time advancement rules):
 * 1. focus slots still owed after a demotion are dropped by default (highest-numbered first);
 * 2. the turn's quarters are simulated, with length set by the PP tier at the start of the turn;
 * 3. every league's health is evaluated once and moves at most one rung; collapses fold leagues,
 *    and an anchor collapse ends the campaign;
 * 4. the PP tier track is checked; a tier change takes effect from the next turn.
 * Turns always complete. Refuses to play a campaign that has already ended.
 */
export function endTurn(state: GameState, world: World): GameState {
  if (state.outcome !== null) {
    throw new CampaignOverError(
      `The campaign ended on turn ${state.outcome.turn} (${state.outcome.kind}); no more turns can be played`,
    );
  }
  const start = applyDefaultSlotDrops(state);
  const quarters = turnLengthQuarters(start.ppTier, world.config);
  let next = start;
  for (let i = 0; i < quarters; i += 1) next = stepQuarter(next, world);

  const evaluation = evaluateLeagues(start, next, world, quarters);
  next = {
    ...next,
    outcome: evaluation.outcome,
    countries: evaluation.countries,
    landmarks:
      evaluation.landmarks.length > 0
        ? [...next.landmarks, ...evaluation.landmarks]
        : next.landmarks,
  };
  next = updateTierTrack(next, world);
  return { ...next, turn: start.turn + 1 };
}

/** Plays up to `turns` turns in a row, calling `onTurn` after each; stops if the campaign ends. */
export function runTurns(
  state: GameState,
  world: World,
  turns: number,
  onTurn?: (state: GameState) => void,
): GameState {
  let current = state;
  for (let i = 0; i < turns && current.outcome === null; i += 1) {
    current = endTurn(current, world);
    onTurn?.(current);
  }
  return current;
}
