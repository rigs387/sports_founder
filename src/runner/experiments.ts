import { performance } from "node:perf_hooks";
import { CLIMATES } from "../content";
import {
  createCampaign,
  deserializeSave,
  endTurn,
  type GameState,
  QUARTERS_PER_YEAR,
  serializeSave,
  type World,
} from "../sim";
import { type PlayedCampaign, playCampaign } from "./campaign";
import { formatGenome, randomGenome } from "./genome-arg";
import { type BotId, runBot } from "./policy";
import {
  countBy,
  median,
  type NodeOutcome,
  nodeOutcomes,
  type OptionOutcome,
  optionOutcomes,
} from "./report";

// Balance experiments for the tech plan's Phase 0 exit criteria. Every campaign counts, and every
// result is reported with its numbers; a failure is never folded into a pass. Campaigns use a
// seeded random genome per seed, so results cover the genome space rather than one preset.

type OnCampaign = (played: PlayedCampaign) => void;

function randomGenomeCampaign(
  world: World,
  seed: number,
  anchorCountryId: string,
  bot: BotId,
  turns: number,
): PlayedCampaign {
  const genome = randomGenome(seed);
  return playCampaign(world, {
    seed,
    anchorCountryId,
    genome,
    genomeLabel: `random:${formatGenome(genome)}`,
    bot,
    turns,
  });
}

// ---- No safe anchor ------------------------------------------------------------------------

export interface CollapseCell {
  anchor: string;
  bot: BotId;
  campaigns: number;
  collapses: number;
  rate: number;
  medianCollapseTurn: number | null;
  /** Every collapse turn, in seed order. */
  collapseTurns: number[];
  /** Collapses on or before balanceTargets.earlyCollapseTurn. */
  earlyCollapses: number;
  peakTiers: Record<string, number>;
}

export interface CollapseReport {
  seeds: number[];
  /** Seeds the naive bot played per anchor (more than the other bots: the criterion rides on it). */
  naiveSeeds: number[];
  turns: number;
  naiveBot: BotId;
  earlyCollapseTurn: number;
  /** Population of every anchor in the report. */
  populations: Record<string, number>;
  cells: CollapseCell[];
  /** Anchors the naive bot never collapsed. The criterion fails if any exist. */
  safeAnchorsUnderNaiveBot: string[];
  passed: boolean;
}

export function runCollapse(
  world: World,
  settings: {
    anchors: string[];
    bots: BotId[];
    naiveBot: BotId;
    seeds: number[];
    naiveSeeds: number[];
    turns: number;
  },
  onCampaign?: OnCampaign,
): CollapseReport {
  const bots = settings.bots.includes(settings.naiveBot)
    ? settings.bots
    : [settings.naiveBot, ...settings.bots];
  const cells: CollapseCell[] = [];
  for (const anchor of settings.anchors) {
    for (const bot of bots) {
      const seeds = bot === settings.naiveBot ? settings.naiveSeeds : settings.seeds;
      const results = seeds.map((seed) => {
        const played = randomGenomeCampaign(world, seed, anchor, bot, settings.turns);
        onCampaign?.(played);
        return played.result;
      });
      const collapsed = results.filter((r) => r.collapsed);
      const collapseTurns = collapsed
        .map((r) => r.collapseTurn)
        .filter((t): t is number => t !== null);
      cells.push({
        anchor,
        bot,
        campaigns: results.length,
        collapses: collapsed.length,
        rate: results.length > 0 ? collapsed.length / results.length : 0,
        medianCollapseTurn: median(collapseTurns),
        collapseTurns,
        earlyCollapses: collapseTurns.filter(
          (t) => t <= world.config.balanceTargets.earlyCollapseTurn,
        ).length,
        peakTiers: countBy(results.map((r) => r.peakTier)),
      });
    }
  }
  const safe = cells
    .filter((cell) => cell.bot === settings.naiveBot && cell.collapses === 0)
    .map((cell) => cell.anchor);
  return {
    seeds: settings.seeds,
    naiveSeeds: settings.naiveSeeds,
    turns: settings.turns,
    naiveBot: settings.naiveBot,
    earlyCollapseTurn: world.config.balanceTargets.earlyCollapseTurn,
    populations: Object.fromEntries(
      settings.anchors.map((anchor) => [
        anchor,
        world.countries.find((country) => country.id === anchor)?.population ?? 0,
      ]),
    ),
    cells,
    safeAnchorsUnderNaiveBot: safe,
    passed: safe.length === 0,
  };
}

// ---- Hard anchors are winnable -------------------------------------------------------------

