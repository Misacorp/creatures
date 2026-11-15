/**
 * Sugarplum: a workshop demo style (not content, nothing in the game imports it). Soft pastel lacquer, mint cushions
 * and lavender hearts: every outline round (an arched bed, a round-windowed cupboard, a pouf, a globe lamp, an oval
 * mirror). Made from a style alone, with no hand pixels. Render it with `pnpm housing sheet sugarplum` (and `--room`).
 */
import type { Style } from '../style';

export const SUGARPLUM: Style = {
  id: 'sugarplum',
  name: 'Sugarplum',
  palette: {
    k: '#0d0a1a',
    a: '#ffd3df',
    b: '#f2a9bf',
    c: '#c97895',
    e: '#c9f2e0',
    f: '#92d8bc',
    g: '#5aa892',
    h: '#ffffff',
    i: '#fdf3e6',
    j: '#dcc6ae',
    m: '#fff0b8',
    n: '#f0cf7a',
    s: '#9fd4f2',
    r: '#cbb0f4',
    q: '#9d7ad8',
    p: '#6e52aa',
    y: '#fff4c8',
    z: '#ffc9dc',
  },
  wood: { hi: 'h', light: 'a', mid: 'b', dark: 'c' },
  cloth: { light: 'e', mid: 'f', dark: 'g' },
  linen: { hi: 'h', light: 'i', mid: 'i', dark: 'j' },
  metal: { hi: 'h', light: 'm', mid: 'n', dark: 'c' },
  glass: { hi: 'h', light: 'h', mid: 's', dark: 'q' },
  accent: { light: 'r', mid: 'q', dark: 'p' },
  leg: 'tapered',
  foot: 'ball',
  trim: 'scallop',
  top: 'rounded',
  motif: 'heart',
  weave: 'dots',
  lamp: 'globe',
  lampMaterial: 'cloth',
  glow: { kind: 'ring', inner: 'y', outer: 'z' },
  rug: { shape: 'capsule', weave: 'dots', border: 'dots', motifs: 'centre' },
  picture: 'sun',
  shelf: ['toy', 'jar', 'vase', 'shell'],
  shapes: {
    bed: { head: 'arched', foot: 'low', blanket: 'quilt' },
    cupboard: { top: 'arched', doors: 'panel', base: 'bun' },
    table: { kind: 'pedestal', skirt: 'cloth' },
    shelf: { bracket: 'rope', board: 'plank' },
    stool: { kind: 'pouf', mark: true },
    frame: { kind: 'mirror' },
    curtains: { kind: 'cafe', pane: 'arched', valance: 'none' },
  },
};
