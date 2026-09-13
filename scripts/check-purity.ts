import { fileURLToPath } from "node:url";
import { checkPurity, pureZones } from "./purity";

const root = fileURLToPath(new URL("..", import.meta.url));
const zones = pureZones(root);
const violations = checkPurity(zones, root);

if (violations.length > 0) {
  console.error(`Purity check FAILED (${violations.length} violation(s)):`);
  for (const v of violations) console.error(`  ${v.file}:${v.line}  ${v.message}`);
  process.exit(1);
}
console.log(`Purity check passed: ${zones.map((zone) => zone.name).join(", ")}.`);
