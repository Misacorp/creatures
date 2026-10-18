import { useEffect, useRef, useState } from 'preact/hooks';
import type { Creature } from '../api';
import { ItemCorners, ItemSprite } from '../GearArt';
import type { GearItem, GearSlot } from '../gear-types';
import { itemLabel, rarityName, setPiecesWith, slotName } from '../gear-view';
import { ItemCard } from '../ItemCard';
import { Drawer } from '../ui/Drawer';
import { flipOver } from '../ui/flip-logic';
import { FlipArea } from '../ui/Flipper';
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
  const button = useRef<HTMLButtonElement>(null);
  // A flip can pick an item below the fold of the grid: the picked cell scrolls into view.
  useEffect(() => {
    if (selected && typeof button.current?.scrollIntoView === 'function') {
      button.current.scrollIntoView({ block: 'nearest' });
    }
  }, [selected]);
  return (
    <li>
      <button
        ref={button}
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
        <ItemCorners level={item.itemLevel} baseId={item.baseId} />
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
  creature,
  busy,
  onEquip,
  onTakeOff,
}: {
  cell: Cell;
  creature: Creature;
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
        wornInSet={setPiecesWith(item, creature.gear)}
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
  // The detail flips through this slot's grid, in the grid's order; the arrows and the count then say
  // where the picked item is (so the "in the bag" count gives way to them).
  const flip = flipOver({
    list: cells,
    at: cells.findIndex((c) => c.item.id === selected?.item.id),
    noun: 'item',
    nameOf: (cell) => itemLabel(cell.item.baseId, cell.item.itemLevel),
    pick: (cell) => {
      setPicked(cell.item.id);
    },
  });
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={slotName(slot)}
      meta={
        flip !== undefined || items === null || choices.length === 0
          ? undefined
          : `${String(choices.length)} in the bag`
      }
      flip={flip}
      {...(returnFocusTo === undefined ? {} : { returnFocusTo })}
      class="picker-drawer"
      footer={
        selected === undefined ? undefined : (
          <FlipArea flip={flip}>
            <DetailPanel
              cell={selected}
              creature={creature}
              busy={busy}
              onEquip={onEquip}
              onTakeOff={onTakeOff}
            />
          </FlipArea>
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
