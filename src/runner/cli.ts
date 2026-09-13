import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";
import { ContentValidationError } from "../content";
import { anchorGenomeHints, MAX_SEED, type World } from "../sim";
import { type PlayedCampaign, playCampaign } from "./campaign";
import { DEFAULT_CONTENT_DIR, loadWorldFromDisk } from "./content-from-disk";
import { type DifferentiationReport, RANKINGS, runDifferentiation } from "./experiment";
import {
  type BenchmarkReport,
  type CollapseReport,
  contrastingAnchors,
  type HardAnchorReport,
  type OptionsReport,
  type PacingReport,
  runBenchmark,
  runCollapse,
  runHardAnchor,
  runOptions,
  runPacing,
} from "./experiments";
import { formatGenome, parseGenomeArg, randomGenome } from "./genome-arg";
import { BOT_IDS, type BotId, isBotId } from "./policy";
import {
  aggregate,
  type CampaignResult,
  type CountryRow,
  campaignsCsv,
  countriesCsv,
  median,
  optionOutcomesCsv,
  type TurnRow,
  turnsCsv,
} from "./report";

const EXPERIMENTS = [
  "differentiation",
  "collapse",
  "hard-anchor",
  "pacing",
  "options",
  "benchmark",
] as const;
type ExperimentId = (typeof EXPERIMENTS)[number];

const HELP = `Headless runner: plays seeded campaigns with no UI and writes a summary.

Usage: npm run sim -- [options]
  --campaigns <n>    campaigns (plain run) or seeds per cell (experiments) (default 20)
  --turns <n>        maximum turns per campaign; a campaign stops early if it ends (default 100)
  --seed <n>         first seed; campaign i uses seed + i (default 1)
  --anchor <id>      anchor country (default: first country in content)
  --genome <spec>    preset id, "random" (a seeded random genome per campaign), or
                     [preset:]axis=option,... overrides (default: the first preset)
  --bot <id>         bot for plain runs, differentiation, pacing, options and benchmark:
                     ${BOT_IDS.join(", ")} (default greedy-spread)
  --experiment <list>
                     comma-separated, or "all":
                       differentiation  preset pairs on the same seeds and anchor must share fewer
                                        than half their top-10 countries by population share
                       collapse         anchor collapse rate for every anchor × bot (random
                                        genomes); every anchor must sometimes collapse under the
                                        naive bot named in config
                       hard-anchor      outcomes from the hardest anchor, per bot
                       pacing           turns to each PP tier against the GDD budget table
                       options          per-option outcomes from random genomes, per anchor
                       benchmark        a 120-year campaign: time, save size, load time
  --anchors <ids>    anchors for collapse (default: all) and for pacing and options (default: the
                     first country of each climate)
  --bots <ids>       bots for collapse and hard-anchor (default: greedy-spread,anchor-turtle,random)
  --hard-anchor <id> anchor for hard-anchor (default: the smallest country)
  --presets <ids>    presets for differentiation (default: all)
  --content <dir>    content directory (default: ./content)
  --out <dir>        output directory (default: runs/latest)

Writes summary.json, campaigns.csv, countries.csv, turns.csv (plain runs and differentiation only),
options.csv (options experiment) and one JSON file per experiment. Exits with code 1 if any
campaign produced an invalid state. Experiment misses are reported, not treated as errors.`;

function wholeNumber(value: string, name: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`--${name} must be a whole number from ${min} to ${max} (got "${value}")`);
  }
  return parsed;
}

const fmt = (value: number | null) =>
  value === null ? "-" : Math.round(value).toLocaleString("en-US");
const pct = (value: number) => `${(value * 100).toFixed(0)}%`;
const passFail = (passed: boolean) => (passed ? "PASS" : "FAIL");

interface Collected {
  results: CampaignResult[];
  turnRows: TurnRow[];
  countryRows: CountryRow[];
}

function listOf(value: string | undefined): string[] | undefined {
  return value === undefined ? undefined : value.split(",").filter((part) => part !== "");
}

function checkAnchors(world: World, anchors: string[]): string[] {
  for (const anchor of anchors) {
    if (!world.countries.some((country) => country.id === anchor)) {
      throw new Error(`Unknown anchor country "${anchor}"`);
    }
  }
  return anchors;
}

function checkBots(bots: string[]): BotId[] {
  return bots.map((bot) => {
    if (!isBotId(bot)) throw new Error(`Unknown bot "${bot}" (available: ${BOT_IDS.join(", ")})`);
    return bot;
  });
}

