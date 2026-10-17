import { useState } from 'preact/hooks';
import type { Creature } from '../../api';
import { Magnifier } from '../../CreatureFinder';
import { ELEMENT_OPTIONS, toggled } from '../../creature-find';
import { ItemFrame, ItemSprite } from '../../GearArt';
import type { GearItem, GearRarity, GearSlot } from '../../gear-types';
import { gearName, itemLabel, rarityName, slotName, type EquipChoice } from '../../gear-view';
import { ItemLines, ItemStats } from '../../ItemLines';
import { Drawer } from '../../ui/Drawer';
import { GameIcon } from '../../ui/GameIcon';
import {
  ITEM_QUERY_MAX,
  NO_ITEM_FILTERS,
  RARITY_CHIPS,
  compactReason,
  filterChoices,
  firstPick,
  itemResultLine,
  itemsFiltered,
  linesLine,
  pickerChoices,
  statsLine,
  type ItemFilters,
} from './picker-view';

/** The three ways to choose an item, for the design round: a list, an icon grid, either with find and filter. */
export type PickerView = 'list' | 'grid';

export interface ItemPickerProps {
  open: boolean;
  onClose: () => void;
  slot: GearSlot;
  creature: Creature;
  /** The other creatures (the picker says who wears an item that would move). */
  creatures: readonly Creature[];
  /** The bag: every item the server lists (all slots; the picker shows this slot's). */
  items: readonly GearItem[];
  view: PickerView;
  /** Add the find-and-filter bar (search, Can wear, rarity and element chips) under the heading. */
  find?: boolean;
  /** The find bar's chips and search when the drawer opens (the workbench shows a filtered state). */
  initialFilters?: ItemFilters;
  initialQuery?: string;
  busy?: boolean;
  /** Wear this item (an item another creature wears moves over). */
  onEquip: (item: GearItem) => void;
  /** Take the worn item off. */
  onTakeOff: (item: GearItem) => void;
  returnFocusTo?: HTMLElement | null;
}

/** The little "Lv 15" of an item, in the pixel font. */
function ItemLevel({ level }: { level: number }) {
  return <span class="ip-level pix">Lv {level}</span>;
}

function RarityWord({ rarity }: { rarity: GearRarity }) {
  return <span class={`ip-rarity rarity-${rarity}`}>{rarityName(rarity)}</span>;
}

/** One row of the list: icon, name, item level and rarity, the item's numbers and lines, and its button. */
function ItemRow({
  item,
  worn = false,
  wornBy,
  blocked,
  busy,
  onEquip,
  onTakeOff,
}: {
  item: GearItem;
  worn?: boolean;
  wornBy: string | null;
  blocked: string | null;
  busy: boolean;
  onEquip: (item: GearItem) => void;
  onTakeOff: (item: GearItem) => void;
}) {
  const stats = statsLine(item);
  const lines = linesLine(item);
  return (
    <li class={`ip-row${worn ? ' worn' : ''}${blocked === null ? '' : ' blocked'}`}>
      <ItemFrame rarity={item.rarity} baseId={item.baseId}>
        <ItemSprite baseId={item.baseId} scale={3} />
      </ItemFrame>
      <div class="ip-main">
        <p class="ip-title">
          <span class="ip-name pix">{gearName(item.baseId)}</span>
          <ItemLevel level={item.itemLevel} />
          <RarityWord rarity={item.rarity} />
        </p>
        {stats !== '' && <p class="ip-stats pix">{stats}</p>}
        {lines !== '' && <p class="ip-lines">{lines}</p>}
        {wornBy !== null && <p class="ip-lines">On {wornBy}</p>}
      </div>
      {worn ? (
        <button
          type="button"
          class="ip-act"
          disabled={busy}
          aria-label={`Take off ${itemLabel(item.baseId, item.itemLevel)}`}
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
          aria-label={`Equip ${itemLabel(item.baseId, item.itemLevel)}${wornBy === null ? '' : `, now on ${wornBy}`}`}
          onClick={() => {
            onEquip(item);
          }}
        >
          Equip
        </button>
      )}
    </li>
  );
}

/** P-A: the worn item pinned at the top with Take off, then the bag as rows. */
function ListBody({
  worn,
  rows,
  slot,
  busy,
  onEquip,
  onTakeOff,
}: {
  worn: GearItem | undefined;
  rows: readonly { choice: EquipChoice; blocked: string | null }[];
  slot: GearSlot;
  busy: boolean;
  onEquip: (item: GearItem) => void;
  onTakeOff: (item: GearItem) => void;
}) {
  return (
    <>
      {worn !== undefined && (
        <ul class="ip-list ip-pinned" aria-label="Worn now">
          <ItemRow
            item={worn}
            worn
            wornBy={null}
            blocked={null}
            busy={busy}
            onEquip={onEquip}
            onTakeOff={onTakeOff}
          />
        </ul>
      )}
      {rows.length === 0 ? (
        <p class="muted ip-none">No other {slotName(slot).toLowerCase()}s.</p>
      ) : (
        <ul class="ip-list" aria-label={`${slotName(slot)}s in the bag`}>
          {rows.map(({ choice, blocked }) => (
            <ItemRow
              key={choice.item.id}
              item={choice.item}
              wornBy={choice.wornBy}
              blocked={blocked}
              busy={busy}
              onEquip={onEquip}
              onTakeOff={onTakeOff}
            />
          ))}
        </ul>
      )}
    </>
  );
}

