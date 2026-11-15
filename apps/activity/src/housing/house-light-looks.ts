/**
 * Options for the twilight look of the house's walls and floors (dev only; nothing in the game imports this file).
 *
 * Misa found the twilight walls quite pink. `A0` is what ships. `A1` keeps the hue and takes colour out, `A2` pulls the walls to
 * a warm amber dusk, `A3` to a cooler lilac. The workbench takes one with `twilightLook` in a page's props (see
 * `workbench/main.tsx`), before anything is painted, because the lit colours are cached per sprite. Day and night are never
 * touched: only `GRADES.twilight.wall`, `GRADES.twilight.floor` and `RAMPS.twilight.stone` (the plaster outside) change.
 */
import { GRADES, RAMPS, type Grade, type Ramp } from './house-light';

export const TWILIGHT_LOOKS = ['A0', 'A1', 'A2', 'A3'] as const;
export type TwilightLook = (typeof TWILIGHT_LOOKS)[number];

interface Look {
  wall: Grade;
  floor: Grade;
  stone: Ramp;
}

const hex = (s: string): readonly [number, number, number] => {
  const n = Number.parseInt(s.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const stone = (shadow: string, mid: string, light: string, keep: number): Ramp => ({
  shadow: hex(shadow),
  mid: hex(mid),
  light: hex(light),
  keep,
});

const SHIPPED: Look = {
  wall: GRADES.twilight.wall,
  floor: GRADES.twilight.floor,
  stone: RAMPS.twilight.stone,
};

const WALL_LIGHT = SHIPPED.wall.light;

const LOOKS: Readonly<Record<TwilightLook, Look>> = {
  A0: SHIPPED,
  // same hue, less saturation and a greyer tint
  A1: {
    wall: { ...SHIPPED.wall, sat: 0.5, mute: 0.85, tint: [112, 92, 128], tintAmount: 0.12 },
    floor: { ...SHIPPED.floor, sat: 0.48 },
    stone: stone('#3e3450', '#80707f', '#c8b8b0', 0.45),
  },
  // a warm amber dusk
  A2: {
    wall: {
      light: WALL_LIGHT,
      sat: 0.62,
      hue: [
        [0.2, 280],
        [0.45, 335],
        [0.6, 8],
        [0.72, 20],
        [0.8, 27],
        [0.9, 33],
        [1, 38],
      ],
      pull: 0.85,
      reach: 75,
      mute: 0.75,
      tint: [150, 96, 78],
      tintAmount: 0.1,
    },
    floor: {
      ...SHIPPED.floor,
      sat: 0.62,
      hue: [
        [0.35, 4],
        [0.5, 16],
        [0.65, 26],
      ],
    },
    stone: stone('#40303a', '#8c6c64', '#d8b290', 0.45),
  },
  // a cooler lilac
  A3: {
    wall: {
      light: WALL_LIGHT,
      sat: 0.62,
      hue: [
        [0.2, 250],
        [0.45, 262],
        [0.6, 272],
        [0.72, 280],
        [0.8, 286],
        [0.9, 292],
        [1, 296],
      ],
      pull: 0.9,
      reach: 80,
      mute: 0.75,
      tint: [110, 84, 150],
      tintAmount: 0.1,
    },
    floor: {
      ...SHIPPED.floor,
      sat: 0.55,
      hue: [
        [0.35, 322],
        [0.5, 332],
        [0.65, 342],
      ],
    },
    stone: stone('#3a3458', '#7c72a0', '#c4b8d4', 0.45),
  },
};

/** Takes a twilight look for the rest of the page's life. Call it before the first paint. */
export function applyTwilightLook(look: TwilightLook): void {
  const { wall, floor, stone: plaster } = LOOKS[look];
  const grades = GRADES.twilight as { wall: Grade; floor: Grade };
  grades.wall = wall;
  grades.floor = floor;
  (RAMPS.twilight as { stone: Ramp }).stone = plaster;
}

/** The look a workbench address names (`"twilightLook":"A2"` in its props), or null. */
export function twilightLookOf(value: unknown): TwilightLook | null {
  return TWILIGHT_LOOKS.find((l) => l === value) ?? null;
}
