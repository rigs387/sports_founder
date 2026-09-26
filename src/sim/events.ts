import type { EventEffect, EventTemplate } from "../content";
import { costMultiplier } from "./calendar";
import type { EventRecord } from "./events-state";
import { type GameState, HEALTH_LEVELS, PLAYER_INDEX, type World } from "./types";

export function eventFactors(
  state: Pick<GameState, "events" | "quarter">,
  world: World,
  countryId: string,
) {
  const factors = { casual: 1, hardcore: 1, proximity: 1, language: 1, media: 1 };
  if (state.events.modifiers.length === 0) return factors;
  for (const modifier of state.events.modifiers)
    if (modifier.countryId === countryId && modifier.endQuarter > state.quarter)
      factors[modifier.effect.target] *= modifier.effect.factor;
  const { minFactor, maxFactor } = world.events.settings;
  for (const key of Object.keys(factors) as (keyof typeof factors)[])
    factors[key] = Math.max(minFactor, Math.min(maxFactor, factors[key]));
  return factors;
}

const keyFor = (card: EventTemplate, countryId: string) =>
  card.scope === "campaign" ? card.id : `${card.id}/${countryId}`;

/** Priority then audience then content order: no wall clock or extra random stream. */
export function offerEvents(state: GameState, world: World, elapsedQuarters: number): GameState {
  if (state.outcome) return state;
  const settings = world.events.settings;
  const recent = state.landmarks.slice(state.events.landmarkCursor);
  const ranked = state.countries
    .map((country, index) => ({ country, index }))
    .sort((a, b) => {
      const aFans = a.country.fans[PLAYER_INDEX];
      const bFans = b.country.fans[PLAYER_INDEX];
      return (
        (bFans?.casual ?? 0) +
          (bFans?.hardcore ?? 0) -
          ((aFans?.casual ?? 0) + (aFans?.hardcore ?? 0)) || a.index - b.index
      );
    });
  const activeMarkets = ranked.filter(({ country }) => {
    const fans = country.fans[PLAYER_INDEX];
    return (fans?.casual ?? 0) + (fans?.hardcore ?? 0) >= settings.activeFans;
  }).length;
  const caps = {
    moment: Math.min(
      settings.maxMoments,
      Math.floor(
        settings.baseMoments +
          settings.momentsPerQuarter * elapsedQuarters +
          activeMarkets / settings.marketsPerExtraMoment,
      ),
    ),
    decision: settings.maxDecisions,
  };
  const pending = [...state.events.pending];
  const offered = { ...state.events.offered };
  let nextId = state.events.nextId;
  for (const card of [...world.events.cards].sort((a, b) => b.priority - a.priority)) {
    if (state.quarter < card.minQuarter || state.ppTier < card.minTier) continue;
    for (const { country } of ranked) {
      if (
        pending.filter(
          (event) => world.events.cards.find((c) => c.id === event.templateId)?.kind === card.kind,
        ).length >= caps[card.kind]
      )
        break;
      if (card.anchorOnly && country.countryId !== state.anchorCountryId) continue;
      const key = keyFor(card, country.countryId);
      const last = offered[key];
      if (
        last !== undefined &&
        (card.cooldownTurns === null || state.turn - last < card.cooldownTurns)
      )
        continue;
      const fans = country.fans[PLAYER_INDEX];
      if (!fans || fans.casual + fans.hardcore < card.minFans || fans.hardcore < card.minHardcore)
        continue;
      if (card.health.length && (!country.league || !card.health.includes(country.league.health)))
        continue;
      const fact = recent.find(
        (landmark) =>
          landmark.kind === card.trigger &&
          "countryId" in landmark &&
          landmark.countryId === country.countryId,
      );
      if (card.trigger !== "audience" && card.trigger !== "leaguePressure" && !fact) continue;
      if (
        ["leaguePressure", "leagueFormed", "leaguePromoted"].includes(card.trigger) &&
        !country.league
      )
        continue;
      pending.push({
        id: nextId++,
        templateId: card.id,
        countryId: country.countryId,
        turn: state.turn,
        quarter: state.quarter,
        facts: {
          casual: fans.casual,
          hardcore: fans.hardcore,
          leagueTier: country.league?.tier ?? null,
          health: country.league?.health ?? null,
          rivalId: fact && "sportId" in fact ? fact.sportId : null,
        },
        resolution: null,
      });
      offered[key] = state.turn;
    }
  }
  return {
    ...state,
    events: { ...state.events, pending, offered, nextId, landmarkCursor: state.landmarks.length },
  };
}

