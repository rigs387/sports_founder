import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";

// Launches the built app with the smoke hook enabled (src/main/smoke.ts).
// Usage: npm run smoke [-- <output dir>]   (default: runs/smoke)

const outDir = resolve(process.argv[2] ?? "runs/smoke");
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
