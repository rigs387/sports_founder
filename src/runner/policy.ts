import { uniformFloat64 } from "pure-rand/distribution/uniformFloat64";
import { uniformInt } from "pure-rand/distribution/uniformInt";
import { xoroshiro128plus } from "pure-rand/generator/xoroshiro128plus";
import { GENOME_AXES, RULE_AXES, TRADITION_EFFECT_TYPES, type TraditionType } from "../content";
import {
  type Action,
  amendBlocker,
  amendedThisYear,
  amendmentJump,
  amendmentPrice,
  applyAction,
  backingPrice,
  backlashTotal,
  bailoutTerms,
  categoryUnlockTier,
  checkAction,
  computeExposure,
  effectValue,
  fandomScore,
  type GameState,
  growthNode,
  heldStrength,
  leagueIncomePerQuarter,
  leverMultipliers,
  nodeCost,
  offseasonOpen,
  optionNetDelta,
  PLAYER_INDEX,
  promotionTerms,
  runningCostPerQuarter,
  SEED_WARM_UP_DRAWS,
  seatStars,
  type World,
} from "../sim";
import { chooseEvents, EVENT_WEIGHTS, type EventWeights } from "./event-policy";

// Bot playtesters (tech plan 2.1). Bots act only through checkAction/applyAction, the same legal
// actions as the player. The thresholds here shape bot behavior only; they are not game balance.
//   greedy-spread  moves focus to the most exposed markets, promotes every league the moment it is
//                  legal, never steps down or bails out. Nodes: buys every node it can afford,
//                  cheapest first (ties in content order), keeping no PP back. The naive strategy.
//   builder        plays to its genome: moves focus like greedy-spread, but ranks markets by
//                  exposure × genome fit² (fit: affinity × mean of accessibility and depth there),
//                  so it pushes where the sport both is spreading and suits the country. Promotes a
//                  league only when its current fans would
//                  already pay the new tier's running cost and the cash covers reserve plus cost;
//                  rescues any league in trouble with a bailout, or a step-down at Near-Collapse.
//                  Nodes: keeps one bailout's PP in reserve, then buys the node with the best value
//                  per PP (value: each effect's size in every country, weighted by its Fandom
//                  Score there), skipping nodes worth nothing to it. Amends a rule in the
//                  offseason when the change's fit gain across its fans' markets beats the
//                  backlash by a margin (GDD v1.20); no other bot amends. The competent bot used
//                  for pacing.
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
//   random         each turn, maybe one random legal action, and a random legal answer to each
//                  decision card. Its dice are separate from the simulation's RNG, so it never
//                  changes the world's random sequence.
// Every bot except random and none first answers decision cards (event-policy.ts): greedy-spread
// values any upside and spends freely, builder weighs effects evenly, anchor-turtle prizes hardcore
// fans and league health, media-rush prizes casual fans and media and language spread. They keep
// the same PP reserve as for growth nodes.
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
/**
 * Builder amends a rule only when the change's fit gain (net lever delta, weighted by its Fandom
 * Score in each market) beats the share of its hardcore fans it would lose by this margin.
 */
const AMEND_MARGIN = 0.05;
const TURTLE_RESERVE_BAILOUTS = 2;

export interface BotStep {
  state: GameState;
  actions: Action[];
}

/** Answers pending decision cards before the bot spends PP elsewhere. */
function answerEvents(state: GameState, world: World, weights: EventWeights, reserve: number) {
  const answered = chooseEvents(state, world, weights, reserve);
  return { state: answered.state, actions: answered.actions } satisfies BotStep;
}

