import geometryFile from "../../../../assets/map/world.json";
import settingsText from "../../../../content/map.yaml?raw";
import { loadMapSettings, mapGeometrySchema } from "../../../content/map";

export const mapSettings = loadMapSettings(settingsText);
const validationStart = performance.now();
export const geometry = mapGeometrySchema.parse(geometryFile);
performance.measure("map.geometry.validate", { start: validationStart, end: performance.now() });

export function heatBand(share: number, bands: readonly number[]): number {
  if (share <= 0) return 0;
  for (let i = 1; i < bands.length; i++) if (share < (bands[i] ?? 0)) return i;
  return bands.length;
}
