import { ChoiceMark, supplyEntry } from './ExpeditionIcons';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { Sprite } from './sprites/Sprite';
import { tierRarityClass } from './supply-tiers';
import { kindLabel, type SupplyOption } from './trip-view';

/**
 * The item card of one supply: its picture, its name in its tier's colour, its kind (a glossary tag), what
 * it does and how sure the end-of-trip choice is. Shown under the send screen's grid for a packed supply
 * and in a popover from the trip summary. `packed` adds "Packed" after the kind (the grid's card only).
 */
export function SupplyCard({ view, packed = false }: { view: SupplyOption; packed?: boolean }) {
  return (
    <div class={`supply-card card-item ${tierRarityClass(view.tier)}`} aria-live="polite">
      <div class="bp-row">
        <span class="supply-icon">
          <Sprite sprite={glyphOrUnknown(view.kind)} scale={4} />
        </span>
        <div class="bp-text">
          <p class="pix bp-name rarity-name">{view.name}</p>
          <p class="muted supply-owned">
            <GlossaryTag entry={supplyEntry(view.kind)} look="text">
              {kindLabel(view.kind)}
            </GlossaryTag>
            {packed ? ' · Packed' : ''}
          </p>
        </div>
      </div>
      <p class="supply-effect">{view.effect}</p>
      <ChoiceMark choice={view.choice} />
    </div>
  );
}
