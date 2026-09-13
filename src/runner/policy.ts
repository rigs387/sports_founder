import { uniformFloat64 } from "pure-rand/distribution/uniformFloat64";
import { uniformInt } from "pure-rand/distribution/uniformInt";
import { xoroshiro128plus } from "pure-rand/generator/xoroshiro128plus";
import {
  type Action,
  applyAction,
  checkAction,
  computeExposure,
  type GameState,
  mediaRevenueFactor,
  PLAYER_INDEX,
  promotionTerms,
  revenuePerQuarter,
  runningCostPerQuarter,
  SEED_WARM_UP_DRAWS,
  type World,
} from "../sim";

// Bot playtesters (tech plan 2.1). Bots act only through checkAction/applyAction, the same legal
// actions as the player. The thresholds here shape bot behavior only; they are not game balance.
//   greedy-spread  moves focus to the most exposed markets, promotes every league the moment it is
//                  legal, never steps down or bails out. The naive strategy.
//   anchor-turtle  keeps a slot on the anchor, fills the rest next door, promotes the anchor only
//                  with a wide margin, rescues the anchor with bailouts and step-downs.
//   random         each turn, maybe one random legal action. Its dice are separate from the
//                  simulation's RNG, so it never changes the world's random sequence.
//   none           does nothing.

//   builder        greedy-spread's focus, but promotes a league only when its current fans would
//                  already pay the new tier's running cost and the cash covers reserve plus cost;
//                  rescues any league in trouble with a bailout, or a step-down at Near-Collapse.
//                  The competent bot used for pacing.

export type BotId = "greedy-spread" | "builder" | "anchor-turtle" | "random" | "none";
export const BOT_IDS: BotId[] = ["greedy-spread", "builder", "anchor-turtle", "random", "none"];

export function isBotId(value: string): value is BotId {
  return (BOT_IDS as string[]).includes(value);
}

/** Greedy-spread moves a slot on once its country's Fandom Score share reaches this. */
const SATURATED_SHARE = 0.15;
/** Anchor-turtle promotes only with this multiple of the hardcore and cash requirements. */
const TURTLE_MARGIN = 1.5;
/** Chance per turn that the random bot tries an action. */
const RANDOM_ACTION_CHANCE = 0.5;
/** Builder promotes once current fans would earn this multiple of the new tier's running cost. */
const BUILDER_MARGIN = 1.1;

export interface BotStep {
  state: GameState;
  actions: Action[];
}

function attempt(step: BotStep, world: World, action: Action): boolean {
  if (checkAction(step.state, world, action) !== null) return false;
  step.state = applyAction(step.state, world, action);
  step.actions.push(action);
  return true;
}

function indexOf(world: World, countryId: string): number {
  return world.countries.findIndex((country) => country.id === countryId);
}

function fandomShare(state: GameState, world: World, countryId: string | null): number {
  if (countryId === null) return -1;
  const index = indexOf(world, countryId);
  const fans = state.countries[index]?.fans[PLAYER_INDEX];
  const population = world.countries[index]?.population ?? 1;
  if (!fans) return 0;
  return (fans.hardcore + fans.casual * world.config.fandomScore.casualWeight) / population;
}

/** Drops owed slots, lowest `keepScore` first. */
function dropSlots(step: BotStep, world: World, keepScore: (id: string | null) => number): void {
  while (step.state.tierTrack.slotsToDrop > 0) {
    let worst = 0;
    step.state.focus.forEach((id, slot) => {
      if (keepScore(id) < keepScore(step.state.focus[worst] ?? null)) worst = slot;
    });
    if (!attempt(step, world, { type: "dropFocusSlot", slot: worst })) return;
  }
}

function countriesByExposure(state: GameState, world: World) {
  const exposure = computeExposure(state, world);
  return world.countries
    .map((country, index) => ({
      id: country.id,
      index,
      population: country.population,
      exposure: exposure[index]?.organic ?? 0,
    }))
    .sort((a, b) => b.exposure - a.exposure || b.population - a.population);
}

export function greedySpread(state: GameState, world: World): BotStep {
  const step = greedySpreadFocus(state, world);
  for (const country of world.countries) {
    attempt(step, world, { type: "promoteLeague", countryId: country.id });
  }
  return step;
}

/** Greedy-spread's focus handling, shared with the builder bot. */
function greedySpreadFocus(state: GameState, world: World): BotStep {
  const step: BotStep = { state, actions: [] };
  dropSlots(step, world, (id) => fandomShare(step.state, world, id));

  const candidates = countriesByExposure(step.state, world);
  for (let slot = 0; slot < step.state.focus.length; slot += 1) {
    const here = step.state.focus[slot] ?? null;
    if (here !== null && fandomShare(step.state, world, here) < SATURATED_SHARE) continue;
    for (const candidate of candidates) {
      if (step.state.focus.includes(candidate.id)) continue;
      if (attempt(step, world, { type: "assignFocus", slot, countryId: candidate.id })) break;
    }
  }
  return step;
}

