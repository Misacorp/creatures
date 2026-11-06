/**
 * The valley itself: one pixel canvas (decoration, hidden from screen readers) at scale 2, with more world
 * drawn round it on a big window, the places as real buttons laid over it in reading order, your creatures at
 * home wandering the paddock, and on a phone the edge chips to places out of view. Built like `WorldMap.tsx`:
 * a decorative canvas and a `<ul>` of positioned buttons; a mouse drags it sideways (`useDragScroll`), a
 * finger swipes, Left and Right walk the places.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Creature } from '../api';
import { cssVars } from '../css-vars';
import { usePrefersReducedMotion } from '../hooks';
import { Nameplate } from '../ui/Nameplate';
import { nextMarker } from '../map-view';
import { scrollBehavior } from '../scroll-to';
import { useDragScroll } from '../ui/use-drag-scroll';
import { paint } from './paint';
import { At, CreatureSprite, Glyph, SpeechBubble, isStill, useSize, useTick } from './parts';
import { bubbleAt, placeSpoken, type PlaceBubble } from './place-state';
import {
  MAX_WANDERERS,
  PADDOCK_ROAM,
  TILE,
  placeOf,
  valleyDrawing,
  type PlaceId,
} from './valley-art';
import { DEFAULT_LOOK, type ValleyLook } from './valley-places';
import { useRoamers } from './use-roamers';
import {
  edgeArrows,
  fitValley,
  freeTabs,
  readingOrder,
  scrollToPlace,
  startScroll,
} from './valley-logic';

/** Walkers step 8 times a second. */
const TICK_MS = 125;

export interface ValleyMapProps {
  /** The creatures at home: they wander the paddock. */
  creatures: readonly Creature[];
  /** Where a panning valley starts: the middle, or centred on a place. */
  at: 'start' | PlaceId;
  /** Goes into a place. */
  onPlace: (id: PlaceId) => void;
  /** Set when the map comes back from a place's page: the focus rests on the map (no ring), not on that place's button. */
  focus: PlaceId | null;
  /** What waits at the places (from today's pips): a bubble over each, and a mark on its edge chip. */
  bubbles?: readonly PlaceBubble[];
  /** The visitor's stall and the bonfire's level (the stall open, level 1 when not given). */
  look?: ValleyLook;
}

