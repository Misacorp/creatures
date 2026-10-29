/**
 * The party prototype's layout math, pure: the art scale for a width, the camp's grid, and the dashed
 * trails on the clearing's grass between the stations and the camp fire.
 */

/** Where the desktop layout starts (the game's `WIDE_QUERY`, 60 rem). */
export const WIDE_PX = 960;

export interface Point {
  x: number;
  y: number;
}

/** The whole-number scale of the station art: 2 on a phone, 3 on a wide screen. */
export function artScale(width: number): number {
  return width >= WIDE_PX ? 3 : 2;
}

/** The camp's columns for `count` creatures in `rows` rows (at least one column). */
export function campColumns(count: number, rows: number): number {
  return Math.max(1, Math.ceil(count / Math.max(1, rows)));
}

/**
 * The dashes of an L-shaped trail from `a` to `b`: along x first, then along y, one dash every `step`
 * pixels, both ends included. Whole pixels (the dashes sit on the pixel grid).
 */
export function lPath(a: Point, b: Point, step: number): Point[] {
  const gap = Math.max(1, Math.floor(step));
  const out: Point[] = [];
  const ax = Math.round(a.x);
  const ay = Math.round(a.y);
  const bx = Math.round(b.x);
  const by = Math.round(b.y);
  const dx = Math.sign(bx - ax);
  for (let x = ax; dx === 0 ? x === ax : dx > 0 ? x <= bx : x >= bx; x += dx === 0 ? 1 : dx * gap) {
    out.push({ x, y: ay });
    if (dx === 0) break;
  }
  const dy = Math.sign(by - ay);
  if (dy !== 0) {
    for (let y = ay + dy * gap; dy > 0 ? y <= by : y >= by; y += dy * gap) out.push({ x: bx, y });
  }
  return out;
}

/** Every station's trail to the hub (the camp fire), the dashes of all of them. */
export function trailDashes(stations: readonly Point[], hub: Point, step: number): Point[] {
  return stations.flatMap((s) => lPath(hub, s, step));
}

/** The pixel scale that fits a sprite `size` px wide into `room` px (a whole number from `min` to `max`). */
export function fitScale(size: number, room: number, min: number, max: number): number {
  if (size <= 0) return min;
  return Math.max(min, Math.min(max, Math.floor(room / size)));
}
