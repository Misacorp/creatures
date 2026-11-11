/**
 * The lighting pass of the house (`docs/design/housing-next.md` B1): pure maths, no canvas and no DOM. The sprites stay as
 * drawn, in day colours. For twilight and night every colour goes through the ramp of its material (a palette swap: the same
 * colour always gives the same colour, so edges stay hard), and the light sources (a lamp, the hearth, the lantern post, the
 * porch light) lift the pixels inside their stepped shapes back towards the day colours. `house-paint.ts` applies it.
 *
 * Material of a pixel. A placement may carry a `Material` tag from the scene (the room's wallpaper is `wall`, the roof is
 * `roof`, the lawn is `ground` ...); an untagged one is furniture, whose pixels are sorted by colour into a tone (wood, cloth,
 * glass, metal, foliage, flame or ink) from their hue, saturation and lightness. So the art packs stay untouched: a new set
 * is lit the day it is drawn.
 *
 * Phase. The phase is the living room's (`RoomPhase` of `@creatures/game`, from the server's clock via `useRoomPhase`); the
 * pass does not read a clock. Cost: a ramp is evaluated once per (sprite, material, phase) and cached with the sprite, the
 * light shapes once per scene; a repaint (a phase change or a rebuilt house) is one pass over the pixels, never per frame.
 */
import type { RoomPhase } from '@creatures/game';
import { VALLEY_SKY_CONCEPTS } from '../sprites/concepts/valley-sky';
import { expandRows, type SpriteDef } from '../sprites/sprite-data';

export type Rgb = readonly [number, number, number];

/** What a placement is made of, when the whole sprite is one thing. `auto` sorts the pixels by colour. */
export type Material =
  | 'auto'
  /** Drawn for the phase already (the sky, the moon, the sleeping z): never mapped. */
  | 'fixed'
  | 'wall'
  | 'floor'
  | 'roof'
  | 'exterior'
  | 'ground'
  | 'earth'
  | 'water'
  | 'creature'
  /** The picture of a window: its sky-coloured pixels are the night sky outside (with stars), the rest is cloth. */
  | 'window'
  /** A light source piece: like `auto`, and its flame colours keep glowing in the dark. */
  | 'light';

export type Tone = 'ink' | 'flame' | 'glass' | 'foliage' | 'wood' | 'metal' | 'cloth';

/** The outdoor materials and the sky: recoloured through a three-anchor ramp (see `GRADES` for what is indoors). */
export type RampName = 'foliage' | 'stone' | 'roof' | 'earth' | 'water' | 'sky';

/** What is graded, not ramped: the wallpaper and floor, the furniture's tones and the creatures. They keep the day's colours. */
export type GradeName =
  'wall' | 'floor' | 'wood' | 'cloth' | 'glass' | 'metal' | 'plant' | 'creature';

/** A piecewise-linear curve through (in, out) points, read off at `x`. */
type Curve = readonly (readonly [number, number])[];

/**
 * How a day colour becomes its night, kept close to the day: its lightness goes through `light` (HSL lightness in, out), its
 * saturation is scaled, and its hue is pulled towards `hue` (a degree, or a curve of the day lightness) by `pull` of the
 * way, never more than `reach` degrees; then `tint` is laid over it by `tintAmount`.
 */
export interface Grade {
  light: Curve;
  sat: number;
  hue?: number | Curve;
  pull?: number;
  reach?: number;
  /** How much saturation goes (0 to 1) when the day hue is far (120 degrees or more) from `hue`: a loud wallpaper goes quiet. */
  mute?: number;
  tint?: Rgb;
  tintAmount?: number;
}

/** Three anchors (dark, middle, light) of a material's colours in a phase; `keep` is how much of the sprite's own hue stays. */
export interface Ramp {
  shadow: Rgb;
  mid: Rgb;
  light: Rgb;
  keep: number;
}

