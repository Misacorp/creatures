/**
 * The art rules as one pure checker, for sprites that are not in the game yet (concept art in
 * `concepts/`, drawn with `scripts/art.mts`) and for the shipped ones. It returns findings with
 * coordinates instead of throwing, so an artist sees every problem of a drawing at once.
 *
 * The rules are the ones the sprite tests and `docs/design/creatures.md` ("Art direction for
 * sprites") state: size, a palette that is all used, the shared ink, the chibi face of a creature,
 * nothing of the body cut by the canvas edge, a small palette, a sensible footprint, a silhouette of
 * its own, the element's colour family, and (new) enough contrast with the dark panels the game
 * draws sprites on. `docs/design/art-studio.md` explains how to use it.
 */
import { expandRows, parseSprite, SpriteError, type SpriteDef } from './sprite-data';

export type ArtKind = 'creature' | 'boss' | 'item' | 'part' | 'banner' | 'free';

export const KIND_SIZE: Readonly<Record<ArtKind, { width: number; height: number } | undefined>> = {
  creature: { width: 16, height: 16 },
  boss: { width: 24, height: 24 },
  item: { width: 12, height: 12 },
  part: { width: 8, height: 8 },
  banner: { width: 64, height: 24 },
  free: undefined,
};

export const INK = '#0d0a1a';
export const EYE_WHITE = '#fbf8ec';
export const BLUSH = '#ff8fab';
/** The panel colours sprites are drawn on (`--night`, `--dusk`, `--dusk-2`). */
export const PANELS = ['#17132b', '#241e42', '#2f2857'] as const;

/** Keys of a creature's body (they may not touch the canvas edge). */
const BODY_KEYS = ['b', 'h', 's', 'p'];

/**
 * An element's colour family. A colour belongs when its hue is in one of the ranges and its
 * saturation and lightness are in bounds; a sprite of the element needs `min` such colours.
 */
export interface ColourFamily {
  hues: readonly (readonly [number, number])[];
  minSat?: number;
  maxSat?: number;
  minLight?: number;
  maxLight?: number;
  min: number;
}

export const ELEMENT_FAMILIES: Readonly<Record<string, ColourFamily>> = {
  tide: { hues: [[165, 240]], min: 2 },
  ember: { hues: [[345, 50]], min: 2 },
  grove: { hues: [[70, 165]], min: 2 },
  spark: {
    hues: [
      [40, 70],
      [235, 300],
    ],
    min: 2,
  },
  mire: { hues: [[20, 50]], minSat: 0.5, min: 1 },
  // Concept, not shipped (docs/compendium/world.md, "Void"): dusk purples, muted (less saturated
  // than Spark's storm violet), plus the dark starry window.
  void: { hues: [[240, 270]], minSat: 0.25, maxSat: 0.55, minLight: 0.3, min: 2 },
};

export interface Finding {
  rule: string;
  level: 'error' | 'warn';
  message: string;
}

export interface LintOptions {
  kind: ArtKind;
  element?: string;
  /** Shipped sprites of the same kind to keep clear of (id to sprite); the sprite's own id is skipped. */
  others?: Readonly<Record<string, SpriteDef>>;
  /** The sprite's own id, so it is not compared with itself in `others`. */
  id?: string;
  /** At least this many pixels of silhouette must differ from every one of `others` (creatures: 12). */
  minDifferentPixels?: number;
}

/** Hue (0-360), saturation (0-1, HSV) and lightness (0-1, HSL) of a `#rgb` or `#rrggbb` colour. */
export function hsl(hex: string): { hue: number; sat: number; light: number } {
  const [r, g, b] = rgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const light = (max + min) / 2;
  if (d === 0) return { hue: 0, sat: 0, light };
  let hue: number;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  return { hue: (hue * 60 + 360) % 360, sat: d / max, light };
}

