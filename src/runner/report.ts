import { AXIS_IDS, type AxisId, GENOME_AXES, type Genome, type LeagueTierId } from "../content";
import type { SportTotals } from "../sim";
import type { BotId } from "./policy";

export interface CampaignResult {
  seed: number;
  anchorCountryId: string;
  genome: Genome;
  genomeLabel: string;
  bot: BotId;
  /** Turns actually played (fewer than planned if the campaign ended). */
  turnsPlayed: number;
  quartersElapsed: number;
  finalYear: number;
  /** The anchor league collapsed and the campaign ended. */
  collapsed: boolean;
  collapseTurn: number | null;
  ppTier: number;
  peakTier: number;
  pp: number;
  focusActions: number;
  bailouts: number;
  promotions: number;
  stepDowns: number;
  leaguesFormed: number;
  leaguesFolded: number;
  tierDemotions: number;
  leaguesAtEnd: number;
  anchorLeagueTier: LeagueTierId | null;
  finalFocus: (string | null)[];
  player: SportTotals & { rank: number };
  rivals: SportTotals[];
  countriesWithFans: number;
  /** Country ids by the player's Fandom Score there, best first. */
  topCountries: string[];
  /** Country ids by Fandom Score ÷ population, best first. */
  topCountriesByShare: string[];
  anchorHardcoreShare: number;
  /** First time each tier was reached: turns completed and quarters elapsed at that moment. */
  tierReached: Record<string, { turnsCompleted: number; quartersElapsed: number }>;
  invariantViolations: string[];
}

export interface TurnRow {
  seed: number;
  genome: string;
  bot: BotId;
  turn: number;
  year: number;
  quarterOfYear: number;
  ppTier: number;
  pp: number;
  focus: string;
  countriesWithFans: number;
  leagues: number;
  anchorLeagueTier: string;
  anchorHealth: string;
  anchorCash: number;
  playerCasual: number;
  playerHardcore: number;
  playerFandomScore: number;
}

