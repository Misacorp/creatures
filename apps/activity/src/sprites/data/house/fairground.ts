/**
 * House furniture pack: Fairground. Made by `pnpm housing new-set fairground`: the nine pieces are drawn from the
 * style (`../../workshop/styles/fairground.ts`) with no overrides; the wallpaper, floor and keepsake are placeholders
 * in the style's palette.
 * TODO(artist): draw the wallpaper (16x52), floor (16x8) and keepsake (12x12) by hand in a `HAND` pack (see
 * `tidepool.ts`), and add overrides (with a reason) where a form cannot say what the set needs.
 */
import type { HouseArtPack } from '../../../housing/house-art';
import { setPack, type SetSource } from '../../workshop/pack';
import { placeholderHand } from '../../workshop/placeholder';
import { FAIRGROUND } from '../../workshop/styles/fairground';

/** TODO(artist): placeholder wallpaper, floor and keepsake. */
const HAND: HouseArtPack = placeholderHand(FAIRGROUND);

export const SOURCE: SetSource = { style: FAIRGROUND, hand: HAND };

export const HOUSE_ART: HouseArtPack = setPack(SOURCE);
