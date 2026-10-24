/**
 * Tinting for the Valley Games art: one drawing, many colours. Tiles and props keep their material in
 * semantic palette keys, a ramp from light to dark, so the same sprite can be re-themed:
 *
 * - `a b c d`: the primary ramp (a is the lit highlight, b the light side, c the base, d the shadow);
 * - `e f g h`: an optional secondary ramp, in the same order (the dirt under a grass edge, the second
 *   flag of a bunting tile, the sand of a shore).
 *
 * Every other key (`k` the ink outline, `w` a white shine, fixed colours) is left alone. Light always
 * comes from the top left, so `a` sits on top-left edges and `d` on bottom-right ones.
 *
 * Tinted sprites are memoised: the same sprite and the same ramps give back the same object, so the
 * canvases (and `drawSprites`' parse cache, a WeakMap by sprite) never churn.
 */
import type { SpriteDef } from '../../sprites/sprite-data';

/** Four colours, light to dark: highlight, light, base, shadow. */
export type Ramp = readonly [light: string, mid: string, base: string, dark: string];

export const PRIMARY_KEYS = ['a', 'b', 'c', 'd'] as const;
export const SECONDARY_KEYS = ['e', 'f', 'g', 'h'] as const;

/**
 * The named ramps. Where the app has a token colour (`styles/base/tokens.css`), the ramp's base (`c`, or
 * `b` for the bright ones) is that colour: tide, ember, grove, spark, mire and gold match the element
 * chips and the gold accent.
 */
export const RAMPS = {
  // Bright show colours (teams, flags, confetti, crowd).
  red: ['#ff9a8a', '#ff5f6d', '#d23a4e', '#8a2238'],
  orange: ['#ffc48a', '#ff9a4a', '#e06a2a', '#9a3e1c'],
  yellow: ['#fff6b8', '#ffe36a', '#e8b830', '#9a7018'],
  green: ['#d8f58a', '#8fd14a', '#4f9a32', '#2b5a26'],
  teal: ['#a8f0e0', '#4fd0b8', '#2a9a90', '#1a5a5e'],
  blue: ['#b8dcff', '#6fa8ff', '#3f6ad8', '#24388a'],
  purple: ['#e0b8f5', '#b07bd0', '#7a48a8', '#4a2c6e'],
  pink: ['#ffd0e8', '#ff8ac4', '#d8549a', '#8a2c62'],
  ghost: ['#f4f0ff', '#cfc5ea', '#9488c6', '#5f5594'],
  // Medals.
  gold: ['#fff2a8', '#ffd25a', '#c8952b', '#7d5a1a'],
  silver: ['#ffffff', '#d4d8e8', '#9aa0bc', '#5d6282'],
  bronze: ['#f6c08f', '#d88a4e', '#a05e2e', '#5e3418'],
  // The five elements (the token colour is the base).
  tide: ['#b8d8ff', '#7fb1f0', '#4f8fe6', '#2a5aa8'],
  ember: ['#ffc0a0', '#ff9668', '#ef6a3a', '#a83a24'],
  grove: ['#c8f0a8', '#8fdb7a', '#5cbf5a', '#357a3e'],
  spark: ['#fffbd0', '#fff07a', '#f2d43d', '#b08a1c'],
  mire: ['#ecc89a', '#d4a86a', '#b8864a', '#7a5430'],
  // Materials.
  wood: ['#eab07a', '#c98a52', '#9a6036', '#5e3620'],
  sauna: ['#e0a870', '#c48a56', '#a06c42', '#6e4a2c'],
  pine: ['#f8d8a0', '#e8b878', '#c88e56', '#8a5a34'],
  frost: ['#f4fbff', '#cfe6f5', '#9cc4e4', '#6a8cbc'],
  ice: ['#ffffff', '#d4f2fb', '#9ad8f0', '#5aa4d4'],
  snow: ['#ffffff', '#eef4fb', '#c8d6ee', '#94a6cc'],
  stone: ['#c4bcd8', '#9a90b8', '#6e6490', '#463e66'],
  iron: ['#7a7098', '#4e4670', '#342e52', '#1e1a36'],
  grass: ['#b4ec82', '#7ed06a', '#57ad52', '#3a8346'],
  dirt: ['#f0c896', '#dca474', '#b87e52', '#7e5236'],
  sand: ['#fff2c4', '#f6dc98', '#e2bc72', '#b48a4e'],
  water: ['#b0ecff', '#6cd0f4', '#3aa6e0', '#2a74bc'],
  deep: ['#6cc0ec', '#3c90d4', '#2a66b0', '#1c4282'],
  arctic: ['#a8e0f4', '#5eaed8', '#3a7cb8', '#234e8a'],
  sky: ['#eef9ff', '#c4ebff', '#9cd8fb', '#78c2f2'],
  hill: ['#a6e07a', '#78c464', '#55a456', '#3c7e4a'],
  cream: ['#ffffff', '#fbf3df', '#ecdcb8', '#c4ac84'],
  night: ['#6a5fa0', '#463f82', '#2f2a5c', '#1f1a3c'],
} as const satisfies Readonly<Record<string, Ramp>>;

