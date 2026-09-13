import type { World } from "../sim";
import { type PlayedCampaign, playCampaign } from "./campaign";
import type { BotId } from "./policy";
import { mean } from "./report";

// Genome differentiation experiment (tech plan 2.1 exit criterion): with anchor and seeds held
// constant, contrasting genomes share fewer than half of their top-10 fandom countries. "Top-10
// fandom countries" means top-10 by Fandom Score ÷ population (decided 2026-09-13); the raw-score
// ranking is reported alongside. Every pair and every seed is reported, passes and failures alike.

export type Ranking = "byShare" | "byScore";
export const RANKINGS: Ranking[] = ["byShare", "byScore"];

export interface RankingComparison {
  /** Per seed, in seed order: how many of the two top-N lists coincide. */
  sharedBySeed: number[];
  meanShared: number;
  /** Seeds where the two genomes shared at least the limit. */
  seedsAtOrAboveLimit: number;
  passed: boolean;
  /** Countries in one genome's top-N in a majority of seeds but not the other's. */
  distinctiveA: string[];
  distinctiveB: string[];
}

export interface PairResult {
  a: string;
  b: string;
  byShare: RankingComparison;
  byScore: RankingComparison;
}

export interface PresetOutcome {
  preset: string;
  fandomScoreBySeed: number[];
  collapsedSeeds: number[];
}

export interface DifferentiationReport {
  anchorCountryId: string;
  bot: BotId;
  seeds: number[];
  turns: number;
  topN: number;
  sharedLimit: number;
  presets: string[];
  outcomes: PresetOutcome[];
  pairs: PairResult[];
  pairsPassed: Record<Ranking, number>;
  pairsFailed: Record<Ranking, number>;
  /** The criterion: every pair passes by population share. */
  passed: boolean;
}

export interface DifferentiationSettings {
  anchorCountryId: string;
  seeds: number[];
  turns: number;
  bot: BotId;
  presets: string[];
}

function majority(lists: string[][]): Set<string> {
  const counts = new Map<string, number>();
  for (const list of lists) for (const id of list) counts.set(id, (counts.get(id) ?? 0) + 1);
  return new Set([...counts].filter(([, n]) => n > lists.length / 2).map(([id]) => id));
}

function compare(listsA: string[][], listsB: string[][], limit: number): RankingComparison {
  const sharedBySeed = listsA.map((listA, s) => {
    const setB = new Set(listsB[s] ?? []);
    return listA.filter((id) => setB.has(id)).length;
  });
  const meanShared = mean(sharedBySeed) ?? Number.POSITIVE_INFINITY;
  const usualA = majority(listsA);
  const usualB = majority(listsB);
  return {
    sharedBySeed,
    meanShared,
    seedsAtOrAboveLimit: sharedBySeed.filter((n) => n >= limit).length,
    passed: meanShared < limit,
    distinctiveA: [...usualA].filter((id) => !usualB.has(id)),
    distinctiveB: [...usualB].filter((id) => !usualA.has(id)),
  };
}

export function runDifferentiation(
  world: World,
  settings: DifferentiationSettings,
  onCampaign?: (played: PlayedCampaign) => void,
): DifferentiationReport {
  const { differentiationTopN: topN, differentiationSharedShare } = world.config.balanceTargets;
  const sharedLimit = topN * differentiationSharedShare;
  const presets = settings.presets.map((id) => {
    const preset = world.genome.presets.find((candidate) => candidate.id === id);
    if (!preset) throw new Error(`Unknown genome preset "${id}"`);
    return preset;
  });
  if (presets.length < 2) {
    throw new Error("The differentiation experiment needs two or more presets");
  }

  const lists = new Map<string, { byShare: string[][]; byScore: string[][] }>();
  const outcomes: PresetOutcome[] = [];
  for (const preset of presets) {
    const entry = { byShare: [] as string[][], byScore: [] as string[][] };
    const outcome: PresetOutcome = { preset: preset.id, fandomScoreBySeed: [], collapsedSeeds: [] };
    for (const seed of settings.seeds) {
      const played = playCampaign(world, {
        seed,
        anchorCountryId: settings.anchorCountryId,
        genome: preset.genome,
        genomeLabel: preset.id,
        bot: settings.bot,
        turns: settings.turns,
      });
      onCampaign?.(played);
      entry.byShare.push(played.result.topCountriesByShare.slice(0, topN));
      entry.byScore.push(played.result.topCountries.slice(0, topN));
      outcome.fandomScoreBySeed.push(played.result.player.fandomScore);
      if (played.result.collapsed) outcome.collapsedSeeds.push(seed);
    }
    lists.set(preset.id, entry);
    outcomes.push(outcome);
  }

  const pairs: PairResult[] = [];
  for (let i = 0; i < presets.length; i += 1) {
    for (let j = i + 1; j < presets.length; j += 1) {
      const a = presets[i]?.id ?? "";
      const b = presets[j]?.id ?? "";
      const listsA = lists.get(a);
      const listsB = lists.get(b);
      if (!listsA || !listsB) continue;
      pairs.push({
        a,
        b,
        byShare: compare(listsA.byShare, listsB.byShare, sharedLimit),
        byScore: compare(listsA.byScore, listsB.byScore, sharedLimit),
      });
    }
  }
  const passedCount = (ranking: Ranking) => pairs.filter((pair) => pair[ranking].passed).length;
  const pairsPassed = { byShare: passedCount("byShare"), byScore: passedCount("byScore") };
  return {
    anchorCountryId: settings.anchorCountryId,
    bot: settings.bot,
    seeds: settings.seeds,
    turns: settings.turns,
    topN,
    sharedLimit,
    presets: presets.map((preset) => preset.id),
    outcomes,
    pairs,
    pairsPassed,
    pairsFailed: {
      byShare: pairs.length - pairsPassed.byShare,
      byScore: pairs.length - pairsPassed.byScore,
    },
    passed: pairs.length > 0 && pairsPassed.byShare === pairs.length,
  };
}
