import type { SpriteDef } from './sprite-data';

/**
 * The dungeon run's pack: a leather backpack with a carry loop, a flap with a gold buckle and two
 * side pockets, 16 x 16 (drawn at scale 3 in the run strip). It holds the loot at risk, so it reads
 * as something carried that can be lost.
 */
export const PACK_ART: SpriteDef = {
  mirror: true,
  palette: { k: '#3b2414', b: '#a0693a', d: '#7a4a24', h: '#c98a4e', y: '#ffd25a' },
  rows: [
    '......kk',
    '.....k..',
    '....kkkk',
    '...khhhh',
    '..kbbbbb',
    '..kddddd',
    '..kbbbby',
    '..kbbbbd',
    '..kbbbbb',
    '.kkkdddd',
    '.kbkbbbb',
    '.kbkbbbb',
    '.kbkbbbb',
    '.kkkbbbb',
    '..kbbbbb',
    '...kkkkk',
  ],
};

/**
 * The run's keepsakes: a gold locket on a ring, an oval 11 pixels wide and 11 tall (drawn whole, not mirrored, so it can be odd) with a cut red gem set in the middle, 16 x 16 (drawn at scale 4
 * beside the keepsakes like the backpack beside the pack). Small treasures kept for this run only.
 */
export const LOCKET_ART: SpriteDef = {
  palette: { y: '#ffd25a', k: '#8a5a12', h: '#fff2b8', r: '#e8505b', d: '#a02a3a' },
  rows: [
    '.......kkk......',
    '......k...k.....',
    '......k...k.....',
    '.......kkk......',
    '......kkkkk.....',
    '....kkyyyyykk...',
    '...kyhhyyyyyyk..',
    '...kyhyykyyyyk..',
    '...khyykrkyyyk..',
    '...kyykrrrkyyk..',
    '...kyyykdkyyyk..',
    '...kyyyykyyyyk..',
    '...kyyyyyyyyyk..',
    '....kkyyyyykk...',
    '......kkkkk.....',
    '................',
  ],
};