export type RampName = keyof typeof RAMPS;
export const RAMP_NAMES = Object.keys(RAMPS) as RampName[];

/** The bright colours a team, a player's pennant or a crowd member can wear. */
export const TEAM_RAMPS: readonly RampName[] = [
  'red',
  'blue',
  'green',
  'yellow',
  'purple',
  'orange',
  'teal',
  'pink',
];

type RampArg = Ramp | RampName;

/** One hex colour with its saturation cut by `amount` (0 to 1) towards its own brightness. */
function desaturate(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
  const grey = 0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2];
  const part = (c: number): string =>
    Math.round(c + (grey - c) * amount)
      .toString(16)
      .padStart(2, '0');
  return `#${part(rgb[0])}${part(rgb[1])}${part(rgb[2])}`;
}

const mutedCache = new Map<string, Ramp>();

/**
 * A named ramp with its saturation cut (the stands' risers: a painted board behind the crowd, which
 * should sit back, not shout). The same name gives back the same ramp.
 */
export function mutedRamp(name: RampName, amount = 0.62): Ramp {
  const key = `${name}|${String(amount)}`;
  const hit = mutedCache.get(key);
  if (hit !== undefined) return hit;
  const [a, b, c, d] = RAMPS[name];
  const ramp: Ramp = [
    desaturate(a, amount),
    desaturate(b, amount),
    desaturate(c, amount),
    desaturate(d, amount),
  ];
  mutedCache.set(key, ramp);
  return ramp;
}

function rampOf(ramp: RampArg): Ramp {
  return typeof ramp === 'string' ? RAMPS[ramp] : ramp;
}

const cache = new WeakMap<SpriteDef, Map<string, SpriteDef>>();

/** Replaces `keys` with the ramp's colours, only where the sprite already has the key. */
function applyRamp(
  palette: Record<string, string>,
  keys: readonly string[],
  ramp: Ramp | undefined,
): void {
  if (ramp === undefined) return;
  for (const [i, key] of keys.entries()) {
    const colour = ramp[i];
    if (colour !== undefined && Object.hasOwn(palette, key)) palette[key] = colour;
  }
}

/**
 * The sprite with its primary keys (`a b c d`) in `primary` and, when given, its secondary keys
 * (`e f g h`) in `secondary`. Rows, size and every other colour stay as they are, and a key the sprite
 * does not use is never added. The same inputs return the same object.
 */
export function tintSprite(def: SpriteDef, primary: RampArg, secondary?: RampArg): SpriteDef {
  const p = rampOf(primary);
  const s = secondary === undefined ? undefined : rampOf(secondary);
  const key = `${p.join()}|${s?.join() ?? ''}`;
  let byRamp = cache.get(def);
  if (byRamp === undefined) {
    byRamp = new Map();
    cache.set(def, byRamp);
  }
  const hit = byRamp.get(key);
  if (hit !== undefined) return hit;
  const palette: Record<string, string> = { ...def.palette };
  applyRamp(palette, PRIMARY_KEYS, p);
  applyRamp(palette, SECONDARY_KEYS, s);
  const tinted: SpriteDef = { ...def, palette };
  byRamp.set(key, tinted);
  return tinted;
}

/** Tints a sprite when a ramp is given, else returns it unchanged. */
export function maybeTint(def: SpriteDef, primary?: RampArg, secondary?: RampArg): SpriteDef {
  if (primary === undefined && secondary === undefined) return def;
  if (primary === undefined) {
    // Keep the primary colours as drawn: tint with the sprite's own a-d.
    const own: Ramp = [
      def.palette['a'] ?? '#000',
      def.palette['b'] ?? '#000',
      def.palette['c'] ?? '#000',
      def.palette['d'] ?? '#000',
    ];
    return tintSprite(def, own, secondary);
  }
  return tintSprite(def, primary, secondary);
}
