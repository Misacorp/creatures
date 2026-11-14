import type { ComponentChildren } from 'preact';
import { glyphOrUnknown } from '../glyphs';
import { Sprite } from '../sprites/Sprite';
import { SUPPLY_TIERS, type SupplyTier } from '../supply-tiers';

/** One cell of the grid: a supply, drawn as its picture only. */
export interface SupplyCell {
  id: string;
  kind: string;
  tier: SupplyTier;
  /** The spoken name of the button: name, stock and, when it applies, "no creature can craft it yet". */
  label: string;
  /** In stock; shown in the corner when above 0. */
  owned: number;
  /** No creature can craft it yet: drawn dimmed, still selectable. */
  muted: boolean;
  /** Not selectable at all (the button is disabled; the label says why). Default: selectable. */
  disabled?: boolean;
  /** Packed in the trip's kit: a tick in the corner (the send screen). Default: not. */
  packed?: boolean;
  /** Flat grids: the picture to draw in the cell (a house piece, a stamp). Default: the glyph of `kind`. */
  picture?: ComponentChildren;
}

function CellButton({
  cell,
  rarity,
  selected,
  onSelect,
}: {
  cell: SupplyCell;
  rarity: string;
  selected: string | null;
  onSelect: (id: string, button: HTMLButtonElement) => void;
}) {
  const classes = ['item-tile', 'supply-cell', `rarity-${rarity}`];
  if (cell.muted) classes.push('blocked');
  if (selected === cell.id) classes.push('selected');
  if (cell.packed === true) classes.push('packed');
  return (
    <button
      type="button"
      class={classes.join(' ')}
      aria-label={cell.label}
      aria-pressed={cell.packed === undefined ? selected === cell.id : cell.packed}
      disabled={cell.disabled === true}
      onClick={(event) => {
        onSelect(cell.id, event.currentTarget);
      }}
    >
      {cell.picture ?? <Sprite sprite={glyphOrUnknown(cell.kind)} scale={4} />}
      {cell.packed === true && (
        <Sprite sprite={glyphOrUnknown('tick')} scale={2} class="supply-packed" />
      )}
      {cell.owned > 0 && (
        <span class="supply-count pix" aria-hidden="true">
          {cell.owned}
        </span>
      )}
    </button>
  );
}

/**
 * The compact supply picker: four columns (the kinds, left to right) and three rows (the tiers) of square
 * picture buttons with a rarity edge, a tier label at the left of each row and a stock count in a corner.
 * It only reports which cell was chosen; the card for it is drawn by the caller. All text is rendered as
 * text.
 */
export function SupplyGrid({
  kinds = [],
  cells,
  selected,
  onSelect,
  flat = false,
  label = 'Supplies',
}: {
  /** The kinds, one per column, in order (unused by a flat grid). */
  kinds?: readonly string[];
  cells: readonly SupplyCell[];
  selected: string | null;
  /** The chosen cell and its button (a card or popover may point at it). */
  onSelect: (id: string, button: HTMLButtonElement) => void;
  /**
   * One wrapping list of cells instead of kinds by tiers (a house's pieces, stamps and skins): every cell is
   * drawn as the first tier, `picture` replaces the glyph.
   */
  flat?: boolean;
  /** Names the group for assistive technology. */
  label?: string;
}) {
  if (flat) {
    return (
      <div class="supply-grid supply-flat" role="group" aria-label={label}>
        {cells.map((cell) => (
          <CellButton
            key={cell.id}
            cell={cell}
            rarity="common"
            selected={selected}
            onSelect={onSelect}
          />
        ))}
      </div>
    );
  }
  return (
    <div class="supply-grid" role="group" aria-label={label}>
      {SUPPLY_TIERS.map(({ tier, label: tierLabel, rarity }) => (
        <div key={tier} class={`supply-grid-row rarity-${rarity}`}>
          <span class="supply-tier pix" aria-hidden="true">
            {tierLabel}
          </span>
          {kinds.map((kind) => {
            const cell = cells.find((c) => c.kind === kind && c.tier === tier);
            if (cell === undefined) return <span key={kind} class="supply-gap" />;
            return (
              <CellButton
                key={kind}
                cell={cell}
                rarity={rarity}
                selected={selected}
                onSelect={onSelect}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
