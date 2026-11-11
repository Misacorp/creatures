/**
 * The Tidepool style (`docs/design/housing-workshop.md`): Driftwood with scalloped shell edges; sea blue, sand, pearl white.
 * The palette is the set's own (its pack file draws the hand pieces with it); the ramps name its keys by material.
 */
import type { Style } from '../style';

export const TIDEPOOL: Style = {
  id: 'tidepool',
  name: 'Tidepool',
  palette: {
    k: '#0d0a1a',
    a: '#cdb994',
    b: '#a58f6c',
    c: '#8a7656',
    d: '#86d4e2',
    e: '#3f9cc0',
    f: '#276d92',
    g: '#efe0b4',
    h: '#fbf8ee',
    m: '#f2a3a8',
    n: '#8fe3cc',
    w: '#c2e8ee',
    s: '#8ccaf2',
    t: '#e2f2fb',
    y: '#fff2b8',
    z: '#ffd98a',
  },
  wood: { hi: 'g', light: 'a', mid: 'b', dark: 'c' },
  cloth: { light: 'd', mid: 'e', dark: 'f' },
  linen: { hi: 'h', light: 'h', mid: 'g', dark: 'a' },
  metal: { hi: 'h', light: 'g', mid: 'b', dark: 'c' },
  glass: { hi: 't', light: 't', mid: 's', dark: 'e' },
  accent: { hi: 'h', light: 'm', mid: 'n', dark: 'e' },
  leg: 'straight',
  foot: 'block',
  trim: 'scallop',
  top: 'scallop',
  motif: 'shell',
  weave: 'waves',
  lamp: 'dome',
  lampMaterial: 'linen',
  glow: { kind: 'ring', inner: 'y', outer: 'z' },
  rug: { shape: 'rounded', weave: 'waves' },
  picture: 'sea',
  shelf: ['shell', 'jar', 'crystal'],
};
