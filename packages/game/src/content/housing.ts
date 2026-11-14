import type { HousingContent } from '../housing';
import { shippedHousing } from './housing-lazy';

/**
 * The shipped housing content for the client, validated when this module loads. It is its own entry
 * (`@creatures/game/housing-content`, not the barrel) so the first load of the game never carries or validates it.
 * The worker uses `shippedHousing()` of `housing-lazy.ts` instead, which validates on first use.
 */
export const housing: HousingContent = shippedHousing();
