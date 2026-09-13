import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { ContentValidationError } from "../content";
import { anchorGenomeHints, MAX_SEED } from "../sim";
import { type CampaignPlan, type PlayedCampaign, playCampaign } from "./campaign";
import { DEFAULT_CONTENT_DIR, loadWorldFromDisk } from "./content-from-disk";
import {
  type DifferentiationReport,
  RANKINGS,
  runDifferentiation,
  SHARED_LIMIT,
} from "./experiment";
import { formatGenome, parseGenomeArg, randomGenome } from "./genome-arg";
import { POLICY_IDS, type PolicyId } from "./policy";
import {
  aggregate,
  type CampaignResult,
  type CountryRow,
  campaignsCsv,
  countriesCsv,
  DOMINANCE_LIMIT,
  optionOutcomes,
  optionOutcomesCsv,
  type TurnRow,
  turnsCsv,
} from "./report";

const HELP = `Headless runner: plays seeded campaigns with no UI and writes a summary.

Usage: npm run sim -- [options]
  --campaigns <n>   number of campaigns (default 20)
  --turns <n>       turns per campaign (default 100)
  --seed <n>        seed of the first campaign; campaign i uses seed + i (default 1)
  --anchor <id>     anchor country id (default: first country in content)
  --genome <spec>   preset id, "random" (a seeded random genome per campaign), or
                    [preset:]axis=option,... overrides (default: the first preset)
  --policy <id>     focus policy: ${POLICY_IDS.join(", ")} (default greedy-spread)
  --experiment differentiation
                    run contrasting genome presets on the same seeds and anchor and report how
                    many top-10 fandom countries each pair shares (target: fewer than half),
                    plus per-option outcomes from --campaigns random-genome campaigns
  --presets <ids>   comma-separated preset ids for the experiment (default: all presets)
  --content <dir>   content directory (default: ./content)
  --out <dir>       output directory (default: runs/latest)

Writes summary.json, campaigns.csv, turns.csv, countries.csv (final per-country standing with
affinity levers), options.csv (per-option outcomes) and, for the experiment, differentiation.json.
Exits with code 1 if any campaign produced an invalid state.`;

function wholeNumber(value: string, name: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`--${name} must be a whole number from ${min} to ${max} (got "${value}")`);
  }
  return parsed;
}

const fmt = (value: number | null) =>
  value === null ? "-" : Math.round(value).toLocaleString("en-US");

interface Collected {
  results: CampaignResult[];
  turnRows: TurnRow[];
  countryRows: CountryRow[];
}

function collect(into: Collected, played: PlayedCampaign): void {
  into.results.push(played.result);
  into.turnRows.push(...played.turnRows);
  into.countryRows.push(...played.countryRows);
}

function printDifferentiation(report: DifferentiationReport): void {
  console.log(
    `Differentiation: anchor "${report.anchorCountryId}", ${report.seeds.length} seed(s), ${report.turns} turns, presets ${report.presets.join(", ")}`,
  );
  for (const outcome of report.outcomes) {
    console.log(
      `  ${outcome.preset.padEnd(18)} final Fandom Score by seed [${outcome.fandomScoreBySeed.map((n) => fmt(n)).join(", ")}]; countries with fans [${outcome.countriesWithFansBySeed.join(", ")}]`,
    );
  }
  for (const ranking of RANKINGS) {
    const label =
      ranking === "byScore" ? "top-10 by raw Fandom Score" : "top-10 by share of population";
    console.log(`  Ranking: ${label} (target: mean shared < ${SHARED_LIMIT})`);
    for (const pair of report.pairs) {
      const c = pair[ranking];
      console.log(
        `    ${c.passed ? "PASS" : "FAIL"} ${pair.a} vs ${pair.b}: mean shared ${c.meanShared.toFixed(2)}; by seed [${c.sharedBySeed.join(", ")}]; ${c.seedsAtOrAboveHalf}/${c.sharedBySeed.length} seed(s) at or above half`,
      );
      console.log(
        `         usually only in ${pair.a}: ${c.distinctiveA.join(", ") || "-"} | only in ${pair.b}: ${c.distinctiveB.join(", ") || "-"}`,
      );
    }
    console.log(
      `    ${report.pairsPassed[ranking]} pair(s) passed, ${report.pairsFailed[ranking]} failed`,
    );
  }
  console.log(
    `  ${report.passed ? "PASSED" : "FAILED"} by raw Fandom Score (the criterion as written); ${report.passedByShare ? "PASSED" : "FAILED"} by share of population`,
  );
}

function printOptionOutcomes(collected: Collected): void {
  const outcomes = optionOutcomes(collected.results);
  const dominant = outcomes.filter((o) => o.exceedsDominanceLimit);
  console.log(
    `Per-option outcomes over ${collected.results.length} random-genome campaign(s) (dominance limit: ${DOMINANCE_LIMIT * 100}% of top-quartile runs):`,
  );
  let axis = "";
  for (const o of outcomes) {
    if (o.axis !== axis) {
      axis = o.axis;
      console.log(`  ${axis}`);
    }
    console.log(
      `    ${o.option.padEnd(16)} n=${String(o.campaigns).padStart(3)}  median score ${fmt(o.medianFandomScore).padStart(12)}  top-quartile share ${o.topQuartileShare === null ? "-" : (o.topQuartileShare * 100).toFixed(0).padStart(3)}%${o.exceedsDominanceLimit ? "  <-- above limit" : ""}`,
    );
  }
  console.log(
    dominant.length === 0
      ? "  No option exceeds the dominance limit."
      : `  ${dominant.length} option(s) exceed the dominance limit: ${dominant.map((o) => `${o.axis}=${o.option}`).join(", ")}`,
  );
}

