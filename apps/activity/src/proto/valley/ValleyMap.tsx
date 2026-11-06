/**
 * The valley itself: one pixel canvas (decoration, hidden from screen readers) at scale 2, with more world
 * drawn round it on a big window, the places as real buttons laid over it in reading order (each with its
 * need's speech bubble), your creatures living in it, and on a phone the edge arrows to needs out of view.
 * Built like `WorldMap.tsx`: a decorative canvas and a `<ul>` of positioned buttons; a mouse drags it
 * sideways (`useDragScroll`), a finger swipes, Left and Right walk the places.
 */
import { createSeededRng, type Rng } from '@creatures/game';
import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Verdict } from './tray-state';
import { bossArt } from '../../art';
import { cssVars } from '../../css-vars';
import { usePrefersReducedMotion } from '../../hooks';
import { nextMarker } from '../../map-view';
import { scrollBehavior } from '../../scroll-to';
import { PACK_ART } from '../../sprites/pack-art';
import { Sprite } from '../../sprites/Sprite';
import { PanHint } from '../../ui/PanHint';
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
  Plate,
  SpeechBubble,
  isStill,
  useSize,
  useTick,
} from './parts';
import {
  ARENA_BOSS,
  ARENA_FANS,
  ARENA_TEAM,
  FORGE_WORKERS,
  HOUSE_DOOR_SPOT,
  PADDOCK_ROAM,
  SIGNPOST_HOME,
  TILE,
  placeOf,
  valleyDrawing,
  type PlaceId,
} from './valley-art';
import { DEFAULT_LOOK, type ValleyLook } from './valley-places';
import {
  bubblesOf,
  edgeArrows,
  freeTabs,
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
  /** A creature is held in the tray: where it can go (lit) and where not (dimmed, with the word). */
  lit?: Readonly<Record<PlaceId, Verdict>> | null;
  /** The haul is open at the signpost: the explorer's sack lies on the road instead (drawn by `overlay`). */
  haulOpen?: boolean;
  /** The bubbles to show instead of the world's needs (the welcome-back popup leaves its markers this way). */
  bubbles?: readonly Bubble[] | undefined;
  /** The light, the visitor's stall and the bonfire's level (day, stall open, level 1 when not given). */
  look?: ValleyLook;
  /** More sprites in the valley (the haul), in valley pixels. */
  overlay?:
    | ((g: { s: number; X: (x: number) => number; Y: (y: number) => number }) => ComponentChildren)
    | undefined;
}

export function ValleyMap({
  world,
  at,
  onPlace,
  focus,
  departing,
  onScroll,
  lit = null,
  haulOpen = false,
  bubbles: shown,
  look = DEFAULT_LOOK,
  overlay,
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

  const { time, visitorHere, bonfireLevel } = look;
  const drawing = useMemo(
    () => valleyDrawing(fit.margin, 0, { time, visitorHere, bonfireLevel }),
    [fit.margin.left, fit.margin.top, time, visitorHere, bonfireLevel],
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

  const bubbles = shown ?? bubblesOf(world);
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

  const people = useResidents(world, departing, tick, moving).map((p) =>
    haulOpen ? { ...p, sack: false } : p,
  );

  // An edge tab for every place out of view (not only those that need you), stacked so none overlap.
  const arrows = edgeArrows(order, scrollLeft, size.width);
  const needy = new Set(bubbles.map((b) => b.place));
  const tabY = freeTabs(arrows, scrollLeft, size.width, undefined, undefined, needy, {
    from: -fit.top / s,
    to: (size.height - fit.top) / s,
  });

  const stageVars = cssVars({
    '--w': `${String(drawing.width * s)}px`,
    '--h': `${String(drawing.height * s)}px`,
    '--left': `${String(fit.left)}px`,
    '--top': `${String(fit.top)}px`,
  });

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
          {/* The live bit drawn over the canvas: the boss in the arena. */}
          <At x={X(ARENA_BOSS.x)} y={Y(ARENA_BOSS.y)} class="pv-boss">
            <Sprite sprite={boss.sprite} scale={s} />
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
          {overlay?.({ s, X, Y })}
          <ul class="pv-places" aria-label="The valley">
            {order.map((id, i) => {
              const place = placeOf(id);
              const bubble = bubbleAt(id);
              const r = place.rect;
              const verdict = lit?.[id] ?? null;
              const state = verdict === null ? '' : verdict.ok ? ' is-lit' : ' is-dim';
              const word = verdict !== null && !verdict.ok ? verdict.word : null;
              return (
                <li key={id}>
                  <button
                    type="button"
                    class={`pv-place pv-place-${id}${state}`}
                    data-place={id}
                    aria-label={`${placeLabel(id, bubble)}${word === null ? '' : `. Not now: ${word}`}`}
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
                    <span class="pv-place-plate" aria-hidden="true">
                      <Plate>{word ?? place.name}</Plate>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <PanHint target={scrollerRef} id="valley-proto" />
      {arrows
        .filter((a) => tabY.has(a.place))
        .map((a) => {
          const bubble = bubbleAt(a.place);
          const place = placeOf(a.place);
          return (
            <button
              key={a.place}
              type="button"
              class={`pv-edge pv-edge-${a.side}${bubble === undefined ? '' : ' needs'}`}
              aria-label={`${placeLabel(a.place, bubble)}. Off screen, to the ${a.side === 'left' ? 'west' : 'east'}`}
              ref={cssVars({ '--ey': `${String(Y(tabY.get(a.place) ?? a.y) + fit.top)}px` })}
              onClick={() => {
                goTo(a.place);
              }}
            >
              <span class="pv-edge-head" aria-hidden="true" />
              <Glyph id={place.glyph} scale={2} />
              {bubble !== undefined && (
                <span class="pv-edge-bang pix" aria-hidden="true">
                  !
                </span>
              )}
            </button>
          );
        })}
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
 * other players' creatures on the grass before the arena, the one setting off on the east road, and every other free
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
        x: SIGNPOST_HOME.x,
        y: SIGNPOST_HOME.y,
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
        x: FORGE_WORKERS[i === 0 ? 0 : 1].x,
        y: FORGE_WORKERS[i === 0 ? 0 : 1].y,
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
      x: HOUSE_DOOR_SPOT.x,
      y: HOUSE_DOOR_SPOT.y,
      flip: true,
      sack: false,
    });
  }
  // The raid's board: front nearest the boss. Three lines of three, facing east.
  const zoneX: Record<string, number> = ARENA_TEAM.zoneX;
  const row = world.raid.party?.row ?? [];
  row.forEach((slot) => {
    if (slot.creature === null) return;
    const inZone = row.filter((r) => r.zone === slot.zone).indexOf(slot);
    out.push({
      key: `raid-${String(slot.slot)}`,
      creature: { species: slot.creature.species, shiny: false },
      x: zoneX[slot.zone] ?? ARENA_TEAM.zoneX.back,
      y: ARENA_TEAM.y + inZone * ARENA_TEAM.rowStep,
      flip: false,
      sack: false,
    });
  });
  // Other players' creatures cheer in front of the arena.
  world.residents.slice(1, 5).forEach((r, i) => {
    if (r.creature === null) return;
    out.push({
      key: `fan-${r.userId}`,
      creature: { species: r.creature.species, shiny: r.creature.shiny },
      x: (ARENA_FANS[i] ?? ARENA_FANS[0]).x,
      y: (ARENA_FANS[i] ?? ARENA_FANS[0]).y,
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
