import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { EventNames, FightEvent, Zone } from '@creatures/engine';
import { bossArt, elementClass, markPalette } from './art';
import { cssVars } from './css-vars';
import { gimmickGlyph, glyphOrUnknown } from './glyphs';
import { usePrefersReducedMotion } from './hooks';
import { abilityTitle } from './live';
import type { ReplayRowEntry } from './raid-api';
import { stateAt } from './replay';
import {
  HP_SEGMENTS,
  cuesForEvents,
  groupByZone,
  hpSegments,
  scrollToShow,
  stageStateAt,
  type Cue,
} from './stage';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { elementIcon } from './sprites/element-icons';
import { useLiveStage, type Anim } from './use-live-stage';

export type { Anim } from './use-live-stage';

const ZONE_NAMES: Record<Zone, string> = { front: 'Front', middle: 'Middle', back: 'Back' };

/** Each name or id is drawn as text only; nothing here builds markup from it. */
const nameOf = (table: Readonly<Record<string, string>> | undefined, id: string): string =>
  table?.[id] ?? id;

/** The boss's segmented HP bar. Segments that just emptied blink once (when motion is allowed). */
export function HpBar({
  current,
  max,
  previous,
  label,
}: {
  current: number;
  max: number;
  /** The HP before the beat that is playing, so the segments that just emptied can blink. */
  previous?: number;
  label: string;
}) {
  const lit = hpSegments(current, max);
  const was = previous === undefined ? lit : hpSegments(previous, max);
  return (
    <div class="hpbar" role="img" aria-label={label}>
      {Array.from({ length: HP_SEGMENTS }, (_, k) => (
        <i key={k} class={k < lit ? undefined : k < was ? 'gone drain' : 'gone'} />
      ))}
    </div>
  );
}

/** A "Log" button that opens the plain-text feed. Closed by default: the stage shows the fight. */
export function LogToggle({ id, children }: { id: string; children: ComponentChildren }) {
  const [open, setOpen] = useState(false);
  return (
    <section class="stage-log" aria-label="Fight log">
      <button
        type="button"
        class={open ? 'toggle on' : 'toggle'}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen(!open);
        }}
      >
        {open ? 'Hide log' : 'Log'}
      </button>
      <div id={id} hidden={!open}>
        {open && children}
      </div>
    </section>
  );
}

interface FloatsProps {
  cues: readonly Cue[];
  target: string | null;
}

/** The numbers floating up from a target. Crits are gold and bigger, with a "CRITICAL!" pop. */
function Floats({ cues, target }: FloatsProps) {
  const mine = cues.filter((c) => c.kind === 'float' && c.target === target);
  return (
    <>
      {mine.map((cue, lane) =>
        cue.kind === 'float' ? (
          <span
            key={cue.i}
            class={`float float-${cue.tone}${cue.crit ? ' crit' : ''}`}
            ref={cssVars({ '--drift': cue.drift, '--lane': lane % 3 })}
          >
            {cue.crit && <span class="crit-pop">CRITICAL!</span>}
            <span class="float-text">{cue.text}</span>
          </span>
        ) : null,
      )}
    </>
  );
}

/** A reaction burst in the colours of its two elements, with the reaction's name. */
function Bursts({ cues, target, names }: FloatsProps & { names: EventNames }) {
  const mine = cues.filter((c) => c.kind === 'burst' && c.target === target);
  return (
    <>
      {mine.map((cue) => {
        if (cue.kind !== 'burst') return null;
        const [a, b] = cue.elements ?? [null, null];
        const iconA = a === null ? undefined : elementIcon(a);
        const iconB = b === null ? undefined : elementIcon(b);
        return (
          <span key={cue.i} class="burst" aria-hidden="true">
            <span class={`burst-ring ${elementClass(a)}`} />
            <span class={`burst-ring second ${elementClass(b)}`} />
            <span class="burst-label">
              {iconA !== undefined && <Sprite sprite={iconA} scale={2} />}
              <span>{nameOf(names.reactions, cue.reaction)}</span>
              {iconB !== undefined && <Sprite sprite={iconB} scale={2} />}
              <span class="burst-colours">
                <i class={elementClass(a)} />
                <i class={elementClass(b)} />
              </span>
            </span>
          </span>
        );
      })}
    </>
  );
}

export interface StageProps {
  boss: { id: string; name: string };
  hpMax: number;
  hpStart: number;
  /** Rounds in the fight, for "Round 3 / 12". */
  rounds: number;
  /** The row, left to right. */
  row: readonly ReplayRowEntry[];
  /** The creatures that are the player's own: they are outlined and marked "you". */
  mineIds: ReadonlySet<string>;
  names: EventNames;
  events: readonly FightEvent[];
  /** How many events have happened. */
  index: number;
  /** The beat to animate: events [from, to) of the log. Null: show the state without movement. */
  anim: Anim | null;
}

