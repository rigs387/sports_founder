import { playerFandomScore } from "./fandom";
import { stepQuarter } from "./quarter";
import type { Config, GameState, PpTier, World } from "./types";

export function tierEntry(tier: number, config: Config): PpTier {
  const entry = config.ppTiers.find((candidate) => candidate.tier === tier);
  if (!entry) throw new Error(`No PP tier ${tier} in config`);
  return entry;
}

export function turnLengthQuarters(tier: number, config: Config): number {
  return tierEntry(tier, config).turnLengthQuarters;
}

/**
 * Ends the current turn: simulates the turn's quarters (length set by the PP tier at the start
 * of the turn), then checks for a tier-up. A tier-up changes turn length from the next turn on
 * and adds the new tier's focus slots, empty.
 */
export function endTurn(state: GameState, world: World): GameState {
  const quarters = turnLengthQuarters(state.ppTier, world.config);
  let next = state;
  for (let i = 0; i < quarters; i += 1) {
    next = stepQuarter(next, world);
  }
  const ppTier = tierAfterTurn(next, world);
  return { ...next, turn: state.turn + 1, ppTier, focus: resizeFocus(next.focus, ppTier, world) };
}

function resizeFocus(focus: (string | null)[], tier: number, world: World): (string | null)[] {
  const slots = tierEntry(tier, world.config).focusSlots;
  if (focus.length === slots) return focus;
  const resized = focus.slice(0, slots);
  while (resized.length < slots) resized.push(null);
  return resized;
}

/** Plays `turns` turns in a row, calling `onTurn` after each. */
export function runTurns(
  state: GameState,
  world: World,
  turns: number,
  onTurn?: (state: GameState) => void,
): GameState {
  let current = state;
  for (let i = 0; i < turns; i += 1) {
    current = endTurn(current, world);
    onTurn?.(current);
  }
  return current;
}

// PLACEHOLDER tier rule: promote on Fandom Score alone, at most one tier per turn, never demote.
// The GDD breadth conditions, telegraphing, demotion, and cooldowns come with the PP tier system.
function tierAfterTurn(state: GameState, world: World): number {
  const { config } = world;
  const nextTier = config.ppTiers.find((tier) => tier.tier === state.ppTier + 1);
  if (!nextTier) return state.ppTier;
  const score = playerFandomScore(state.sports, state.countries, config.fandomScore.casualWeight);
  return score >= nextTier.fandomScoreRequired ? nextTier.tier : state.ppTier;
}
