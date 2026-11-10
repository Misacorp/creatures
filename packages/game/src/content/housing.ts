import forms from './data/housing/forms.json';
import rooms from './data/housing/rooms.json';
import parts from './data/housing/parts.json';
import materials from './data/housing/materials.json';
import sets from './data/housing/sets.json';
import pieces from './data/housing/pieces.json';
import skins from './data/housing/skins.json';
import stamps from './data/housing/stamps.json';
import starter from './data/housing/starter.json';
import { loadHousingContent, type HousingContent } from '../housing';
import bosses from './data/bosses.json';
import destinations from './data/destinations.json';
import journal from './data/journal.json';
import { resources } from './resources';

/**
 * The first housing content (docs/design/housing.md section 2.5): house parts, rooms and their spots,
 * furniture forms, sets and pieces, skins, luxury materials, stamps and the starter hut. Validated against
 * the resource library, the journal sets, the raid bosses and the destinations at module load. It is its own entry
 * (`@creatures/game/housing-content`, not the barrel) so the first load of the game never carries or validates it.
 */
export const housing: HousingContent = loadHousingContent(
  { forms, rooms, parts, materials, sets, pieces, skins, stamps, starter },
  resources,
  {
    journalSets: journal.sets.map((s) => s.id),
    bosses: bosses.map((b) => b.id),
    destinations: destinations.map((d) => d.id),
  },
);
