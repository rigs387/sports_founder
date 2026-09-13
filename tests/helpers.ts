import {
  type Config,
  deriveWorld,
  type Genome,
  type World,
  type WorldContent,
} from "../src/content";
import { loadWorldFromDisk } from "../src/runner/content-from-disk";
import { type CampaignSetup, defaultGenome } from "../src/sim";

export const world = loadWorldFromDisk();

export const firstAnchor = world.countries[0]?.id ?? "missing-country";

export const baseGenome: Genome = defaultGenome(world);

export function setupFor(seed: number, anchorCountryId = firstAnchor, genome = baseGenome) {
  return { seed, anchorCountryId, genome } satisfies CampaignSetup;
}

export function presetGenome(id: string): Genome {
  const preset = world.genome.presets.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`No preset "${id}" in content`);
  return preset.genome;
}

/** A copy of `base` with one edit to its content, re-derived. The original is untouched. */
export function withWorld(base: World, edit: (content: WorldContent) => void): World {
  const copy: WorldContent = structuredClone({
    countries: base.countries,
    rivals: base.rivals,
    otherSports: base.otherSports,
    genome: base.genome,
    growthTree: base.growthTree,
    names: base.names,
    config: base.config,
  });
  edit(copy);
  return deriveWorld(copy);
}

/** A copy of `base` with one config change applied. The original is untouched. */
export function withConfig(base: World, change: (config: Config) => void): World {
  return withWorld(base, (content) => change(content.config));
}

export function countryIndex(w: World, id: string): number {
  const index = w.countries.findIndex((country) => country.id === id);
  if (index < 0) throw new Error(`No country "${id}" in content`);
  return index;
}
