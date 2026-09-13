import { uniformFloat64 } from "pure-rand/distribution/uniformFloat64";
import { xoroshiro128plus, xoroshiro128plusFromState } from "pure-rand/generator/xoroshiro128plus";

// Every random roll in the simulation goes through this module. The generator's state is plain
// numbers stored in GameState, so saving and loading continues the exact same random sequence.

export type Rng = ReturnType<typeof xoroshiro128plus>;

export const MAX_SEED = 0xffff_ffff;

/**
 * Draws discarded right after seeding. xoroshiro128plus seeds its state directly from the seed
 * with no mixing, so the first outputs of neighbouring seeds are nearly identical; a short
 * warm-up decorrelates campaigns run on consecutive seeds.
 */
export const SEED_WARM_UP_DRAWS = 32;

export function createRngState(seed: number): number[] {
  const rng = xoroshiro128plus(seed);
  for (let i = 0; i < SEED_WARM_UP_DRAWS; i += 1) rng.next();
  return [...rng.getState()];
}

/** Rebuilds a generator from saved state. The returned generator advances as it is used. */
export function restoreRng(state: readonly number[]): Rng {
  return xoroshiro128plusFromState(state);
}

export function saveRng(rng: Rng): number[] {
  return [...rng.getState()];
}

/** Uniform float in [0, 1). */
export function nextFloat(rng: Rng): number {
  return uniformFloat64(rng);
}
