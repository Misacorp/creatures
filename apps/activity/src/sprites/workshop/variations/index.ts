/** Every art variation (see `types.ts`), by id. Review sheets only: nothing in the game imports this folder. */
import { CONTRAST_VARIATIONS } from './contrast';
import { CUPBOARD_VARIATIONS } from './cupboards';
import type { Variation } from './types';

export type { Variation } from './types';

export const VARIATIONS: Readonly<Record<string, Variation>> = Object.fromEntries(
  [...CONTRAST_VARIATIONS, ...CUPBOARD_VARIATIONS].map((v) => [v.id, v]),
);
