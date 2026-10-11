import { cssVars } from './css-vars';

/** A pixel progress bar (ink trough, gold fill). The fill width is a CSS variable, never an inline style. */
export function PixelBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, Math.round((value * 100) / max)));
  return (
    <div
      class="xp"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      aria-label={label}
    >
      <span ref={cssVars({ '--pct': `${String(pct)}%` })} />
    </div>
  );
}
