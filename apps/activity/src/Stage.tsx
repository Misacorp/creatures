import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren, Ref } from 'preact';
import type { EventNames, FightEvent, Zone } from '@creatures/engine';
import { bossArt, elementClass, markPalette } from './art';
import { cssVars } from './css-vars';
import { gimmickGlyph, glyphOrUnknown } from './glyphs';
import { useElementWidth, usePrefersReducedMotion } from './hooks';
import { abilityControls, abilityName, abilityTitle } from './live';
import type { LiveAbility, LiveFight } from './live-api';
import type { ReplayRowEntry } from './raid-api';
import { stateAt } from './replay';
import {
  HP_SEGMENTS,
  abilityUsesAt,
  cuesForEvents,
  groupByZone,
  hpSegments,
  stageStateAt,
  type AbilityUse,
  type Cue,
} from './stage';
import { badgeFor, usedBadge, type Badge } from './stage-abilities';
import { StagePopover } from './StagePopover';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { elementIcon } from './sprites/element-icons';
import { useLiveStage, type Anim } from './use-live-stage';
import { STAGE_FALLBACK_PX, STAGE_LAYOUT, layoutVars, zoneLayout } from './zone-layout';

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

/** What the live stage needs to put the player's abilities on their creatures. */
export interface StageAbilities {
  /** Every ability of the fight (the caller's own and the others'). */
  list: readonly LiveAbility[];
  /** The caller's player key in this fight. */
  you: string | null;
  /** The fight's status, round and round count, which decide whether Fire is on offer. */
  fight: Pick<LiveFight, 'status' | 'round' | 'rounds'>;
  /**
   * The popover's content for one of the caller's abilities (a creature's, or the basic one on the
   * chip). `badge` is what the stage shows for it; `close` shuts the popover.
   */
  renderPopover: (ability: LiveAbility, badge: Badge, close: () => void) => ComponentChildren;
  /** The text of the "?" button's popover (how abilities work). Without it there is no button. */
  help?: ComponentChildren;
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
  /**
   * The live finale's abilities: the player's own creatures with an ability get a badge and open a
   * popover when tapped. Without it (replays) the stage is not interactive and only shows which
   * abilities have been used so far.
   */
  abilities?: StageAbilities;
}

/** The small badge on a creature's corner: what state its ability is in, by shape as well as colour. */
function AbilityBadge({ badge }: { badge: Badge }) {
  return (
    <span
      class={`ab-badge ab-${badge.kind}${badge.pulse ? ' pulse' : ''}`}
      data-state={badge.kind}
      aria-hidden="true"
    >
      {badge.kind === 'auto' && (
        <>
          <Sprite sprite={glyphOrUnknown('ability')} scale={2} />
          {badge.round !== null && <span class="ab-round pix">{badge.round}</span>}
        </>
      )}
      {badge.kind === 'manual' && <Sprite sprite={glyphOrUnknown('hand')} scale={2} />}
      {badge.kind === 'pressed' && (
        <span class="ab-round pix">{badge.round === null ? '>' : badge.round}</span>
      )}
      {badge.kind === 'used' && (
        <>
          <Sprite sprite={glyphOrUnknown('check')} scale={2} />
          {badge.round !== null && <span class="ab-round pix">{badge.round}</span>}
        </>
      )}
    </span>
  );
}

interface UnitProps {
  creature: ReplayRowEntry;
  scale: number;
  mine: boolean;
  ko: boolean;
  classes: readonly string[];
  silenced: boolean;
  cues: readonly Cue[];
  names: EventNames;
  badge: Badge | null;
  /** The ability's id, for the label of the badge. */
  abilityId: string | null;
  /** True for the player's own creature with an ability: it can be tapped. */
  interactive: boolean;
  open: boolean;
  /** Registers the creature's button as the anchor of its popover. */
  anchorRef: Ref<HTMLButtonElement>;
  onToggle: () => void;
}

/**
 * One creature on the stage: its sprite with the corner marks (the "you" tag above it, the ability
 * badge top right, the skull of a knocked-out creature bottom left, its element bottom right) and
 * its name under it, two lines at most. The player's own creature with an ability is a button that
 * opens the ability popover (drawn by the stage, which is its anchor's parent). The full name is
 * the accessible label; no `title`, so no browser tooltip floats over the stage.
 */