export interface HardAnchorBotResult {
  bot: BotId;
  campaigns: number;
  collapses: number;
  peakTiers: Record<string, number>;
  bestPeakTier: number;
  medianTurnsSurvived: number | null;
  survivedAllTurns: number;
}

export interface HardAnchorReport {
  anchor: string;
  seeds: number[];
  turns: number;
  bots: HardAnchorBotResult[];
}

export function runHardAnchor(
  world: World,
  settings: { anchor: string; bots: BotId[]; seeds: number[]; turns: number },
  onCampaign?: OnCampaign,
): HardAnchorReport {
  return {
    anchor: settings.anchor,
    seeds: settings.seeds,
    turns: settings.turns,
    bots: settings.bots.map((bot) => {
      const results = settings.seeds.map((seed) => {
        const played = randomGenomeCampaign(world, seed, settings.anchor, bot, settings.turns);
        onCampaign?.(played);
        return played.result;
      });
      return {
        bot,
        campaigns: results.length,
        collapses: results.filter((r) => r.collapsed).length,
        peakTiers: countBy(results.map((r) => r.peakTier)),
        bestPeakTier: Math.max(0, ...results.map((r) => r.peakTier)),
        medianTurnsSurvived: median(results.map((r) => r.turnsPlayed)),
        survivedAllTurns: results.filter((r) => !r.collapsed).length,
      };
    }),
  };
}

// ---- Pacing --------------------------------------------------------------------------------

export interface PacingTier {
  tier: number;
  /** GDD campaign budget: cumulative turns to reach this tier. */
  targetTurn: number;
  allowedRange: [number, number];
  reached: number;
  of: number;
  /** Median arrival turn, or null when fewer than half the campaigns reached the tier. */
  medianTurn: number | null;
  withinTolerance: boolean;
}

export interface PacingReport {
  anchors: string[];
  bot: BotId;
  seeds: number[];
  turns: number;
  tolerance: number;
  tiers: PacingTier[];
  passed: boolean;
}

export function runPacing(
  world: World,
  settings: { anchors: string[]; bot: BotId; seeds: number[]; turns: number },
  onCampaign?: OnCampaign,
): PacingReport {
  const { turnsInTier, pacingTolerance } = world.config.balanceTargets;
  const results = settings.anchors.flatMap((anchor) =>
    settings.seeds.map((seed) => {
      const played = randomGenomeCampaign(world, seed, anchor, settings.bot, settings.turns);
      onCampaign?.(played);
      return played.result;
    }),
  );
  const tiers: PacingTier[] = [];
  let cumulative = 0;
  for (let tier = 2; tier <= world.config.ppTiers.length; tier += 1) {
    cumulative += turnsInTier[tier - 2] ?? 0;
    const arrivals = results
      .map((r) => r.tierReached[tier]?.turnsCompleted)
      .filter((t): t is number => t !== undefined);
    const low = Math.round(cumulative * (1 - pacingTolerance));
    const high = Math.round(cumulative * (1 + pacingTolerance));
    const medianTurn = arrivals.length * 2 > results.length ? median(arrivals) : null;
    tiers.push({
      tier,
      targetTurn: cumulative,
      allowedRange: [low, high],
      reached: arrivals.length,
      of: results.length,
      medianTurn,
      withinTolerance: medianTurn !== null && medianTurn >= low && medianTurn <= high,
    });
  }
  return {
    anchors: settings.anchors,
    bot: settings.bot,
    seeds: settings.seeds,
    turns: settings.turns,
    tolerance: pacingTolerance,
    tiers,
    passed: tiers.every((tier) => tier.withinTolerance),
  };
}

// ---- No dominant genome --------------------------------------------------------------------

export interface OptionsReport {
  anchors: string[];
  bot: BotId;
  seeds: number[];
  turns: number;
  dominanceLimit: number;
  /** z of the one-sided lower bound a share must clear the limit by (see shareLowerBound). */
  dominanceZ: number;
  byAnchor: { anchor: string; outcomes: OptionOutcome[]; aboveLimit: string[] }[];
  combined: { outcomes: OptionOutcome[]; aboveLimit: string[] };
  /** The same question for growth tree nodes: owned in more than the limit of top-quartile runs. */
  nodes: {
    byAnchor: { anchor: string; outcomes: NodeOutcome[]; aboveLimit: string[] }[];
    combined: { outcomes: NodeOutcome[]; aboveLimit: string[] };
  };
}