// ---- Printing ------------------------------------------------------------------------------

function printDifferentiation(report: DifferentiationReport): void {
  console.log(
    `\nDifferentiation: anchor ${report.anchorCountryId}, bot ${report.bot}, ${report.seeds.length} seed(s), up to ${report.turns} turns. Target: mean shared top-${report.topN} below ${report.sharedLimit}`,
  );
  for (const outcome of report.outcomes) {
    console.log(
      `  ${outcome.preset.padEnd(18)} median Fandom Score ${fmt(median(outcome.fandomScoreBySeed))}; collapsed on ${outcome.collapsedSeeds.length} seed(s)`,
    );
  }
  for (const ranking of RANKINGS) {
    const label =
      ranking === "byShare"
        ? "by population share (the criterion)"
        : "by raw Fandom Score (reference only)";
    console.log(`  Ranking ${label}:`);
    for (const pair of report.pairs) {
      const c = pair[ranking];
      console.log(
        `    ${passFail(c.passed)} ${pair.a} vs ${pair.b}: mean shared ${c.meanShared.toFixed(2)}; by seed [${c.sharedBySeed.join(", ")}]`,
      );
    }
    console.log(
      `    ${report.pairsPassed[ranking]} pair(s) passed, ${report.pairsFailed[ranking]} failed`,
    );
  }
  console.log(`  Differentiation criterion: ${report.passed ? "PASSED" : "FAILED"}`);
}

function printCollapse(report: CollapseReport): void {
  console.log(
    `\nCollapse: ${report.seeds.length} seed(s) per anchor × bot, random genomes, up to ${report.turns} turns. Naive bot: ${report.naiveBot}`,
  );
  const bots = [...new Set(report.cells.map((cell) => cell.bot))];
  console.log(`  ${"anchor".padEnd(14)}${bots.map((bot) => bot.padStart(16)).join("")}`);
  const anchors = [...new Set(report.cells.map((cell) => cell.anchor))];
  for (const anchor of anchors) {
    const row = bots.map((bot) => {
      const cell = report.cells.find((c) => c.anchor === anchor && c.bot === bot);
      return (cell ? `${cell.collapses}/${cell.campaigns} ${pct(cell.rate)}` : "-").padStart(16);
    });
    console.log(`  ${anchor.padEnd(14)}${row.join("")}`);
  }
  const safe = report.safeAnchorsUnderNaiveBot;
  console.log(
    `  No safe anchor: ${report.passed ? "PASSED" : "FAILED"}${safe.length > 0 ? ` (never collapsed under ${report.naiveBot}: ${safe.join(", ")})` : ""}`,
  );
}

function printHardAnchor(report: HardAnchorReport): void {
  console.log(
    `\nHard anchor ${report.anchor}: ${report.seeds.length} seed(s) per bot, random genomes, up to ${report.turns} turns. No win condition exists yet; peak PP tier stands in.`,
  );
  for (const bot of report.bots) {
    console.log(
      `  ${bot.bot.padEnd(14)} collapsed ${bot.collapses}/${bot.campaigns}; median turns played ${fmt(bot.medianTurnsSurvived)}; best peak tier ${bot.bestPeakTier}; peak tiers ${JSON.stringify(bot.peakTiers)}`,
    );
  }
}

function printPacing(report: PacingReport): void {
  console.log(
    `\nPacing: anchors ${report.anchors.join(", ")}, bot ${report.bot}, ${report.seeds.length} seed(s) each, up to ${report.turns} turns, tolerance ±${pct(report.tolerance)}`,
  );
  for (const tier of report.tiers) {
    console.log(
      `  ${passFail(tier.withinTolerance)} tier ${tier.tier}: target turn ${tier.targetTurn} (allowed ${tier.allowedRange[0]}–${tier.allowedRange[1]}); median ${fmt(tier.medianTurn)}; reached ${tier.reached}/${tier.of}`,
    );
  }
  console.log(`  Pacing criterion: ${report.passed ? "PASSED" : "FAILED"}`);
}

function printOptions(report: OptionsReport): void {
  console.log(
    `\nOptions: ${report.seeds.length} random genome(s) per anchor, bot ${report.bot}, up to ${report.turns} turns. Limit: no option in more than ${pct(report.dominanceLimit)} of top-quartile runs`,
  );
  for (const entry of report.byAnchor) {
    const above = entry.aboveLimit.length === 0 ? "none" : entry.aboveLimit.join(", ");
    console.log(`  ${entry.anchor.padEnd(14)} above limit: ${above}`);
  }
  const combined =
    report.combined.aboveLimit.length === 0 ? "none" : report.combined.aboveLimit.join(", ");
  console.log(`  ${"all anchors".padEnd(14)} above limit: ${combined}`);
}

