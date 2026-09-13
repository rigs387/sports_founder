import { RULE_AXES } from "../content";
import { QUARTERS_PER_YEAR } from "./calendar";
import { hasCountermove } from "./countermoves";
import { sportTotals } from "./fandom";
import { optionNetDelta } from "./hints";
import { landmarks } from "./records";
import { outboundStrengths, unblockedMediaReach } from "./spread";
import {
  type ActiveCountermove,
  type AxisId,
  type Config,
  type CountermoveKind,
  type CountryState,
  ESCALATION_LEVELS,
  type EscalationLevel,
  type GameState,
  type Genome,
  type Landmark,
  PLAYER_INDEX,
  type RivalFront,
  type RivalState,
  type TimedCountermoveKind,
  type World,
} from "./types";

// Rival defense (GDD Rival AI; Late-Game Pressure: "Rivals defend hardest near the top"). Rivals
// defend; they don't hunt. Runs once per quarter, after fans and league business, with no
// randomness:
//   1. Budget. Each rival earns income from its own world Fandom Score, times the defense
//      intensity, and cannot bank more than a capped number of quarters of income.
//   2. Escalation. Per rival, per country, pressure tracks the player's hardcore gains there. The
//      ladder (none → Watching → Defending → Entrenched) climbs one level at a time while the
//      rival holds a meaningful hardcore share and pressure passes the next threshold, and falls
//      one level after a run of calm quarters. Intensity lowers the thresholds near global #1.
//   3. Countermoves. Effects that have run their course end. Each rival then buys countermoves
//      round-robin across its escalated countries (highest level first, then its biggest hardcore
//      base), in preference order, while budget lasts: it cannot defend everywhere at once.
// Every escalation change and countermove is recorded as a landmark. Every number is config.

export function newFront(sportId: string): RivalFront {
  return { sportId, level: "none", pressure: 0, quartersAtLevel: 0, calmQuarters: 0 };
}

export function newRivalState(sportId: string, genome: Genome): RivalState {
  return { sportId, genome: { ...genome }, budget: 0, budgetSpent: 0, ruleCopyReadyQuarter: 0 };
}

export function escalationIndex(level: EscalationLevel): number {
  return ESCALATION_LEVELS.indexOf(level);
}

/**
 * How hard every rival defends right now: 1 while the player is far from global #1, rising to
 * maxIntensity as the player's Fandom Score nears the best rival's, and staying there once ahead.
 */
export function defenseIntensity(
  state: Pick<GameState, "sports" | "countries">,
  world: World,
): number {
  const { startRatio, maxIntensity } = world.config.rivalAI.nearTop;
  const totals = sportTotals(state, world);
  const player = totals.find((sport) => sport.kind === "player")?.fandomScore ?? 0;
  const best = Math.max(
    0,
    ...totals.filter((sport) => sport.kind === "rival").map((sport) => sport.fandomScore),
  );
  if (best <= 0) return maxIntensity;
  const progress = Math.min(1, Math.max(0, (player / best - startRatio) / (1 - startRatio)));
  return 1 + (maxIntensity - 1) * progress;
}

/** Budget a rival spends on a countermove in a country. */
export function countermoveCost(world: World, countryIndex: number, kind: CountermoveKind): number {
  const moves = world.config.rivalAI.countermoves;
  if (kind === "ruleCopying") return moves.ruleCopying.cost;
  const population = world.countries[countryIndex]?.population ?? 0;
  return (
    moves[kind].baseCost * (population / 1_000_000) ** world.config.rivalAI.costPopulationExponent
  );
}

export interface RuleCopy {
  axis: AxisId;
  from: string;
  to: string;
}

/**
 * The player's rule trait that is most popular in a country and that the rival does not share:
 * the rule axis where the player's option has a positive net lever delta there (affinity +
 * accessibility + depth) and beats the rival's own option by the most. Null if there is none.
 */
