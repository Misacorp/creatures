import { GLOSSARY_IDS, content, type Gimmick } from '@creatures/game';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Fragment, type ComponentChildren, type Ref, type RefObject } from 'preact';
import {
  laneOfIndex,
  type EventNames,
  type FightBoard,
  type FightEvent,
  type Zone,
} from '@creatures/engine';
import { bossArt, elementClass, markPalette } from './art';
import { cssVars } from './css-vars';
import { foeButtonLabel, foeInfoOf, foeElement, type FoeInfo } from './foe-info';
import { GlossaryTag } from './Glossary';
import { CHAIN_GLYPH, gimmickGlyph, glyphOrUnknown } from './glyphs';
import { useElementWidth, usePrefersReducedMotion } from './hooks';
import { abilityControls, abilityName, abilityTitle } from './live';
import { scrollToLanes } from './lane-scroll';
import type { LiveAbility, LiveFight } from './live-api';
import type { FightGuardRules, RaidPhaseId, ReplayRowEntry } from './raid-api';
import { boardRows, laneStates, ownLaneSpan } from './raid-board';
import { stateAt } from './replay';
import { enrageLine, retreatLine } from './raid-text';
import {
  abilityUsesAt,
  actingSlots,
  cuesForEvents,
  creatureHpAt,
  enragedAt,
  estimatedMaxHp,
  creatureAtSlot,
  groupByZone,
  ordinal,
  pendingChargesAt,
  retreatedAt,
  reticleTargets,
  showsNumber,
  stageStateAt,
  strikeRows,
  type AbilityUse,
  type BossStrike,
} from './stage';
import { badgeFor, unitTap, usedBadge, type Badge } from './stage-abilities';
import { creatureInfoOf } from './creature-info';
import { compactPair } from './number-format';
import { usePopoverTrigger } from './PopoverHost';
import { SmallCreature } from './SmallCreature';
import { ElementChip } from './sprites/ElementChip';
import { shortEffectMs, type FxItem, type IntroView } from './stage-fx';
import { roundLabel } from './stage-rounds';
import { forecastNextRound, strikeLabel, type Wording } from './telegraph';
import { PixelHeading } from './ui/PixelHeading';
import { Popover, popupProps } from './ui/Popover';
import { SegmentBar } from './ui/SegmentBar';
import { StageHead, type StageModifier } from './ui/StageHead';
import { ToggleButton } from './ui/ToggleButton';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { elementIcon } from './sprites/element-icons';
import { useLiveStage, type Anim } from './use-live-stage';
import { GRID_SCALE, ROW_LAYOUT, STAGE_FALLBACK_PX, layoutVars, zoneLayout } from './zone-layout';

export type { Anim } from './use-live-stage';

const ZONE_NAMES: Record<Zone, string> = { front: 'Front', middle: 'Middle', back: 'Back' };
/** In a single row each zone is one creature, named by where it stands. */
const PLACE_NAMES: Record<Zone, string> = { front: 'Left', middle: 'Middle', back: 'Right' };

/** Each name or id is drawn as text only; nothing here builds markup from it. */
const nameOf = (table: Readonly<Record<string, string>> | undefined, id: string): string =>
  table?.[id] ?? id;

/** A "Log" button that opens the plain-text feed. Closed by default: the stage shows the fight. */
export function LogToggle({ id, children }: { id: string; children: ComponentChildren }) {
  const [open, setOpen] = useState(false);
  return (
    <section class="stage-log" aria-label="Fight log">
      <ToggleButton
        pressed={open}
        controls={id}
        onToggle={() => {
          setOpen(!open);
        }}
      >
        {open ? 'Hide log' : 'Log'}
      </ToggleButton>
      <div id={id} hidden={!open}>
        {open && children}
      </div>
    </section>
  );
}

interface FxProps {
  fx: readonly FxItem[];
  target: string | null;
}

/**
 * The ref of an effect's element: it sets the effect's own duration (and the extras) as custom
 * properties. One function per effect, kept for as long as the effect lives: a ref whose identity
 * changed on every render would be called again by every render of the whole stage.
 */
const fxRefs = new WeakMap<FxItem, (el: HTMLElement | null) => void>();
function fxRef(item: FxItem, extra: Readonly<Record<string, string | number>> = {}) {
  let ref = fxRefs.get(item);
  if (ref === undefined) {
    ref = cssVars({ '--fx-ms': `${String(item.ms)}ms`, ...extra });
    fxRefs.set(item, ref);
  }
  return ref;
}

/**
 * The numbers rising from a target. They rise continuously from where they spawn for 2.5 seconds (a
 * crit for 3) and overlap freely: a newer number on the same creature spawns at the base and sits
 * below the older ones, which have risen by then. Crits are gold and bigger, with a "CRITICAL!" pop.
 * The outer element only moves (a smooth transform) and the inner one only fades and pops, so the
 * motion is never stepped. Each number's key is its event's index, which never changes, so it
 * is not re-created while it animates; its spot is set by CSS once and never measured.
 */
function Floats({ fx, target }: FxProps) {
  return (
    <>
      {fx.map((item) => {
        const { cue } = item;
        if (cue.kind !== 'float' || cue.target !== target) return null;
        return (
          <span
            key={`float-${String(cue.i)}`}
            class={`float float-${cue.tone}${cue.crit ? ' crit' : ''} lane-${String(item.lane)}`}
            ref={fxRef(item, { '--drift': cue.drift, '--lane': item.lane })}
          >
            <span class="float-body">
              {cue.crit && <span class="crit-pop">CRITICAL!</span>}
              <span class="float-text">{cue.text}</span>
            </span>
          </span>
        );
      })}
    </>
  );
}

