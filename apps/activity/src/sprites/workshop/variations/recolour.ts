/**
 * Small helpers for art variations (pictures Misa picks from; nothing in the game imports them): a sprite with some of its
 * palette colours swapped, a piece with the swap on its body layers. The rows never change, so an outline stays what it was.
 */
import type { PieceArt } from '../../../housing/house-art';
import type { SpriteDef } from '../../sprite-data';

/** Hex colour to hex colour, lower case: `{ '#c4beb6': '#4a4866' }`. A colour not named stays. */
export type Swap = Readonly<Record<string, string>>;

export function recolour(def: SpriteDef, swap: Swap): SpriteDef {
  return {
    ...def,
    palette: Object.fromEntries(
      Object.entries(def.palette).map(([key, colour]) => [
        key,
        swap[colour.toLowerCase()] ?? colour,
      ]),
    ),
  };
}

/** The body of a piece (its sprite and front layer) recoloured; the glow and the light stay as drawn. */
export function recolourPiece(art: PieceArt, swap: Swap): PieceArt {
  return {
    ...art,
    sprite: recolour(art.sprite, swap),
    ...(art.front === undefined ? {} : { front: recolour(art.front, swap) }),
  };
}
