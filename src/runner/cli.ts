import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";
import { ContentValidationError } from "../content";
import { anchorGenomeHints, MAX_SEED, type World } from "../sim";
import { RunBudget } from "./budget";
import { onCampaignPlayed, type PlayedCampaign, playCampaign } from "./campaign";
import { DEFAULT_CONTENT_DIR, loadWorldFromDisk } from "./content-from-disk";
import { type DifferentiationReport, RANKINGS, runDifferentiation } from "./experiment";
import {
  type BenchmarkReport,
  type CollapseReport,
  contrastingAnchors,
  type HardAnchorReport,
  type OptionsReport,
  type PacingReport,
  type RivalLowPoint,
  type RivalsPersistReport,
  runBenchmark,
  runCollapse,
  runHardAnchor,
  runOptions,
  runPacing,
  runRivalsPersist,
  sampledAnchors,
  typicalAnchors,
} from "./experiments";
import { formatGenome, parseGenomeArg, randomGenome } from "./genome-arg";
import { BOT_IDS, type BotId, isBotId } from "./policy";
import {
  aggregate,
  type CampaignResult,
  type CountryRow,
  campaignsCsv,
  countriesCsv,
  dealsAggregate,
  eventAggregate,
  flagshipAggregate,
  growthAggregate,
  median,
  nodeOutcomesCsv,
  optionOutcomesCsv,
  remembersAggregate,
  rulesAggregate,
  type TurnRow,
  turnsCsv,
  venuesAggregate,
} from "./report";

const EXPERIMENTS = [
  "differentiation",
  "collapse",
  "hard-anchor",
  "pacing",
  "options",
  "rivals",
  "benchmark",
] as const;
type ExperimentId = (typeof EXPERIMENTS)[number];

/** Bots for hard-anchor and rivals unless --bots says otherwise. */
const EXPERIMENT_BOTS = ["builder", "greedy-spread", "anchor-turtle"];

