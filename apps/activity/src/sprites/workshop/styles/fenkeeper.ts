/**
 * The Fenkeeper style (`docs/design/housing-workshop.md`): Dark bog oak with reed binding and an oil-sheen opal.
 * The palette is the set's own (its pack file draws the hand pieces with it); the ramps name its keys by material.
 */
import type { Style } from '../style';

export const FENKEEPER: Style = {
  id: 'fenkeeper',
  name: 'Fenkeeper',
  palette: {
    k: '#0d0a1a',
    a: '#9a7752',
    b: '#c4a176',
    c: '#6e523a',
    d: '#cdb978',
    e: '#8d7b45',
    f: '#3f7f7a',
    g: '#8bc4b2',
    h: '#b794f0',
    i: '#f1e9ff',
  },
  wood: { light: 'b', mid: 'a', dark: 'c' },
  cloth: { light: 'g', mid: 'f', dark: 'c' },
  linen: { hi: 'i', light: 'd', mid: 'd', dark: 'e' },
  metal: { light: 'd', mid: 'e', dark: 'c' },
  glass: { hi: 'i', light: 'g', mid: 'f', dark: 'c' },
  accent: { hi: 'i', light: 'h', mid: 'h', dark: 'e' },
  leg: 'turned',
  foot: 'none',
  trim: 'reed',
  top: 'rounded',
  motif: 'opal',
  weave: 'stripes',
  lamp: 'paper',
  lampMaterial: 'linen',
  glow: { kind: 'stipple', inner: 'h', outer: 'g' },
  rug: { shape: 'rounded', weave: 'stripes' },
  picture: 'reeds',
  shelf: ['jar', 'plant', 'bottle'],
  shapes: {
    cupboard: { top: 'rounded' },
    stool: { kind: 'drum' },
    curtains: { kind: 'bare', valance: 'none' },
  },
};
