import { GEAR_SLOTS, RULES } from '@creatures/game';
import type { Creature } from './api';
import { FestivalTag, ItemThumb, RarityTag, SlotIcon, SlotTag } from './GearArt';
import type { GearSlot, GearState } from './gear-types';
import {
  activeSetLine,
  gearName,
  isFestivalBase,
  itemLabel,
  rarityName,
  slotName,
  wornItemOf,
} from './gear-view';
import { FindRow } from './ui/FindRow';
import { Tag } from './ui/Tag';

/**
 * A creature's gear as a list, one row per slot (Hat, Scarf, Charm), in the find rows' look (`FindRow`:
 * the item's image, its name in the rarity colour, the rarity and slot badges). A worn item may show its
 * lines under the badges (`lines`). An open, empty slot says so; a slot not open yet shows the level it
 * opens at. With `onPick` every open slot is a button that asks for its picker; without it the list is
 * locked (read only). The set bonus line closes it, as under the slots. On an ink panel.
 */
export function GearList({
  creature,
  gear,
  lines = false,
  openSlot = null,
  onPick,
}: {
  creature: Creature;
  /** The gear view: the slot levels and (for `lines`) the items; null while it loads. */
  gear: Pick<GearState, 'slotOpens' | 'items'> | null;
  /** Each worn item's lines under its badges ("Attack +6% · Crit chance +3 pt"). */
  lines?: boolean;
  /** The slot whose picker is open now. */
  openSlot?: GearSlot | null;
  /** Tapping an open slot; absent: the list is locked. */
  onPick?: ((slot: GearSlot, button: HTMLButtonElement) => void) | undefined;
}) {
  const opens = gear?.slotOpens ?? RULES.gear.slotUnlockLevel;
  const setLine = activeSetLine(creature.gear);
  return (
    <div class="gear-list">
      <ul class="stack-list" aria-label="Gear">
        {GEAR_SLOTS.map((slot) => {
          const name = slotName(slot);
          const worn = creature.gear.find((g) => g.slot === slot);
          const button = (label: string) =>
            onPick === undefined
              ? undefined
              : {
                  label,
                  expanded: openSlot === slot,
                  onClick: (event: MouseEvent) => {
                    onPick(slot, event.currentTarget as HTMLButtonElement);
                  },
                };
          if (creature.level < opens[slot]) {
            return (
              <FindRow
                key={slot}
                image={
                  <span class="item-frame empty-slot locked">
                    <SlotIcon slot={slot} />
                  </span>
                }
                name={name}
                nameClass="muted"
                tags={<Tag>Lv {opens[slot]}</Tag>}
              />
            );
          }
          if (worn === undefined) {
            return (
              <FindRow
                key={slot}
                image={
                  <span class="item-frame empty-slot">
                    <SlotIcon slot={slot} />
                  </span>
                }
                name={name}
                nameClass="muted"
                tags={<Tag>Empty</Tag>}
                button={button(`${name}: empty. Choose one`)}
              />
            );
          }
          const item = wornItemOf(worn, gear?.items);
          return (
            <FindRow
              key={slot}
              image={<ItemThumb item={worn} scale={3} />}
              name={gearName(worn.baseId)}
              nameClass={`rarity-name rarity-${worn.rarity}`}
              tags={
                <>
                  {/* A tappable row is one button: its badges cannot be buttons of their own. */}
                  <RarityTag rarity={worn.rarity} plain={onPick !== undefined} />
                  {isFestivalBase(worn.baseId) &&
                    (onPick === undefined ? (
                      <FestivalTag />
                    ) : (
                      <Tag class="festival-tag">Festival</Tag>
                    ))}
                  <SlotTag slot={slot} plain />
                </>
              }
              button={button(
                `${name}: ${itemLabel(worn.baseId, worn.itemLevel)}, ${rarityName(worn.rarity)}. Change`,
              )}
            >
              {lines && item.lines !== undefined && item.lines.length > 0 && (
                <span class="find-row-note gear-list-lines">{item.lines.join(' · ')}</span>
              )}
            </FindRow>
          );
        })}
      </ul>
      {setLine !== '' && (
        <p class="cp-sets pix" aria-label="Set bonuses">
          {setLine}
        </p>
      )}
    </div>
  );
}