const HELP = `Headless runner: plays seeded campaigns with no UI and writes a summary.

Every run states its plan (campaign count) first, prints progress every 15 s, and stops after the
first campaign if it is projected to run past --max-minutes. Keep runs small enough to watch.

Usage: npm run sim -- [options]
  --campaigns <n>    campaigns (plain run) or seeds per cell (experiments) (default 5; more
                     anchors beat more seeds for the same time)
  --max-minutes <n>  time budget; a run projected to take longer stops early (default 5)
  --turns <n>        maximum turns per campaign; a campaign stops early if it ends (default 100)
  --seed <n>         first seed; campaign i uses seed + i (default 1)
  --anchor <id>      anchor country (default: first country in content)
  --genome <spec>    preset id, "random" (a seeded random genome per campaign), or
                     [preset:]axis=option,... overrides (default: the first preset)
  --bot <id>         bot for plain runs, differentiation, pacing, options and benchmark:
                     ${BOT_IDS.join(", ")} (default builder)
  --experiment <list>
                     comma-separated, or "all":
                       differentiation  preset pairs on the same seeds and anchor must share fewer
                                        than half their top-10 countries by population share
                       collapse         anchor collapse rate for every anchor × bot (random
                                        genomes); every anchor must sometimes collapse under the
                                        naive bot named in config, which plays
                                        balanceTargets.naiveBotCollapseSeeds seeds per anchor (or
                                        --campaigns if higher)
                       hard-anchor      wins from the hard anchor, per bot; the best bot must
                                        win some of the time
                       pacing           turns to each PP tier and to the first win against the
                                        GDD budget table
                       options          per-option and per-growth-node outcomes from random
                                        genomes, per anchor (no option or node in more than 40%
                                        of top-quartile runs)
                       rivals           rivals persist: no rival's hardcore fans ever reach zero in
                                        any country or worldwide, for every anchor × bot (random
                                        genomes); reports the lowest rival share seen and where
                       benchmark        a 120-year campaign: time, save size, load time
  --anchors <ids>    anchors for collapse, rivals, pacing and options. Defaults:
                     collapse and rivals, a sample of balanceTargets.experimentAnchors markets
                     spread across the population range; pacing, the same sample drawn from
                     typical-size markets (balanceTargets.pacingAnchorPopulationQuantiles);
                     options, the median-population country of each climate
  --bots <ids>       bots for collapse (default: anchor-turtle,random, plus the naive bot), and
                     for hard-anchor and rivals (default: ${EXPERIMENT_BOTS.join(",")})
  --hard-anchor <id> anchor for hard-anchor (default: config balanceTargets.hardAnchor)
  --presets <ids>    presets for differentiation (default: all)
  --content <dir>    content directory (default: ./content)
  --out <dir>        output directory (default: runs/latest)

Writes summary.json, campaigns.csv, countries.csv, turns.csv (plain runs and differentiation only),
options.csv and nodes.csv (options experiment) and one JSON file per experiment. Every run also
prints the growth tree report: nodes bought, fork choices, PP banked vs spent. Exits with code 1 if any
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
  console.log(
    "  With rule amendments (reported, not judged): mean shared top-10 by population share",
  );
  for (const pair of report.amended)
    console.log(`    ${pair.a} vs ${pair.b}: ${pair.meanShared.toFixed(2)}`);
}

function printCollapse(report: CollapseReport): void {
  console.log(
    `\nCollapse: ${report.seeds.length} seed(s) per anchor × bot (${report.naiveSeeds.length} for the naive bot, ${report.naiveBot}), random genomes, up to ${report.turns} turns`,
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
  const naive = report.cells.filter((cell) => cell.bot === report.naiveBot);
  const early = naive.reduce((sum, cell) => sum + cell.earlyCollapses, 0);
  const total = naive.reduce((sum, cell) => sum + cell.campaigns, 0);
  console.log(
    `  Collapses by turn ${report.earlyCollapseTurn} under ${report.naiveBot}: ${early}/${total} campaigns; all bots: ${report.cells.reduce((sum, cell) => sum + cell.earlyCollapses, 0)}/${report.cells.reduce((sum, cell) => sum + cell.campaigns, 0)}`,
  );
  const smallest = [...new Set(report.cells.map((cell) => cell.anchor))]
    .map((anchor) => ({ anchor, population: report.populations[anchor] ?? 0 }))
    .sort((a, b) => a.population - b.population)
    .slice(0, 4);
  console.log("  Collapse turns, four smallest anchors:");
  for (const { anchor } of smallest) {
    for (const cell of report.cells.filter((c) => c.anchor === anchor)) {
      console.log(
        `    ${anchor.padEnd(14)} ${cell.bot.padEnd(14)} ${cell.collapses}/${cell.campaigns}; turns [${cell.collapseTurns.join(", ")}]; median ${cell.medianCollapseTurn ?? "-"}`,
      );
    }
  }
  const safe = report.safeAnchorsUnderNaiveBot;
  console.log(
    `  No safe anchor: ${report.passed ? "PASSED" : "FAILED"}${safe.length > 0 ? ` (never collapsed under ${report.naiveBot}: ${safe.join(", ")})` : ""}`,
  );
}

function printHardAnchor(report: HardAnchorReport): void {
  console.log(
    `\nHard anchor ${report.anchor}: ${report.seeds.length} seed(s) per bot, random genomes, up to ${report.turns} turns`,
  );
  for (const bot of report.bots) {
    console.log(
      `  ${bot.bot.padEnd(14)} won ${bot.wins}/${bot.campaigns} (median win turn ${fmt(bot.medianWinTurn)}); reached #1 in ${bot.reachedFirst}; final ranks ${JSON.stringify(bot.finalRanks)}; collapsed ${bot.collapses}/${bot.campaigns}; median turns played ${fmt(bot.medianTurnsSurvived)}; peak tiers ${JSON.stringify(bot.peakTiers)}`,
    );
  }
  console.log(
    `  Hard anchors are winnable: ${report.passed ? `PASSED (best bot ${report.bestBot})` : "FAILED (no bot won)"}`,
  );
}

