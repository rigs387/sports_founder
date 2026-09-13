import {
  type Action,
  applyAction,
  checkAction,
  computeExposure,
  type GameState,
  PLAYER_INDEX,
  type World,
} from "../sim";

// Bot focus policies (tech plan 2.1). Bots act only through applyAction, the same legal actions
// as the player. These thresholds shape bot behavior only; they are not game balance.

export type PolicyId = "greedy-spread" | "none";
export const POLICY_IDS: PolicyId[] = ["greedy-spread", "none"];

/** A slot moves on once its country's player Fandom Score share reaches this. */
const SATURATED_SHARE = 0.15;

export interface PolicyStep {
  state: GameState;
  actions: Action[];
}

/**
 * Greedy spread: every slot that is empty, or whose country is saturated, moves to the unfocused
 * country with the most exposure (cheapest, most promising), larger population first on ties,
 * when the PP is there.
 */
export function greedySpread(state: GameState, world: World): PolicyStep {
  let current = state;
  const actions: Action[] = [];
  const exposure = computeExposure(current, world);
  const shareOf = (countryId: string) => {
    const index = world.countries.findIndex((country) => country.id === countryId);
    const fans = current.countries[index]?.fans[PLAYER_INDEX];
    const population = world.countries[index]?.population ?? 1;
    if (!fans) return 0;
    return (fans.hardcore + fans.casual * world.config.fandomScore.casualWeight) / population;
  };
  const candidates = world.countries
    .map((country, index) => ({
      id: country.id,
      population: country.population,
      exposure: exposure[index]?.organic ?? 0,
    }))
    .sort((a, b) => b.exposure - a.exposure || b.population - a.population);

  for (let slot = 0; slot < current.focus.length; slot += 1) {
    const here = current.focus[slot] ?? null;
    if (here !== null && shareOf(here) < SATURATED_SHARE) continue;
    for (const candidate of candidates) {
      if (current.focus.includes(candidate.id)) continue;
      const action: Action = { type: "assignFocus", slot, countryId: candidate.id };
      if (checkAction(current, world, action) !== null) continue;
      current = applyAction(current, world, action);
      actions.push(action);
      break;
    }
  }
  return { state: current, actions };
}

export function runPolicy(policy: PolicyId, state: GameState, world: World): PolicyStep {
  return policy === "greedy-spread" ? greedySpread(state, world) : { state, actions: [] };
}
