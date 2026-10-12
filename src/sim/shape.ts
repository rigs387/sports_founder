import type { TraditionType } from "../content";
import { growthNode } from "./growth";
import type { World } from "./types";

// Shaping the sport (GDD v1.35). The growth tracks' fork sides change what the sport is: where it
// catches on, how its leagues work and how it is played. These effects are global and each ends up
// as one factor of 1 + total on one system, read where that system lives:
//   climateFit     climate's part in the genome's fit (genome.ts leverMultipliers)
//   sponsorValue   sponsor and naming-rights offers (deals.ts)
//   mediaRevenue   every league's media revenue (leagues.ts)
//   ratingParity   flagship clubs' reversion to the league mean (flagship.ts driftRatings)
//   flagshipClubs  the flagship's club count by tier (flagship.ts clubTarget)
//   wageFactor     star wages and the payroll baseline at the seat (league-costs.ts)
//   starPlaces     extra star places at every tier, 1 + total (flagship.ts)
//   starMoves      a star's chance to move clubs (flagship.ts)
//   scoring        scoring chances in flagship matches (flagship.ts)
//   starPull       a backed star's casual conversion lift (flagship.ts backingEffects)
//   traditionBirth divides a tradition type's birth thresholds (culture.ts)
// puristBacklash is no factor: it turns hardcore fans in the anchor casual once, at purchase
// (actions.ts). No factor goes below growthTree.limits.minFactor.

export interface ShapeFactors {
  climateFit: number;
  sponsorValue: number;
  mediaRevenue: number;
  ratingParity: number;
  flagshipClubs: number;
  wageFactor: number;
  starPlaces: number;
  starMoves: number;
  scoring: number;
  starPull: number;
  /** By tradition type; "all" for effects naming none. */
  traditionBirth: Partial<Record<TraditionType | "all", number>>;
}

type ShapeKey = Exclude<keyof ShapeFactors, "traditionBirth">;
const SHAPE_KEYS: ShapeKey[] = [
  "climateFit",
  "sponsorValue",
  "mediaRevenue",
  "ratingParity",
  "flagshipClubs",
  "wageFactor",
  "starPlaces",
  "starMoves",
  "scoring",
  "starPull",
];

export const NEUTRAL_SHAPE: Readonly<ShapeFactors> = Object.freeze({
  ...(Object.fromEntries(SHAPE_KEYS.map((key) => [key, 1])) as Record<ShapeKey, number>),
  traditionBirth: {},
});

const cache = new WeakMap<World, Map<string, ShapeFactors>>();
/** The same owned list is read for every country every quarter: remember it by identity too. */
const byList = new WeakMap<World, WeakMap<readonly string[], ShapeFactors>>();

/** The sport's shape from the owned growth levels (cached per world and node set). */
export function shapeFactors(world: World, owned: readonly string[]): ShapeFactors {
  if (owned.length === 0) return NEUTRAL_SHAPE;
  let lists = byList.get(world);
  if (!lists) {
    lists = new WeakMap();
    byList.set(world, lists);
  }
  const known = lists.get(owned);
  if (known) return known;
  let byNodes = cache.get(world);
  if (!byNodes) {
    byNodes = new Map();
    cache.set(world, byNodes);
  }
  const key = [...owned].sort().join("|");
  const cached = byNodes.get(key);
  if (cached) {
    lists.set(owned, cached);
    return cached;
  }
  const totals = Object.fromEntries(SHAPE_KEYS.map((k) => [k, 0])) as Record<ShapeKey, number>;
  const births: Partial<Record<TraditionType | "all", number>> = {};
  for (const id of owned)
    for (const effect of growthNode(world, id).effects) {
      if (effect.type === "traditionBirth") {
        const type = effect.traditionType ?? "all";
        births[type] = (births[type] ?? 0) + effect.amount;
      } else if ((SHAPE_KEYS as string[]).includes(effect.type))
        totals[effect.type as ShapeKey] += effect.amount;
    }
  const floor = world.growthTree.limits.minFactor;
  const factor = (total: number) => Math.max(floor, 1 + total);
  const shape: ShapeFactors = {
    ...(Object.fromEntries(SHAPE_KEYS.map((k) => [k, factor(totals[k])])) as Record<
      ShapeKey,
      number
    >),
    traditionBirth: Object.fromEntries(
      Object.entries(births).map(([type, total]) => [type, factor(total)]),
    ),
  };
  byNodes.set(key, shape);
  lists.set(owned, shape);
  return shape;
}

/** How much easier a tradition type's births are: its own factor × the all-types factor. */
export function birthFactor(shape: ShapeFactors, type: TraditionType): number {
  return (shape.traditionBirth[type] ?? 1) * (shape.traditionBirth.all ?? 1);
}

/** The share of the anchor's hardcore fans a level turns casual when bought (puristBacklash). */
export function puristBacklash(world: World, nodeId: string): number {
  return growthNode(world, nodeId)
    .effects.filter((effect) => effect.type === "puristBacklash")
    .reduce((sum, effect) => sum + effect.amount, 0);
}
