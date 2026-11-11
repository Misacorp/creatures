/**
 * The Stormglass style (`docs/design/housing-workshop.md`): Pale ash with a lightning scar, copper coils and glass beads; chamfered corners and splayed legs.
 * The palette is the set's own (its pack file draws the hand pieces with it); the ramps name its keys by material.
 */
import type { Style } from '../style';

export const STORMGLASS: Style = {
  id: 'stormglass',
  name: 'Stormglass',
  palette: {
    k: '#0d0a1a',
    a: '#e6e1d8',
    b: '#c4beb6',
    c: '#8d889a',
    d: '#54546c',
    e: '#e28c3c',
    f: '#a05a26',
    g: '#8a68ee',
    h: '#d6caff',
    i: '#fff08c',
  },
  wood: { light: 'a', mid: 'b', dark: 'c' },
  cloth: { hi: 'h', light: 'h', mid: 'g', dark: 'd' },
  linen: { hi: 'a', light: 'a', mid: 'b', dark: 'c' },
  metal: { hi: 'e', light: 'e', mid: 'e', dark: 'f' },
  glass: { hi: 'i', light: 'h', mid: 'g', dark: 'd' },
  accent: { hi: 'i', light: 'e', mid: 'e', dark: 'f' },
  leg: 'splayed',
  foot: 'none',
  trim: 'zigzag',
  top: 'rounded',
  motif: 'bolt',
  weave: 'zigzag',
  lamp: 'cage',
  lampMaterial: 'metal',
  glow: { kind: 'dither', inner: 'h', outer: 'g' },
  rug: { shape: 'square', weave: 'zigzag' },
  picture: 'storm',
  shelf: ['crystal', 'bottle', 'jar'],
};
