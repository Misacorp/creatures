/**
 * The Thornmother's own art for its move animations. Palette: `k` ink, `g` leaf green, `d` deep green, `l` pale leaf, `t` ivory thorn,
 * `p` petal pink. Weapons point UP, gripped at the bottom centre (the frame turns them). Wired up in `looks.ts`.
 */
import type { SpriteDef } from '../sprites/sprite-data';
import { BURST, sym } from './assets';

const THORN = {
  k: '#0d0a1a',
  g: '#5cbf5a',
  d: '#1f5a2a',
  l: '#d4f5a0',
  t: '#f1ead0',
  p: '#f08fb0',
} as const;

/** A spear of one long ivory thorn on a shaft of twisted vine with thorns standing out: Grasping Vines, down a lane. */
export const THORN_SPEAR: SpriteDef = {
  palette: THORN,
  rows: sym([
    '.....k',
    '....kt',
    '....kt',
    '...ktt',
    '...ktl',
    '..kktg',
    '..kdgg',
    '.kt.kg',
    '..kdkg',
    '....kd',
    '.kt.kg',
    '..kdgd',
    '....kg',
    '....kd',
    '.kt.kg',
    '..kdgd',
    '....kg',
    '....kd',
    '.kt.kg',
    '..kdgd',
    '...kdg',
    '....kk',
  ]),
};

/** A creeping bramble, a crescent of tangled vine bristling with thorns: the sweeps in from both ends of a row. */
export const THORN_BRAMBLE: SpriteDef = {
  palette: THORN,
  rows: sym([
    '....t...t',
    '...ktk.kg',
    '..kggkkgl',
    '..kgdggdg',
    '.ktdgggdt',
    '.kgdgdkkk',
    'ktgdgk...',
    'kgdgk....',
    'kdtk.....',
    'kkk......',
  ]),
};

/** A seed pod falling, a shell split to show the seed: the Bramble Cross. */
export const THORN_POD: SpriteDef = {
  palette: THORN,
  rows: sym([
    '..kkk',
    '.kgll',
    'kgglp',
    'kgdpp',
    'kgdlp',
    '.kgdl',
    '..kgd',
    '..kdg',
    '...kd',
    '....k',
    '..k..',
  ]),
};

/** A cloud of thorns raining down: the Thorn Rain. */
export const THORN_RAIN: SpriteDef = {
  palette: THORN,
  rows: [
    '...k.....k...',
    '..kt....kt...',
    '..kt.k..kt.k.',
    '..kg.kt.kg.kt',
    '..kg.kt..k.kt',
    '...k.kg.kt.kg',
    '.kt..kg.kt.k.',
    '.kt...k.kg...',
    '.kg.....kg...',
    '..k......k...',
  ],
};

/** A barbed vine whip cracking from creature to creature: the Thorn Lash. */
export const THORN_LASH: SpriteDef = {
  palette: THORN,
  rows: [
    '....kkk..',
    '...ktgk..',
    '..kglk...',
    '.ktgk....',
    '.kgdgggk.',
    '.kkkktgk.',
    '....kgdk.',
    '...ktgk..',
    '..kgdk...',
    '..ktk....',
    '..kdk....',
    '...k.....',
  ],
};

/** Petals and leaves flying out where a thorn lands. */
export const THORN_BURST: SpriteDef = {
  palette: { k: '#0d0a1a', a: '#5cbf5a', b: '#1f5a2a', c: '#f8b8d0' },
  rows: BURST.rows,
};
