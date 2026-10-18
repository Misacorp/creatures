import type { SupplyPick } from './expedition-types';
import { ChoiceMark, supplyEntry } from './ExpeditionIcons';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { LurePicker } from './LurePicker';
import { Sprite } from './sprites/Sprite';
import {
  canCarry,
  kindName,
  pickFor,
  setSupply,
  supplyOptions,
  type SupplyOption,
} from './trip-view';

interface Props {
  picks: readonly SupplyPick[];
  stock: Readonly<Record<string, number>>;
  /** Replaces the picks (the caller holds them). */
  onChange: (picks: SupplyPick[]) => void;
  /** Opens the Workshop, where supplies are crafted; absent: no shortcut is shown. */
  onOpenWorkshop?: () => void;
}

/** One supply you have: what it does, whether it makes the end-of-trip choice likely or certain, and a button to take it. */
function SupplyRow({
  option,
  pick,
  carriable,
  picks,
  onChange,
}: {
  option: SupplyOption;
  pick: SupplyPick | undefined;
  carriable: boolean;
  picks: readonly SupplyPick[];
  onChange: Props['onChange'];
}) {
  return (
    <li class={`supply-row${pick === undefined ? '' : ' on'}`}>
      <div class="supply-text">
        <p class="pix supply-name">{option.name}</p>
        <p class="muted supply-effect">{option.effect}</p>
        <ChoiceMark choice={option.choice} />
      </div>
      <div class="supply-buttons">
        <button
          type="button"
          class={pick === undefined ? '' : 'primary'}
          aria-pressed={pick !== undefined}
          disabled={!carriable}
          aria-label={`Take your ${option.name} (you have ${String(option.owned)})`}
          onClick={() => {
            onChange(setSupply(picks, option.id, pick === undefined ? 'owned' : null));
          }}
        >
          Take ({option.owned})
        </button>
      </div>
    </li>
  );
}

/**
 * The optional supplies of a trip: the ones in your stock, grouped by kind. Supplies cannot be bought;
 * they come from the daily dungeon, from trips and from the Workshop, so with none in stock this says
 * where to get them. A trip carries at most two supplies and never two of a kind; picking the same
 * one again takes it off. A supply that makes the end-of-trip choice certain says "Choice guaranteed".
 */
export function SupplyPicker({ picks, stock, onChange, onOpenWorkshop }: Props) {
  // Lures have their own compact row; the picker below holds the other kinds.
  const options = supplyOptions(stock).filter((o) => o.owned > 0 && o.kind !== 'lure');
  const kinds = [...new Set(options.map((o) => o.kind))];
  return (
    <div class="supply-picker">
      <p class="muted">
        Optional: trips are always free.{' '}
        <GlossaryTag entry="supplies" look="text">
          What are supplies?
        </GlossaryTag>{' '}
        You get them from the daily dungeon and from trips, or craft them in the Workshop.
      </p>
      <LurePicker picks={picks} stock={stock} onChange={onChange} onOpenWorkshop={onOpenWorkshop} />
      {options.length === 0 && <p class="empty muted">You have no other supplies right now.</p>}
      {onOpenWorkshop !== undefined && (
        <p>
          <button type="button" onClick={onOpenWorkshop}>
            Craft supplies in the Workshop
          </button>
        </p>
      )}
      {kinds.map((kind) => (
        <section key={kind} class="supply-kind" aria-label={kindName(kind)}>
          <h5 class="pix supply-kind-name">
            <Sprite sprite={glyphOrUnknown(kind)} scale={3} />
            <GlossaryTag entry={supplyEntry(kind)} look="text">
              {kindName(kind)}
            </GlossaryTag>
          </h5>
          <ul class="supply-rows">
            {options
              .filter((o) => o.kind === kind)
              .map((option) => (
                <SupplyRow
                  key={option.id}
                  option={option}
                  pick={pickFor(picks, option.id)}
                  carriable={canCarry(picks, option.id)}
                  picks={picks}
                  onChange={onChange}
                />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
