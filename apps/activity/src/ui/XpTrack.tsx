import { cssVars } from '../css-vars';
import { GlossaryTag } from '../Glossary';
import type { XpKind } from '../XpBar';
import { pct } from '../xp-change';

/**
 * The slim XP bar at rest: the level tag, then the bar with its numbers inside. It is the bar of the
 * "Count-up" row (`ui/XpGain`) once the count has ended, drawn with the same classes (`xp-lv`, `xp-bar`,
 * `xp-new`, `xp-text` in `xp-gain.css`), so the two always look alike: the numbers in bone with an ink
 * edge, readable over the trough and the fill. The creature card shows it across its width.
 *
 * `value` of `max` is the XP into this level; `top` draws a full bar and `text` ("Top level"). `levelEntry`
 * makes the level tag open that glossary entry (no "?" is drawn). `label` names the bar for screen readers.
 */
export function XpTrack({
  level,
  value,
  max,
  label,
  text,
  top = false,
  unit = 'Lv',
  kind = 'experience',
  levelEntry,
}: {
  level: number;
  value: number;
  max: number;
  label: string;
  /** The words in the bar; "value / max" by default. */
  text?: string | undefined;
  top?: boolean | undefined;
  unit?: string | undefined;
  kind?: XpKind | undefined;
  levelEntry?: string | undefined;
}) {
  const now = Math.max(0, Math.min(value, max));
  const fill = top ? 100 : pct(now, max);
  const words = text ?? `${String(now)} / ${String(max)}`;
  const tag = `${unit} ${String(level)}`;
  return (
    <div class={`xp-static xp-kind-${kind} pix`}>
      {levelEntry === undefined ? (
        <span class="xp-lv">{tag}</span>
      ) : (
        <GlossaryTag entry={levelEntry} look="chip" bare class="xp-lv pix">
          {tag}
        </GlossaryTag>
      )}
      <span
        class="xp-bar"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={top ? 1 : max}
        aria-valuenow={top ? 1 : now}
        aria-valuetext={words}
        ref={cssVars({ '--from': 0, '--to': fill })}
      >
        <span class="xp-new" />
        <span class="xp-text" aria-hidden="true">
          {words}
        </span>
      </span>
    </div>
  );
}
