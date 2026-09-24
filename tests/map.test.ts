import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { geoNaturalEarth1 } from "d3-geo";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import coverage from "../assets/map/coverage.json";
import { loadMapSettings, mapAssignmentsSchema, mapGeometrySchema } from "../src/content/map";
import { insideRing, pickMarket } from "../src/renderer/src/map/hit-test";
import { recordHistory } from "../src/renderer/src/state/history";
import { createCampaign, endTurn, snapshot } from "../src/sim";
import { setupFor, world } from "./helpers";

const text = readFileSync("assets/map/world.json", "utf8");
const geometry = mapGeometrySchema.parse(JSON.parse(text));
const settings = loadMapSettings(readFileSync("content/map.yaml", "utf8"));
const assignments = mapAssignmentsSchema.parse(
  parse(readFileSync("content/map-markets.yaml", "utf8")),
);

describe("committed map geometry", () => {
  it("covers exactly the real markets, with 212 polygon markets and one explicit point", () => {
    expect(Object.keys(geometry.markets).sort()).toEqual(
      world.countries.map((country) => country.id).sort(),
    );
    expect(Object.values(geometry.markets).filter((market) => !market.point)).toHaveLength(212);
    expect(
      Object.entries(geometry.markets)
        .filter(([, market]) => market.point)
        .map(([id]) => id),
    ).toEqual(["gibraltar"]);
    expect(assignments.markets.find((market) => market.market === "gibraltar")?.point).toEqual([
      -5.35, 36.13333,
    ]);
    for (const [id, market] of Object.entries(geometry.markets))
      expect(
        geometry.shapes
          .filter((shape) => shape.market === id)
          .map((shape) => shape.unit)
          .sort(),
      ).toEqual([...market.units].sort());
  });
  it("retains separate home nations and explicitly accounts for every neutral unit", () => {
    for (const id of ["england", "scotland", "wales", "northern-ireland"])
      expect(geometry.markets[id]?.units).toHaveLength(1);
    const rendered = geometry.shapes.map((shape) => shape.unit);
    expect(new Set(rendered).size).toBe(rendered.length);
    expect(
      geometry.shapes
        .filter((shape) => !shape.market)
        .map((shape) => shape.unit)
        .sort(),
    ).toEqual(
      assignments.neutral
        .filter((entry) => entry.unit !== "ATA")
        .map((entry) => entry.unit)
        .sort(),
    );
    expect(coverage.omitted).toEqual([
      {
        unit: "ATA",
        reason: "Antarctica is outside the playable world viewport; no sport market is assigned.",
      },
    ]);
  });
  it("matches its checksum and byte budget", () => {
    for (const id of settings.labels) expect(geometry.markets[id]).toBeDefined();
    expect(createHash("sha256").update(text).digest("hex")).toBe(coverage.geometrySha256);
    expect(geometry.sourceSha256).toBe(assignments.source.sha256);
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(settings.geometry.maxBytes);
  });
  it("does not turn a country's exterior into the ocean when projecting GeoJSON", () => {
    const albania = geometry.markets.albania;
    expect(albania).toBeDefined();
    expect((albania?.bounds[2] ?? 0) - (albania?.bounds[0] ?? 0)).toBeLessThan(20);
    // Open Atlantic ocean must remain unclaimed, despite every country being rendered.
    const atlantic = geoNaturalEarth1()
      .scale(settings.geometry.scale)
      .translate(settings.geometry.translate)([-35, 20]);
    if (!atlantic) throw new Error("Projection failed");
    expect(pickMarket(geometry, ...atlantic, 1, 24, 90)).toBeNull();
    expect(
      geometry.shapes.every((shape) =>
        shape.polygons.every((polygon) => polygon.outer.every(Number.isFinite)),
      ),
    ).toBe(true);
  });
  it("preserves Lesotho's hole inside South Africa for rendering and selection", () => {
    const center = geometry.markets.lesotho?.center;
    if (!center) throw new Error("Missing Lesotho");
    const southAfrica = geometry.shapes.filter((shape) => shape.market === "south-africa");
    expect(
      southAfrica.some((shape) =>
        shape.polygons.some((polygon) => polygon.holes.some((hole) => insideRing(hole, ...center))),
      ),
    ).toBe(true);
    expect(pickMarket(geometry, ...center, 4, 24, 90)).toBe("lesotho");
  });
  it("gives Tuvalu and Gibraltar a 24px screen-space target at multiple zoom levels", () => {
    for (const id of ["tuvalu", "gibraltar"])
      for (const scale of [0.5, 1, 4]) {
        const center = geometry.markets[id]?.center;
        if (!center) throw new Error(`Missing ${id}`);
        expect(
          pickMarket(
            geometry,
            center[0] + 10 / scale,
            center[1],
            scale,
            settings.camera.hitTargetPixels,
            settings.camera.smallMarketArea,
          ),
        ).toBe(id);
      }
  });
});

describe("country presentation history", () => {
  it("records real elapsed quarters, replaces duplicate deliveries and caps retained points", () => {
    let state = createCampaign(world, setupFor(22, "senegal"));
    let history = recordHistory({}, snapshot(state, world), 3);
    for (let i = 0; i < 4; i++) {
      state = endTurn(state, world);
      history = recordHistory(history, snapshot(state, world), 3);
    }
    const current = snapshot(state, world);
    const duplicate = recordHistory(history, current, 3);
    expect(duplicate).toEqual(history);
    expect(duplicate.senegal).toHaveLength(3);
    expect(duplicate.senegal?.at(-1)).toEqual({
      turn: current.turn,
      quarter: current.quarter,
      share: current.countries.find((country) => country.countryId === "senegal")?.share,
    });
    expect(recordHistory({}, current, 3).senegal).toHaveLength(1);
  });
  it("rejects an unordered heat scale instead of silently mislabelling the legend", () => {
    expect(() =>
      loadMapSettings(
        readFileSync("content/map.yaml", "utf8").replace(
          "[0, 0.001, 0.01, 0.05, 0.15, 0.3]",
          "[0, 0.001, 0.05, 0.01, 0.15, 0.3]",
        ),
      ),
    ).toThrow();
  });
});
