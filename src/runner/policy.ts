import { uniformFloat64 } from "pure-rand/distribution/uniformFloat64";
import { uniformInt } from "pure-rand/distribution/uniformInt";
import { xoroshiro128plus } from "pure-rand/generator/xoroshiro128plus";
import {
  type Action,
  applyAction,
  bailoutTerms,
  categoryUnlockTier,
  checkAction,
  computeExposure,
  effectValue,
  type GameState,
  growthFactorsAt,
  growthNode,
  mediaRevenueFactor,
  nodeCost,
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
//                  legal, never steps down or bails out. Nodes: buys every node it can afford,
//                  cheapest first (ties in content order), keeping no PP back. The naive strategy.
//   builder        greedy-spread's focus, but promotes a league only when its current fans would
//                  already pay the new tier's running cost and the cash covers reserve plus cost;
//                  rescues any league in trouble with a bailout, or a step-down at Near-Collapse.
//                  Nodes: keeps one bailout's PP in reserve, then buys the node with the best value
//                  per PP (value: each effect's size in every country, weighted by its Fandom
//                  Score there), skipping nodes worth nothing to it. The competent bot used for pacing.
//   anchor-turtle  keeps a slot on the anchor, fills the rest next door, promotes the anchor only
//                  with a wide margin, rescues the anchor with bailouts and step-downs. Nodes: keeps
//                  two bailouts' PP in reserve, then buys the cheapest node worth something in the
//                  anchor.
//   media-rush     focus on the largest media markets (then exposure); builder's promotions and
//                  rescues. Nodes: Media first, cheapest first, choosing at each fork the side with
//                  the most reach (media and language spread plus casual conversion); once Media is
//                  unlocked it saves for the next Media node and buys Grassroots only when it owns
//                  every Media node it wants. Before Media unlocks it buys Grassroots, cheapest
//                  first.
//   random         each turn, maybe one random legal action. Its dice are separate from the
//                  simulation's RNG, so it never changes the world's random sequence.
//   none           does nothing.

export type BotId =
  | "greedy-spread"
  | "builder"
  | "anchor-turtle"
  | "media-rush"
  | "random"
  | "none";
export const BOT_IDS: BotId[] = [
  "greedy-spread",
  "builder",
  "anchor-turtle",
  "media-rush",
  "random",
  "none",
];

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
/** PP kept back for rescues, in bailouts: builder and media-rush, then anchor-turtle. */
const BUILDER_RESERVE_BAILOUTS = 1;
const TURTLE_RESERVE_BAILOUTS = 2;

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

// ---- Growth tree helpers --------------------------------------------------------------------

/** Nodes every rule allows right now (ignoring PP), in content order. */
function buyableNodes(state: GameState, world: World): string[] {
  return world.growthTree.nodes
    .map((node) => node.id)
    .filter((nodeId) => {
      const reason = checkAction({ ...state, pp: Number.POSITIVE_INFINITY }, world, {
        type: "buyNode",
        nodeId,
      });
      return reason === null;
    });
}

/**
 * A node's worth to the player now: every effect's value in every country, weighted by the
 * player's Fandom Score there (or only in `onlyCountry`). Effects of every kind count alike; this is
 * a bot heuristic, not game balance.
 */
export function nodeValue(
  state: GameState,
  world: World,
  nodeId: string,
  onlyCountry?: number,
): number {
  const node = growthNode(world, nodeId);
  const { casualWeight } = world.config.fandomScore;
  let value = 0;
  state.countries.forEach((country, index) => {
    if (onlyCountry !== undefined && index !== onlyCountry) return;
    const fans = country.fans[PLAYER_INDEX];
    const attributes = world.derived[index];
    if (!fans || !attributes) return;
    const weight = fans.hardcore + fans.casual * casualWeight;
    if (weight <= 0) return;
    for (const effect of node.effects) value += weight * effectValue(effect, attributes);
  });
  return value;
}

/**
 * Buys nodes one at a time: each round, `pick` chooses among the buyable nodes it can afford while
 * keeping `reserve` PP; stops when it returns null.
 */
function buyNodes(
  step: BotStep,
  world: World,
  reserve: number,
  pick: (candidates: string[]) => string | null,
): void {
  for (;;) {
    const candidates = buyableNodes(step.state, world).filter(
      (nodeId) => step.state.pp - nodeCost(step.state, world, nodeId) >= reserve,
    );
    const choice = candidates.length > 0 ? pick(candidates) : null;
    if (choice === null || !attempt(step, world, { type: "buyNode", nodeId: choice })) return;
  }
}

function cheapest(step: BotStep, world: World) {
  return (candidates: string[]): string | null => {
    let best: string | null = null;
    for (const nodeId of candidates) {
      if (
        best === null ||
        nodeCost(step.state, world, nodeId) < nodeCost(step.state, world, best)
      ) {
        best = nodeId;
      }
    }
    return best;
  };
}

function bailoutReserve(state: GameState, world: World, bailouts: number): number {
  const anchor = indexOf(world, state.anchorCountryId);
  return bailouts * bailoutTerms(state, world, anchor).ppCost;
}

// ---- Bots -----------------------------------------------------------------------------------

export function greedySpread(state: GameState, world: World): BotStep {
  const step = greedySpreadFocus(state, world);
  for (const country of world.countries) {
    attempt(step, world, { type: "promoteLeague", countryId: country.id });
  }
  buyNodes(step, world, 0, cheapest(step, world));
  return step;
}

/** Greedy-spread's focus handling, shared with the builder bot. */
function greedySpreadFocus(state: GameState, world: World): BotStep {
  return spreadFocus(state, world, countriesByExposure(state, world));
}

/** Moves saturated or empty slots onto the first affordable candidates, in the given order. */
function spreadFocus(state: GameState, world: World, candidates: { id: string }[]): BotStep {
  const step: BotStep = { state, actions: [] };
  dropSlots(step, world, (id) => fandomShare(step.state, world, id));

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

/** Builder's rescues and careful promotions, shared with media-rush. */
function manageLeagues(step: BotStep, world: World): void {
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
    if (!current || !league || !fans || league.health !== "healthy") continue;
    const owned = step.state.growthNodes;
    const terms = promotionTerms(world, index, league.tier, owned);
    if (!terms) continue;
    const revenue = revenuePerQuarter(
      world,
      index,
      terms.to,
      fans,
      step.state.ppTier,
      mediaRevenueFactor(
        current,
        world.config,
        growthFactorsAt(world, owned, index).countermoveEffect,
      ),
    ).total;
    const cost = runningCostPerQuarter(world, index, terms.to, owned);
    if (revenue < cost * BUILDER_MARGIN) continue;
    if (league.cash < terms.reserveNeeded + terms.cost) continue;
    attempt(step, world, { type: "promoteLeague", countryId: country.id });
  }
}

export function builder(state: GameState, world: World): BotStep {
  const spread = greedySpreadFocus(state, world);
  const step: BotStep = { state: spread.state, actions: [...spread.actions] };
  manageLeagues(step, world);
  buyNodes(
    step,
    world,
    bailoutReserve(step.state, world, BUILDER_RESERVE_BAILOUTS),
    (candidates) => {
      let best: string | null = null;
      let bestValue = 0;
      for (const nodeId of candidates) {
        const value = nodeValue(step.state, world, nodeId) / nodeCost(step.state, world, nodeId);
        if (value > bestValue) {
          best = nodeId;
          bestValue = value;
        }
      }
      return best;
    },
  );
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
  const terms = current?.league
    ? promotionTerms(world, anchorIndex, current.league.tier, step.state.growthNodes)
    : null;
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

  const pickCheapest = cheapest(step, world);
  buyNodes(step, world, bailoutReserve(step.state, world, TURTLE_RESERVE_BAILOUTS), (candidates) =>
    pickCheapest(candidates.filter((id) => nodeValue(step.state, world, id, anchorIndex) > 0)),
  );
  return step;
}

/** How much reach a node adds: media and language spread plus casual conversion amounts. */
function reachScore(world: World, nodeId: string): number {
  return growthNode(world, nodeId).effects.reduce((sum, effect) => {
    const reach =
      effect.type === "casualConversion" ||
      (effect.type === "spreadChannel" && effect.channel !== "proximity");
    return reach ? sum + effect.amount : sum;
  }, 0);
}

export function mediaRush(state: GameState, world: World): BotStep {
  const exposure = computeExposure(state, world);
  const byMarket = world.countries
    .map((country, index) => ({
      id: country.id,
      market: world.derived[index]?.mediaMarket ?? 0,
      exposure: exposure[index]?.organic ?? 0,
    }))
    .sort((a, b) => b.market - a.market || b.exposure - a.exposure);
  const step = spreadFocus(state, world, byMarket);
  manageLeagues(step, world);

  // The Media nodes it wants: every Media node except a fork side with less reach than a sibling.
  const wanted = world.growthTree.nodes
    .filter((node) => node.category === "media")
    .map((node) => node.id)
    .filter((nodeId) => {
      const fork = world.growthTree.forks.find((f) => f.nodes.includes(nodeId));
      if (!fork) return true;
      const best = [...fork.nodes].sort((a, b) => reachScore(world, b) - reachScore(world, a))[0];
      return best === nodeId;
    });
  const reserve = bailoutReserve(step.state, world, BUILDER_RESERVE_BAILOUTS);
  const pickCheapest = cheapest(step, world);
  buyNodes(step, world, reserve, (candidates) =>
    pickCheapest(candidates.filter((id) => wanted.includes(id))),
  );

  const mediaTier = categoryUnlockTier(world, "media");
  const mediaOpen = mediaTier !== null && step.state.ppTier >= mediaTier;
  const stillWanted = wanted.some((id) => !step.state.growthNodes.includes(id));
  if (!mediaOpen || !stillWanted) {
    buyNodes(step, world, reserve, (candidates) =>
      pickCheapest(candidates.filter((id) => growthNode(world, id).category !== "media")),
    );
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
  const kind = uniformInt(rng, 0, 4);
  const nodes = world.growthTree.nodes;
  const node = nodes[uniformInt(rng, 0, nodes.length - 1)];
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
          : kind === 3
            ? { type: "bailoutLeague", countryId: country.id }
            : { type: "buyNode", nodeId: node?.id ?? "" };
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
    case "media-rush":
      return mediaRush(state, world);
    case "random":
      return randomBot(state, world);
    case "none":
      return { state, actions: [] };
  }
}