function main(): number {
  const { values } = parseArgs({
    options: {
      campaigns: { type: "string", default: "20" },
      turns: { type: "string", default: "100" },
      seed: { type: "string", default: "1" },
      anchor: { type: "string" },
      genome: { type: "string" },
      policy: { type: "string", default: "greedy-spread" },
      experiment: { type: "string" },
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
  const anchorCountryId = values.anchor ?? world.countries[0]?.id ?? "";
  if (!world.countries.some((country) => country.id === anchorCountryId)) {
    throw new Error(`Unknown anchor country "${anchorCountryId}"`);
  }
  if (!POLICY_IDS.includes(values.policy as PolicyId)) {
    throw new Error(`--policy must be one of ${POLICY_IDS.join(", ")}`);
  }
  const policy = values.policy as PolicyId;
  if (values.experiment !== undefined && values.experiment !== "differentiation") {
    throw new Error(`Unknown experiment "${values.experiment}" (available: differentiation)`);
  }
  const genomeChoice = parseGenomeArg(values.genome, world);
  const tierCount = world.config.ppTiers.length;
  const seeds = Array.from({ length: campaigns }, (_, i) => firstSeed + i);

  const outDir = resolve(values.out);
  mkdirSync(outDir, { recursive: true });
  const started = performance.now();
  const collected: Collected = { results: [], turnRows: [], countryRows: [] };
  let differentiation: DifferentiationReport | null = null;

  if (values.experiment === "differentiation") {
    const presets = values.presets
      ? values.presets.split(",")
      : world.genome.presets.map((preset) => preset.id);
    differentiation = runDifferentiation(
      world,
      { anchorCountryId, seeds, turns, policy, presets },
      (played) => collect(collected, played),
    );
    writeFileSync(
      join(outDir, "differentiation.json"),
      `${JSON.stringify(differentiation, null, 2)}\n`,
    );
    // Random genomes for the per-option summaries, same seeds.
    for (const seed of seeds) {
      const genome = randomGenome(seed);
      collect(
        collected,
        playCampaign(world, {
          seed,
          anchorCountryId,
          genome,
          genomeLabel: `random:${formatGenome(genome)}`,
          policy,
          turns,
        }),
      );
    }
  } else {
    for (const seed of seeds) {
      const genome = genomeChoice.kind === "random" ? randomGenome(seed) : genomeChoice.genome;
      const plan: CampaignPlan = {
        seed,
        anchorCountryId,
        genome,
        genomeLabel:
          genomeChoice.kind === "random"
            ? `random:${formatGenome(genome)}`
            : (values.genome ?? world.genome.presets[0]?.id ?? "default"),
        policy,
        turns,
      };
      collect(collected, playCampaign(world, plan));
    }
  }
  const elapsedMs = performance.now() - started;

  const { results, turnRows, countryRows } = collected;
  const randomResults = results.filter((r) => r.genomeLabel.startsWith("random:"));
  const outcomes = optionOutcomes(randomResults.length > 0 ? randomResults : results);
  const summary = {
    settings: {
      campaigns,
      turns,
      firstSeed,
      anchorCountryId,
      genome: values.genome ?? world.genome.presets[0]?.id,
      policy,
      experiment: values.experiment ?? null,
      contentDir: resolve(values.content),
      elapsedMs: Math.round(elapsedMs),
    },
    anchorGenomeHints: anchorGenomeHints(world, anchorCountryId),
    aggregate: aggregate(results, tierCount),
    differentiation,
    optionOutcomes: outcomes,
    campaigns: results,
  };
  writeFileSync(join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(outDir, "campaigns.csv"), campaignsCsv(results, tierCount));
  writeFileSync(join(outDir, "turns.csv"), turnsCsv(turnRows));
  writeFileSync(join(outDir, "countries.csv"), countriesCsv(countryRows));
  writeFileSync(join(outDir, "options.csv"), optionOutcomesCsv(outcomes));

  const agg = summary.aggregate;
  console.log(
    `Played ${results.length} campaign(s) × ${turns} turns from "${anchorCountryId}" with policy ${policy}`,
  );
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
  console.log(
    `  countries with fans (median): ${agg.countriesWithFans.median ?? "-"} of ${world.countries.length}; focus actions (median): ${agg.focusActions.median ?? "-"}`,
  );
  console.log(`  invalid campaigns: ${agg.campaignsWithInvariantViolations}`);
  if (differentiation) printDifferentiation(differentiation);
  if (randomResults.length > 0) {
    printOptionOutcomes({ results: randomResults, turnRows: [], countryRows: [] });
  }
  console.log(
    `Wrote ${join(outDir, "summary.json")}, campaigns.csv, turns.csv, countries.csv, options.csv`,
  );

  if (agg.campaignsWithInvariantViolations > 0) {
    for (const result of results.filter((r) => r.invariantViolations.length > 0)) {
      console.error(`  seed ${result.seed}: ${result.invariantViolations.slice(0, 5).join("; ")}`);
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
