/**
 * The creature tray (round 2, the hybrid; the party prototype's camp, adapted and copied, not imported): the
 * one thing always on screen besides the HUD, along the bottom. Each creature is a button with its sprite,
 * "Lv N" under it, and at most one mark on it, one shape per state: a bag (home with loot), "!" (done at the
 * forge), an up arrow (can evolve), an anvil (working), a pennant (in the raid), a dark silhouette with a pack
 * and the destination's element (away). A free creature carries no mark; it idles. Two rows on a phone (they
 * always fit; more creatures scroll sideways behind a cue), one row on a wide window.
 */
import { expeditionContent } from '@creatures/game';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Creature } from '../../api';
import { silhouettePalette } from '../../art';
import { cssVars } from '../../css-vars';
import { glyphOrUnknown } from '../../glyphs';
import { propSprite } from '../../games/art/props';
import { Sprite } from '../../sprites/Sprite';
import { creatureSpriteOrFallback } from '../../sprites/creature-sprites';
import { PACK_ART } from '../../sprites/pack-art';
import { GameIcon } from '../../ui/GameIcon';
import type { ProtoWorld } from '../world';
import { MASTERY_MAX, masteryWords, type WorkKind } from './mastery';
import { UpArrow, useSize } from './parts';
import { sceneScale } from './scale';
import { trayBadge, type TrayBadge } from './tray-state';

/** The mark on a creature: one shape per state; nothing for a free one. */
function Mark({ badge }: { badge: TrayBadge }) {
  switch (badge.state) {
    case 'loot':
      return (
        <span class="pv-mark pv-mark-say">
          <Sprite sprite={glyphOrUnknown('satchel')} scale={2} />
        </span>
      );
    case 'ready':
      return (
        <span class="pv-mark pv-mark-say">
          <span class="pv-bang pix">!</span>
        </span>
      );
    case 'evolve':
      return (
        <span class="pv-mark pv-mark-say">
          <UpArrow />
        </span>
      );
    case 'job':
      return (
        <span class="pv-mark">
          <Sprite sprite={glyphOrUnknown('anvil')} scale={2} />
        </span>
      );
    case 'raid':
      return (
        <span class="pv-mark">
          <Sprite sprite={propSprite('pennant', 0, 'red')} scale={2} />
        </span>
      );
    case 'trip': {
      const element = expeditionContent.destinations.find(
        (d) => d.id === badge.destination,
      )?.element;
      return element == null ? null : (
        <span class="pv-mark">
          <GameIcon icon={{ kind: 'element', element }} scale={2} />
        </span>
      );
    }
    case 'free':
      return null;
  }
}

/** A creature's mastery of the place's work: its step (0 to 3) in that kind of work. */
export interface TrayMastery {
  step: number;
  kind: WorkKind;
}

/** Three pips under the level: a filled one for each step reached (hollow ones are the steps to come). */
function Pips({ step }: { step: number }) {
  return (
    <span class="pv-mastery" aria-hidden="true">
      {Array.from({ length: MASTERY_MAX }, (_, i) => (
        <span key={i} class={i < step ? 'pv-mastery-pip is-on' : 'pv-mastery-pip'} />
      ))}
    </span>
  );
}

export function TrayCreature({
  creature,
  world,
  held,
  dimWord,
  index,
  onPick,
  scale = 3,
  mastery = null,
}: {
  creature: Creature;
  world: ProtoWorld;
  held: boolean;
  /** It cannot do what the place asks: the one word. */
  dimWord: string | null;
  index: number;
  onPick: () => void;
  /** The screen's pixel scale (the place's own when inside one). */
  scale?: number;
  /** Its mastery of the place's work, when the place has work. */
  mastery?: TrayMastery | null;
}) {
  const badge = trayBadge(world, creature);
  const sprite = creatureSpriteOrFallback(creature.species);
  const away = badge.state === 'trip';
  const classes = ['pv-mon', `pv-mon-${badge.state}`];
  if (held) classes.push('is-held');
  if (dimWord !== null) classes.push('is-dim');
  return (
    <button
      type="button"
      class={classes.join(' ')}
      data-creature={creature.id}
      aria-pressed={held}
      aria-label={`${badge.label}${mastery === null ? '' : ` ${masteryWords(mastery.step, mastery.kind)}.`}${dimWord === null ? '' : ` Not here: ${dimWord}.`}`}
      onClick={onPick}
      ref={cssVars({ '--i': index })}
    >
      <span class="pv-mon-head">
        <Mark badge={badge} />
      </span>
      <span class="pv-mon-body">
        <Sprite
          sprite={sprite}
          scale={scale}
          class="pv-mon-sprite"
          {...(away ? { palette: silhouettePalette(sprite) } : {})}
        />
        {away && (
          <span class="pv-mon-pack">
            <Sprite sprite={PACK_ART} scale={2} />
          </span>
        )}
      </span>
      <span class="pv-mon-lv pix">
        Lv {creature.level}
        {mastery !== null && <Pips step={mastery.step} />}
      </span>
      {dimWord !== null && <span class="pv-mon-word pix">{dimWord}</span>}
    </button>
  );
}

export function Tray({
  world,
  creatures,
  held,
  dim,
  onPick,
  label,
  inPlace = false,
  mastery,
}: {
  world: ProtoWorld;
  creatures: readonly Creature[];
  held: string | null;
  /** The word for a creature that cannot do what the place asks; null when it can. */
  dim?: ((c: Creature) => string | null) | undefined;
  onPick: (id: string) => void;
  label: string;
  /** Inside a place: the creatures are drawn at the place's pixel scale, one size on the whole screen. */
  inPlace?: boolean;
  /** Each creature's mastery of the place's work (inside a place that has work); null for none. */
  mastery?: ((c: Creature) => TrayMastery | null) | undefined;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const size = useSize(sectionRef);
  const scale = inPlace ? sceneScale(size.width) : 3;
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el === null) return undefined;
    const check = (): void => {
      setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    check();
    el.addEventListener('scroll', check);
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', check);
      observer.disconnect();
    };
  }, [creatures.length]);
  return (
    <section
      ref={sectionRef}
      class={`pv-tray${more ? ' has-more' : ''}${scale > 3 ? ' pv-tray-big' : ''}`}
      aria-label={label}
    >
      <div class="pv-tray-scroll" ref={ref}>
        <div class="pv-tray-grid">
          {creatures.map((c, i) => (
            <TrayCreature
              key={c.id}
              creature={c}
              world={world}
              held={held === c.id}
              dimWord={dim?.(c) ?? null}
              index={i}
              scale={scale}
              mastery={mastery?.(c) ?? null}
              onPick={() => {
                onPick(c.id);
              }}
            />
          ))}
        </div>
      </div>
      {more && <span class="pv-tray-more" aria-hidden="true" />}
    </section>
  );
}