export function runOptions(
  world: World,
  settings: { anchors: string[]; bot: BotId; seeds: number[]; turns: number },
  onCampaign?: OnCampaign,
): OptionsReport {
  const limit = world.config.balanceTargets.dominanceLimit;
  const z = world.config.balanceTargets.dominanceZ;
  const above = (outcomes: OptionOutcome[]) =>
    outcomes.filter((o) => o.exceedsDominanceLimit).map((o) => `${o.axis}=${o.option}`);
  const all: PlayedCampaign["result"][] = [];
  const byAnchor: OptionsReport["byAnchor"] = [];
  const nodeIds = world.growthTree.nodes.map((node) => node.id);
  const nodesAbove = (outcomes: NodeOutcome[]) =>
    outcomes.filter((o) => o.exceedsDominanceLimit).map((o) => o.nodeId);
  const nodesByAnchor: OptionsReport["nodes"]["byAnchor"] = [];
  for (const anchor of settings.anchors) {
    const results = settings.seeds.map((seed) => {
      const played = randomGenomeCampaign(world, seed, anchor, settings.bot, settings.turns);
      onCampaign?.(played);
      return played.result;
    });
    all.push(...results);
    const outcomes = optionOutcomes(results, limit, z);
    byAnchor.push({ anchor, outcomes, aboveLimit: above(outcomes) });
    const nodes = nodeOutcomes(results, nodeIds, limit, z);
    nodesByAnchor.push({ anchor, outcomes: nodes, aboveLimit: nodesAbove(nodes) });
  }
  const combined = optionOutcomes(all, limit, z);
  const combinedNodes = nodeOutcomes(all, nodeIds, limit, z);
  return {
    anchors: settings.anchors,
    bot: settings.bot,
    seeds: settings.seeds,
    turns: settings.turns,
    dominanceLimit: limit,
    dominanceZ: z,
    byAnchor,
    combined: { outcomes: combined, aboveLimit: above(combined) },
    nodes: {
      byAnchor: nodesByAnchor,
      combined: { outcomes: combinedNodes, aboveLimit: nodesAbove(combinedNodes) },
    },
  };
}

// ---- Rivals persist ------------------------------------------------------------------------

/** One observation of a rival at its lowest, with the campaign it came from. */
export interface RivalLowPoint {
  value: number;
  sportId: string;
  countryId: string;
  turn: number;
  anchor: string;
  bot: BotId;
  seed: number;
}

export interface RivalsPersistCell {
  anchor: string;
  bot: BotId;
  campaigns: number;
  collapses: number;
  /** Lowest rival hardcore share of a country's population seen in this cell. */
  lowestShare: RivalLowPoint | null;
  /** Lowest rival hardcore count relative to its starting count in that country. */
  lowestRetained: RivalLowPoint | null;
  eliminations: number;
}

export interface RivalsPersistReport {
  anchors: string[];
  bots: BotId[];
  seeds: number[];
  turns: number;
  campaigns: number;
  cells: RivalsPersistCell[];
  lowestShare: RivalLowPoint | null;
  lowestRetained: RivalLowPoint | null;
  /** Lowest world hardcore share any rival fell to. */
  lowestGlobalShare: Omit<RivalLowPoint, "countryId" | "turn"> | null;
  /** Every country where a rival's hardcore fans reached zero. The criterion fails if any. */
  eliminations: Omit<RivalLowPoint, "value" | "turn">[];
  passed: boolean;
}

const lower = <T extends { value: number }>(best: T | null, candidate: T): T =>
  best === null || candidate.value < best.value ? candidate : best;

/**
 * Tech plan 2.1 "Rivals persist": no rival is ever fully eliminated from any country or globally,
 * across anchors, bots and seeds. Rival fans are observed after every turn.
 */
export function runRivalsPersist(
  world: World,
  settings: { anchors: string[]; bots: BotId[]; seeds: number[]; turns: number },
  onCampaign?: OnCampaign,
): RivalsPersistReport {
  const cells: RivalsPersistCell[] = [];
  const eliminations: RivalsPersistReport["eliminations"] = [];
  let lowestShare: RivalLowPoint | null = null;
  let lowestRetained: RivalLowPoint | null = null;
  let lowestGlobalShare: RivalsPersistReport["lowestGlobalShare"] = null;
  for (const anchor of settings.anchors) {
    for (const bot of settings.bots) {
      const cell: RivalsPersistCell = {
        anchor,
        bot,
        campaigns: 0,
        collapses: 0,
        lowestShare: null,
        lowestRetained: null,
        eliminations: 0,
      };
      for (const seed of settings.seeds) {
        const played = randomGenomeCampaign(world, seed, anchor, bot, settings.turns);
        onCampaign?.(played);
        cell.campaigns += 1;
        if (played.result.collapsed) cell.collapses += 1;
        for (const rival of played.result.rivalReports) {
          const at = { sportId: rival.sportId, anchor, bot, seed };
          const share = { ...at, ...rival.lowestHardcoreShare };
          const retained = { ...at, ...rival.lowestRetained };
          cell.lowestShare = lower(cell.lowestShare, share);
          cell.lowestRetained = lower(cell.lowestRetained, retained);
          lowestShare = lower(lowestShare, share);
          lowestRetained = lower(lowestRetained, retained);
          lowestGlobalShare = lower(lowestGlobalShare, {
            ...at,
            value: rival.lowestGlobalHardcoreShare,
          });
          for (const countryId of rival.eliminatedFrom) {
            eliminations.push({ ...at, countryId });
            cell.eliminations += 1;
          }
        }
      }
      cells.push(cell);
    }
  }
  return {
    anchors: settings.anchors,
    bots: settings.bots,
    seeds: settings.seeds,
    turns: settings.turns,
    campaigns: cells.reduce((sum, cell) => sum + cell.campaigns, 0),
    cells,
    lowestShare,
    lowestRetained,
    lowestGlobalShare,
    eliminations,
    passed: eliminations.length === 0 && lowestGlobalShare !== null && lowestGlobalShare.value > 0,
  };
}

