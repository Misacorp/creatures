import creatures from './data/creatures.json';
import elements from './data/elements.json';
import { loadContent } from './load';

export * from './schema';
export { loadContent, STARTER_COUNT } from './load';

/** The shipped content pack, validated at module load. */
export const content = loadContent({ version: 1, elements, creatures });
