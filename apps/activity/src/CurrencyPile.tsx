import { useRef, useState } from 'preact/hooks';
import type { Balances } from './api';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { Sprite } from './sprites/Sprite';
import type { SpriteDef } from './sprites/sprite-data';
import { Popover, popupProps } from './ui/Popover';

/**
 * The currencies button: the Bait coin with the Essence gem laid over its top right, drawn from the
 * same two glyphs the currency popover lists, so the button reads as "my currencies". It is 13x10,
 * so it lives here and not with the 8x8 glyphs.
 */
const CURRENCIES_ICON: SpriteDef = {
  // The ink, bone, gold and coin-rim colours of `glyphs.ts`, and its gem teal.
  palette: { k: '#0d0a1a', w: '#f4eedc', c: '#7fe0d0', g: '#c8952b', y: '#ffd25a' },
  rows: [
    '.......kkkk..',
    '......kwccwk.',
    '..gggkwccccwk',
    '.gyyykcccccck',
    'gyywwykcccck.',
    'gywyyyykcck..',
    'gywyyyygkk...',
    'gyyyyyyg.....',
    '.gyyyyg......',
    '..gggg.......',
  ],
};

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
 * The currency pile: a small Bait-and-Essence button (in the top right, left of "?") that opens a compact
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
        {/* Two sizes; the stylesheet shows the one that fits the wall band (the big one at scale 4). */}
        <Sprite sprite={CURRENCIES_ICON} scale={3} class="coin-big" />
        <Sprite sprite={CURRENCIES_ICON} scale={2} class="coin-small" />
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
