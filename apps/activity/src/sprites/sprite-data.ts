/**
 * Pixel sprites as data: rows of characters plus a palette map. `.` is a transparent pixel.
 * Symmetric sprites store only their left half and set `mirror`. Everything here is pure, so it is
 * unit-tested without a canvas; `Sprite.tsx` only draws the result.
 */

export interface SpriteDef {
  /** One string per pixel row; every row has the same length. `.` is transparent. */
  rows: readonly string[];
  /** One-character keys to `#rgb` or `#rrggbb` colours. */
  palette: Readonly<Record<string, string>>;
  /** Rows are the left half; the right half is the mirror image. */
  mirror?: boolean;
}

/** A pixel with its colour, in the sprite's own grid. */
interface Cell {
  x: number;
  y: number;
  colour: string;
}

interface ParsedSprite {
  width: number;
  height: number;
  /** Every non-transparent pixel, row by row. */
  cells: readonly Cell[];
}

const TRANSPARENT = '.';
const COLOUR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const MAX_SIZE = 64;

export class SpriteError extends Error {}

/** The size of the finished grid (after mirroring), without parsing the cells. */
export function spriteSize(def: SpriteDef): { width: number; height: number } {
  const first = def.rows[0] ?? '';
  return { width: def.mirror === true ? first.length * 2 : first.length, height: def.rows.length };
}

/** Throws a `SpriteError` when the data is not a well-formed sprite (of `size`, when given). */
export function validateSprite(def: SpriteDef, size?: { width: number; height: number }): void {
  if (def.rows.length === 0) throw new SpriteError('Sprite has no rows.');
  if (def.rows.length > MAX_SIZE)
    throw new SpriteError(`Sprite is taller than ${String(MAX_SIZE)}.`);
  const rowWidth = def.rows[0]?.length ?? 0;
  if (rowWidth === 0) throw new SpriteError('Sprite rows are empty.');
  for (const [y, row] of def.rows.entries()) {
    if (row.length !== rowWidth) {
      throw new SpriteError(
        `Row ${String(y)} is ${String(row.length)} wide, expected ${String(rowWidth)}.`,
      );
    }
  }
  for (const [key, colour] of Object.entries(def.palette)) {
    if ([...key].length !== 1 || key === TRANSPARENT) {
      throw new SpriteError(`Palette key "${key}" must be one character and not "."`);
    }
    if (!COLOUR.test(colour))
      throw new SpriteError(`Palette colour for "${key}" is not a hex colour.`);
  }
  for (const [y, row] of def.rows.entries()) {
    for (const ch of row) {
      if (ch !== TRANSPARENT && !Object.hasOwn(def.palette, ch)) {
        throw new SpriteError(`Row ${String(y)} uses "${ch}", which is not in the palette.`);
      }
    }
  }
  const actual = spriteSize(def);
  if (actual.width > MAX_SIZE) throw new SpriteError(`Sprite is wider than ${String(MAX_SIZE)}.`);
  if (size !== undefined && (actual.width !== size.width || actual.height !== size.height)) {
    throw new SpriteError(
      `Sprite is ${String(actual.width)}x${String(actual.height)}, expected ${String(size.width)}x${String(size.height)}.`,
    );
  }
}

/** The full rows of a sprite: the mirror image of each row is appended when `mirror` is set. */
export function expandRows(def: SpriteDef): string[] {
  if (def.mirror !== true) return [...def.rows];
  return def.rows.map((row) => row + [...row].reverse().join(''));
}

/** Validates and turns a sprite into its list of coloured pixels. */
export function parseSprite(
  def: SpriteDef,
  size?: { width: number; height: number },
): ParsedSprite {
  validateSprite(def, size);
  const rows = expandRows(def);
  const cells: Cell[] = [];
  for (const [y, row] of rows.entries()) {
    for (const [x, ch] of [...row].entries()) {
      const colour = def.palette[ch];
      if (ch !== TRANSPARENT && colour !== undefined) cells.push({ x, y, colour });
    }
  }
  return { width: rows[0]?.length ?? 0, height: rows.length, cells };
}

/**
 * The same sprite with some palette entries replaced (for example a shiny variant). Keys that the
 * sprite does not use are ignored, so a swap can never add a new colour to a sprite.
 */
export function swapPalette(
  def: SpriteDef,
  overrides: Readonly<Record<string, string>>,
): SpriteDef {
  const palette: Record<string, string> = { ...def.palette };
  for (const [key, colour] of Object.entries(overrides)) {
    if (Object.hasOwn(palette, key)) palette[key] = colour;
  }
  return { ...def, palette };
}
