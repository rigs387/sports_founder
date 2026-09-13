import { AXIS_IDS, GENOME_AXES, LEVERS, optionDeltas, optionModifiers } from "../content";
import { countryAttributes } from "./genome";
import type { AxisId, World } from "./types";

// Anchor-only genome hints (GDD Campaign setup): qualitative + / ++ / − per option, computed for
// the chosen anchor country. No world affinity preview; where the sport catches on abroad is
// discovered in play.

export type GenomeHint = "++" | "+" | "-" | null;

export type GenomeHints = Record<AxisId, Record<string, GenomeHint>>;

/** An option's net lever delta at a country: affinity + accessibility + depth. */
export function optionNetDelta(world: World, axis: AxisId, option: string, index: number) {
  const deltas = optionDeltas(
    optionModifiers(world.genome, axis, option),
    countryAttributes(world, index),
  );
  return LEVERS.reduce((sum, lever) => sum + deltas[lever], 0);
}

export function anchorGenomeHints(world: World, anchorCountryId: string): GenomeHints {
  const index = world.countries.findIndex((country) => country.id === anchorCountryId);
  if (index < 0) throw new Error(`Unknown anchor country "${anchorCountryId}"`);
  const { hints } = world.config;
  const out = {} as GenomeHints;
  for (const axis of AXIS_IDS) {
    out[axis] = {};
    for (const option of GENOME_AXES[axis].options) {
      const net = optionNetDelta(world, axis, option, index);
      let hint: GenomeHint = null;
      if (net >= hints.plusPlus) hint = "++";
      else if (net >= hints.plus) hint = "+";
      else if (net <= hints.minus) hint = "-";
      out[axis][option] = hint;
    }
  }
  return out;
}
