/**
 * The Ancient style (`docs/design/housing-workshop.md`): Carved standing-stone slabs, spiral carvings and worn gold leaf.
 * The palette is the set's own (its pack file draws the hand pieces with it); the ramps name its keys by material.
 */
import type { Style } from '../style';

export const ANCIENT: Style = {
  id: 'ancient',
  name: 'Ancient',
  palette: {
    k: '#0d0a1a',
    a: '#ecd9a8',
    b: '#d0b07a',
    c: '#a28558',
    d: '#6d583e',
    e: '#e8c04c',
    f: '#a8822a',
    g: '#55a392',
    h: '#2f6e68',
  },
  wood: { light: 'a', mid: 'b', dark: 'c', deep: 'd' },
  cloth: { light: 'g', mid: 'g', dark: 'h' },
  linen: { light: 'a', mid: 'b', dark: 'c' },
  metal: { hi: 'e', light: 'e', mid: 'f', dark: 'd' },
  glass: { hi: 'a', light: 'g', mid: 'g', dark: 'h' },
  accent: { hi: 'e', light: 'e', mid: 'f', dark: 'd' },
  leg: 'straight',
  foot: 'block',
  trim: 'dentil',
  top: 'stepped',
  motif: 'spiral',
  weave: 'diamonds',
  lamp: 'bowl',
  lampMaterial: 'wood',
  glow: { kind: 'stipple', inner: 'e', outer: 'a' },
  rug: { shape: 'square', weave: 'diamonds' },
  picture: 'sun',
  shelf: ['bowl', 'crystal', 'jar'],
  shapes: {
    table: { kind: 'slab', skirt: 'none' },
    stool: { kind: 'spool' },
    curtains: { kind: 'bare', valance: 'none' },
  },
};