/**
 * The fight stage: the boss on top with its HP bar, the row of creatures below grouped by zone. It
 * shows the state after `index` events and animates the beat `anim`: hops, white flashes, floating
 * numbers, reaction bursts, the mark, knockouts, zone frames and ability cards. Everything is drawn
 * from the event log; the animation classes are only decoration, and `prefers-reduced-motion`
 * (in styles.css) turns them into outlines and instant changes.
 */
export function Stage({
  boss,
  hpMax,
  hpStart,
  rounds,
  row,
  mineIds,
  names,
  events,
  index,
  anim,
}: StageProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const rowIds = row.map((c) => c.id);
  const state = stageStateAt(events, index, hpStart);
  const cues =
    anim === null ? [] : cuesForEvents(events, anim.from, Math.min(anim.to, index), rowIds);
  const previousHp = anim === null ? state.bossHp : stateAt(events, anim.from, hpStart).bossHp;
  const art = bossArt(boss.id);

  const hopping = new Set<string>();
  const hit = new Set<string | null>();
  const dropped = new Set<string>();
  const silenced = new Set<string>();
  const shaking = new Set<Zone>();
  const markCue = cues.some((c) => c.kind === 'mark');
  for (const cue of cues) {
    if (cue.kind === 'hop') hopping.add(cue.creature);
    else if (cue.kind === 'flash') hit.add(cue.target);
    else if (cue.kind === 'ko') dropped.add(cue.creature);
    else if (cue.kind === 'silenced') silenced.add(cue.creature);
    else if (cue.kind === 'shake') shaking.add(cue.zone);
  }
  const abilityCues = cues.filter((c) => c.kind === 'ability');
  const gimmickCue = cues.find((c) => c.kind === 'gimmick');
  const bannerCue = cues.find((c) => c.kind === 'banner');

  // Keep the creature whose turn it is in view when the row scrolls.
  const actor = [...hopping][0] ?? null;
  useEffect(() => {
    const box = rowRef.current;
    if (box === null || actor === null || anim === null) return;
    const el = box.querySelector<HTMLElement>('.stage-unit.actor');
    if (el === null) return;
    const boxRect = box.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    box.scrollLeft = scrollToShow(
      { scrollLeft: box.scrollLeft, width: box.clientWidth },
      { left: rect.left - boxRect.left + box.scrollLeft, width: rect.width },
    );
  }, [actor, anim?.seq]);

  const parity = anim === null ? 0 : anim.seq % 2;
  const groups = groupByZone(row);
  const markName = state.mark === null ? null : nameOf(names.marks, state.mark);
  const markIcon = state.mark === null ? undefined : elementIcon(state.mark);
  const markColours = state.mark === null ? undefined : markPalette(state.mark);
  const markGlyph = glyphOrUnknown('mark');
  const shieldGlyph = glyphOrUnknown('shield');
  const abilityGlyph = glyphOrUnknown('ability');
  const silenceGlyph = glyphOrUnknown('silence_ends');
  return (
    <section
      class={`stage p${String(parity)}`}
      aria-label="Fight stage"
      ref={cssVars({ '--beat': `${String(anim === null ? 600 : Math.max(anim.ms, 60))}ms` })}
    >
      <div class="stage-head">
        <span class="pix stage-round">
          {state.round > 0 ? `Round ${String(state.round)} / ${String(rounds)}` : 'Round 1'}
        </span>
        <span class="pix stage-hp-text">
          {boss.name} HP {state.bossHp} / {hpMax}
        </span>
      </div>

      <div class="stage-boss">
        <div class={`stage-boss-art${hit.has(null) ? ' hit' : ''}`}>
          <Sprite sprite={art.sprite} scale={art.scale} alt={boss.name} />
          {state.mark !== null && (
            <span
              class={`stage-mark ${elementClass(state.mark)}${markCue ? ' pop' : ''}`}
              role="img"
              aria-label={`Marked: ${markName ?? state.mark}`}
            >
              <Sprite
                sprite={markGlyph}
                scale={3}
                {...(markColours === undefined ? {} : { palette: markColours })}
              />
              {markIcon !== undefined && <Sprite sprite={markIcon} scale={2} />}
              <span class="stage-mark-name">{markName}</span>
            </span>
          )}
          <Floats cues={cues} target={null} />
          <Bursts cues={cues} target={null} names={names} />
          {gimmickCue?.kind === 'gimmick' && (
            <span key={gimmickCue.i} class="stage-callout" aria-hidden="true">
              <Sprite sprite={gimmickGlyph(gimmickCue.op)} scale={3} />
              <span class="pix">{nameOf(names.gimmicks, gimmickCue.gimmick)}</span>
            </span>
          )}
          {bannerCue?.kind === 'banner' && (
            <span key={bannerCue.i} class="stage-callout banner" aria-hidden="true">
              <span class="pix">{bannerCue.text}</span>
            </span>
          )}
        </div>
        <HpBar
          current={state.bossHp}
          max={hpMax}
          previous={previousHp}
          label={`${boss.name} HP: ${String(state.bossHp)} of ${String(hpMax)}`}
        />
      </div>

      <ul class="stage-abilities" aria-label="Abilities that just fired">
        {abilityCues.map((cue) =>
          cue.kind === 'ability' ? (
            <li key={cue.i} class="stage-ability">
              <Sprite sprite={abilityGlyph} scale={2} />
              <span class="pix">
                {abilityTitle({ abilityId: cue.ability, creature: cue.creature }, names)}
              </span>
            </li>
          ) : null,
        )}
      </ul>

      <div
        class="stage-row"
        ref={rowRef}
        tabIndex={0}
        role="region"
        aria-label="Row, left to right"
      >
        {groups.map(({ zone, items }) => {
          const fresh = cues.filter((c) => c.kind === 'zone' && c.zone === zone);
          const walled = state.shielded.includes(zone);
          return (
            <div
              key={zone}
              class={`stage-zone zone-${zone}${shaking.has(zone) ? ' shake' : ''}`}
              role="group"
              aria-label={`${ZONE_NAMES[zone]} zone`}
            >
              <p class="zone-label pix">{ZONE_NAMES[zone]}</p>
              <ul class="zone-units">
                {items.map((c) => {
                  const mine = mineIds.has(c.id);
                  const ko = state.knockedOut.includes(c.id);
                  const classes = ['stage-unit'];
                  if (mine) classes.push('mine');
                  if (ko) classes.push('ko');
                  if (hopping.has(c.id)) classes.push('actor');
                  if (hit.has(c.id)) classes.push('hit');
                  if (dropped.has(c.id)) classes.push('drop');
                  if (silenced.has(c.id)) classes.push('silenced');
                  const icon = elementIcon(c.element);
                  return (
                    <li
                      key={c.id}
                      class={classes.join(' ')}
                      aria-label={`${c.name}${mine ? ', yours' : ''}${ko ? ', knocked out' : ''}`}
                    >
                      {mine && <span class="you-pip pix">you</span>}
                      <span class="unit-art">
                        <Sprite sprite={creatureSpriteOrFallback(c.species)} scale={3} />
                        {icon !== undefined && (
                          <span class="unit-element">
                            <Sprite sprite={icon} scale={2} />
                          </span>
                        )}
                      </span>
                      <span class="unit-name pix">{c.name}</span>
                      {ko && <span class="ko-tag pix">KO</span>}
                      {silenced.has(c.id) && (
                        <span class="silence-tag">
                          <Sprite sprite={silenceGlyph} scale={2} />
                        </span>
                      )}
                      <Floats cues={cues} target={c.id} />
                      <Bursts cues={cues} target={c.id} names={names} />
                    </li>
                  );
                })}
              </ul>
              {walled && (
                <span
                  class={`zone-fx fx-shield${fresh.some((f) => f.kind === 'zone' && f.effect === 'shield') ? ' fresh' : ''}`}
                  aria-hidden="true"
                >
                  <Sprite sprite={shieldGlyph} scale={2} />
                </span>
              )}
              {fresh.map((f) => {
                if (f.kind !== 'zone' || (f.effect === 'shield' && walled)) return null;
                const icon =
                  f.effect === 'shield'
                    ? shieldGlyph
                    : f.effect === 'rally'
                      ? abilityGlyph
                      : gimmickGlyph(f.op ?? '');
                return (
                  <span
                    key={`${String(f.i)}-${f.effect}`}
                    class={`zone-fx fx-${f.effect} fresh`}
                    aria-hidden="true"
                  >
                    <Sprite sprite={icon} scale={2} />
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * The stage of the live finale: it steps through the events that come in with each poll, one short
 * beat at a time, and shows the state the server reports.
 */
export function LiveStage(props: Omit<StageProps, 'index' | 'anim'> & { roundMs: number }) {
  const { roundMs, ...rest } = props;
  const reduced = usePrefersReducedMotion();
  const view = useLiveStage(
    props.events,
    props.row.map((c) => c.id),
    roundMs,
    reduced,
  );
  return <Stage {...rest} index={view.index} anim={view.anim} />;
}
