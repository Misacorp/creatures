/** Pure helpers of `XpBar`: the fill and the words drawn over it. Integer XP only. */

interface XpBarView {
  /** Fill, 0 to 100 (one decimal). */
  pct: number;
  /** The value inside the bar, clamped to 0..max. */
  now: number;
  max: number;
  /** "0 / 200 XP", or the caller's text. */
  text: string;
  /** True when there is something to draw (so a tiny fill still shows). */
  filled: boolean;
}

const whole = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0);

/** The bar for `value` of `max` XP. `text` replaces the default words (for example "Top rank"). */
export function xpBarView(value: number, max: number, text?: string): XpBarView {
  const span = whole(max);
  const now = Math.min(span, whole(value));
  const pct = span === 0 ? 0 : Math.floor((now * 1000) / span) / 10;
  return {
    pct,
    now,
    max: span,
    text: text ?? `${String(now)} / ${String(span)} XP`,
    filled: now > 0,
  };
}
