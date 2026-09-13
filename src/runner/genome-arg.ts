import { uniformInt } from "pure-rand/distribution/uniformInt";
import { xoroshiro128plus } from "pure-rand/generator/xoroshiro128plus";
import { AXIS_IDS, type AxisId, GENOME_AXES, type Genome, type World } from "../content";
import { SEED_WARM_UP_DRAWS } from "../sim";

// Parses the runner's --genome option:
//   <preset-id>                        a quick-start preset from content/genome.yaml
//   random                             a different seeded random genome per campaign
//   [<preset-id>:]axis=option,...      a preset (default: the first) with overrides

export type GenomeChoice = { kind: "fixed"; genome: Genome } | { kind: "random" };

export function parseGenomeArg(spec: string | undefined, world: World): GenomeChoice {
  const presets = world.genome.presets;
  const first = presets[0];
  if (!first) throw new Error("Content has no genome presets");
  if (spec === undefined || spec === "") return { kind: "fixed", genome: first.genome };
  if (spec === "random") return { kind: "random" };

  const preset = presets.find((candidate) => candidate.id === spec);
  if (preset) return { kind: "fixed", genome: preset.genome };

  let base = first.genome;
  let overrides = spec;
  const colon = spec.indexOf(":");
  if (colon >= 0) {
    const presetId = spec.slice(0, colon);
    const named = presets.find((candidate) => candidate.id === presetId);
    if (!named) throw new Error(`Unknown genome preset "${presetId}"`);
    base = named.genome;
    overrides = spec.slice(colon + 1);
  }
  const genome: Record<string, string> = { ...base };
  for (const pair of overrides.split(",").filter((part) => part !== "")) {
    const [axis, option] = pair.split("=");
    if (!axis || !option || !(axis in GENOME_AXES)) {
      throw new Error(
        `Bad genome override "${pair}": expected axis=option with axis one of ${AXIS_IDS.join(", ")}`,
      );
    }
    const options = GENOME_AXES[axis as AxisId].options as readonly string[];
    if (!options.includes(option)) {
      throw new Error(`Bad genome override "${pair}": ${axis} options are ${options.join(", ")}`);
    }
    genome[axis] = option;
  }
  return { kind: "fixed", genome: genome as Genome };
}

/** A uniformly random genome, seeded, so a batch is reproducible. */
export function randomGenome(seed: number): Genome {
  const rng = xoroshiro128plus(seed);
  // Same warm-up as the simulation's RNG: consecutive seeds start from near-identical states.
  for (let i = 0; i < SEED_WARM_UP_DRAWS; i += 1) rng.next();
  const genome: Record<string, string> = {};
  for (const axis of AXIS_IDS) {
    const options = GENOME_AXES[axis].options;
    const index = uniformInt(rng, 0, options.length - 1);
    genome[axis] = options[index] ?? options[0];
  }
  return genome as Genome;
}

export function formatGenome(genome: Genome): string {
  return AXIS_IDS.map((axis) => `${axis}=${genome[axis]}`).join(",");
}
