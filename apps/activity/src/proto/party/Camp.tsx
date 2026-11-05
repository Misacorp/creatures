import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { expeditionContent } from '@creatures/game';
import type { Creature } from '../../api';
import { silhouettePalette } from '../../art';
import { cssVars } from '../../css-vars';
import { glyphOrUnknown } from '../../glyphs';
import { Sprite } from '../../sprites/Sprite';
import { creatureSpriteOrFallback } from '../../sprites/creature-sprites';
import { PACK_ART } from '../../sprites/pack-art';
import { GameIcon } from '../../ui/GameIcon';
import { PipRow } from '../../ui/PipRow';
import { creatureBadge, inOrder, TIMER_PIPS, type CreatureBadge } from './camp-state';
import type { PartyState } from './party-state';
import { stationVerdict } from './stations';

/** The element of a destination (its glyph on a traveller's pack); null for a mixed place. */
export function destinationElement(id: string | null): string | null {
  if (id === null) return null;
  return expeditionContent.destinations.find((d) => d.id === id)?.element ?? null;
}

/**
 * The mark over a creature's head: one shape per state that needs a word, none for a free one (it just
 * idles). Every glyph is at least 16 px.
 */
function BubbleArt({ badge }: { badge: CreatureBadge }): JSX.Element | null {
  switch (badge.bubble) {
    case 'loot':
      return (
        <span class="pp-bub pp-bub-loot">
          <Sprite sprite={glyphOrUnknown('satchel')} scale={3} />
        </span>
      );
    case 'needs':
      return (
        <span class="pp-bub pp-bub-say">
          <span class="pp-bang">!</span>
        </span>
      );
    case 'evolve':
      return (
        <span class="pp-bub pp-bub-evolve">
          <Sprite sprite={glyphOrUnknown('sparkle')} scale={2} class="pp-spk pp-spk-1" />
          <Sprite sprite={glyphOrUnknown('sparkle')} scale={2} class="pp-spk pp-spk-2" />
        </span>
      );
    case 'job':
      return (
        <span class="pp-bub pp-bub-job">
          <Sprite sprite={glyphOrUnknown('anvil')} scale={2} />
          <i class="pp-sweat" />
        </span>
      );
    case 'trip':
    case 'free':
      return null;
    case 'rested':
      return (
        <span class="pp-bub pp-bub-z">
          <span class="pp-z pp-z-1">z</span>
          <span class="pp-z pp-z-2">z</span>
        </span>
      );
  }
}

/** One creature in the camp: a button the size of its cell, its state drawn on it. */
export function CampCreature({
  creature,
  badge,
  held,
  lit,
  dimWord,
  index,
  scale,
  onPick,
  onPointerDown,
}: {
  creature: Creature;
  badge: CreatureBadge;
  held: boolean;
  /** A station view asked for a creature and this one can go. */
  lit: boolean;
  /** It cannot go where asked: the one word. */
  dimWord: string | null;
  index: number;
  scale: number;
  onPick: () => void;
  onPointerDown?: ((e: PointerEvent) => void) | undefined;
}) {
  const sprite = creatureSpriteOrFallback(creature.species);
  const away = badge.bubble === 'trip';
  const element = away ? destinationElement(badge.destination) : null;
  const classes = [
    'pp-mon',
    `pp-mon-${badge.bubble}`,
    held ? 'is-held' : '',
    lit ? 'is-lit' : '',
    dimWord !== null ? 'is-dim' : '',
  ]
    .filter((c) => c !== '')
    .join(' ');
  const label = dimWord === null ? badge.label : `${badge.label} Cannot go: ${dimWord}.`;
  return (
    <button
      type="button"
      class={classes}
      data-creature={creature.id}
      aria-pressed={held}
      aria-label={label}
      onClick={onPick}
      onPointerDown={onPointerDown}
      ref={cssVars({ '--pp-i': index })}
    >
      <span class="pp-mon-head">
        <BubbleArt badge={badge} />
      </span>
      <span class="pp-mon-body">
        <Sprite
          sprite={sprite}
          scale={scale}
          {...(away ? { palette: silhouettePalette(sprite) } : {})}
          class="pp-mon-sprite"
        />
        {away && (
          <span class="pp-pack">
            <Sprite sprite={PACK_ART} scale={2} />
            <span class="pp-pack-dest">
              {element === null ? (
                <Sprite sprite={glyphOrUnknown('compass')} scale={2} />
              ) : (
                <GameIcon icon={{ kind: 'element', element }} scale={2} />
              )}
            </span>
          </span>
        )}
        {badge.marks.length > 0 && (
          <span class="pp-marks">
            {badge.marks.map((m) => (
              <Sprite key={m} sprite={glyphOrUnknown(m)} scale={2} class="pp-mark" />
            ))}
          </span>
        )}
      </span>
      <span class="pp-mon-feet">
        {badge.pips !== null && badge.bubble !== 'needs' ? (
          <PipRow count={TIMER_PIPS} lit={badge.pips} />
        ) : (
          <span class="pp-lv">Lv {String(creature.level)}</span>
        )}
      </span>
      {dimWord !== null && <span class="pp-word pp-mon-word">{dimWord}</span>}
    </button>
  );
}

/**
 * The camp: every creature in two rows that fit the width (one row while a creature's card is open on a
 * phone), in the fixed order; scrolls sideways when there are more, with an arrow at the edge saying so.
 */
export function Camp({
  state,
  rows,
  scale,
  onPick,
  onPointerDown,
  children,
}: {
  state: PartyState;
  rows: 1 | 2;
  scale: number;
  onPick: (id: string) => void;
  onPointerDown?: (id: string, e: PointerEvent) => void;
  /** Shown beside the creatures (the held creature's card on a phone, the card and timers on a desktop). */
  children?: JSX.Element | (JSX.Element | null)[] | null;
}) {
  const creatures = inOrder(state.world, state.order);
  const asking = state.ask !== null && state.open !== null ? state.open : null;
  const gridRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = gridRef.current;
    if (el === null) return undefined;
    const check = (): void => {
      setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', check);
      observer.disconnect();
    };
  }, [rows, creatures.length]);
  return (
    <section class={`pp-camp pp-rows-${String(rows)}`} aria-label="Your creatures">
      {children}
      <div class="pp-tray">
        <div ref={gridRef} class="pp-camp-grid" role="group" aria-label="Camp">
          {creatures.map((c, i) => {
            const badge = creatureBadge(state.world, c, state.lounger, state.caveTeam);
            const verdict = asking === null ? null : stationVerdict(asking, c.id, state);
            return (
              <CampCreature
                key={c.id}
                creature={c}
                badge={badge}
                held={state.held === c.id}
                lit={verdict?.ok === true}
                dimWord={verdict !== null && !verdict.ok ? (verdict.word ?? '') : null}
                index={i}
                scale={scale}
                onPick={() => {
                  onPick(c.id);
                }}
                {...(onPointerDown === undefined
                  ? {}
                  : {
                      onPointerDown: (e: PointerEvent) => {
                        onPointerDown(c.id, e);
                      },
                    })}
              />
            );
          })}
        </div>
        {more && <i class="pp-more" aria-hidden="true" />}
      </div>
    </section>
  );
}
