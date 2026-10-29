/**
 * The valley itself: one pixel canvas (decoration, hidden from screen readers) at scale 2, with more world
 * drawn round it on a big window, the places as real buttons laid over it in reading order (each with its
 * need's speech bubble), your creatures living in it, and on a phone the edge arrows to needs out of view.
 * Built like `WorldMap.tsx`: a decorative canvas and a `<ul>` of positioned buttons; a mouse drags it
 * sideways (`useDragScroll`), a finger swipes, Left and Right walk the places.
 */
import { createSeededRng, type Rng } from '@creatures/game';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { bossArt } from '../../art';
import { cssVars } from '../../css-vars';
import { usePrefersReducedMotion } from '../../hooks';
import { nextMarker } from '../../map-view';
import { scrollBehavior } from '../../scroll-to';
import { PACK_ART } from '../../sprites/pack-art';
import { Sprite } from '../../sprites/Sprite';
import { useDragScroll } from '../../ui/use-drag-scroll';
import type { Creature } from '../../api';
import { isFree, type ProtoWorld } from '../world';
import { paint } from './paint';
import {
  At,
  BubbleArt,
  CreatureSprite,
  Glyph,
  Pic,
  SpeechBubble,
  isStill,
  useSize,
  useTick,
} from './parts';
import {
  ARENA_BOSS,
  CHIMNEY_TOP,
  FORGE_FLAME,
  PADDOCK_ROAM,
  SMOKE_FRAMES,
  TILE,
  flameSprite,
  placeOf,
  valleyDrawing,
  type PlaceId,
} from './valley-art';
import {
  bubblesOf,
  edgeArrows,
  fitValley,
  hopOf,
  newWalker,
  placeLabel,
  readingOrder,
  scrollToPlace,
  startScroll,
  stepWalker,
  type Bubble,
  type Walker,
} from './valley-logic';

/** Walkers step 8 times a second. */
const TICK_MS = 125;

export interface Departure {
  creature: Creature;
  /** The tick it set off at. */
  from: number;
}

export interface ValleyMapProps {
  world: ProtoWorld;
  /** Where a panning valley starts: the middle, or centred on a place. */
  at: 'start' | PlaceId;
  /** Goes into (or acts on) a place. */
  onPlace: (id: PlaceId) => void;
  /** The place whose button takes the focus on mount (back from its interior). */
  focus: PlaceId | null;
  /** A creature on its way out along the east road (just sent on a trip). */
  departing: Creature | null;
  /** Reports the scroll, so the view can come back to it. */
  onScroll?: (left: number) => void;
}

