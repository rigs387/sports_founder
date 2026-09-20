import {
  type AffinityAttributes,
  type GrowthCategory,
  type GrowthNode,
  type NodeEffect,
  NUMERIC_ATTRIBUTES,
  numericConditionDelta,
} from "../content";
import { costMultiplier } from "./calendar";
import { playerFandomScore } from "./fandom";
import { countryAttributes } from "./genome";
import type { GameState, World } from "./types";

// PP growth tree (GDD PP Growth Tree). Nodes are permanent purchases that apply worldwide, often
// conditioned on country attributes. Every effect in the closed vocabulary ends up as a factor on
// one rate, cost or effect size per country:
//   bonus      factor = 1 + total   spread channels, casual and hardcore conversion, PP income
//   reduction  factor = 1 − total   churn, formation threshold, cold-launch premium, running cost,
//                                   rival countermove effects
// Totals sum every owned node's effect value in the country; no factor goes below
// growthTree.limits.minFactor. An effect's value in a country is its amount plus its conditions
// (the genome's condition style), and a condition never flips the effect's sign.
// Buying rules: the category must be unlocked at the current PP tier, every prerequisite owned, no
// fork sibling owned, and the price is base cost × the PP cost multiplier. No refunds.

export interface GrowthFactors {
  proximity: number;
  language: number;
  media: number;
  casualConversion: number;
  hardcoreConversion: number;
  churn: number;
  formationThreshold: number;
  /** Multiplies the cold-launch premium of a focus slot (the part above the exposed cost). */
  coldLaunchPremium: number;
  ppIncome: number;
  runningCost: number;
  /** Multiplies the size of every rival countermove's effect on the player. */
  countermoveEffect: number;
}

type FactorKey = keyof GrowthFactors;

function factorKey(effect: NodeEffect): { key: FactorKey; reduction: boolean } {
  switch (effect.type) {
    case "spreadChannel":
      return { key: effect.channel ?? "proximity", reduction: false };
    case "casualConversion":
      return { key: "casualConversion", reduction: false };
    case "hardcoreConversion":
      return { key: "hardcoreConversion", reduction: false };
    case "ppIncome":
      return { key: "ppIncome", reduction: false };
    case "churnReduction":
      return { key: "churn", reduction: true };
    case "formationThresholdReduction":
      return { key: "formationThreshold", reduction: true };
    case "coldLaunchCostReduction":
      return { key: "coldLaunchPremium", reduction: true };
    case "runningCostReduction":
      return { key: "runningCost", reduction: true };
    case "countermoveResistance":
      return { key: "countermoveEffect", reduction: true };
  }
}

const FACTOR_KEYS: FactorKey[] = [
  "proximity",
  "language",
  "media",
  "casualConversion",
  "hardcoreConversion",
  "churn",
  "formationThreshold",
  "coldLaunchPremium",
  "ppIncome",
  "runningCost",
  "countermoveEffect",
];

export const NEUTRAL_FACTORS: Readonly<GrowthFactors> = Object.freeze(
  Object.fromEntries(FACTOR_KEYS.map((key) => [key, 1])) as unknown as GrowthFactors,
);

/** An effect's value in a country: amount plus conditions, never flipping the amount's sign. */
export function effectValue(effect: NodeEffect, attributes: AffinityAttributes): number {
  let value = effect.amount;
  const conditions = effect.conditions;
  if (conditions) {
    value += conditions.climate?.[attributes.climate] ?? 0;
    for (const attribute of NUMERIC_ATTRIBUTES) {
      const weight = conditions[attribute];
      if (weight !== undefined) {
        value += numericConditionDelta(weight, attributes.position[attribute]);
      }
    }
  }
  return effect.amount > 0 ? Math.max(0, value) : Math.min(0, value);
}

export function growthNode(world: World, nodeId: string): GrowthNode {
  const node = world.growthTree.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error(`Unknown growth node "${nodeId}"`);
  return node;
}

// Factors depend only on static content and the set of owned nodes, and are read many times per
// quarter, so they are cached per world and node set.
const cache = new WeakMap<World, Map<string, GrowthFactors[]>>();

