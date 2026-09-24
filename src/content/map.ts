import { parse } from "yaml";
import { z } from "zod";

const point = z.tuple([z.number().finite(), z.number().finite()]);
const bounds = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
const ring = z
  .array(z.number().finite())
  .min(6)
  .refine((value) => value.length % 2 === 0);

export const mapSettingsSchema = z.object({
  heatBands: z
    .array(z.number().min(0).max(1))
    .length(6)
    .refine(
      (bands) => bands[0] === 0 && bands.every((band, i) => i === 0 || band > (bands[i - 1] ?? 0)),
    ),
  establishedThreshold: z.number().positive().max(1),
  historyLimit: z.int().min(2),
  labels: z.array(z.string()).refine((ids) => new Set(ids).size === ids.length),
  camera: z
    .object({
      minZoom: z.number().positive(),
      maxZoom: z.number().positive(),
      zoomStep: z.number().gt(1),
      locateZoom: z.number().positive(),
      hitTargetPixels: z.number().min(24),
      smallMarketArea: z.number().positive(),
    })
    .refine(
      (camera) =>
        camera.minZoom <= 1 &&
        camera.maxZoom >= 1 &&
        camera.minZoom < camera.maxZoom &&
        camera.locateZoom >= camera.minZoom &&
        camera.locateZoom <= camera.maxZoom,
    ),
  geometry: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    scale: z.number().positive(),
    translate: point,
    precision: z.number().positive(),
    decimals: z.int().min(0).max(4),
    simplifyPercent: z.number().gt(0).max(100),
    maxBytes: z.int().positive(),
  }),
});
export const mapAssignmentsSchema = z.object({
  source: z.object({
    url: z.url(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    version: z.string(),
  }),
  markets: z.array(
    z.object({ market: z.string(), units: z.array(z.string()), point: point.optional() }),
  ),
  neutral: z.array(z.object({ unit: z.string(), name: z.string() })),
});
export const mapGeometrySchema = z.object({
  version: z.literal(1),
  sourceSha256: z.string(),
  width: z.number(),
  height: z.number(),
  shapes: z.array(
    z.object({
      unit: z.string(),
      market: z.string().nullable(),
      bounds,
      polygons: z.array(z.object({ outer: ring, holes: z.array(ring) })).min(1),
    }),
  ),
  markets: z.record(
    z.string(),
    z.object({
      units: z.array(z.string()),
      center: point,
      bounds,
      point: z.boolean(),
      continent: z.string(),
    }),
  ),
  graticule: z.array(z.array(z.number().finite())),
});
export type MapSettings = z.infer<typeof mapSettingsSchema>;
export type MapGeometry = z.infer<typeof mapGeometrySchema>;
export type MapPolygon = MapGeometry["shapes"][number]["polygons"][number];
export function loadMapSettings(text: string): MapSettings {
  return mapSettingsSchema.parse(parse(text));
}
