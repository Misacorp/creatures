import { useState } from 'preact/hooks';
import type { Creature } from './api';
import { ItemFrame, ItemSprite } from './GearArt';
import type { GearState } from './gear-types';
import { equipChoices, formatBonus, gearName, itemLabel, statLabel, wornItemOf } from './gear-view';
import { GlossaryTag } from './Glossary';
import { WornItemFrame, WornItemText } from './WornItemLine';

/**
 * A creature card's gear slot: the worn item as a 12x12 sprite in its rarity frame (or an empty
 * frame), and a picker that opens under it to equip, swap or take off. The server decides; an item
 * that another creature wears moves over, which the picker says before the tap.
 */
export function CardGear({
  creature,
  creatures,
  gear,
  busy,
  onEquip,
}: {
  creature: Creature;
  creatures: readonly Creature[];
  /** The gear view; null while it loads or when it failed to load. */
  gear: GearState | null;
  busy: boolean;
  /** Resolves true when the server accepted it (the picker then closes). */
  onEquip: (gearId: string, creatureId: string | null) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const worn = creature.gear;
  const label =
    worn === null
      ? 'Gear slot: empty. Choose an item to equip.'
      : `Gear slot: ${itemLabel(worn.baseId, worn.level)}. Change it.`;
  const choices = gear === null ? [] : equipChoices(gear.items, creature, creatures);
  const wornView = worn === null ? null : wornItemOf(worn, gear?.items);

  async function equip(gearId: string, creatureId: string | null): Promise<void> {
    if (await onEquip(gearId, creatureId)) setOpen(false);
  }

  return (
    <div class="card-gear">
      <div class="gear-line">
        <button
          type="button"
          class="gear-slot"
          aria-expanded={open}
          aria-label={label}
          onClick={() => {
            setOpen(!open);
          }}
        >
          {wornView === null ? (
            <span class="item-frame empty" aria-hidden="true">
              <span class="slot-plus pix">+</span>
            </span>
          ) : (
            <WornItemFrame worn={wornView} />
          )}
        </button>
        {wornView === null ? (
          <p class="gear-text">
            <span class="muted">
              <GlossaryTag entry="gear">No gear</GlossaryTag>
            </span>
          </p>
        ) : (
          <WornItemText worn={wornView} />
        )}
      </div>
      {open && (
        <div
          class="gear-picker"
          role="group"
          aria-label="Choose gear"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
          }}
        >
          {worn !== null && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void equip(worn.id, null);
              }}
            >
              Take off {gearName(worn.baseId)}
            </button>
          )}
          {gear === null ? (
            <p class="muted">Loading your gear...</p>
          ) : choices.length === 0 ? (
            <p class="muted">
              No other gear in your bag. Clear raid finales, send explorers out or craft in the
              Workshop.
            </p>
          ) : (
            <ul class="pick-items">
              {choices.map(({ item, wornBy }) => (
                <li key={item.id}>
                  <button
                    type="button"
                    class="pick-item"
                    disabled={busy}
                    aria-label={`Equip ${itemLabel(item.baseId, item.level)}${wornBy === null ? '' : `, now worn by ${wornBy}`}`}
                    onClick={() => {
                      void equip(item.id, creature.id);
                    }}
                  >
                    <ItemFrame rarity={item.rarity}>
                      <ItemSprite baseId={item.baseId} scale={3} />
                    </ItemFrame>
                    <span class="pick-item-text">
                      <span class="pix">{itemLabel(item.baseId, item.level)}</span>
                      <span class="muted">
                        {formatBonus(item.primary.stat, item.primary.bp)}{' '}
                        {statLabel(item.primary.stat)}
                        {wornBy === null ? '' : ` · worn by ${wornBy}`}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
