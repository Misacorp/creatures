/**
 * The Lantern Night style (`docs/design/housing-workshop.md`): Paper lanterns and bunting on painted red lacquer, with a hanging tassel.
 * The palette is the set's own (its pack file draws the hand pieces with it); the ramps name its keys by material.
 */
import type { Style } from '../style';

export const LANTERN_NIGHT: Style = {
  id: 'lantern-night',
  name: 'Lantern Night',
  palette: {
    k: '#0d0a1a',
    a: '#cf3a3a',
    b: '#f06a58',
    c: '#8e2437',
    d: '#f4c24a',
    e: '#b9852a',
    f: '#f7edd2',
    g: '#d6c49a',
    h: '#5c2b3a',
    i: '#6a9fd8',
  },
  wood: { light: 'b', mid: 'a', dark: 'c' },
  cloth: { light: 'f', mid: 'f', dark: 'g' },
  linen: { hi: 'f', light: 'f', mid: 'g', dark: 'e' },
  metal: { hi: 'd', light: 'd', mid: 'e', dark: 'h' },
  glass: { hi: 'f', light: 'f', mid: 'i', dark: 'h' },
  accent: { hi: 'd', light: 'd', mid: 'e', dark: 'h' },
  leg: 'straight',
  foot: 'block',
  trim: 'zigzag',
  top: 'peaked',
  motif: 'tassel',
  weave: 'checks',
  lamp: 'paper',
  lampMaterial: 'wood',
  glow: { kind: 'stipple', inner: 'd', outer: 'b' },
  rug: { shape: 'square', weave: 'checks', motifs: 'row' },
  picture: 'moon',
  shelf: ['candle', 'bowl', 'books'],
  shapes: {
    bed: { head: 'posts' },
    cupboard: { top: 'cornice', doors: 'lattice' },
    stool: { kind: 'drum' },
    curtains: { kind: 'straight', valance: 'scallop' },
  },
};
