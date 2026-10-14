import { useRef, useState } from 'preact/hooks';
import type { Balances } from './api';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { Sprite } from './sprites/Sprite';
import { Popover, popupProps } from './ui/Popover';

/** What assistive technology says for the button: both amounts. */
export function currencyLabel(balances: Balances): string {
  return `Currencies: ${String(balances.bait)} Bait, ${String(balances.essence)} Essence`;
}

/** One line of the popover: the currency's picture, its amount and its glossary tag. */
function CurrencyLine({
  glyph,
  amount,
  entry,
  name,
}: {
  glyph: string;
  amount: number;
  entry: string;
  name: string;
}) {
  return (
    <li class="currency-line">
      <Sprite sprite={glyphOrUnknown(glyph)} scale={3} />
      <span class="currency-amount pix">{amount}</span>
      <GlossaryTag entry={entry}>{name}</GlossaryTag>
    </li>
  );
}

/**
 * The currency pile: a small coin-pile button (in the top right, left of "?") that opens a compact
 * popover with the Bait and Essence balances and their glossary tags. The popover is its own, so the
 * tags can open their entries above it without closing it. Reachable from every tab.
 */
export function CurrencyPile({ balances }: { balances: Balances }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={ref}
        type="button"
        class="currency-pile"
        {...popupProps(open)}
        aria-label={currencyLabel(balances)}
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        {/* Two sizes; the stylesheet shows the one that fits (the small one on a thin wall band). */}
        <Sprite sprite={glyphOrUnknown('coins')} scale={3} class="coin-big" />
        <Sprite sprite={glyphOrUnknown('coins')} scale={2} class="coin-small" />
      </button>
      {open && (
        <Popover
          layer="page"
          size="compact"
          anchor={() => ref.current}
          label="Currencies"
          onClose={() => {
            setOpen(false);
          }}
        >
          <ul class="currency-lines">
            <CurrencyLine glyph="bait" amount={balances.bait} entry="bait" name="Bait" />
            <CurrencyLine glyph="gem" amount={balances.essence} entry="essence" name="Essence" />
          </ul>
        </Popover>
      )}
    </>
  );
}
