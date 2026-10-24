import type { EventNames } from '@creatures/engine';
import { Fragment } from 'preact';
import { elementClass } from '../art';
import { cssVars } from '../css-vars';
import { CHAIN_GLYPH, gimmickGlyph, glyphOrUnknown } from '../glyphs';
import { reticleTargets, type BossStrike } from '../stage';
import { type FxItem, type IntroView } from '../stage-fx';
import { Sprite } from '../sprites/Sprite';
import { elementIcon } from '../sprites/element-icons';
import { PixelHeading } from '../ui/PixelHeading';

/**
 * The effects of the fight stage: the numbers, bursts, knockout tags, the round intro, the marks
 * and the beams of a boss's strikes. Only decoration, drawn from the stage's effect list.
 */

/** Each name or id is drawn as text only; nothing here builds markup from it. */
export const nameOf = (table: Readonly<Record<string, string>> | undefined, id: string): string =>
  table?.[id] ?? id;

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
export function fxRef(item: FxItem, extra: Readonly<Record<string, string | number>> = {}) {
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
export function Floats({ fx, target }: FxProps) {
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
export function Bursts({ fx, target, names }: FxProps & { names: EventNames }) {
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
export function KoTags({ fx, creature }: { fx: readonly FxItem[]; creature: string }) {
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

/** The big "Round N" over the stage when a round opens, in the countdown's pixel face. */
export function RoundIntro({ intro }: { intro: IntroView }) {
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
export function strikeGlyph(strike: BossStrike) {
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
export function Marks({ fx, id }: { fx: readonly FxItem[]; id: string }) {
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