export function ValleyMap({ world, at, onPlace, focus, departing, onScroll }: ValleyMapProps) {
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

  const drawing = useMemo(() => valleyDrawing(fit.margin), [fit.margin.left, fit.margin.top]);
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
    const lake = valleyDrawing(fit.margin, lakeFrame).placements.filter(
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

  const bubbles = bubblesOf(world);
  const bubbleAt = (id: PlaceId): Bubble | undefined => bubbles.find((b) => b.place === id);
  const order = readingOrder();

  // Focus a place's button on mount (back from its interior), without a jump.
  useEffect(() => {
    if (focus === null) return;
    wrapRef.current
      ?.querySelector<HTMLElement>(`[data-place="${focus}"]`)
      ?.focus({ preventScroll: true });
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

  const people = useResidents(world, departing, tick, moving);

  const wanted = [...bubbles.map((b) => b.place)];
  const arrows = edgeArrows(wanted, scrollLeft, size.width);
  const house = placeOf('house').rect;
  const houseMid = (house.x + house.width / 2) * s;
  const houseGone =
    fit.pans &&
    !wanted.includes('house') &&
    (houseMid < scrollLeft || houseMid > scrollLeft + size.width);

  const stageVars = cssVars({
    '--w': `${String(drawing.width * s)}px`,
    '--h': `${String(drawing.height * s)}px`,
    '--left': `${String(fit.left)}px`,
    '--top': `${String(fit.top)}px`,
  });

  const smokeFrame = moving ? Math.floor(tick / 5) % 4 : 1;
  const flameFrame = moving ? Math.floor(tick / 2) % 3 : 0;
  const bob = moving ? Math.floor(tick / 5) % 2 : 0;
  const boss = bossArt(world.raid.boss.id);

  return (
    <div ref={wrapRef} class={`pv-valley${fit.pans ? ' pans' : ''}`}>
      <div
        class="pv-scroller"
        ref={(el) => {
          scrollerRef.current = el;
        }}
        onScroll={(e) => {
          const left = (e.currentTarget as HTMLElement).scrollLeft;
          setScrollLeft(left);
          onScroll?.(left);
        }}
      >
        <div class="pv-stage" ref={stageVars}>
          <canvas
            ref={canvasRef}
            class="pv-canvas"
            width={drawing.width * s}
            height={drawing.height * s}
            aria-hidden="true"
          />
          {/* The live bits drawn over the canvas: smoke, the forge fire, the boss in the arena. */}
          {smokeFrame < 3 && (
            <At x={X(CHIMNEY_TOP.x)} y={Y(CHIMNEY_TOP.y - smokeFrame * 3)}>
              <Pic sprite={SMOKE_FRAMES[smokeFrame] ?? SMOKE_FRAMES[0]!} scale={s} />
            </At>
          )}
          <At x={X(FORGE_FLAME.x)} y={Y(FORGE_FLAME.y)}>
            <Pic sprite={flameSprite(flameFrame)} scale={s} />
          </At>
          <At x={X(ARENA_BOSS.x)} y={Y(ARENA_BOSS.y)} class="pv-boss">
            <Sprite sprite={boss.sprite} scale={s * 2} />
          </At>
          {people.map((p) => (
            <At key={p.key} x={X(p.x)} y={Y(p.y)} class="pv-person">
              <CreatureSprite creature={p.creature} scale={s} flip={p.flip} />
              {p.sack && (
                <span class="pv-sack">
                  <Pic sprite={PACK_ART} scale={s} />
                </span>
              )}
            </At>
          ))}
          <ul class="pv-places" aria-label="The valley">
            {order.map((id, i) => {
              const place = placeOf(id);
              const bubble = bubbleAt(id);
              const r = place.rect;
              return (
                <li key={id}>
                  <button
                    type="button"
                    class={`pv-place pv-place-${id}`}
                    data-place={id}
                    aria-label={placeLabel(id, bubble)}
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
                      <SpeechBubble class={(bob + i) % 2 === 1 ? 'up' : undefined}>
                        <BubbleArt bubble={bubble} world={world} />
                      </SpeechBubble>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      {arrows.map((a) => {
        const bubble = bubbleAt(a.place);
        return (
          <button
            key={a.place}
            type="button"
            class={`pv-edge pv-edge-${a.side}`}
            aria-label={`${placeLabel(a.place, bubble)}. Off screen, to the ${a.side === 'left' ? 'west' : 'east'}`}
            ref={cssVars({ '--ey': `${String(Y(a.y) + fit.top)}px` })}
            onClick={() => {
              goTo(a.place);
            }}
          >
            <span class="pv-edge-head" aria-hidden="true" />
            <Glyph id={placeOf(a.place).glyph} scale={2} />
          </button>
        );
      })}
      {houseGone && (
        <button
          type="button"
          class={`pv-edge pv-edge-${houseMid < scrollLeft ? 'left' : 'right'} pv-edge-home`}
          aria-label="Home: back to the house"
          ref={cssVars({ '--ey': `${String(Y(house.y + house.height / 2) + fit.top)}px` })}
          onClick={() => {
            goTo('house');
          }}
        >
          <span class="pv-edge-head" aria-hidden="true" />
          <Glyph id="home" scale={2} />
        </button>
      )}
    </div>
  );
}

/** The scroller's left edge, kept in state for the edge arrows. */
function useScrollLeft(ref: { current: HTMLElement | null }): [number, (n: number) => void] {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (el !== null) setLeft(el.scrollLeft);
  });
  return [left, setLeft];
}

interface Person {
  key: string;
  creature: Pick<Creature, 'species' | 'shiny'>;
  x: number;
  y: number;
  flip: boolean;
  sack: boolean;
}

/**
 * Who stands where in the valley: the explorer home under the signpost with its sack, the workers at the
 * forge, the creature that can evolve at the house's door, the raid team in the arena facing the boss, the
 * other players' creatures on the bleachers, the one setting off on the east road, and every other free
 * creature wandering the paddock (seeded waypoints, 1 px a tick).
 */
function useResidents(
  world: ProtoWorld,
  departing: Creature | null,
  tick: number,
  moving: boolean,
): Person[] {
  const walkers = useRef(new Map<string, { w: Walker; rng: Rng }>());
  const lastTick = useRef(0);
  const departTick = useRef<number | null>(null);
  const out: Person[] = [];

  const home = world.trips.filter((t) => t.status === 'active' && t.endsAt <= world.now);
  const homeIds = new Set(home.map((t) => t.creatureId));
  home.slice(0, 1).forEach((t) => {
    const c = world.creatures.find((x) => x.id === t.creatureId);
    if (c !== undefined) {
      out.push({
        key: c.id,
        creature: c,
        x: 28 * TILE + 2,
        y: 16 * TILE + 2,
        flip: false,
        sack: true,
      });
    }
  });
  const working = world.jobs.filter((j) => j.status !== 'claimed');
  working.slice(0, 2).forEach((j, i) => {
    const c = world.creatures.find((x) => x.id === j.creatureId);
    if (c !== undefined) {
      out.push({
        key: c.id,
        creature: c,
        x: i === 0 ? 20 * TILE - 2 : 22 * TILE + 2,
        y: 12 * TILE + 12,
        flip: i === 1,
        sack: false,
      });
    }
  });
  const evolving = world.creatures.find((c) => c.evolution?.available === true && isFree(world, c));
  if (evolving !== undefined) {
    out.push({
      key: evolving.id,
      creature: evolving,
      x: 16 * TILE + 2,
      y: 7 * TILE,
      flip: true,
      sack: false,
    });
  }
  // The raid's board: front nearest the boss. Three lines of three, facing east.
  const zoneX: Record<string, number> = {
    front: 25 * TILE + 8 + 32,
    middle: 25 * TILE + 8 + 16,
    back: 25 * TILE + 8,
  };
  const row = world.raid.party?.row ?? [];
  row.forEach((slot) => {
    if (slot.creature === null) return;
    const inZone = row.filter((r) => r.zone === slot.zone).indexOf(slot);
    out.push({
      key: `raid-${String(slot.slot)}`,
      creature: { species: slot.creature.species, shiny: false },
      x: zoneX[slot.zone] ?? 400,
      y: 4 * TILE + 2 + inZone * 20,
      flip: false,
      sack: false,
    });
  });
  // Other players' creatures cheer on the north bleachers.
  world.residents.slice(1, 5).forEach((r, i) => {
    if (r.creature === null) return;
    out.push({
      key: `fan-${r.userId}`,
      creature: { species: r.creature.species, shiny: r.creature.shiny },
      x: 24 * TILE + 12 + i * 34,
      y: 3 * TILE - 6,
      flip: i % 2 === 1,
      sack: false,
    });
  });
  // The one setting off: down the east road, 1 tile per 120 ms (here a tick is 125 ms, 2 px a tick).
  if (departing !== null) {
    if (departTick.current === null) departTick.current = tick;
    const gone = (tick - departTick.current) * (moving ? 8 : 0);
    const x = 31 * TILE + gone;
    if (x < 38 * TILE) {
      out.push({
        key: `out-${departing.id}`,
        creature: departing,
        x,
        y: 17 * TILE + 2,
        flip: false,
        sack: true,
      });
    }
  } else departTick.current = null;

  // Everyone else free wanders in the paddock.
  const placed = new Set(out.map((p) => p.key));
  const free = world.creatures.filter(
    (c) => isFree(world, c) && !placed.has(c.id) && !homeIds.has(c.id),
  );
  const steps = moving ? tick - lastTick.current : 0;
  lastTick.current = tick;
  for (const [i, c] of free.entries()) {
    let entry = walkers.current.get(c.id);
    if (entry === undefined) {
      const rng = createSeededRng(`valley-${c.id}`);
      entry = { w: newWalker(rng, PADDOCK_ROAM, { index: i, of: free.length }), rng };
      walkers.current.set(c.id, entry);
    }
    for (let i = 0; i < steps; i++) entry.w = stepWalker(entry.w, entry.rng, PADDOCK_ROAM);
    out.push({
      key: c.id,
      creature: c,
      x: entry.w.x,
      y: entry.w.y - hopOf(entry.w),
      flip: entry.w.flip,
      sack: false,
    });
  }
  return out;
}