export function ruleToCopy(
  world: World,
  playerGenome: Genome,
  rivalGenome: Genome,
  countryIndex: number,
): RuleCopy | null {
  let best: RuleCopy | null = null;
  let bestMargin = 0;
  for (const axis of RULE_AXES) {
    const theirs = rivalGenome[axis];
    const ours = playerGenome[axis];
    if (theirs === ours) continue;
    const appeal = optionNetDelta(world, axis, ours, countryIndex);
    const margin = appeal - optionNetDelta(world, axis, theirs, countryIndex);
    if (appeal > 0 && margin > bestMargin) {
      best = { axis, from: theirs, to: ours };
      bestMargin = margin;
    }
  }
  return best;
}

/**
 * One quarter of one rival's escalation in one country. `annualGainShare` is the player's
 * hardcore gain there this quarter as a share of the population per year; `rivalShare` is the
 * rival's hardcore share there.
 */
export function updateFront(
  front: RivalFront,
  annualGainShare: number,
  rivalShare: number,
  intensity: number,
  config: Config,
): RivalFront {
  const { escalation, meaningfulHardcoreShare, pressureSmoothing } = config.rivalAI;
  const pressure = front.pressure + pressureSmoothing * (annualGainShare - front.pressure);
  const meaningful = rivalShare >= meaningfulHardcoreShare;
  const quartersAtLevel = front.quartersAtLevel + 1;
  const current = escalationIndex(front.level);

  const up = ESCALATION_LEVELS[current + 1];
  if (
    up !== undefined &&
    up !== "none" &&
    meaningful &&
    quartersAtLevel >= escalation.minQuartersAtLevel &&
    pressure >= escalation.thresholds[up] / intensity
  ) {
    return { sportId: front.sportId, level: up, pressure, quartersAtLevel: 0, calmQuarters: 0 };
  }
  if (front.level === "none") {
    return { sportId: front.sportId, level: "none", pressure, quartersAtLevel, calmQuarters: 0 };
  }
  const calmLine = (escalation.thresholds[front.level] / intensity) * escalation.deescalationRatio;
  const calmQuarters = !meaningful || pressure < calmLine ? front.calmQuarters + 1 : 0;
  const down = ESCALATION_LEVELS[current - 1];
  if (down !== undefined && calmQuarters >= escalation.deescalationQuarters) {
    return { sportId: front.sportId, level: down, pressure, quartersAtLevel: 0, calmQuarters: 0 };
  }
  return { sportId: front.sportId, level: front.level, pressure, quartersAtLevel, calmQuarters };
}

/** Whether a timed countermove would do anything in a country right now. */
function countermoveUseful(
  kind: TimedCountermoveKind,
  country: CountryState,
  sportId: string,
  world: World,
  strengths: readonly number[],
  countryIndex: number,
): boolean {
  switch (kind) {
    case "mediaBlitz":
    case "youthPrograms":
      return !hasCountermove(country, kind, sportId);
    case "broadcastDeal":
      return (
        !hasCountermove(country, kind) && unblockedMediaReach(world, strengths, countryIndex) > 0
      );
    case "sponsorLockout":
      return !hasCountermove(country, kind) && country.league !== null;
  }
}

export interface RivalStep {
  rivals: RivalState[];
  countries: CountryState[];
  landmarks: Landmark[];
}

/**
 * The rival AI for one quarter. `before` is the state at the start of the quarter; `after` is every
 * country once this quarter's fans and league business have moved; `quarter` is the quarter just
 * simulated.
 */
