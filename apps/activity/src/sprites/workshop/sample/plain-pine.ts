/**
 * Plain Pine: the workshop's demo style (not content, nothing in the game imports it). Pale pine with straight
 * legs, sage cloth and a red gingham accent: a set made from a style alone, with no hand overrides, to show what the
 * forms draw. Render it with `pnpm housing sheet plain-pine`.
 */
import type { Style } from '../style';

export const PLAIN_PINE: Style = {
  id: 'plain-pine',
  name: 'Plain Pine',
  palette: {
    k: '#0d0a1a',
    w: '#f6e2b8',
    a: '#e8c48a',
    b: '#c99a5e',
    c: '#9a6c3e',
    e: '#b4cfa2',
    f: '#86a874',
    g: '#5e8052',
    h: '#fdf9ee',
    i: '#f0e6cc',
    j: '#d6c59c',
    m: '#d4d8e0',
    n: '#9096a6',
    o: '#5c6274',
    t: '#e2f2fb',
    s: '#8ccaf2',
    u: '#5a8cc0',
    r: '#e8705e',
    q: '#bc4c42',
    p: '#86322e',
    y: '#fff2b8',
    z: '#ffd98a',
  },
  wood: { hi: 'w', light: 'a', mid: 'b', dark: 'c' },
  cloth: { light: 'e', mid: 'f', dark: 'g' },
  linen: { hi: 'h', light: 'i', mid: 'i', dark: 'j' },
  metal: { light: 'm', mid: 'n', dark: 'o' },
  glass: { hi: 't', light: 't', mid: 's', dark: 'u' },
  accent: { light: 'r', mid: 'q', dark: 'p' },
  leg: 'straight',
  foot: 'none',
  trim: 'bead',
  top: 'square',
  motif: 'knot',
  weave: 'checks',
  lamp: 'dome',
  lampMaterial: 'cloth',
  glow: { kind: 'ring', inner: 'y', outer: 'z' },
  rug: { shape: 'rounded', weave: 'stripes' },
  picture: 'hills',
  shelf: ['books', 'plant', 'jar', 'candle'],
};
