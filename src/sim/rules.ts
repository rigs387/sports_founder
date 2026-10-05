import { GENOME_AXES, RULE_AXES } from "../content";
import { costMultiplier, seasonalWindowOpen, yearOfQuarter } from "./calendar";
import { fandomScore } from "./fandom";
import { optionNetDelta } from "./hints";
import { demoteHardcore } from "./leagues";
import { landmarks } from "./records";
import {
  type Amendment,
  type AxisId,
  type GameState,
  type Genome,
  PLAYER_INDEX,
  type World,
} from "./types";

// Rules evolution, first build (GDD v1.20). In the seasonal window the player may amend one rule
// trait a year, to any of its options. The amendment's size is its jump: steps along the trait's
// options, or a fixed size for traits whose options have no order (play structure). It costs a
// base PP price × the peak tier's cost multiplier × the jump, and purists push back: in every
// country a share of the player's hardcore fans turn casual, growing with the jump and the rule's
// age, heavier in the anchor and where the old option suited fans better. Fans and spread feel the
// new rule from the next quarter; the flagship plays it from its next season. Every number is
// config (`rulesEvolution`).

const QUARTERS_PER_YEAR = 4;

/** Why a rule cannot be amended to an option now, or null when it can. */
export type AmendBlocker = "window" | "thisYear" | "identity" | "same" | "pp";

/** The size of changing a trait from one option to another. */
export function amendmentJump(axis: AxisId, from: string, to: string, world: World): number {
  if (from === to) return 0;
  const fixed = world.config.rulesEvolution.fixedJump[axis];
  if (fixed !== undefined) return fixed;
  const options = GENOME_AXES[axis].options as readonly string[];
  return Math.abs(options.indexOf(to) - options.indexOf(from));
}

/** The PP price of an amendment of this jump now. */
export function amendmentPrice(state: Pick<GameState, "tierTrack">, world: World, jump: number) {
  return world.config.rulesEvolution.basePrice * costMultiplier(state, world.config) * jump;
}

/** The quarter a rule trait last changed: its last amendment, or the campaign's start. */
export function ruleSince(state: Pick<GameState, "rules">, axis: AxisId): number {
  for (let i = state.rules.amendments.length - 1; i >= 0; i -= 1) {
    const amendment = state.rules.amendments[i];
    if (amendment?.axis === axis) return amendment.quarter;
  }
  return 0;
}

/** Whether this in-game year's amendment has been made. */
export function amendedThisYear(state: Pick<GameState, "rules" | "quarter">, world: World) {
  const year = yearOfQuarter(state.quarter, world.config);
  return state.rules.amendments.some((amendment) => amendment.year === year);
}

export function amendBlocker(
  state: GameState,
  world: World,
  axis: AxisId,
  option: string,
): AmendBlocker | null {
  if (!seasonalWindowOpen(state, world.config)) return "window";
  if (amendedThisYear(state, world)) return "thisYear";
  if (!(RULE_AXES as readonly string[]).includes(axis)) return "identity";
  if (state.genome[axis] === option) return "same";
  const jump = amendmentJump(axis, state.genome[axis], option, world);
  if (state.pp < amendmentPrice(state, world, jump)) return "pp";
  return null;
}

/**
 * The share of the player's hardcore fans in each country who turn casual if `axis` changes to
 * `option` now (GDD v1.20): base × jump × the rule's age (capped), × the anchor factor in the
 * anchor, × (1 + fit weight × how much worse the new option fits there), capped.
 */
export function backlashShares(
  state: GameState,
  world: World,
  axis: AxisId,
  option: string,
): number[] {
  const { backlash } = world.config.rulesEvolution;
  const from = state.genome[axis];
  const jump = amendmentJump(axis, from, option, world);
  const ageYears = (state.quarter - ruleSince(state, axis)) / QUARTERS_PER_YEAR;
  const age = Math.min(1, ageYears / backlash.fullAgeYears);
  const base = backlash.sharePerJump * jump * age;
  return state.countries.map((country, index) => {
    if (base <= 0) return 0;
    const fitLoss = Math.max(
      0,
      optionNetDelta(world, axis, from, index) - optionNetDelta(world, axis, option, index),
    );
    const anchor = country.countryId === state.anchorCountryId ? backlash.anchorFactor : 1;
    return Math.min(backlash.maxShare, base * anchor * (1 + backlash.fitWeight * fitLoss));
  });
}

/** How many hardcore fans would turn casual, in all. */
export function backlashTotal(state: GameState, world: World, axis: AxisId, option: string) {
  const shares = backlashShares(state, world, axis, option);
  return state.countries.reduce(
    (sum, country, i) =>
      sum + Math.floor((country.fans[PLAYER_INDEX]?.hardcore ?? 0) * (shares[i] ?? 0)),
    0,
  );
}

