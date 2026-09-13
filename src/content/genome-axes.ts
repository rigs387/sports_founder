// The sport genome's axes and options (GDD Sport Genome table). Fixed by design, so they are
// declared here rather than in content; content/genome.yaml must cover exactly these and supplies
// every number attached to them.

export type AxisKind = "identity" | "rule";

export interface GenomeAxis<Option extends string = string> {
  readonly id: string;
  readonly kind: AxisKind;
  readonly options: readonly Option[];
}

export const GENOME_AXES = {
  surface: { id: "surface", kind: "identity", options: ["grass", "indoor", "street", "ice"] },
  equipment: {
    id: "equipment",
    kind: "identity",
    options: ["ball-only", "stick-or-bat", "protective-gear"],
  },
  physical: {
    id: "physical",
    kind: "identity",
    options: ["speed", "strength", "precision", "endurance"],
  },
  footprint: { id: "footprint", kind: "identity", options: ["small", "medium", "large"] },
  contact: { id: "contact", kind: "rule", options: ["none", "incidental", "full"] },
  teamSize: { id: "teamSize", kind: "rule", options: ["small", "medium", "large"] },
  matchLength: { id: "matchLength", kind: "rule", options: ["short", "standard", "long"] },
  scoring: { id: "scoring", kind: "rule", options: ["low", "medium", "high"] },
  complexity: { id: "complexity", kind: "rule", options: ["simple", "moderate", "intricate"] },
  structure: {
    id: "structure",
    kind: "rule",
    options: ["continuous", "stop-start", "innings"],
  },
} as const satisfies Record<string, GenomeAxis>;

export type AxisId = keyof typeof GENOME_AXES;
export type OptionOf<A extends AxisId> = (typeof GENOME_AXES)[A]["options"][number];

/** A complete sport genome: one option per axis. */
export type Genome = { [A in AxisId]: OptionOf<A> };

export const AXIS_IDS = Object.keys(GENOME_AXES) as AxisId[];

export const IDENTITY_AXES = AXIS_IDS.filter((axis) => GENOME_AXES[axis].kind === "identity");
export const RULE_AXES = AXIS_IDS.filter((axis) => GENOME_AXES[axis].kind === "rule");

export function axisOptions(axis: AxisId): readonly string[] {
  return GENOME_AXES[axis].options;
}
