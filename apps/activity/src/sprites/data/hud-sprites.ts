import type { SpriteDef } from '../sprite-data';

const BONE = '#f4eedc';

/**
 * The cog of the HUD's Settings button: a ring with a round hole and eight teeth, 10 x 10 (the 8 x 8 glyph grid
 * is too small for a cog that reads as one; Misa, 2026-10-25).
 */
export const GEAR_SPRITE: SpriteDef = {
  palette: { w: BONE },
  rows: [
    '....ww....',
    '.ww.ww.ww.',
    '.wwwwwwww.',
    '..ww..ww..',
    'www....www',
    'www....www',
    '..ww..ww..',
    '.wwwwwwww.',
    '.ww.ww.ww.',
    '....ww....',
  ],
};
