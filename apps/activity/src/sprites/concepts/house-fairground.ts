/**
 * Player housing, the Fairground furniture set (concept wrapper; the art is `../data/house/fairground.ts`). Made by
 * `pnpm housing new-set fairground`; it feeds the art library (`docs/art/`) and the studio. Nothing in the game
 * imports this folder.
 */
import { HOUSE_ART } from '../data/house/fairground';
import { houseSetConcept } from '../workshop/set-concept';
import type { ConceptSet } from './index';

export const HOUSE_FAIRGROUND: ConceptSet = houseSetConcept(
  'fairground',
  'Fairground',
  HOUSE_ART,
  'Striped awnings, bunting and prize ribbons on painted wood; red, cream, sky blue, sunny yellow.',
);
