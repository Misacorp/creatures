/**
 * The Quiet Verge style (`docs/design/housing-workshop.md`): Dusk-violet stone edged in pale rim light, arches with a warm star inside, chips of stone that float; window dark, lilac, star gold.
 * Made by `pnpm housing new-set quiet-verge` from the blackthorn style: a starting point, not a design.
 * TODO(artist): palette, variants and motif below; then `pnpm housing sheet quiet-verge`, look, repeat.
 */
import type { Style } from '../style';

export const QUIET_VERGE: Style = {
  id: 'quiet-verge',
  name: 'Quiet Verge',
  // TODO(artist): the set's own colours (8 to 10 and the ink `k`); the ramps below name its keys.
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
  // TODO(artist): the variants: leg, foot, trim, top, motif, weave, lamp, rug, picture, shelf. Pick the ones that make the set's silhouette.
  leg: 'turned',
  foot: 'ball',
  trim: 'dentil',
  top: 'peaked',
  // TODO(artist): the one motif that appears on every piece (docs/design/housing.md section 5).
  motif: 'fleur',
  weave: 'diamonds',
  lamp: 'chandelier',
  lampMaterial: 'linen',
  glow: { kind: 'stipple', inner: 'y', outer: 'z' },
  rug: { shape: 'pointed', weave: 'diamonds', border: 'stripe', motifs: 'centre' },
  picture: 'moon',
  // TODO(artist): what stands on the shelf, left to right.
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
