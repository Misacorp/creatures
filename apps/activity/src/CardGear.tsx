import { GEAR_SLOTS, RULES } from '@creatures/game';
import { useState } from 'preact/hooks';
import type { Creature } from './api';
import { ItemFrame, ItemSprite } from './GearArt';
import type { EquipBestResult, GearSlot, GearState } from './gear-types';
import { equipBestText, equipChoices, gearName, itemLabel, slotName } from './gear-view';
import { GlossaryTag } from './Glossary';
import { WornItemFrame } from './WornItemLine';

/**
 * A creature card's gear: three slots (Hat, Scarf, Charm), each the worn item as a 12x12 sprite in its
 * rarity frame with its name and item level, an empty frame, or a locked one that says the creature
 * level it opens at. Tapping a slot opens a picker under it to equip, swap or take off, with the
 * reason in words for an item this creature cannot wear. "Equip best" lets the server pick for every
 * slot. The server decides; an item that another creature wears moves over, which the picker says.
 */
export function CardGear({
  creature,
  creatures,
  gear,
  busy,
  onEquip,
  onEquipBest,
  initialOpen = null,
}: {
  creature: Creature;
  creatures: readonly Creature[];
  /** The gear view; null while it loads or when it failed to load. */
  gear: GearState | null;
  busy: boolean;
  /** Resolves true when the server accepted it (the picker then closes). */
  onEquip: (gearId: string, creatureId: string | null) => Promise<boolean>;
  /** The server's "Equip best" for this creature; resolves what it changed, or undefined when refused. */
  onEquipBest: (creatureId: string) => Promise<EquipBestResult | undefined>;
  /** The slot whose picker is open at first (a gear icon of the card opens the sheet on its slot). */
  initialOpen?: GearSlot | null;
}) {
  const [open, setOpen] = useState<GearSlot | null>(initialOpen);
  const [note, setNote] = useState<string | null>(null);
  const opens = gear?.slotOpens ?? RULES.gear.slotUnlockLevel;

  async function equip(gearId: string, creatureId: string | null): Promise<void> {
    if (await onEquip(gearId, creatureId)) setOpen(null);
  }

  const choices =
    open === null || gear === null ? [] : equipChoices(gear.items, creature, creatures, open);
  const wornOpen = open === null ? undefined : creature.gear.find((g) => g.slot === open);

  /** The picker under the row of the open slot: Take off, then the items of the bag. */
  function picker(slot: GearSlot) {
    return (
      <div
        class="gear-picker"
        role="group"
        aria-label={`Choose a ${slotName(slot).toLowerCase()}`}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(null);
        }}
      >
        {wornOpen !== undefined && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void equip(wornOpen.id, null);
            }}
          >
            Take off {gearName(wornOpen.baseId)}
          </button>
        )}
        {gear === null ? (
          <p class="muted">Loading your gear...</p>
        ) : choices.length === 0 ? (
          <p class="muted">
            No other {slotName(slot).toLowerCase()} in your bag. Clear raid finales, send explorers
            out or craft in the Workshop.
          </p>
        ) : (
          <ul class="pick-items">
            {choices.map(({ item, wornBy, blocked }) => (
              <li key={item.id}>
                <button
                  type="button"
                  class="pick-item"
                  disabled={busy || blocked !== null}
                  aria-label={`Equip ${itemLabel(item.baseId, item.itemLevel)}${wornBy === null ? '' : `, now worn by ${wornBy}`}${blocked === null ? '' : `. ${blocked}`}`}
                  onClick={() => {
                    void equip(item.id, creature.id);
                  }}
                >
                  <ItemFrame rarity={item.rarity} baseId={item.baseId}>
                    <ItemSprite baseId={item.baseId} scale={3} />
                  </ItemFrame>
                  <span class="pick-item-text">
                    <span class="pix">
                      {gearName(item.baseId)} <span class="muted">item level {item.itemLevel}</span>
                    </span>
                    <span class="muted">
                      {blocked ?? item.lines.map((l) => l.text).join(', ')}
                      {wornBy === null ? '' : ` \u00b7 worn by ${wornBy}`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div class="card-gear">
      <ul class="gear-slots">
        {GEAR_SLOTS.map((slot) => {
          const worn = creature.gear.find((g) => g.slot === slot);
          const locked = creature.level < opens[slot];
          if (locked) {
            // A closed slot is one short muted row: nothing to tap.
            return (
              <li key={slot} class="gear-row locked">
                <p class="muted">
                  {slotName(slot)} opens at level {opens[slot]}
                </p>
              </li>
            );
          }
          // What the item does (its lines, from the gear view; absent while that view loads).
          const lines =
            worn === undefined
              ? []
              : (gear?.items.find((i) => i.id === worn.id)?.lines.map((l) => l.text) ?? []);
          const label =
            worn === undefined
              ? `${slotName(slot)} slot: empty. Choose an item to equip.`
              : `${slotName(slot)} slot: ${itemLabel(worn.baseId, worn.itemLevel)}${lines.length === 0 ? '' : `, ${lines.join(', ')}`}. Change it.`;
          return (
            <li key={slot} class="gear-row">
              <div class="gear-row-main">
                <button
                  type="button"
                  class="gear-slot"
                  aria-expanded={open === slot}
                  aria-label={label}
                  onClick={() => {
                    setNote(null);
                    setOpen(open === slot ? null : slot);
                  }}
                >
                  {worn === undefined ? (
                    <span class="item-frame empty" aria-hidden="true">
                      <span class="slot-plus pix">+</span>
                    </span>
                  ) : (
                    <WornItemFrame worn={worn} />
                  )}
                </button>
                <p class="gear-text" aria-hidden="true">
                  {worn !== undefined ? (
                    <>
                      <span class="gear-title">
                        <span class="pix">{gearName(worn.baseId)}</span>
                        <span class="muted"> item level {worn.itemLevel}</span>
                      </span>
                      {lines.length > 0 && <span class="muted gear-main">{lines.join(', ')}</span>}
                    </>
                  ) : (
                    <span class="gear-title">
                      <span class="pix">{slotName(slot)}</span>
                      <span class="muted"> empty</span>
                    </span>
                  )}
                </p>
              </div>
              {open === slot && picker(slot)}
            </li>
          );
        })}
      </ul>
      <p class="gear-tools">
        <button
          type="button"
          disabled={busy || gear === null}
          onClick={() => {
            void onEquipBest(creature.id).then((result) => {
              if (result !== undefined) {
                setOpen(null);
                setNote(equipBestText(result));
              }
            });
          }}
        >
          Equip best
        </button>
        <GlossaryTag entry="gear" look="help" />
        {note !== null && (
          <span class="muted" role="status">
            {' '}
            {note}
          </span>
        )}
      </p>
    </div>
  );
}
