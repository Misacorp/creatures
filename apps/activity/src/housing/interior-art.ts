/**
 * The art of the generated room layers (`docs/design/housing-interior.md`, housing C5): a look value (`paper-damask:rose`) made into
 * the tiles the scene draws, by the workshop's pure generators (`sprites/workshop/interior/`). Every tile is made once per pattern,
 * colour and size and kept for the page's life (a few dozen small sprites). The generators run here, at runtime, in the housing chunk
 * (nothing of this reaches the first load: `first-load-housing.test.ts`). Also the pictures of a pattern for the pickers and the
 * catalogue, and the names of the colours.
 */
import { parseLook, type SkinDef, type SkinKind } from '@creatures/game';
import { housing } from '@creatures/game/housing-content';
import type { SpriteDef } from '../sprites/sprite-data';
import {
  CEILING_COLOURS,
  CEILING_KINDS,
  ceilingHeight,
  ceilingOverlay,
  type CeilingKind,
} from '../sprites/workshop/interior/ceilings';
import { FLOOR_PATTERNS, floorPatternById, floorTile } from '../sprites/workshop/interior/floors';
import { FRAMES, frameById, type FrameMaterial } from '../sprites/workshop/interior/frame';
import { INK, type Tones } from '../sprites/workshop/interior/kit';
import { FLOOR_COLOURS, TRIM_COLOURS, WALL_COLOURS } from '../sprites/workshop/interior/palettes';
import { TRIM_KINDS, trimOverlay, type TrimKind } from '../sprites/workshop/interior/trim';
import { WALL_PATTERNS, wallPatternById, wallpaper } from '../sprites/workshop/interior/wallpaper';

const SKINS = new Map<string, SkinDef>(housing.skins.map((s) => [s.id, s]));

/** The names of the frame colourways (the frame's tones live inside `frame.ts`). */
const FRAME_COLOUR_NAMES: Readonly<Record<string, string>> = {
  oak: 'Oak',
  dark: 'Dark wood',
  grey: 'Grey',
  white: 'White',
  sage: 'Sage',
  blue: 'Blue',
  rose: 'Rose',
};

/** The colours a layer's patterns come in, from the workshop's palettes. */
const TONES: Readonly<Partial<Record<SkinKind, readonly Tones[]>>> = {
  wall: WALL_COLOURS,
  floor: FLOOR_COLOURS,
  trim: TRIM_COLOURS,
};

/**
 * The look a ceiling or frame left as built (null) is drawn in: the layer's starter in its first colour (Plain Ceiling, Timber
 * Frame). One rule, so "as built" and the starter never show as two choices that look the same. A trim left as built is none.
 */
export const AS_BUILT: Readonly<Partial<Record<SkinKind, string>>> = Object.fromEntries(
  (['ceiling', 'frame'] as const).flatMap((kind) => {
    const skin = housing.skins.find((s) => s.kind === kind && s.unlock.kind === 'starter');
    const colour = skin?.gen?.colours[0];
    return skin === undefined || colour === undefined ? [] : [[kind, `${skin.id}:${colour}`]];
  }),
);

/** The look a layer is drawn in: its own, else (ceiling, frame) the starter it is built with; null for none (a bare trim). */
export function drawnLook(kind: SkinKind, value: string | null): string | null {
  return value ?? AS_BUILT[kind] ?? null;
}

/** A generated look: the skin and its colour, or undefined for a drawn skin, an unknown id or a colour it does not come in. */
export function generatedLook(value: string): { skin: SkinDef; colour: string } | undefined {
  const look = parseLook(value);
  if (look === null) return undefined;
  const skin = SKINS.get(look.skin);
  if (skin?.gen === undefined) return undefined;
  const colour = look.colour ?? skin.gen.colours[0];
  if (colour === undefined || !skin.gen.colours.includes(colour)) return undefined;
  return { skin, colour };
}

/** A colour's name for a layer ("Rose", "Walnut panelling"); the id for one the palettes do not know. */
export function colourName(kind: SkinKind, colour: string): string {
  if (kind === 'ceiling') return CEILING_COLOURS.find((c) => c.id === colour)?.name ?? colour;
  if (kind === 'frame') return FRAME_COLOUR_NAMES[colour] ?? colour;
  return TONES[kind]?.find((t) => t.id === colour)?.name ?? colour;
}

