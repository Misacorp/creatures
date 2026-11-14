/**
 * Player housing, the Schoolhouse furniture set (concept wrapper; the art is `../data/house/schoolhouse.ts`). Made by
 * `pnpm housing new-set schoolhouse`; it feeds the art library (`docs/art/`) and the studio. Nothing in the game
 * imports this folder.
 */
import { HOUSE_ART } from '../data/house/schoolhouse';
import { houseSetConcept } from '../workshop/set-concept';
import type { ConceptSet } from './index';

export const HOUSE_SCHOOLHOUSE: ConceptSet = houseSetConcept(
  'schoolhouse',
  'Schoolhouse',
  HOUSE_ART,
  'Oak desks, a slate-green board, brass and chalk white, one red apple; slate green, warm oak, brass, chalk, apple red.',
);
