import type { SupplyPick } from './expedition-types';
import { ChoiceMark, supplyEntry } from './ExpeditionIcons';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { Sprite } from './sprites/Sprite';
import {
  canCarry,
  kindName,
  pickFor,
  setSupply,
  supplyOptions,
  type SupplyOption,
  type SupplySource,
} from './trip-view';

interface Props {
  picks: readonly SupplyPick[];
  stock: Readonly<Record<string, number>>;
  bait: number;
  /** Replaces the picks (the caller holds them). */
  onChange: (picks: SupplyPick[]) => void;
}

/** One supply: what it does, whether it makes the end-of-trip choice likely or certain, and how to take it. */
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
  const choose = (source: SupplySource): void => {
    onChange(setSupply(picks, option.id, pick?.source === source ? null : source));
  };
  return (
    <li class={`supply-row${pick === undefined ? '' : ' on'}`}>
      <div class="supply-text">
        <p class="pix supply-name">{option.name}</p>
        <p class="muted supply-effect">{option.effect}</p>
        <ChoiceMark choice={option.choice} />
      </div>
      <div class="supply-buttons">
        {option.owned > 0 && (
          <button
            type="button"
            class={pick?.source === 'owned' ? 'primary' : ''}
            aria-pressed={pick?.source === 'owned'}
            disabled={!carriable}
            aria-label={`Use your ${option.name} (you have ${String(option.owned)})`}
            onClick={() => {
              choose('owned');
            }}
          >
            Use ({option.owned})
          </button>
        )}
        <button
          type="button"
          class={pick?.source === 'buy' ? 'primary' : ''}
          aria-pressed={pick?.source === 'buy'}
          disabled={!carriable}
          aria-label={`Buy ${option.name} for ${String(option.price)} Bait`}
          onClick={() => {
            choose('buy');
          }}
        >
          Buy {option.price} Bait
        </button>
      </div>
    </li>
  );
}

/**
 * The optional supplies of a trip, grouped by kind: take one from your stock (free) or buy it with Bait
 * (the price is on the button). A trip carries at most two supplies and never two of a kind; picking the
 * same one again takes it off. A supply that makes the end-of-trip choice certain says "Choice guaranteed".
 */
export function SupplyPicker({ picks, stock, bait, onChange }: Props) {
  const options = supplyOptions(stock);
  const kinds = [...new Set(options.map((o) => o.kind))];
  return (
    <div class="supply-picker">
      <p class="muted">
        Optional. Trips without supplies are free.{' '}
        <GlossaryTag entry="supplies" look="text">
          What are supplies?
        </GlossaryTag>{' '}
        You have {bait} <GlossaryTag entry="bait">Bait</GlossaryTag>.
      </p>
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