function StageUnit(props: UnitProps) {
  const { creature: c, mine, ko, badge, interactive, open } = props;
  const icon = elementIcon(c.element);

  const spoken =
    `${c.name}${mine ? ', yours' : ''}${ko ? ', knocked out' : ''}` +
    (badge === null
      ? ''
      : `, ${props.abilityId === null ? 'ability' : abilityName(props.abilityId)} ${badge.label.toLowerCase()}`);

  const face = (
    <>
      <span class="unit-top">{mine && <span class="you-pip pix">you</span>}</span>
      <span class="unit-art">
        <Sprite sprite={creatureSpriteOrFallback(c.species)} scale={props.scale} />
        {icon !== undefined && (
          <span class="unit-element">
            <Sprite sprite={icon} scale={2} />
          </span>
        )}
        {ko && (
          <span class="ko-mark">
            <Sprite sprite={glyphOrUnknown('skull')} scale={2} />
          </span>
        )}
        {props.silenced && (
          <span class="silence-tag">
            <Sprite sprite={glyphOrUnknown('silence_ends')} scale={2} />
          </span>
        )}
        {badge !== null && <AbilityBadge badge={badge} />}
      </span>
      <span class="unit-name pix" aria-hidden="true">
        {c.name}
      </span>
    </>
  );

  return (
    <li class={props.classes.join(' ')} aria-label={interactive ? undefined : spoken}>
      {interactive ? (
        <button
          type="button"
          ref={props.anchorRef}
          class="unit-face"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`${spoken}. Opens the ability options.`}
          onClick={props.onToggle}
        >
          {face}
        </button>
      ) : (
        <span class="unit-face">{face}</span>
      )}
      <Floats cues={props.cues} target={c.id} />
      <Bursts cues={props.cues} target={c.id} names={props.names} />
    </li>
  );
}

