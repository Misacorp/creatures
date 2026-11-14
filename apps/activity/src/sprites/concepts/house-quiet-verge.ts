/**
 * Player housing, the Quiet Verge furniture set (concept wrapper; the art is `../data/house/quiet-verge.ts`). Made by
 * `pnpm housing new-set quiet-verge`; it feeds the art library (`docs/art/`) and the studio. Nothing in the game
 * imports this folder.
 */
import { HOUSE_ART } from '../data/house/quiet-verge';
import { houseSetConcept } from '../workshop/set-concept';
import type { ConceptSet } from './index';

export const HOUSE_QUIET_VERGE: ConceptSet = houseSetConcept(
  'quiet-verge',
  'Quiet Verge',
  HOUSE_ART,
  'Dusk-violet stone edged in pale rim light, arches with a warm star inside, chips of stone that float; window dark, lilac, star gold.',
);
