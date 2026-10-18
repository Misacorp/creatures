import { useState } from 'preact/hooks';
import type { Creature } from '../api';
import type { GearItem, GearSlot } from '../gear-types';
import { itemLabel, rarityName, setPiecesWith, slotName } from '../gear-view';
import { ItemCard } from '../ItemCard';
import { ItemTile } from '../ItemTile';
import { Drawer } from '../ui/Drawer';
import { flipOver } from '../ui/flip-logic';
import { FlipArea } from '../ui/Flipper';
import { ScrollHint } from '../ui/ScrollHint';
import { diffItems } from './compare-diff';
import { loadCompareOn, saveCompareOn } from './compare-pref';
import { CompareSwitch } from './CompareSwitch';
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
  /** The item the picker starts on (the workbench shows a swap); the worn item, else the best pick, when absent. */
  initialPicked?: string;
  /** The compare switch's starting state (the workbench shows it off); the viewer's stored setting, else on, when absent. */
  initialCompare?: boolean;
}

/** One entry of the grid: an item, whether the creature wears it, who else does and why it cannot be worn. */
interface Cell {
  item: GearItem;
  worn: boolean;
  wornBy: string | null;
  blocked: string | null;
}

/**
 * The panel pinned at the bottom of the drawer: the selected item as the one item card (image with its level at
 * the top left, name, rarity badge and base stats, a divider, the modifiers), with Equip, Take off or the reason
 * it cannot be worn at the top right. All of it is in the pixel font.
 */
function DetailPanel({
  cell,
  creature,
  wornItem,
  compareOn,
  onCompareChange,
  busy,
  onEquip,
  onTakeOff,
}: {
  cell: Cell;
  creature: Creature;
  /** The item worn in this slot, to compare with; undefined when the slot is empty. */
  wornItem: GearItem | undefined;
  compareOn: boolean;
  onCompareChange: (on: boolean) => void;
  busy: boolean;
  onEquip: (item: GearItem) => void;
  onTakeOff: (item: GearItem) => void;
}) {
  const { item, worn, wornBy, blocked } = cell;
  // Nothing to compare when the slot is empty or the item is the worn one: no switch then.
  const comparable = !worn && wornItem !== undefined;
  const comparing = comparable && compareOn;
  return (
    <section class="ip-detail" aria-label="Selected item">
      {/* The card scrolls inside its own box (a long Epic with its lost lines is tall) and hints that it does; the actions below stay put. */}
      <ScrollHint
        class="ip-detail-scroll"
        contentKey={`${item.id}:${String(comparing)}`}
        label="Item details"
        focusable
      >
        <ItemCard
          item={item}
          plainRarity
          spriteScale={4}
          wornInSet={setPiecesWith(item, creature.gear)}
          {...(comparing ? { diff: diffItems(item, wornItem) } : {})}
          {...(wornBy === null ? {} : { note: <p class="ip-on">On {wornBy}</p> })}
        />
      </ScrollHint>
      <div class="ip-actions">
        {comparable && <CompareSwitch on={compareOn} onChange={onCompareChange} />}
        {worn ? (
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
        )}
      </div>
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
  initialPicked,
  initialCompare,
}: ItemPickerProps) {
  // The switch is remembered per viewer; it is read when the picker opens and written when it is flipped.
  const [compareOn, setCompareOn] = useState<boolean>(() => initialCompare ?? loadCompareOn());
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
  const [picked, setPicked] = useState<string | null>(initialPicked ?? null);
  // A second tap on the item shown closes its details, so the grid has the whole drawer; any tap opens them.
  const [detailOpen, setDetailOpen] = useState(true);
  const shown =
    cells.find((c) => c.item.id === picked) ??
    cells.find((c) => c.worn) ??
    cells.find((c) => c.item.id === firstPick(choices)) ??
    cells[0];
  const selected = detailOpen ? shown : undefined;
  // The detail flips through this slot's grid, in the grid's order; the arrows and the count then say
  // where the picked item is (so the "in the bag" count gives way to them).
  const flip =
    selected === undefined
      ? undefined
      : flipOver({
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
              wornItem={worn}
              compareOn={compareOn}
              onCompareChange={(on) => {
                setCompareOn(on);
                saveCompareOn(on);
              }}
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
        <ul class="item-grid" aria-label={`${slotName(slot)}s`}>
          {cells.map((cell) => (
            <ItemTile
              key={cell.item.id}
              item={cell.item}
              label={`${itemLabel(cell.item.baseId, cell.item.itemLevel)}, ${rarityName(cell.item.rarity)}${cell.worn ? ', worn now' : ''}${cell.blocked === null ? '' : `. ${cell.blocked}`}`}
              selected={cell.item.id === shown?.item.id}
              pressed={cell.item.id === selected?.item.id}
              blocked={cell.blocked !== null}
              flag={cell.worn ? 'Worn' : null}
              onSelect={() => {
                if (cell.item.id === selected?.item.id) {
                  setDetailOpen(false);
                  return;
                }
                setPicked(cell.item.id);
                setDetailOpen(true);
              }}
            />
          ))}
        </ul>
      )}
    </Drawer>
  );
}
