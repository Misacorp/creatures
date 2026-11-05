import { content } from '@creatures/game';
import {
  NO_FILTER,
  SORT_OPTIONS,
  elementChoiceName,
  isFiltered,
  type BagFilter,
  type ElementChoice,
  type RarityChoice,
  type SlotChoice,
} from './bag-filter';
import { Accordion } from './ui/Accordion';
import { Segmented } from './ui/Segmented';

const SLOTS: readonly { id: SlotChoice; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'hat', label: 'Hat' },
  { id: 'scarf', label: 'Scarf' },
  { id: 'charm', label: 'Charm' },
];
const RARITIES: readonly { id: RarityChoice; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'common', label: 'Common' },
  { id: 'rare', label: 'Rare' },
  { id: 'epic', label: 'Epic' },
];
const ELEMENTS: readonly ElementChoice[] = ['all', ...content.elements.map((e) => e.id), 'none'];

/**
 * The bag's filter and sort (V-GEAR-7, the valley's Forge): one quiet fold, "Filter and sort", closed until asked for, with a short row of
 * exclusive choices for each of slot, rarity, element and the order (`ui/Segmented` inside `ui/Accordion`). While a filter is on, the
 * fold's note says how many of the bag it shows, and "Select all" takes the pieces shown (at most one pile, the most a dismantle takes
 * at once) for the bulk bar's Dismantle. A filter only decides what the grid draws: nothing is hidden for good.
 */
export function BagTools({
  filter,
  onChange,
  shown,
  total,
  onSelectAll,
  selectable,
  open = false,
}: {
  filter: BagFilter;
  onChange: (filter: BagFilter) => void;
  /** How many items the filter lets through, out of `total` in the bag. */
  shown: number;
  total: number;
  onSelectAll: () => void;
  /** How many "Select all" would take. */
  selectable: number;
  /** The fold starts open (the workbench shows it so). */
  open?: boolean;
}) {
  const on = isFiltered(filter);
  return (
    <Accordion
      title="Filter and sort"
      variant="compact"
      {...(on ? { meta: `${String(shown)} of ${String(total)}`, metaTone: 'gold' as const } : {})}
      class="bag-tools"
      defaultOpen={open}
    >
      <div class="dr-stack bag-tools-body">
        <div class="dr-group">
          <span class="bag-tools-name">Slot</span>
          <Segmented
            label="Slot"
            options={SLOTS}
            value={filter.slot}
            onChange={(slot) => {
              onChange({ ...filter, slot });
            }}
          />
        </div>
        <div class="dr-group">
          <span class="bag-tools-name">Rarity</span>
          <Segmented
            label="Rarity"
            options={RARITIES}
            value={filter.rarity}
            onChange={(rarity) => {
              onChange({ ...filter, rarity });
            }}
          />
        </div>
        <div class="dr-group">
          <span class="bag-tools-name">Element</span>
          <Segmented
            label="Element"
            options={ELEMENTS.map((id) => ({ id, label: elementChoiceName(id) }))}
            value={filter.element}
            onChange={(element) => {
              onChange({ ...filter, element });
            }}
          />
        </div>
        <div class="dr-group">
          <span class="bag-tools-name">Order</span>
          <Segmented
            label="Order"
            options={SORT_OPTIONS}
            value={filter.sort}
            onChange={(sort) => {
              onChange({ ...filter, sort });
            }}
          />
        </div>
        <p class="actions bag-tools-actions">
          <button type="button" disabled={selectable === 0} onClick={onSelectAll}>
            {selectable < shown
              ? `Select ${String(selectable)} (the most at once)`
              : `Select all ${String(selectable)}`}
          </button>
          {on && (
            <button
              type="button"
              class="ghost"
              onClick={() => {
                onChange({ ...NO_FILTER, sort: filter.sort });
              }}
            >
              Clear the filter
            </button>
          )}
        </p>
      </div>
    </Accordion>
  );
}
