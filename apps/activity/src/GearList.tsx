import { GEAR_SLOTS, RULES } from '@creatures/game';
import { FestivalTag, ItemThumb, RarityTag, SlotIcon, SlotTag } from './GearArt';
import type { GearSlot } from './gear-types';
import {
  activeSetLine,
  gearName,
  isFestivalBase,
  itemLabel,
  rarityName,
  slotName,
  type WornItem,
} from './gear-view';
import { FindRow } from './ui/FindRow';
import { Tag } from './ui/Tag';

/**
 * A creature's gear as a list: the one way a creature's gear is shown in full (its page, the configurator,
 * a living room creature's popover). One row per slot (Hat, Scarf, Charm) in the find rows' look (`FindRow`):
 * the item's image, its name in the rarity colour, the rarity and slot badges, and the item's lines under
 * them once the gear view has given them. An open, empty slot says "Empty"; a slot not open yet shows the
 * level it opens at. With `onPick` every open slot is one button that asks for its picker; without it the
 * list is locked (read only, and the badges explain themselves). The set bonus line closes it. An ink
 * panel in the pixel font (`.pix-panel`), wherever it is used.
 */
export function GearList({
  level,
  worn,
  slotOpens = RULES.gear.slotUnlockLevel,
  emptySlots = true,
  openSlot = null,
  onPick,
}: {
  /** The creature's level: a slot opens at its level in `slotOpens`. */
  level: number;
  /** What it wears, with each item's lines when they are known (`wornItemOf`). */
  worn: readonly WornItem[];
  /** The level each slot opens at (the gear view's; the rules' own while it loads). */
  slotOpens?: Readonly<Record<GearSlot, number>> | undefined;
  /** Rows for the slots with nothing in them (empty or not open yet); off: only what is worn. */
  emptySlots?: boolean;
  /** The slot whose picker is open now. */
  openSlot?: GearSlot | null;
  /** Tapping an open slot; absent: the list is locked. */
  onPick?: ((slot: GearSlot, button: HTMLButtonElement) => void) | undefined;
}) {
  const setLine = activeSetLine(worn);
  // A tappable row is one button: its badges cannot be buttons of their own.
  const plain = onPick !== undefined;
  const button = (slot: GearSlot, label: string) =>
    onPick === undefined
      ? undefined
      : {
          label,
          expanded: openSlot === slot,
          onClick: (event: MouseEvent) => {
            onPick(slot, event.currentTarget as HTMLButtonElement);
          },
        };
  return (
    <div class="gear-list pix-panel">
      <ul class="stack-list" aria-label="Gear">
        {GEAR_SLOTS.map((slot) => {
          const name = slotName(slot);
          const item = worn.find((g) => g.slot === slot);
          if (item === undefined && !emptySlots) return null;
          if (item === undefined && level < slotOpens[slot]) {
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
                tags={<Tag>Lv {slotOpens[slot]}</Tag>}
              />
            );
          }
          if (item === undefined) {
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
                button={button(slot, `${name}: empty. Choose one`)}
              />
            );
          }
          return (
            <FindRow
              key={slot}
              image={<ItemThumb item={item} scale={3} />}
              name={
                <>
                  {gearName(item.baseId)}
                  <span class="visually-hidden">, item level {item.itemLevel}</span>
                </>
              }
              nameClass={`rarity-name rarity-${item.rarity}`}
              tags={
                <>
                  <RarityTag rarity={item.rarity} plain={plain} />
                  {isFestivalBase(item.baseId) &&
                    (plain ? <Tag class="festival-tag">Festival</Tag> : <FestivalTag />)}
                  <SlotTag slot={slot} plain={plain} />
                </>
              }
              button={button(
                slot,
                `${name}: ${itemLabel(item.baseId, item.itemLevel)}, ${rarityName(item.rarity)}. Change`,
              )}
            >
              {item.lines !== undefined && item.lines.length > 0 && (
                <span class="find-row-note gear-list-lines">{item.lines.join(' · ')}</span>
              )}
            </FindRow>
          );
        })}
      </ul>
      {setLine !== '' && (
        <p class="cp-sets" aria-label="Set bonuses">
          {setLine}
        </p>
      )}
    </div>
  );
}
