import { computeExposure } from "./spread";
import { tierEntry } from "./turn";
import type { GameState, World } from "./types";

// The player's legal actions (GDD Spread Model: focus slots, cold launches). Every action, from
// the UI or a bot, goes through applyAction, which validates legality first, so nothing can
// bypass the rules.

export type Action = {
  type: "assignFocus";
  /** Slot index, 0-based. Assigning an occupied slot moves it. */
  slot: number;
  countryId: string;
};

export class IllegalActionError extends Error {
  override name = "IllegalActionError";
  readonly action: Action;

  constructor(action: Action, reason: string) {
    super(`Illegal action ${JSON.stringify(action)}: ${reason}`);
    this.action = action;
  }
}

/**
 * PP cost of pointing a focus slot at a country. A cold launch (no exposure) costs the most;
 * existing organic exposure makes it cheaper, down to exposedCost once exposure reaches
 * costSaturationExposure. Scaled by the tier's cost multiplier ("growing pains").
 */
export function focusCostFromExposure(organicExposure: number, tier: number, world: World): number {
  const { focus } = world.config;
  const level = Math.min(1, organicExposure / focus.costSaturationExposure);
  const base = focus.coldLaunchCost - (focus.coldLaunchCost - focus.exposedCost) * level;
  return base * tierEntry(tier, world.config).costMultiplier;
}

export function focusCost(state: GameState, world: World, countryId: string): number {
  const index = world.countries.findIndex((country) => country.id === countryId);
  if (index < 0) throw new Error(`Unknown country "${countryId}"`);
  const exposure = computeExposure(state, world)[index];
  return focusCostFromExposure(exposure?.organic ?? 0, state.ppTier, world);
}

/** Returns why an action is illegal, or null if it is legal. */
export function checkAction(state: GameState, world: World, action: Action): string | null {
  if (action.type !== "assignFocus") return `unknown action type "${String(action.type)}"`;
  if (!Number.isInteger(action.slot) || action.slot < 0 || action.slot >= state.focus.length) {
    return `slot ${action.slot} does not exist (you have ${state.focus.length} focus slot(s) at PP tier ${state.ppTier})`;
  }
  if (!world.countries.some((country) => country.id === action.countryId)) {
    return `unknown country "${action.countryId}"`;
  }
  if (state.focus.includes(action.countryId)) {
    return `"${action.countryId}" already has a focus slot`;
  }
  const cost = focusCost(state, world, action.countryId);
  if (state.pp < cost) {
    return `not enough PP: costs ${cost.toFixed(1)}, you have ${state.pp.toFixed(1)}`;
  }
  return null;
}

/** Applies a legal action. Throws IllegalActionError otherwise. Pure: returns a new state. */
export function applyAction(state: GameState, world: World, action: Action): GameState {
  const reason = checkAction(state, world, action);
  if (reason !== null) throw new IllegalActionError(action, reason);
  const cost = focusCost(state, world, action.countryId);
  const focus = [...state.focus];
  focus[action.slot] = action.countryId;
  return { ...state, pp: state.pp - cost, focus };
}
