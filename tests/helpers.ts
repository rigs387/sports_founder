import type { Config, World } from "../src/content";
import { loadWorldFromDisk } from "../src/runner/content-from-disk";

export const world = loadWorldFromDisk();

export const firstAnchor = world.countries[0]?.id ?? "missing-country";

/** A copy of `base` with one config change applied. The original is untouched. */
export function withConfig(base: World, change: (config: Config) => void): World {
  const copy = structuredClone(base);
  change(copy.config);
  return copy;
}
