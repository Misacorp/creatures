import { cssVars } from './css-vars';
import { xpBarView } from './xp-bar';

/** Which XP a bar shows; each has its own colour (`--xp-<kind>` in tokens.css). */
export type XpKind = 'experience' | 'explorer' | 'crafting';

/**
 * A thick XP bar with its words ("0 / 200 XP") drawn over the fill. The words carry an ink
 * outline, so they read on the gold fill and on the dark trough alike, and the fill sits inside an
 * inner margin so it shows at both ends. Optional end caps sit outside the bar: `startCap` (the
 * current rank, where the creature starts) and `endCap` (the next rank, the destination). The fill
 * animates unless the player prefers reduced motion.
 *
 * `value` of `max` is the XP into this rank. `text` replaces the default words (for example
 * "Top rank"). `label` names the bar for screen readers. `kind` picks its colour (experience, gold, by default).
 */
export function XpBar({
  value,
  max,
  label,
  text,
  startCap,
  endCap,
  gained,
  quiet,
  class: extra,
  kind = 'experience',
}: {
  value: number;
  max: number;
  label: string;
  text?: string | undefined;
  startCap?: string | undefined;
  endCap?: string | undefined;
  /** The last part of `value` that was just earned: drawn in a brighter colour than the fill before it. */
  gained?: number | undefined;
  /** Draw no words over the bar (a narrow place: the words are still spoken). */
  quiet?: boolean | undefined;
  /** Where it is used (a smaller bar in a narrow place). */
  class?: string | undefined;
  kind?: XpKind | undefined;
}) {
  const view = xpBarView(value, max, text, gained);
  return (
    <div
      class={
        extra === undefined ? `xpbar-row xp-kind-${kind}` : `xpbar-row xp-kind-${kind} ${extra}`
      }
    >
      {startCap !== undefined && <span class="xpbar-cap start pix">{startCap}</span>}
      <div
        class="xpbar"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={view.max}
        aria-valuenow={view.now}
        aria-valuetext={view.text}
        ref={cssVars({ '--fill': view.pct, '--from': view.fromPct })}
      >
        <span
          class={['xpbar-fill', view.filled ? 'filled' : '', view.hasGain ? 'has-gain' : '']
            .filter((c) => c !== '')
            .join(' ')}
        />
        {quiet !== true && (
          <>
            <span class="xpbar-text pix" aria-hidden="true">
              {view.text}
            </span>
            <span class="xpbar-text on-fill pix" aria-hidden="true">
              {view.text}
            </span>
          </>
        )}
      </div>
      {endCap !== undefined && <span class="xpbar-cap end pix">{endCap}</span>}
    </div>
  );
}
