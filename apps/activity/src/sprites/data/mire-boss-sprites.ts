/**
 * Pixel sprites for the Mire bosses: the raid boss Old Bogback (24x24, drawn from its brief in
 * `bosses-lore.json`, in the style of `boss-sprites.ts`) and the dungeon's Mire foes (16x16 foes and
 * a 24x24 floor boss, in the style of `dungeon-sprites.ts` and `dungeon-boss-sprites.ts`).
 *
 * These are not yet in `BOSS_SPRITE_DATA`, `DUNGEON_FOE_SPRITE_DATA` or `DUNGEON_BOSS_SPRITE_DATA`:
 * the content tests require a sprite for exactly the bosses and foes that exist, so the Mire content
 * slice adds them to those maps when `old-bogback`, `bog-toad`, `tar-leech` and `fen-lurker` exist.
 * Registering `old-bogback` in `BOSS_SPRITE_DATA` is also what `scripts/boss-portraits.mts` reads.
 */
import type { SpriteDef } from '../sprite-data';

export const MIRE_BOSS_SPRITE_DATA: Readonly<Record<string, SpriteDef>> = {
  // A huge, half-sunk ancient toad: eyes like two ochre lamps above the mud line, a wide patient
  // mouth, a warty peat back with cattails growing from it and a skin of tar and oily sheen below.
  'old-bogback': {
    mirror: true,
    palette: {
      k: '#0d0a1a',
      d: '#4f3822',
      b: '#8a6238',
      h: '#b8864a',
      o: '#d9a02e',
      y: '#f2d060',
      t: '#2a2230',
      n: '#4d9c8f',
      v: '#8a62b0',
      g: '#7d8a3c',
      r: '#6b3f22',
    },
    rows: [
      '............',
      '..........r.',
      '..........r.',
      '...kkkk...g.',
      '..kyyyykkkgk',
      '..kyttykbbgb',
      '..kkooookbhb',
      '.kbkkkkkbbhb',
      '.kbbbbbbbbbb',
      '.kbgghbbbhbb',
      'kkbbbbbbbbbb',
      'kkkkkkkkkkkk',
      'kkddddhbbbbb',
      'kdbbbbbbhbbh',
      'kdbhbbobbbbb',
      'kdbbbbbbbhbb',
      'kkdbbbbbbbbb',
      '.kdbbbbbbbbo',
      '..kbkbkbkbbd',
      '.kttttttttnt',
      'kttvtttntttt',
      '.kttnttttvtt',
      '..kkkttkkkkk',
      '............',
    ],
  },
};

export const MIRE_FOE_SPRITE_DATA: Readonly<Record<string, SpriteDef>> = {
  // A warty olive toad with two bulging eyes, a wide flat mouth and ochre toe pads.
  'bog-toad': {
    mirror: true,
    palette: {
      k: '#0d0a1a',
      e: '#fbf8ec',
      b: '#7a6a3a',
      h: '#a8944f',
      s: '#4a4022',
      p: '#d8c88a',
      t: '#2a2230',
      y: '#e8b830',
      o: '#d9a02e',
    },
    rows: [
      '........',
      '........',
      '........',
      '..kkk...',
      '.kyyykkk',
      '.kyetkbb',
      '.kkbbbbb',
      '.kbbhbbb',
      '.kbbbbob',
      '.kbbbbbb',
      '.kkkkkkk',
      '.kbbpppp',
      '.kbbpppp',
      '.kssbppp',
      'koookspp',
      '.kkkkkkk',
    ],
  },
  // A glossy tar-black leech standing up, with sheen bands, two pale eyes and a ringed ochre mouth.
  'tar-leech': {
    mirror: true,
    palette: {
      k: '#0d0a1a',
      e: '#fbf8ec',
      t: '#2a2230',
      n: '#4d9c8f',
      v: '#8a62b0',
      s: '#463b52',
      o: '#d9a02e',
    },
    rows: [
      '........',
      '.....kkk',
      '...kkttt',
      '..kttnnt',
      '.kttttvt',
      '.ktteett',
      '.ktteett',
      '.kttttoo',
      '.kttokkk',
      '.kttttoo',
      '..kttnnt',
      '...ksstt',
      '....kstt',
      '.....kkt',
      '......kk',
      '........',
    ],
  },
};

export const MIRE_DUNGEON_BOSS_SPRITE_DATA: Readonly<Record<string, SpriteDef>> = {
  // A bog-oak log that blinks: mossy bark, two ochre eyes opening, reeds sprouting from its back and
  // a crooked grin, half sunk in tar.
  'fen-lurker': {
    mirror: true,
    palette: {
      k: '#0d0a1a',
      d: '#4f3822',
      b: '#8a6238',
      h: '#b8864a',
      y: '#f2d060',
      t: '#2a2230',
      n: '#4d9c8f',
      v: '#8a62b0',
      g: '#7d8a3c',
      r: '#6b3f22',
    },
    rows: [
      '............',
      '............',
      '........r.r.',
      '........g.g.',
      '........g.g.',
      '....kkkkkgkk',
      '..kkbbhbbgbb',
      '.kbbbbbbbbbb',
      '.kbkyyyykbbb',
      '.kbkyttykbhb',
      '.kbkkyykkbbb',
      '.kbbbbbbbbbb',
      'kkkkkkkkkkkk',
      'kkbhbbbbhbbb',
      '.kdbbbbbbbbb',
      '..kddbbbdddb',
      '.kttttttttnt',
      'kttvttttnttt',
      'kttttttttttv',
      '.kttnttvtttt',
      '..kttttttttt',
      '...kkkkkkkkk',
      '............',
      '............',
    ],
  },
};
