/**
 * Ways through (`docs/design/housing-interior.md`, layer 5): doorways between neighbouring rooms on a floor and stairs
 * between floors. Both are drawn as sprites over the room (looks only, no walking). A doorway is 20 x 38 (ink, a frame
 * three wide, a twelve wide opening onto the dark of the passage), centred on the post between two rooms; a stair is a
 * sprite as tall as the climb (64 px from a floor to the next) that goes in front of the wall and behind the furniture,
 * with a hole cut in the floor above. `collisions` says which furniture spots a placement would meet.
 */
import type { SpriteDef } from '../../sprite-data';
import { INK, makeTile, type Tones } from './kit';
import { PASSAGE, PASSAGE_LIGHT } from './palettes';

export const DOOR_W = 20;
export const DOOR_H = 38;
/** The climb from one floor's standing row to the next's, in pixels (a room is 64 high: 52 wall, 8 floor, 4 slab). */
export const CLIMB = 64;

export type DoorStyle = 'arch' | 'square' | 'ajar' | 'curtain' | 'beads';
export const DOOR_STYLES: readonly { id: DoorStyle; name: string }[] = [
  { id: 'arch', name: 'Open arch' },
  { id: 'square', name: 'Square frame' },
  { id: 'ajar', name: 'Door ajar' },
  { id: 'curtain', name: 'Curtain' },
  { id: 'beads', name: 'Bead strands' },
];

class Grid {
  readonly px: string[];
  readonly w: number;
  readonly h: number;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.px = new Array<string>(w * h).fill('.');
  }
  set(x: number, y: number, key: string): void {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = key;
  }
  get(x: number, y: number): string {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? (this.px[y * this.w + x] ?? '.') : '.';
  }
  fill(x: number, y: number, w: number, h: number, key: string): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, key);
  }
  line(x0: number, y0: number, x1: number, y1: number, key: string): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++)
      this.set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), key);
  }
  sprite(palette: Readonly<Record<string, string>>): SpriteDef {
    return makeTile(this.w, this.h, (x, y) => this.get(x, y), palette);
  }
}

/** The ring a pixel of a doorway is in: 0 ink, 1 to 3 the frame, 4 and more the opening, negative outside. */
function ring(style: DoorStyle, x: number, y: number): number {
  if (style === 'arch') {
    const dx = x + 0.5 - DOOR_W / 2;
    const dy = y < 10 ? 10 - (y + 0.5) : 0;
    const dist = y < 10 ? Math.hypot(dx, dy) : Math.abs(dx);
    return Math.floor(9.9 - dist);
  }
  return Math.min(x, DOOR_W - 1 - x, y);
}

export interface Doorway {
  readonly sprite: SpriteDef;
  /** Where the opening's floor is: the sprite's bottom row stands on the room's feet row. */
  readonly feet: number;
}

