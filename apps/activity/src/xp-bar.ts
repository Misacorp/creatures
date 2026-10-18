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
  /**
   * Where the part the bar just gained starts, as a percent of the fill (0 to 100): the fill before it is
   * drawn darker. 100 when nothing was gained (the fill is all one colour).
   */
  fromPct: number;
  /** True when a gained part is drawn apart. */
  hasGain: boolean;
}

const whole = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0);

/**
 * The bar for `value` of `max` XP. `text` replaces the default words (for example "Top rank"). `gained` is
 * the last part of `value` that was just earned: it is drawn apart from the fill before it.
 */
export function xpBarView(value: number, max: number, text?: string, gained = 0): XpBarView {
  const span = whole(max);
  const now = Math.min(span, whole(value));
  const pct = span === 0 ? 0 : Math.floor((now * 1000) / span) / 10;
  const part = Math.min(now, whole(gained));
  const hasGain = part > 0;
  return {
    pct,
    now,
    max: span,
    text: text ?? `${String(now)} / ${String(span)} XP`,
    filled: now > 0,
    fromPct: hasGain ? Math.floor(((now - part) * 1000) / now) / 10 : 100,
    hasGain,
  };
}