export interface CountryRow {
  seed: number;
  genome: string;
  bot: BotId;
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
  leagueTier: string;
  leagueHealth: string;
  leagueCash: number;
  leaguesFolded: number;
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

export function countBy(values: (number | string)[]): Record<string, number> {
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
    collapsed: results.filter((r) => r.collapsed).length,
    playerFandomScore: {
      min: scores.length ? Math.min(...scores) : null,
      median: median(scores),
      max: scores.length ? Math.max(...scores) : null,
    },
    finalTier: countBy(results.map((result) => result.ppTier)),
    peakTier: countBy(results.map((result) => result.peakTier)),
    countriesWithFans: { median: median(results.map((r) => r.countriesWithFans)) },
    leaguesAtEnd: { median: median(results.map((r) => r.leaguesAtEnd)) },
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
  medianFandomScore: number | null;
  /** Share of top-quartile campaigns (by Fandom Score) that use this option. */
  topQuartileShare: number | null;
  exceedsDominanceLimit: boolean;
}

export function optionOutcomes(results: CampaignResult[], dominanceLimit: number): OptionOutcome[] {
  const sorted = [...results].sort((a, b) => b.player.fandomScore - a.player.fandomScore);
  const quartileSize = Math.max(1, Math.floor(sorted.length / 4));
  const topQuartile = sorted.slice(0, quartileSize);
  const out: OptionOutcome[] = [];
  for (const axis of AXIS_IDS) {
    for (const option of GENOME_AXES[axis].options) {
      const using = results.filter((result) => result.genome[axis] === option);
      const inTop = topQuartile.filter((result) => result.genome[axis] === option).length;
      const topQuartileShare = results.length > 0 ? inTop / topQuartile.length : null;
      out.push({
        axis,
        option,
        campaigns: using.length,
        medianFandomScore: median(using.map((result) => result.player.fandomScore)),
        topQuartileShare,
        exceedsDominanceLimit: topQuartileShare !== null && topQuartileShare > dominanceLimit,
      });
    }
  }
  return out;
}

type Cell = string | number | boolean | null;

const QUOTE = String.fromCharCode(34);

export function toCsv(header: string[], rows: Cell[][]): string {
  const csvCell = (value: Cell) => {
    const text = value === null ? "" : String(value);
    const needsQuotes = text.includes(",") || text.includes("\n") || text.includes(QUOTE);
    return needsQuotes ? QUOTE + text.replaceAll(QUOTE, QUOTE + QUOTE) + QUOTE : text;
  };
  return `${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

const round = (value: number, digits: number) => Number(value.toFixed(digits));

export function campaignsCsv(results: CampaignResult[], tierCount: number): string {
  const tiers = Array.from({ length: tierCount - 1 }, (_, i) => i + 2);
  const header = [
    "seed",
    "anchor",
    "genome",
    "bot",
    "turns_played",
    "quarters_elapsed",
    "final_year",
    "collapsed",
    "collapse_turn",
    "pp_tier",
    "peak_tier",
    "pp",
    "focus_actions",
    "bailouts",
    "promotions",
    "step_downs",
    "leagues_formed",
    "leagues_folded",
    "tier_demotions",
    "leagues_at_end",
    "anchor_league_tier",
    "anchor_hardcore_share",
    "countries_with_fans",
    "player_casual",
    "player_hardcore",
    "player_fandom_score",
    "player_rank",
    "top_countries_by_share",
    ...AXIS_IDS,
    ...tiers.map((tier) => `turns_to_tier_${tier}`),
    "invariant_violations",
  ];
  const rows = results.map((r) => [
    r.seed,
    r.anchorCountryId,
    r.genomeLabel,
    r.bot,
    r.turnsPlayed,
    r.quartersElapsed,
    r.finalYear,
    r.collapsed,
    r.collapseTurn,
    r.ppTier,
    r.peakTier,
    Math.round(r.pp),
    r.focusActions,
    r.bailouts,
    r.promotions,
    r.stepDowns,
    r.leaguesFormed,
    r.leaguesFolded,
    r.tierDemotions,
    r.leaguesAtEnd,
    r.anchorLeagueTier,
    round(r.anchorHardcoreShare, 5),
    r.countriesWithFans,
    r.player.casual,
    r.player.hardcore,
    Math.round(r.player.fandomScore),
    r.player.rank,
    r.topCountriesByShare.join("|"),
    ...AXIS_IDS.map((axis) => r.genome[axis]),
    ...tiers.map((tier) => r.tierReached[tier]?.turnsCompleted ?? null),
    r.invariantViolations.length,
  ]);
  return toCsv(header, rows);
}

export function turnsCsv(rows: TurnRow[]): string {
  const header = [
    "seed",
    "genome",
    "bot",
    "turn",
    "year",
    "quarter_of_year",
    "pp_tier",
    "pp",
    "focus",
    "countries_with_fans",
    "leagues",
    "anchor_league_tier",
    "anchor_health",
    "anchor_cash",
    "player_casual",
    "player_hardcore",
    "player_fandom_score",
  ];
  return toCsv(
    header,
    rows.map((r) => [
      r.seed,
      r.genome,
      r.bot,
      r.turn,
      r.year,
      r.quarterOfYear,
      r.ppTier,
      Math.round(r.pp),
      r.focus,
      r.countriesWithFans,
      r.leagues,
      r.anchorLeagueTier,
      r.anchorHealth,
      round(r.anchorCash, 1),
      r.playerCasual,
      r.playerHardcore,
      Math.round(r.playerFandomScore),
    ]),
  );
}

export function countriesCsv(rows: CountryRow[]): string {
  const header = [
    "seed",
    "genome",
    "bot",
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
    "league_tier",
    "league_health",
    "league_cash",
    "leagues_folded",
  ];
  return toCsv(
    header,
    rows.map((r) => [
      r.seed,
      r.genome,
      r.bot,
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
      r.leagueTier,
      r.leagueHealth,
      round(r.leagueCash, 1),
      r.leaguesFolded,
    ]),
  );
}

export function optionOutcomesCsv(anchor: string, outcomes: OptionOutcome[]): string {
  const header = [
    "anchor",
    "axis",
    "option",
    "campaigns",
    "median_fandom_score",
    "top_quartile_share",
    "exceeds_dominance_limit",
  ];
  return toCsv(
    header,
    outcomes.map((o) => [
      anchor,
      o.axis,
      o.option,
      o.campaigns,
      o.medianFandomScore === null ? null : Math.round(o.medianFandomScore),
      o.topQuartileShare === null ? null : round(o.topQuartileShare, 3),
      o.exceedsDominanceLimit,
    ]),
  );
}
