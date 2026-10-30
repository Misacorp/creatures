/**
 * The charm sprites (12x12), one per item look (`itemLookId` in `gear-sprites.ts`): every charm with
 * its own name has its own sprite, and element versions with the same stats share one, tinted by
 * element. Keys: `k` ink; `t` main, `u` shade, `h` highlight (the tint swaps these three, so
 * every sprite uses them for its main colour); a set piece also has `g` and `w`, the gold trim no
 * tint changes. A few fixed accent keys per sprite are fine (a cord, a bead). Drawn from each item's
 * name and flavour line (`gear.json`); checked by `gear-sprites.test.ts` and `pnpm art items`.
 */
import type { SpriteDef } from '../sprite-data';

const INK = '#0d0a1a';
const NEUTRAL = { t: '#9a98ae', u: '#6a6882', h: '#d8d6e6' } as const;
const CORD = '#c9a66b';
const GOLD = { g: '#f6d56a', w: '#fff6d8' } as const;

export const CHARM_SPRITE_DATA: Readonly<Record<string, SpriteDef>> = {
  // A smooth stone on a knotted cord: the plain charm every element wears.
  'trail-charm': {
    mirror: true,
    palette: { k: INK, c: CORD, ...NEUTRAL },
    rows: [
      '....kk',
      '...kcc',
      '..kc..',
      '..kc..',
      '..kkkk',
      '.kthhh',
      'kthhtt',
      'kthttt',
      'kttttt',
      'kuuttt',
      '.kuuuu',
      '..kkkk',
    ],
  },
  // A ringed compass: cream face, red needle north, shade needle south.
  'crossroads-compass': {
    mirror: true,
    palette: { k: INK, f: '#fff6d8', r: '#d94b4b', ...NEUTRAL },
    rows: [
      '....kk',
      '...kth',
      '..kkkk',
      '.kthhh',
      'kthffr',
      'kthfrr',
      'ktkffk',
      'ktffuu',
      'kufffu',
      'kuffff',
      '.kuuuu',
      '..kkkk',
    ],
  },
  // A tall bell on a ring handle.
  'wardens-bell': {
    mirror: true,
    palette: { k: INK, ...NEUTRAL },
    rows: [
      '...kkk',
      '...k..',
      '...kkk',
      '...kth',
      '..kthh',
      '..kthh',
      '.kthht',
      '.kthtt',
      '.kttuu',
      'kthttu',
      'kuuuuu',
      '.kkkkk',
    ],
  },
  // A round hand bell with a brass lip and a wooden handle.
  'hearth-bell': {
    mirror: true,
    palette: { k: INK, c: CORD, b: '#e0b04a', ...NEUTRAL },
    rows: [
      '....kk',
      '....kc',
      '....kc',
      '...kkk',
      '..kthh',
      '.kthhh',
      'kthhtt',
      'kthttt',
      'kttttu',
      'kbbbbb',
      'kkkkkk',
      '....kk',
    ],
  },
  // A clay tile with a paw pressed into it.
  'footprint-charm': {
    palette: { k: INK, ...NEUTRAL },
    rows: [
      '.kkkkkkkkkk.',
      'khhhhhhhhhtk',
      'khttuttutttk',
      'khututtututk',
      'khuttttttutk',
      'khtttuuttttk',
      'khtuuuuuuttk',
      'khtuuuuuuttk',
      'khttuuuutttk',
      'khttttttttuk',
      'kuuuuuuuuuuk',
      '.kkkkkkkkkk.',
    ],
  },
  // A claw on a string.
  'pounce-charm': {
    palette: { k: INK, c: CORD, ...NEUTRAL },
    rows: [
      '...kkkk.....',
      '..kccccck...',
      '..kckkkck...',
      '..kkthhhk...',
      '.kthhhttk...',
      '.kthhtttuk..',
      '.kkttttuuk..',
      '..kttttuuk..',
      '...kttuuk...',
      '....kttuk...',
      '.....ktuk...',
      '......kk....',
    ],
  },
  // A paper lantern with gold caps and a flame.
  'festival-lantern-charm': {
    mirror: true,
    palette: { k: INK, ...NEUTRAL, ...GOLD },
    rows: [
      '....kk',
      '...kgg',
      '.kkggg',
      '.kthhg',
      'kthhtg',
      'kthwwg',
      'kttwwg',
      'kttttg',
      'kuttug',
      '.kuuug',
      '.kkggg',
      '....kg',
    ],
  },
  // A locket on a gold chain, a drop of tide in its window.
  'tidepool-locket': {
    mirror: true,
    palette: { k: INK, ...NEUTRAL, ...GOLD },
    rows: [
      '....kk',
      '...kgg',
      '...kg.',
      '...kkk',
      '..kkgg',
      '.kgthh',
      'kgthhh',
      'kgtwtt',
      'kguttt',
      'kguttt',
      '.kgguu',
      '..kkkk',
    ],
  },
  // A glowing hexagonal token with a gold rim.
  'forge-warm-token': {
    mirror: true,
    palette: { k: INK, ...NEUTRAL, ...GOLD },
    rows: [
      '..kkkk',
      '.kghhh',
      'kgthhh',
      'kgtttt',
      'kgtwww',
      'kgtwwt',
      'kgtwwu',
      'kgtwuu',
      'kguuuu',
      'kguuuu',
      '.kgguu',
      '..kkkk',
    ],
  },
  // A knot of four loops tied with a gold band.
  'hollow-weave-knot': {
    mirror: true,
    palette: { k: INK, ...NEUTRAL, ...GOLD },
    rows: [
      '.kkkk.',
      'kthhhk',
      'khkkuk',
      'khkkuk',
      'kttuuk',
      '.kkgwg',
      '.kkgwg',
      'kthhhk',
      'khkkuk',
      'khkkuk',
      'kttuuk',
      '.kkkk.',
    ],
  },
  // A glass bead with a copper heart, on a cord.
  'ridge-copper-bead': {
    mirror: true,
    palette: { k: INK, o: '#d9803a', ...NEUTRAL, ...GOLD },
    rows: [
      '....kg',
      '....kg',
      '...kgw',
      '..kthh',
      '.kthhh',
      '.khoow',
      '.ktooo',
      '.ktoou',
      '.kuuuu',
      '..kggg',
      '....kg',
      '....kg',
    ],
  },
  // A whistle with a gold loop.
  'watchmans-whistle': {
    palette: { k: INK, ...NEUTRAL, ...GOLD },
    rows: [
      '............',
      '........kkk.',
      '.......kgwgk',
      '.......kg.gk',
      '.......kgggk',
      '....kkkkkkkk',
      '...kthhhhhtk',
      '.kkkhhhhhttk',
      'kthhhhkkttuk',
      'kttttttttuuk',
      'kkkkkkuuuuuk',
      '.....kkkkkk.',
    ],
  },
  // A ladle with a long handle and a gold band.
  'helpers-ladle': {
    palette: { k: INK, ...NEUTRAL, ...GOLD },
    rows: [
      '........kkk.',
      '.......kgwk.',
      '......ktk...',
      '.....ktk....',
      '....ktk.....',
      '..kkkgk.....',
      '.kthhhhk....',
      'kthhhttuk...',
      'kthttttuk...',
      'kttttuuuk...',
      '.kuuuuuk....',
      '..kkkkk.....',
    ],
  },
  // A bare clay paw print with a gold band.
  'firstfoot-print': {
    palette: { k: INK, ...NEUTRAL, ...GOLD },
    rows: [
      '..kkkkkkk...',
      '..kwtkwtk...',
      '..kttkttk...',
      '..kkkkkkk...',
      'kkk.....kkkk',
      'kwkkkkkkkwtk',
      'ktkhhtttkttk',
      'kkkhhttukkkk',
      '.khhttttuk..',
      'khhhtgggtuuk',
      '.kttttttuuk.',
      '..kkkkkkkk..',
    ],
  },
  // A milk tooth on a cord, a gold wire round its neck.
  'pouncers-tooth': {
    mirror: true,
    palette: { k: INK, c: CORD, ...NEUTRAL, ...GOLD },
    rows: [
      '....kk',
      '...kcc',
      '..kc..',
      '.kkggg',
      'kthhww',
      'kthhtt',
      'kttttt',
      'kttttu',
      '.kttuu',
      '.kttku',
      '..ktku',
      '..kkk.',
    ],
  },
  // A coin with a gold rim and a fork in the road.
  'wanderers-coin': {
    mirror: true,
    palette: { k: INK, ...NEUTRAL, ...GOLD },
    rows: [
      '...kkk',
      '..kgww',
      '.kgthh',
      'kgtutt',
      'kgttut',
      'kgtttu',
      'kgtttu',
      'kgtttu',
      'kgtttt',
      '.kgttu',
      '..kggg',
      '...kkk',
    ],
  },
};
