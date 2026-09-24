// Documentation-only replay. The renderer consumes snapshots; the simulation is unchanged.
// npx tsx scripts/build-map-example.ts runs/map-example/map-units.geojson
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { loadWorldFromDisk } from "../src/runner/content-from-disk";
import { runBot } from "../src/runner/policy";
import { checkInvariants, createCampaign, endTurn, snapshot } from "../src/sim";

type Position = [number, number];
interface Feature {
  properties: Record<string, string | number>;
  geometry:
    | { type: "Polygon"; coordinates: Position[][] }
    | { type: "MultiPolygon"; coordinates: Position[][][] };
}

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error("Pass the Natural Earth v5.1.2 50m map-units GeoJSON path.");
const source = readFileSync(sourcePath, "utf8");
const { features } = JSON.parse(source) as { features: Feature[] };
const world = loadWorldFromDisk();
const output = resolve("docs/world-map/assets");
mkdirSync(output, { recursive: true });

const slug = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// Explicit sports-market exceptions. Unassigned units remain neutral, including disputed units.
const overrides: Record<string, string[]> = {
  "antigua-and-barbuda": ["ACA", "ACB"],
  belgium: ["BFR", "BWR", "BCR"],
  "bosnia-and-herzegovina": ["BHF", "BIS"],
  "chinese-taipei": ["TWN"],
  "cote-d-ivoire": ["CIV"],
  "dr-congo": ["COD"],
  "republic-of-ireland": ["IRL"],
  "papua-new-guinea": ["PNX", "PNB"],
  portugal: ["PRX", "PMD", "PAZ"],
  serbia: ["SRS", "SRV"],
  tanzania: ["TZA", "TZZ"],
  tahiti: ["PYF"],
  "us-virgin-islands": ["VIR"],
};

// Natural Earth I forward projection. Polynomial from d3-geo, ISC license.
// See docs/world-map/assets/THIRD-PARTY-NOTICES.txt.
function project([longitude, latitude]: Position): Position {
  const lambda = (longitude * Math.PI) / 180;
  const phi = (latitude * Math.PI) / 180;
  const p2 = phi * phi;
  const p4 = p2 * p2;
  const x =
    lambda * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4)));
  const y = phi * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)));
  return [600 + x * 208, 313 - y * 208];
}