/** Runs a bot's own turn after its event answers, keeping both sets of actions. */
function afterEvents(events: BotStep, play: (state: GameState) => BotStep): BotStep {
  const step = play(events.state);
  return { state: step.state, actions: [...events.actions, ...step.actions] };
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
  // Culture effects (GDD v1.22) act only on traditions that exist: each counts by the strength of
  // the traditions of its type held in a country, as a share of a full weight there.
  const held = new Map<string, number[]>();
  const heldOf = (type: TraditionType | undefined) => {
    const key = type ?? "all";
    let list = held.get(key);
    if (!list) {
      const traditions = state.culture.traditions.filter((t) => !type || t.type === type);
      list = heldStrength(traditions, state, world).map((h) => h / world.config.culture.weightCap);
      held.set(key, list);
    }
    return list;
  };
  let value = 0;
  state.countries.forEach((country, index) => {
    if (onlyCountry !== undefined && index !== onlyCountry) return;
    const fans = country.fans[PLAYER_INDEX];
    const attributes = world.derived[index];
    if (!fans || !attributes) return;
    const weight = fans.hardcore + fans.casual * casualWeight;
    if (weight <= 0) return;
    for (const effect of node.effects) {
      const culture = TRADITION_EFFECT_TYPES.includes(effect.type);
      const share = culture ? (heldOf(effect.traditionType)[index] ?? 0) : 1;
      value += weight * effectValue(effect, attributes) * share;
    }
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

function greedySpreadTurn(state: GameState, world: World): BotStep {
  const step = greedySpreadFocus(state, world);
  for (const country of world.countries) {
    attempt(step, world, { type: "promoteLeague", countryId: country.id });
  }
  backStars(step, world, 0);
  buyNodes(step, world, 0, cheapest(step, world));
  return step;
}

/** Greedy-spread's focus handling: the most exposed markets first. */
function greedySpreadFocus(state: GameState, world: World): BotStep {
  return spreadFocus(state, world, countriesByExposure(state, world));
}

/**
 * How well the sport's genome fits a country: affinity × the mean of accessibility and depth (the
 * genome's lever multipliers there). A bot heuristic, not game balance.
 */
export function genomeFit(state: GameState, world: World, countryIndex: number): number {
  const levers = leverMultipliers(world, state.genome, countryIndex);
  return (levers.affinity * (levers.accessibility + levers.depth)) / 2;
}

/**
 * Focus candidates for a bot that plays to its genome: exposure × fit², so a well-suited market
 * with some spread beats a poorly suited one with a little more. Chosen over ranking by fit alone
 * (cold launches into well-suited but unreached markets differentiated less; 2026-09-13).
 */
function countriesByFit(state: GameState, world: World) {
  return countriesByExposure(state, world)
    .map((c) => ({ ...c, score: c.exposure * genomeFit(state, world, c.index) ** 2 }))
    .sort((a, b) => b.score - a.score || b.population - a.population);
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
    const revenue = leagueIncomePerQuarter(step.state, world, index, current, terms.to);
    const cost = runningCostPerQuarter(world, index, terms.to, owned);
    if (revenue < cost * BUILDER_MARGIN) continue;
    if (league.cash < terms.reserveNeeded + terms.cost) continue;
    attempt(step, world, { type: "promoteLeague", countryId: country.id });
  }
}

/**
 * Backs flagship stars while slots and PP above `reserve` allow (GDD v1.16), most career scores
 * first: bots read recorded facts, never hidden skill.
 */
function backStars(step: BotStep, world: World, reserve: number): void {
  const careerScores = (player: { career: { scores: number }[] }) =>
    player.career.reduce((sum, line) => sum + line.scores, 0);
  const candidates = seatStars(step.state.flagship)
    .filter((player) => player.backing === null)
    .sort((a, b) => careerScores(b) - careerScores(a) || a.id - b.id);
  for (const star of candidates) {
    if (step.state.pp - backingPrice(step.state, world) < reserve) return;
    attempt(step, world, { type: "backStar", playerId: star.id });
  }
}

/**
 * Amends the rule whose change fits the bot's fans best (GDD v1.20): the fit gain in every market,
 * weighted by its Fandom Score there, less the share of hardcore fans the backlash would turn
 * casual. Only when that beats AMEND_MARGIN and the price leaves `reserve` PP.
 */
function amendRules(step: BotStep, world: World, reserve: number): void {
  const state = step.state;
  if (!offseasonOpen(state) || amendedThisYear(state, world)) return;
  const { casualWeight } = world.config.fandomScore;
  const weights = state.countries.map((country) => {
    const fans = country.fans[PLAYER_INDEX];
    return fans ? fandomScore(fans.casual, fans.hardcore, casualWeight) : 0;
  });
  const total = weights.reduce((sum, w) => sum + w, 0);
  const hardcore = state.countries.reduce(
    (sum, c) => sum + (c.fans[PLAYER_INDEX]?.hardcore ?? 0),
    0,
  );
  if (total <= 0 || hardcore <= 0) return;
  let best: Action | null = null;
  let bestValue = AMEND_MARGIN;
  for (const axis of RULE_AXES) {
    const current = state.genome[axis];
    for (const option of GENOME_AXES[axis].options as readonly string[]) {
      if (option === current || amendBlocker(state, world, axis, option) !== null) continue;
      const jump = amendmentJump(axis, current, option, world);
      if (state.pp - amendmentPrice(state, world, jump) < reserve) continue;
      let gain = 0;
      weights.forEach((weight, index) => {
        if (weight <= 0) return;
        gain +=
          weight *
          (optionNetDelta(world, axis, option, index) -
            optionNetDelta(world, axis, current, index));
      });
      const value = gain / total - backlashTotal(state, world, axis, option) / hardcore;
      if (value > bestValue) {
        bestValue = value;
        best = { type: "amendRule", axis, option };
      }
    }
  }
  if (best) attempt(step, world, best);
}

/** Bot switches: whether the builder amends rules (the differentiation criterion turns it off). */
export interface BotOptions {
  amend: boolean;
}

function builderTurn(state: GameState, world: World, options: BotOptions): BotStep {
  const spread = spreadFocus(state, world, countriesByFit(state, world));
  const step: BotStep = { state: spread.state, actions: [...spread.actions] };
  manageLeagues(step, world);
  if (options.amend)
    amendRules(step, world, bailoutReserve(step.state, world, BUILDER_RESERVE_BAILOUTS));
  backStars(step, world, bailoutReserve(step.state, world, BUILDER_RESERVE_BAILOUTS));
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

function anchorTurtleTurn(state: GameState, world: World): BotStep {
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
  backStars(step, world, bailoutReserve(step.state, world, TURTLE_RESERVE_BAILOUTS));
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

function mediaRushTurn(state: GameState, world: World): BotStep {
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
  backStars(step, world, reserve);
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

function randomBotTurn(state: GameState, world: World): BotStep {
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

export function greedySpread(state: GameState, world: World): BotStep {
  return afterEvents(answerEvents(state, world, EVENT_WEIGHTS.greedy, 0), (s) =>
    greedySpreadTurn(s, world),
  );
}

export function builder(
  state: GameState,
  world: World,
  options: BotOptions = { amend: true },
): BotStep {
  const reserve = bailoutReserve(state, world, BUILDER_RESERVE_BAILOUTS);
  return afterEvents(answerEvents(state, world, EVENT_WEIGHTS.builder, reserve), (s) =>
    builderTurn(s, world, options),
  );
}

export function anchorTurtle(state: GameState, world: World): BotStep {
  const reserve = bailoutReserve(state, world, TURTLE_RESERVE_BAILOUTS);
  return afterEvents(answerEvents(state, world, EVENT_WEIGHTS.turtle, reserve), (s) =>
    anchorTurtleTurn(s, world),
  );
}

export function mediaRush(state: GameState, world: World): BotStep {
  const reserve = bailoutReserve(state, world, BUILDER_RESERVE_BAILOUTS);
  return afterEvents(answerEvents(state, world, EVENT_WEIGHTS.media, reserve), (s) =>
    mediaRushTurn(s, world),
  );
}

/** The random bot's answers: a uniformly random legal choice per decision, on separate dice. */
function randomEvents(state: GameState, world: World): BotStep {
  const step: BotStep = { state, actions: [] };
  const rng = xoroshiro128plus((state.seed * 2_000_029 + state.turn * 6_007) >>> 0);
  for (let i = 0; i < SEED_WARM_UP_DRAWS; i += 1) rng.next();
  for (const event of state.events.pending) {
    const card = world.events.cards.find((c) => c.id === event.templateId);
    if (card?.kind !== "decision") continue;
    const legal = card.choices.filter(
      (choice) =>
        checkAction(step.state, world, {
          type: "chooseEvent",
          eventId: event.id,
          choiceId: choice.id,
        }) === null,
    );
    const choice = legal[uniformInt(rng, 0, Math.max(0, legal.length - 1))];
    if (choice)
      attempt(step, world, { type: "chooseEvent", eventId: event.id, choiceId: choice.id });
  }
  return step;
}

export function randomBot(state: GameState, world: World): BotStep {
  return afterEvents(randomEvents(state, world), (s) => randomBotTurn(s, world));
}

export function runBot(
  bot: BotId,
  state: GameState,
  world: World,
  options: BotOptions = { amend: true },
): BotStep {
  switch (bot) {
    case "greedy-spread":
      return greedySpread(state, world);
    case "builder":
      return builder(state, world, options);
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
