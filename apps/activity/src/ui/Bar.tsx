import { cssVars } from '../css-vars';
import { percent } from '../progress-math';

interface BarProps {
  value: number;
  max: number;
  /** Names the bar for screen readers; say what is filling and how far. */
  label: string;
  /** Gold by default; spark is for a push-on in progress. */
  tone?: 'gold' | 'spark' | undefined;
  /** Fills with a one second linear step (for a clock that ticks), none with reduced motion. */
  smooth?: boolean | undefined;
  /** Where the bar sits (its margins), never how it looks. */
  class?: string | undefined;
}

/** A pixel progress bar: an ink trough with a gold fill. The fill width is a CSS variable, never an inline style. */
export function Bar({ value, max, label, tone = 'gold', smooth = false, class: extra }: BarProps) {
  const classes = ['xp'];
  if (tone === 'spark') classes.push('spark');
  if (smooth) classes.push('smooth');
  if (extra !== undefined) classes.push(extra);
  return (
    <div
      class={classes.join(' ')}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(Math.max(value, 0), max)}
      aria-label={label}
    >
      <span ref={cssVars({ '--pct': `${String(percent(value, max))}%` })} />
    </div>
  );
}
