// Offline build: npm run map:build -- runs/map-example/map-units.geojson
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { type GeoStream, geoArea, geoGraticule10, geoNaturalEarth1, geoStream } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import { parse } from "yaml";
import {
  loadMapSettings,
  type MapGeometry,
  type MapPolygon,
  mapAssignmentsSchema,
  mapGeometrySchema,
} from "../src/content/map";
import { loadWorldFromDisk } from "../src/runner/content-from-disk";

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error("Pass the pinned Natural Earth v5.1.2 map-units GeoJSON path.");
const assignments = mapAssignmentsSchema.parse(
  parse(readFileSync("content/map-markets.yaml", "utf8")),
);
const settings = loadMapSettings(readFileSync("content/map.yaml", "utf8"));
const source = readFileSync(sourcePath, "utf8");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
if (hash(source) !== assignments.source.sha256)
  throw new Error("Natural Earth source checksum mismatch.");
const original = JSON.parse(source) as FeatureCollection;
const world = loadWorldFromDisk();
const marketIds = new Set(world.countries.map((country) => country.id));
const owners = new Map<string, string | null>();
const mappedMarkets = new Set<string>();
for (const entry of assignments.markets) {
  if (!marketIds.has(entry.market) || mappedMarkets.has(entry.market))
    throw new Error(`Unknown or duplicate market ${entry.market}`);
  mappedMarkets.add(entry.market);
  if (entry.units.length === 0 && !entry.point)
    throw new Error(`Missing geometry: ${entry.market}`);
  for (const unit of entry.units) {
    if (owners.has(unit)) throw new Error(`Duplicate unit assignment: ${unit}`);
    owners.set(unit, entry.market);
  }
}
if (mappedMarkets.size !== marketIds.size)
  throw new Error("Market assignment table is incomplete.");
for (const { unit } of assignments.neutral) {
  if (owners.has(unit)) throw new Error(`Neutral unit also claimed: ${unit}`);
  owners.set(unit, null);
}
const sourceUnits = new Set(original.features.map((feature) => String(feature.properties?.GU_A3)));
if (
  sourceUnits.size !== original.features.length ||
  sourceUnits.size !== owners.size ||
  [...sourceUnits].some((unit) => !owners.has(unit))
)
  throw new Error("Source units and assignment table differ.");

// This JS-only release is pinned; mapshaper simplifies shared arcs before projection.
const mapshaper = createRequire(import.meta.url)("mapshaper") as {
  applyCommands: (
    command: string,
    input: Record<string, string>,
    callback: (error: Error | null, output: Record<string, string>) => void,
  ) => void;
};
const simplified = await new Promise<FeatureCollection>((done, reject) => {
  mapshaper.applyCommands(
    `-i source.json -simplify ${settings.geometry.simplifyPercent}% weighted keep-shapes -o simplified.json format=geojson`,
    { "source.json": source },
    (error, output) => {
      if (error) reject(error);
      else done(JSON.parse(output["simplified.json"] ?? "") as FeatureCollection);
    },
  );
});
const projection = geoNaturalEarth1()
  .scale(settings.geometry.scale)
  .translate(settings.geometry.translate)
  .precision(settings.geometry.precision);
