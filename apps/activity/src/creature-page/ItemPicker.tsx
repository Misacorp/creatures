import { useState } from 'preact/hooks';
import type { Creature } from '../api';
import { ItemLevel, ItemSprite } from '../GearArt';
import type { GearItem, GearSlot } from '../gear-types';
import { itemLabel, rarityName, slotName } from '../gear-view';
import { ItemCard } from '../ItemCard';
import { Drawer } from '../ui/Drawer';
import { compactReason, firstPick, pickerChoices } from './picker-view';

export interface ItemPickerProps {
  open: boolean;
  onClose: () => void;
  slot: GearSlot;
  creature: Creature;
  /** The other creatures (the picker says who wears an item that would move). */
  creatures: readonly Creature[];
  /** The bag: every item the server lists (all slots; the picker shows this slot's). Null while it loads. */
  items: readonly GearItem[] | null;
  busy?: boolean;
  /** Wear this item (an item another creature wears moves over). */
  onEquip: (item: GearItem) => void;
  /** Take the worn item off. */
  onTakeOff: (item: GearItem) => void;
  returnFocusTo?: HTMLElement | null;
}

/** One entry of the grid: an item, whether the creature wears it, who else does and why it cannot be worn. */
interface Cell {
  item: GearItem;
  worn: boolean;
  wornBy: string | null;
  blocked: string | null;
}

/** One icon of the grid: the sprite on its own, the cell's one border in the rarity colour, the level in the corner. */
function ItemCell({
  cell,
  selected,
  onSelect,
}: {
  cell: Cell;
  selected: boolean;
  onSelect: () => void;
}) {
  const { item, worn, blocked } = cell;
  return (
    <li>
      <button
        type="button"
        class={`ip-cell rarity-${item.rarity}${selected ? ' selected' : ''}${blocked === null ? '' : ' blocked'}${worn ? ' worn' : ''}`}
        aria-pressed={selected}
        aria-label={`${itemLabel(item.baseId, item.itemLevel)}, ${rarityName(item.rarity)}${worn ? ', worn now' : ''}${blocked === null ? '' : `. ${blocked}`}`}
        onClick={onSelect}
      >
        <ItemSprite baseId={item.baseId} scale={5} />
        {worn && (
          <span class="ip-cell-worn pix" aria-hidden="true">
            Worn
          </span>
        )}
        <ItemLevel level={item.itemLevel} />
      </button>
    </li>
  );
}

/**
 * The panel pinned at the bottom of the drawer: the selected item as the one item card (image with its level at
 * the top left, name, rarity badge and base stats, a divider, the modifiers), with Equip, Take off or the reason
 * it cannot be worn at the top right. All of it is in the pixel font.
 */
function DetailPanel({
  cell,
  busy,
  onEquip,
  onTakeOff,
}: {
  cell: Cell;
  busy: boolean;
  onEquip: (item: GearItem) => void;
  onTakeOff: (item: GearItem) => void;
}) {
  const { item, worn, wornBy, blocked } = cell;
  return (
    <section class="ip-detail" aria-label="Selected item">
      <ItemCard
        item={item}
        plainRarity
        spriteScale={4}
        {...(wornBy === null ? {} : { note: <p class="ip-on">On {wornBy}</p> })}
        aside={
          worn ? (
            <button
              type="button"
              class="ip-act"
              disabled={busy}
              onClick={() => {
                onTakeOff(item);
              }}
            >
              Take off
            </button>
          ) : blocked !== null ? (
            <span class="ip-reason">{blocked}</span>
          ) : (
            <button
              type="button"
              class="ip-act primary"
              disabled={busy}
              onClick={() => {
                onEquip(item);
              }}
            >
              Equip
            </button>
          )
        }
      />
    </section>
  );
}

/**
 * The item picker in a Drawer: an icon grid (the worn item first, then the bag's wearable items, then the
 * ones this creature cannot wear, each with its short reason under it) and a detail panel pinned at the
 * bottom for the selected item, with Equip or Take off. While the gear view loads it says "Loading...". The
 * server decides what is accepted; the callbacks only ask.
 */
export function ItemPickerDrawer({
  open,
  onClose,
  slot,
  creature,
  creatures,
  items,
  busy = false,
  onEquip,
  onTakeOff,
  returnFocusTo,
}: ItemPickerProps) {
  const choices = items === null ? [] : pickerChoices(items, creature, creatures, slot);
  const wornId = creature.gear.find((g) => g.slot === slot)?.id;
  const worn = items?.find((i) => i.id === wornId);
  const cells: Cell[] = [
    ...(worn === undefined ? [] : [{ item: worn, worn: true, wornBy: null, blocked: null }]),
    ...choices.map((choice) => ({
      item: choice.item,
      worn: false,
      wornBy: choice.wornBy,
      blocked: compactReason(choice.item, creature),
    })),
  ];
  const [picked, setPicked] = useState<string | null>(null);
  const selected =
    cells.find((c) => c.item.id === picked) ??
    cells.find((c) => c.worn) ??
    cells.find((c) => c.item.id === firstPick(choices)) ??
    cells[0];
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={slotName(slot)}
      meta={
        items === null || choices.length === 0 ? undefined : `${String(choices.length)} in the bag`
      }
      {...(returnFocusTo === undefined ? {} : { returnFocusTo })}
      class="picker-drawer"
      footer={
        selected === undefined ? undefined : (
          <DetailPanel cell={selected} busy={busy} onEquip={onEquip} onTakeOff={onTakeOff} />
        )
      }
    >
      {items === null ? (
        <p class="muted ip-none">Loading...</p>
      ) : cells.length === 0 ? (
        <p class="muted ip-none">No {slotName(slot).toLowerCase()}s.</p>
      ) : (
        <ul class="ip-grid" aria-label={`${slotName(slot)}s`}>
          {cells.map((cell) => (
            <ItemCell
              key={cell.item.id}
              cell={cell}
              selected={cell.item.id === selected?.item.id}
              onSelect={() => {
                setPicked(cell.item.id);
              }}
            />
          ))}
        </ul>
      )}
    </Drawer>
  );
}
