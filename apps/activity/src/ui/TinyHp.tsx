import { cssVars } from '../css-vars';
import { hpShare } from '../hp-share';

/**
 * A tiny HP bar for a creature in a crowded view (the raid's fight stage; any small tile): a few
 * pixels tall, with a hard dark edge so two bars side by side never read as one. When the HP drops,
 * the lost part flashes white and then drains away; the stylesheet does it from one width
 * (`--hp`), which the solid fill follows at once and the white strip under it follows late. Red at
 * 30% or less, empty when knocked out. Decoration: the creature's name says its HP to a screen reader.
 */
export function TinyHp({ current, max }: { current: number; max: number }) {
  const share = hpShare(current, max);
  return (
    <span
      class={`tiny-hp${share <= 0.3 ? ' low' : ''}${current <= 0 ? ' empty' : ''}`}
      ref={cssVars({ '--hp': `${(share * 100).toFixed(2)}%` })}
      aria-hidden="true"
    >
      <span class="tiny-hp-hurt" />
      <span class="tiny-hp-fill" />
    </span>
  );
}
