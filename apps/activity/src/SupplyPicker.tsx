import { RULES } from '@creatures/game';
import { useState } from 'preact/hooks';
import type { SupplyPick } from './expedition-types';
import { SupplyCard } from './SupplyCard';
import { pickFor, setSupply, supplyKindOf, supplyOptions } from './trip-view';
import { SupplyGrid, type SupplyCell } from './ui/SupplyGrid';

interface Props {
  picks: readonly SupplyPick[];
  stock: Readonly<Record<string, number>>;
  /** Replaces the picks (the caller holds them). */
  onChange: (picks: SupplyPick[]) => void;
}

/**
 * The supplies of a trip, as the Workshop's compact grid (`ui/SupplyGrid`): kinds across, tiers down, stock
 * in a corner. A trip carries at most two supplies and never two of a kind: tapping one packs it (a tick),
 * tapping a packed one takes it out, another tier of a packed kind swaps it. Supplies you have none of
 * are dimmed and cannot be tapped; once the kit is full so are the kinds that are not in it. One card
 * under the grid describes the last tapped supply while it is packed (nothing once it is taken out; the
 * tick is the whole packed state). Supplies cannot be bought: with none in stock this points to the
 * Workshop (the "Craft" shortcut sits in the step's title row, in `SendTrip`).
 */
export function SupplyPicker({ picks, stock, onChange }: Props) {
  const [focus, setFocus] = useState<string | null>(null);
  const options = supplyOptions(stock);
  const kinds = [...new Set(options.map((o) => o.kind))];
  const full = picks.length >= RULES.expeditions.maxSupplies;
  const packedKinds = new Set(picks.map((p) => supplyKindOf(p.id)));
  const none = options.every((o) => o.owned === 0);

  const cells: SupplyCell[] = options.map((o) => {
    const packed = pickFor(picks, o.id) !== undefined;
    const outOfStock = o.owned === 0;
    const kitFull = full && !packedKinds.has(o.kind);
    const reason = outOfStock ? ', none in stock' : kitFull ? ', your kit is full' : '';
    return {
      id: o.id,
      kind: o.kind,
      tier: o.tier,
      owned: o.owned,
      packed,
      muted: outOfStock || kitFull,
      // A packed supply can always be taken out again, even if its stock ran out meanwhile.
      disabled: (outOfStock || kitFull) && !packed,
      label: `${packed ? 'Take out' : 'Take'} ${o.name}, ${String(o.owned)} in stock${reason}`,
    };
  });

  // The card (and the ring) is for a packed supply only: taking it out hides both.
  const view = options.find((o) => o.id === focus && pickFor(picks, o.id) !== undefined);

  return (
    <div class="supply-picker">
      <SupplyGrid
        kinds={kinds}
        cells={cells}
        selected={view?.id ?? null}
        onSelect={(id) => {
          const packing = pickFor(picks, id) === undefined;
          setFocus(packing ? id : null);
          onChange(setSupply(picks, id, packing ? 'owned' : null));
        }}
      />
      {none && <p class="empty muted">You have no supplies. Craft them in the Workshop.</p>}
      {view !== undefined && <SupplyCard view={view} packed pointAt={kinds.indexOf(view.kind)} />}
    </div>
  );
}
