/**
 * A room cell put together from the interior layers, for the review sheets (read only: nothing here is wired into the
 * game). The order is the scene's own (`housing/house-scene.ts`): wallpaper, trim, ceiling, floor, slab, a stair, the back
 * furniture, the creature, the small floor pieces in front, then the posts (the walls) over everything. Furniture is the
 * shipped Cosy set and one shipped creature, so a layer is judged next to real art.
 */
import { SPECIES_SPRITE_DATA } from '../../data/species-sprites';
import { cosyPieces } from '../../data/house/cosy';
import { HOUSE_ART } from '../../data/house/shell';
import { expandRows, type SpriteDef } from '../../sprite-data';
import type { PieceArt } from '../../../housing/house-art';
import { levelMap, shade, type LightKind, type NightPhase } from '../../../housing/house-light';
import { CELL_H, CELL_W, FEET, FLOOR_H, Raster, SLAB_H, WALL_H, hexToRgb, rgbToHex } from './kit';
import type { FrameMaterial } from './frame';
import type { Doorway, Stair } from './ways';

/** Where the cell sits in a raster with room for the posts: 2 px of margin each side. */
export const MARGIN = 2;

/** The shipped frame: the timber walls skin's first two columns for a post, the fixed slab. */
export function shippedFrame(): FrameMaterial {
  const wall = HOUSE_ART.skins?.timber?.tile;
  const slab = HOUSE_ART.shell?.slab;
  if (wall === undefined || slab === undefined) throw new Error('The shipped shell art is missing.');
  const rows = expandRows(wall);
  return {
    id: 'shipped-timber',
    name: 'Shipped (timber walls)',
    post: { rows: rows.map((r) => r.slice(0, 2)), palette: wall.palette },
    slab,
  };
}

export interface Placed {
  readonly sprite: Doorway | Stair;
  /** Left edge in the room's own pixels. */
  readonly x: number;
}

export interface RoomLook {
  wall: SpriteDef;
  floor: SpriteDef;
  trim?: SpriteDef | undefined;
  ceiling?: SpriteDef | undefined;
  frame?: FrameMaterial | undefined;
  /** A doorway centred on the left or right post. */
  doorLeft?: Doorway | undefined;
  doorRight?: Doorway | undefined;
  /** A stair climbing out of this room, its left edge at x. */
  stair?: { stair: Stair; x: number } | undefined;
  /** A hole in this room's floor and slab (a stair arrives from below), x and width. */
  hole?: { x: number; w: number } | undefined;
}

export type Furnish = 'full' | 'light' | 'none';

export interface RoomOpts {
  cells?: number;
  furnish?: Furnish;
  creature?: string | null;
}

export interface LightAt {
  kind: LightKind;
  x: number;
  y: number;
  clip: { x: number; y: number; w: number; h: number };
}

const pieces = cosyPieces('day');
const piece = (id: string): PieceArt => {
  const p = pieces[id];
  if (p === undefined) throw new Error(`No Cosy piece ${id}.`);
  return p;
};
const sizeOf = (s: SpriteDef): { w: number; h: number } => {
  const rows = expandRows(s);
  return { w: rows[0]?.length ?? 0, h: rows.length };
};

/** The raster a room of `cells` cells needs: the cell and the posts' margin. */
export const roomRaster = (cells = 1): Raster => new Raster(cells * CELL_W + 2 * MARGIN, CELL_H);

/**
 * Draws a room into `r` with its cell's top left at (ox, oy). Returns the lights it holds (for the night).
 * Walls (posts) are drawn at the cell's edges, 2 px each side.
 */
