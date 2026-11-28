/**
 * The creature tray: the roster along the bottom of the valley (the party prototype's camp, adapted). Each
 * creature is a button with its sprite, "Lv N" under it, and at most one mark on it, one shape per state: a bag
 * (home with loot), "!" (done at the forge), an up arrow (can evolve), an anvil (working), a dark silhouette
 * with a pack and the destination's element (away), an anvil (working or smithing at the Forge), a small "z" (resting at the fire, the valley's systems), the destination's element (scouting). A free creature carries no mark; it idles. One row when they all fit across, else two rows on a
 * phone (more creatures scroll sideways behind a cue), one row on a wide window. Tapping one opens the Paddock.
 */
import { expeditionContent } from '@creatures/game';
import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Creature } from '../api';
import { silhouettePalette } from '../art';
import { cssVars } from '../css-vars';
import { glyphOrUnknown } from '../glyphs';
import { Sprite } from '../sprites/Sprite';
import { creatureSpriteOrFallback } from '../sprites/creature-sprites';
import { PACK_ART } from '../sprites/pack-art';
import { GameIcon } from '../ui/GameIcon';
import { Nameplate } from '../ui/Nameplate';
import { UpArrow } from './parts';
import { trayBadge, type TrayBadge, type TrayInput } from './tray-state';

/** The mark on a creature: one shape per state; nothing for a free one. */
function Mark({ badge }: { badge: TrayBadge }) {
  switch (badge.state) {
    case 'loot':
      return (
        <span class="vy-mark vy-mark-say">
          <Sprite sprite={glyphOrUnknown('satchel')} scale={2} />
        </span>
      );
    case 'ready':
      return (
        <span class="vy-mark vy-mark-say">
          <span class="vy-bang pix">!</span>
        </span>
      );
    case 'evolve':
      return (
        <span class="vy-mark vy-mark-say">
          <UpArrow />
        </span>
      );
    case 'job':
    case 'smithing':
      return (
        <span class="vy-mark">
          <Sprite sprite={glyphOrUnknown('anvil')} scale={2} />
        </span>
      );
    case 'scouting':
    case 'trip': {
      const element = expeditionContent.destinations.find(
        (d) => d.id === badge.destination,
      )?.element;
      return element == null ? null : (
        <span class="vy-mark">
          <GameIcon icon={{ kind: 'element', element }} scale={2} />
        </span>
      );
    }
    case 'trading':
      return (
        <span class="vy-mark">
          <Sprite sprite={glyphOrUnknown('gem')} scale={2} />
        </span>
      );
    case 'helping':
      return (
        <span class="vy-mark">
          <Sprite sprite={glyphOrUnknown('hand')} scale={2} />
        </span>
      );
    case 'studying':
      return (
        <span class="vy-mark">
          <Sprite sprite={glyphOrUnknown('journal')} scale={2} />
        </span>
      );
    case 'resting':
      return (
        <span class="vy-mark">
          <span class="vy-zz pix" aria-hidden="true">
            z
          </span>
        </span>
      );
    case 'free':
      return null;
  }
}

/**
 * A screen's own mark on a tray creature, in place of the valley's (`marks` of the `Tray`): the raid's "on the board" and "out this
 * weekend". `state` is the CSS class suffix (`vy-mon-<state>`), `label` is said to assistive technology, `mark` is the small picture.
 */
export interface TrayMark {
  state: string;
  label: string;
  mark: ComponentChildren;
}

