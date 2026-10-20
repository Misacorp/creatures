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
}

/**
 * The compact supply picker: four columns (the kinds, left to right) and three rows (the tiers) of square
 * picture buttons with a rarity edge, a tier label at the left of each row and a stock count in a corner.
 * It only reports which cell was chosen; the card for it is drawn by the caller. All text is rendered as
 * text.
 */
export function SupplyGrid({
  kinds,
  cells,
  selected,
  onSelect,
}: {
  /** The kinds, one per column, in order. */
  kinds: readonly string[];
  cells: readonly SupplyCell[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div class="supply-grid" role="group" aria-label="Supplies">
      {SUPPLY_TIERS.map(({ tier, label, rarity }) => (
        <div key={tier} class={`supply-grid-row rarity-${rarity}`}>
          <span class="supply-tier pix" aria-hidden="true">
            {label}
          </span>
          {kinds.map((kind) => {
            const cell = cells.find((c) => c.kind === kind && c.tier === tier);
            if (cell === undefined) return <span key={kind} class="supply-gap" />;
            const classes = ['item-tile', 'supply-cell', `rarity-${rarity}`];
            if (cell.muted) classes.push('blocked');
            if (selected === cell.id) classes.push('selected');
            if (cell.packed === true) classes.push('packed');
            return (
              <button
                key={kind}
                type="button"
                class={classes.join(' ')}
                aria-label={cell.label}
                aria-pressed={cell.packed === undefined ? selected === cell.id : cell.packed}
                disabled={cell.disabled === true}
                onClick={() => {
                  onSelect(cell.id);
                }}
              >
                <Sprite sprite={glyphOrUnknown(kind)} scale={4} />
                {cell.packed === true && (
                  <span class="supply-packed pix" aria-hidden="true">
                    ✓
                  </span>
                )}
                {cell.owned > 0 && (
                  <span class="supply-count pix" aria-hidden="true">
                    {cell.owned}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
