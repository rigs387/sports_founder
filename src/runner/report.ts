import type { SportTotals } from "../sim";

export interface CampaignResult {
  seed: number;
  anchorCountryId: string;
  turnsPlayed: number;
  quartersElapsed: number;
  finalYear: number;
  finalQuarterOfYear: number;
  ppTier: number;
  pp: number;
  player: SportTotals & { rank: number };
  rivals: SportTotals[];
  /** First time each tier was reached: turns completed and quarters elapsed at that moment. */
  tierReached: Record<string, { turnsCompleted: number; quartersElapsed: number }>;
  invariantViolations: string[];
}

export interface TurnRow {
  seed: number;
  turn: number;
  year: number;
  quarterOfYear: number;
  ppTier: number;
  pp: number;
  playerCasual: number;
  playerHardcore: number;
  playerFandomScore: number;
  playerRank: number;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid] ?? 0;
  return sorted.length % 2 === 1 ? upper : ((sorted[mid - 1] ?? 0) + upper) / 2;
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
    turnsToTier,
    campaignsWithInvariantViolations: results.filter((r) => r.invariantViolations.length > 0)
      .length,
  };
}

function toCsv(header: string[], rows: (string | number)[][]): string {
  const csvCell = (value: string | number) => {
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
    "turns_played",
    "quarters_elapsed",
    "final_year",
    "pp_tier",
    "pp",
    "player_casual",
    "player_hardcore",
    "player_fandom_score",
    "player_rank",
    ...tiers.map((tier) => `turns_to_tier_${tier}`),
    "invariant_violations",
  ];
  const rows = results.map((r) => [
    r.seed,
    r.anchorCountryId,
    r.turnsPlayed,
    r.quartersElapsed,
    r.finalYear,
    r.ppTier,
    Math.round(r.pp),
    r.player.casual,
    r.player.hardcore,
    Math.round(r.player.fandomScore),
    r.player.rank,
    ...tiers.map((tier) => r.tierReached[tier]?.turnsCompleted ?? ""),
    r.invariantViolations.length,
  ]);
  return toCsv(header, rows);
}

export function turnsCsv(rows: TurnRow[]): string {
  const header = [
    "seed",
    "turn",
    "year",
    "quarter_of_year",
    "pp_tier",
    "pp",
    "player_casual",
    "player_hardcore",
    "player_fandom_score",
    "player_rank",
  ];
  return toCsv(
    header,
    rows.map((r) => [
      r.seed,
      r.turn,
      r.year,
      r.quarterOfYear,
      r.ppTier,
      Math.round(r.pp),
      r.playerCasual,
      r.playerHardcore,
      Math.round(r.playerFandomScore),
      r.playerRank,
    ]),
  );
}
