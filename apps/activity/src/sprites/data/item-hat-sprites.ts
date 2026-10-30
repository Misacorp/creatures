/**
 * The hat sprites (12x12), one per item look (`itemLookId` in `gear-sprites.ts`): every hat with
 * its own name has its own sprite, and element versions with the same stats share one, tinted by
 * element. Keys: `k` ink; `t` main, `u` shade, `h` highlight (the tint swaps these three, so
 * every sprite uses them for its main colour); a set piece also has `g` and `w`, the gold trim no
 * tint changes. A few fixed accent keys per sprite are fine (a cord, a bead). Drawn from each item's
 * name and flavour line (`gear.json`); checked by `gear-sprites.test.ts` and `pnpm art items`.
 */
import type { SpriteDef } from '../sprite-data';

export const HAT_SPRITE_DATA: Readonly<Record<string, SpriteDef>> = {};
