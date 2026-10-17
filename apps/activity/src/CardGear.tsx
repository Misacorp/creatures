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
}) {
  const [open, setOpen] = useState<GearSlot | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const opens = gear?.slotOpens ?? RULES.gear.slotUnlockLevel;

  async function equip(gearId: string, creatureId: string | null): Promise<void> {
    if (await onEquip(gearId, creatureId)) setOpen(null);
  }

  const choices =
    open === null || gear === null ? [] : equipChoices(gear.items, creature, creatures, open);
  const wornOpen = open === null ? undefined : creature.gear.find((g) => g.slot === open);

  return (
    <div class="card-gear">
      <ul class="gear-slots">
        {GEAR_SLOTS.map((slot) => {
          const worn = creature.gear.find((g) => g.slot === slot);
          const locked = creature.level < opens[slot];
          const label = locked
            ? `${slotName(slot)} slot: opens at creature level ${String(opens[slot])}.`
            : worn === undefined
              ? `${slotName(slot)} slot: empty. Choose an item to equip.`
              : `${slotName(slot)} slot: ${itemLabel(worn.baseId, worn.itemLevel)}. Change it.`;
          return (
            <li key={slot} class={locked ? 'gear-cell locked' : 'gear-cell'}>
              <button
                type="button"
                class="gear-slot"
                disabled={locked}
                aria-expanded={open === slot}
                aria-label={label}
                onClick={() => {
                  setNote(null);
                  setOpen(open === slot ? null : slot);
                }}
              >
                {worn === undefined ? (
                  <span class="item-frame empty" aria-hidden="true">
                    <span class="slot-plus pix">{locked ? '·' : '+'}</span>
                  </span>
                ) : (
                  <WornItemFrame worn={worn} />
                )}
              </button>
              <p class="gear-text" aria-hidden="true">
                {worn !== undefined ? (
                  <>
                    <span class="pix">{gearName(worn.baseId)}</span>
                    <span class="muted"> item level {worn.itemLevel}</span>
                  </>
                ) : (
                  <>
                    <span class="pix">{slotName(slot)}</span>
                    <span class="muted">
                      {locked ? ` opens at level ${String(opens[slot])}` : ' empty'}
                    </span>
                  </>
                )}
              </p>
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
      {open !== null && (
        <div
          class="gear-picker"
          role="group"
          aria-label={`Choose a ${slotName(open).toLowerCase()}`}
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
              No other {slotName(open).toLowerCase()} in your bag. Clear raid finales, send
              explorers out or craft in the Workshop.
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
                        {gearName(item.baseId)}{' '}
                        <span class="muted">item level {item.itemLevel}</span>
                      </span>
                      <span class="muted">
                        {blocked ?? item.lines.map((l) => l.text).join(', ')}
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
