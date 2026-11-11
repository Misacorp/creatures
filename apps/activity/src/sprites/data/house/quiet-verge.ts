/**
 * House furniture pack: Quiet Verge. Made by `pnpm housing new-set quiet-verge`: the nine pieces are drawn from the
 * style (`../../workshop/styles/quiet-verge.ts`) with no overrides; the wallpaper, floor and keepsake are placeholders
 * in the style's palette.
 * TODO(artist): draw the wallpaper (16x52), floor (16x8) and keepsake (12x12) by hand in a `HAND` pack (see
 * `tidepool.ts`), and add overrides (with a reason) where a form cannot say what the set needs.
 */
import type { HouseArtPack } from '../../../housing/house-art';
import { setPack, type SetSource } from '../../workshop/pack';
import { placeholderHand } from '../../workshop/placeholder';
import { QUIET_VERGE } from '../../workshop/styles/quiet-verge';

/** TODO(artist): placeholder wallpaper, floor and keepsake. */
const HAND: HouseArtPack = placeholderHand(QUIET_VERGE);

export const SOURCE: SetSource = { style: QUIET_VERGE, hand: HAND };

export const HOUSE_ART: HouseArtPack = setPack(SOURCE);