/** A doorway sprite: `frame` is the wood (or stone) of the frame, `cloth` the curtain and the beads. */
export function doorway(style: DoorStyle, frame: Tones, cloth: Tones): Doorway {
  const g = new Grid(DOOR_W, DOOR_H);
  for (let y = 0; y < DOOR_H - 1; y++) {
    for (let x = 0; x < DOOR_W; x++) {
      const r = ring(style, x, y);
      const left = x < DOOR_W / 2;
      if (r < 0) continue;
      if (r === 0) g.set(x, y, 'k');
      else if (r <= 3) g.set(x, y, left ? ['c', 'a', 'a'][r - 1] ?? 'a' : ['a', 'b', 'd'][r - 1] ?? 'a');
      else g.set(x, y, y > DOOR_H - 8 ? 'q' : 'p');
    }
  }
  // the threshold: the opening's last row and an ink line under the whole frame
  for (let x = 4; x < DOOR_W - 4; x++) g.set(x, DOOR_H - 2, 'q');
  g.fill(0, DOOR_H - 1, DOOR_W, 1, 'k');
  if (style === 'ajar') {
    // the leaf, hinged on the left, seen edge on: its free edge is nearer, so it is a little taller
    for (let x = 4; x <= 8; x++) {
      for (let y = 4 + Math.floor((x - 4) * 0.6); y < DOOR_H - 2; y++) {
        const edge = x === 8;
        const panel = x >= 5 && x <= 7 && ((y >= 9 && y <= 19) || (y >= 24 && y <= 32));
        g.set(x, y, edge ? 'k' : x === 4 ? 'c' : panel ? 'b' : 'a');
      }
    }
    g.set(7, 26, 'd');
  }
  if (style === 'curtain') {
    // a rod, and a drape either side tied back at the waist
    g.fill(3, 4, DOOR_W - 6, 1, 'd');
    g.set(3, 4, 'c');
    g.set(DOOR_W - 4, 4, 'c');
    for (let y = 5; y < DOOR_H - 2; y++) {
      const w = y < 18 ? 5 : y < 21 ? 3 : y < 26 ? 2 : y < 31 ? 4 : 5;
      for (let i = 0; i < w; i++) {
        const key = ['g', 'e', 'f', 'e', 'f'][(i + (y > 21 ? 1 : 0)) % 5] ?? 'e';
        g.set(4 + i, y, key);
        g.set(DOOR_W - 5 - i, y, i === 0 ? 'f' : key === 'g' ? 'e' : key);
      }
      if (y >= 21 && y <= 22) {
        g.set(4, y, 'h');
        g.set(DOOR_W - 5, y, 'h');
      }
    }
  }
  if (style === 'beads') {
    g.fill(4, 4, DOOR_W - 8, 1, 'd');
    for (let x = 4; x < DOOR_W - 4; x += 2) {
      const end = 24 + ((x * 5) % 9);
      for (let y = 5; y <= end; y++) g.set(x, y, y % 3 === 0 ? 'g' : y % 3 === 1 ? 'e' : 'p');
    }
  }
  const palette = {
    k: INK,
    a: frame.a,
    b: frame.b,
    c: frame.c,
    d: frame.d,
    e: cloth.a,
    f: cloth.b,
    g: cloth.c,
    h: cloth.d,
    p: PASSAGE,
    q: PASSAGE_LIGHT,
  };
  return { sprite: g.sprite(palette), feet: DOOR_H - 1 };
}

// ---------------------------------------------------------------------------------------------------------------
// Stairs

export type StairStyle = 'straight' | 'ladder' | 'spiral';
export const STAIR_STYLES: readonly { id: StairStyle; name: string; w: number }[] = [
  { id: 'straight', name: 'Straight stair', w: 42 },
  { id: 'ladder', name: 'Ladder', w: 10 },
  { id: 'spiral', name: 'Spiral stair', w: 24 },
];

export interface Stair {
  readonly sprite: SpriteDef;
  /** The sprite's height; its bottom row stands on the lower room's feet row. */
  readonly h: number;
  /** The hole in the floor above: x from the sprite's left, and its width. */
  readonly hole: { x: number; w: number };
}

const STAIR_H = CLIMB + 6;

