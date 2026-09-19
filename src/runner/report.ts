import {
  AXIS_IDS,
  type AxisId,
  COUNTERMOVES,
  type CountermoveKind,
  type EscalationLevel,
  GENOME_AXES,
  type Genome,
  type LeagueTierId,
} from "../content";
import type { SportTotals } from "../sim";
import type { BotId } from "./policy";

/** Turns at which PP banked and spent are sampled for the growth tree report. */
export const PP_TIMELINE_TURNS = [10, 20, 50, 100, 150, 200];

/** A value with the country and turn where it was seen. */
export interface WhereAndWhen {
  value: number;
  countryId: string;
  turn: number;
}

/** What one rival did and how it held up over a campaign (GDD Rival AI; tech plan 2.1). */
export interface RivalCampaignReport {
  sportId: string;
  budgetSpent: number;
  budgetLeft: number;
  escalations: number;
  deescalations: number;
  countermoves: Record<CountermoveKind, number>;
  countermovesTotal: number;
  /** Genome axes that differ from the rival's content genome at the end (rule copying). */
  finalGenomeChanges: number;
  peakAnchorLevel: EscalationLevel;
  anchorHardcoreShareStart: number;
  anchorHardcoreShareEnd: number;
  /** Lowest hardcore share of any country's population, observed after every turn. */
  lowestHardcoreShare: WhereAndWhen;
  /** Lowest hardcore count relative to the rival's starting count in that country. */
  lowestRetained: WhereAndWhen;
  lowestGlobalHardcoreShare: number;
  /** Countries where the rival's hardcore fans reached zero. */
  eliminatedFrom: string[];
}

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
  /** The first turn that ended with the player's sport #1 by global Fandom Score. */
  firstTopTurn: number | null;
  /** The turn the win landed (GDD Win condition), and in-game years elapsed by then. */
  wonTurn: number | null;
  wonYears: number | null;
  /** Longest win hold: consecutive turns ended at #1 at the win's required PP tier. */
  longestTopStreak: number;
  /** Times the player's sport fell from #1. */
  rankOneLosses: number;
  /** Anchor league collapses after the win (each a Moment, not the end). */
  birthplaceOutlived: number;
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
  /** The player's highest hardcore share of any country's population, observed after every turn. */
  peakPlayerHardcoreShare: WhereAndWhen;
  /** In-game years until the player's hardcore fans outnumbered every rival's in the anchor. */
  anchorOvertakeYears: number | null;
  /** Growth tree nodes bought, in order, with the turn and the PP paid. */
  nodesBought: { nodeId: string; turn: number; cost: number }[];
  ppSpentOnNodes: number;
  /** Per fork id: the node chosen, or null if the fork was never decided. */
  forkChoices: Record<string, string | null>;
  /** PP banked and cumulative PP spent on nodes after the sampled turns that were played. */
  ppTimeline: { turn: number; banked: number; spentOnNodes: number }[];
  rivalReports: RivalCampaignReport[];
  landmarks: number;
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
  anchorPlayerHardcoreShare: number;
  /** The player's rank by global Fandom Score, and the win hold so far. */
  playerRank: number;
  turnsHeld: number;
  nodesOwned: number;
  /** Cumulative PP spent on growth tree nodes. */
  ppSpentOnNodes: number;
  /** Each rival's hardcore share and escalation level in the anchor. */
  rivals: { sportId: string; anchorHardcoreShare: number; anchorLevel: EscalationLevel }[];
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
  /** Each rival's escalation level here at the end, "|"-separated in rival order. */
  rivalLevels: string;
  /** Countermoves in effect here at the end. */
  rivalCountermoves: string;
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

/** The value at quantile `q` (nearest rank), or null for no values. */
export function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))] ?? null;
}

export function distribution(values: number[]) {
  return {
    min: quantile(values, 0),
    p10: quantile(values, 0.1),
    median: median(values),
    p90: quantile(values, 0.9),
    max: values.length > 0 ? Math.max(...values) : null,
  };
}

