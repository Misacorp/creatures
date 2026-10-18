import type { ComponentChildren } from 'preact';
import { glyphOrUnknown } from '../glyphs';
import { Sprite } from '../sprites/Sprite';
import { XpBar } from '../XpBar';
import { Tag } from './Tag';

/** The bar of one gain: the `XpBar` values. */
export interface XpGainBar {
  value: number;
  max: number;
  /** Names the bar for screen readers ("Cindle's experience"). */
  label: string;
  /** Replaces the bar's "0 / 200 XP" ("Top level"). */
  text?: string | undefined;
  startCap?: string | undefined;
  endCap?: string | undefined;
  /** `craft`: the Crafting skill's own colour, so it is never read as the creature's experience (gold). */
  tone?: 'craft' | undefined;
}

/**
 * One "XP gained" line, the same wherever the app shows what an activity paid: a label ("Experience",
 * "Explorer", "Crafting"), what changed (a level change "Lv 4 to Lv 5", anything in `head` such as a rank), the
 * gain in green ("+8"), a green "Level up!" whenever the level went up (the same for every kind of XP, so no
 * caller adds its own), small tags (a treat, "Rank up!", "Waiting at this level") and a short note, then the
 * bar under it (optional: a level change alone has none). It is a group of a description list: put it
 * inside an `XpList` (or any `dl` with the same two-column grid, as the trip result's).
 */
export function XpGain({
  label,
  levels,
  head,
  gain,
  tags,
  note,
  bar,
}: {
  label: ComponentChildren;
  /** The level before and after: "Lv 4", or "Lv 4 to Lv 5" with an arrow when it went up. */
  levels?: { from: number; to: number } | undefined;
  head?: ComponentChildren;
  /** "+8", or "+30 XP": what was gained, already worded. */
  gain: string;
  tags?: ComponentChildren;
  note?: ComponentChildren;
  bar?: XpGainBar | undefined;
}) {
  return (
    <div class="xp-gain">
      <dt class="pix">{label}</dt>
      <dd class={levels === undefined ? undefined : 'xp-levels'}>
        {levels !== undefined && (
          <>
            <span class="lvl-tag pix">Lv {levels.from}</span>
            {levels.to > levels.from && (
              <>
                <Sprite sprite={glyphOrUnknown('left_to_right')} scale={2} />
                <span class="lvl-tag pix">Lv {levels.to}</span>
              </>
            )}
          </>
        )}
        {head}
        <span class="xp-plus pix">{gain}</span>
        {levels !== undefined && levels.to > levels.from && (
          <Tag kind="badge" tone="good">
            Level up!
          </Tag>
        )}
        {tags}
        {note}
      </dd>
      {bar !== undefined && (
        <dd class={bar.tone === 'craft' ? 'xp-bar-row xp-craft' : 'xp-bar-row'}>
          <XpBar
            value={bar.value}
            max={bar.max}
            label={bar.label}
            {...(bar.text === undefined ? {} : { text: bar.text })}
            {...(bar.startCap === undefined ? {} : { startCap: bar.startCap })}
            {...(bar.endCap === undefined ? {} : { endCap: bar.endCap })}
          />
        </dd>
      )}
    </div>
  );
}

/** The list the gains sit in: two columns (label, then what changed), each bar across the full width. */
export function XpList({
  label,
  children,
  class: extra,
}: {
  /** Names the list for screen readers. */
  label?: string;
  children: ComponentChildren;
  class?: string;
}) {
  return (
    <dl
      class={extra === undefined ? 'xp-list' : `xp-list ${extra}`}
      {...(label === undefined ? {} : { 'aria-label': label })}
    >
      {children}
    </dl>
  );
}
