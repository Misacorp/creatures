import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { cssVars } from '../css-vars';
import { GlossaryTag } from '../Glossary';
import { glyphOrUnknown } from '../glyphs';
import type { SpriteDef } from '../sprites/sprite-data';
import { usePrefersReducedMotion } from '../hooks';
import { usePopoverTrigger } from '../PopoverHost';
import { Sprite } from '../sprites/Sprite';
import { creatureSpriteOrFallback } from '../sprites/creature-sprites';
import type { XpBoost } from '../experience';
import { boostLabel, boostLines, multiplierText, showsTimes } from '../xp-boost-view';
import { countEnd, countStart, countSteps, type CountState } from '../xp-count';
import { current, leveledUp, numbers, pct, type XpChange } from '../xp-change';
import { DataTable } from './DataTable';
import { PopoverCard, popupProps } from './Popover';
import { Tag } from './Tag';

/** A stable key of what the count plays, so a new render of the same gain does not start it again. */
const countKey = (change: XpChange): string =>
  change.legs
    .map((l) => `${String(l.level)}:${String(l.from)}-${String(l.to)}/${String(l.max)}`)
    .join(',');

/** The count over time: each bar fills from its start to its end in steps, a flash between bars. */
function useCount(change: XpChange, reduced: boolean): CountState {
  const [state, setState] = useState<CountState>(() =>
    reduced ? countEnd(change) : countStart(change),
  );
  const key = countKey(change);
  useEffect(() => {
    if (reduced) {
      setState(countEnd(change));
      return undefined;
    }
    setState(countStart(change));
    const timers = countSteps(change).map(({ at, state: next }) =>
      setTimeout(() => {
        setState(next);
      }, at),
    );
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
    // The key stands for the change: a new object with the same numbers is the same count.
  }, [key, reduced]);
  return state;
}

/**
 * The breakdown of a multiplier, the body of its popover: the kind as the title, each part with its
 * multiplier ("Treat 3x", "Hearty Breakfast 1.25x"; the treat's line starts with the treat icon), then the
 * total. `treat` is another treat icon, for the workbench's comparison of the designs.
 */
export function XpBoostBreakdown({
  boost,
  what,
  treat = glyphOrUnknown('treat'),
}: {
  boost: XpBoost;
  what: string;
  treat?: SpriteDef;
}) {
  const lines = boostLines(boost);
  return (
    <PopoverCard title={what}>
      <DataTable
        bright
        class="xp-boost-lines"
        rows={[
          ...lines.parts.map((part) => ({
            label: part.name,
            value: part.value,
            ...(part.treat
              ? { icon: <Sprite sprite={treat} scale={2} class="xp-boost-icon" /> }
              : {}),
          })),
          { label: 'Total', value: lines.total, total: true },
        ]}
      />
    </PopoverCard>
  );
}

/**
 * The multiplier of a gain: a "3.15x" chip in the plain tag colours (bone on ink, like the game's other
 * small tags: a multiplier can change any kind of XP, so it never takes the kind's colour), when the total
 * is not 1x. A tap opens the breakdown. Nothing when nothing changed the gain.
 */
function BoostButton({ boost, what, id }: { boost: XpBoost | null; what: string; id: string }) {
  const { host, ref, open } = usePopoverTrigger<HTMLButtonElement>();
  if (boost === null || !showsTimes(boost)) return null;
  const face = <Tag class="xp-times">{multiplierText(boost.totalBp)}</Tag>;
  const label = boostLabel(boost, what);
  if (host === null) {
    return (
      <span class="xp-boost" role="img" aria-label={label}>
        {face}
      </span>
    );
  }
  return (
    <button
      ref={ref}
      type="button"
      class={open ? 'xp-boost open' : 'xp-boost'}
      aria-label={label}
      {...popupProps(open)}
      onClick={() => {
        if (ref.current === null) return;
        host.openCustom(`xp-boost:${id}`, ref.current, {
          label: `What changed the ${what === 'Experience' ? 'experience' : what}`,
          body: <XpBoostBreakdown boost={boost} what={what} />,
        });
      }}
    >
      {face}
    </button>
  );
}

