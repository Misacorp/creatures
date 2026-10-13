import { cssVars } from './css-vars';
import { xpBarView } from './xp-bar';

/**
 * A thick XP bar with its words ("0 of 200 XP") drawn over the fill. The words carry an ink
 * outline, so they read on the gold fill and on the dark trough alike, and the fill sits inside an
 * inner margin so it shows at both ends. Optional end caps sit outside the bar: `startCap` (the
 * current rank, where the creature starts) and `endCap` (the next rank, the destination). The fill
 * animates unless the player prefers reduced motion.
 *
 * `value` of `max` is the XP into this rank. `text` replaces the default words (for example
 * "Top rank"). `label` names the bar for screen readers.
 */
export function XpBar({
  value,
  max,
  label,
  text,
  startCap,
  endCap,
}: {
  value: number;
  max: number;
  label: string;
  text?: string;
  startCap?: string;
  endCap?: string;
}) {
  const view = xpBarView(value, max, text);
  return (
    <div class="xpbar-row">
      {startCap !== undefined && <span class="xpbar-cap start pix">{startCap}</span>}
      <div
        class="xpbar"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={view.max}
        aria-valuenow={view.now}
        aria-valuetext={view.text}
        ref={cssVars({ '--fill': view.pct })}
      >
        <span class={view.filled ? 'xpbar-fill filled' : 'xpbar-fill'} />
        <span class="xpbar-text pix" aria-hidden="true">
          {view.text}
        </span>
        <span class="xpbar-text on-fill pix" aria-hidden="true">
          {view.text}
        </span>
      </div>
      {endCap !== undefined && <span class="xpbar-cap end pix">{endCap}</span>}
    </div>
  );
}
