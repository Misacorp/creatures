import type { SpriteDef } from '../sprites/sprite-data';

/**
 * Pixel art for the boss's attacks (`boss-fx.ts`), in three theme colours: `a` the main colour, `b`
 * its dark (the outline), `c` its light. The colours here are only placeholders: the attack swaps in
 * its theme's (`boss-fx.css`, `th-*`), so one drawing serves every element.
 */
const PLACEHOLDER = { a: '#888888', b: '#333333', c: '#ffffff' } as const;

/** The plain attack: a crescent facing right (the way it flies), its bright edge in front. */
export const CRESCENT: SpriteDef = {
  palette: PLACEHOLDER,
  rows: [
    '..bb......',
    '...bab....',
    '....bac...',
    '.....bac..',
    '......bac.',
    '......bacc',
    '.......bac',
    '.......bac',
    '.......bac',
    '.......bac',
    '......bacc',
    '......bac.',
    '.....bac..',
    '....bac...',
    '...bab....',
    '..bb......',
  ],
};

/** A boulder (or a lump of mud, a chunk of metal) falling from the sky. */
export const ROCK: SpriteDef = {
  palette: PLACEHOLDER,
  rows: [
    '...bbbb...',
    '..baaacb..',
    '.baaaaccb.',
    'baaaaaacbb',
    'baabaaaaab',
    'baaaaaaaab',
    '.baaabaab.',
    '.bbaaaabb.',
    '..bbbbbb..',
  ],
};

/** A lobbed blob (mud, lava, a puff of mist): round, with a highlight. */
export const BLOB: SpriteDef = {
  palette: PLACEHOLDER,
  rows: [
    '..bbbb..',
    '.bccaab.',
    'bccaaaab',
    'bcaaaaab',
    'baaaaaab',
    'baaaaabb',
    '.bbaabb.',
    '..bbbb..',
  ],
};
