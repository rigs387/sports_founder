import {
  type AffinityAttributes,
  AXIS_IDS,
  type DeltaContribution,
  genomeDeltas,
  LEVERS,
  type LeverDeltas,
  optionContributions,
  optionModifiers,
} from "../content";
import type { AxisId, Config, CountryState, Genome, SportState, World } from "./types";

// Genome × country affinity (GDD Sport Genome). Three lever multipliers per country:
// affinity (both conversions), accessibility (casual), depth (hardcore). Each starts at 1, the
// chosen options' deltas at that country are added, and the result is clamped by config.

export interface LeverMultipliers {
  affinity: number;
  accessibility: number;
  depth: number;
}

export function countryAttributes(world: World, countryIndex: number): AffinityAttributes {
  const derived = world.derived[countryIndex];
  if (!derived) throw new Error(`No derived attributes for country #${countryIndex}`);
  return derived;
}

export function multipliersFromDeltas(deltas: LeverDeltas, config: Config): LeverMultipliers {
  const clamp = (lever: keyof LeverMultipliers) => {
    const { min, max } = config.levers[lever];
    return Math.min(max, Math.max(min, 1 + deltas[lever]));
  };
  return {
    affinity: clamp("affinity"),
    accessibility: clamp("accessibility"),
    depth: clamp("depth"),
  };
}

/** The genome's lever multipliers in one country. */
export function leverMultipliers(
  world: World,
  genome: Genome,
  countryIndex: number,
): LeverMultipliers {
  const deltas = genomeDeltas(world.genome, genome, countryAttributes(world, countryIndex));
  return multipliersFromDeltas(deltas, world.config);
}

export interface LeverExplanation {
  multipliers: LeverMultipliers;
  deltas: LeverDeltas;
  /** Per axis: the chosen option and every nonzero contribution it makes here. */
  options: { axis: AxisId; option: string; contributions: DeltaContribution[] }[];
}

/** Why the genome's levers are what they are in one country (for reports and tooltips). */
export function explainLevers(
  world: World,
  genome: Genome,
  countryIndex: number,
): LeverExplanation {
  const attributes = countryAttributes(world, countryIndex);
  const deltas = { affinity: 0, accessibility: 0, depth: 0 };
  const options = AXIS_IDS.map((axis) => {
    const option = genome[axis];
    const contributions = optionContributions(
      optionModifiers(world.genome, axis, option),
      attributes,
    );
    for (const c of contributions) deltas[c.lever] += c.delta;
    return { axis, option, contributions };
  });
  return { multipliers: multipliersFromDeltas(deltas, world.config), deltas, options };
}

/** Weighted share of axes on which two genomes choose the same option, 0–1. */
export function similarity(a: Genome, b: Genome, config: Config): number {
  const weights = config.similarity.axisWeights;
  let total = 0;
  let matching = 0;
  for (const axis of AXIS_IDS) {
    total += weights[axis];
    if (a[axis] === b[axis]) matching += weights[axis];
  }
  return total > 0 ? matching / total : 0;
}

export interface DominantRival {
  /** Index into GameState.sports, or -1 if no rival has hardcore fans here. */
  sportIndex: number;
  hardcoreShare: number;
}

/** The rival with the most hardcore fans in a country right now. */
export function dominantRival(
  countryState: CountryState,
  sports: readonly SportState[],
  population: number,
): DominantRival {
  let best: DominantRival = { sportIndex: -1, hardcoreShare: 0 };
  countryState.fans.forEach((fans, index) => {
    if (sports[index]?.kind !== "rival") return;
    if (fans.hardcore > best.hardcoreShare * population) {
      best = { sportIndex: index, hardcoreShare: fans.hardcore / population };
    }
  });
  return best;
}

export function rivalGenome(world: World, sportIndex: number): Genome {
  const rival = world.rivals[sportIndex - 1];
  if (!rival) throw new Error(`Sport #${sportIndex} is not a rival`);
  return rival.genome;
}

export interface SimilarityEffect {
  /** Raw similarity to the dominant rival's genome (0 if there is none). */
  similarity: number;
  /** Similarity scaled by how established that rival is here. */
  effective: number;
  casualFactor: number;
  hardcoreFactor: number;
}

/**
 * GDD Rival similarity: resembling the dominant rival makes casual conversion easier (familiar)
 * and hardcore conversion harder (they already have that sport). The effect scales with the
 * rival's hardcore share, up to config.similarity.fullEffectHardcoreShare.
 */
export function similarityEffect(
  world: World,
  genome: Genome,
  countryState: CountryState,
  sports: readonly SportState[],
  population: number,
): SimilarityEffect {
  const { similarity: settings } = world.config;
  const dominant = dominantRival(countryState, sports, population);
  if (dominant.sportIndex < 0) {
    return { similarity: 0, effective: 0, casualFactor: 1, hardcoreFactor: 1 };
  }
  const raw = similarity(genome, rivalGenome(world, dominant.sportIndex), world.config);
  const establishment = Math.min(1, dominant.hardcoreShare / settings.fullEffectHardcoreShare);
  const effective = raw * establishment;
  return {
    similarity: raw,
    effective,
    casualFactor: 1 + settings.casualFamiliarityBonus * effective,
    hardcoreFactor: 1 - settings.hardcoreCrowdingPenalty * effective,
  };
}

export { LEVERS };