const hex = (s: string): Rgb => {
  const n = Number.parseInt(s.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const ramp = (shadow: string, mid: string, light: string, keep: number): Ramp => ({
  shadow: hex(shadow),
  mid: hex(mid),
  light: hex(light),
  keep,
});

export type NightPhase = Exclude<RoomPhase, 'day'>;

/** The ramps of each phase by outdoor material. Tuned by eye on the hut, the three-floor house and the mansion. */
export const RAMPS: Readonly<Record<NightPhase, Readonly<Record<RampName, Ramp>>>> = {
  twilight: {
    foliage: ramp('#1c3a30', '#3f7a58', '#86b070', 0.5),
    stone: ramp('#3e3250', '#8a6e84', '#d4b4a8', 0.45),
    roof: ramp('#2c2440', '#644a66', '#a8808a', 0.65),
    earth: ramp('#2a1e2c', '#4e3a44', '#7e6058', 0.5),
    water: ramp('#2c3a6a', '#5a70b0', '#d0a0b8', 0.35),
    sky: ramp('#3b2f6e', '#c0607a', '#f2a76c', 0),
  },
  night: {
    foliage: ramp('#10261f', '#1f4a3c', '#3f7d5e', 0.35),
    stone: ramp('#1c1c34', '#403f64', '#77789c', 0.25),
    roof: ramp('#17152c', '#34305a', '#5d5a88', 0.55),
    earth: ramp('#15111f', '#2a2236', '#4a3d4c', 0.3),
    water: ramp('#14234a', '#26498a', '#5f9fd8', 0.25),
    // the living room's window night: three blues, darker at the top
    sky: ramp('#141a44', '#1f2c66', '#3c5eaa', 0),
  },
};

/**
 * The indoor grades of each phase, read off the living room's own three lights (`sprites/data/room-sprites.ts`): its wall and
 * floor tile keep their hue family and go darker and rosier at twilight, deeper indigo and plum at night, while its furniture
 * keeps nearly all of its day colour. A wallpaper of any colour is pulled the same way (by lightness, a hue shift towards the
 * phase, capped), so it is not painted a fixed colour.
 */
export const GRADES: Readonly<Record<NightPhase, Readonly<Record<GradeName, Grade>>>> = {
  twilight: {
    wall: {
      light: [
        [0.2, 0.16],
        [0.5, 0.32],
        [0.75, 0.52],
        [1, 0.74],
      ],
      sat: 0.8,
      hue: [
        [0.2, 258],
        [0.45, 272],
        [0.6, 300],
        [0.72, 313],
        [0.8, 335],
        [0.9, 358],
        [1, 364],
      ],
      pull: 0.85,
      reach: 75,
      mute: 0.75,
      tint: [120, 70, 140],
      tintAmount: 0.1,
    },
    floor: {
      light: [
        [0, 0],
        [1, 0.86],
      ],
      sat: 0.68,
      hue: [
        [0.35, 346],
        [0.5, 355],
        [0.65, 371],
      ],
      pull: 1,
      reach: 40,
      mute: 0.4,
    },
    wood: {
      light: [
        [0, 0],
        [1, 0.94],
      ],
      sat: 0.97,
      tint: [226, 150, 130],
      tintAmount: 0.06,
    },
    cloth: {
      light: [
        [0, 0],
        [1, 0.94],
      ],
      sat: 0.97,
      tint: [226, 150, 130],
      tintAmount: 0.06,
    },
    glass: {
      light: [
        [0, 0],
        [1, 0.94],
      ],
      sat: 0.9,
      tint: [226, 150, 150],
      tintAmount: 0.08,
    },
    metal: {
      light: [
        [0, 0],
        [1, 0.92],
      ],
      sat: 1,
      tint: [214, 150, 150],
      tintAmount: 0.1,
    },
    plant: {
      light: [
        [0, 0],
        [1, 0.92],
      ],
      sat: 0.95,
      tint: [200, 130, 130],
      tintAmount: 0.05,
    },
    creature: {
      light: [
        [0, 0],
        [1, 0.97],
      ],
      sat: 1,
      tint: [226, 150, 130],
      tintAmount: 0.04,
    },
  },
  night: {
    wall: {
      light: [
        [0.2, 0.17],
        [0.5, 0.3],
        [0.75, 0.4],
        [1, 0.5],
      ],
      sat: 0.92,
      hue: 249,
      pull: 1,
      reach: 30,
      mute: 0.85,
      tint: [60, 56, 130],
      tintAmount: 0.28,
    },
    floor: {
      light: [
        [0, 0],
        [1, 0.72],
      ],
      sat: 0.52,
      hue: 338,
      pull: 1,
      reach: 50,
      mute: 0.35,
    },
    wood: {
      light: [
        [0, 0],
        [1, 0.9],
      ],
      sat: 0.95,
      tint: [70, 70, 170],
      tintAmount: 0.1,
    },
    cloth: {
      light: [
        [0, 0],
        [1, 0.9],
      ],
      sat: 0.98,
      tint: [70, 70, 170],
      tintAmount: 0.1,
    },
    glass: {
      light: [
        [0, 0],
        [1, 0.88],
      ],
      sat: 0.95,
      tint: [60, 70, 170],
      tintAmount: 0.12,
    },
    metal: {
      light: [
        [0, 0],
        [1, 0.84],
      ],
      sat: 1,
      tint: [70, 80, 170],
      tintAmount: 0.16,
    },
    plant: {
      light: [
        [0, 0],
        [1, 0.86],
      ],
      sat: 0.95,
      tint: [50, 80, 150],
      tintAmount: 0.1,
    },
    creature: {
      light: [
        [0, 0],
        [1, 0.94],
      ],
      sat: 1,
      tint: [70, 70, 170],
      tintAmount: 0.06,
    },
  },
};

/** How much of the day colour a lit step restores (index 0 is outside every light), and the warm cast of a lamp's light. */
export const LEVEL_WEIGHT: readonly number[] = [0, 0.35, 0.68, 1];
/** The same for a wall or floor, which a light only dapples with warm (the living room's patches): a pool, not a flood. */
export const SURFACE_WEIGHT: readonly number[] = [0, 0.16, 0.3, 0.46];
const WARM: Rgb = [1.04, 0.97, 0.84];
/** The warm of a light's halo over the sky, and how much of it each step lays. */
const HALO: Rgb = [255, 207, 122];
const HALO_WEIGHT: readonly number[] = [0, 0.1, 0.2, 0.3];
/** Flame colours never go darker than this share of the day colour (a candle in the dark is still bright). */
const EMISSIVE: Readonly<Record<NightPhase, number>> = { twilight: 0.85, night: 0.9 };

/** The star colour in a window's night. */
export const STAR: Rgb = hex('#e9edff');

function hsl([r, g, b]: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

/** Perceived lightness of a colour, 0 to 1. */
export function luma([r, g, b]: Rgb): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** The tone of a day colour: ink, a flame (a bright saturated yellow or orange), glass (a light blue), foliage, wood, metal or cloth. */
export function toneOf(c: Rgb): Tone {
  const { h, s, l } = hsl(c);
  if (l < 0.13) return 'ink';
  if (s > 0.8 && l > 0.58 && h >= 25 && h <= 62) return 'flame';
  if (s < 0.2) return 'metal';
  if (h >= 175 && h <= 255 && l > 0.42) return 'glass';
  if (h >= 70 && h < 175) return 'foliage';
  if (h >= 12 && h < 50 && s < 0.75 && l < 0.7) return 'wood';
  return 'cloth';
}

/** True for a colour a window shows as sky: a light blue, or the cloud's near white. */
export function isSkyColour(c: Rgb): boolean {
  const { s, l } = hsl(c);
  return toneOf(c) === 'glass' || (s < 0.25 && l > 0.88);
}

type Look = { grade: GradeName } | { ramp: RampName } | null;

function lookOf(material: Material, tone: Tone): Look {
  switch (material) {
    case 'fixed':
      return null;
    case 'wall':
      return { grade: 'wall' };
    case 'floor':
      return { grade: 'floor' };
    case 'roof':
      return { ramp: 'roof' };
    case 'exterior':
      return { ramp: 'stone' };
    case 'ground':
      return { ramp: 'foliage' };
    case 'earth':
      return { ramp: 'earth' };
    case 'water':
      return { ramp: 'water' };
    case 'creature':
      return tone === 'ink' ? null : { grade: 'creature' };
    default:
      if (tone === 'ink') return null;
      return { grade: tone === 'flame' ? 'cloth' : tone === 'foliage' ? 'plant' : tone };
  }
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** A day colour through a ramp: its lightness picks the colour on the ramp, `keep` of its own hue stays. */
export function throughRamp(c: Rgb, r: Ramp): Rgb {
  const l = Math.min(1, Math.max(0, luma(c)));
  const onRamp = l < 0.5 ? mix(r.shadow, r.mid, l * 2) : mix(r.mid, r.light, (l - 0.5) * 2);
  // The sprite's own colour, darkened to the ramp's lightness, keeps the hue the artist chose.
  const target = luma(onRamp);
  const k = l === 0 ? 0 : target / l;
  const own: Rgb = [c[0] * k, c[1] * k, c[2] * k];
  return mix(onRamp, own, r.keep);
}

const at = (curve: Curve, x: number): number => {
  const first = curve[0];
  const last = curve[curve.length - 1];
  if (first === undefined || last === undefined) return x;
  if (x <= first[0]) return first[1];
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    if (a === undefined || b === undefined || x > b[0]) continue;
    return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
  }
  return last[1];
};

function fromHsl(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x];
  const m = l - c / 2;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** A day colour through a grade (see `Grade`): the same colour always gives the same colour. */
export function throughGrade(c: Rgb, g: Grade): Rgb {
  const { h, s, l } = hsl(c);
  const lightness = Math.min(1, Math.max(0, at(g.light, l)));
  let hue = h;
  let sat = s * g.sat;
  if (g.hue !== undefined && s > 0.02) {
    const target = typeof g.hue === 'number' ? g.hue : at(g.hue, l);
    const diff = ((((target - h) % 360) + 540) % 360) - 180;
    const reach = g.reach ?? 180;
    hue = h + Math.max(-reach, Math.min(reach, diff * (g.pull ?? 1)));
    sat *= 1 - (g.mute ?? 0) * Math.min(1, Math.abs(diff) / 120);
  }
  const out = fromHsl(hue, Math.min(1, sat), lightness);
  return g.tint === undefined ? out : mix(out, g.tint, g.tintAmount ?? 0);
}

/** The glow a lamp or the fire lays on a dark wall or floor: lighter and warmer, the way the living room's patches are. */
function glowOf(c: Rgb): Rgb {
  return [
    Math.min(255, c[0] * 1.55 + 34),
    Math.min(255, c[1] * 1.3 + 12),
    Math.min(255, c[2] * 1.05),
  ];
}

const clampByte = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

/** The colour a day colour has in `phase` at a light `level` (0 outside every light, 3 in the brightest step). */
export function shade(
  c: Rgb,
  material: Material,
  phase: RoomPhase,
  level: 0 | 1 | 2 | 3,
): [number, number, number] {
  if (phase === 'day') return [c[0], c[1], c[2]];
  if (material === 'fixed') {
    // The sky is drawn for its phase; a light near it only lays a stepped, dithered halo of warm over it.
    const halo = mix(c, HALO, HALO_WEIGHT[level] ?? 0);
    return [clampByte(halo[0]), clampByte(halo[1]), clampByte(halo[2])];
  }
  const tone = toneOf(c);
  const look = lookOf(material, tone);
  if (look === null) return [c[0], c[1], c[2]];
  let out: Rgb;
  if ('grade' in look) {
    const dark = throughGrade(c, GRADES[phase][look.grade]);
    if (look.grade === 'wall' || look.grade === 'floor') {
      out = mix(dark, glowOf(dark), SURFACE_WEIGHT[level] ?? 0);
    } else {
      const lit: Rgb = [c[0] * WARM[0], c[1] * WARM[1], c[2] * WARM[2]];
      let w = LEVEL_WEIGHT[level] ?? 0;
      if (material === 'light' && tone === 'flame') w = Math.max(w, EMISSIVE[phase]);
      out = mix(dark, lit, w);
    }
  } else {
    const dark = throughRamp(c, RAMPS[phase][look.ramp]);
    const lit: Rgb = [c[0] * WARM[0], c[1] * WARM[1], c[2] * WARM[2]];
    out = mix(dark, lit, LEVEL_WEIGHT[level] ?? 0);
  }
  return [clampByte(out[0]), clampByte(out[1]), clampByte(out[2])];
}

const toHex = (c: readonly number[]): string =>
  `#${c.map((v) => clampByte(v).toString(16).padStart(2, '0')).join('')}`;

/** A sprite's palette in `phase` at one light level, for sprites drawn as DOM or canvas pieces of their own (the sleepers of the room view). */
export function tintSprite(
  sprite: SpriteDef,
  material: Material,
  phase: RoomPhase,
  level: 0 | 1 | 2 | 3,
): SpriteDef {
  if (phase === 'day') return sprite;
  const palette: Record<string, string> = {};
  for (const [key, colour] of Object.entries(sprite.palette)) {
    const n = Number.parseInt(
      colour.length === 4 ? [...colour.slice(1)].map((h) => h + h).join('') : colour.slice(1),
      16,
    );
    palette[key] = toHex(shade([(n >> 16) & 255, (n >> 8) & 255, n & 255], material, phase, level));
  }
  return { ...sprite, palette };
}

/** The moon, or the dusk's last sun, that a window's drawn sun becomes. */
const MOON: Readonly<Record<NightPhase, Rgb>> = { twilight: hex('#ffd9a8'), night: hex('#dfe6ff') };

export function moonColour(phase: NightPhase): [number, number, number] {
  const m = MOON[phase];
  return [m[0], m[1], m[2]];
}

/** What a window's pixel becomes: the sky (`star` says it may hold a star), or null (cloth: the curtain, the frame; or the sun, see `sunPixels`). */
export function windowPixel(
  c: Rgb,
  phase: NightPhase,
): { colour: [number, number, number]; star: boolean } | null {
  return isSkyColour(c) && toneOf(c) !== 'flame'
    ? { colour: skyThrough(c, phase), star: true }
    : null;
}

/** The colour of a window's glass in `phase`: the night sky (or the dusk) by the glass's lightness. */
export function skyThrough(c: Rgb, phase: NightPhase): [number, number, number] {
  const out = throughRamp(c, RAMPS[phase].sky);
  return [clampByte(out[0]), clampByte(out[1]), clampByte(out[2])];
}

// ---------------------------------------------------------------------------------------------
// The sky behind the house

/** The dusk's hills, treeline and grass (the valley strip's own pixels, recoloured). */
const DUSK_LAND: Readonly<Record<string, string>> = {
  n: '#3f5a5a',
  m: '#5a6a7a',
  h: '#46586a',
  i: '#38495a',
  j: '#2a3b42',
  g: '#2f5a44',
};

/** The dusk sky from the top of the strip to the horizon, violet to amber; the last two are the sunlit clouds'. */
const DUSK_RAMP: readonly string[] = [
  '#3b2f6e',
  '#4d367a',
  '#6a3f86',
  '#8c4a84',
  '#b0587c',
  '#d2706f',
  '#f2a76c',
  '#f7bd86',
  '#fbd2a0',
];
/** How many of the ramp's first colours the sky itself uses (the rest are for clouds). */
const DUSK_SKY_STEPS = 7;

/** An ordered (2 x 2) dither threshold by pixel, so each step melts into the next over a few rows, never blurred. */
const BAYER = [0.125, 0.625, 0.875, 0.375] as const;

/**
 * The valley strip at dusk: the same hills, clouds and stars, with the four flat bands replaced by a stepped, dithered gradient
 * (violet at the top, amber on the horizon). The clouds are the sky's colour a little brighter (the low sun lights them), the
 * high stars stay and the low ones go. Keys `0` to `8` are the ramp's colours.
 */
export function duskSky(strip: SpriteDef): SpriteDef {
  const rows = expandRows(strip);
  const horizon = Math.max(
    1,
    rows.findIndex((row) => [...row].some((c) => 'hmijn'.includes(c))),
  );
  const palette: Record<string, string> = { ...DUSK_LAND };
  DUSK_RAMP.forEach((colour, i) => {
    palette[String(i)] = colour;
  });
  const out = rows.map((row, y) =>
    [...row]
      .map((c, x) => {
        if (!'ABCDpqrst'.includes(c)) return c;
        const t = Math.min(1, y / horizon) * (DUSK_SKY_STEPS - 1);
        const base = Math.floor(t);
        const frac = t - base;
        const bayer = BAYER[(y % 2) * 2 + (x % 2)] ?? 0.5;
        const level = Math.min(DUSK_SKY_STEPS - 1, base + (frac > bayer ? 1 : 0));
        if (c === 's') return y < horizon / 3 ? 's' : String(level);
        if (c === 't') return String(Math.min(DUSK_SKY_STEPS - 1, level + 1));
        if ('pqr'.includes(c)) return String(Math.min(DUSK_RAMP.length - 1, level + 2));
        return String(level);
      })
      .join(''),
  );
  palette['s'] = '#d8c4e6';
  return { rows: out, palette };
}

/**
 * A window's dusk: the sky pixel at (`x`, `y`) of the scene, `t` of the way down the glass (0 top, 1 bottom), as the stepped,
 * dithered gradient of the valley's dusk (violet to amber); a cloud (`cloud`) is the sky two steps brighter, lit by the low sun.
 */
export function duskWindowPixel(
  t: number,
  x: number,
  y: number,
  cloud: boolean,
): [number, number, number] {
  const at = Math.min(1, Math.max(0, t)) * (DUSK_SKY_STEPS - 1);
  const base = Math.floor(at);
  const bayer = BAYER[(y % 2) * 2 + (x % 2)] ?? 0.5;
  const level = Math.min(DUSK_SKY_STEPS - 1, base + (at - base > bayer ? 1 : 0));
  const c = hex(DUSK_RAMP[Math.min(DUSK_RAMP.length - 1, cloud ? level + 2 : level)] ?? '#000000');
  return [c[0], c[1], c[2]];
}

const skies = new Map<RoomPhase, SpriteDef>();

/** The valley's sky strip for a phase: its own night (violet bands and stars), a dusk of the same pixels, or null for day. */
export function skyForPhase(phase: Exclude<RoomPhase, 'day'>): SpriteDef {
  let sky = skies.get(phase);
  if (sky === undefined) {
    const concept = VALLEY_SKY_CONCEPTS.sprites['valley'];
    if (concept === undefined) throw new Error('valley-sky has no valley sprite');
    sky = phase === 'night' ? concept.sprite : duskSky(concept.sprite);
    skies.set(phase, sky);
  }
  return sky;
}

/** The moon of the valley's night (10 x 10), or undefined when the concept has none. */
export function moonSprite(): SpriteDef | undefined {
  return VALLEY_SKY_CONCEPTS.sprites['moon']?.sprite;
}

// ---------------------------------------------------------------------------------------------
// Light sources

/** `window` is the glow of a lit window on the postcard (`house-postcard.ts`); the others are a room's and a yard's lights. */
export type LightKind = 'lamp' | 'fire' | 'lantern' | 'porch' | 'window';

/**
 * A light source in a piece's art: its kind, and optionally where it burns (`at`, in the piece's own pixels from its top left;
 * default the middle of the sprite's flame-coloured pixels, else a spot by kind) and how big its pool is (`size`, a multiple
 * of the kind's shape, default 1: a candle is 0.5).
 */
export interface LightSpec {
  kind: LightKind;
  at?: { x: number; y: number };
  size?: number;
}

/** What a piece's art says: a bare kind, or the full spec. */
export type LightFlag = LightKind | LightSpec;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A light in scene pixels: where it burns and the box it cannot leave (a room's inside, a yard). */
export interface SceneLight {
  kind: LightKind;
  x: number;
  y: number;
  clip: Rect;
  /** A multiple of the kind's shape (default 1). */
  size?: number;
}

/** What a scene is lit by: the phase, and the lights (none in the day). */
export interface Lighting {
  phase: RoomPhase;
  lights: readonly SceneLight[];
}

export const DAY_LIGHTING: Lighting = { phase: 'day', lights: [] };

/** Outer half axes of each light's shape; the three steps are at `STEPS` of them. */
export const LIGHT_SHAPE: Readonly<Record<LightKind, { rx: number; ry: number }>> = {
  lamp: { rx: 42, ry: 32 },
  fire: { rx: 46, ry: 34 },
  lantern: { rx: 42, ry: 32 },
  porch: { rx: 26, ry: 22 },
  window: { rx: 11, ry: 8 },
};

/** The share of the outer axes where level 3 and level 2 end (level 1 ends at 1). */
export const STEPS: readonly [number, number] = [0.42, 0.72];

/** The light a form gives, unless the piece's art says otherwise: every lamp, every hearth. */
export const FORM_LIGHT: Readonly<Record<string, LightFlag>> = { lamp: 'lamp', hearth: 'fire' };

const asSpec = (flag: LightFlag): LightSpec => (typeof flag === 'string' ? { kind: flag } : flag);

/**
 * The light a placed piece gives, from data: its art's `light` flag, else its form (`FORM_LIGHT`), else a night `glow` (the art
 * says it shines: a lantern post). Undefined for a piece that is no light.
 */
export function lightOf(
  art: { light?: LightFlag; glow?: unknown },
  formId: string | undefined,
): LightSpec | undefined {
  if (art.light !== undefined) return asSpec(art.light);
  if (formId !== undefined && Object.hasOwn(FORM_LIGHT, formId)) {
    const flag = FORM_LIGHT[formId];
    return flag === undefined ? undefined : asSpec(flag);
  }
  return art.glow === undefined ? undefined : { kind: 'lantern' };
}

/** The kind of the light a placed piece gives (`lightOf`). */
export function lightKindOf(
  art: { light?: LightFlag; glow?: unknown },
  formId: string | undefined,
): LightKind | undefined {
  return lightOf(art, formId)?.kind;
}

const flameCentres = new WeakMap<SpriteDef, { x: number; y: number } | null>();

/** The middle of a sprite's flame-coloured pixels (a bulb, a candle, a fire), or null when it has none. */
export function flameCentre(sprite: SpriteDef): { x: number; y: number } | null {
  const hit = flameCentres.get(sprite);
  if (hit !== undefined) return hit;
  const flame = new Set<string>();
  for (const [key, colour] of Object.entries(sprite.palette)) {
    const h = colour.slice(1);
    const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
    const n = Number.parseInt(full, 16);
    if (toneOf([(n >> 16) & 255, (n >> 8) & 255, n & 255]) === 'flame') flame.add(key);
  }
  let sx = 0;
  let sy = 0;
  let count = 0;
  for (const [y, row] of expandRows(sprite).entries()) {
    for (let x = 0; x < row.length; x++) {
      if (!flame.has(row[x] ?? '.')) continue;
      sx += x;
      sy += y;
      count++;
    }
  }
  const out = count === 0 ? null : { x: Math.round(sx / count), y: Math.round(sy / count) };
  flameCentres.set(sprite, out);
  return out;
}

/** Where a light burns when the art does not say, as a share of the piece's height from its top (a lamp's bulb hangs low, a hearth's fire is mid). */
const LIGHT_AT: Readonly<Record<LightKind, number>> = {
  lamp: 0.8,
  fire: 0.62,
  lantern: 0.25,
  porch: 0.2,
  window: 0.5,
};

/**
 * Where a piece's light burns, in the piece's own pixels: the art's `at`, else the middle of its flame-coloured pixels, else a
 * share of its height by kind.
 */
export function lightCentre(
  spec: LightSpec,
  sprite: SpriteDef,
  size: { width: number; height: number },
): { x: number; y: number } {
  if (spec.at !== undefined) return spec.at;
  return (
    flameCentre(sprite) ?? {
      x: Math.floor(size.width / 2),
      y: Math.floor(size.height * LIGHT_AT[spec.kind]),
    }
  );
}

/** A hash of a scene pixel, for stars and the dither (stable: the same pixel always gets the same number). */
export function pixelHash(x: number, y: number): number {
  let h = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * The light level of every pixel of a scene `width` x `height`: 0 outside every light, 1 to 3 inside the stepped shape of
 * the strongest light. A step's edge is dithered one pixel wide (a checker between the two levels), never blurred.
 */
export function levelMap(lights: readonly SceneLight[], width: number, height: number): Uint8Array {
  const map = new Uint8Array(width * height);
  for (const light of lights) {
    const shape = LIGHT_SHAPE[light.kind];
    const rx = shape.rx * (light.size ?? 1);
    const ry = shape.ry * (light.size ?? 1);
    const x0 = Math.max(0, light.clip.x, Math.floor(light.x - rx));
    const x1 = Math.min(width, light.clip.x + light.clip.w, Math.ceil(light.x + rx) + 1);
    const y0 = Math.max(0, light.clip.y, Math.floor(light.y - ry));
    const y1 = Math.min(height, light.clip.y + light.clip.h, Math.ceil(light.y + ry) + 1);
    for (let y = y0; y < y1; y++) {
      const dy = (y - light.y) / ry;
      for (let x = x0; x < x1; x++) {
        const dx = (x - light.x) / rx;
        const f = Math.sqrt(dx * dx + dy * dy);
        if (f >= 1) continue;
        let level = f < STEPS[0] ? 3 : f < STEPS[1] ? 2 : 1;
        // dither: within a step's edge band, every other pixel takes the level on the other side
        const edge = level === 3 ? STEPS[0] : level === 2 ? STEPS[1] : 1;
        const band = 0.07;
        if ((x + y) % 2 === 0 && edge - f < band && level > 1) level -= 1;
        else if ((x + y) % 2 === 0 && level === 1 && 1 - f < band * 0.5) level = 0;
        const at = y * width + x;
        if (level > (map[at] ?? 0)) map[at] = level;
      }
    }
  }
  return map;
}
