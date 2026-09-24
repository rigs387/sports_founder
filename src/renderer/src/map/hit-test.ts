import type { MapGeometry } from "../../../content/map";

export function insideRing(ring: readonly number[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i] ?? 0,
      yi = ring[i + 1] ?? 0,
      xj = ring[j] ?? 0,
      yj = ring[j + 1] ?? 0;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pickMarket(
  map: MapGeometry,
  x: number,
  y: number,
  scale: number,
  hitPixels: number,
  smallArea: number,
): string | null {
  let nearest: string | null = null;
  let distance = (hitPixels / (2 * scale)) ** 2;
  for (const [id, market] of Object.entries(map.markets)) {
    const [left, top, right, bottom] = market.bounds;
    if (!market.point && (right - left) * (bottom - top) * scale * scale >= smallArea) continue;
    const d = (x - market.center[0]) ** 2 + (y - market.center[1]) ** 2;
    if (d <= distance) {
      nearest = id;
      distance = d;
    }
  }
  if (nearest) return nearest;
  for (const shape of map.shapes) {
    const [left, top, right, bottom] = shape.bounds;
    if (!shape.market || x < left || x > right || y < top || y > bottom) continue;
    if (
      shape.polygons.some(
        (polygon) =>
          insideRing(polygon.outer, x, y) && !polygon.holes.some((hole) => insideRing(hole, x, y)),
      )
    )
      return shape.market;
  }
  return null;
}