export function TrayCreature({
  creature,
  input,
  index,
  onPick,
  drag,
  mark,
  tapLabel = 'Opens the Paddock.',
}: {
  creature: Creature;
  input: TrayInput;
  index: number;
  onPick: () => void;
  /** Given: the creature can be picked up (the Signpost lets a hand carry it to a seat). */
  drag?: TrayDrag;
  /** The screen's own mark and spoken name; absent: the valley's (`trayBadge`) and "Opens the Paddock.". */
  mark?: TrayMark | undefined;
  /** What a tap does, said after the valley's label (the places where it is not the Paddock say so). */
  tapLabel?: string;
}) {
  const badge = trayBadge(creature, input);
  const sprite = creatureSpriteOrFallback(creature.species);
  const away = mark === undefined && badge.state === 'trip';
  return (
    <button
      type="button"
      class={`vy-mon vy-mon-${mark === undefined ? badge.state : mark.state}`}
      data-creature={creature.id}
      aria-label={mark === undefined ? `${badge.label} ${tapLabel}` : mark.label}
      onClick={(e) => {
        // The click that ends a drag is not a tap.
        if (drag?.consumeClick() === true) {
          e.preventDefault();
          return;
        }
        onPick();
      }}
      {...(drag === undefined
        ? {}
        : {
            onPointerDown: (e: PointerEvent) => {
              drag.startDrag(creature.id, e);
            },
          })}
      ref={cssVars({ '--i': index })}
    >
      <span class="vy-mon-head">
        {mark === undefined ? (
          <Mark badge={badge} />
        ) : (
          mark.mark !== null && <span class="vy-mark vy-mark-say">{mark.mark}</span>
        )}
      </span>
      <span class="vy-mon-body">
        <Sprite
          sprite={sprite}
          scale={3}
          class="vy-mon-sprite"
          {...(away ? { palette: silhouettePalette(sprite) } : {})}
        />
        {away && (
          <span class="vy-mon-pack">
            <Sprite sprite={PACK_ART} scale={2} />
          </span>
        )}
      </span>
      <span class="vy-mon-lv">
        <Nameplate size="sm" level={creature.level} levelPrefix="Lv" />
      </span>
    </button>
  );
}

/** What lets a hand carry a tray creature: `startDrag` and `consumeClick` of `useDragDrop`. */
export interface TrayDrag {
  startDrag: (creatureId: string, event: PointerEvent) => void;
  consumeClick: () => boolean;
}

/** How many creatures stand side by side in a tray `width` CSS px wide (the CSS: 72 px columns, 4 px gaps, 6 px padding). */
export function trayColumnsFit(width: number): number {
  return Math.max(1, Math.floor((width - 12 + 4) / (72 + 4)));
}

export function Tray({
  creatures,
  input,
  onPick,
  label,
  drag,
  marks,
  dropId,
  oneRow = false,
  tapLabel,
}: {
  creatures: readonly Creature[];
  input: TrayInput;
  onPick: (id: string) => void;
  label: string;
  /** Given: each creature can be picked up and carried (what a drop means is the screen's own business). */
  drag?: TrayDrag;
  /** Given: the screen's own mark for each creature (state `free` and a null `mark`: none), in place of the valley's. */
  marks?: (creature: Creature) => TrayMark;
  /** Given: the tray is itself a place to drop a creature (`data-drop-id`, for the screen's hit test). */
  dropId?: string;
  /** Always one row, scrolling sideways behind the arrow when they do not fit (the Cave on a phone, which keeps its scene tall). */
  oneRow?: boolean;
  /** What a tap on a creature does, for the spoken label of the valley's own marks (default: "Opens the Paddock."). */
  tapLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  // One row when every creature fits across (the tray is as tall as its content); two rows, scrolling sideways, when not.
  const [rows, setRows] = useState(oneRow || creatures.length <= 1 ? 1 : 2);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return undefined;
    const fit = (): void => {
      setRows(oneRow || creatures.length <= trayColumnsFit(el.clientWidth) ? 1 : 2);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [creatures.length, oneRow]);
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
    <section class={`vy-tray${more ? ' has-more' : ''}`} aria-label={label} data-drop-id={dropId}>
      <div class="vy-tray-scroll" ref={ref}>
        <div class="vy-tray-grid" data-rows={rows}>
          {creatures.map((c, i) => (
            <TrayCreature
              key={c.id}
              creature={c}
              input={input}
              index={i}
              onPick={() => {
                onPick(c.id);
              }}
              {...(drag === undefined ? {} : { drag })}
              {...(tapLabel === undefined ? {} : { tapLabel })}
              {...(marks === undefined ? {} : { mark: marks(c) })}
            />
          ))}
        </div>
      </div>
      {more && <span class="vy-tray-more" aria-hidden="true" />}
    </section>
  );
}