/** One icon of the grid: the item in its rarity frame with its item level in the corner. */
function ItemCell({
  item,
  selected,
  worn,
  blocked,
  onSelect,
}: {
  item: GearItem;
  selected: boolean;
  worn: boolean;
  blocked: string | null;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        class={`ip-cell${selected ? ' selected' : ''}${blocked === null ? '' : ' blocked'}${worn ? ' worn' : ''}`}
        aria-pressed={selected}
        aria-label={`${itemLabel(item.baseId, item.itemLevel)}, ${rarityName(item.rarity)}${worn ? ', worn now' : ''}${blocked === null ? '' : `. ${blocked}`}`}
        onClick={onSelect}
      >
        <ItemFrame rarity={item.rarity} baseId={item.baseId}>
          <ItemSprite baseId={item.baseId} scale={4} />
        </ItemFrame>
        <span class="ip-cell-level pix" aria-hidden="true">
          {worn ? 'Worn' : `Lv ${String(item.itemLevel)}`}
        </span>
      </button>
    </li>
  );
}

/** P-B: the grid of icons. The worn item comes first in it. */
function GridBody({
  cells,
  selectedId,
  onSelect,
  slot,
}: {
  cells: readonly { item: GearItem; worn: boolean; blocked: string | null }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  slot: GearSlot;
}) {
  return cells.length === 0 ? (
    <p class="muted ip-none">No other {slotName(slot).toLowerCase()}s.</p>
  ) : (
    <ul class="ip-grid" aria-label={`${slotName(slot)}s`}>
      {cells.map((cell) => (
        <ItemCell
          key={cell.item.id}
          item={cell.item}
          selected={cell.item.id === selectedId}
          worn={cell.worn}
          blocked={cell.blocked}
          onSelect={() => {
            onSelect(cell.item.id);
          }}
        />
      ))}
    </ul>
  );
}

/** P-B's panel at the bottom of the drawer: the selected item's stats and lines, and its button. */
function DetailPanel({
  item,
  worn,
  wornBy,
  blocked,
  busy,
  onEquip,
  onTakeOff,
}: {
  item: GearItem;
  worn: boolean;
  wornBy: string | null;
  blocked: string | null;
  busy: boolean;
  onEquip: (item: GearItem) => void;
  onTakeOff: (item: GearItem) => void;
}) {
  return (
    <section class="ip-detail" aria-label="Selected item">
      <div class="ip-detail-head">
        <ItemFrame rarity={item.rarity} baseId={item.baseId}>
          <ItemSprite baseId={item.baseId} scale={3} />
        </ItemFrame>
        <div class="ip-detail-title">
          <p class="ip-title">
            <span class="ip-name pix">{gearName(item.baseId)}</span>
            <ItemLevel level={item.itemLevel} />
            <RarityWord rarity={item.rarity} />
          </p>
          {wornBy !== null && <p class="ip-lines">On {wornBy}</p>}
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
      <ItemStats stats={item.stats} />
      <ItemLines lines={item.lines} />
    </section>
  );
}

/**
 * P-C's bar, built from the Creatures tab's find and filter (`CreatureFinder`): the same search field,
 * chips that scroll sideways and result line, with chips for "Can wear", the rarities and the elements
 * instead of "Needs you", elements and roles. Chips within a kind mean "either", across kinds "and".
 */
