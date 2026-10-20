import { RULES } from '@creatures/game';
import { useState } from 'preact/hooks';
import type { SupplyPick } from './expedition-types';
import { ChoiceMark, supplyEntry } from './ExpeditionIcons';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { Sprite } from './sprites/Sprite';
import { tierRarityClass } from './supply-tiers';
import { kindLabel, pickFor, setSupply, supplyKindOf, supplyOptions } from './trip-view';
import { SupplyGrid, type SupplyCell } from './ui/SupplyGrid';

interface Props {
  picks: readonly SupplyPick[];
  stock: Readonly<Record<string, number>>;
  /** Replaces the picks (the caller holds them). */
  onChange: (picks: SupplyPick[]) => void;
  /** Opens the Workshop, where supplies are crafted; absent: no shortcut is shown. */
  onOpenWorkshop?: () => void;
}

/**
 * The supplies of a trip, as the Workshop's compact grid (`ui/SupplyGrid`): kinds across, tiers down, stock
 * in a corner. A trip carries at most two supplies and never two of a kind: tapping one packs it (a tick),
 * tapping a packed one takes it out, another tier of a packed kind swaps it. Supplies you have none of
 * are dimmed and cannot be tapped; once the kit is full so are the kinds that are not in it. One card
 * under the grid describes the last tapped supply. Supplies cannot be bought: with none in stock this
 * points to the Workshop.
 */
export function SupplyPicker({ picks, stock, onChange, onOpenWorkshop }: Props) {
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

  const view = options.find((o) => o.id === focus);
  const packedOptions = options.filter((o) => pickFor(picks, o.id) !== undefined);

  return (
    <div class="supply-picker">
      <p class="muted">
        Optional: trips are always free, and carry up to {RULES.expeditions.maxSupplies} supplies of
        different kinds.{' '}
        <GlossaryTag entry="supplies" look="text">
          What are supplies?
        </GlossaryTag>
      </p>
      <SupplyGrid
        kinds={kinds}
        cells={cells}
        selected={focus}
        onSelect={(id) => {
          setFocus(id);
          onChange(setSupply(picks, id, pickFor(picks, id) === undefined ? 'owned' : null));
        }}
      />
      {none && <p class="empty muted">You have no supplies. Craft them in the Workshop.</p>}
      {onOpenWorkshop !== undefined && (
        <p>
          <button type="button" onClick={onOpenWorkshop}>
            Craft supplies in the Workshop
          </button>
        </p>
      )}
      {view !== undefined && (
        <div class={`supply-card card-item ${tierRarityClass(view.tier)}`} aria-live="polite">
          <div class="bp-row">
            <span class="supply-icon">
              <Sprite sprite={glyphOrUnknown(view.kind)} scale={4} />
            </span>
            <div class="bp-text">
              <p class="pix bp-name rarity-name">{view.name}</p>
              <p class="muted supply-owned">
                <GlossaryTag entry={supplyEntry(view.kind)} look="text">
                  {kindLabel(view.kind)}
                </GlossaryTag>
                {' · '}
                {pickFor(picks, view.id) === undefined ? 'Not packed' : 'Packed'}
              </p>
            </div>
          </div>
          <p class="supply-effect">{view.effect}</p>
          <ChoiceMark choice={view.choice} />
        </div>
      )}
      {packedOptions.length > 0 && (
        <p class="supply-kit">Packed: {packedOptions.map((o) => o.name).join(', ')}</p>
      )}
    </div>
  );
}
