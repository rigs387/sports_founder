import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { ContentValidationError } from "../content";
import { checkInvariants, createCampaign, endTurn, MAX_SEED, snapshot } from "../sim";
import { DEFAULT_CONTENT_DIR, loadWorldFromDisk } from "./content-from-disk";
import { aggregate, type CampaignResult, campaignsCsv, type TurnRow, turnsCsv } from "./report";

const HELP = `Headless runner: plays seeded campaigns with no UI and writes a summary.

Usage: npm run sim -- [options]
  --campaigns <n>   number of campaigns (default 20)
  --turns <n>       turns per campaign (default 100)
  --seed <n>        seed of the first campaign; campaign i uses seed + i (default 1)
  --anchor <id>     anchor country id (default: first country in content)
  --content <dir>   content directory (default: ./content)
  --out <dir>       output directory (default: runs/latest)

Writes summary.json, campaigns.csv (one row per campaign), and turns.csv (one row per turn).
Exits with code 1 if any campaign produced an invalid state.`;

function wholeNumber(value: string, name: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`--${name} must be a whole number from ${min} to ${max} (got "${value}")`);
  }
  return parsed;
}

function main(): number {
  const { values } = parseArgs({
    options: {
      campaigns: { type: "string", default: "20" },
      turns: { type: "string", default: "100" },
      seed: { type: "string", default: "1" },
      anchor: { type: "string" },
      content: { type: "string", default: DEFAULT_CONTENT_DIR },
      out: { type: "string", default: "runs/latest" },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(HELP);
    return 0;
  }

  const campaigns = wholeNumber(values.campaigns, "campaigns", 1, 100_000);
  const turns = wholeNumber(values.turns, "turns", 1, 100_000);
  const firstSeed = wholeNumber(values.seed, "seed", 0, MAX_SEED - campaigns + 1);
  const world = loadWorldFromDisk(resolve(values.content));
  const anchorCountryId = values.anchor ?? world.countries[0]?.id ?? "";
  const tierCount = world.config.ppTiers.length;

  const started = performance.now();
  const results: CampaignResult[] = [];
  const turnRows: TurnRow[] = [];

  for (let i = 0; i < campaigns; i += 1) {
    const seed = firstSeed + i;
    let state = createCampaign(world, { seed, anchorCountryId });
    const tierReached: CampaignResult["tierReached"] = {};
    const violations = new Set<string>();

    for (let t = 0; t < turns; t += 1) {
      const tierBefore = state.ppTier;
      state = endTurn(state, world);
      if (state.ppTier > tierBefore && tierReached[state.ppTier] === undefined) {
        tierReached[state.ppTier] = { turnsCompleted: t + 1, quartersElapsed: state.quarter };
      }
      for (const problem of checkInvariants(state, world)) violations.add(problem);

      const snap = snapshot(state, world);
      const ranked = [...snap.sports].sort((a, b) => b.fandomScore - a.fandomScore);
      const player = snap.sports.find((sport) => sport.kind === "player");
      if (!player) throw new Error("Snapshot has no player sport");
      turnRows.push({
        seed,
        turn: t + 1,
        year: snap.year,
        quarterOfYear: snap.quarterOfYear,
        ppTier: snap.ppTier,
        pp: snap.pp,
        playerCasual: player.casual,
        playerHardcore: player.hardcore,
        playerFandomScore: player.fandomScore,
        playerRank: ranked.indexOf(player) + 1,
      });
    }

    const snap = snapshot(state, world);
    const ranked = [...snap.sports].sort((a, b) => b.fandomScore - a.fandomScore);
    const player = snap.sports.find((sport) => sport.kind === "player");
    if (!player) throw new Error("Snapshot has no player sport");
    results.push({
      seed,
      anchorCountryId,
      turnsPlayed: turns,
      quartersElapsed: state.quarter,
      finalYear: snap.year,
      finalQuarterOfYear: snap.quarterOfYear,
      ppTier: state.ppTier,
      pp: state.pp,
      player: { ...player, rank: ranked.indexOf(player) + 1 },
      rivals: snap.sports.filter((sport) => sport.kind === "rival"),
      tierReached,
      invariantViolations: [...violations],
    });
  }
  const elapsedMs = performance.now() - started;

  const outDir = resolve(values.out);
  mkdirSync(outDir, { recursive: true });
  const summary = {
    settings: { campaigns, turns, firstSeed, anchorCountryId, contentDir: resolve(values.content) },
    aggregate: aggregate(results, tierCount),
    campaigns: results,
  };
  writeFileSync(join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(outDir, "campaigns.csv"), campaignsCsv(results, tierCount));
  writeFileSync(join(outDir, "turns.csv"), turnsCsv(turnRows));

  const agg = summary.aggregate;
  console.log(`Played ${campaigns} campaign(s) × ${turns} turns from "${anchorCountryId}"`);
  console.log(
    `  seeds ${firstSeed}–${firstSeed + campaigns - 1}, ${elapsedMs.toFixed(0)} ms total`,
  );
  console.log(
    `  player Fandom Score: min ${fmt(agg.playerFandomScore.min)}, median ${fmt(agg.playerFandomScore.median)}, max ${fmt(agg.playerFandomScore.max)}`,
  );
  console.log(`  final PP tier: ${JSON.stringify(agg.finalTier)}`);
  for (const [tier, info] of Object.entries(agg.turnsToTier)) {
    console.log(
      `  tier ${tier}: reached in ${info.reached}/${info.of}, median turn ${info.medianTurns ?? "-"}`,
    );
  }
  console.log(`  invalid campaigns: ${agg.campaignsWithInvariantViolations}`);
  console.log(`Wrote ${join(outDir, "summary.json")}, campaigns.csv, turns.csv`);

  if (agg.campaignsWithInvariantViolations > 0) {
    for (const result of results.filter((r) => r.invariantViolations.length > 0)) {
      console.error(`  seed ${result.seed}: ${result.invariantViolations.slice(0, 5).join("; ")}`);
    }
    return 1;
  }
  return 0;
}

function fmt(value: number | null): string {
  return value === null ? "-" : Math.round(value).toLocaleString("en-US");
}

try {
  process.exitCode = main();
} catch (error) {
  if (error instanceof ContentValidationError) console.error(error.message);
  else console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
