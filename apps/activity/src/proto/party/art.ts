/**
 * The station art of the clearing, composed from the game's own sprites (world map landmarks, living
 * room props, the boss, glyphs): no new image files. A composition is a box in sprite pixels and the
 * sprites placed in it; `PixelScene` draws it on one canvas at a whole-number scale.
 */
import { bossArt } from '../../art';
import { ROOM_SPRITE_DATA, type RoomPropName } from '../../sprites/data/room-sprites';
import { swapPalette, type SpriteDef } from '../../sprites/sprite-data';
import { worldSprite } from '../../sprites/world-map-art';
import type { StationId } from './party-state';

export interface Placed {
  sprite: SpriteDef;
  x: number;
  y: number;
}

export interface Composition {
  width: number;
  height: number;
  placed: Placed[];
}

/** A living room prop in its day light. */
export function roomProp(name: RoomPropName): SpriteDef {
  const sprite = ROOM_SPRITE_DATA[name].day;
  if (sprite === undefined) throw new Error(`no day art for ${name}`);
  return sprite;
}

const greyCache = new WeakMap<SpriteDef, SpriteDef>();

/** A grey of the same lightness for each colour (the cave: the Ember Caves' rock without the fire). */
export function greyed(def: SpriteDef): SpriteDef {
  const known = greyCache.get(def);
  if (known !== undefined) return known;
  const palette: Record<string, string> = {};
  for (const [key, colour] of Object.entries(def.palette)) palette[key] = greyOf(colour);
  const out = swapPalette(def, palette);
  greyCache.set(def, out);
  return out;
}

/** `#rrggbb` to a cool grey of its lightness (kept a touch blue, like the game's night). */
export function greyOf(colour: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(colour);
  if (m === null) return colour;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => Number.parseInt(h ?? '0', 16));
  const l = Math.round(0.3 * (r ?? 0) + 0.55 * (g ?? 0) + 0.15 * (b ?? 0));
  const hex = (n: number): string => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${hex(l - 6)}${hex(l - 4)}${hex(l + 10)}`;
}

/** A ring of rocks: the arena's edge. */
function rockRing(width: number, top: number): Placed[] {
  const rock = worldSprite('rock');
  const spots: [number, number][] = [
    [0, top + 22],
    [8, top + 30],
    [19, top + 34],
    [width - 27, top + 34],
    [width - 16, top + 30],
    [width - 8, top + 22],
  ];
  return spots.map(([x, y]) => ({ sprite: rock, x, y }));
}

/** The composition of a station's art (its state is drawn over it as buttons and marks). */
export function stationArt(id: StationId, bossId: string): Composition {
  switch (id) {
    case 'road':
      return { width: 58, height: 42, placed: [{ sprite: worldSprite('oldCrossroads'), x: 0, y: 0 }] };
    case 'forge':
      return {
        width: 40,
        height: 36,
        placed: [{ sprite: roomProp('fireplace'), x: 2, y: 0 }],
      };
    case 'arena': {
      const boss = bossArt(bossId).sprite;
      return {
        width: 56,
        height: 44,
        placed: [{ sprite: boss, x: 16, y: 4 }, ...rockRing(56, 4)],
      };
    }
    case 'cave':
      return {
        width: 55,
        height: 44,
        placed: [{ sprite: greyed(worldSprite('emberCaves')), x: 0, y: 0 }],
      };
    case 'house':
      return {
        width: 48,
        height: 40,
        placed: [
          // A corner of the living room: two wall tiles, the window, the cushion, a plant.
          { sprite: roomProp('edge'), x: 0, y: -12 },
          { sprite: roomProp('edge'), x: 16, y: -12 },
          { sprite: roomProp('edge'), x: 32, y: -12 },
          { sprite: roomProp('window'), x: 6, y: 3 },
          { sprite: roomProp('cushion'), x: 14, y: 33 },
          { sprite: roomProp('plant'), x: 36, y: 26 },
        ],
      };
    case 'chest':
      return { width: 1, height: 1, placed: [] };
    case 'lectern':
      return { width: 28, height: 24, placed: [{ sprite: roomProp('bookshelf'), x: 0, y: 0 }] };
    case 'fair':
      return {
        width: 56,
        height: 45,
        placed: [{ sprite: worldSprite('festivalGrounds'), x: 0, y: 0 }],
      };
  }
}
