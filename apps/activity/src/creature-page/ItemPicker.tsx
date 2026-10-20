import { useEffect, useRef, useState } from 'preact/hooks';
import type { Creature } from '../api';
import type { GearItem, GearSlot } from '../gear-types';
import { itemLabel, rarityName, setPiecesWith, slotName } from '../gear-view';
import { ItemCard } from '../ItemCard';
import { ItemTile } from '../ItemTile';
import { CloseGlyph, Drawer } from '../ui/Drawer';
import { ScrollHint } from '../ui/ScrollHint';
import { Switch } from '../ui/Switch';
import { diffItems } from './compare-diff';
import { loadCompareOn, saveCompareOn } from './compare-pref';
import { compactReason, pickerChoices } from './picker-view';

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

/**
 * One entry of the grid: an item, whether the creature wears it, who else does (their name and species) and
 * the game's reason it cannot be worn here. An item another creature wears is taken: greyed out in the grid,
 * and moved only by its own button ("Take from Pebble"), never by a plain Equip.
 */
interface Cell {
  item: GearItem;
  worn: boolean;
  wornBy: string | null;
  wornBySpecies: string | null;
  blocked: string | null;
}

/** Greyed out in the grid: it cannot be worn, or another creature wears it. */
function dimmed(cell: Cell): boolean {
  return cell.blocked !== null || cell.wornBy !== null;
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
  onClose,
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
  /** Close the details (the item stays marked in the grid): the same as a second tap on its tile. */
  onClose: () => void;
}) {
  const { item, worn, wornBy, blocked } = cell;
  // Nothing to compare when the slot is empty or the item is the worn one: no switch then.
  const comparable = !worn && wornItem !== undefined;
  const comparing = comparable && compareOn;
  return (
    <section class="ip-detail pix-panel" aria-label="Selected item">
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
          aside={
            <button type="button" class="ip-close" aria-label="Close details" onClick={onClose}>
              <CloseGlyph />
            </button>
          }
          wornInSet={setPiecesWith(item, creature.gear)}
          {...(comparing ? { diff: diffItems(item, wornItem) } : {})}
        />
      </ScrollHint>
      <div class="ip-actions">
        {comparable && <Switch on={compareOn} onChange={onCompareChange} label="Compare" />}
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
        ) : wornBy !== null ? (
          // Not the gold Equip: the words say whose item it is, so moving it is never a surprise.
          <button
            type="button"
            class="ip-act"
            disabled={busy}
            onClick={() => {
              onEquip(item);
            }}
          >
            Take from {wornBy}
          </button>
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
 * bottom for the selected item, with Equip or Take off. Tapping an item in the grid is how you move between
 * items here (no Prev / Next row: the grid is right there). While the gear view loads it says "Loading...".
 * The server decides what is accepted; the callbacks only ask.
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
    ...(worn === undefined
      ? []
      : [{ item: worn, worn: true, wornBy: null, wornBySpecies: null, blocked: null }]),
    ...choices.map((choice) => ({
      item: choice.item,
      worn: false,
      wornBy: choice.wornBy,
      wornBySpecies: choice.wornBySpecies,
      blocked: compactReason(choice.item, creature),
    })),
  ];
  const [picked, setPicked] = useState<string | null>(initialPicked ?? null);
  // It opens with nothing selected (the grid has the whole drawer) until an item is tapped; a second tap on
  // the item shown closes its details again. (The workbench starts on an item with `initialPicked`.)
  const [detailOpen, setDetailOpen] = useState(initialPicked !== undefined);
  const shown = cells.find((c) => c.item.id === picked);
  const selected = detailOpen ? shown : undefined;
  // The details closed (the X, or a second tap): the focus goes to the item that stays marked in the grid.
  const grid = useRef<HTMLUListElement>(null);
  const wasOpen = useRef(detailOpen);
  useEffect(() => {
    if (wasOpen.current && !detailOpen)
      grid.current?.querySelector<HTMLElement>('.selected')?.focus();
    wasOpen.current = detailOpen;
  }, [detailOpen]);
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
            onClose={() => {
              setDetailOpen(false);
            }}
          />
        )
      }
    >
      {items === null ? (
        <p class="muted ip-none">Loading...</p>
      ) : cells.length === 0 ? (
        <p class="muted ip-none">No {slotName(slot).toLowerCase()}s.</p>
      ) : (
        <ul ref={grid} class="item-grid" aria-label={`${slotName(slot)}s`}>
          {cells.map((cell) => (
            <ItemTile
              key={cell.item.id}
              item={cell.item}
              label={`${itemLabel(cell.item.baseId, cell.item.itemLevel)}, ${rarityName(cell.item.rarity)}${cell.worn ? ', worn now' : ''}${cell.wornBy === null ? '' : `, worn by ${cell.wornBy}`}${cell.blocked === null ? '' : `. ${cell.blocked}`}`}
              selected={cell.item.id === shown?.item.id}
              pressed={cell.item.id === selected?.item.id}
              blocked={dimmed(cell)}
              flag={cell.worn ? 'Worn' : null}
              wearer={cell.wornBySpecies}
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