function rgb(hex: string): [number, number, number] {
  const full =
    hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join('')}` : hex.toLowerCase();
  return [1, 3, 5].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG contrast ratio of two colours (1 to 21). */
export function contrast(a: string, b: string): number {
  const lum = (hex: string): number => {
    const [r, g, bl] = rgb(hex).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function inHue(hue: number, [from, to]: readonly [number, number]): boolean {
  return from <= to ? hue >= from && hue <= to : hue >= from || hue <= to;
}

/** Whether a colour is in a family. */
export function inFamily(colour: string, family: ColourFamily): boolean {
  const { hue, sat, light } = hsl(colour);
  // A grey has no hue (hsl reports 0, which is inside Ember's range), so it is in no family.
  if (sat === 0) return false;
  return (
    family.hues.some((range) => inHue(hue, range)) &&
    sat >= (family.minSat ?? 0) &&
    sat <= (family.maxSat ?? 1) &&
    light >= (family.minLight ?? 0) &&
    light <= (family.maxLight ?? 1)
  );
}

/** The number of pixels where one silhouette is filled and the other is not (same grid). */
export function silhouetteDifference(a: SpriteDef, b: SpriteDef): number {
  const x = expandRows(a);
  const y = expandRows(b);
  let different = 0;
  for (const [row, line] of x.entries()) {
    for (const [col, ch] of [...line].entries()) {
      if ((ch !== '.') !== ((y[row]?.[col] ?? '.') !== '.')) different += 1;
    }
  }
  return different;
}

/** The closest of `others` by silhouette, or undefined when there are none. */
export function nearestSilhouette(
  def: SpriteDef,
  others: Readonly<Record<string, SpriteDef>>,
  skip?: string,
): { id: string; different: number } | undefined {
  let best: { id: string; different: number } | undefined;
  for (const [id, other] of Object.entries(others)) {
    if (id === skip || expandRows(other).length !== def.rows.length) continue;
    const different = silhouetteDifference(def, other);
    if (best === undefined || different < best.different) best = { id, different };
  }
  return best;
}

/** Every rule a sprite of `kind` breaks. An empty list means it is ready to show. */
export function lintSprite(def: SpriteDef, options: LintOptions): Finding[] {
  const findings: Finding[] = [];
  const add = (rule: string, message: string, level: Finding['level'] = 'error'): void => {
    findings.push({ rule, level, message });
  };
  const size = KIND_SIZE[options.kind];
  let cells: { x: number; y: number }[];
  try {
    cells = [...parseSprite(def, size).cells];
  } catch (err) {
    // Nothing else can be checked on a grid that does not parse.
    if (err instanceof SpriteError) add('grid', err.message);
    else throw err;
    return findings;
  }
  const rows = expandRows(def);
  const at = (y: number, x: number): string => rows[y]?.[x] ?? '?';

  const used = new Set(rows.join(''));
  for (const key of Object.keys(def.palette)) {
    if (!used.has(key)) add('palette', `Palette key "${key}" is not used by any pixel.`);
  }
  if (def.palette.k !== INK) add('ink', `The outline "k" must be the shared ink ${INK}.`);
  if (Object.keys(def.palette).length > 11) {
    add(
      'palette',
      `${String(Object.keys(def.palette).length)} colours; at most 11 (brief, shades, ink, face).`,
    );
  }

  const last = rows.length - 1;
  for (const [y, row] of rows.entries()) {
    for (const [x, ch] of [...row].entries()) {
      if (!(x === 0 || y === 0 || x === row.length - 1 || y === last) || ch === '.') continue;
      if (options.kind === 'boss' && ch !== 'k') {
        add(
          'edge',
          `Boss pixel "${ch}" at x ${String(x)}, y ${String(y)} is on the canvas edge (only ink may be).`,
        );
      } else if (options.kind === 'creature' && BODY_KEYS.includes(ch)) {
        add(
          'edge',
          `Body pixel "${ch}" at x ${String(x)}, y ${String(y)} is cut by the canvas edge.`,
        );
      }
    }
  }

  if (options.kind === 'creature') {
    const face: [string, string, string][] = [
      ['left eye', [at(8, 4), at(8, 5), at(9, 4), at(9, 5)].join(''), 'ekkk'],
      ['right eye', [at(8, 10), at(8, 11), at(9, 10), at(9, 11)].join(''), 'kekk'],
      ['blush', [at(10, 3), at(10, 12)].join(''), 'qq'],
      ['mouth', [at(10, 7), at(10, 8)].join(''), 'kk'],
    ];
    for (const [part, found, wanted] of face) {
      if (found !== wanted) {
        add(
          'face',
          `The ${part} reads "${found}", wanted "${wanted}" (eyes rows 8-9 at x 4-5 and 10-11, blush and mouth on row 10).`,
        );
      }
    }
    if (def.palette.e !== EYE_WHITE) add('face', `The eye highlight "e" must be ${EYE_WHITE}.`);
    if (def.palette.q !== BLUSH) add('face', `The blush "q" must be ${BLUSH}.`);
  }

  if (cells.length > 0 && (options.kind === 'creature' || options.kind === 'boss')) {
    const xs = cells.map((c) => c.x);
    const ys = cells.map((c) => c.y);
    const width = Math.max(...xs) - Math.min(...xs) + 1;
    const height = Math.max(...ys) - Math.min(...ys) + 1;
    const [minW, minH] = options.kind === 'boss' ? [16, 16] : [7, 8];
    if (width < minW || height < minH) {
      add(
        'footprint',
        `Drawn area is ${String(width)}x${String(height)}; at least ${String(minW)}x${String(minH)}.`,
      );
    }
  }

  if (options.others !== undefined) {
    const near = nearestSilhouette(def, options.others, options.id);
    const need = options.minDifferentPixels ?? (options.kind === 'creature' ? 12 : 1);
    if (near !== undefined && near.different < need) {
      add(
        'silhouette',
        `Silhouette is ${String(near.different)} pixels from ${near.id}; at least ${String(need)}.`,
      );
    }
  }

  if (options.element !== undefined) {
    const family = ELEMENT_FAMILIES[options.element];
    if (family === undefined) {
      add('element', `No colour family for element "${options.element}".`, 'warn');
    } else {
      const count = Object.entries(def.palette).filter(
        ([key, colour]) => !['k', 'e', 'q'].includes(key) && inFamily(colour, family),
      ).length;
      if (count < family.min) {
        add(
          'element',
          `${String(count)} colours in the ${options.element} family; at least ${String(family.min)}.`,
        );
      }
    }
  }

  // Contrast: a colour that covers much of the sprite and sits next to the ink outline should not
  // melt into the dark panels (the outline is ink, so the next ring is what shows the shape).
  const rim = new Map<string, number>();
  for (const [y, row] of rows.entries()) {
    for (const [x, ch] of [...row].entries()) {
      if (ch === '.' || ch === 'k') continue;
      const touchesInk = [at(y - 1, x), at(y + 1, x), at(y, x - 1), at(y, x + 1)].includes('k');
      if (touchesInk) rim.set(ch, (rim.get(ch) ?? 0) + 1);
    }
  }
  const rimTotal = [...rim.values()].reduce((a, b) => a + b, 0);
  let dark = 0;
  for (const [key, count] of rim) {
    const colour = def.palette[key];
    if (colour !== undefined && contrast(colour, PANELS[1]) < 1.8) dark += count;
  }
  if (rimTotal > 0 && dark / rimTotal > 0.35) {
    add(
      'contrast',
      `${String(Math.round((100 * dark) / rimTotal))}% of the pixels inside the outline are too dark for the dusk panel (contrast under 1.8); the shape will vanish.`,
      'warn',
    );
  }
  return findings;
}