function printPacing(report: PacingReport): void {
  console.log(
    `\nPacing: anchors ${report.anchors.join(", ")}, bot ${report.bot}, ${report.seeds.length} seed(s) each, up to ${report.turns} turns, tolerance ±${pct(report.tolerance)}`,
  );
  for (const tier of report.tiers) {
    console.log(
      `  ${passFail(tier.withinTolerance)} ${tier.tier === "win" ? "first win" : `tier ${tier.tier}`}: target turn ${tier.targetTurn} (allowed ${tier.allowedRange[0]}–${tier.allowedRange[1]}); median ${fmt(tier.medianTurn)}; reached ${tier.reached}/${tier.of}`,
    );
  }
  console.log(`  Pacing criterion: ${report.passed ? "PASSED" : "FAILED"}`);
}

function printOptions(report: OptionsReport): void {
  console.log(
    `\nOptions: ${report.seeds.length} random genome(s) per anchor, bot ${report.bot}, up to ${report.turns} turns. Limit: an option fails when its top-quartile share is above ${pct(report.dominanceLimit)} beyond sampling noise (lower bound at z ${report.dominanceZ})`,
  );
  for (const entry of report.byAnchor) {
    const above = entry.aboveLimit.length === 0 ? "none" : entry.aboveLimit.join(", ");
    console.log(`  ${entry.anchor.padEnd(14)} above limit: ${above}`);
  }
  const combined =
    report.combined.aboveLimit.length === 0 ? "none" : report.combined.aboveLimit.join(", ");
  console.log(`  ${"all anchors".padEnd(14)} above limit: ${combined}`);
  console.log(
    "  Growth tree nodes owned in more than the limit of top-quartile runs, per strategy. A node fails only when every bot owns it past the limit: otherwise it is that bot's signature, not a dominant node.",
  );
  for (const entry of report.nodes.byBot) {
    const above =
      entry.combined.aboveLimit.length === 0 ? "none" : entry.combined.aboveLimit.join(", ");
    console.log(`    ${entry.bot.padEnd(14)} (${entry.genomesPerAnchor} genomes/anchor) ${above}`);
  }
  console.log(
    `    ${"every bot".padEnd(14)} ${report.nodes.aboveLimitForEveryBot.length === 0 ? "none" : report.nodes.aboveLimitForEveryBot.join(", ")}`,
  );
  const shares = report.nodes.combined.outcomes
    .map(
      (o) =>
        `${o.nodeId} ${o.topQuartileShare === null ? "-" : pct(o.topQuartileShare)} (all ${o.ownedShare === null ? "-" : pct(o.ownedShare)})`,
    )
    .join("; ");
  console.log(
    `    top-quartile ownership, ${report.bot} (all its campaigns in brackets): ${shares}`,
  );
}

function printGrowth(growth: ReturnType<typeof growthAggregate>, campaigns: number): void {
  const d = growth.nodesBoughtPerCampaign;
  console.log(
    `  Growth tree: nodes bought per campaign min ${fmt(d.min)}, median ${fmt(d.median)}, max ${fmt(d.max)}; PP spent on nodes median ${fmt(growth.ppSpentOnNodes.median)}; final PP banked median ${fmt(growth.finalPpBanked.median)}`,
  );
  console.log(
    `  Nodes owned at each tier-up (median, target): ${growth.nodesAtTier
      .map(
        (t) =>
          `tier ${t.tier} ${t.median === null ? "-" : fmt(t.median)} [${t.target[0]}-${t.target[1]}]${t.median === null ? "" : t.within ? "" : " MISS"} (${t.campaigns})`,
      )
      .join("; ")}`,
  );
  console.log(
    `  Forks: ${growth.forks
      .map(
        (fork) =>
          `${fork.forkId} ${Object.entries(fork.choices)
            .map(([choice, n]) => `${choice} ${n}`)
            .join(" / ")}`,
      )
      .join("; ")}`,
  );
  console.log(
    `  Nodes bought (campaigns of ${campaigns}, median turn): ${growth.nodes
      .map((node) => `${node.nodeId} ${node.boughtIn} (t${fmt(node.medianTurnBought)})`)
      .join("; ")}`,
  );
  console.log(
    `  PP banked vs spent on nodes (medians): ${growth.timeline
      .filter((point) => point.campaigns > 0)
      .map(
        (point) =>
          `turn ${point.turn}: banked ${fmt(point.medianBanked)}, spent ${fmt(point.medianSpentOnNodes)} (${point.campaigns})`,
      )
      .join("; ")}`,
  );
}

