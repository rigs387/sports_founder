import type { EventEffect } from "../content";
import {
  type Action,
  applyAction,
  checkAction,
  costMultiplier,
  eventBlocker,
  eventChoiceCost,
  type GameState,
  PLAYER_INDEX,
  type World,
} from "../sim";

// How bots answer event decisions (tech plan 2.1). Without this every bot took the free default,
// so no campaign ever tested whether a paid choice is worth its PP. Each bot weighs a choice's
// effects by what it cares about and pays when the value beats the price. Like the rest of
// policy.ts, these weights shape bot behavior only; they are not game balance.
//
// A choice's value is the sum of its effects, each measured as a relative change to a fan bucket
// or to the league, so different effect types can be compared:
//   conversion/spread  (factor − 1) × years it lasts
//   fanShift           fans moved ÷ the bucket they join (casual or hardcore)
//   hardcoreDemotion   − share of the player's hardcore lost
//   rivalSetback       rival hardcore removed ÷ the player's hardcore there
//   leagueHealth       rungs climbed
//   pp                 PP gained, at the bot's PP price
// The price is cost × ppPrice ÷ the PP cost multiplier, because PP income grows with the sport as
// fast as prices do.

export interface EventWeights {
  casual: number;
  hardcore: number;
  proximity: number;
  language: number;
  media: number;
  league: number;
  rival: number;
  /** Value of one PP at the starting cost multiplier. */
  ppPrice: number;
}

export const EVENT_WEIGHTS = {
  /** Values every gain alike and PP cheaply: the naive bot takes almost any upside. */
  greedy: {
    casual: 1,
    hardcore: 1,
    proximity: 1,
    language: 1,
    media: 1,
    league: 1,
    rival: 1,
    ppPrice: 0.005,
  },
  builder: {
    casual: 1,
    hardcore: 1,
    proximity: 1,
    language: 1,
    media: 1,
    league: 1,
    rival: 1,
    ppPrice: 0.01,
  },
  turtle: {
    casual: 0.5,
    hardcore: 2,
    proximity: 0.5,
    language: 0.3,
    media: 0.3,
    league: 3,
    rival: 1,
    ppPrice: 0.015,
  },
  media: {
    casual: 1.5,
    hardcore: 0.5,
    proximity: 0.5,
    language: 1.5,
    media: 2,
    league: 0.5,
    rival: 0.5,
    ppPrice: 0.01,
  },
} satisfies Record<string, EventWeights>;

function effectValue(
  state: GameState,
  world: World,
  countryId: string,
  rivalId: string | null,
  effect: EventEffect,
  weights: EventWeights,
): number {
  const index = world.countries.findIndex((country) => country.id === countryId);
  const country = state.countries[index];
  const fans = country?.fans[PLAYER_INDEX];
  const population = world.countries[index]?.population ?? 0;
  if (!country || !fans) return 0;
  switch (effect.type) {
    case "conversion":
    case "spread":
      return (effect.factor - 1) * (effect.quarters / 4) * weights[effect.target];
    case "fanShift":
      return effect.target === "uninterestedToCasual"
        ? ((population - fans.casual - fans.hardcore) * effect.share * weights.casual) /
            Math.max(1, fans.casual)
        : (fans.casual * effect.share * weights.hardcore) / Math.max(1, fans.hardcore);
    case "hardcoreDemotion":
      return -effect.share * weights.hardcore;
    case "rivalSetback": {
      const rival = country.fans.find((f) => f.sportId === rivalId);
      return ((rival?.hardcore ?? 0) * effect.share * weights.rival) / Math.max(1, fans.hardcore);
    }
    case "leagueHealth":
      return effect.steps * weights.league;
    case "pp":
      return (effect.amount * weights.ppPrice) / costMultiplier(state, world.config);
  }
}

/** Net value of a choice to a bot: its effects minus its price. */
export function choiceValue(
  state: GameState,
  world: World,
  eventId: number,
  choiceId: string,
  weights: EventWeights,
): number {
  const event = state.events.pending.find((e) => e.id === eventId);
  const card = world.events.cards.find((c) => c.id === event?.templateId);
  const choice = card?.choices.find((c) => c.id === choiceId);
  if (!event || !card || !choice) return Number.NEGATIVE_INFINITY;
  const gains = choice.effects.reduce(
    (sum, effect) =>
      sum + effectValue(state, world, event.countryId, event.facts.rivalId, effect, weights),
    0,
  );
  const price =
    (eventChoiceCost(state, world, card, choiceId) * weights.ppPrice) /
    costMultiplier(state, world.config);
  return gains - price;
}

/**
 * Answers every pending decision with its best-valued legal choice that leaves `reserve` PP, or
 * leaves it for the default when nothing beats the default. Moments are left for End Turn to
 * collect, as before.
 */
export function chooseEvents(
  state: GameState,
  world: World,
  weights: EventWeights,
  reserve: number,
): { state: GameState; actions: Action[] } {
  let current = state;
  const actions: Action[] = [];
  for (const event of state.events.pending) {
    const card = world.events.cards.find((c) => c.id === event.templateId);
    if (card?.kind !== "decision") continue;
    let best: { choiceId: string; value: number } | null = null;
    for (const choice of card.choices) {
      if (eventBlocker(current, world, event.id, choice.id) !== null) continue;
      const cost = eventChoiceCost(current, world, card, choice.id);
      if (cost > 0 && current.pp - cost < reserve) continue;
      const value = choiceValue(current, world, event.id, choice.id, weights);
      const isDefault = choice.id === card.defaultChoice;
      if (best === null || value > best.value || (value === best.value && isDefault)) {
        best = { choiceId: choice.id, value };
      }
    }
    if (best === null || best.choiceId === card.defaultChoice) continue;
    const action: Action = { type: "chooseEvent", eventId: event.id, choiceId: best.choiceId };
    if (checkAction(current, world, action) !== null) continue;
    current = applyAction(current, world, action);
    actions.push(action);
  }
  return { state: current, actions };
}