/** A reaction burst in the colours of its two elements, with the reaction's name in big letters. */
function Bursts({ fx, target, names }: FxProps & { names: EventNames }) {
  return (
    <>
      {fx.map((item) => {
        const { cue } = item;
        if (cue.kind !== 'burst' || cue.target !== target) return null;
        const [a, b] = cue.elements ?? [null, null];
        const iconA = a === null ? undefined : elementIcon(a);
        const iconB = b === null ? undefined : elementIcon(b);
        return (
          <span key={`burst-${String(cue.i)}`} class="burst" aria-hidden="true" ref={fxRef(item)}>
            <span class={`burst-ring ${elementClass(a)}`} />
            <span class={`burst-ring second ${elementClass(b)}`} />
            <span class="burst-label">
              {iconA !== undefined && <Sprite sprite={iconA} scale={2} />}
              <span>{nameOf(names.reactions, cue.reaction)}!</span>
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

/** "KO!" held over a creature that was just knocked out. */
function KoTags({ fx, creature }: { fx: readonly FxItem[]; creature: string }) {
  return (
    <>
      {fx.map((item) =>
        item.cue.kind === 'ko' && item.cue.creature === creature ? (
          <span
            key={`ko-${String(item.cue.i)}`}
            class="ko-tag pix"
            aria-hidden="true"
            ref={fxRef(item)}
          >
            KO!
          </span>
        ) : null,
      )}
    </>
  );
}

/** After the player scrolls the raid grid by hand, it is left alone for this long. */
const HAND_SCROLL_HOLD_MS = 4000;

/** At most this many ability cards show at once; the rest are counted ("+3 more"). */
const MAX_ABILITY_CARDS = 4;

/** The big "Round N" over the stage when a round opens, in the countdown's pixel face. */
function RoundIntro({ intro }: { intro: IntroView }) {
  return (
    <div
      class="round-intro"
      aria-hidden="true"
      ref={cssVars({ '--fx-ms': `${String(intro.ms)}ms` })}
    >
      <PixelHeading key={intro.key} as="span" outline="ink-drop" class="ri-text">
        <span class="ri-label">
          <span>Round</span>
          <span>{intro.round}</span>
          {intro.rounds !== null && intro.round <= intro.rounds && (
            <span class="ri-of">/ {intro.rounds}</span>
          )}
        </span>
      </PixelHeading>
    </div>
  );
}

/** The glyph that goes with a boss action's label. */
function strikeGlyph(strike: BossStrike) {
  switch (strike.action) {
    case 'hit_zone':
    case 'silence_ends':
    case 'sweep':
    case 'barrage':
    case 'slam':
    case 'lance':
    case 'pincer':
    case 'charge':
      return gimmickGlyph(strike.action);
    case 'strike_highest_atk':
      return strike.targets.length > 1 ? glyphOrUnknown(CHAIN_GLYPH) : gimmickGlyph(strike.action);
    case 'reflect':
    case 'reflect_armed':
      return gimmickGlyph('reflect_first_reaction');
    case 'enrage':
      return glyphOrUnknown('warning');
    default:
      return glyphOrUnknown('reticle');
  }
}

/**
 * The marks the boss telegraph puts on one creature: during the wind-up red crosshairs over exactly
 * the creatures it will hit (never more than six: `reticleTargets`) and a small ring on each
 * creature a slam's splash will reach; when the hit lands a solid red frame, a slash and, on a
 * creature a Shield Wall protected or that a guard stepped in for, a shield (the blocked mark), and
 * a splash ring on the neighbours. A creature a Guard's cover softened a hit for gets a small shield
 * pip on its right, and a Guard whose armor took damage off a hit gets one on its left. A zone hit or a sweep marks its whole row instead (see the zone frames). The frames are
 * static outlines, so they also read without motion.
 */
function Marks({ fx, id }: { fx: readonly FxItem[]; id: string }) {
  return (
    <>
      {fx.map((item) => {
        const { cue } = item;
        if (cue.kind === 'cover') {
          if (cue.creature !== id) return null;
          return (
            <span
              key={`cover-${String(cue.i)}`}
              class="cover-pip"
              aria-hidden="true"
              ref={fxRef(item)}
            >
              <Sprite sprite={glyphOrUnknown('shield')} scale={1} />
            </span>
          );
        }
        if (cue.kind === 'armor') {
          if (cue.creature !== id) return null;
          return (
            <span
              key={`armor-${String(cue.i)}`}
              class="armor-pip"
              aria-hidden="true"
              ref={fxRef(item)}
            >
              <Sprite sprite={glyphOrUnknown('shield')} scale={1} />
            </span>
          );
        }
        if (cue.kind === 'windup') {
          const reticle = reticleTargets(cue.strike).includes(id);
          const ring = cue.strike.splash?.includes(id) === true;
          if (!reticle && !ring) return null;
          return reticle ? (
            <span
              key={`windup-${String(cue.i)}`}
              class="reticle windup"
              aria-hidden="true"
              ref={fxRef(item)}
            >
              <Sprite sprite={glyphOrUnknown('reticle')} scale={2} />
            </span>
          ) : (
            <span
              key={`windup-${String(cue.i)}`}
              class="splash-ring windup"
              aria-hidden="true"
              ref={fxRef(item)}
            />
          );
        }
        if (cue.kind !== 'strike') return null;
        const { strike } = cue;
        const blocked = strike.blocked.includes(id) || strike.guarded === id;
        const hit = reticleTargets(strike).includes(id);
        const ring = strike.splash?.includes(id) === true;
        if (!hit && !blocked && !ring) return null;
        return (
          <Fragment key={`strike-${String(cue.i)}`}>
            {hit && <span class="reticle struck" aria-hidden="true" ref={fxRef(item)} />}
            {hit && <span class="slash" aria-hidden="true" ref={fxRef(item)} />}
            {ring && <span class="splash-ring struck" aria-hidden="true" ref={fxRef(item)} />}
            {blocked && (
              <span class="block-mark" aria-hidden="true" ref={fxRef(item)}>
                <Sprite sprite={glyphOrUnknown('shield')} scale={2} />
              </span>
            )}
          </Fragment>
        );
      })}
    </>
  );
}

/**
 * A beam from the boss to one target, drawn when a strike lands. Where it starts and ends is
 * measured once, before the first paint (the boss's and the target's boxes are read together and
 * the result is written as custom properties), and never again: the animation itself only changes
 * `transform` and `opacity`.
 */
function Beam({
  layer,
  from,
  to,
  ms,
  between = false,
}: {
  layer: RefObject<HTMLElement>;
  from: () => HTMLElement | null;
  to: () => HTMLElement | null;
  ms: number;
  /** From one creature to another (a chain's jump, a lance): the beam starts at the middle of the first. */
  between?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const base = layer.current?.getBoundingClientRect();
    const a = from()?.getBoundingClientRect();
    const b = to()?.getBoundingClientRect();
    if (el === null || base === undefined || a === undefined || b === undefined) return;
    const x1 = a.left + a.width / 2 - base.left;
    const y1 = a.top + a.height * (between ? 0.5 : 0.75) - base.top;
    const x2 = b.left + b.width / 2 - base.left;
    const y2 = b.top + b.height / 2 - base.top;
    el.style.setProperty('--bx', `${String(Math.round(x1))}px`);
    el.style.setProperty('--by', `${String(Math.round(y1))}px`);
    el.style.setProperty('--blen', `${String(Math.round(Math.hypot(x2 - x1, y2 - y1)))}px`);
    el.style.setProperty('--bang', `${String(Math.atan2(y2 - y1, x2 - x1))}rad`);
    el.style.setProperty('--fx-ms', `${String(ms)}ms`);
    el.classList.add('placed');
  }, []);
  return <span ref={ref} class={`strike-beam${between ? ' between' : ''}`} aria-hidden="true" />;
}

/** What the live stage needs to put the player's abilities on their creatures. */
interface StageAbilities {
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
  /**
   * The popover of one of the caller's creatures that has no ability in this fight (below the unlock
   * level, say). Without it such a creature is not a button.
   */
  renderNote?: (creature: ReplayRowEntry, close: () => void) => ComponentChildren;
  /** The text of the "?" button's popover (how abilities work). Without it there is no button. */
  help?: ComponentChildren;
}

interface StageProps {
  /**
   * The foe or boss: its content id, its name and, when the server sent it, its element (the content's
   * own is used otherwise). The element shows as a chip after the name; tapping the picture opens its
   * popover.
   */
  boss: {
    id: string;
    name: string;
    element?: string;
    /** The boss's own retreat lines, when the server sent them. */
    retreat?: { phase1: string; phase2: string } | null;
  };
  hpMax: number;
  hpStart: number;
  /**
   * The most rounds the fight can last, for "Round 3 / 12" (and for the forecast): the content's
   * limit (`roomMaxRounds`, `raidMaxRounds`), never how long this stored fight really lasted, which
   * would spoil it. Null when the fight has no known limit: the head then says just "Round 3".
   */
  rounds: number | null;
  /** The row, left to right. */
  row: readonly ReplayRowEntry[];
  /** The Guard numbers of the rules the fight was played with; absent: the content's old Guard. */
  rules?: FightGuardRules;
  /** Where the row stands on the board (the fight's own); absent: the dense row. */
  board?: FightBoard;
  /** The lobby's preview: no round yet, so the head says to get ready instead of "Round 1". */
  lobby?: boolean;
  /** The creatures that are the player's own: they are outlined and marked "you". */
  mineIds: ReadonlySet<string>;
  names: EventNames;
  events: readonly FightEvent[];
  /** How many events have happened. */
  index: number;
  /** The newest beat, for the short animations: events [from, to) of the log. Null: no movement. */
  anim: Anim | null;
  /** Effects that stay on screen longer than their beat (numbers, bursts, ability cards, knockouts). */
  fx?: readonly FxItem[];
  /** The "Round N" overlay, while a round opens. */
  intro?: IntroView | null;
  /**
   * The creatures' own HP (the dungeon: their HP carries between rooms, and a creature that is hit is
   * hurt, not only knocked out). It gives each creature a small HP bar that follows the boss hits in
   * the events, from the HP it started the fight with. Without it (the raid) the stage draws none.
   */
  creatureHp?: { start: Readonly<Record<string, number>>; max: Readonly<Record<string, number>> };
  /**
   * `zones` (the raid): the zones are rows under the boss, front first. `row` (the dungeon): the
   * creatures stand side by side in one row, left to right, with no zone labels; each zone is the
   * one creature at that place, so its effects (shake, shield, wind-up frame) sit on that creature.
   */
  layout?: 'zones' | 'row';
  /**
   * Where in the run the fight is, top left of the stage's head: "Room 1 / 3" in the dungeon,
   * "Phase 1 / 3" or "Finale" in the raid. The round is at the top right.
   */
  place?: string;
  /** The room's modifiers, as small tags after the place in the head (the dungeon). */
  modifiers?: readonly StageModifier[];
  /**
   * The raid phase being shown, for the line the boss says when it retreats at the phase's floor
   * (Phase 1: "back in Phase 2"). Absent (the finale, the dungeon): the line does not name a phase.
   */
  phase?: RaidPhaseId;
  /** Gimmicks the foe has only in this room (the dungeon's modifier), so the forecast names them too. */
  addedGimmicks?: readonly Gimmick[];
  /**
   * Something drawn over the whole stage, above the round intro (the dungeon's room banner). It sits
   * inside the stage's own box, so the stage keeps its size while it shows.
   */
  overlay?: ComponentChildren;
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

/**
 * The beams a landed boss action draws: from the boss to each creature it hit (the first four), a
 * chain's arcs from one creature to the next, and a lance's line from its first creature to its last
 * (the lane runs through them). Sweeps, barrages, pincers, charges and the enrage round draw none:
 * their outlines and marks say it.
 */
function beamsOf(strike: BossStrike): { from: string | null; to: string }[] {
  const targets = reticleTargets(strike);
  switch (strike.action) {
    case 'sweep':
    case 'barrage':
    case 'pincer':
    case 'charge':
    case 'enrage':
    case 'hit_zone':
    case 'reflect_armed':
      return [];
    case 'lance': {
      const first = targets[0];
      const last = targets[targets.length - 1];
      return first === undefined || last === undefined || first === last
        ? []
        : [{ from: first, to: last }];
    }
    case 'strike_highest_atk':
      return targets
        .slice(0, 4)
        .map((to, k) => ({ from: k === 0 ? null : (targets[k - 1] ?? null), to }));
    default:
      return targets.slice(0, 4).map((to) => ({ from: null, to }));
  }
}

/**
 * The foe's or boss's picture as a button that opens its popover (name, element, HP and what it does)
 * in the app's popover layer. The mark and the effects sit beside it, not inside it. Without the
 * popover host it is the plain picture, named for assistive technology.
 */
function FoeFace({ info, children }: { info: FoeInfo; children: ComponentChildren }) {
  const { host, ref, open } = usePopoverTrigger<HTMLButtonElement>();
  if (host === null) {
    return (
      <span class="foe-face" role="img" aria-label={info.name}>
        {children}
      </span>
    );
  }
  return (
    <button
      ref={ref}
      type="button"
      class="small-creature foe-face"
      {...popupProps(open)}
      aria-label={foeButtonLabel(info.name)}
      onClick={() => {
        if (ref.current !== null) host.openFoe(`foe:${info.id}`, info, ref.current);
      }}
    >
      {children}
    </button>
  );
}

interface UnitProps {
  creature: ReplayRowEntry;
  scale: number;
  mine: boolean;
  ko: boolean;
  classes: readonly string[];
  silenced: boolean;
  fx: readonly FxItem[];
  names: EventNames;
  badge: Badge | null;
  /** The ability's id, for the label of the badge. */
  abilityId: string | null;
  /** True for the player's own creatures: they can be tapped (an ability popover, or a note). */
  interactive: boolean;
  /** What the button says it opens, for assistive technology. */
  opens: string;
  open: boolean;
  /** Registers the creature's button as the anchor of its popover. */
  anchorRef: Ref<HTMLButtonElement>;
  /** Registers the creature's box, so a strike's beam can find its target. */
  boxRef: Ref<HTMLLIElement>;
  /** The boss will silence this creature next round (a warning glyph on it). */
  warned: boolean;
  /** The creature is marked for a charged attack that lands next round (a persistent amber mark). */
  charged: boolean;
  /** The creature's HP now and at most (the dungeon); null when the stage shows no creature HP. */
  hp: { current: number; max: number } | null;
  /**
   * The creature's place in this round's acting order from 1 ("1st", "2nd", ...), written under it;
   * null when it has no turn this round (knocked out, or the round has not been played yet).
   */
  slot: number | null;
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
    `${props.slot === null ? '' : `Acts ${ordinal(props.slot)}, `}${c.name}${mine ? ', yours' : ''}${ko ? ', knocked out' : ''}${props.charged ? ", marked for the boss's next attack" : ''}` +
    (props.hp === null || ko ? '' : `, HP ${String(props.hp.current)} / ${String(props.hp.max)}`) +
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
        {props.warned && (
          <span class="warn-mark" aria-hidden="true">
            <Sprite sprite={glyphOrUnknown('warning')} scale={2} />
          </span>
        )}
        {props.charged && !ko && (
          <span class="charge-mark" aria-hidden="true">
            <Sprite sprite={glyphOrUnknown('charge')} scale={2} />
          </span>
        )}
        <Marks fx={props.fx} id={c.id} />
      </span>
      <span class="unit-name pix" aria-hidden="true">
        {c.name}
      </span>
      {props.hp !== null && (
        <SegmentBar size="unit" current={props.hp.current} max={props.hp.max} />
      )}
      <span class="unit-slot pix" aria-hidden="true">
        {props.slot === null ? '' : ordinal(props.slot)}
      </span>
    </>
  );

  return (
    <li class={props.classes.join(' ')} ref={props.boxRef}>
      {interactive ? (
        <button
          type="button"
          ref={props.anchorRef}
          class="unit-face"
          {...popupProps(open)}
          aria-label={`${spoken}. ${props.opens}`}
          onClick={props.onToggle}
        >
          {face}
        </button>
      ) : (
        // Display only: a tap shows the creature's role and element (`SmallCreature`).
        <SmallCreature
          id={c.id}
          info={creatureInfoOf(c)}
          class="unit-face"
          label={`${spoken}. Level ${String(c.level)}. Shows its role and element.`}
        >
          {face}
        </SmallCreature>
      )}
      <Floats fx={props.fx} target={c.id} />
      <Bursts fx={props.fx} target={c.id} names={props.names} />
      <KoTags fx={props.fx} creature={c.id} />
    </li>
  );
}

/**
 * The role and element of a creature as tags, at the bottom of the ability popovers, so what a
 * small-creature popover would tell is one tap away on your own creatures too. Each tag opens its
 * glossary entry in the usual popover. Nothing for a creature that is not in the row (a basic
 * ability has none).
 */
function CreatureTags({ creature }: { creature: ReplayRowEntry | undefined }) {
  if (creature === undefined) return null;
  return (
    <p class="tags pop-tags">
      <ElementChip element={creature.element} role={creature.role} />
    </p>
  );
}

/**
 * The fight stage: the boss on top with its HP bar, then the creatures under it. In the raid they are
 * a grid like the placement board: Front, Middle and Back are three lines that never wrap, a lane is
 * a column, the row names stay at the left and the lines scroll sideways together. Before the fight
 * the grid shows the viewer's own creatures; as it plays it follows the creature that acts (the
 * smooth scroll is instant under `prefers-reduced-motion`, and waits a few seconds after the player
 * scrolls it by hand). The dungeon's `single` row is three creatures side by side. It shows the state after `index`
 * events and animates the beat `anim`: hops, white flashes, floating numbers, reaction bursts,
 * the mark, knockouts, zone frames and ability cards. Everything is drawn from the event log; the
 * animation classes are only decoration, and `prefers-reduced-motion` (in styles/stage/motion.css) turns them
 * into outlines and instant changes.
 */
export function Stage({
  boss,
  hpMax,
  hpStart,
  rounds,
  row,
  rules,
  board,
  lobby,
  mineIds,
  names,
  events,
  index,
  anim,
  fx: allFx = [],
  intro = null,
  creatureHp,
  layout = 'zones',
  place,
  modifiers,
  phase,
  addedGimmicks,
  overlay,
  abilities,
}: StageProps) {
  const single = layout === 'row';
  const wording: Wording = single ? 'row' : 'zones';
  const rowsRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(rowsRef, STAGE_FALLBACK_PX);
  /** The layer the strikes' beams are drawn in, the boss and each creature's box (for the beams to find). */
  const layerRef = useRef<HTMLDivElement>(null);
  const bossRef = useRef<HTMLDivElement>(null);
  const boxes = useRef(new Map<string, HTMLElement>());
  const boxRef = (id: string) => (el: HTMLElement | null) => {
    if (el === null) boxes.current.delete(id);
    else boxes.current.set(id, el);
  };
  /** Which popover is open: "a:<ability key>" for an ability, "help" for the "?" button's. */
  const [openKey, setOpenKey] = useState<string | null>(null);
  const anchors = useRef(new Map<string, HTMLElement>());
  const anchorRef = (id: string) => (el: HTMLElement | null) => {
    if (el === null) anchors.current.delete(id);
    else anchors.current.set(id, el);
  };
  const rowIds = row.map((c) => c.id);
  const state = stageStateAt(events, index, hpStart);
  // The acting order written under the creatures. The dungeon always acts left to right; the raid's
  // order varies by boss, so it follows the engine's own turn and skip events for the round on show.
  const slots = actingSlots(events, state.round, rowIds, single);
  const cues =
    anim === null
      ? []
      : cuesForEvents(events, anim.from, Math.min(anim.to, index), rowIds, boss.id, board);
  const creatureHpNow =
    creatureHp === undefined ? {} : creatureHpAt(events, index, creatureHp.start);
  // A crowded action (more than eight creatures hit) shows only its big numbers, judged by each
  // creature's max HP: the dungeon's own, or an estimate from species and level in the raid.
  const maxHpOf = (id: string): number | null => {
    const known = creatureHp?.max[id];
    if (known !== undefined) return known;
    const entry = row.find((c) => c.id === id);
    return entry === undefined ? null : estimatedMaxHp(entry, rules);
  };
  const fx = allFx.filter(
    (item) =>
      item.cue.kind !== 'float' ||
      item.cue.target === null ||
      showsNumber(item.cue, maxHpOf(item.cue.target)),
  );
  // Charged attacks that are announced and have not landed: their victims and rows stay marked.
  const pending = pendingChargesAt(events, index);
  const chargedIds = new Set(pending.flatMap((c) => c.marks));
  const chargedRows = new Set(pending.flatMap((c) => c.rows));
  const enraged = enragedAt(events, index);
  const retreated = retreatedAt(events, index);
  const previousHp = anim === null ? state.bossHp : stateAt(events, anim.from, hpStart).bossHp;
  const art = bossArt(boss.id);
  // What the foe's popover tells, from the content: its element, HP, line and what it does.
  const foe = foeInfoOf({
    id: boss.id,
    name: boss.name,
    element: boss.element ?? foeElement(boss.id) ?? undefined,
    hp: hpMax,
    ...(addedGimmicks === undefined ? {} : { added: addedGimmicks }),
    wording,
  });

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
  const abilityCards = fx.filter((i) => i.cue.kind === 'ability');
  const bannerItem = fx.filter((i) => i.cue.kind === 'banner').at(-1);
  // The boss leans in while it winds up, and the label of its newest hit shows in the boss's line.
  const windupItem = fx.find((i) => i.cue.kind === 'windup');
  const strikeItems = fx.filter((i) => i.cue.kind === 'strike');
  const strikeItem = strikeItems.at(-1);
  // One round ahead: what the boss will do next round, from its content and the round number.
  const forecast = forecastNextRound(
    boss.id,
    state.round,
    rounds,
    rowIds,
    state.knockedOut,
    names,
    wording,
    addedGimmicks,
    board,
  );

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
  const openNote =
    openKey?.startsWith('c:') === true ? row.find((c) => `c:${c.id}` === openKey) : undefined;

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
    if (openKey === null) return;
    if (openKey.startsWith('c:')) {
      if (openNote === undefined) setOpenKey(null);
      return;
    }
    if (!openKey.startsWith('a:')) return;
    if (
      openAbility === undefined ||
      (before.key === openKey && before.actionable && !openActionable)
    ) {
      setOpenKey(null);
    }
  }, [openKey, openActionable, openAbility === undefined, openNote === undefined]);

  const close = (): void => {
    setOpenKey(null);
  };
  const toggle = (key: string): void => {
    setOpenKey(openKey === key ? null : key);
  };

  const parity = anim === null ? 0 : anim.seq % 2;
  // The raid's rows are the board's rows, cell for cell: a creature stands in its own board slot and
  // an empty board slot is an empty cell (null), so a lane is the same column as on the placement board.
  const rows = boardRows(board?.length ?? row.length);
  const groups: { zone: Zone; items: (ReplayRowEntry | null)[] }[] = single
    ? groupByZone(row, board)
    : rows.map(({ zone, slots }) => ({
        zone,
        items: slots.map((slot) => creatureAtSlot(row, board, slot) ?? null),
      }));
  const lanes = rows.reduce((most, r) => Math.max(most, r.slots.length), 0);

  // Keep the creature that acts in view (the raid's grid scrolls sideways); before the fight starts
  // show the viewer's own creatures. A hand-scroll holds the auto-scroll back for a few seconds.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const handScrolledAt = useRef(0);
  const started = state.round > 0;
  useLayoutEffect(() => {
    if (single) return;
    if (!started) {
      const own = ownLaneSpan(
        laneStates(rows, (slot) => {
          const c = creatureAtSlot(row, board, slot);
          return c === undefined ? null : mineIds.has(c.id) ? 'mine' : 'other';
        }),
      );
      if (own !== null)
        scrollToLanes(scrollerRef.current, own.first, own.last, { smooth: false, follow: false });
      return;
    }
    if (state.actor === null || Date.now() - handScrolledAt.current < HAND_SCROLL_HOLD_MS) return;
    const at = row.findIndex((c) => c.id === state.actor);
    if (at >= 0) {
      const lane = laneOfIndex(at, board ?? row.length);
      scrollToLanes(scrollerRef.current, lane, lane, {
        smooth: !reduced,
        follow: true,
      });
    }
  }, [single, started, state.actor, row.length]);
  const markName = state.mark === null ? null : nameOf(names.marks, state.mark);
  const markId = content.reactions.find((r) => r.markElement === state.mark)?.markId;
  const markIcon = state.mark === null ? undefined : elementIcon(state.mark);
  const markColours = state.mark === null ? undefined : markPalette(state.mark);
  const markGlyph = glyphOrUnknown('mark');
  const shieldGlyph = glyphOrUnknown('shield');
  const abilityGlyph = glyphOrUnknown('ability');
  const zoneNodes = groups.map(({ zone, items }) => {
    const fresh = fx.filter((i) => i.cue.kind === 'zone' && i.cue.zone === zone);
    const freshShield = fresh.find((f) => f.cue.kind === 'zone' && f.cue.effect === 'shield');
    const walled = state.shielded.includes(zone);
    const zoneName = single ? PLACE_NAMES[zone] : ZONE_NAMES[zone];
    // The single row: all the creatures share one size, picked for the whole row. The raid's grid
    // has one fixed tile (see styles/stage/stage-grid.css), so nothing is measured for it.
    const layoutOf = single ? zoneLayout(row.length, width, ROW_LAYOUT) : null;
    const scale = layoutOf === null ? GRID_SCALE : layoutOf.tier.scale;
    const zoneWindup = fx.filter(
      (i) => i.cue.kind === 'windup' && strikeRows(i.cue.strike).includes(zone),
    );
    const zoneCharged = chargedRows.has(zone);
    const warnedZone = forecast?.zones.includes(zone) === true;
    return (
      <div
        key={zone}
        class={`stage-zone zone-${zone}${shaking.has(zone) ? ' shake' : ''}${warnedZone ? ' warned' : ''}${zoneCharged ? ' charged' : ''}`}
        role="group"
        aria-label={single ? zoneName : `${zoneName} zone`}
        {...(layoutOf === null ? {} : { ref: cssVars(layoutVars(layoutOf, ROW_LAYOUT)) })}
      >
        {single && warnedZone && (
          <span class="zone-warn" aria-hidden="true">
            <Sprite sprite={glyphOrUnknown('warning')} scale={2} />
          </span>
        )}
        {single && zoneCharged && (
          <span class="zone-charge" aria-hidden="true">
            <Sprite sprite={glyphOrUnknown('charge')} scale={2} />
          </span>
        )}
        <ul class="zone-units">
          {items.map((c, cell) => {
            if (c === null)
              return <li key={`gap-${String(cell)}`} class="stage-gap" aria-hidden="true" />;
            const mine = mineIds.has(c.id);
            const ko = state.knockedOut.includes(c.id);
            const classes = ['stage-unit'];
            if (mine) classes.push('mine');
            if (ko) classes.push('ko');
            if (hopping.has(c.id)) classes.push('actor');
            if (state.actor === c.id) classes.push('acting');
            if (hit.has(c.id)) classes.push('hit');
            if (dropped.has(c.id)) classes.push('drop');
            if (silenced.has(c.id)) classes.push('silenced');
            if (chargedIds.has(c.id) && !ko) classes.push('charged');

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
            // Your own creatures are always buttons: the ability popover, or a note on why
            // there is no ability (the note needs the screen to supply its text).
            const tap = unitTap(mine && abilities !== undefined, mineAbility !== undefined);
            let key: string | null = null;
            if (tap === 'ability' && mineAbility !== undefined) key = `a:${mineAbility.key}`;
            else if (tap === 'note' && abilities?.renderNote !== undefined) key = `c:${c.id}`;
            return (
              <StageUnit
                key={c.id}
                creature={c}
                scale={scale}
                mine={mine}
                ko={ko}
                classes={classes}
                silenced={silenced.has(c.id)}
                fx={fx}
                names={names}
                badge={badge}
                abilityId={abilityId}
                interactive={key !== null}
                opens={
                  tap === 'note' ? 'Opens a note about its ability.' : 'Opens the ability options.'
                }
                open={key !== null && openKey === key}
                anchorRef={anchorRef(key ?? `none:${c.id}`)}
                boxRef={boxRef(c.id)}
                warned={forecast?.ends.includes(c.id) === true}
                charged={chargedIds.has(c.id)}
                hp={
                  creatureHp === undefined
                    ? null
                    : {
                        current: creatureHpNow[c.id] ?? 0,
                        max: creatureHp.max[c.id] ?? 0,
                      }
                }
                slot={slots.get(c.id) ?? null}
                onToggle={() => {
                  if (key !== null) toggle(key);
                }}
              />
            );
          })}
        </ul>
        {walled && (
          <span
            class={`zone-fx fx-shield${freshShield === undefined ? '' : ' fresh'}`}
            aria-hidden="true"
            {...(freshShield === undefined ? {} : { ref: fxRef(freshShield) })}
          >
            <Sprite sprite={shieldGlyph} scale={2} />
          </span>
        )}
        {fresh.map((item) => {
          const f = item.cue;
          if (f.kind !== 'zone' || (f.effect === 'shield' && walled)) return null;
          const icon =
            f.effect === 'shield'
              ? shieldGlyph
              : f.effect === 'rally'
                ? abilityGlyph
                : gimmickGlyph('hit_zone');
          return (
            <span
              key={`${String(f.i)}-${f.effect}`}
              class={`zone-fx fx-${f.effect} fresh`}
              aria-hidden="true"
              ref={fxRef(item)}
            >
              {f.effect === 'hit' && <span class="strike-wave" />}
              <Sprite sprite={icon} scale={2} />
            </span>
          );
        })}
        {zoneWindup.map((item) => (
          <span
            key={`windup-${String(item.cue.i)}`}
            class="zone-fx fx-windup"
            aria-hidden="true"
            ref={fxRef(item)}
          />
        ))}
      </div>
    );
  });
  return (
    <section
      class={`stage p${String(parity)}${single ? ' single' : ''}`}
      aria-label="Fight stage"
      ref={cssVars({
        '--beat': `${String(anim === null ? 600 : shortEffectMs(anim.ms))}ms`,
        '--lean-ms': `${String(windupItem?.ms ?? 600)}ms`,
      })}
    >
      <StageHead
        {...(place === undefined ? {} : { place })}
        {...(modifiers === undefined ? {} : { modifiers })}
        round={
          state.round > 0
            ? roundLabel(state.round, rounds)
            : lobby === true
              ? 'Get ready'
              : roundLabel(1, rounds)
        }
      >
        {abilities?.help !== undefined && (
          <button
            type="button"
            ref={anchorRef('help')}
            class="stage-help pix"
            {...popupProps(openKey === 'help')}
            aria-label="How abilities work"
            onClick={() => {
              toggle('help');
            }}
          >
            ?
          </button>
        )}
      </StageHead>

      <div class="stage-boss">
        <div
          ref={bossRef}
          class={`stage-boss-art${hit.has(null) ? ' hit' : ''}${windupItem === undefined ? '' : ' windup'}${retreated ? ' retreated' : ''}${enraged ? ' enraged' : ''}`}
        >
          <FoeFace info={foe}>
            <Sprite sprite={art.sprite} scale={art.scale} />
          </FoeFace>
          {state.mark !== null && (
            <span class={`stage-mark ${elementClass(state.mark)}${markCue ? ' pop' : ''}`}>
              {/* The boss is not a button, so the mark can be a tag without taking a tap from anything. */}
              <GlossaryTag
                entry={markId === undefined ? '' : GLOSSARY_IDS.mark(markId)}
                look="chip"
                bare
                class="mark-tag"
                label={`Marked: ${markName ?? state.mark}. What does this mean?`}
              >
                <Sprite
                  sprite={markGlyph}
                  scale={3}
                  {...(markColours === undefined ? {} : { palette: markColours })}
                />
                {markIcon !== undefined && <Sprite sprite={markIcon} scale={2} />}
                <span class="stage-mark-name">{markName}</span>
              </GlossaryTag>
            </span>
          )}
          <Floats fx={fx} target={null} />
          <Bursts fx={fx} target={null} names={names} />
          {bannerItem?.cue.kind === 'banner' && (
            <span
              key={`banner-${String(bannerItem.cue.i)}`}
              class="stage-callout banner"
              aria-hidden="true"
              ref={fxRef(bannerItem)}
            >
              <span class="pix">{bannerItem.cue.text}</span>
            </span>
          )}
        </div>
        <div class="stage-foe-line">
          <p class="stage-foe-name pix">{boss.name}</p>
          {foe.element !== 'unknown' && <ElementChip element={foe.element} context="boss" />}
        </div>
        <SegmentBar
          size="boss"
          current={state.bossHp}
          max={hpMax}
          previous={previousHp}
          label={`${boss.name} HP: ${String(state.bossHp)} / ${String(hpMax)}`}
          text={compactPair(state.bossHp, hpMax)}
        />
        {enraged && (
          <p class="enrage-banner" role="note">
            <GlossaryTag entry="enrage" class="enrage-title pix">
              Enraged
            </GlossaryTag>
            <span class="enrage-line">{enrageLine(boss.name)}</span>
          </p>
        )}
        {retreated && (
          <p class="retreat-line" role="note">
            <GlossaryTag entry="retreat" class="retreat-title pix">
              Immune
            </GlossaryTag>
            <span>{retreatLine(boss.id, boss.name, phase, boss.retreat)}</span>
          </p>
        )}
        <div class={`stage-line${strikeItem === undefined ? '' : ' has-strike'}`}>
          {forecast !== null && (
            <p class="forecast pix" role="note" aria-label={forecast.text}>
              <Sprite sprite={glyphOrUnknown('warning')} scale={2} />
              <span class="forecast-lines" aria-hidden="true">
                {forecast.lines.map((line, k) => (
                  <span key={k} class="forecast-line">
                    {line}
                  </span>
                ))}
              </span>
            </p>
          )}
          {strikeItem?.cue.kind === 'strike' && (
            <p
              key={`strike-${String(strikeItem.cue.i)}`}
              class={`strike-label pix act-${strikeItem.cue.strike.action}`}
              aria-hidden="true"
              ref={fxRef(strikeItem)}
            >
              <Sprite sprite={strikeGlyph(strikeItem.cue.strike)} scale={2} />
              <span>{strikeLabel(strikeItem.cue.strike, names, wording).text}</span>
            </p>
          )}
        </div>
      </div>

      <div class="stage-abilities-slot">
        <ul class="stage-abilities" aria-label="Abilities that just fired">
          {abilityCards.slice(0, MAX_ABILITY_CARDS).map((item) =>
            item.cue.kind === 'ability' ? (
              <li key={`ability-${String(item.cue.i)}`} class="stage-ability" ref={fxRef(item)}>
                <Sprite sprite={abilityGlyph} scale={2} />
                <span class="pix">
                  {abilityTitle(
                    { abilityId: item.cue.ability, creature: item.cue.creature },
                    names,
                  )}
                </span>
              </li>
            ) : null,
          )}
          {abilityCards.length > MAX_ABILITY_CARDS && (
            <li class="stage-ability more">
              <span class="pix">+{abilityCards.length - MAX_ABILITY_CARDS} more</span>
            </li>
          )}
        </ul>
      </div>

      <div
        class={single ? 'stage-rows single-row' : 'stage-rows'}
        ref={rowsRef}
        role="group"
        aria-label={single ? 'Your team, left to right' : 'Zones, front to back'}
      >
        {single ? (
          zoneNodes
        ) : (
          <div class="board-grid stage-grid">
            <div class="board-labels">
              <p class="board-lane-head" aria-hidden="true">
                Lane
              </p>
              {groups.map(({ zone }) => {
                const warned = forecast?.zones.includes(zone) === true;
                return (
                  <p key={zone} class={`zone-label board-label pix${warned ? ' warned' : ''}`}>
                    <GlossaryTag entry={GLOSSARY_IDS.zone(zone)}>{ZONE_NAMES[zone]}</GlossaryTag>
                    {warned && (
                      <span class="zone-warn" aria-hidden="true">
                        <Sprite sprite={glyphOrUnknown('warning')} scale={2} />
                      </span>
                    )}
                    {chargedRows.has(zone) && (
                      <span class="zone-warn charge" aria-hidden="true">
                        <Sprite sprite={glyphOrUnknown('charge')} scale={2} />
                      </span>
                    )}
                  </p>
                );
              })}
            </div>
            <div
              ref={scrollerRef}
              class="party-strip board-scroller"
              role="group"
              aria-label="Party grid: rows front to back, lanes left to right"
              onPointerDown={() => {
                handScrolledAt.current = Date.now();
              }}
              onWheel={() => {
                handScrolledAt.current = Date.now();
              }}
            >
              <div class="board-lanes" aria-hidden="true">
                {Array.from({ length: lanes }, (_, lane) => (
                  <span key={lane} class="board-lane" data-lane={lane}>
                    {lane + 1}
                  </span>
                ))}
              </div>
              {zoneNodes}
            </div>
          </div>
        )}
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
                {...popupProps(openKey === key)}
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
        <Popover
          key={openKey}
          anchor={() => anchors.current.get(`a:${openAbility.key}`) ?? null}
          label={`${abilityName(openAbility.abilityId)} ability`}
          onClose={close}
        >
          {abilities.renderPopover(openAbility, ownInfo(openAbility).badge, close)}
          <CreatureTags creature={row.find((c) => c.id === openAbility.creature)} />
        </Popover>
      )}
      {abilities?.renderNote !== undefined && openNote !== undefined && (
        <Popover
          key={openKey}
          anchor={() => anchors.current.get(`c:${openNote.id}`) ?? null}
          label={`${openNote.name}`}
          onClose={close}
        >
          {abilities.renderNote(openNote, close)}
          <CreatureTags creature={openNote} />
        </Popover>
      )}
      {abilities?.help !== undefined && openKey === 'help' && (
        <Popover
          key="help"
          anchor={() => anchors.current.get('help') ?? null}
          label="How abilities work"
          onClose={close}
        >
          {abilities.help}
        </Popover>
      )}
      <div class="stage-strikes" ref={layerRef} aria-hidden="true">
        {strikeItems.map((item) => {
          const { cue } = item;
          if (cue.kind !== 'strike' || item.ms === 0) return null;
          return beamsOf(cue.strike).map((beam) => (
            <Beam
              key={`beam-${String(cue.i)}-${beam.from ?? 'boss'}-${beam.to}`}
              layer={layerRef}
              from={() =>
                beam.from === null ? bossRef.current : (boxes.current.get(beam.from) ?? null)
              }
              to={() => boxes.current.get(beam.to) ?? null}
              ms={item.ms}
              between={beam.from !== null}
            />
          ));
        })}
      </div>
      {intro !== null && <RoundIntro intro={intro} />}
      {overlay}
    </section>
  );
}

/**
 * The stage of the live finale: when a poll brings a new round it opens with "Round N", then steps
 * through the round's beats, and shows the state the server reports. Effects overlap the beats (see
 * `useLiveStage`). `hold` keeps it waiting while the countdown's "FIGHT!" is on screen.
 */
export function LiveStage(
  props: Omit<StageProps, 'index' | 'anim' | 'fx' | 'intro'> & { hold?: boolean },
) {
  const { hold, ...rest } = props;
  const reduced = usePrefersReducedMotion();
  const view = useLiveStage(
    props.events,
    props.row.map((c) => c.id),
    props.boss.id,
    props.rounds,
    reduced,
    hold === true,
    props.board,
  );
  return <Stage {...rest} index={view.index} anim={view.anim} fx={view.fx} intro={view.intro} />;
}
