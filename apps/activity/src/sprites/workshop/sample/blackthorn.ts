/**
 * Blackthorn: a workshop demo style (not content, nothing in the game imports it). Black wrought iron with gold
 * fleurs, wine-red velvet and candlelight: pointed gothic outlines, lattice glass, scroll brackets and a chandelier.
 * Made from a style alone, with no hand pixels, to show that the form variants give a set its own silhouette. Render
 * it with `pnpm housing sheet blackthorn` (and `--room`).
 */
import type { Style } from '../style';

export const BLACKTHORN: Style = {
  id: 'blackthorn',
  name: 'Blackthorn',
  palette: {
    k: '#0d0a1a',
    w: '#9a94b8',
    a: '#6e6890',
    b: '#4c476a',
    c: '#322e4c',
    e: '#d0506a',
    f: '#962e4a',
    g: '#601a34',
    h: '#fff6dc',
    i: '#efe0b8',
    j: '#c9ad78',
    s: '#9c8ee0',
    u: '#5a4ca8',
    r: '#ffd97a',
    q: '#d9a443',
    p: '#9a6a2a',
    y: '#ffe9a8',
    z: '#f2b85a',
  },
  wood: { hi: 'w', light: 'a', mid: 'b', dark: 'c' },
  cloth: { light: 'e', mid: 'f', dark: 'g' },
  linen: { hi: 'h', light: 'i', mid: 'i', dark: 'j' },
  metal: { hi: 'r', light: 'r', mid: 'q', dark: 'p' },
  glass: { hi: 'h', light: 'h', mid: 's', dark: 'u' },
  accent: { hi: 'r', light: 'r', mid: 'q', dark: 'p' },
  leg: 'turned',
  foot: 'ball',
  trim: 'dentil',
  top: 'peaked',
  motif: 'fleur',
  weave: 'diamonds',
  lamp: 'chandelier',
  lampMaterial: 'linen',
  glow: { kind: 'stipple', inner: 'y', outer: 'z' },
  rug: { shape: 'pointed', weave: 'diamonds', border: 'stripe', motifs: 'centre' },
  picture: 'moon',
  shelf: ['candle', 'books', 'bottle', 'candle'],
  shapes: {
    bed: { head: 'pointed', foot: 'board', blanket: 'sheet' },
    cupboard: { top: 'crest', doors: 'lattice', base: 'bun', narrow: true },
    table: { kind: 'pedestal', skirt: 'apron' },
    shelf: { bracket: 'scroll', board: 'thick' },
    stool: { kind: 'spool', mark: true },
    frame: { kind: 'crest' },
    curtains: { kind: 'straight', pane: 'arched', valance: 'none' },
  },
};