export function builder(state: GameState, world: World): BotStep {
  const spread = greedySpreadFocus(state, world);
  const step: BotStep = { state: spread.state, actions: [...spread.actions] };
  const anchor = step.state.anchorCountryId;
  // The anchor first, so its rescue gets the PP when money is short.
  const order = [...world.countries].sort(
    (a, b) => Number(b.id === anchor) - Number(a.id === anchor),
  );

  for (const country of order) {
    const index = indexOf(world, country.id);
    const league = step.state.countries[index]?.league;
    if (!league || league.health === "healthy") continue;
    if (!attempt(step, world, { type: "bailoutLeague", countryId: country.id })) {
      attempt(step, world, { type: "stepDownLeague", countryId: country.id });
    }
  }

  for (const country of order) {
    const index = indexOf(world, country.id);
    const current = step.state.countries[index];
    const league = current?.league;
    const fans = current?.fans[PLAYER_INDEX];
    if (!league || !fans || league.health !== "healthy") continue;
    const terms = promotionTerms(world, index, league.tier);
    if (!terms) continue;
    const revenue = revenuePerQuarter(
      world,
      index,
      terms.to,
      fans,
      step.state.ppTier,
      mediaRevenueFactor(current, world.config),
    ).total;
    const cost = runningCostPerQuarter(world, index, terms.to);
    if (revenue < cost * BUILDER_MARGIN) continue;
    if (league.cash < terms.reserveNeeded + terms.cost) continue;
    attempt(step, world, { type: "promoteLeague", countryId: country.id });
  }
  return step;
}

export function anchorTurtle(state: GameState, world: World): BotStep {
  const step: BotStep = { state, actions: [] };
  const anchor = state.anchorCountryId;
  const anchorIndex = indexOf(world, anchor);
  dropSlots(step, world, (id) =>
    id === anchor ? Number.POSITIVE_INFINITY : fandomShare(step.state, world, id),
  );

  if (!step.state.focus.includes(anchor)) {
    attempt(step, world, { type: "assignFocus", slot: 0, countryId: anchor });
  }
  const neighbors = new Set(
    (world.derived[anchorIndex]?.proximity ?? []).map((i) => world.countries[i]?.id),
  );
  const nearby = countriesByExposure(step.state, world).filter((c) => neighbors.has(c.id));
  step.state.focus.forEach((id, slot) => {
    if (id !== null) return;
    for (const candidate of nearby) {
      if (step.state.focus.includes(candidate.id)) continue;
      if (attempt(step, world, { type: "assignFocus", slot, countryId: candidate.id })) break;
    }
  });

  const league = step.state.countries[anchorIndex]?.league;
  if (league && league.health !== "healthy") {
    if (!attempt(step, world, { type: "bailoutLeague", countryId: anchor })) {
      attempt(step, world, { type: "stepDownLeague", countryId: anchor });
    }
  }
  const current = step.state.countries[anchorIndex];
  const terms = current?.league ? promotionTerms(world, anchorIndex, current.league.tier) : null;
  const hardcore = current?.fans[PLAYER_INDEX]?.hardcore ?? 0;
  if (
    current?.league &&
    current.league.health === "healthy" &&
    terms &&
    hardcore >= terms.hardcoreNeeded * TURTLE_MARGIN &&
    current.league.cash >= (terms.reserveNeeded + terms.cost) * TURTLE_MARGIN
  ) {
    attempt(step, world, { type: "promoteLeague", countryId: anchor });
  }
  return step;
}

/** The random bot's dice for this turn, derived from the campaign seed and turn only. */
function botRng(state: GameState) {
  const rng = xoroshiro128plus((state.seed * 1_000_003 + state.turn * 7_919) >>> 0);
  for (let i = 0; i < SEED_WARM_UP_DRAWS; i += 1) rng.next();
  return rng;
}

export function randomBot(state: GameState, world: World): BotStep {
  const step: BotStep = { state, actions: [] };
  const rng = botRng(state);
  while (step.state.tierTrack.slotsToDrop > 0) {
    const slot = uniformInt(rng, 0, step.state.focus.length - 1);
    if (!attempt(step, world, { type: "dropFocusSlot", slot })) break;
  }
  if (uniformFloat64(rng) >= RANDOM_ACTION_CHANCE) return step;

  const country = world.countries[uniformInt(rng, 0, world.countries.length - 1)];
  if (!country) return step;
  const kind = uniformInt(rng, 0, 3);
  const action: Action =
    kind === 0
      ? {
          type: "assignFocus",
          slot: uniformInt(rng, 0, step.state.focus.length - 1),
          countryId: country.id,
        }
      : kind === 1
        ? { type: "promoteLeague", countryId: country.id }
        : kind === 2
          ? { type: "stepDownLeague", countryId: country.id }
          : { type: "bailoutLeague", countryId: country.id };
  attempt(step, world, action);
  return step;
}

export function runBot(bot: BotId, state: GameState, world: World): BotStep {
  switch (bot) {
    case "greedy-spread":
      return greedySpread(state, world);
    case "builder":
      return builder(state, world);
    case "anchor-turtle":
      return anchorTurtle(state, world);
    case "random":
      return randomBot(state, world);
    case "none":
      return { state, actions: [] };
  }
}
