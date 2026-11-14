/**
 * Player housing, room skins (concept wrapper; the art itself is in `../data/house/rooms.ts`, which the house scene
 * reads). A default wallpaper (16x52) and floor (16x8) for each indoor room kind but the Hearth, Loft and Study, so a
 * big house reads as different rooms (`docs/design/housing.md` 2.5 and 5, art pass 2). Nothing in the game imports
 * this folder. Delete it when Misa likes the pack (the studio's "promote" step).
 */
import { HOUSE_ART } from '../data/house/rooms';
import type { Concept, ConceptSet } from './index';

const NOTES: Readonly<Record<string, string>> = {
  kitchen: 'Warm: cream plaster over a terracotta backsplash; terracotta and cream floor squares.',
  attic: 'Bare boards between a rafter, a tie beam on top; dusty bare floorboards.',
  cellar: 'Cool: damp stone blocks with a mossy foot; flagstones.',
  hall: 'Dark mahogany panelling with brass studs and a chair rail; basket-weave parquet.',
  gallery: 'Pale plaster with a gold picture rail over a sage dado; chevron oak.',
  conservatory: 'Panes of sky and cloud in thin frames over a whitewashed low wall; diamond tiles.',
  bath: 'Small white tiles with a teal band and a teal dado; blue and white mosaic floor.',
  guest: 'Calm: sage pinstripes over cream beadboard; whitewashed planks.',
};

const sprites: Record<string, Concept> = {};
for (const [id, art] of Object.entries(HOUSE_ART.skins ?? {})) {
  const room = id.slice(0, id.lastIndexOf('-'));
  const wall = id.endsWith('-wall');
  sprites[id] = {
    kind: 'free',
    note: `${wall ? 'Wallpaper 16x52, repeats across.' : 'Floor 16x8, repeats across.'} ${NOTES[room] ?? ''}`,
    sprite: art.tile,
  };
}

export const HOUSE_ROOMS: ConceptSet = {
  id: 'house-rooms',
  title: 'House: room skins',
  requested:
    '2026-11-10: player housing art pass 2, a default wallpaper and floor for every room kind (art director review: every room looked the same).',
  status: 'draft',
  notes: [
    'Free skins that come with the part that has the room (unlock kind part); also choices for other rooms once built. The Hearth, Loft and Study stay on Cosy.',
    'The pack is data/house/rooms.ts, read by house-art.ts.',
  ],
  sprites,
};