/** A swatch of a colour for the colour row: its ground and its line, so two near colours still differ. */
export function colourSwatch(kind: SkinKind, colour: string): SpriteDef {
  const key = `swatch:${kind}:${colour}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const [ground, line] = swatchTones(kind, colour);
  const sprite: SpriteDef = {
    rows: Array.from({ length: 12 }, (_, y) =>
      Array.from({ length: 12 }, (_, x) => {
        if (x === 0 || y === 0 || x === 11 || y === 11) return 'k';
        return x + y > 15 ? 'b' : 'a';
      }).join(''),
    ),
    palette: { a: ground, b: line, k: INK },
  };
  cache.set(key, sprite);
  return sprite;
}

function swatchTones(kind: SkinKind, colour: string): [string, string] {
  if (kind === 'ceiling') {
    const c = CEILING_COLOURS.find((x) => x.id === colour);
    return [c?.surface.a ?? '#888888', c?.timber.a ?? '#555555'];
  }
  if (kind === 'frame') {
    const id = FRAME_BY_COLOUR[colour];
    const p = id === undefined ? undefined : frameMaterial(id)?.slab.palette;
    return [p?.a ?? '#888888', p?.b ?? '#555555'];
  }
  const t = TONES[kind]?.find((x) => x.id === colour);
  return [t?.a ?? '#888888', t?.d ?? '#555555'];
}

const cache = new Map<string, SpriteDef>();
const frames = new Map<string, FrameMaterial>();

function cached(key: string, make: () => SpriteDef | undefined): SpriteDef | undefined {
  if (cache.has(key)) return cache.get(key);
  const sprite = make();
  if (sprite !== undefined) cache.set(key, sprite);
  return sprite;
}

function tones(kind: SkinKind, colour: string): Tones | undefined {
  return TONES[kind]?.find((t) => t.id === colour);
}

/** The wallpaper tile of a generated wall look (`w` x 52), or undefined. */
export function wallTile(value: string): SpriteDef | undefined {
  const g = generatedLook(value);
  if (g?.skin.kind !== 'wall' || g.skin.gen === undefined) return undefined;
  const pattern = g.skin.gen.pattern;
  return cached(`wall:${pattern}:${g.colour}`, () => {
    const t = tones('wall', g.colour);
    return t === undefined ? undefined : wallpaper(wallPatternById(pattern), t);
  });
}

/** The floor tile of a generated floor look (`w` x 8), or undefined. */
export function floorTileOf(value: string): SpriteDef | undefined {
  const g = generatedLook(value);
  if (g?.skin.kind !== 'floor' || g.skin.gen === undefined) return undefined;
  const pattern = g.skin.gen.pattern;
  return cached(`floor:${pattern}:${g.colour}`, () => {
    const t = tones('floor', g.colour);
    return t === undefined ? undefined : floorTile(floorPatternById(pattern), t);
  });
}

/** How far down a ceiling look reaches (the cornice of a trim hangs from it); 4 with no ceiling, 40 under rafters (no cornice). */
export function ceilingDepth(value: string | null): number {
  const g = value === null ? undefined : generatedLook(value);
  if (g?.skin.kind !== 'ceiling' || g.skin.gen === undefined) return 4;
  const kind = g.skin.gen.pattern as CeilingKind;
  return kind === 'rafters' ? 40 : ceilingHeight(kind);
}

/** The ceiling overlay of a ceiling look for a room `roomW` wide, or undefined. */
export function ceilingTile(value: string, roomW: number): SpriteDef | undefined {
  const g = generatedLook(value);
  if (g?.skin.kind !== 'ceiling' || g.skin.gen === undefined) return undefined;
  const kind = g.skin.gen.pattern as CeilingKind;
  return cached(`ceiling:${kind}:${g.colour}:${String(roomW)}`, () => {
    const colours = CEILING_COLOURS.find((c) => c.id === g.colour);
    return colours === undefined ? undefined : ceilingOverlay(kind, colours, roomW);
  });
}

/** The trim overlay of a trim look (28 x 52, its cornice at `ceilingH`), or undefined. */
export function trimTile(value: string, ceilingH: number): SpriteDef | undefined {
  const g = generatedLook(value);
  if (g?.skin.kind !== 'trim' || g.skin.gen === undefined) return undefined;
  const kind = g.skin.gen.pattern as TrimKind;
  return cached(`trim:${kind}:${g.colour}:${String(ceilingH)}`, () => {
    const t = tones('trim', g.colour);
    return t === undefined ? undefined : trimOverlay(kind, t, ceilingH);
  });
}

/** The post (2 x 8) and slab (16 x 4) tiles of a frame look, or undefined. */
export function frameArt(value: string): FrameMaterial | undefined {
  const g = generatedLook(value);
  if (g?.skin.kind !== 'frame' || g.skin.gen === undefined) return undefined;
  return frameMaterial(`${g.skin.gen.pattern}-${g.colour}`);
}

/** A workshop frame material by its id (`timber-oak`), made once. */
function frameMaterial(id: string): FrameMaterial | undefined {
  const hit = frames.get(id);
  if (hit !== undefined) return hit;
  try {
    const made = frameById(id);
    frames.set(id, made);
    return made;
  } catch (error) {
    // only "no such material" (a look naming a colour the workshop does not have) is drawn as built; anything else is a bug
    if (error instanceof RangeError) return undefined;
    throw error;
  }
}

/** A frame colour's material, for its swatch (every frame colour belongs to one material). */
const FRAME_BY_COLOUR: Readonly<Record<string, string>> = {
  oak: 'timber-oak',
  dark: 'timber-dark',
  grey: 'stone-grey',
  white: 'painted-white',
  sage: 'painted-sage',
  blue: 'painted-blue',
  rose: 'painted-rose',
};

// ---------------------------------------------------------------------------------------------------------------
// Pictures: a 16 x 16 square of a look, for the pickers, the chips and the catalogue

/** A picture `w` x `h` from a colour per pixel (null: transparent), with its own palette keys. */
function fromPixels(w: number, h: number, at: (x: number, y: number) => string | null): SpriteDef {
  const keys = new Map<string, string>();
  const alphabet = 'abcdefghijlmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const colour = at(x, y);
      if (colour === null) {
        row += '.';
        continue;
      }
      let key = keys.get(colour);
      if (key === undefined) {
        key = alphabet[keys.size] ?? 'k';
        keys.set(colour, key);
      }
      row += key;
    }
    rows.push(row);
  }
  return { rows, palette: Object.fromEntries([...keys].map(([c, k]) => [k, c])) };
}

/** The colour of a tile's pixel, the tile repeated both ways; null where it is transparent. */
function pixel(tile: SpriteDef, x: number, y: number): string | null {
  const row = tile.rows[y % tile.rows.length] ?? '';
  const ch = row[x % Math.max(1, row.length)] ?? '.';
  return ch === '.' ? null : (tile.palette[ch] ?? null);
}

const PLAIN_WALL = 'paper-plain:cream';
/** The wall a trim's picture stands on: a mid tone, so a white or a dark trim both show against it. */
const TRIM_WALL = 'paper-plain:slate';

/** The 16 x 16 picture of a look (a pattern skin id alone shows its first colour), or undefined for one that is not generated. */
export function lookPicture(value: string): SpriteDef | undefined {
  const g = generatedLook(value);
  if (g === undefined) return undefined;
  const v = `${g.skin.id}:${g.colour}`;
  return cached(`picture:${v}`, () => {
    const back = wallTile(PLAIN_WALL);
    switch (g.skin.kind) {
      case 'wall': {
        const t = wallTile(v);
        return t === undefined ? undefined : fromPixels(16, 16, (x, y) => pixel(t, x, y + 18));
      }
      case 'floor': {
        const t = floorTileOf(v);
        return t === undefined ? undefined : fromPixels(16, 16, (x, y) => pixel(t, x, y));
      }
      case 'trim': {
        const t = trimTile(v, 4);
        const wall = wallTile(TRIM_WALL);
        if (t === undefined || wall === undefined) return undefined;
        return fromPixels(16, 16, (x, y) => pixel(t, x, y + 36) ?? pixel(wall, x, y + 36));
      }
      case 'ceiling': {
        const t = ceilingTile(v, 112);
        if (t === undefined || back === undefined) return undefined;
        return fromPixels(16, 16, (x, y) => pixel(t, x, y) ?? pixel(back, x, y));
      }
      case 'frame': {
        const f = frameArt(v);
        if (f === undefined || back === undefined) return undefined;
        // a post down the middle and a slab across the foot, inked as the house draws them
        return fromPixels(16, 16, (x, y) => {
          if (y >= 12) return y === 15 ? INK : pixel(f.slab, x, y - 12);
          if (x === 6 || x === 9) return INK;
          if (x === 7 || x === 8) return pixel(f.post, x - 7, y);
          return pixel(back, x, y + 18);
        });
      }
      default:
        return undefined;
    }
  });
}

/**
 * True for a generated skin the workshop can draw in every colour it lists (the art cross-check): its pattern and colours exist in
 * the generators' libraries. Cheap (no tile is made): `ART_PENDING` asks it of every skin when the art loads.
 */
export function canDrawPattern(skin: SkinDef): boolean {
  const gen = skin.gen;
  if (gen === undefined) return false;
  const has = (ids: readonly string[]) => gen.colours.every((c) => ids.includes(c));
  switch (skin.kind) {
    case 'wall':
      return WALL_PATTERNS.some((p) => p.id === gen.pattern) && has(WALL_COLOURS.map((t) => t.id));
    case 'floor':
      return (
        FLOOR_PATTERNS.some((p) => p.id === gen.pattern) && has(FLOOR_COLOURS.map((t) => t.id))
      );
    case 'trim':
      return (
        TRIM_KINDS.some((k) => k.id === gen.pattern && k.id !== 'none') &&
        has(TRIM_COLOURS.map((t) => t.id))
      );
    case 'ceiling':
      return (
        CEILING_KINDS.some((k) => k.id === gen.pattern) && has(CEILING_COLOURS.map((c) => c.id))
      );
    case 'frame':
      return gen.colours.every((c) => FRAMES.some((f) => f.id === `${gen.pattern}-${c}`));
    default:
      return false;
  }
}