function path(rings: Position[][]): string {
  return rings
    .map((ring) => {
      const points = ring.map(project).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`);
      return `M${points.filter((p, i) => i === 0 || p !== points[i - 1]).join("L")}Z`;
    })
    .join("");
}

const claimed = new Map<string, string>();
const mapping = world.countries.map((country) => {
  const explicit = overrides[country.id];
  const matches = features.filter((feature) => {
    const p = feature.properties;
    return explicit
      ? explicit.includes(String(p.GU_A3))
      : [p.NAME, p.NAME_LONG, p.GEOUNIT, p.NAME_EN].some(
          (name) => typeof name === "string" && slug(name) === country.id,
        );
  });
  for (const feature of matches) {
    const code = String(feature.properties.GU_A3);
    if (claimed.has(code)) throw new Error(`Geometry ${code} assigned to two markets`);
    claimed.set(code, country.id);
  }
  return {
    market: country.id,
    units: matches.map((f) => f.properties.GU_A3),
    // Absent from the 50m layer. Explicit point fallback, never a fabricated boundary.
    point: country.id === "gibraltar" ? [-5.35, 36.13333] : undefined,
  };
});
const missing = mapping.filter((entry) => entry.units.length === 0 && !entry.point);
if (missing.length)
  throw new Error(`Unmapped markets: ${missing.map((entry) => entry.market).join(", ")}`);

const shapes = features.map((feature) => {
  const p = feature.properties;
  const polygons =
    feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
  const center = project([Number(p.LABEL_X), Number(p.LABEL_Y)]);
  const bounds = polygons.flatMap((polygon) => polygon[0]?.map(project) ?? []);
  const xs = bounds.map(([x]) => x);
  const ys = bounds.map(([, y]) => y);
  return {
    unit: p.GU_A3,
    market: claimed.get(String(p.GU_A3)) ?? null,
    name: p.NAME_LONG,
    path: polygons.map(path).join(""),
    center: center.map((v) => Math.round(v * 10) / 10),
    small: (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)) < 65,
  };
});
shapes.push({
  unit: "GIB-point",
  market: "gibraltar",
  name: "Gibraltar",
  path: "",
  center: project([-5.35, 36.13333]),
  small: true,
});

const graticule: string[] = [];
for (let lon = -180; lon <= 180; lon += 30) {
  const points: Position[] = [];
  for (let lat = -60; lat <= 85; lat += 2) points.push([lon, lat]);
  graticule.push(path([points]).slice(0, -1));
}
for (let lat = -60; lat <= 60; lat += 30) {
  const points: Position[] = [];
  for (let lon = -180; lon <= 180; lon += 2) points.push([lon, lat]);
  graticule.push(path([points]).slice(0, -1));
}

const preset = world.genome.presets.find((entry) => entry.id === "backyard-kickball");
if (!preset) throw new Error("Missing backyard-kickball preset");
const campaigns = ["senegal", "tuvalu"].map((anchorCountryId) => {
  let state = createCampaign(world, { seed: 22, anchorCountryId, genome: preset.genome });
  const frames = [];
  for (let index = 0; index <= 100; index += 1) {
    const violations = checkInvariants(state, world);
    if (violations.length) throw new Error(JSON.stringify(violations));
    const current = snapshot(state, world);
    frames.push({
      turn: current.turn,
      year: current.year,
      quarterOfYear: current.quarterOfYear,
      pp: Math.round(current.pp),
      ppTier: current.ppTier,
      outcome: current.outcome,
      countries: current.countries.map((country) => ({
        countryId: country.countryId,
        casual: country.casual,
        hardcore: country.hardcore,
        share: country.share,
        focused: country.focused,
        exposure: country.exposure,
        league: country.league,
        rivals: country.rivals,
      })),
    });
    if (state.outcome !== null || index === 100) break;
    state = endTurn(runBot("builder", state, world).state, world);
  }
  const last = frames.at(-1);
  console.log(
    `${anchorCountryId}: ${frames.length} frames, final year ${last?.year}, peak share ${Math.max(...(last?.countries.map((c) => c.share) ?? []))}`,
  );
  return { anchorCountryId, seed: 22, preset: preset.id, bot: "builder", frames };
});

const data = {
  source: "Natural Earth v5.1.2 / 50m admin-0 map units",
  sourceSha256: createHash("sha256").update(source).digest("hex"),
  names: world.names,
  countries: world.countries.map(({ id, population, continent }) => ({
    id,
    population,
    continent,
  })),
  shapes,
  graticule,
  campaigns,
};
// Keep exact snapshot numbers while avoiding megabytes of repeated JSON keys in the docs.
// Four local scripts also work when the HTML is opened directly through file://.
const packed = gzipSync(JSON.stringify(data), { level: 9 }).toString("base64");
const chunkSize = Math.ceil(packed.length / 4);
for (let index = 0; index < 4; index += 1) {
  const chunk = packed.slice(index * chunkSize, (index + 1) * chunkSize);
  writeFileSync(
    `${output}/data-${index + 1}.js`,
    `// Generated gzip/base64 replay data. Rebuild with scripts/build-map-example.ts.\n${index === 0 ? "globalThis.MAP_EXAMPLE_CHUNKS = [];\n" : ""}// biome-ignore format: generated artifact\nglobalThis.MAP_EXAMPLE_CHUNKS.push("${chunk}");\n`,
  );
}
writeFileSync(
  `${output}/market-units.json`,
  `${JSON.stringify(
    {
      source: data.source,
      sourceSha256: data.sourceSha256,
      markets: mapping,
      neutral: shapes.filter((shape) => !shape.market).map(({ unit, name }) => ({ unit, name })),
    },
    null,
    2,
  )}\n`,
);
console.log(`Wrote ${shapes.length} shapes, ${mapping.length} mapped markets, ${output}`);
