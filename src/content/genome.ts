import { AXIS_IDS, type AxisId, type Genome } from "./genome-axes";
import {
  type Climate,
  type GenomeContent,
  LEVERS,
  type Lever,
  type LeverConditions,
  NUMERIC_ATTRIBUTES,
  type NumericAttribute,
  type OptionModifiers,
} from "./schemas";

// Evaluates genome option modifiers against a country's attributes (GDD Sport Genome: "levers
// attach to options, not whole axes", "conditions on country attributes"). Shared by the
// simulation (affinity) and content validation (the no-universal-best-option rule).

/** The country attributes an option may condition on. Numeric ones are 0–1 scores. */
export interface AffinityAttributes {
  climate: Climate;
  wealth: number;
  urbanDensity: number;
  sportCulture: number;
  mediaMarket: number;
  /**
   * Where the country sits on each numeric attribute relative to the world (decided 2026-09-14):
   * 0 at the population-weighted world average, +1 at the most extreme country above it, −1 at the
   * most extreme country below it, linear in between. Numeric conditions read this, not the score.
   */
  position: Record<NumericAttribute, number>;
}

export type LeverDeltas = Record<Lever, number>;

export interface DeltaContribution {
  lever: Lever;
  /** "base", "climate:cold", or a numeric attribute name. */
  source: string;
  delta: number;
}

export const zeroDeltas = (): LeverDeltas => ({ affinity: 0, accessibility: 0, depth: 0 });

/**
 * A numeric condition's delta: the weight applies in full in the most extreme country above the
 * world average, its negative in the most extreme country below it, nothing at the average
 * (`position` from AffinityAttributes).
 */
export function numericConditionDelta(weight: number, position: number): number {
  return weight * position;
}

function leverContributions(
  lever: Lever,
  conditions: LeverConditions | undefined,
  attributes: AffinityAttributes,
): DeltaContribution[] {
  if (!conditions) return [];
  const out: DeltaContribution[] = [];
  const climateDelta = conditions.climate?.[attributes.climate];
  if (climateDelta !== undefined && climateDelta !== 0) {
    out.push({ lever, source: `climate:${attributes.climate}`, delta: climateDelta });
  }
  for (const attribute of NUMERIC_ATTRIBUTES) {
    const weight = conditions[attribute];
    if (weight === undefined || weight === 0) continue;
    out.push({
      lever,
      source: attribute,
      delta: numericConditionDelta(weight, attributes.position[attribute]),
    });
  }
  return out;
}

/** Every nonzero contribution of one option at one country, for explanations. */
export function optionContributions(
  modifiers: OptionModifiers,
  attributes: AffinityAttributes,
): DeltaContribution[] {
  const out: DeltaContribution[] = [];
  for (const lever of LEVERS) {
    const base = modifiers.base[lever];
    if (base !== undefined && base !== 0) out.push({ lever, source: "base", delta: base });
    out.push(...leverContributions(lever, modifiers.conditions[lever], attributes));
  }
  return out;
}

/** Summed per-lever deltas of one option at one country. */
export function optionDeltas(
  modifiers: OptionModifiers,
  attributes: AffinityAttributes,
): LeverDeltas {
  const totals = zeroDeltas();
  for (const contribution of optionContributions(modifiers, attributes)) {
    totals[contribution.lever] += contribution.delta;
  }
  return totals;
}

/** Summed per-lever deltas of a whole genome at one country. */
export function genomeDeltas(
  content: GenomeContent,
  genome: Genome,
  attributes: AffinityAttributes,
): LeverDeltas {
  const totals = zeroDeltas();
  for (const axis of AXIS_IDS) {
    const deltas = optionDeltas(optionModifiers(content, axis, genome[axis]), attributes);
    for (const lever of LEVERS) totals[lever] += deltas[lever];
  }
  return totals;
}

export function optionModifiers(
  content: GenomeContent,
  axis: AxisId,
  option: string,
): OptionModifiers {
  const modifiers = content.options[axis][option];
  if (!modifiers) throw new Error(`No genome modifiers for ${axis}=${option}`);
  return modifiers;
}

/** An option's net lever delta in one country: affinity + accessibility + depth. */
export function optionNetDeltaAt(
  modifiers: OptionModifiers,
  attributes: AffinityAttributes,
): number {
  const deltas = optionDeltas(modifiers, attributes);
  return LEVERS.reduce((sum, lever) => sum + deltas[lever], 0);
}

export type { NumericAttribute };