/** A stair sprite in the wood `wood` (keys `a b c d` face, shade, light, line), with a rail in `rail`. */
export function stair(style: StairStyle, wood: Tones): Stair {
  const palette = { k: INK, a: wood.a, b: wood.b, c: wood.c, d: wood.d };
  const w = STAIR_STYLES.find((s) => s.id === style)?.w ?? 10;
  const g = new Grid(w, STAIR_H);
  const feet = STAIR_H - 1;
  if (style === 'straight') {
    const steps = 10;
    const run = 4;
    const top = (x: number): number => {
      const k = Math.min(steps - 1, Math.floor(x / run));
      return feet - Math.round(((k + 1) * (CLIMB - 1)) / steps);
    };
    for (let x = 0; x < w; x++) {
      const t = top(x);
      const prev = x > 0 ? top(x - 1) : feet + 1;
      g.set(x, t - 1, 'k');
      g.set(x, t, 'c');
      g.set(x, t + 1, 'a');
      g.set(x, t + 2, 'a');
      g.set(x, t + 3, 'b');
      g.set(x, t + 4, 'k');
      // the riser: the first column of a step, from its tread down to the tread below
      if (x % run === 0 && prev > t) {
        for (let y = t; y < prev; y++) g.set(x, y, y === t ? 'c' : 'd');
        g.set(x, prev - 1, 'k');
      }
    }
    // a rail on posts, climbing with the stair
    for (const px of [6, 14, 22, 30, 38]) {
      const t = top(px);
      for (let y = t - 13; y < t; y++) g.set(px, y, 'd');
    }
    g.line(6, top(6) - 13, 38, top(38) - 13, 'c');
    g.line(6, top(6) - 12, 38, top(38) - 12, 'k');
    return { sprite: g.sprite(palette), h: STAIR_H, hole: { x: w - 14, w: 14 } };
  }
  if (style === 'ladder') {
    for (let y = 0; y < STAIR_H; y++) {
      g.set(0, y, 'k');
      g.set(1, y, 'c');
      g.set(2, y, 'a');
      g.set(3, y, 'k');
      g.set(6, y, 'k');
      g.set(7, y, 'a');
      g.set(8, y, 'b');
      g.set(9, y, 'k');
      if (y % 6 === 1 && y < feet - 2) {
        g.set(4, y, 'c');
        g.set(5, y, 'c');
        g.set(4, y + 1, 'd');
        g.set(5, y + 1, 'd');
      }
    }
    return { sprite: g.sprite(palette), h: STAIR_H, hole: { x: 0, w: 10 } };
  }
  // spiral: a pole, and a tread every five rows, one side then the other
  const mid = Math.floor(w / 2);
  for (let y = 0; y < STAIR_H; y++) {
    g.set(mid - 1, y, 'c');
    g.set(mid, y, 'b');
  }
  for (let i = 0, y = feet - 3; y > 4; i++, y -= 5) {
    const len = 10 - (i % 2) * 1;
    const x0 = i % 2 === 0 ? mid - len : mid + 1;
    const x1 = i % 2 === 0 ? mid - 2 : mid + len;
    for (let x = x0; x <= x1; x++) {
      g.set(x, y - 1, 'k');
      g.set(x, y, 'c');
      g.set(x, y + 1, 'a');
      g.set(x, y + 2, 'k');
    }
    g.set(i % 2 === 0 ? x0 - 1 : x1 + 1, y, 'k');
    g.set(i % 2 === 0 ? x0 - 1 : x1 + 1, y + 1, 'k');
  }
  return { sprite: g.sprite(palette), h: STAIR_H, hole: { x: mid - 8, w: 17 } };
}

// ---------------------------------------------------------------------------------------------------------------
// Where a way through meets the furniture spots

export interface SpotLike {
  readonly id: string;
  readonly type: string;
  readonly x: number;
  readonly w: number;
}

export interface RoomLike {
  readonly id: string;
  /** Width in cells. */
  readonly cells: number;
  readonly spots: readonly SpotLike[];
}

export interface Zone {
  readonly name: string;
  /** Where in the room, as pixels from the room's left (negative: from its right edge, measured to the edge). */
  readonly from: number;
  readonly to: number;
}

const WALL_TYPES: ReadonlySet<string> = new Set(['window', 'wall-large', 'wall-small', 'display']);
const FLOOR_TYPES: ReadonlySet<string> = new Set(['floor-large', 'floor-small']);

export interface Collision {
  /** Spots hanging on the wall inside the zone: the picture would hang in the doorway (a real clash). */
  readonly wall: string[];
  /** Furniture standing on the floor in the zone: it would stand in front of the doorway or stair's foot (hides part of it). */
  readonly floor: string[];
}

/** The spots of a room whose span meets a zone (`from` to `to` in the room's own pixels). */
export function collisions(room: RoomLike, from: number, to: number): Collision {
  const meets = (s: SpotLike): boolean => s.x < to && s.x + s.w > from;
  return {
    wall: room.spots.filter((s) => WALL_TYPES.has(s.type) && meets(s)).map((s) => s.id),
    floor: room.spots.filter((s) => FLOOR_TYPES.has(s.type) && meets(s)).map((s) => s.id),
  };
}

/** The zone of a doorway on a room's `side` edge: `reach` pixels into the room from the edge. */
export function edgeZone(room: RoomLike, side: 'left' | 'right', reach: number): [number, number] {
  const width = room.cells * 112;
  return side === 'left' ? [0, reach] : [width - reach, width];
}