export function countBy(values: (number | string)[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

/** Rival activity across campaigns: medians per campaign, and the lowest points seen anywhere. */
export function rivalAggregate(results: CampaignResult[]) {
  const ids = [...new Set(results.flatMap((r) => r.rivalReports.map((rival) => rival.sportId)))];
  return ids.map((sportId) => {
    const reports = results.flatMap((result) =>
      result.rivalReports
        .filter((rival) => rival.sportId === sportId)
        .map((rival) => ({ result, rival })),
    );
    const of = (pick: (rival: RivalCampaignReport) => number) =>
      median(reports.map(({ rival }) => pick(rival)));
    const lowestShare = reports.reduce<(typeof reports)[number] | null>(
      (best, entry) =>
        best === null ||
        entry.rival.lowestHardcoreShare.value < best.rival.lowestHardcoreShare.value
          ? entry
          : best,
      null,
    );
    const lowestRetained = reports.reduce<(typeof reports)[number] | null>(
      (best, entry) =>
        best === null || entry.rival.lowestRetained.value < best.rival.lowestRetained.value
          ? entry
          : best,
      null,
    );
    const where = (
      entry: (typeof reports)[number] | null,
      pick: "lowestHardcoreShare" | "lowestRetained",
    ) =>
      entry === null
        ? null
        : {
            ...entry.rival[pick],
            anchor: entry.result.anchorCountryId,
            bot: entry.result.bot,
            seed: entry.result.seed,
          };
    return {
      sportId,
      campaigns: reports.length,
      medianPerCampaign: {
        budgetSpent: of((r) => r.budgetSpent),
        escalations: of((r) => r.escalations),
        deescalations: of((r) => r.deescalations),
        countermoves: of((r) => r.countermovesTotal),
        ...Object.fromEntries(COUNTERMOVES.map((kind) => [kind, of((r) => r.countermoves[kind])])),
        anchorHardcoreShareStart: of((r) => r.anchorHardcoreShareStart),
        anchorHardcoreShareEnd: of((r) => r.anchorHardcoreShareEnd),
      },
      peakAnchorLevels: countBy(reports.map(({ rival }) => rival.peakAnchorLevel)),
      lowestHardcoreShare: where(lowestShare, "lowestHardcoreShare"),
      lowestRetained: where(lowestRetained, "lowestRetained"),
      campaignsWithEliminations: reports.filter(({ rival }) => rival.eliminatedFrom.length > 0)
        .length,
    };
  });
}

/** Growth tree activity across campaigns (GDD PP Growth Tree). */
export function growthAggregate(
  results: CampaignResult[],
  tree: { nodes: { id: string }[]; forks: { id: string; nodes: string[] }[] },
) {
  const nodes = tree.nodes.map((node) => {
    const turns = results.flatMap((r) =>
      r.nodesBought.filter((bought) => bought.nodeId === node.id).map((bought) => bought.turn),
    );
    return {
      nodeId: node.id,
      boughtIn: turns.length,
      of: results.length,
      medianTurnBought: median(turns),
    };
  });
  const forks = tree.forks.map((fork) => ({
    forkId: fork.id,
    choices: Object.fromEntries(
      [...fork.nodes, "undecided"].map((choice) => [
        choice,
        results.filter((r) => (r.forkChoices[fork.id] ?? "undecided") === choice).length,
      ]),
    ),
  }));
  const timeline = PP_TIMELINE_TURNS.map((turn) => {
    const points = results.flatMap((r) => r.ppTimeline.filter((p) => p.turn === turn));
    return {
      turn,
      campaigns: points.length,
      medianBanked: median(points.map((p) => p.banked)),
      medianSpentOnNodes: median(points.map((p) => p.spentOnNodes)),
    };
  });
  return {
    nodesBoughtPerCampaign: distribution(results.map((r) => r.nodesBought.length)),
    ppSpentOnNodes: distribution(results.map((r) => r.ppSpentOnNodes)),
    finalPpBanked: distribution(results.map((r) => r.pp)),
    nodes,
    forks,
    timeline,
  };
}

/**
 * One-sided lower confidence bound (Wilson score) of a share observed as `hits` out of `n`; z = 1.645
 * is 95%. An option or node counts as dominant only when even this bound is above the limit, so
 * sampling noise alone cannot fail the no-dominant-genome check (decided 2026-09-14).
 */
export function shareLowerBound(hits: number, n: number, z: number): number {
  if (n <= 0) return 0;
  const p = hits / n;
  const z2 = z * z;
  const centre = p + z2 / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return Math.max(0, (centre - spread) / (1 + z2 / n));
}

/** Per-node ownership among top-quartile campaigns, to spot a dominant node. */
export interface NodeOutcome {
  nodeId: string;
  campaigns: number;
  /** Share of all campaigns that own the node at the end. */
  ownedShare: number | null;
  /** Share of top-quartile campaigns (by Fandom Score) that own it. */
  topQuartileShare: number | null;
  /** Lower confidence bound of that share (see shareLowerBound). */
  topQuartileLowerBound: number | null;
  /** The lower bound is above the dominance limit. */
  exceedsDominanceLimit: boolean;
}

export function nodeOutcomes(
  results: CampaignResult[],
  nodeIds: string[],
  dominanceLimit: number,
  z: number,
): NodeOutcome[] {
  const sorted = [...results].sort((a, b) => b.player.fandomScore - a.player.fandomScore);
  const topQuartile = sorted.slice(0, Math.max(1, Math.floor(sorted.length / 4)));
  const owns = (result: CampaignResult, nodeId: string) =>
    result.nodesBought.some((bought) => bought.nodeId === nodeId);
  return nodeIds.map((nodeId) => {
    const campaigns = results.filter((result) => owns(result, nodeId)).length;
    const inTop = topQuartile.filter((result) => owns(result, nodeId)).length;
    const topQuartileShare = results.length > 0 ? inTop / topQuartile.length : null;
    const topQuartileLowerBound =
      results.length > 0 ? shareLowerBound(inTop, topQuartile.length, z) : null;
    return {
      nodeId,
      campaigns,
      ownedShare: results.length > 0 ? campaigns / results.length : null,
      topQuartileShare,
      topQuartileLowerBound,
      exceedsDominanceLimit:
        topQuartileLowerBound !== null && topQuartileLowerBound > dominanceLimit,
    };
  });
}

export function nodeOutcomesCsv(anchor: string, outcomes: NodeOutcome[]): string {
  return toCsv(
    [
      "anchor",
      "node",
      "campaigns_owning",
      "owned_share",
      "top_quartile_share",
      "top_quartile_lower_bound",
      "exceeds_dominance_limit",
    ],
    outcomes.map((o) => [
      anchor,
      o.nodeId,
      o.campaigns,
      o.ownedShare === null ? null : round(o.ownedShare, 3),
      o.topQuartileShare === null ? null : round(o.topQuartileShare, 3),
      o.topQuartileLowerBound === null ? null : round(o.topQuartileLowerBound, 3),
      o.exceedsDominanceLimit,
    ]),
  );
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
  const peaks = results.map((r) => r.peakPlayerHardcoreShare.value);
  const overtakes = results
    .map((r) => r.anchorOvertakeYears)
    .filter((years): years is number => years !== null);
  const present = (values: (number | null)[]) =>
    values.filter((value): value is number => value !== null);
  const wonTurns = present(results.map((r) => r.wonTurn));
  const firstTopTurns = present(results.map((r) => r.firstTopTurn));
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
    wins: {
      won: wonTurns.length,
      of: results.length,
      turn: distribution(wonTurns),
      years: distribution(present(results.map((r) => r.wonYears))),
      reachedFirst: firstTopTurns.length,
      firstTopTurn: distribution(firstTopTurns),
      longestTopStreak: distribution(results.map((r) => r.longestTopStreak)),
      rankOneLosses: results.reduce((sum, r) => sum + r.rankOneLosses, 0),
      birthplaceOutlived: results.reduce((sum, r) => sum + r.birthplaceOutlived, 0),
    },
    peakPlayerHardcoreShare: {
      ...distribution(peaks),
      above25Percent: peaks.filter((p) => p > 0.25).length,
      above50Percent: peaks.filter((p) => p > 0.5).length,
      countries: countBy(results.map((r) => r.peakPlayerHardcoreShare.countryId)),
    },
    anchorOvertakeYears: {
      overtook: overtakes.length,
      of: results.length,
      ...distribution(overtakes),
    },
    landmarks: distribution(results.map((r) => r.landmarks)),
    rivals: rivalAggregate(results),
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
  /** Lower confidence bound of that share (see shareLowerBound). */
  topQuartileLowerBound: number | null;
  /** The lower bound is above the dominance limit. */
  exceedsDominanceLimit: boolean;
}

export function optionOutcomes(
  results: CampaignResult[],
  dominanceLimit: number,
  z: number,
): OptionOutcome[] {
  const sorted = [...results].sort((a, b) => b.player.fandomScore - a.player.fandomScore);
  const quartileSize = Math.max(1, Math.floor(sorted.length / 4));
  const topQuartile = sorted.slice(0, quartileSize);
  const out: OptionOutcome[] = [];
  for (const axis of AXIS_IDS) {
    for (const option of GENOME_AXES[axis].options) {
      const using = results.filter((result) => result.genome[axis] === option);
      const inTop = topQuartile.filter((result) => result.genome[axis] === option).length;
      const topQuartileShare = results.length > 0 ? inTop / topQuartile.length : null;
      const topQuartileLowerBound =
        results.length > 0 ? shareLowerBound(inTop, topQuartile.length, z) : null;
      out.push({
        axis,
        option,
        campaigns: using.length,
        medianFandomScore: median(using.map((result) => result.player.fandomScore)),
        topQuartileShare,
        topQuartileLowerBound,
        exceedsDominanceLimit:
          topQuartileLowerBound !== null && topQuartileLowerBound > dominanceLimit,
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

const snake = (text: string) => text.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

export function campaignsCsv(results: CampaignResult[], tierCount: number): string {
  const tiers = Array.from({ length: tierCount - 1 }, (_, i) => i + 2);
  const rivalIds = results[0]?.rivalReports.map((rival) => rival.sportId) ?? [];
  const forkIds = Object.keys(results[0]?.forkChoices ?? {});
  const rivalColumns = rivalIds.flatMap((id) => [
    `${id}_budget_spent`,
    `${id}_escalations`,
    `${id}_deescalations`,
    `${id}_countermoves`,
    ...COUNTERMOVES.map((kind) => `${id}_${snake(kind)}`),
    `${id}_genome_changes`,
    `${id}_peak_anchor_level`,
    `${id}_anchor_share_start`,
    `${id}_anchor_share_end`,
    `${id}_lowest_share`,
    `${id}_lowest_share_country`,
    `${id}_lowest_retained`,
    `${id}_lowest_retained_country`,
    `${id}_eliminated_from`,
  ]);
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
    "first_top_turn",
    "won_turn",
    "won_years",
    "longest_top_streak",
    "rank_one_losses",
    "birthplace_outlived",
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
    "peak_player_hardcore_share",
    "peak_player_hardcore_country",
    "peak_player_hardcore_turn",
    "anchor_overtake_years",
    "nodes_bought",
    "pp_spent_on_nodes",
    "nodes",
    ...forkIds.map((id) => `fork_${snake(id).replaceAll("-", "_")}`),
    "landmarks",
    "top_countries_by_share",
    ...AXIS_IDS,
    ...tiers.map((tier) => `turns_to_tier_${tier}`),
    ...rivalColumns,
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
    r.firstTopTurn,
    r.wonTurn,
    r.wonYears,
    r.longestTopStreak,
    r.rankOneLosses,
    r.birthplaceOutlived,
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
    round(r.peakPlayerHardcoreShare.value, 5),
    r.peakPlayerHardcoreShare.countryId,
    r.peakPlayerHardcoreShare.turn,
    r.anchorOvertakeYears,
    r.nodesBought.length,
    Math.round(r.ppSpentOnNodes),
    r.nodesBought.map((bought) => `${bought.nodeId}@${bought.turn}`).join("|"),
    ...forkIds.map((id) => r.forkChoices[id] ?? ""),
    r.landmarks,
    r.topCountriesByShare.join("|"),
    ...AXIS_IDS.map((axis) => r.genome[axis]),
    ...tiers.map((tier) => r.tierReached[tier]?.turnsCompleted ?? null),
    ...rivalIds.flatMap((id) => {
      const rival = r.rivalReports.find((report) => report.sportId === id);
      if (!rival) return rivalColumns.slice(0, 0);
      return [
        Math.round(rival.budgetSpent),
        rival.escalations,
        rival.deescalations,
        rival.countermovesTotal,
        ...COUNTERMOVES.map((kind) => rival.countermoves[kind]),
        rival.finalGenomeChanges,
        rival.peakAnchorLevel,
        round(rival.anchorHardcoreShareStart, 5),
        round(rival.anchorHardcoreShareEnd, 5),
        round(rival.lowestHardcoreShare.value, 6),
        rival.lowestHardcoreShare.countryId,
        round(rival.lowestRetained.value, 4),
        rival.lowestRetained.countryId,
        rival.eliminatedFrom.join("|"),
      ];
    }),
    r.invariantViolations.length,
  ]);
  return toCsv(header, rows);
}

export function turnsCsv(rows: TurnRow[]): string {
  const rivalIds = rows[0]?.rivals.map((rival) => rival.sportId) ?? [];
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
    "anchor_player_hardcore_share",
    "player_rank",
    "turns_held",
    "nodes_owned",
    "pp_spent_on_nodes",
    ...rivalIds.flatMap((id) => [`${id}_anchor_hardcore_share`, `${id}_anchor_level`]),
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
      round(r.anchorPlayerHardcoreShare, 5),
      r.playerRank,
      r.turnsHeld,
      r.nodesOwned,
      Math.round(r.ppSpentOnNodes),
      ...rivalIds.flatMap((id) => {
        const rival = r.rivals.find((entry) => entry.sportId === id);
        return [round(rival?.anchorHardcoreShare ?? 0, 5), rival?.anchorLevel ?? ""];
      }),
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
    "rival_levels",
    "rival_countermoves",
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
      r.rivalLevels,
      r.rivalCountermoves,
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
    "top_quartile_lower_bound",
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
      o.topQuartileLowerBound === null ? null : round(o.topQuartileLowerBound, 3),
      o.exceedsDominanceLimit,
    ]),
  );
}