export function ItemFindBar({
  query,
  onQuery,
  filters,
  onFilters,
  shown,
  total,
}: {
  query: string;
  onQuery: (text: string) => void;
  filters: ItemFilters;
  onFilters: (next: ItemFilters) => void;
  shown: number;
  total: number;
}) {
  return (
    <section class="finder item-find" aria-label="Find an item">
      <div class="finder-search">
        <div class="finder-field">
          <Magnifier />
          <input
            type="text"
            class="finder-input"
            aria-label="Find an item by name"
            placeholder="Find an item"
            autoComplete="off"
            autoCapitalize="off"
            spellcheck={false}
            enterKeyHint="search"
            maxLength={ITEM_QUERY_MAX}
            value={query}
            onInput={(event) => {
              onQuery(event.currentTarget.value);
            }}
          />
          {query !== '' && (
            <button
              type="button"
              class="finder-clear"
              aria-label="Clear the search"
              onClick={() => {
                onQuery('');
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>
      <div class="finder-chips" role="group" aria-label="Filters">
        <button
          type="button"
          class={`fchip${filters.canWear ? ' on' : ''}`}
          aria-pressed={filters.canWear}
          onClick={() => {
            onFilters({ ...filters, canWear: !filters.canWear });
          }}
        >
          Can wear
        </button>
        <span class="fsep" aria-hidden="true" />
        {RARITY_CHIPS.map((rarity) => (
          <button
            key={rarity.id}
            type="button"
            class={`fchip${filters.rarities.includes(rarity.id) ? ' on' : ''}`}
            aria-pressed={filters.rarities.includes(rarity.id)}
            onClick={() => {
              onFilters({
                ...filters,
                rarities: toggled(filters.rarities, rarity.id) as GearRarity[],
              });
            }}
          >
            {rarity.name}
          </button>
        ))}
        <span class="fsep" aria-hidden="true" />
        {ELEMENT_OPTIONS.map((element) => (
          <button
            key={element.id}
            type="button"
            class={`fchip${filters.elements.includes(element.id) ? ' on' : ''}`}
            aria-pressed={filters.elements.includes(element.id)}
            onClick={() => {
              onFilters({ ...filters, elements: toggled(filters.elements, element.id) });
            }}
          >
            <GameIcon icon={{ kind: 'element', element: element.id }} scale={2} />
            {element.name}
          </button>
        ))}
      </div>
      <div class="finder-result">
        <p class="muted" role="status">
          {itemResultLine(shown, total)}
        </p>
        {itemsFiltered(filters, query) && (
          <button
            type="button"
            class="ghost small"
            onClick={() => {
              onFilters(NO_ITEM_FILTERS);
              onQuery('');
            }}
          >
            Clear filters
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * The item picker in a Drawer. `view` picks what the body is: a list of rows (P-A, with the worn item
 * pinned at the top and "Take off") or an icon grid with a detail panel pinned at the bottom (P-B). `find`
 * adds the find-and-filter bar (P-C). Wearable items come first, then the ones this creature cannot
 * wear, each with the short reason. The server decides what is accepted; the callbacks only ask.
 */
export function ItemPickerDrawer({
  open,
  onClose,
  slot,
  creature,
  creatures,
  items,
  view,
  find = false,
  initialFilters = NO_ITEM_FILTERS,
  initialQuery = '',
  busy = false,
  onEquip,
  onTakeOff,
  returnFocusTo,
}: ItemPickerProps) {
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<ItemFilters>(initialFilters);
  const choices = pickerChoices(items, creature, creatures, slot);
  const wornId = creature.gear.find((g) => g.slot === slot)?.id;
  const worn = items.find((i) => i.id === wornId);
  const shown = find ? filterChoices(choices, filters, query) : choices;
  const rows = shown.map((choice) => ({
    choice,
    blocked: compactReason(choice.item, creature),
  }));
  // Grid: the worn item first, then the choices; the detail panel follows the selection.
  const cells = [
    ...(worn === undefined ? [] : [{ item: worn, worn: true, blocked: null, wornBy: null }]),
    ...rows.map(({ choice, blocked }) => ({
      item: choice.item,
      worn: false,
      blocked,
      wornBy: choice.wornBy,
    })),
  ];
  const [picked, setPicked] = useState<string | null>(null);
  const selected =
    cells.find((c) => c.item.id === picked) ??
    cells.find((c) => c.worn) ??
    cells.find((c) => c.item.id === firstPick(shown)) ??
    cells[0];
  const total = choices.length;
  const title = `${slotName(slot)}`;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      meta={find ? undefined : total === 0 ? undefined : `${String(total)} in the bag`}
      {...(returnFocusTo === undefined ? {} : { returnFocusTo })}
      class={`picker-drawer ${view}`}
      {...(find
        ? {
            toolbar: (
              <ItemFindBar
                query={query}
                onQuery={setQuery}
                filters={filters}
                onFilters={setFilters}
                shown={shown.length}
                total={total}
              />
            ),
          }
        : {})}
      {...(view === 'grid' && selected !== undefined
        ? {
            footer: (
              <DetailPanel
                item={selected.item}
                worn={selected.worn}
                wornBy={selected.wornBy}
                blocked={selected.blocked}
                busy={busy}
                onEquip={onEquip}
                onTakeOff={onTakeOff}
              />
            ),
          }
        : {})}
    >
      {view === 'list' ? (
        <ListBody
          worn={worn}
          rows={rows}
          slot={slot}
          busy={busy}
          onEquip={onEquip}
          onTakeOff={onTakeOff}
        />
      ) : (
        <GridBody
          cells={cells}
          selectedId={selected?.item.id ?? null}
          onSelect={setPicked}
          slot={slot}
        />
      )}
    </Drawer>
  );
}
