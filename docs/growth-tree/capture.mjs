import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const result = spawnSync(
  createRequire(import.meta.url)("electron"),
  [fileURLToPath(new URL("capture.cjs", import.meta.url))],
  { env, windowsHide: true, stdio: "inherit" },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
