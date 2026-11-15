/**
 * Art variations for the contrast of two shipped sets (the workshop report's "hard to read at 1x" flags on Stormglass and
 * Fenkeeper furniture, which is tone on tone with its own wallpaper). Each is an option for Misa to pick from by picture;
 * nothing in the game imports this file, and the shipped art (and `shipped-art.json`) is untouched. See `index.ts`.
 *
 * Two fixes per set: change the wallpaper (the furniture stays) or change the furniture (the wallpaper stays).
 */
import type { SetSource } from '../pack';
import { SOURCE as FENKEEPER } from '../../data/house/fenkeeper';
import { SOURCE as STORMGLASS } from '../../data/house/stormglass';
import { recolour, recolourPiece, type Swap } from './recolour';
import type { Variation } from './types';

const wallOf = (source: SetSource, set: string) => {
  const tile = source.hand?.skins?.[`${set}-wall`]?.tile;
  if (tile === undefined) throw new Error(`${set} has no wallpaper`);
  return tile;
};

/** The hand pieces of a set that `swap` changes (the ones it does not touch, such as a lamp of copper, are left out). */
function furniture(source: SetSource, swap: Swap): NonNullable<Variation['pieces']> {
  const out: NonNullable<Variation['pieces']> = {};
  for (const [id, art] of Object.entries(source.hand?.pieces ?? {})) {
    const made = recolourPiece(art, swap);
    if (JSON.stringify(made.sprite.palette) === JSON.stringify(art.sprite.palette)) continue;
    out[id.slice(id.indexOf('-') + 1) as keyof typeof out] = made;
  }
  return out;
}

// Stormglass: pale ash (#e6e1d8, #c4beb6, #8d889a) on pale ash paper. Colours of its palette: d #54546c is the dark of the
// glass and cloth, e #e28c3c copper.
const STORM_PAPER: Swap = {
  '#e6e1d8': '#8a88aa',
  '#c4beb6': '#545274',
  '#8d889a': '#6c6a90',
  '#54546c': '#2e2c48',
};
const STORM_WOOD: Swap = {
  '#e6e1d8': '#9c98bc',
  '#c4beb6': '#767296',
  '#8d889a': '#4c4870',
};

// Fenkeeper: bog oak (#9a7752, #c4a176, #6e523a) on a wainscot of the same oak.
const FEN_PAPER: Swap = {
  '#9a7752': '#4c3a2a',
  '#c4a176': '#6a5238',
  '#6e523a': '#2e2218',
};
const FEN_WOOD: Swap = {
  '#9a7752': '#d0b080',
  '#c4a176': '#ecd7a8',
  '#6e523a': '#9a7650',
};

export const CONTRAST_VARIATIONS: readonly Variation[] = [
  {
    id: 'stormglass-dark-paper',
    set: 'stormglass',
    name: 'B1a: darker storm-slate wallpaper',
    wall: recolour(wallOf(STORMGLASS, 'stormglass'), STORM_PAPER),
  },
  {
    id: 'stormglass-dark-wood',
    set: 'stormglass',
    name: 'B1b: furniture in storm-slate ash',
    pieces: furniture(STORMGLASS, STORM_WOOD),
  },
  {
    id: 'fenkeeper-dark-paper',
    set: 'fenkeeper',
    name: 'B2a: darker peat wainscot',
    wall: recolour(wallOf(FENKEEPER, 'fenkeeper'), FEN_PAPER),
  },
  {
    id: 'fenkeeper-pale-wood',
    set: 'fenkeeper',
    name: 'B2b: furniture in pale reed oak',
    pieces: furniture(FENKEEPER, FEN_WOOD),
  },
];
