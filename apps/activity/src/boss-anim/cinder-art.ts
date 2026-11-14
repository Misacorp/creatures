/**
 * The Cinder Wyrm's own art for its move animations. Palette: `k` ink, `r` ember red, `d` dark ember, `y` flame yellow, `w` white-hot.
 * Weapons point UP, gripped at the bottom centre (the frame turns them). Wired up in `looks.ts`.
 */
import type { SpriteDef } from '../sprites/sprite-data';
import { BURST, mirrorDown, sym } from './assets';

const CINDER = {
  k: '#0d0a1a',
  r: '#ef6a3a',
  d: '#8a2a12',
  y: '#ffd25a',
  w: '#fff3c4',
  s: '#4a3a46',
} as const;

/** A fire lance: a flame for a head on a shaft of black stone cracked with magma: the Scorch Lane, down a lane. */
export const CINDER_LANCE: SpriteDef = {
  palette: CINDER,
  rows: sym([
    '.....k',
    '....ky',
    '...kyw',
    '...kyw',
    '..kyrw',
    '..kyrw',
    '.kkrry',
    '.krrdk',
    '..kkds',
    '....ks',
    '....kr',
    '....ks',
    '....kd',
    '....ks',
    '....kr',
    '....ks',
    '....kd',
    '....ks',
    '....kr',
    '....ks',
    '...kds',
    '....kk',
  ]),
};

/** A rolling flame wave, three tongues on its crest: the Wyrm's sweeps across a row. */
export const CINDER_WAVE: SpriteDef = {
  palette: CINDER,
  rows: sym([
    '....k...k',
    '...kyk.kw',
    '..kyykkyw',
    '..kyrrrww',
    '.kyrrrrdw',
    '.kyrrdkkk',
    'kyrrdk...',
    'kyrdk....',
    'kddk.....',
    'kkk......',
  ]),
};

/** A falling fireball, trailing sparks: the plain attack and single shells. */
export const CINDER_FIREBALL: SpriteDef = {
  palette: CINDER,
  rows: sym([
    '..kkk',
    '.kyww',
    'kyrww',
    'kyrrw',
    'kyrrr',
    '.kdrr',
    '..kdr',
    '..kkd',
    '...kr',
    '....k',
    '..k..',
  ]),
};

/** Embers raining down: the Cinder Fall, a few creatures at once. */
export const CINDER_SHOWER: SpriteDef = {
  palette: CINDER,
  rows: [
    '..kkk........',
    '.kyww..kkk...',
    'kyrrwk.kyrk..',
    'kyrrrk.kdrk.k',
    '.kdrk...kk.kk',
    '..kdk..kk..yk',
    '...k..kyrk.kr',
    '..k...kdrk.k.',
    '.......kk....',
    '..k..........',
  ],
};

/** A leaping flame with a curled tail, hopping between creatures: the Ember Leap. */
export const CINDER_LEAP: SpriteDef = {
  palette: CINDER,
  rows: [
    '....kkk....',
    '...kywwk...',
    '..kyrwwk...',
    '..kyrrrk...',
    '...kdrrk...',
    '....kdrkk..',
    '.....kdrrk.',
    '....kkdrk..',
    '...krrdk...',
    '..krdkk....',
    '..kdk......',
    '...k.......',
  ],
};

/** A star of fire with a white-hot core: the Eruption, over the whole board. */
export const CINDER_ERUPTION: SpriteDef = {
  palette: CINDER,
  rows: mirrorDown([
    '.......k.......',
    '......kyk......',
    '.....kywyk.....',
    '....kyrwryk....',
    '.kkkyrrwrrykkk.',
    'kyyyrrrwrrryyyk',
    '.kkkyrrwrrykkk.',
    '....kyrwryk....',
  ]),
};

/** Fire flashing where it lands. */
export const CINDER_BURST: SpriteDef = {
  palette: { k: '#0d0a1a', a: '#ef6a3a', b: '#8a2a12', c: '#ffd25a' },
  rows: BURST.rows,
};