function printBenchmark(report: BenchmarkReport): void {
  console.log(
    `\nBenchmark: ${report.targetYears}-year campaign from ${report.anchor}, bot ${report.bot}`,
  );
  for (const attempt of report.attempts) {
    console.log(
      `  seed ${attempt.seed}: ${attempt.collapsed ? "collapsed" : "completed"} after ${attempt.yearsPlayed} year(s)`,
    );
  }
  if (!report.completed) {
    console.log("  No attempt lasted the full span; nothing was measured.");
    return;
  }
  console.log(
    `  ${report.turnsPlayed} turns in ${report.simulateMs.toFixed(0)} ms; save ${(report.saveBytes / 1024).toFixed(0)} KB uncompressed JSON; serialize ${report.serializeMs.toFixed(0)} ms; load ${report.loadMs.toFixed(0)} ms; ${report.landmarks} landmarks; ${report.yearlySnapshots} yearly snapshots`,
  );
}

// ---- Main ----------------------------------------------------------------------------------

function main(): number {
  const { values } = parseArgs({
    options: {
      campaigns: { type: "string", default: "20" },
      turns: { type: "string", default: "100" },
      seed: { type: "string", default: "1" },
      anchor: { type: "string" },
      genome: { type: "string" },
      bot: { type: "string", default: "builder" },
      experiment: { type: "string" },
      anchors: { type: "string" },
      bots: { type: "string" },
      "hard-anchor": { type: "string" },
      presets: { type: "string" },
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
  const anchor = checkAnchors(world, [values.anchor ?? world.countries[0]?.id ?? ""])[0] ?? "";
  const bot = checkBots([values.bot])[0] ?? "greedy-spread";
  const seeds = Array.from({ length: campaigns }, (_, i) => firstSeed + i);

  const requested = listOf(values.experiment) ?? [];
  const experiments: ExperimentId[] = requested.includes("all")
    ? [...EXPERIMENTS]
    : requested.map((id) => {
        if (!(EXPERIMENTS as readonly string[]).includes(id)) {
          throw new Error(`Unknown experiment "${id}" (available: ${EXPERIMENTS.join(", ")}, all)`);
        }
        return id as ExperimentId;
      });

  const naiveBotId = world.config.balanceTargets.naiveBot;
  if (!isBotId(naiveBotId)) {
    throw new Error(
      `content/config.yaml balanceTargets.naiveBot "${naiveBotId}" is not a bot (${BOT_IDS.join(", ")})`,
    );
  }
  const bots = checkBots(listOf(values.bots) ?? ["greedy-spread", "anchor-turtle", "random"]);
  const smallest = [...world.countries].sort((a, b) => a.population - b.population)[0]?.id ?? "";
  const hardAnchor = checkAnchors(world, [values["hard-anchor"] ?? smallest])[0] ?? smallest;
  const listedAnchors = listOf(values.anchors);

  const outDir = resolve(values.out);
  mkdirSync(outDir, { recursive: true });
  const started = performance.now();
  const collected: Collected = { results: [], turnRows: [], countryRows: [] };
  const collect =
    (withTurns: boolean) =>
    (played: PlayedCampaign): void => {
      collected.results.push(played.result);
      collected.countryRows.push(...played.countryRows);
      if (withTurns) collected.turnRows.push(...played.turnRows);
    };
  const written: string[] = [];
  const writeReport = (name: string, report: unknown) => {
    written.push(`${name}.json`);
    writeFileSync(join(outDir, `${name}.json`), `${JSON.stringify(report, null, 2)}\n`);
  };
  let optionsCsv = "";

  if (experiments.length === 0) {
    const choice = parseGenomeArg(values.genome, world);
    for (const seed of seeds) {
      const genome = choice.kind === "random" ? randomGenome(seed) : choice.genome;
      collect(true)(
        playCampaign(world, {
          seed,
          anchorCountryId: anchor,
          genome,
          genomeLabel:
            choice.kind === "random"
              ? `random:${formatGenome(genome)}`
              : (values.genome ?? world.genome.presets[0]?.id ?? "default"),
          bot,
          turns,
        }),
      );
    }
  }

  for (const experiment of experiments) {
    switch (experiment) {
      case "differentiation": {
        const report = runDifferentiation(
          world,
          {
            anchorCountryId: anchor,
            seeds,
            turns,
            bot,
            presets: listOf(values.presets) ?? world.genome.presets.map((p) => p.id),
          },
          collect(true),
        );
        writeReport("differentiation", report);
        printDifferentiation(report);
        break;
      }
      case "collapse": {
        const anchors = checkAnchors(world, listedAnchors ?? world.countries.map((c) => c.id));
        const report = runCollapse(
          world,
          { anchors, bots, naiveBot: naiveBotId, seeds, turns },
          collect(false),
        );
        writeReport("collapse", report);
        printCollapse(report);
        break;
      }
      case "hard-anchor": {
        const report = runHardAnchor(
          world,
          { anchor: hardAnchor, bots, seeds, turns },
          collect(false),
        );
        writeReport("hard-anchor", report);
        printHardAnchor(report);
        break;
      }
      case "pacing": {
        const anchors = checkAnchors(world, listedAnchors ?? contrastingAnchors(world));
        const report = runPacing(world, { anchors, bot, seeds, turns }, collect(false));
        writeReport("pacing", report);
        printPacing(report);
        break;
      }
      case "options": {
        const anchors = checkAnchors(world, listedAnchors ?? contrastingAnchors(world));
        const report = runOptions(world, { anchors, bot, seeds, turns }, collect(false));
        writeReport("options", report);
        optionsCsv = report.byAnchor
          .map((entry, i) => {
            const csv = optionOutcomesCsv(entry.anchor, entry.outcomes);
            return i === 0 ? csv : csv.slice(csv.indexOf("\n") + 1);
          })
          .join("");
        printOptions(report);
        break;
      }
      case "benchmark": {
        const report = runBenchmark(world, { anchor, bot, firstSeed, years: 120, maxAttempts: 10 });
        writeReport("benchmark", report);
        printBenchmark(report);
        break;
      }
    }
  }
  const elapsedMs = performance.now() - started;

  const { results, turnRows, countryRows } = collected;
  const tierCount = world.config.ppTiers.length;
  const agg = aggregate(results, tierCount);
  const summary = {
    settings: {
      campaigns,
      turns,
      firstSeed,
      anchor,
      genome: values.genome ?? world.genome.presets[0]?.id,
      bot,
      experiments,
      contentDir: resolve(values.content),
      elapsedMs: Math.round(elapsedMs),
    },
    anchorGenomeHints: anchorGenomeHints(world, anchor),
    aggregate: agg,
    experimentReports: written,
    campaigns: experiments.length === 0 ? results : undefined,
  };
  writeFileSync(join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(outDir, "campaigns.csv"), campaignsCsv(results, tierCount));
  writeFileSync(join(outDir, "countries.csv"), countriesCsv(countryRows));
  if (turnRows.length > 0) writeFileSync(join(outDir, "turns.csv"), turnsCsv(turnRows));
  if (optionsCsv !== "") writeFileSync(join(outDir, "options.csv"), optionsCsv);

  console.log(
    `\nPlayed ${results.length} campaign(s) in ${(elapsedMs / 1000).toFixed(1)} s. Output: ${outDir}`,
  );
  if (experiments.length === 0) {
    console.log(`  anchor ${anchor}, bot ${bot}, seeds ${firstSeed}–${firstSeed + campaigns - 1}`);
    console.log(
      `  collapsed ${agg.collapsed}/${agg.campaigns}; player Fandom Score min ${fmt(agg.playerFandomScore.min)}, median ${fmt(agg.playerFandomScore.median)}, max ${fmt(agg.playerFandomScore.max)}`,
    );
    console.log(
      `  final PP tier ${JSON.stringify(agg.finalTier)}; peak ${JSON.stringify(agg.peakTier)}`,
    );
    for (const [tier, info] of Object.entries(agg.turnsToTier)) {
      console.log(
        `  tier ${tier}: reached in ${info.reached}/${info.of}, median turn ${info.medianTurns ?? "-"}`,
      );
    }
    console.log(`  leagues at end (median): ${agg.leaguesAtEnd.median ?? "-"}`);
  }
  console.log(`  invalid campaigns: ${agg.campaignsWithInvariantViolations}`);

  if (agg.campaignsWithInvariantViolations > 0) {
    for (const result of results.filter((r) => r.invariantViolations.length > 0).slice(0, 10)) {
      console.error(
        `  seed ${result.seed} ${result.anchorCountryId} ${result.bot}: ${result.invariantViolations.slice(0, 5).join("; ")}`,
      );
    }
    return 1;
  }
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  if (error instanceof ContentValidationError) console.error(error.message);
  else console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
