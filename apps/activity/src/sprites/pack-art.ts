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
