import { AXIS_IDS, type AxisId, GENOME_AXES, type Genome } from "../content";
import type { SportTotals } from "../sim";
import type { PolicyId } from "./policy";

export interface CampaignResult {
  seed: number;
  anchorCountryId: string;
  genome: Genome;
  genomeLabel: string;
  policy: PolicyId;
  turnsPlayed: number;
  quartersElapsed: number;
  finalYear: number;
  finalQuarterOfYear: number;
  ppTier: number;
  pp: number;
  focusActions: number;
  finalFocus: (string | null)[];
  player: SportTotals & { rank: number };
  rivals: SportTotals[];
  countriesWithFans: number;
  /** Country ids by the player's Fandom Score there, best first. */
  topCountries: string[];
  /** First time each tier was reached: turns completed and quarters elapsed at that moment. */
  tierReached: Record<string, { turnsCompleted: number; quartersElapsed: number }>;
  invariantViolations: string[];
}

export interface TurnRow {
  seed: number;
  genome: string;
  turn: number;
  year: number;
  quarterOfYear: number;
  ppTier: number;
  pp: number;
  focus: string;
  countriesWithFans: number;
  playerCasual: number;
  playerHardcore: number;
  playerFandomScore: number;
  playerRank: number;
}

export interface CountryRow {
  seed: number;
  genome: string;
  countryId: string;
  population: number;
  casual: number;
  hardcore: number;
  fandomScore: number;
  share: number;
  rank: number;
  focused: boolean;
  exposure: number;
  affinity: number;
  accessibility: number;
  depth: number;
  rivalSimilarity: number;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid] ?? 0;
  return sorted.length % 2 === 1 ? upper : ((sorted[mid - 1] ?? 0) + upper) / 2;
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function countBy(values: number[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

export function aggregate(results: CampaignResult[], tierCount: number) {
  const scores = results.map((result) => result.player.fandomScore);
  const turnsToTier: Record<string, { reached: number; of: number; medianTurns: number | null }> =
    {};
  for (let tier = 2; tier <= tierCount; tier += 1) {
    const turns = results
      .map((result) => result.tierReached[tier]?.turnsCompleted)
      .filter((value): value is number => value !== undefined);
    turnsToTier[tier] = { reached: turns.length, of: results.length, medianTurns: median(turns) };
  }
  return {
    campaigns: results.length,
    playerFandomScore: {
      min: scores.length ? Math.min(...scores) : null,
      median: median(scores),
      max: scores.length ? Math.max(...scores) : null,
    },
    finalTier: countBy(results.map((result) => result.ppTier)),
    playerRank: countBy(results.map((result) => result.player.rank)),
    countriesWithFans: { median: median(results.map((r) => r.countriesWithFans)) },
    focusActions: { median: median(results.map((r) => r.focusActions)) },
    turnsToTier,
    campaignsWithInvariantViolations: results.filter((r) => r.invariantViolations.length > 0)
      .length,
  };
}

/** Per-option outcomes across campaigns with varied genomes, to spot a dominant option. */
export interface OptionOutcome {
  axis: AxisId;
  option: string;
  campaigns: number;
  meanFandomScore: number | null;
  medianFandomScore: number | null;
  /** Share of top-quartile campaigns (by Fandom Score) that use this option. */
  topQuartileShare: number | null;
  /** Tech plan exit criterion: no option in more than 40% of top-quartile runs. */
  exceedsDominanceLimit: boolean;
}

export const DOMINANCE_LIMIT = 0.4;

export function optionOutcomes(results: CampaignResult[]): OptionOutcome[] {
  const sorted = [...results].sort((a, b) => b.player.fandomScore - a.player.fandomScore);
  const quartileSize = Math.max(1, Math.floor(sorted.length / 4));
  const topQuartile = sorted.slice(0, quartileSize);
  const out: OptionOutcome[] = [];
  for (const axis of AXIS_IDS) {
    for (const option of GENOME_AXES[axis].options) {
      const using = results.filter((result) => result.genome[axis] === option);
      const scores = using.map((result) => result.player.fandomScore);
      const inTop = topQuartile.filter((result) => result.genome[axis] === option).length;
      const topQuartileShare = results.length > 0 ? inTop / topQuartile.length : null;
      out.push({
        axis,
        option,
        campaigns: using.length,
        meanFandomScore: mean(scores),
        medianFandomScore: median(scores),
        topQuartileShare,
        exceedsDominanceLimit: topQuartileShare !== null && topQuartileShare > DOMINANCE_LIMIT,
      });
    }
  }
  return out;
}

export function toCsv(header: string[], rows: (string | number | boolean)[][]): string {
  const csvCell = (value: string | number | boolean) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return `${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

export function campaignsCsv(results: CampaignResult[], tierCount: number): string {
  const tiers = Array.from({ length: tierCount - 1 }, (_, i) => i + 2);
  const header = [
    "seed",
    "anchor",
    "genome",
    "policy",
    "turns_played",
    "quarters_elapsed",
    "final_year",
    "pp_tier",
    "pp",
    "focus_actions",
    "countries_with_fans",
    "player_casual",
    "player_hardcore",
    "player_fandom_score",
    "player_rank",
    "top_countries",
    ...AXIS_IDS,
    ...tiers.map((tier) => `turns_to_tier_${tier}`),
    "invariant_violations",
  ];
  const rows = results.map((r) => [
    r.seed,
    r.anchorCountryId,
    r.genomeLabel,
    r.policy,
    r.turnsPlayed,
    r.quartersElapsed,
    r.finalYear,
    r.ppTier,
    Math.round(r.pp),
    r.focusActions,
    r.countriesWithFans,
    r.player.casual,
    r.player.hardcore,
    Math.round(r.player.fandomScore),
    r.player.rank,
    r.topCountries.join("|"),
    ...AXIS_IDS.map((axis) => r.genome[axis]),
    ...tiers.map((tier) => r.tierReached[tier]?.turnsCompleted ?? ""),
    r.invariantViolations.length,
  ]);
  return toCsv(header, rows);
}

export function turnsCsv(rows: TurnRow[]): string {
  const header = [
    "seed",
    "genome",
    "turn",
    "year",
    "quarter_of_year",
    "pp_tier",
    "pp",
    "focus",
    "countries_with_fans",
    "player_casual",
    "player_hardcore",
    "player_fandom_score",
    "player_rank",
  ];
  return toCsv(
    header,
    rows.map((r) => [
      r.seed,
      r.genome,
      r.turn,
      r.year,
      r.quarterOfYear,
      r.ppTier,
      Math.round(r.pp),
      r.focus,
      r.countriesWithFans,
      r.playerCasual,
      r.playerHardcore,
      Math.round(r.playerFandomScore),
      r.playerRank,
    ]),
  );
}

export function countriesCsv(rows: CountryRow[]): string {
  const header = [
    "seed",
    "genome",
    "country",
    "population",
    "casual",
    "hardcore",
    "fandom_score",
    "share",
    "rank",
    "focused",
    "exposure",
    "affinity",
    "accessibility",
    "depth",
    "rival_similarity",
  ];
  const round = (value: number, digits: number) => Number(value.toFixed(digits));
  return toCsv(
    header,
    rows.map((r) => [
      r.seed,
      r.genome,
      r.countryId,
      r.population,
      r.casual,
      r.hardcore,
      Math.round(r.fandomScore),
      round(r.share, 4),
      r.rank,
      r.focused,
      round(r.exposure, 5),
      round(r.affinity, 3),
      round(r.accessibility, 3),
      round(r.depth, 3),
      round(r.rivalSimilarity, 3),
    ]),
  );
}

export function optionOutcomesCsv(outcomes: OptionOutcome[]): string {
  const header = [
    "axis",
    "option",
    "campaigns",
    "mean_fandom_score",
    "median_fandom_score",
    "top_quartile_share",
    "exceeds_dominance_limit",
  ];
  return toCsv(
    header,
    outcomes.map((o) => [
      o.axis,
      o.option,
      o.campaigns,
      o.meanFandomScore === null ? "" : Math.round(o.meanFandomScore),
      o.medianFandomScore === null ? "" : Math.round(o.medianFandomScore),
      o.topQuartileShare === null ? "" : Number(o.topQuartileShare.toFixed(3)),
      o.exceedsDominanceLimit,
    ]),
  );
}