function printEvents(events: ReturnType<typeof eventAggregate>): void {
  const byCard: Record<string, string[]> = {};
  for (const [key, n] of Object.entries(events.answers)) {
    const [card, choice] = key.split("/");
    const list = byCard[card ?? ""] ?? [];
    list.push(`${choice} ${n}`);
    byCard[card ?? ""] = list;
  }
  console.log(
    `  Event decisions: PP spent on choices median ${fmt(events.ppSpentOnEvents.median)}, max ${fmt(events.ppSpentOnEvents.max)}; ${Object.entries(
      byCard,
    )
      .map(([card, choices]) => `${card} ${choices.join(" / ")}`)
      .join("; ")}`,
  );
}

const lowPoint = (low: RivalLowPoint | null, asShare: boolean) =>
  low === null
    ? "-"
    : `${asShare ? `${(low.value * 100).toFixed(3)}% of the population` : `${(low.value * 100).toFixed(1)}% of its starting hardcore`} (${low.sportId} in ${low.countryId}, turn ${low.turn}; anchor ${low.anchor}, ${low.bot}, seed ${low.seed})`;

function printRivalsPersist(report: RivalsPersistReport): void {
  console.log(
    `\nRivals persist: ${report.anchors.length} anchor(s) × bots ${report.bots.join(", ")} × ${report.seeds.length} seed(s), random genomes, up to ${report.turns} turns (${report.campaigns} campaigns)`,
  );
  console.log(
    `  Lowest rival hardcore share in any country: ${lowPoint(report.lowestShare, true)}`,
  );
  console.log(
    `  Lowest rival hardcore vs its start there: ${lowPoint(report.lowestRetained, false)}`,
  );
  const global = report.lowestGlobalShare;
  console.log(
    `  Lowest rival world hardcore share: ${global === null ? "-" : `${(global.value * 100).toFixed(2)}% (${global.sportId}; anchor ${global.anchor}, ${global.bot}, seed ${global.seed})`}`,
  );
  const worst = [...report.cells]
    .filter((cell) => cell.lowestRetained !== null)
    .sort((a, b) => (a.lowestRetained?.value ?? 1) - (b.lowestRetained?.value ?? 1))
    .slice(0, 5);
  console.log("  Cells where rivals kept the least of their starting base:");
  for (const cell of worst) {
    console.log(`    ${cell.anchor} / ${cell.bot}: ${lowPoint(cell.lowestRetained, false)}`);
  }
  console.log(
    `  Eliminations: ${report.eliminations.length}${
      report.eliminations.length > 0
        ? ` (${report.eliminations
            .slice(0, 10)
            .map((e) => `${e.sportId} in ${e.countryId}, ${e.anchor}/${e.bot}/seed ${e.seed}`)
            .join("; ")})`
        : ""
    }`,
  );
  console.log(`  Rivals persist criterion: ${report.passed ? "PASSED" : "FAILED"}`);
}

