import { cssVars } from '../css-vars';
import { GlossaryTag } from '../Glossary';
import type { XpKind } from '../XpBar';
import { pct } from '../xp-change';

/**
 * The looks of the track, each with the size lock (the level tag and the bar always share one height, set in
 * `xp-track.css`; no screen overrides it). `shrunk`: the tag shrunk to the bar's height (1.25 rem), its ring
 * drawn inside so the edges match; `snug`: the same, with a narrower tag; `flat`: the tag drawn like the bar
 * (dark, ringed, the level in the kind's colour); `grown`: the bar enlarged to the tag's old height (1.5 rem),
 * its numbers one step bigger. Misa picks one (decisions.md 2026-10-19); change `DEFAULT_XP_SIZE` to switch.
 */
export const XP_SIZES = ['shrunk', 'snug', 'flat', 'grown'] as const;
export type XpSize = (typeof XP_SIZES)[number];

/** The look every XpTrack has unless a screen asks for another (one place to switch it). */
export const DEFAULT_XP_SIZE: XpSize = 'grown';

/**
 * The slim XP bar at rest: the level tag, then the bar with its numbers inside. It is the bar of the
 * "Count-up" row (`ui/XpGain`) once the count has ended, drawn with the same classes (`xp-lv`, `xp-bar`,
 * `xp-new`, `xp-text` in `xp-gain.css`), so the two always look alike: the numbers in bone with an ink
 * edge, readable over the trough and the fill. The creature card shows it across its width.
 *
 * The level tag and the bar are one grid row of one height (`--xp-h`), so they can never differ, whatever
 * `size` is. `value` of `max` is the XP into this level; `top` draws a full bar and `text` ("Top level"). `levelEntry`
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
  size = DEFAULT_XP_SIZE,
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
  /** The look (all keep the size lock); see `XP_SIZES`. */
  size?: XpSize | undefined;
}) {
  const now = Math.max(0, Math.min(value, max));
  const fill = top ? 100 : pct(now, max);
  const words = text ?? `${String(now)} / ${String(max)}`;
  const tag = `${unit} ${String(level)}`;
  return (
    <div class={`xp-static xp-size-${size} xp-kind-${kind} pix`}>
      {levelEntry === undefined ? (
        <span class="xp-lv">{tag}</span>
      ) : (
        <GlossaryTag entry={levelEntry} look="chip" class="xp-lv pix">
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