/**
 * One "XP gained" row, the same wherever the app shows what an activity paid (decisions.md, 2026-10-19,
 * "Count-up"): the label, the level change and "Level up!" when it went up, then the level tag, a slim bar
 * with its numbers, the "+N" and the multiplier chip ("3.15x", which opens the breakdown). The bar counts up
 * from where it was to where it is now in pixel steps; a level crossed fills the old bar, flashes and fills
 * the new level's bar with the rest, and "Level up!" rises into place then (from below, in pixel steps,
 * with a small overshoot). A player who prefers reduced motion sees the end at once, "Level up!" in place. Never a sentence about what changed the gain: that is the breakdown.
 * Put it in an `XpList`.
 */
export function XpGain({
  change: gain,
  label,
  what,
  who,
  tags,
}: {
  change: XpChange;
  /** "Experience", "Crafting" or "Explorer" (a glossary tag), or the creature's name in a team's list. */
  label: ComponentChildren;
  /** The kind in words for the breakdown's title and the screen reader ("Experience", "Crafting XP"). */
  what: string;
  /** The creature's species, for its small sprite before the name, when one list holds several. */
  who?: { species: string } | undefined;
  /** More small tags after the level change (Gold Ribbon, Waiting). */
  tags?: ComponentChildren;
}) {
  const reduced = usePrefersReducedMotion();
  const count = useCount(gain, reduced);
  const leg = gain.legs[count.leg] ?? current(gain);
  const last = gain.legs.length - 1;
  const done = count.leg === last && count.value === leg.to;
  const up = leveledUp(gain);
  const crossed = count.leg > 0;
  const top = gain.top && count.leg === last;
  const text = top ? numbers(gain) : `${String(count.value)} / ${String(leg.max)}`;
  const from = top ? 100 : pct(leg.from, leg.max);
  const to = top ? 100 : pct(count.value, leg.max);
  const end = current(gain);
  return (
    <li class={`xp-row xp-kind-${gain.kind}`}>
      <div class="xp-head">
        {who !== undefined && (
          <Sprite sprite={creatureSpriteOrFallback(who.species)} scale={1} class="xp-who" />
        )}
        <span class="xp-label">{label}</span>
        {up && (
          <span class="xp-up">
            {gain.unit} {gain.from} → {gain.to}
          </span>
        )}
        {up && (
          <Tag kind="badge" class={crossed ? 'xp-tag up shown' : 'xp-tag up'}>
            {gain.unit === 'Rank' ? 'Rank up!' : 'Level up!'}
          </Tag>
        )}
        {tags}
      </div>
      <div class="xp-track">
        <span class={crossed ? 'xp-lv stepped' : 'xp-lv'} key={leg.level}>
          {gain.unit} {leg.level}
        </span>
        <span
          class={count.flash ? 'xp-bar flash' : 'xp-bar'}
          role="progressbar"
          aria-label={gain.label}
          aria-valuemin={0}
          aria-valuemax={end.max}
          aria-valuenow={end.to}
          aria-valuetext={`${numbers(gain)}, +${String(gain.gained)}`}
          ref={cssVars({ '--from': from, '--to': to })}
        >
          <span class="xp-old" />
          <span class="xp-new" />
          <span class="xp-text" aria-hidden="true">
            {text}
          </span>
        </span>
        <span class={done ? 'xp-plus done' : 'xp-plus'}>+{gain.gained}</span>
        <BoostButton boost={gain.boost} what={what} id={gain.label} />
      </div>
    </li>
  );
}

/** A row of the list that is not XP (the trip's familiarity): a label and what it says, on one line. */
export function XpExtraRow({
  label,
  children,
}: {
  label: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <li class="xp-row xp-extra">
      <span class="xp-label">{label}</span>
      {children}
    </li>
  );
}

/** The list the gains sit in: one panel, a row each; `caption` heads a list of several creatures. */
export function XpList({
  label,
  caption,
  children,
  class: extra,
}: {
  /** Names the list for screen readers. */
  label?: string;
  /** A heading over a list of several creatures' experience (the dungeon team): "Experience". */
  caption?: boolean;
  children: ComponentChildren;
  class?: string;
}) {
  return (
    <div class={extra === undefined ? 'xp-list pix-panel' : `xp-list pix-panel ${extra}`}>
      {caption === true && (
        <p class="xp-caption">
          <GlossaryTag entry="experience">Experience</GlossaryTag>
        </p>
      )}
      <ul {...(label === undefined ? {} : { 'aria-label': label })}>{children}</ul>
    </div>
  );
}