function effectsFor(card: EventTemplate, choiceId: string | null) {
  return choiceId === null
    ? card.effects
    : (card.choices.find((choice) => choice.id === choiceId)?.effects ?? []);
}
export function eventChoiceCost(
  state: GameState,
  world: World,
  card: EventTemplate,
  choiceId: string | null,
): number {
  return (
    (card.choices.find((choice) => choice.id === choiceId)?.cost ?? 0) *
    costMultiplier(state, world.config)
  );
}
export type EventBlocker = "missing" | "choice" | "prestige" | "league" | "rival" | "ended";
export function eventBlocker(
  state: GameState,
  world: World,
  eventId: number,
  choiceId: string | null,
): EventBlocker | null {
  if (state.outcome) return "ended";
  const event = state.events.pending.find((entry) => entry.id === eventId);
  const card = world.events.cards.find((entry) => entry.id === event?.templateId);
  if (!event || !card) return "missing";
  if (card.kind === "moment" ? choiceId !== null : !card.choices.some((c) => c.id === choiceId))
    return "choice";
  if (state.pp < eventChoiceCost(state, world, card, choiceId)) return "prestige";
  const country = state.countries.find((c) => c.countryId === event.countryId);
  for (const effect of effectsFor(card, choiceId)) {
    if (effect.type === "leagueHealth" && !country?.league) return "league";
    if (
      effect.type === "rivalSetback" &&
      !state.rivals.some((r) => r.sportId === event.facts.rivalId)
    )
      return "rival";
  }
  return null;
}

function applyEffects(
  state: GameState,
  world: World,
  event: EventRecord,
  effects: EventEffect[],
): GameState {
  let next = state;
  const index = world.countries.findIndex((country) => country.id === event.countryId);
  const population = world.countries[index]?.population;
  if (population === undefined) throw new Error("Unknown event market");
  for (const effect of effects) {
    if (effect.type === "pp") {
      next = { ...next, pp: next.pp + effect.amount };
      continue;
    }
    if (effect.type === "conversion" || effect.type === "spread") {
      next = {
        ...next,
        events: {
          ...next.events,
          modifiers: [
            ...next.events.modifiers,
            {
              eventId: event.id,
              countryId: event.countryId,
              effect,
              endQuarter: next.quarter + effect.quarters,
            },
          ],
        },
      };
      continue;
    }
    const current = next.countries[index];
    if (!current) throw new Error("Missing event market");
    let country = { ...current, fans: current.fans.map((fans) => ({ ...fans })) };
    const player = country.fans[PLAYER_INDEX];
    if (!player) throw new Error("Missing player fan bucket");
    if (effect.type === "leagueHealth" && country.league) {
      // HEALTH_LEVELS run from strongest to weakest.
      const rung = HEALTH_LEVELS.indexOf(country.league.health);
      const health =
        HEALTH_LEVELS[Math.max(0, Math.min(HEALTH_LEVELS.length - 1, rung - effect.steps))];
      if (health) country = { ...country, league: { ...country.league, health } };
    } else if (effect.type === "hardcoreDemotion" || effect.type === "rivalSetback") {
      const fans =
        effect.type === "hardcoreDemotion"
          ? player
          : country.fans.find((f) => f.sportId === event.facts.rivalId);
      if (fans) {
        const moved = Math.floor(fans.hardcore * effect.share);
        fans.hardcore -= moved;
        fans.casual += moved;
      }
    } else if (effect.type === "fanShift") {
      if (effect.target === "uninterestedToCasual")
        player.casual += Math.floor((population - player.casual - player.hardcore) * effect.share);
      else {
        const free = Math.max(0, population - country.fans.reduce((sum, f) => sum + f.hardcore, 0));
        const moved = Math.min(free, Math.floor(player.casual * effect.share));
        player.casual -= moved;
        player.hardcore += moved;
      }
    }
    const countries = [...next.countries];
    countries[index] = country;
    next = { ...next, countries };
  }
  return next;
}