export function ValleyMap({
  creatures,
  at,
  onPlace,
  focus,
  bubbles = [],
  look = DEFAULT_LOOK,
}: ValleyMapProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useSize(wrapRef);
  const fit = fitValley(size.width, size.height);
  const s = fit.scale;
  const reduced = usePrefersReducedMotion();
  const moving = !reduced && !isStill();
  const tick = useTick(TICK_MS, moving);
  useDragScroll(scrollerRef);

  const { visitorHere, bonfireLevel } = look;
  const drawing = useMemo(
    () => valleyDrawing(fit.margin, 0, { visitorHere, bonfireLevel }),
    [fit.margin.left, fit.margin.top, visitorHere, bonfireLevel],
  );
  const lakeFrame = moving ? Math.floor(tick / 8) % 2 : 0;
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) paint(ctx, drawing.placements, s);
  }, [drawing, s]);
  useEffect(() => {
    if (lakeFrame === 0 && tick === 0) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    // Redraw only the lake, in the water's next frame.
    const lake = valleyDrawing(fit.margin, lakeFrame, look).placements.filter(
      (p) => p.y >= 19 * TILE + drawing.oy && p.x < 10 * TILE + drawing.ox && p.x >= drawing.ox,
    );
    paint(ctx, lake, s, 0, 0, false);
  }, [lakeFrame]);

  // Start where asked (a phone pans; a desktop sees it all).
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (el !== null && fit.pans) {
      el.scrollLeft = at === 'start' ? startScroll(size.width) : scrollToPlace(at, size.width);
    }
  }, [at, fit.pans, size.width]);

  const [scrollLeft, setScrollLeft] = useScrollLeft(scrollerRef);
  const order = readingOrder();

  // Back from a place's page the focus rests on the map itself, never on the place's button: a ring on the House
  // after Escape "detracts from the experience" (Misa, 2026-11-05). Tab goes on from here into the places.
  // A layout effect: the focus is there in the commit that shows the map, so a later move of the focus (the
  // keyboard walking into a place) is never overwritten by this one running late.
  useLayoutEffect(() => {
    if (focus === null) return;
    wrapRef.current?.focus({ preventScroll: true });
  }, []);

  const goTo = (id: PlaceId): void => {
    const el = scrollerRef.current;
    const button = wrapRef.current?.querySelector<HTMLElement>(`[data-place="${id}"]`);
    button?.focus({ preventScroll: true });
    if (el !== null && fit.pans) {
      el.scrollTo({ left: scrollToPlace(id, size.width), behavior: scrollBehavior() });
    }
  };

  const onArrow = (from: PlaceId, event: KeyboardEvent): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const target = nextMarker(order, from, event.key === 'ArrowRight' ? 1 : -1);
    if (target === null) return;
    event.preventDefault();
    goTo(target as PlaceId);
  };

  // Valley pixels to stage pixels.
  const X = (x: number): number => (x + drawing.ox) * s;
  const Y = (y: number): number => (y + drawing.oy) * s;

  const people = useRoamers(creatures.slice(0, MAX_WANDERERS), tick, moving, PADDOCK_ROAM);

  // An edge chip for every place out of view, stacked so none overlap (the Places list has every place).
  const arrows = fit.pans ? edgeArrows(order, scrollLeft, size.width) : [];
  const needy = new Set<PlaceId>(bubbles.map((b) => b.place));
  const tabY = freeTabs(arrows, scrollLeft, size.width, undefined, undefined, needy, {
    from: -fit.top / s,
    to: (size.height - fit.top) / s,
  });

  const bob = moving ? Math.floor(tick / 5) % 2 : 0;
  const stageVars = cssVars({
    '--w': `${String(drawing.width * s)}px`,
    '--h': `${String(drawing.height * s)}px`,
    '--left': `${String(fit.left)}px`,
    '--top': `${String(fit.top)}px`,
  });

  return (
    <div ref={wrapRef} class={`vy-valley${fit.pans ? ' pans' : ''}`} tabIndex={-1}>
      <div
        class="vy-scroller"
        ref={(el) => {
          scrollerRef.current = el;
        }}
        onScroll={(e) => {
          setScrollLeft((e.currentTarget as HTMLElement).scrollLeft);
        }}
      >
        <div class="vy-stage" ref={stageVars}>
          <canvas
            ref={canvasRef}
            class="vy-canvas"
            width={drawing.width * s}
            height={drawing.height * s}
            aria-hidden="true"
          />
          {people.map((p) => (
            <At key={p.key} x={X(p.x)} y={Y(p.y)} class="vy-person" z={p.z}>
              <CreatureSprite creature={p.creature} scale={s} flip={p.flip} />
            </At>
          ))}
          <ul class="vy-places" aria-label="The valley">
            {order.map((id, i) => {
              const place = placeOf(id);
              const bubble = bubbleAt(bubbles, id);
              const r = place.rect;
              return (
                <li key={id}>
                  <button
                    type="button"
                    class={`vy-place vy-place-${id}`}
                    data-place={id}
                    aria-label={placeSpoken(id, bubble)}
                    ref={cssVars({
                      '--x': `${String(X(r.x))}px`,
                      '--y': `${String(Y(r.y))}px`,
                      '--pw': `${String(r.width * s)}px`,
                      '--ph': `${String(r.height * s)}px`,
                    })}
                    onClick={() => {
                      onPlace(id);
                    }}
                    onKeyDown={(e) => {
                      onArrow(id, e);
                    }}
                  >
                    {bubble !== undefined && (
                      <SpeechBubble
                        glyph={bubble.glyph}
                        count={bubble.count}
                        class={(bob + i) % 2 === 1 ? 'up' : undefined}
                      />
                    )}
                    <span class="vy-place-plate" aria-hidden="true">
                      <Nameplate bold>{place.name}</Nameplate>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      {arrows
        .filter((a) => tabY.has(a.place))
        .map((a) => {
          const place = placeOf(a.place);
          const bubble = bubbleAt(bubbles, a.place);
          return (
            <button
              key={a.place}
              type="button"
              class={`vy-edge vy-edge-${a.side}${bubble === undefined ? '' : ' needs'}`}
              aria-label={`${placeSpoken(a.place, bubble)}. Off screen, to the ${a.side === 'left' ? 'west' : 'east'}`}
              ref={cssVars({ '--ey': `${String(Y(tabY.get(a.place) ?? a.y) + fit.top)}px` })}
              onClick={() => {
                goTo(a.place);
              }}
            >
              {/* The button is the 44 px target; the drawn chip is the smaller flag inside it. */}
              <span class="vy-edge-chip" aria-hidden="true">
                <span class="vy-edge-head" />
                <Glyph id={place.glyph} scale={2} />
                {bubble !== undefined && (
                  <span class="vy-edge-bang pix">{bubble.count ?? '!'}</span>
                )}
              </span>
            </button>
          );
        })}
    </div>
  );
}

/** The scroller's left edge, kept in state for the edge chips. */
function useScrollLeft(ref: { current: HTMLElement | null }): [number, (n: number) => void] {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (el !== null) setLeft(el.scrollLeft);
  });
  return [left, setLeft];
}
