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
import { countBy, median, type OptionOutcome, optionOutcomes } from "./report";

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
  peakTiers: Record<string, number>;
}

export interface CollapseReport {
  seeds: number[];
  turns: number;
  naiveBot: BotId;
  cells: CollapseCell[];
  /** Anchors the naive bot never collapsed. The criterion fails if any exist. */
  safeAnchorsUnderNaiveBot: string[];
  passed: boolean;
}

export function runCollapse(
  world: World,
  settings: { anchors: string[]; bots: BotId[]; naiveBot: BotId; seeds: number[]; turns: number },
  onCampaign?: OnCampaign,
): CollapseReport {
  const bots = settings.bots.includes(settings.naiveBot)
    ? settings.bots
    : [settings.naiveBot, ...settings.bots];
  const cells: CollapseCell[] = [];
  for (const anchor of settings.anchors) {
    for (const bot of bots) {
      const results = settings.seeds.map((seed) => {
        const played = randomGenomeCampaign(world, seed, anchor, bot, settings.turns);
        onCampaign?.(played);
        return played.result;
      });
      const collapsed = results.filter((r) => r.collapsed);
      cells.push({
        anchor,
        bot,
        campaigns: results.length,
        collapses: collapsed.length,
        rate: results.length > 0 ? collapsed.length / results.length : 0,
        medianCollapseTurn: median(
          collapsed.map((r) => r.collapseTurn).filter((t): t is number => t !== null),
        ),
        peakTiers: countBy(results.map((r) => r.peakTier)),
      });
    }
  }
  const safe = cells
    .filter((cell) => cell.bot === settings.naiveBot && cell.collapses === 0)
    .map((cell) => cell.anchor);
  return {
    seeds: settings.seeds,
    turns: settings.turns,
    naiveBot: settings.naiveBot,
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
  byAnchor: { anchor: string; outcomes: OptionOutcome[]; aboveLimit: string[] }[];
  combined: { outcomes: OptionOutcome[]; aboveLimit: string[] };
}

export function runOptions(
  world: World,
  settings: { anchors: string[]; bot: BotId; seeds: number[]; turns: number },
  onCampaign?: OnCampaign,
): OptionsReport {
  const limit = world.config.balanceTargets.dominanceLimit;
  const above = (outcomes: OptionOutcome[]) =>
    outcomes.filter((o) => o.exceedsDominanceLimit).map((o) => `${o.axis}=${o.option}`);
  const all: PlayedCampaign["result"][] = [];
  const byAnchor: OptionsReport["byAnchor"] = [];
  for (const anchor of settings.anchors) {
    const results = settings.seeds.map((seed) => {
      const played = randomGenomeCampaign(world, seed, anchor, settings.bot, settings.turns);
      onCampaign?.(played);
      return played.result;
    });
    all.push(...results);
    const outcomes = optionOutcomes(results, limit);
    byAnchor.push({ anchor, outcomes, aboveLimit: above(outcomes) });
  }
  const combined = optionOutcomes(all, limit);
  return {
    anchors: settings.anchors,
    bot: settings.bot,
    seeds: settings.seeds,
    turns: settings.turns,
    dominanceLimit: limit,
    byAnchor,
    combined: { outcomes: combined, aboveLimit: above(combined) },
  };
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