/** Per country (content order): the factors every owned node applies there. */
export function growthFactors(world: World, owned: readonly string[]): readonly GrowthFactors[] {
  let byNodes = cache.get(world);
  if (!byNodes) {
    byNodes = new Map();
    cache.set(world, byNodes);
  }
  const key = [...owned].sort().join("|");
  const cached = byNodes.get(key);
  if (cached) return cached;

  const nodes = owned.map((id) => growthNode(world, id));
  const floor = world.growthTree.limits.minFactor;
  const factors = world.countries.map((_country, index): GrowthFactors => {
    const attributes = countryAttributes(world, index);
    const totals = Object.fromEntries(FACTOR_KEYS.map((k) => [k, 0])) as Record<FactorKey, number>;
    const reductions = new Set<FactorKey>();
    for (const node of nodes) {
      for (const effect of node.effects) {
        const { key, reduction } = factorKey(effect);
        totals[key] += effectValue(effect, attributes);
        if (reduction) reductions.add(key);
      }
    }
    return Object.fromEntries(
      FACTOR_KEYS.map((k) => [
        k,
        Math.max(floor, reductions.has(k) ? 1 - totals[k] : 1 + totals[k]),
      ]),
    ) as unknown as GrowthFactors;
  });
  byNodes.set(key, factors);
  return factors;
}

/** The factors in one country. */
export function growthFactorsAt(
  world: World,
  owned: readonly string[],
  countryIndex: number,
): GrowthFactors {
  const factors = growthFactors(world, owned)[countryIndex];
  if (!factors) throw new Error(`No country #${countryIndex} in content`);
  return factors;
}

export function categoryUnlockTier(world: World, category: GrowthCategory): number | null {
  return world.growthTree.categories[category]?.unlockTier ?? null;
}

/** The fork a node belongs to, if any. */
export function forkOf(world: World, nodeId: string) {
  return world.growthTree.forks.find((fork) => fork.nodes.includes(nodeId)) ?? null;
}

/** Why a node cannot be bought right now, ignoring PP. Null when it can. */
export type NodeBlocker =
  | { kind: "owned" }
  | { kind: "fork"; forkId: string; takenBy: string }
  | { kind: "tier"; unlockTier: number }
  | { kind: "prerequisites"; missing: string[] };

export function nodeBlocker(
  state: Pick<GameState, "growthNodes" | "ppTier">,
  world: World,
  nodeId: string,
): NodeBlocker | null {
  const node = growthNode(world, nodeId);
  if (state.growthNodes.includes(nodeId)) return { kind: "owned" };
  const fork = forkOf(world, nodeId);
  const takenBy = fork?.nodes.find((id) => id !== nodeId && state.growthNodes.includes(id));
  if (fork && takenBy !== undefined) return { kind: "fork", forkId: fork.id, takenBy };
  const unlockTier = categoryUnlockTier(world, node.category);
  if (unlockTier === null || state.ppTier < unlockTier) {
    return { kind: "tier", unlockTier: unlockTier ?? Number.POSITIVE_INFINITY };
  }
  const missing = node.requires.filter((id) => !state.growthNodes.includes(id));
  if (missing.length > 0) return { kind: "prerequisites", missing };
  return null;
}

/**
 * How much the sport's own size raises node prices: (Fandom Score ÷ reference) ^ exponent, never
 * below 1 (GDD PP Growth Tree, decided 2026-09-19). A bigger sport pays more for the same node, so
 * the tree is never bought out and its branches stay a choice.
 */
export function nodeSizeFactor(
  state: Pick<GameState, "sports" | "countries">,
  world: World,
): number {
  const { referenceFandomScore, exponent } = world.growthTree.costScaling;
  const score = playerFandomScore(
    state.sports,
    state.countries,
    world.config.fandomScore.casualWeight,
  );
  return Math.max(1, score / referenceFandomScore) ** exponent;
}

/**
 * PP price of a node now: base cost × the PP cost multiplier (the highest tier reached) × the
 * sport's size factor.
 */
export function nodeCost(
  state: Pick<GameState, "tierTrack" | "sports" | "countries">,
  world: World,
  nodeId: string,
): number {
  return (
    growthNode(world, nodeId).cost *
    costMultiplier(state, world.config) *
    nodeSizeFactor(state, world)
  );
}