export function drawRoom(r: Raster, ox: number, oy: number, look: RoomLook, opts: RoomOpts = {}): LightAt[] {
  const cells = opts.cells ?? 1;
  const furnish = opts.furnish ?? 'full';
  const width = cells * CELL_W;
  const frame = look.frame ?? shippedFrame();
  const lights: LightAt[] = [];
  const clip = { x: ox, y: oy, w: width, h: WALL_H + FLOOR_H };

  r.tileFill(look.wall, ox, oy, width, WALL_H, 'wall');
  if (look.ceiling !== undefined) r.tileFill(look.ceiling, ox, oy, width, sizeOf(look.ceiling).h, 'wall');
  if (look.trim !== undefined) r.tileFill(look.trim, ox, oy, width, WALL_H, 'wall');
  r.tileFill(look.floor, ox, oy + WALL_H, width, FLOOR_H, 'floor');
  r.tileFill(frame.slab, ox, oy + WALL_H + FLOOR_H, width, SLAB_H, 'exterior');
  if (look.hole !== undefined) {
    r.rect(ox + look.hole.x, oy + WALL_H, look.hole.w, FLOOR_H + SLAB_H, '#1c1428', 'exterior');
    r.rect(ox + look.hole.x, oy + WALL_H, look.hole.w, 1, '#0d0a1a', 'exterior');
  }
  if (look.stair !== undefined) {
    r.sprite(look.stair.stair.sprite, ox + look.stair.x, oy + FEET + 1 - look.stair.stair.h + 0, 'auto');
  }

  const put = (art: PieceArt, x: number, y: number, mat: 'auto' | 'light' | 'window' = 'auto'): void => {
    r.sprite(art.sprite, x, y, mat);
  };
  const spotX = (sx: number, sw: number, pw: number): number => ox + sx + Math.floor((sw - pw) / 2);
  const front: (() => void)[] = [];
  if (furnish === 'full') {
    const rug = piece('cosy-rug');
    put(rug, spotX(28, 56, sizeOf(rug.sprite).w), oy + 59 - sizeOf(rug.sprite).h);
    const win = piece('cosy-curtains');
    put(win, spotX(2, 36, sizeOf(win.sprite).w), oy + 8, 'window');
    const frm = piece('cosy-frame');
    put(frm, spotX(40, 40, sizeOf(frm.sprite).w), oy + 4);
    const sofa = piece('cosy-sofa');
    const sofaAt = [spotX(24, 64, sizeOf(sofa.sprite).w), oy + FEET - sizeOf(sofa.sprite).h] as const;
    put(sofa, sofaAt[0], sofaAt[1]);
    if (sofa.front !== undefined) {
      const f = sofa.front;
      front.push(() => r.sprite(f, sofaAt[0], sofaAt[1]));
    }
  }
  if (furnish !== 'none') {
    const plant = piece('cosy-plant');
    const pp = sizeOf(plant.sprite);
    const lamp = piece('cosy-lamp');
    const lp = sizeOf(lamp.sprite);
    front.push(() => put(plant, spotX(3, 20, pp.w), oy + FEET - pp.h));
    const lx = spotX(width - 22, 20, lp.w);
    front.push(() => put(lamp, lx, oy + FEET - lp.h, 'light'));
    lights.push({ kind: 'lamp', x: lx + Math.floor(lp.w / 2), y: oy + FEET - lp.h + Math.floor(lp.h * 0.8), clip });
  }
  const species = opts.creature === undefined ? 'sproutle' : opts.creature;
  if (species !== null) {
    const sprite = SPECIES_SPRITE_DATA[species];
    if (sprite !== undefined) r.sprite(sprite, ox + Math.floor(width / 2) - 6, oy + FEET - 15, 'creature');
  }
  for (const f of front) f();

  // doorways on the posts, in front of the wall's own things
  if (look.doorLeft !== undefined) {
    r.sprite(look.doorLeft.sprite, ox - 10, oy + FEET + 1 - 38, 'wall');
  }
  if (look.doorRight !== undefined) {
    r.sprite(look.doorRight.sprite, ox + width - 10, oy + FEET + 1 - 38, 'wall');
  }
  // the posts: ink, two pixels of the frame, ink; straddling the cell edge
  for (const edge of [ox, ox + width]) {
    const x = edge - 2;
    r.rect(x, oy, 1, CELL_H, '#0d0a1a', 'exterior');
    r.tileFill(frame.post, x + 1, oy, 2, CELL_H, 'exterior');
    r.rect(x + 3, oy, 1, CELL_H, '#0d0a1a', 'exterior');
  }
  return lights;
}

/** A single room in its own raster, cell at the margin. */
export function renderRoom(look: RoomLook, opts: RoomOpts = {}): { raster: Raster; lights: LightAt[]; ox: number } {
  const cells = opts.cells ?? 1;
  // a doorway straddles the post: show a stub of the neighbouring room so it reads as a way through
  const margin = look.doorLeft !== undefined || look.doorRight !== undefined ? 12 : MARGIN;
  const raster = new Raster(cells * CELL_W + 2 * margin, CELL_H, '#5a4a7a');
  const frame = look.frame ?? shippedFrame();
  for (const [from, w] of [
    [0, margin],
    [margin + cells * CELL_W, margin],
  ] as const) {
    raster.tileFill(look.wall, from, 0, w, WALL_H, 'wall');
    raster.tileFill(look.floor, from, WALL_H, w, FLOOR_H, 'floor');
    raster.tileFill(frame.slab, from, WALL_H + FLOOR_H, w, SLAB_H, 'exterior');
  }
  const lights = drawRoom(raster, margin, 0, look, opts);
  return { raster, lights, ox: margin };
}

/** The raster through the house's night (`housing/house-light.ts`): every pixel by its material, a lamp's stepped light on top. */
export function nightRaster(src: Raster, phase: NightPhase, lights: readonly LightAt[]): Raster {
  const out = new Raster(src.w, src.h);
  const levels = levelMap(lights, src.w, src.h);
  const mats = ['auto', 'wall', 'floor', 'exterior', 'light', 'creature', 'fixed', 'window'] as const;
  for (let i = 0; i < src.w * src.h; i++) {
    const c: [number, number, number] = [src.px[i * 3] ?? 0, src.px[i * 3 + 1] ?? 0, src.px[i * 3 + 2] ?? 0];
    const level = Math.min(3, levels[i] ?? 0) as 0 | 1 | 2 | 3;
    const [r, g, b] = shade(c, mats[src.mat[i] ?? 0] ?? 'auto', phase, level);
    const hex = rgbToHex([r, g, b]);
    const [rr, gg, bb] = hexToRgb(hex);
    out.px[i * 3] = rr;
    out.px[i * 3 + 1] = gg;
    out.px[i * 3 + 2] = bb;
    out.mat[i] = src.mat[i] ?? 0;
  }
  return out;
}
