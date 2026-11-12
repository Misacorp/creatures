/**
 * The house postcard's hand-drawn pieces (`data/house/postcard.ts`), concept wrapper so the studio can draw, lint and
 * catalogue them: the shuttered window, the front door, the chimney with its smoke, the cellar vent, flowers, the garden tree,
 * the pool's ladder and diving board and the terrace parasol. The facade, roofs and grounds of the postcard are procedural
 * (`housing/house-postcard.ts`) and take the player's own roof and wall colours.
 */
import { POSTCARD_ART } from '../data/house/postcard';
import type { Concept, ConceptSet } from './index';

const NOTES: Readonly<Record<string, string>> = {
  window:
    'A window with shutters and a sill: the shutters take the roof skin, the sill the wall skin (shown in thatch and plaster).',
  door: 'The front door on the Hearth, arched, planks and a brass knob.',
  chimney: 'The brick chimney with a stone cap; the composer sinks its foot into the roof.',
  'smoke-near': 'The near puff of smoke over the chimney.',
  'smoke-far': 'The far, smaller puff of smoke.',
  vent: 'The cellar window in the stone course, barred.',
  'flower-red': 'A flower in the garden grass, red petals.',
  'flower-pink': 'A flower in the garden grass, pink petals.',
  'flower-white': 'A flower in the garden grass, white petals.',
  'flower-violet': 'A flower in the garden grass, violet petals.',
  tree: 'A round garden tree beside the hedge.',
  ladder: 'The pool ladder over the coping.',
  'diving-board': 'The pool diving board on its foot.',
  parasol: 'The terrace parasol, red and cream stripes on a pole.',
  'porch-lamp': 'The porch lamp beside the front door, lit: drawn at twilight and night only.',
  'lantern-post': 'A lantern post on the garden lawn, lit: drawn at twilight and night only.',
};

const sprites: Record<string, Concept> = {};
for (const [id, sprite] of Object.entries(POSTCARD_ART)) {
  sprites[`postcard-${id}`] = { kind: 'free', note: NOTES[id] ?? id, sprite };
}

export const HOUSE_POSTCARD: ConceptSet = {
  id: 'house-postcard',
  title: 'House postcard (outside view)',
  requested:
    '2026-11-10: a house that visibly grows into a mansion with wings, a pool and gardens, seen whole on a phone.',
  status: 'draft',
  notes: [
    'Pack: `src/sprites/data/house/postcard.ts` (`POSTCARD_ART`). The picture is composed by `src/housing/house-postcard.ts` at 28 x 16 px a room cell; see it in the workbench page HousePostcard.',
  ],
  sprites,
};