const round = (value: number) => Number(value.toFixed(settings.geometry.decimals));
function projectLines(geometry: Geometry): number[][] {
  const lines: number[][] = [];
  let line: number[] = [];
  const sink: GeoStream = {
    point(x, y) {
      line.push(round(x), round(y));
    },
    lineStart() {
      line = [];
    },
    lineEnd() {
      if (line.length >= 4) lines.push(line);
    },
    polygonStart() {},
    polygonEnd() {},
    sphere() {},
  };
  geoStream(geometry, projection.stream(sink));
  return lines;
}
function area(ring: number[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 2) {
    const next = (i + 2) % ring.length;
    sum += (ring[i] ?? 0) * (ring[next + 1] ?? 0) - (ring[next] ?? 0) * (ring[i + 1] ?? 0);
  }
  return Math.abs(sum / 2);
}
function inside(ring: number[], x: number, y: number): boolean {
  let result = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i] ?? 0,
      yi = ring[i + 1] ?? 0,
      xj = ring[j] ?? 0,
      yj = ring[j + 1] ?? 0;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) result = !result;
  }
  return result;
}
function polygons(geometry: Geometry): MapPolygon[] {
  // RFC 7946 and d3's spherical stream use opposite ring winding.
  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
    const groups = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    for (const rings of groups)
      for (const [index, ring] of rings.entries()) {
        const coversMajority = geoArea({ type: "Polygon", coordinates: [ring] }) > 2 * Math.PI;
        if ((index === 0 && coversMajority) || (index > 0 && !coversMajority)) ring.reverse();
      }
  }
  const rings = projectLines(geometry)
    .filter((ring) => ring.length >= 6 && area(ring) > 0)
    .sort((a, b) => area(b) - area(a));
  const result: MapPolygon[] = [];
  const nested: { ring: number[]; depth: number; polygon: MapPolygon }[] = [];
  for (const ring of rings) {
    const parent = [...nested]
      .reverse()
      .find((entry) => inside(entry.ring, ring[0] ?? 0, ring[1] ?? 0));
    const depth = parent ? parent.depth + 1 : 0;
    const polygon = depth % 2 === 1 && parent ? parent.polygon : { outer: ring, holes: [] };
    if (depth % 2 === 1) polygon.holes.push(ring);
    else result.push(polygon);
    nested.push({ ring, depth, polygon });
  }
  return result;
}
function bounds(rings: number[][]): [number, number, number, number] {
  const xs = rings.flatMap((ring) => ring.filter((_, i) => i % 2 === 0));
  const ys = rings.flatMap((ring) => ring.filter((_, i) => i % 2 === 1));
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
const shapes: MapGeometry["shapes"] = simplified.features
  .filter((feature) => feature.properties?.GU_A3 !== "ATA")
  .map((feature) => {
    const unit = String(feature.properties?.GU_A3);
    const parts = polygons(feature.geometry);
    if (!parts.length) throw new Error(`Simplification removed ${unit}`);
    return {
      unit,
      market: owners.get(unit) ?? null,
      polygons: parts,
      bounds: bounds(parts.map((polygon) => polygon.outer)),
    };
  });
const markets: MapGeometry["markets"] = {};
for (const entry of assignments.markets) {
  const parts = shapes.filter((shape) => shape.market === entry.market);
  if (parts.length !== entry.units.length) throw new Error(`Incomplete output: ${entry.market}`);
  const largest = [...parts].sort(
    (a, b) =>
      b.polygons.reduce((sum, p) => sum + area(p.outer), 0) -
      a.polygons.reduce((sum, p) => sum + area(p.outer), 0),
  )[0];
  const label = original.features.find(
    (feature) => feature.properties?.GU_A3 === largest?.unit,
  )?.properties;
  const center = projection(entry.point ?? [Number(label?.LABEL_X), Number(label?.LABEL_Y)])?.map(
    round,
  ) as [number, number] | undefined;
  if (!center?.every(Number.isFinite)) throw new Error(`Invalid label point: ${entry.market}`);
  markets[entry.market] = {
    units: entry.units,
    center,
    bounds: entry.point
      ? [...center, ...center]
      : bounds(parts.flatMap((part) => part.polygons.map((p) => p.outer))),
    point: !!entry.point,
    continent: world.countries.find((country) => country.id === entry.market)?.continent ?? "",
  };
}
const geometry = mapGeometrySchema.parse({
  version: 1,
  sourceSha256: assignments.source.sha256,
  width: settings.geometry.width,
  height: settings.geometry.height,
  shapes,
  markets,
  graticule: projectLines(geoGraticule10()),
});
const json = `${JSON.stringify(geometry)}\n`;
if (Buffer.byteLength(json) > settings.geometry.maxBytes)
  throw new Error(`Geometry exceeds ${settings.geometry.maxBytes} byte budget.`);
const output = resolve("assets/map");
mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, "world.json"), json);
writeFileSync(
  resolve(output, "coverage.json"),
  `${JSON.stringify({ source: assignments.source, geometrySha256: hash(json), generator: { mapshaper: "0.5.94", projection: "d3-geo 3.1.1 / Natural Earth I", settings: settings.geometry }, markets: assignments.markets, neutral: assignments.neutral, omitted: [{ unit: "ATA", reason: "Antarctica is outside the playable world viewport; no sport market is assigned." }], bytes: Buffer.byteLength(json) }, null, 2)}\n`,
);
console.log(
  `Built ${shapes.length} units, ${Object.keys(markets).length} markets, ${Buffer.byteLength(json)} bytes.`,
);
