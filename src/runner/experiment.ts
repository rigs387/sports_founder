import type { World } from "../sim";
import { type CampaignPlan, type PlayedCampaign, playCampaign } from "./campaign";
import type { PolicyId } from "./policy";
import { mean } from "./report";

// Genome differentiation experiment (tech plan 2.1 exit criterion): with anchor and seeds held
// constant, contrasting genomes should share fewer than half of their top-10 fandom countries.
// Every pair and every seed is reported, passes and failures alike. Two rankings are measured:
// by raw Fandom Score (the criterion as written; large countries weigh heavily) and by Fandom
// Score per head of population (where the sport caught on most).

export const TOP_N = 10;
/** Pass if the mean shared count is strictly below half of TOP_N. */
export const SHARED_LIMIT = TOP_N / 2;

export type Ranking = "byScore" | "byShare";
export const RANKINGS: Ranking[] = ["byScore", "byShare"];

export interface RankingComparison {
  /** Per seed, in seed order: how many of the two top-10 lists coincide. */
  sharedBySeed: number[];
  meanShared: number;
  /** Seeds where the two genomes shared at least half their top-10. */
  seedsAtOrAboveHalf: number;
  passed: boolean;
  /** Countries in one genome's top-10 in a majority of seeds but not the other's. */
  distinctiveA: string[];
  distinctiveB: string[];
}

export interface PairResult {
  a: string;
  b: string;
  byScore: RankingComparison;
  byShare: RankingComparison;
}

export interface PresetOutcome {
  preset: string;
  /** Per seed: final player Fandom Score and countries with any fans. */
  fandomScoreBySeed: number[];
  countriesWithFansBySeed: number[];
  medianFandomScore: number | null;
}

export interface DifferentiationReport {
  anchorCountryId: string;
  seeds: number[];
  turns: number;
  presets: string[];
  outcomes: PresetOutcome[];
  pairs: PairResult[];
  /** Pass counts per ranking. */
  pairsPassed: Record<Ranking, number>;
  pairsFailed: Record<Ranking, number>;
  /** The criterion as written: every pair passes by raw Fandom Score. */
  passed: boolean;
  passedByShare: boolean;
}

export interface ExperimentSettings {
  anchorCountryId: string;
  seeds: number[];
  turns: number;
  policy: PolicyId;
  /** Preset ids to pair up; all pairs are run. */
  presets: string[];
}

interface TopLists {
  byScore: string[];
  byShare: string[];
}

function majority(lists: string[][]): Set<string> {
  const counts = new Map<string, number>();
  for (const list of lists) for (const id of list) counts.set(id, (counts.get(id) ?? 0) + 1);
  return new Set([...counts].filter(([, n]) => n > lists.length / 2).map(([id]) => id));
}

function compare(listsA: string[][], listsB: string[][]): RankingComparison {
  const sharedBySeed = listsA.map((listA, s) => {
    const setB = new Set(listsB[s] ?? []);
    return listA.filter((id) => setB.has(id)).length;
  });
  const meanShared = mean(sharedBySeed) ?? TOP_N;
  const usualA = majority(listsA);
  const usualB = majority(listsB);
  return {
    sharedBySeed,
    meanShared,
    seedsAtOrAboveHalf: sharedBySeed.filter((n) => n >= SHARED_LIMIT).length,
    passed: meanShared < SHARED_LIMIT,
    distinctiveA: [...usualA].filter((id) => !usualB.has(id)),
    distinctiveB: [...usualB].filter((id) => !usualA.has(id)),
  };
}

export function runDifferentiation(
  world: World,
  settings: ExperimentSettings,
  onCampaign?: (played: PlayedCampaign) => void,
): DifferentiationReport {
  const presets = settings.presets.map((id) => {
    const preset = world.genome.presets.find((candidate) => candidate.id === id);
    if (!preset) throw new Error(`Unknown genome preset "${id}"`);
    return preset;
  });
  if (presets.length < 2)
    throw new Error("The differentiation experiment needs two or more presets");

  const top = new Map<string, TopLists[]>();
  const outcomes: PresetOutcome[] = [];
  for (const preset of presets) {
    const lists: TopLists[] = [];
    const scores: number[] = [];
    const reach: number[] = [];
    for (const seed of settings.seeds) {
      const plan: CampaignPlan = {
        seed,
        anchorCountryId: settings.anchorCountryId,
        genome: preset.genome,
        genomeLabel: preset.id,
        policy: settings.policy,
        turns: settings.turns,
      };
      const played = playCampaign(world, plan);
      onCampaign?.(played);
      const byShare = [...played.countryRows]
        .sort((x, y) => y.share - x.share || y.fandomScore - x.fandomScore)
        .slice(0, TOP_N)
        .map((row) => row.countryId);
      lists.push({ byScore: played.result.topCountries.slice(0, TOP_N), byShare });
      scores.push(played.result.player.fandomScore);
      reach.push(played.result.countriesWithFans);
    }
    top.set(preset.id, lists);
    outcomes.push({
      preset: preset.id,
      fandomScoreBySeed: scores,
      countriesWithFansBySeed: reach,
      medianFandomScore: mean(scores),
    });
  }

  const pairs: PairResult[] = [];
  for (let i = 0; i < presets.length; i += 1) {
    for (let j = i + 1; j < presets.length; j += 1) {
      const a = presets[i]?.id ?? "";
      const b = presets[j]?.id ?? "";
      const listsA = top.get(a) ?? [];
      const listsB = top.get(b) ?? [];
      pairs.push({
        a,
        b,
        byScore: compare(
          listsA.map((l) => l.byScore),
          listsB.map((l) => l.byScore),
        ),
        byShare: compare(
          listsA.map((l) => l.byShare),
          listsB.map((l) => l.byShare),
        ),
      });
    }
  }
  const passedCount = (ranking: Ranking) => pairs.filter((pair) => pair[ranking].passed).length;
  const pairsPassed = { byScore: passedCount("byScore"), byShare: passedCount("byShare") };
  return {
    anchorCountryId: settings.anchorCountryId,
    seeds: settings.seeds,
    turns: settings.turns,
    presets: presets.map((preset) => preset.id),
    outcomes,
    pairs,
    pairsPassed,
    pairsFailed: {
      byScore: pairs.length - pairsPassed.byScore,
      byShare: pairs.length - pairsPassed.byShare,
    },
    passed: pairsPassed.byScore === pairs.length,
    passedByShare: pairsPassed.byShare === pairs.length,
  };
}