/** Amends a rule (checked by the caller): the price, the backlash, the record and the new genome. */
export function amendRule(state: GameState, world: World, axis: AxisId, option: string): GameState {
  const from = state.genome[axis];
  const jump = amendmentJump(axis, from, option, world);
  const shares = backlashShares(state, world, axis, option);
  let demoted = 0;
  const countries = state.countries.map((country, i) => {
    const share = shares[i] ?? 0;
    if (share <= 0) return country;
    return {
      ...country,
      fans: country.fans.map((fans, f) => {
        if (f !== PLAYER_INDEX) return fans;
        const next = demoteHardcore(fans, share);
        demoted += fans.hardcore - next.hardcore;
        return next;
      }),
    };
  });
  const amendment: Amendment = {
    turn: state.turn,
    quarter: state.quarter,
    year: yearOfQuarter(state.quarter, world.config),
    axis,
    from,
    to: option,
    jump,
    demoted,
  };
  return {
    ...state,
    pp: state.pp - amendmentPrice(state, world, jump),
    genome: { ...state.genome, [axis]: option } as Genome,
    countries,
    rules: { amendments: [...state.rules.amendments, amendment] },
    landmarks: [
      ...state.landmarks,
      landmarks.ruleAmended(state.turn, state.quarter, axis, from, option, demoted),
    ],
  };
}

/** The markets whose fit hints a review shows: the anchor, then the biggest by Fandom Score. */
export function previewMarkets(state: GameState, world: World): number[] {
  const { casualWeight } = world.config.fandomScore;
  const anchor = state.countries.findIndex((c) => c.countryId === state.anchorCountryId);
  const biggest = state.countries
    .map((country, index) => {
      const fans = country.fans[PLAYER_INDEX];
      return { index, score: fans ? fandomScore(fans.casual, fans.hardcore, casualWeight) : 0 };
    })
    .filter((entry) => entry.index !== anchor && entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, world.config.rulesEvolution.previewMarkets)
    .map((entry) => entry.index);
  return [anchor, ...biggest];
}

/** A change's fit hint in one market: the change in net lever delta, by the setup thresholds. */
export function changeHint(
  world: World,
  axis: AxisId,
  from: string,
  to: string,
  index: number,
): "++" | "+" | "-" | null {
  const change = optionNetDelta(world, axis, to, index) - optionNetDelta(world, axis, from, index);
  const { hints } = world.config;
  if (change >= hints.plusPlus) return "++";
  if (change >= hints.plus) return "+";
  if (change <= hints.minus) return "-";
  return null;
}

/** One rule option as the amendment review shows it. */
export interface RuleOptionSnapshot {
  option: string;
  jump: number;
  price: number;
  /** Hardcore fans who would turn casual. */
  backlash: number;
  blocker: AmendBlocker | null;
  /** Fit hints in the preview markets, in the same order as `RulesSnapshot.previewMarkets`. */
  hints: ("++" | "+" | "-" | null)[];
}

export interface RulesSnapshot {
  amendments: Amendment[];
  amendedThisYear: boolean;
  /** The anchor, then the biggest markets: where a review shows fit hints. */
  previewMarkets: string[];
  traits: { axis: AxisId; option: string; sinceYear: number; options: RuleOptionSnapshot[] }[];
}

export function rulesSnapshot(state: GameState, world: World): RulesSnapshot {
  const markets = previewMarkets(state, world);
  return {
    amendments: state.rules.amendments,
    amendedThisYear: amendedThisYear(state, world),
    previewMarkets: markets.map((index) => state.countries[index]?.countryId ?? ""),
    traits: RULE_AXES.map((axis) => {
      const current = state.genome[axis];
      return {
        axis,
        option: current,
        sinceYear: yearOfQuarter(ruleSince(state, axis), world.config),
        options: (GENOME_AXES[axis].options as readonly string[])
          .filter((option) => option !== current)
          .map((option) => {
            const jump = amendmentJump(axis, current, option, world);
            return {
              option,
              jump,
              price: amendmentPrice(state, world, jump),
              backlash: backlashTotal(state, world, axis, option),
              blocker: amendBlocker(state, world, axis, option),
              hints: markets.map((index) => changeHint(world, axis, current, option, index)),
            };
          }),
      };
    }),
  };
}

/** Every way the amendments disagree with the genome or the content. */
export function rulesProblems(state: GameState): string[] {
  const problems: string[] = [];
  const latest = new Map<AxisId, string>();
  for (const amendment of state.rules.amendments) {
    if (!(RULE_AXES as readonly string[]).includes(amendment.axis))
      problems.push(`rules: ${amendment.axis} is not a rule trait`);
    const options = GENOME_AXES[amendment.axis]?.options as readonly string[] | undefined;
    if (!options?.includes(amendment.to) || !options.includes(amendment.from))
      problems.push(
        `rules: unknown option in the ${amendment.year} amendment of ${amendment.axis}`,
      );
    latest.set(amendment.axis, amendment.to);
  }
  for (const [axis, option] of latest) {
    if (state.genome[axis] !== option)
      problems.push(`rules: ${axis} is ${state.genome[axis]}, but was last amended to ${option}`);
  }
  return problems;
}
