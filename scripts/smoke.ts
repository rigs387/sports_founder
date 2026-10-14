import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { loadWorldFromDisk } from "../src/runner/content-from-disk";
import { runBot } from "../src/runner/policy";
import { createCampaign, endTurn, serializeSave } from "../src/sim";

// Launches the built app with the smoke hook enabled (src/main/smoke.ts).
// Usage: npm run smoke [-- <output dir>]   (default: runs/smoke)

const outDir = resolve(process.argv[2] ?? "runs/smoke");

// The smoke campaign is young: it never wins, and never promotes a league abroad. The late game
// (retiring and the retrospective, GDD v1.38) is checked on a campaign a bot has played for
// LATE_GAME.turns turns, saved here and loaded through the real Load path (a few seconds).
const LATE_GAME = { seed: 4, anchorCountryId: "nigeria", turns: 200 } as const;
{
  const world = loadWorldFromDisk();
  const genome = world.genome.presets[0]?.genome;
  if (!genome) throw new Error("Content has no genome preset");
  let state = createCampaign(world, { ...LATE_GAME, genome });
  for (let turn = 0; turn < LATE_GAME.turns && state.outcome === null; turn += 1)
    state = endTurn(runBot("builder", state, world).state, world);
  if (state.win.won === null) throw new Error("The late-game smoke campaign did not win");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "late-game.sfsave"), serializeSave(state));
}
const electronPath = createRequire(import.meta.url)("electron") as string;
const env: NodeJS.ProcessEnv = { ...process.env, SF_SMOKE_OUT: outDir };
delete env.ELECTRON_RUN_AS_NODE;

const result = spawnSync(electronPath, ["."], {
  stdio: "inherit",
  windowsHide: true,
  env,
});
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
console.log(result.status === 0 ? `Smoke test passed. Output: ${outDir}` : "Smoke test FAILED.");
process.exit(result.status ?? 1);
