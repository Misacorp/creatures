/**
 * Every concept set of this folder, found by Vite's glob (tests, the review page). The studio script, which
 * runs in plain Node, lists the folder itself (`scripts/art.mts`). See `collectSets` in `index.ts`.
 */
import { collectSets } from './index';

const modules: Record<string, Record<string, unknown>> = import.meta.glob(
  ['./*.ts', '!./index.ts', '!./sets.ts'],
  { eager: true },
);

export const CONCEPT_SETS = collectSets(modules);
