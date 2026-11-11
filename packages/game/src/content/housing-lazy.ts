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
 * the resource library, the journal sets, the raid bosses and the destinations. It is its own entry
 * (`@creatures/game/housing-lazy`, not the barrel) so the first load of the game never carries or validates it.
 *
 * `shippedHousing()` validates on its first call and keeps the result for the isolate (static data, no state that
 * must last between requests). The worker uses it so a Durable Object with housing off, or a player who never opens
 * the house, never pays for the validation (`docs/design/housing.md`, "Server cost of the content"). The client's
 * `@creatures/game/housing-content` is the same content, validated when its module loads.
 */
let memo: HousingContent | null = null;
export function shippedHousing(): HousingContent {
  memo ??= loadHousingContent(
    { forms, rooms, parts, materials, sets, pieces, skins, stamps, starter },
    resources,
    {
      journalSets: journal.sets.map((s) => s.id),
      bosses: bosses.map((b) => b.id),
      destinations: destinations.map((d) => d.id),
    },
  );
  return memo;
}