/** Called only after action validation, or for a content-validated no-cost default. */
export function resolveEvent(
  state: GameState,
  world: World,
  eventId: number,
  choiceId: string | null,
  automatic = false,
): GameState {
  const event = state.events.pending.find((e) => e.id === eventId);
  const card = world.events.cards.find((c) => c.id === event?.templateId);
  if (!event || !card) throw new Error("Missing event");
  const cost = eventChoiceCost(state, world, card, choiceId);
  const ppGained = effectsFor(card, choiceId).reduce(
    (sum, effect) => sum + (effect.type === "pp" ? effect.amount : 0),
    0,
  );
  const next = applyEffects(
    { ...state, pp: state.pp - cost },
    world,
    event,
    effectsFor(card, choiceId),
  );
  const settled: EventRecord = {
    ...event,
    resolution: { choiceId, automatic, turn: state.turn, quarter: state.quarter, cost, ppGained },
  };
  return {
    ...next,
    events: {
      ...next.events,
      pending: next.events.pending.filter((e) => e.id !== eventId),
      history: [...next.events.history, settled].slice(-world.events.settings.historyLimit),
    },
  };
}

/** Uncollected rewards are never lost. Unresolved decisions take their advertised neutral option. */
export function settleEvents(state: GameState, world: World): GameState {
  let next = state;
  for (const event of state.events.pending) {
    const card = world.events.cards.find((c) => c.id === event.templateId);
    if (!card) throw new Error("Missing event template");
    next = resolveEvent(next, world, event.id, card.defaultChoice, true);
  }
  return next;
}

export function eventSnapshots(state: GameState, world: World) {
  return state.events.pending.map((event) => {
    const card = world.events.cards.find((c) => c.id === event.templateId);
    if (!card) throw new Error("Missing event template");
    return {
      ...event,
      kind: card.kind,
      tone: card.tone,
      effects: card.effects,
      defaultChoice: card.defaultChoice,
      choices: card.choices.map((choice) => ({
        ...choice,
        cost: eventChoiceCost(state, world, card, choice.id),
        blocker: eventBlocker(state, world, event.id, choice.id),
      })),
    };
  });
}
export type EventSnapshot = ReturnType<typeof eventSnapshots>[number];

export function eventProblems(state: GameState, world: World): string[] {
  const problems: string[] = [];
  const countries = new Set(world.countries.map((c) => c.id));
  if (state.events.landmarkCursor > state.landmarks.length)
    problems.push("Event fact cursor is in the future");
  const seen = new Set<number>();
  for (const event of [...state.events.pending, ...state.events.history]) {
    const card = world.events.cards.find((c) => c.id === event.templateId);
    if (!card || !countries.has(event.countryId)) {
      problems.push("Unknown event content or market");
      continue;
    }
    if (seen.has(event.id) || event.id >= state.events.nextId)
      problems.push("Invalid event sequence");
    seen.add(event.id);
    if (event.turn > state.turn || event.quarter > state.quarter)
      problems.push("Event occurs in the future");
    if (event.facts.rivalId && !state.rivals.some((r) => r.sportId === event.facts.rivalId))
      problems.push("Unknown event rival");
    if (
      event.resolution &&
      (event.resolution.turn < event.turn ||
        event.resolution.turn > state.turn ||
        event.resolution.quarter < event.quarter ||
        event.resolution.quarter > state.quarter)
    )
      problems.push("Invalid event resolution date");
    const choiceId = event.resolution?.choiceId;
    if (
      event.resolution &&
      (card.kind === "moment" ? choiceId !== null : !card.choices.some((c) => c.id === choiceId))
    )
      problems.push("Unknown resolved choice");
  }
  if (
    state.events.pending.some((e) => e.resolution) ||
    state.events.history.some((e) => !e.resolution)
  )
    problems.push("Invalid event queue membership");
  for (const [key, turn] of Object.entries(state.events.offered)) {
    const [templateId, countryId] = key.split("/");
    const card = world.events.cards.find((c) => c.id === templateId);
    if (
      !card ||
      (card.scope === "country"
        ? !countryId || !countries.has(countryId)
        : countryId !== undefined) ||
      turn > state.turn
    )
      problems.push("Invalid event cooldown");
  }
  for (const modifier of state.events.modifiers)
    if (
      !countries.has(modifier.countryId) ||
      modifier.endQuarter <= state.quarter ||
      modifier.eventId >= state.events.nextId
    )
      problems.push("Invalid active event modifier");
  return problems;
}