export function stepRivals(
  before: GameState,
  after: readonly CountryState[],
  quarter: number,
  world: World,
): RivalStep {
  const { rivalAI } = world.config;
  const found: Landmark[] = [];
  const turn = before.turn;
  const current = { sports: before.sports, countries: after as CountryState[] };
  const intensity = defenseIntensity(current, world);
  const totals = sportTotals(current, world);

  const rivals = before.rivals.map((rival): RivalState => {
    const score = totals.find((sport) => sport.sportId === rival.sportId)?.fandomScore ?? 0;
    const income = rivalAI.budget.incomePerFandomScore * score * intensity;
    const budget = Math.min(rival.budget + income, rivalAI.budget.capQuarters * income);
    return { ...rival, budget };
  });
  const sportIndexOf = new Map(before.sports.map((sport, index) => [sport.id, index]));

  const countries = after.map((country, index): CountryState => {
    const population = world.countries[index]?.population ?? 1;
    const hardcoreBefore = before.countries[index]?.fans[PLAYER_INDEX]?.hardcore ?? 0;
    const hardcoreNow = country.fans[PLAYER_INDEX]?.hardcore ?? 0;
    const annualGainShare =
      (Math.max(0, hardcoreNow - hardcoreBefore) / population) * QUARTERS_PER_YEAR;
    const defense = country.defense.map((front) => {
      const rivalHardcore = country.fans[sportIndexOf.get(front.sportId) ?? -1]?.hardcore ?? 0;
      const next = updateFront(
        front,
        annualGainShare,
        rivalHardcore / population,
        intensity,
        world.config,
      );
      if (next.level !== front.level) {
        const escalated = escalationIndex(next.level) > escalationIndex(front.level);
        found.push(
          (escalated ? landmarks.rivalEscalated : landmarks.rivalDeescalated)(
            turn,
            quarter,
            country.countryId,
            front.sportId,
            front.level,
            next.level,
          ),
        );
      }
      return next;
    });
    const countermoves = country.countermoves.filter((move) => move.endQuarter > quarter);
    return { ...country, defense, countermoves };
  });

  const strengths = outboundStrengths({ countries }, world);
  const moves = rivalAI.countermoves;
  rivals.forEach((start, r) => {
    let rival = start;
    const sportIndex = sportIndexOf.get(rival.sportId) ?? -1;
    const fronts = countries
      .map((country, index) => ({
        index,
        level: escalationIndex(country.defense[r]?.level ?? "none"),
        base: country.fans[sportIndex]?.hardcore ?? 0,
      }))
      .filter((front) => front.level > 0)
      .sort((a, b) => b.level - a.level || b.base - a.base || a.index - b.index);

    let bought = 0;
    let boughtThisPass = true;
    while (boughtThisPass && bought < rivalAI.movesPerQuarter) {
      boughtThisPass = false;
      for (const front of fronts) {
        if (bought >= rivalAI.movesPerQuarter) break;
        const country = countries[front.index];
        if (!country) continue;
        for (const kind of rivalAI.preference) {
          if (front.level < escalationIndex(moves[kind].minLevel)) continue;
          const cost = countermoveCost(world, front.index, kind);
          if (cost > rival.budget) continue;
          if (kind === "ruleCopying") {
            if (quarter < rival.ruleCopyReadyQuarter) continue;
            const copy = ruleToCopy(world, before.genome, rival.genome, front.index);
            if (copy === null) continue;
            rival = {
              ...rival,
              genome: { ...rival.genome, [copy.axis]: copy.to } as Genome,
              budget: rival.budget - cost,
              budgetSpent: rival.budgetSpent + cost,
              ruleCopyReadyQuarter: quarter + moves.ruleCopying.cooldownQuarters,
            };
            found.push(
              landmarks.rivalRuleCopied(
                turn,
                quarter,
                country.countryId,
                rival.sportId,
                copy.axis,
                copy.from,
                copy.to,
              ),
            );
          } else {
            if (!countermoveUseful(kind, country, rival.sportId, world, strengths, front.index)) {
              continue;
            }
            const move: ActiveCountermove = {
              kind,
              sportId: rival.sportId,
              endQuarter: quarter + moves[kind].durationQuarters,
            };
            countries[front.index] = { ...country, countermoves: [...country.countermoves, move] };
            rival = {
              ...rival,
              budget: rival.budget - cost,
              budgetSpent: rival.budgetSpent + cost,
            };
            found.push(
              landmarks.rivalCountermove(
                turn,
                quarter,
                country.countryId,
                rival.sportId,
                kind,
                move.endQuarter,
              ),
            );
          }
          bought += 1;
          boughtThisPass = true;
          break;
        }
      }
    }
    rivals[r] = rival;
  });

  return { rivals, countries, landmarks: found };
}
