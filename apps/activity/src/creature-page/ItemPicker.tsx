import { useState } from 'preact/hooks';
import type { Creature } from '../api';
import { ItemSprite } from '../GearArt';
import type { GearItem, GearRarity, GearSlot } from '../gear-types';
import { gearName, itemLabel, rarityName, slotName } from '../gear-view';
import { ItemLines } from '../ItemLines';
import { Drawer } from '../ui/Drawer';
import { compactReason, firstPick, pickerChoices, statRows } from './picker-view';

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
        <span class="ip-cell-level pix" aria-hidden="true">
          {item.itemLevel}
        </span>
      </button>
    </li>
  );
}

function RarityWord({ rarity }: { rarity: GearRarity }) {
  return <span class={`ip-rarity pix rarity-${rarity}`}>{rarityName(rarity)}</span>;
}

/**
 * The panel pinned at the bottom of the drawer: the selected item. All of it is in the pixel font. First
 * its name, level, rarity and button, then a white block of base stats (one row each: the base number and
 * the bonus its local lines add, "Attack 26 +15"), a divider, and the modifiers with their values and tier pips.
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
  const rows = statRows(item.stats);
  return (
    <section class="ip-detail pix" aria-label="Selected item">
      <div class="ip-detail-head">
        <ItemSprite baseId={item.baseId} scale={4} />
        <div class="ip-detail-title">
          <p class="ip-title">
            <span class="ip-name">{gearName(item.baseId)}</span>
            <span class="ip-level">Lv {item.itemLevel}</span>
            <RarityWord rarity={item.rarity} />
          </p>
          {wornBy !== null && <p class="ip-on">On {wornBy}</p>}
        </div>
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
      {rows.length > 0 && (
        <ul class="ip-base" aria-label="Base stats">
          {rows.map((row) => (
            <li key={row.stat} class="ip-row-stat">
              <span class="ip-stat-label">{row.label}</span> <span>{row.base}</span>
              {row.bonus !== null && (
                <>
                  {' '}
                  <span
                    class="ip-stat-bonus"
                    aria-label={`plus ${row.bonus.slice(1)} from its lines`}
                  >
                    {row.bonus}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {rows.length > 0 && item.lines.length > 0 && <hr class="ip-divider" />}
      <ItemLines lines={item.lines} />
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