/**
 * Typical-size anchors for pacing (decided 2026-09-13): every country whose population lies between
 * the configured quantiles of all countries' populations (nearest rank), in content order.
 */
export function typicalAnchors(world: World): string[] {
  const [low, high] = world.config.balanceTargets.pacingAnchorPopulationQuantiles;
  const sorted = world.countries.map((c) => c.population).sort((a, b) => a - b);
  const at = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))] ?? 0;
  const min = at(low);
  const max = at(high);
  return world.countries.filter((c) => c.population >= min && c.population <= max).map((c) => c.id);
}

/** The first country of each climate zone: a spread of contrasting default anchors. */
export function contrastingAnchors(world: World): string[] {
  return CLIMATES.map((climate) => world.countries.find((c) => c.climate === climate)?.id).filter(
    (id): id is string => id !== undefined,
  );
}

// ---- 120-year benchmark --------------------------------------------------------------------

export interface BenchmarkReport {
  anchor: string;
  bot: BotId;
  targetYears: number;
  /** Seeds tried until one campaign lasted the full span, with how each attempt ended. */
  attempts: { seed: number; yearsPlayed: number; collapsed: boolean }[];
  completed: boolean;
  turnsPlayed: number;
  yearsPlayed: number;
  simulateMs: number;
  saveBytes: number;
  serializeMs: number;
  loadMs: number;
  landmarks: number;
  yearlySnapshots: number;
}

/** Plays with a bot until the quarter target or the end, with no per-turn reporting. */
function playUntil(
  world: World,
  seed: number,
  anchor: string,
  bot: BotId,
  quarters: number,
): GameState {
  let state = createCampaign(world, {
    seed,
    anchorCountryId: anchor,
    genome: randomGenome(seed),
  });
  while (state.outcome === null && state.quarter < quarters) {
    state = endTurn(runBot(bot, state, world).state, world);
  }
  return state;
}

export function runBenchmark(
  world: World,
  settings: { anchor: string; bot: BotId; firstSeed: number; years: number; maxAttempts: number },
): BenchmarkReport {
  const targetQuarters = settings.years * QUARTERS_PER_YEAR;
  const attempts: BenchmarkReport["attempts"] = [];
  const empty = {
    anchor: settings.anchor,
    bot: settings.bot,
    targetYears: settings.years,
    attempts,
    completed: false,
    turnsPlayed: 0,
    yearsPlayed: 0,
    simulateMs: 0,
    saveBytes: 0,
    serializeMs: 0,
    loadMs: 0,
    landmarks: 0,
    yearlySnapshots: 0,
  };
  for (let attempt = 0; attempt < settings.maxAttempts; attempt += 1) {
    const seed = settings.firstSeed + attempt;
    const started = performance.now();
    const state = playUntil(world, seed, settings.anchor, settings.bot, targetQuarters);
    const simulateMs = performance.now() - started;
    const years = state.quarter / QUARTERS_PER_YEAR;
    attempts.push({ seed, yearsPlayed: years, collapsed: state.outcome !== null });
    if (state.outcome !== null) continue;

    const serializeStart = performance.now();
    const text = serializeSave(state);
    const serializeMs = performance.now() - serializeStart;
    const loadStart = performance.now();
    deserializeSave(text, world);
    const loadMs = performance.now() - loadStart;
    return {
      ...empty,
      completed: true,
      turnsPlayed: state.turn - 1,
      yearsPlayed: years,
      simulateMs,
      saveBytes: Buffer.byteLength(text, "utf8"),
      serializeMs,
      loadMs,
      landmarks: state.landmarks.length,
      yearlySnapshots: state.yearly.length,
    };
  }
  return empty;
}