/**
 * The fight stage: the boss on top with its HP bar, then the zones as rows under it, the front zone
 * first (closest to the boss) and the back zone last. Each row is a zone label and its creatures,
 * centred in slot order and wrapping onto more lines if needed. It shows the state after `index`
 * events and animates the beat `anim`: hops, white flashes, floating numbers, reaction bursts,
 * the mark, knockouts, zone frames and ability cards. Everything is drawn from the event log; the
 * animation classes are only decoration, and `prefers-reduced-motion` (in styles.css) turns them
 * into outlines and instant changes.
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
  abilities,
}: StageProps) {
  const rowsRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(rowsRef, STAGE_FALLBACK_PX);
  /** Which popover is open: "a:<ability key>" for an ability, "help" for the "?" button's. */
  const [openKey, setOpenKey] = useState<string | null>(null);
  const anchors = useRef(new Map<string, HTMLElement>());
  const anchorRef = (id: string) => (el: HTMLElement | null) => {
    if (el === null) anchors.current.delete(id);
    else anchors.current.set(id, el);
  };
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

  // The abilities that have been played so far, by key and by creature.
  const uses = abilityUsesAt(events, index);
  const useByKey = new Map<string, AbilityUse>(uses.map((u) => [u.key, u]));
  const useByCreature = new Map<string, AbilityUse>();
  for (const u of uses) if (u.creature !== null) useByCreature.set(u.creature, u);

  // The caller's own abilities, with what the badge says and whether Fire or Auto fire is on offer.
  const own =
    abilities === undefined || abilities.you === null
      ? []
      : abilities.list.filter((a) => a.alias === abilities.you);
  const ownInfo = (ability: LiveAbility): { badge: Badge; actionable: boolean } => {
    const controls = abilities === undefined ? null : abilityControls(abilities.fight, ability);
    return {
      badge: badgeFor(ability, useByKey.get(ability.key) ?? null, controls?.canFire ?? false),
      actionable: controls !== null && (controls.canFire || controls.canToggle),
    };
  };
  const basics = own.filter((a) => a.creature === null);
  const openAbility =
    openKey?.startsWith('a:') === true ? own.find((a) => `a:${a.key}` === openKey) : undefined;
  const openActionable = openAbility === undefined ? false : ownInfo(openAbility).actionable;

  // The popover closes by itself when its ability goes away, or when it was open on an ability
  // that could be used and no longer can be (the round moved on). A read-only popover (an ability
  // that was already used or pressed when it was opened) stays until it is dismissed.
  const seen = useRef<{ key: string | null; actionable: boolean }>({
    key: null,
    actionable: false,
  });
  useEffect(() => {
    const before = seen.current;
    seen.current = { key: openKey, actionable: openActionable };
    if (openKey === null || !openKey.startsWith('a:')) return;
    if (
      openAbility === undefined ||
      (before.key === openKey && before.actionable && !openActionable)
    ) {
      setOpenKey(null);
    }
  }, [openKey, openActionable, openAbility === undefined]);

  const close = (): void => {
    setOpenKey(null);
  };
  const toggle = (key: string): void => {
    setOpenKey(openKey === key ? null : key);
  };

  const parity = anim === null ? 0 : anim.seq % 2;
  const groups = groupByZone(row);
  const markName = state.mark === null ? null : nameOf(names.marks, state.mark);
  const markIcon = state.mark === null ? undefined : elementIcon(state.mark);
  const markColours = state.mark === null ? undefined : markPalette(state.mark);
  const markGlyph = glyphOrUnknown('mark');
  const shieldGlyph = glyphOrUnknown('shield');
  const abilityGlyph = glyphOrUnknown('ability');
  return (
    <section
      class={`stage p${String(parity)}`}
      aria-label="Fight stage"
      ref={cssVars({ '--beat': `${String(anim === null ? 600 : Math.max(anim.ms, 60))}ms` })}
    >
      <div class="stage-head">
        <span class="stage-head-left">
          <span class="pix stage-round">
            {state.round > 0 ? `Round ${String(state.round)} / ${String(rounds)}` : 'Round 1'}
          </span>
          {abilities?.help !== undefined && (
            <button
              type="button"
              ref={anchorRef('help')}
              class="stage-help pix"
              aria-haspopup="dialog"
              aria-expanded={openKey === 'help'}
              aria-label="How abilities work"
              onClick={() => {
                toggle('help');
              }}
            >
              ?
            </button>
          )}
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

      <div class="stage-rows" ref={rowsRef} role="group" aria-label="Zones, front to back">
        {groups.map(({ zone, items }) => {
          const fresh = cues.filter((c) => c.kind === 'zone' && c.zone === zone);
          const walled = state.shielded.includes(zone);
          const layout = zoneLayout(items.length, width, STAGE_LAYOUT);
          return (
            <div
              key={zone}
              class={`stage-zone zone-${zone}${shaking.has(zone) ? ' shake' : ''}`}
              role="group"
              aria-label={`${ZONE_NAMES[zone]} zone`}
              ref={cssVars(layoutVars(layout, STAGE_LAYOUT))}
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

                  // The player's own creature with an ability is a button with a badge; every
                  // other creature only shows a "used" mark once its ability has fired.
                  const mineAbility = own.find((a) => a.creature === c.id);
                  const used = useByCreature.get(c.id) ?? null;
                  let badge: Badge | null = null;
                  let abilityId: string | null = null;
                  if (mineAbility !== undefined) {
                    abilityId = mineAbility.abilityId;
                    badge = ownInfo(mineAbility).badge;
                  } else if (used !== null) {
                    abilityId = used.ability;
                    badge = usedBadge(used.round);
                  }
                  const key = mineAbility === undefined ? null : `a:${mineAbility.key}`;
                  return (
                    <StageUnit
                      key={c.id}
                      creature={c}
                      scale={layout.tier.scale}
                      mine={mine}
                      ko={ko}
                      classes={classes}
                      silenced={silenced.has(c.id)}
                      cues={cues}
                      names={names}
                      badge={badge}
                      abilityId={abilityId}
                      interactive={key !== null}
                      open={key !== null && openKey === key}
                      anchorRef={anchorRef(key ?? `none:${c.id}`)}
                      onToggle={() => {
                        if (key !== null) toggle(key);
                      }}
                    />
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

      {abilities !== undefined && basics.length > 0 && (
        <div class="stage-foot">
          {basics.map((ability) => {
            const { badge } = ownInfo(ability);
            const key = `a:${ability.key}`;
            return (
              <button
                key={ability.key}
                type="button"
                ref={anchorRef(key)}
                class="basic-chip"
                aria-haspopup="dialog"
                aria-expanded={openKey === key}
                aria-label={`${abilityName(ability.abilityId)} (basic ability), ${badge.label.toLowerCase()}. Opens the ability options.`}
                onClick={() => {
                  toggle(key);
                }}
              >
                <Sprite sprite={abilityGlyph} scale={2} />
                <span class="pix">{abilityName(ability.abilityId)}</span>
                <AbilityBadge badge={badge} />
              </button>
            );
          })}
        </div>
      )}

      {abilities !== undefined && openAbility !== undefined && (
        <StagePopover
          key={openKey}
          anchor={() => anchors.current.get(`a:${openAbility.key}`) ?? null}
          label={`${abilityName(openAbility.abilityId)} ability`}
          onClose={close}
        >
          {abilities.renderPopover(openAbility, ownInfo(openAbility).badge, close)}
        </StagePopover>
      )}
      {abilities?.help !== undefined && openKey === 'help' && (
        <StagePopover
          key="help"
          class="help-pop"
          anchor={() => anchors.current.get('help') ?? null}
          label="How abilities work"
          onClose={close}
        >
          {abilities.help}
        </StagePopover>
      )}
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
