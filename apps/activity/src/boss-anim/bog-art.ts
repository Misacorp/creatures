/**
 * Old Bogback's own art for its move animations. Palette: `k` ink, `m` wet mud, `d` dark peat, `l` dry mud, `g` bog green, `y` bubble.
 * Weapons point UP, gripped at the bottom centre (the frame turns them). Wired up in `looks.ts`.
 */
import type { SpriteDef } from '../sprites/sprite-data';
import { BURST, sym } from './assets';

const BOG = {
  k: '#0d0a1a',
  m: '#7a5a3a',
  d: '#3e2c1a',
  l: '#b08a5a',
  g: '#8a9a3a',
  y: '#d7e08a',
} as const;

/** Colours of the harpoon alone: light, so it reads on the dark board. `b` pale bone, `t` tan, `o` ochre, `h` shade. */
const HARPOON = {
  k: '#0d0a1a',
  b: '#f4ecd0',
  t: '#e6cf94',
  o: '#c9a35e',
  h: '#8a6a3a',
  g: '#8a9a3a',
} as const;

/** A harpoon of gnarled root, caked in mud, a pale bone barb and clots on the shaft: the Mud Slide, down a lane. */
export const BOG_HARPOON: SpriteDef = {
  palette: HARPOON,
  rows: sym([
    '.....k',
    '....kb',
    '...kbb',
    '...kbb',
    '..kkbt',
    '.kbbkt',
    'kbttkt',
    '.kkkkh',
    '...kto',
    '...kto',
    '...kto',
    '...koh',
    '...kto',
    '...kto',
    '...kto',
    '...kto',
    '...kto',
    '...koh',
    '...kto',
    '...kto',
    '...kto',
    '...kto',
    '...koh',
    '...kto',
    '...kto',
    '...kth',
    '....kk',
  ]),
};

/** A heavy wave of mud, a bubble on its lip, rolling over a row: the sweeps and the Belly Flop. */
export const BOG_WAVE: SpriteDef = {
  palette: BOG,
  rows: sym([
    '.....kkkk',
    '...kkllly',
    '..klllmmg',
    '..klmmmmm',
    '.klmmmdmm',
    '.kmmdgkkk',
    'kmmdgk...',
    'kmddk....',
    'kddk.....',
    'kkk......',
  ]),
};

/** A glob of mud, a bubble in it and a drip behind: the Sinkhole and the plain attack. */
export const BOG_GLOB: SpriteDef = {
  palette: BOG,
  rows: sym([
    '..kkk',
    '.klly',
    'kllmm',
    'klmmm',
    'kmmmm',
    '.kmmd',
    '..kmd',
    '..kkd',
    '...km',
    '....k',
    '..k..',
  ]),
};

/** Three clots of mud spat out: the Mud Spit. */
export const BOG_SPLATS: SpriteDef = {
  palette: BOG,
  rows: [
    '..kkk........',
    '.klly..kkk...',
    'kllmmk.kllk..',
    'kmmmdk.kmmk.k',
    '.kmdk...kk.kk',
    '..kmk..kk..yk',
    '...k..klmk.km',
    '..k...kmdk.k.',
    '.......kk....',
    '..k..........',
  ],
};

/** Mud splattering where it lands. */
export const BOG_SPLAT: SpriteDef = {
  palette: { k: '#0d0a1a', a: '#7a5a3a', b: '#3e2c1a', c: '#b08a5a' },
  rows: BURST.rows,
};