function printRivalActivity(agg: ReturnType<typeof aggregate>): void {
  const peak = agg.peakPlayerHardcoreShare;
  const share = (value: number | null) => (value === null ? "-" : pct(value));
  console.log(
    `  Peak player hardcore share of any country (per campaign): min ${share(peak.min)}, p10 ${share(peak.p10)}, median ${share(peak.median)}, p90 ${share(peak.p90)}, max ${share(peak.max)}; above 25% in ${peak.above25Percent}/${agg.campaigns}, above 50% in ${peak.above50Percent}/${agg.campaigns}`,
  );
  const wins = agg.wins;
  console.log(
    `  Wins: ${wins.won}/${agg.campaigns}; win turn median ${fmt(wins.turn.median)} (p10 ${fmt(wins.turn.p10)}, p90 ${fmt(wins.turn.p90)}), in-game years median ${fmt(wins.years.median)}; reached #1 in ${wins.reachedFirst}/${agg.campaigns}, first at turn median ${fmt(wins.firstTopTurn.median)}; longest win hold median ${fmt(wins.longestTopStreak.median)}, max ${fmt(wins.longestTopStreak.max)} turns; #1 lost ${wins.rankOneLosses} time(s), before the win in ${wins.lostBeforeWin}/${wins.reachedFirst} campaigns that reached #1; anchor collapses after a win ${wins.birthplaceOutlived}`,
  );
  const overtake = agg.anchorOvertakeYears;
  console.log(
    `  Years until the player's hardcore fans outnumber every rival's in the anchor: overtook in ${overtake.overtook}/${overtake.of}; median ${overtake.median === null ? "-" : overtake.median.toFixed(1)}, p10 ${overtake.p10 === null ? "-" : overtake.p10.toFixed(1)}, p90 ${overtake.p90 === null ? "-" : overtake.p90.toFixed(1)}`,
  );
  for (const rival of agg.rivals) {
    const m = rival.medianPerCampaign as Record<string, number | null>;
    const n = (key: string) => fmt(m[key] ?? null);
    console.log(
      `  ${rival.sportId} (median per campaign): budget spent ${n("budgetSpent")}; escalations ${n("escalations")}, de-escalations ${n("deescalations")}; countermoves ${n("countermoves")} (reclaim ${n("reclaim")}, media blitz ${n("mediaBlitz")}, youth programs ${n("youthPrograms")}, broadcast deal ${n("broadcastDeal")}, sponsor lockout ${n("sponsorLockout")}, rule copying ${n("ruleCopying")}); anchor hardcore share ${share(m.anchorHardcoreShareStart ?? null)} → ${share(m.anchorHardcoreShareEnd ?? null)}; peak anchor level ${JSON.stringify(rival.peakAnchorLevels)}; campaigns with an elimination ${rival.campaignsWithEliminations}`,
    );
  }
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
    `  ${report.turnsPlayed} turns in ${report.simulateMs.toFixed(0)} ms; ${report.wonTurn === null ? "no win" : `won on turn ${report.wonTurn}`}; save ${(report.saveBytes / 1024).toFixed(0)} KB uncompressed JSON; serialize ${report.serializeMs.toFixed(0)} ms; load ${report.loadMs.toFixed(0)} ms; ${report.landmarks} landmarks; ${report.yearlySnapshots} yearly snapshots`,
  );
}

// ---- Main ----------------------------------------------------------------------------------

