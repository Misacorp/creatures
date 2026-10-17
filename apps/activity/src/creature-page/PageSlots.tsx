import { GEAR_SLOTS, RULES } from '@creatures/game';
import type { Creature } from '../api';
import { ItemLevel, ItemSprite } from '../GearArt';
import type { GearSlot, GearState } from '../gear-types';
import { itemLabel, rarityName, slotName } from '../gear-view';
import type { TalentView } from '../talent-types';
import { talentTextParts } from '../talent-view';
import { Slot, SlotRow } from '../ui/Slot';

/**
 * A creature's three gear slots, side by side across the full width. Filled: the item's sprite, large and
 * on its own, inside the slot's one border in the rarity colour, with the item level ("Lv 2", `ItemLevel`, the same
 * label as on every item image) in the corner (the words are in the spoken label). Open and empty: the slot's name. Not open yet: muted, a
 * padlock over the slot's name and the level it opens at. Tapping an open one asks for its picker.
 */
export function GearSlots({
  creature,
  gear,
  openSlot,
  onOpen,
}: {
  creature: Creature;
  /** The gear view; only its slot levels are used (null while it loads: the rules' own levels). */
  gear: Pick<GearState, 'slotOpens'> | null;
  /** The slot whose picker is open now. */
  openSlot: GearSlot | null;
  onOpen: (slot: GearSlot, button: HTMLButtonElement) => void;
}) {
  const opens = gear?.slotOpens ?? RULES.gear.slotUnlockLevel;
  return (
    <SlotRow
      label="Gear"
      slots={GEAR_SLOTS.map((slot) => {
        const worn = creature.gear.find((g) => g.slot === slot);
        const name = slotName(slot);
        if (creature.level < opens[slot]) {
          return (
            <Slot
              key={slot}
              kind="gear"
              state="locked"
              name={name}
              opensAt={opens[slot]}
              label={`${name}: opens at level ${String(opens[slot])}`}
            />
          );
        }
        const open = (event: MouseEvent): void => {
          onOpen(slot, event.currentTarget as HTMLButtonElement);
        };
        return worn === undefined ? (
          <Slot
            key={slot}
            kind="gear"
            state="empty"
            name={name}
            label={`${name}: empty. Choose one`}
            expanded={openSlot === slot}
            onClick={open}
          />
        ) : (
          <Slot
            key={slot}
            kind="gear"
            state="filled"
            rarity={worn.rarity}
            label={`${name}: ${itemLabel(worn.baseId, worn.itemLevel)}, ${rarityName(worn.rarity)}. Change`}
            expanded={openSlot === slot}
            onClick={open}
          >
            <ItemSprite baseId={worn.baseId} scale={6} />
            <ItemLevel level={worn.itemLevel} />
          </Slot>
        );
      })}
    />
  );
}

/** A talent in a slot: its name, and under it the number ("+14%"). A golden one shimmers like a golden TalentChip. */
export function TalentInSlot({ talent }: { talent: TalentView }) {
  const parts = talentTextParts(talent.text);
  // A phrase without a number (a rule talent) shows its words instead.
  const value = parts.value ?? talent.text;
  return (
    <span
      class={`talent-chip slot-talent${talent.golden ? ' golden' : ''}${talent.idle ? ' idle' : ''}`}
    >
      <strong class="talent-name pix">
        {talent.name}
        {talent.golden && <span class="visually-hidden"> (golden)</span>}
      </strong>
      <span class="slot-talent-value pix">
        {talent.golden && parts.value !== null ? <span class="gold-shimmer">{value}</span> : value}
      </span>
    </span>
  );
}

/**
 * A creature's talent slots, the same Slot as the gear's and side by side across the full width (two,
 * or three for a rare or epic). Filled: the talent's name and number. Open and empty: "Talent". Not open
 * yet: the level it opens at. An epic's signature talent stands first and is always on (it opens nothing).
 * Tapping an open slot asks for the Talent Book.
 */
export function TalentSlots({
  creature,
  openSlot,
  onOpen,
}: {
  creature: Creature;
  /** The talent slot whose book is open now. */
  openSlot: number | null;
  onOpen: (slot: number, button: HTMLButtonElement) => void;
}) {
  const { slots, signature } = creature.talents;
  return (
    <SlotRow
      label="Talents"
      slots={[
        ...(signature === null
          ? []
          : [
              <Slot
                key="signature"
                kind="talent"
                state="filled"
                corner="Signature"
                label={`Signature talent: ${signature.name}, ${signature.text}`}
              >
                <TalentInSlot talent={signature} />
              </Slot>,
            ]),
        ...slots.map((slot) => {
          if (!slot.open) {
            return (
              <Slot
                key={slot.slot}
                kind="talent"
                state="locked"
                name="Talent"
                opensAt={slot.opensAt}
                label={`Talent slot ${String(slot.slot)}: opens at level ${String(slot.opensAt)}`}
              />
            );
          }
          const open = (event: MouseEvent): void => {
            onOpen(slot.slot, event.currentTarget as HTMLButtonElement);
          };
          return slot.talent === null ? (
            <Slot
              key={slot.slot}
              kind="talent"
              state="empty"
              name="Talent"
              label={`Talent slot ${String(slot.slot)}: empty. Open the Talent Book`}
              expanded={openSlot === slot.slot}
              onClick={open}
            />
          ) : (
            <Slot
              key={slot.slot}
              kind="talent"
              state="filled"
              label={`Talent slot ${String(slot.slot)}: ${slot.talent.name}, ${slot.talent.text}${slot.talent.golden ? ', golden' : ''}. Change`}
              expanded={openSlot === slot.slot}
              onClick={open}
            >
              <TalentInSlot talent={slot.talent} />
            </Slot>
          );
        }),
      ]}
    />
  );
}
