import { sportTotals } from "./fandom";
import { landmarks } from "./records";
import type { GameState, Landmark, WinTrack, World } from "./types";

// The win condition (GDD Win condition, Post-win play). Checked once per turn, after the tier
// track: the player's sport must end holdTurns turns in a row as #1 by global Fandom Score among
// modeled sports (the "other" bucket is not a sport) while at PP tier requiredTier or above
// (decided 2026-09-18: a Backyard Game cannot be the world's sport). A turn short of either restarts
// the hold. Winning never ends the campaign — the win is its own state, never GameState.outcome —
// and #1 can be lost and regained afterwards; every change of #1 is a landmark, at any tier. A turn
// that ends in an anchor collapse before the win ends the campaign before this check runs, so a
// collapse always beats a win landing on the same turn.

export interface Standing {
  /** The player's rank among modeled sports, 1 = first. */
  rank: number;
  /** The modeled rival with the highest Fandom Score (first in content order on a tie). */
  leadingRivalId: string | null;
}

export function standing(state: Pick<GameState, "sports" | "countries">, world: World): Standing {
  const totals = sportTotals(state, world);
  const player = totals.find((sport) => sport.kind === "player");
  let leading: (typeof totals)[number] | null = null;
  let rank = 1;
  for (const sport of totals) {
    if (sport.kind !== "rival") continue;
    if (player && sport.fandomScore > player.fandomScore) rank += 1;
    if (leading === null || sport.fandomScore > leading.fandomScore) leading = sport;
  }
  return { rank, leadingRivalId: leading?.sportId ?? null };
}

/** Whether a turn ending at `rank` and `ppTier` counts toward the win hold. */
export function countsTowardHold(rank: number, ppTier: number, world: World): boolean {
  return rank === 1 && ppTier >= world.config.win.requiredTier;
}

/** Applies the end-of-turn win check. `state` is after the turn's quarters and the tier check. */
export function updateWinTrack(state: GameState, world: World): GameState {
  if (state.outcome !== null) return state;
  const { rank, leadingRivalId } = standing(state, world);
  const { turn, quarter } = state;
  const previous = state.win;
  const found: Landmark[] = [];
  const atTop = rank === 1;

  if (atTop && !previous.atTop) found.push(landmarks.rankOneTaken(turn, quarter));
  if (!atTop && previous.atTop) {
    // Below #1 means some rival is ahead, so there is a leading rival.
    if (leadingRivalId === null) throw new Error("The player is below #1 with no rival ahead");
    found.push(landmarks.rankOneLost(turn, quarter, leadingRivalId));
  }

  const turnsHeld = countsTowardHold(rank, state.ppTier, world) ? previous.turnsHeld + 1 : 0;
  let won = previous.won;
  if (won === null && turnsHeld >= world.config.win.holdTurns) {
    won = { turn, quarter };
    found.push(landmarks.won(turn, quarter, turnsHeld));
  }

  const win: WinTrack = { atTop, turnsHeld, won };
  if (atTop === previous.atTop && turnsHeld === previous.turnsHeld && won === previous.won) {
    return state;
  }
  return {
    ...state,
    win,
    landmarks: found.length > 0 ? [...state.landmarks, ...found] : state.landmarks,
  };
}