function main(): number {
  const { values } = parseArgs({
    options: {
      campaigns: { type: "string", default: "5" },
      "max-minutes": { type: "string", default: "5" },
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
  const maxMinutes = wholeNumber(values["max-minutes"], "max-minutes", 1, 10_000);
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
  const bots = checkBots(listOf(values.bots) ?? ["anchor-turtle", "random"]);
  const configuredHardAnchor = world.config.balanceTargets.hardAnchor;
  const hardAnchor =
    checkAnchors(world, [values["hard-anchor"] ?? configuredHardAnchor])[0] ?? configuredHardAnchor;
  const listedAnchors = listOf(values.anchors);
  // The listed anchors, else the experiment's small default sample. There is deliberately no way to
  // play every market: that is hours of simulation for a result nobody waits for.
  const anchorsOr = (fallback: string[]): string[] => listedAnchors ?? fallback;

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
  let nodesCsv = "";
  const joinCsv = (parts: string[]) =>
    parts.map((csv, i) => (i === 0 ? csv : csv.slice(csv.indexOf("\n") + 1))).join("");

  // Every job states its campaign count up front, so the run can announce its plan and stop early
  // when it would run over its time budget (budget.ts).
  const jobs: { id: string; campaigns: number; run: () => void }[] = [];
  if (experiments.length === 0) {
    const choice = parseGenomeArg(values.genome, world);
    jobs.push({
      id: "plain",
      campaigns: seeds.length,
      run: () => {
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
      },
    });
  }

  for (const experiment of experiments) {
    switch (experiment) {
      case "differentiation": {
        const presets = listOf(values.presets) ?? world.genome.presets.map((p) => p.id);
        jobs.push({
          id: experiment,
          // Played twice: as invented (the criterion), then with rule amendments (reported).
          campaigns: presets.length * seeds.length * 2,
          run: () => {
            const report = runDifferentiation(
              world,
              { anchorCountryId: anchor, seeds, turns, bot, presets },
              collect(true),
            );
            writeReport("differentiation", report);
            printDifferentiation(report);
          },
        });
        break;
      }
      case "collapse": {
        const anchors = checkAnchors(world, anchorsOr(sampledAnchors(world)));
        const naiveCount = Math.max(campaigns, world.config.balanceTargets.naiveBotCollapseSeeds);
        const naiveSeeds = Array.from({ length: naiveCount }, (_, i) => firstSeed + i);
        const otherBots = bots.filter((b) => b !== naiveBotId).length;
        jobs.push({
          id: experiment,
          campaigns: anchors.length * (naiveSeeds.length + otherBots * seeds.length),
          run: () => {
            const report = runCollapse(
              world,
              { anchors, bots, naiveBot: naiveBotId, seeds, naiveSeeds, turns },
              collect(false),
            );
            writeReport("collapse", report);
            printCollapse(report);
          },
        });
        break;
      }
      case "hard-anchor": {
        // "The best bot wins from the hard anchor", so the competent builder bot plays too.
        const hardAnchorBots = checkBots(listOf(values.bots) ?? EXPERIMENT_BOTS);
        jobs.push({
          id: experiment,
          campaigns: hardAnchorBots.length * seeds.length,
          run: () => {
            const report = runHardAnchor(
              world,
              { anchor: hardAnchor, bots: hardAnchorBots, seeds, turns },
              collect(false),
            );
            writeReport("hard-anchor", report);
            printHardAnchor(report);
          },
        });
        break;
      }
      case "pacing": {
        const anchors = checkAnchors(world, anchorsOr(typicalAnchors(world)));
        jobs.push({
          id: experiment,
          campaigns: anchors.length * seeds.length,
          run: () => {
            const report = runPacing(world, { anchors, bot, seeds, turns }, collect(false));
            writeReport("pacing", report);
            printPacing(report);
          },
        });
        break;
      }
      case "options": {
        const anchors = checkAnchors(world, anchorsOr(contrastingAnchors(world)));
        const genomesPerAnchor = Math.max(
          campaigns,
          world.config.balanceTargets.optionsGenomesPerAnchor,
        );
        const optionSeeds = Array.from({ length: genomesPerAnchor }, (_, i) => firstSeed + i);
        const { nodeDominanceBots, nodeDominanceGenomesPerBot } = world.config.balanceTargets;
        const nodeBots = checkBots(nodeDominanceBots);
        const nodeSeeds = Array.from(
          { length: Math.min(nodeDominanceGenomesPerBot, optionSeeds.length) },
          (_, i) => firstSeed + i,
        );
        const extraBots = nodeBots.filter((b) => b !== bot).length;
        jobs.push({
          id: experiment,
          campaigns: anchors.length * (optionSeeds.length + extraBots * nodeSeeds.length),
          run: () => {
            const report = runOptions(
              world,
              { anchors, bot, seeds: optionSeeds, turns, nodeBots, nodeSeeds },
              collect(false),
            );
            writeReport("options", report);
            optionsCsv = report.byAnchor
              .map((entry, i) => {
                const csv = optionOutcomesCsv(entry.anchor, entry.outcomes);
                return i === 0 ? csv : csv.slice(csv.indexOf("\n") + 1);
              })
              .join("");
            nodesCsv = joinCsv(
              report.nodes.byAnchor.map((entry) => nodeOutcomesCsv(entry.anchor, entry.outcomes)),
            );
            printOptions(report);
          },
        });
        break;
      }
      case "rivals": {
        const anchors = checkAnchors(world, anchorsOr(sampledAnchors(world)));
        const rivalBots = checkBots(listOf(values.bots) ?? EXPERIMENT_BOTS);
        jobs.push({
          id: experiment,
          campaigns: anchors.length * rivalBots.length * seeds.length,
          run: () => {
            const report = runRivalsPersist(
              world,
              { anchors, bots: rivalBots, seeds, turns },
              collect(false),
            );
            writeReport("rivals", report);
            printRivalsPersist(report);
          },
        });
        break;
      }
      case "benchmark": {
        // One 120-year campaign played directly (not counted against the plan; seconds long).
        jobs.push({
          id: experiment,
          campaigns: 0,
          run: () => {
            const report = runBenchmark(world, {
              anchor,
              bot,
              firstSeed,
              years: 120,
              maxAttempts: 10,
            });
            writeReport("benchmark", report);
            printBenchmark(report);
          },
        });
        break;
      }
    }
  }

  const budget = new RunBudget(
    jobs.reduce((sum, job) => sum + job.campaigns, 0),
    turns,
    maxMinutes,
  );
  budget.start(jobs.map((job) => `${job.id} ${job.campaigns}`).join(", "));
  onCampaignPlayed((played, ms) => budget.campaignPlayed(played, ms));
  for (const job of jobs) job.run();
  onCampaignPlayed(null);

  const elapsedMs = performance.now() - started;

  const { results, turnRows, countryRows } = collected;
  const tierCount = world.config.ppTiers.length;
  const agg = aggregate(results, tierCount);
  const growth = growthAggregate(
    results,
    world.growthTree,
    world.config.balanceTargets.nodesAtTier,
  );
  const events = eventAggregate(results);
  const flagship = flagshipAggregate(results);
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
    growth,
    events,
    flagship,
    experimentReports: written,
    campaigns: experiments.length === 0 ? results : undefined,
  };
  writeFileSync(join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(outDir, "campaigns.csv"), campaignsCsv(results, tierCount));
  writeFileSync(join(outDir, "countries.csv"), countriesCsv(countryRows));
  if (turnRows.length > 0) writeFileSync(join(outDir, "turns.csv"), turnsCsv(turnRows));
  if (optionsCsv !== "") writeFileSync(join(outDir, "options.csv"), optionsCsv);
  if (nodesCsv !== "") writeFileSync(join(outDir, "nodes.csv"), nodesCsv);

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
  if (results.length > 0) {
    console.log(`  Rival activity and player hardcore across all ${results.length} campaign(s):`);
    printRivalActivity(agg);
    printGrowth(growth, results.length);
    printEvents(events);
    console.log(
      `  Flagship: seasons median ${fmt(flagship.seasons.median)}; different champions median ${fmt(flagship.distinctChampions.median)}; the most successful club's share of titles median ${pct(flagship.mostTitlesShare.median ?? 0)}, max ${pct(flagship.mostTitlesShare.max ?? 0)}`,
    );
    console.log(
      `  Stars: made per campaign median ${fmt(flagship.starsMade.median)}; backed median ${fmt(flagship.starsBacked.median)} (in ${flagship.backedIn}/${results.length} campaigns), first backed at turn median ${fmt(flagship.firstBackTurn.median)}`,
    );
    const [low, high] = world.config.balanceTargets.flagshipBroadcastShare;
    const broadcast = flagship.broadcastShare;
    const inTarget =
      broadcast.median !== null && broadcast.median >= low && broadcast.median <= high;
    console.log(
      flagship.broadcastReaches === 0
        ? `  Broadcast: no campaign's seat was in a large media market; target ${pct(low)}–${pct(high)} not measured`
        : `  Broadcast (${flagship.broadcastReaches}/${results.length} campaigns with a seat in a large media market): share of world media reach exposure median ${pct(broadcast.median ?? 0)} (min ${pct(broadcast.min ?? 0)}, max ${pct(broadcast.max ?? 0)}); target ${pct(low)}–${pct(high)}: ${inTarget ? "met" : "MISSED"}`,
    );
    const deals = dealsAggregate(results, world.config.balanceTargets.dealSlateShare);
    const counts = (record: Record<string, number>) =>
      Object.entries(record)
        .map(([key, n]) => `${key} ${n}`)
        .join(", ") || "none";
    console.log(
      `  Deals: signed per campaign median ${fmt(deals.signedPerCampaign.median)} (${counts(deals.signed)}); demands signed ${counts(deals.demandsSigned)}; breaches ${counts(deals.breaches)}; deal income's share of the flagship's income median ${pct(deals.incomeShare.median ?? 0)}; turns at Near-Collapse median ${pct(deals.nearCollapseShare.median ?? 0)}, max ${pct(deals.nearCollapseShare.max ?? 0)}`,
    );
    const mix = deals.eliteMix;
    const [gLow, gHigh] = world.config.balanceTargets.money.eliteGate;
    const [mLow, mHigh] = world.config.balanceTargets.money.eliteMedia;
    const [cLow, cHigh] = world.config.balanceTargets.money.eliteCommercial;
    const judge = (value: number | null, low: number, high: number) =>
      value === null ? "-" : `${pct(value)} ${value >= low && value <= high ? "met" : "MISSED"}`;
    console.log(
      mix.campaigns === 0
        ? "  Elite seat income at the top tier: no campaign got there"
        : `  Elite seat income at the top tier (${mix.campaigns} campaigns, medians): gate ${judge(mix.gate, gLow, gHigh)} [${pct(gLow)}-${pct(gHigh)}], media ${judge(mix.media, mLow, mHigh)} [${pct(mLow)}-${pct(mHigh)}], sponsors and naming ${judge(mix.commercial, cLow, cHigh)} [${pct(cLow)}-${pct(cHigh)}]; ${fmt((mix.annual ?? 0) * world.config.money.dollarsPerCash)} dollars a year`,
    );
    const clauseLine = Object.entries(deals.clauses)
      .map(
        ([kind, n]) =>
          `${kind} met ${n.met} of ${n.met + n.missed} seasons judged (${pct(n.met / Math.max(1, n.met + n.missed))}), ${n.walked} walked`,
      )
      .join("; ");
    console.log(`  Deal clauses: ${clauseLine || "none signed"}`);
    const venues = venuesAggregate(results);
    console.log(
      `  Venues: gate lost to the cap median ${pct(venues.gateLost.median ?? 0)} (max ${pct(venues.gateLost.max ?? 0)}); level at the offseason by league tier ${venues.levels
        .filter((l) => l.samples > 0)
        .map((l) => `${l.tier} ${fmt(l.level)} (n ${l.samples})`)
        .join(
          ", ",
        )}; levels opened ${venues.opened}, modernized ${venues.modernized}; record crowds ${venues.records}; payroll baseline ${pct(venues.payrollShare.median ?? 0)} and star wages ${pct(venues.wagesShare.median ?? 0)} of the seat's costs (median)`,
    );
    const remembers = remembersAggregate(results);
    console.log(
      `  Remembers: Hall of Fame players per campaign median ${fmt(remembers.players.median)} (max ${fmt(remembers.players.max)}; in ${remembers.withPlayers}/${results.length} campaigns, the first at turn median ${fmt(remembers.firstPlayerTurn)}), moments median ${fmt(remembers.moments.median)}; anchor shrine weight median ${fmt(remembers.anchorShrine.median)}; chants per campaign median ${fmt(remembers.chants.median)}, ${remembers.chantsSpread} spread abroad; Culture nodes bought in ${remembers.boughtCulture}/${results.length} campaigns (median ${fmt(remembers.cultureNodes.median)})`,
    );
    const [slateLow, slateHigh] = world.config.balanceTargets.dealSlateShare;
    console.log(
      `  Deal slate before the PP-tier cap (target ${pct(slateLow)}–${pct(slateHigh)}), median by league tier: ${deals.slates
        .filter((s) => s.samples > 0)
        .map(
          (s) =>
            `${s.tier} ${pct(s.before ?? 0)} ${s.met ? "met" : "MISSED"} (after the cap ${pct(s.after ?? 0)}, n ${s.samples})`,
        )
        .join("; ")}`,
    );
    const rules = rulesAggregate(results);
    console.log(
      `  Rules: amendments per campaign median ${fmt(rules.perCampaign.median)}, max ${fmt(rules.perCampaign.max)} (in ${rules.amendedIn}/${results.length} campaigns), first at turn median ${fmt(rules.firstTurn.median)}; hardcore turned casual per amendment median ${fmt(rules.demoted.median)}, max ${fmt(rules.demoted.max)}; most common ${
        rules.changes
          .slice(0, 5)
          .map(([change, n]) => `${change} ${n}`)
          .join(", ") || "none"
      }`,
    );
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
