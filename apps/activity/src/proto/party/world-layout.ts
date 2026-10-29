/**
 * Where everything stands in the clearing, in world pixels (one world pixel = `s` screen pixels, one
 * scale for the whole scene), and how the world fits a window. Pure, so the layout rules are tested.
 *
 * Phone: two columns of four, a road running down between them (out of the top and bottom of the screen),
 * each place's door on the road. Desktop: four columns of two, the road running across the middle, out of
 * both sides of the window.
 */
import type { StationId } from './party-state';

export type Mode = 'phone' | 'wide';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The art size of each station, in world pixels (see `world-draw.ts`). */
export const ART_SIZE: Readonly<Record<StationId, { width: number; height: number }>> = {
  road: { width: 58, height: 42 },
  forge: { width: 54, height: 35 },
  arena: { width: 48, height: 36 },
  cave: { width: 55, height: 44 },
  house: { width: 48, height: 40 },
  chest: { width: 32, height: 32 },
  lectern: { width: 40, height: 28 },
  fair: { width: 56, height: 45 },
};

/** The stations in grid order (row by row, left to right): the same order as `STATIONS`. */
const ORDER: readonly StationId[] = [
  'road',
  'forge',
  'arena',
  'cave',
  'house',
  'chest',
  'lectern',
  'fair',
];

export const ROAD_WIDTH = 8;

export interface WorldLayout {
  mode: Mode;
  width: number;
  height: number;
  /** The art's box of each station. */
  stations: Readonly<Record<StationId, Box>>;
  /** The road, in world pixels (it is drawn on past the world's edges to the window's). */
  road: Box;
}

/** The phone world: 128 x 177, two columns of four rows of 44, the road down the middle. */
function phone(): WorldLayout {
  const width = 128;
  const height = 177;
  const row = 44;
  const roadX = width / 2 - ROAD_WIDTH / 2;
  const stations = {} as Record<StationId, Box>;
  ORDER.forEach((id, i) => {
    const size = ART_SIZE[id];
    const col = i % 2;
    const r = Math.floor(i / 2);
    // Each place stands against the road: the left column's right edge and the right column's left edge.
    const x = col === 0 ? roadX - 2 - size.width : roadX + ROAD_WIDTH + 2;
    // Feet on the row's bottom line; a place taller than the row (the fairground) hangs one pixel lower.
    const y = r * row + row - Math.min(size.height, row);
    stations[id] = { x: Math.max(0, x), y, ...size };
  });
  return {
    mode: 'phone',
    width,
    height,
    stations,
    road: { x: roadX, y: 0, width: ROAD_WIDTH, height },
  };
}

/** The wide world: 288 x 128, four columns of 72, the road across the middle. */
function wide(): WorldLayout {
  const width = 288;
  const height = 128;
  const col = 72;
  const roadY = height / 2 - ROAD_WIDTH / 2;
  const stations = {} as Record<StationId, Box>;
  ORDER.forEach((id, i) => {
    const size = ART_SIZE[id];
    const c = i % 4;
    const r = Math.floor(i / 4);
    const x = c * col + Math.floor((col - size.width) / 2);
    // The top row stands on the road; the bottom row hangs just under it.
    const y = r === 0 ? roadY - 1 - size.height : roadY + ROAD_WIDTH + 6;
    stations[id] = { x, y, ...size };
  });
  return {
    mode: 'wide',
    width,
    height,
    stations,
    road: { x: 0, y: roadY, width, height: ROAD_WIDTH },
  };
}

export function worldLayout(mode: Mode): WorldLayout {
  return mode === 'phone' ? phone() : wide();
}

/** The one whole-number scale at which `content` fits `view` (between `min` and `max`). */
export function fitScale(
  view: { width: number; height: number },
  content: { width: number; height: number },
  min: number,
  max: number,
): number {
  if (content.width <= 0 || content.height <= 0) return min;
  const fit = Math.min(
    Math.floor(view.width / content.width),
    Math.floor(view.height / content.height),
  );
  return Math.max(min, Math.min(max, fit));
}

/** Where the content's top-left sits in a view, in world pixels, so it is centred (whole pixels). */
export function centreOffset(
  view: { width: number; height: number },
  content: { width: number; height: number },
  s: number,
): { x: number; y: number } {
  return {
    x: Math.floor((view.width / s - content.width) / 2),
    y: Math.floor((view.height / s - content.height) / 2),
  };
}

/** Whether two boxes overlap (touching edges do not). */
export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Spots for the grass tufts over a `width` x `height` area: an even scatter (a fixed stride, every other
 * row shifted), skipping any spot on a station or the road. Deterministic: the same area, the same tufts.
 */
export function tuftSpots(
  width: number,
  height: number,
  avoid: readonly Box[],
  stride = 23,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  let row = 0;
  for (let y = 4; y < height - 3; y += 17) {
    const shift = (row * 11) % stride;
    for (let x = shift; x < width - 5; x += stride) {
      const spot = { x, y, width: 5, height: 3 };
      if (
        !avoid.some((b) =>
          overlaps(spot, {
            ...b,
            x: b.x - 2,
            y: b.y - 2,
            width: b.width + 4,
            height: b.height + 4,
          }),
        )
      ) {
        out.push({ x, y });
      }
    }
    row++;
  }
  return out;
}

/** How many tray columns fit a width (cells `cell` wide, `gap` apart), at least `min`. */
export function trayColumns(width: number, cell: number, gap: number, min = 1): number {
  return Math.max(min, Math.floor((width + gap) / (cell + gap)));
}
