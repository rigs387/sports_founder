import { type AxisId, GENOME_AXES } from "../content";
import type { GameState, ResentmentState, World } from "./types";

// Anchor resentment (GDD v1.40 Late-Game Pressure, tech plan 2.32). As the sport globalizes, the
// anchor's purists feel abandoned. A stored value from 0 to 1, every number in config
// `anchorResentment`:
//   rises   each quarter the anchor has held no focus slot for more than graceQuarters, and each
//           quarter the seat is abroad, but only once the sport has a league abroad; each
//           amendment toward a casual-friendly option (casualRules), a step per jump
//   falls   each quarter the anchor holds a focus slot, faster with the seat home too; each
//           amendment away from a casual-friendly option
//   does    a quarterly hardcore demotion at home (quarter.ts), a drag on the anchor league's
//           health evaluation (leagues.ts) that can fold it, and scales the anchor's amendment
//           backlash (rules.ts) and the share it loses when the seat leaves (flagship.ts)
// No randomness.

type Resenting = Pick<GameState, "anchorCountryId" | "countries" | "focus" | "flagship"> & {
  resentment: ResentmentState;
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** Whether the sport has a league outside the anchor: resentment grows only from then on. */
export function hasLeagueAbroad(state: Pick<GameState, "anchorCountryId" | "countries">): boolean {
  return state.countries.some((c) => c.countryId !== state.anchorCountryId && c.league !== null);
}

/** Why resentment is moving now: what a quarter played from `state` would do to it. */
export interface ResentmentDrivers {
  abroad: boolean;
  focused: boolean;
  seatHome: boolean;
  /** Quarters since the anchor was last tended (focus, or no league abroad). */
  untendedQuarters: number;
  /** The neglect clock has passed the grace period. */
  neglected: boolean;
  /** The change a quarter, before the 0–1 limits. */
  perQuarter: number;
}

export function resentmentDrivers(
  state: Resenting,
  world: World,
  quarter: number,
): ResentmentDrivers {
  const config = world.config.anchorResentment;
  const abroad = hasLeagueAbroad(state);
  const focused = state.focus.includes(state.anchorCountryId);
  const seatHome = state.flagship.countryId === state.anchorCountryId;
  const tended = focused || !abroad ? quarter : state.resentment.tendedQuarter;
  const untendedQuarters = quarter - tended;
  const neglected = abroad && untendedQuarters > config.graceQuarters;
  const rise =
    (neglected ? config.neglectPerQuarter : 0) +
    (abroad && !seatHome ? config.seatAwayPerQuarter : 0);
  const fall = focused ? (seatHome ? config.homeDecayPerQuarter : config.focusDecayPerQuarter) : 0;
  return { abroad, focused, seatHome, untendedQuarters, neglected, perQuarter: rise - fall };
}

/** Resentment after the quarter numbered `quarter`, played from `state`. */
export function stepResentment(state: Resenting, world: World, quarter: number): ResentmentState {
  const drivers = resentmentDrivers(state, world, quarter);
  return {
    value: clamp(state.resentment.value + drivers.perQuarter),
    tendedQuarter: quarter - drivers.untendedQuarters,
  };
}

/**
 * Steps an amendment moves a trait toward its casual-friendly option (negative: away), or 0 for
 * a trait resentment does not watch.
 */
export function casualSteps(world: World, axis: AxisId, from: string, to: string): number {
  const casual = world.config.anchorResentment.casualRules[axis];
  if (casual === undefined) return 0;
  const options = GENOME_AXES[axis].options as readonly string[];
  const target = options.indexOf(casual);
  const distance = (option: string) => Math.abs(options.indexOf(option) - target);
  return distance(from) - distance(to);
}

/** Resentment after an amendment of `axis` from `from` to `to`. Rising needs a league abroad. */
export function amendedResentment(
  state: Pick<GameState, "anchorCountryId" | "countries"> & { resentment: ResentmentState },
  world: World,
  axis: AxisId,
  from: string,
  to: string,
): ResentmentState {
  const steps = casualSteps(world, axis, from, to);
  if (steps === 0 || (steps > 0 && !hasLeagueAbroad(state))) return state.resentment;
  const value = clamp(state.resentment.value + world.config.anchorResentment.amendmentStep * steps);
  return { ...state.resentment, value };
}

/** The share of the anchor's player hardcore fans resentment turns casual this quarter. */
export function resentmentDemotionShare(value: number, world: World): number {
  return world.config.anchorResentment.hardcoreDemotionPerQuarter * value;
}

/** The severity resentment adds to the anchor league's health target (0 below the first step). */
export function resentmentDrag(value: number, world: World): number {
  let severity = 0;
  for (const step of world.config.anchorResentment.healthDrag)
    if (value >= step.from) severity = step.severity;
  return severity;
}

/** Whether resentment is high enough to fold the anchor league from Near-Collapse. */
export function resentmentFolds(value: number, world: World): boolean {
  return value >= world.config.anchorResentment.collapseFrom;
}

/**
 * The anchor league's health target with resentment's drag (GDD v1.40): severity + drag, capped
 * at Near-Collapse, or collapse once resentment folds it (cash below zero always collapses).
 */
export function draggedSeverity(severity: number, value: number, world: World): number {
  if (severity >= 3 || resentmentFolds(value, world)) return 3;
  return Math.min(2, severity + resentmentDrag(value, world));
}

const lerp = (range: { min: number; max: number }, value: number) =>
  range.min + (range.max - range.min) * value;

/** The anchor's amendment backlash factor (GDD v1.40): forgiving when home is tended. */
export function anchorBacklashFactor(value: number, world: World): number {
  return lerp(world.config.anchorResentment.backlashFactor, value);
}

/** The share of the anchor's hardcore fans turned casual when the seat leaves it (GDD v1.40). */
export function anchorSeatLeaveShare(value: number, world: World): number {
  return lerp(world.config.anchorResentment.seatLeaveShare, value);
}

/** What the anchor's country card shows (GDD v1.40): the value and its reasons. */
export interface ResentmentSnapshot {
  value: number;
  /** The change a quarter now, before the limits. */
  perQuarter: number;
  abroad: boolean;
  focused: boolean;
  seatHome: boolean;
  /** Quarters without a focus slot at home, counted once the grace period has passed; else 0. */
  neglectQuarters: number;
  /** Quarters left before neglect starts to count, while the grace period runs; else 0. */
  graceLeft: number;
  /** Amendments so far toward a casual-friendly option. */
  casualAmendments: number;
  /** Severity the league's health evaluation adds now (0, 1 or 2), and whether it can fold. */
  drag: number;
  folds: boolean;
}

export function resentmentSnapshot(state: GameState, world: World): ResentmentSnapshot {
  const drivers = resentmentDrivers(state, world, state.quarter);
  const { value } = state.resentment;
  return {
    value,
    perQuarter: drivers.perQuarter,
    abroad: drivers.abroad,
    focused: drivers.focused,
    seatHome: drivers.seatHome,
    neglectQuarters: drivers.neglected ? drivers.untendedQuarters : 0,
    graceLeft:
      drivers.abroad && !drivers.focused && !drivers.neglected
        ? world.config.anchorResentment.graceQuarters + 1 - drivers.untendedQuarters
        : 0,
    casualAmendments: state.rules.amendments.filter(
      (a) => casualSteps(world, a.axis, a.from, a.to) > 0,
    ).length,
    drag: resentmentDrag(value, world),
    folds: resentmentFolds(value, world),
  };
}
