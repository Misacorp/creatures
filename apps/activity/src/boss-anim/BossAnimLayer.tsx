/**
 * Draws a boss move's animation over the fight stage (`frame.ts` says what is on screen at a time; this measures the stage and draws
 * it). Two parts:
 *
 * - `BossAnimFrame`: one frame at a given time `t`. The workbench drives it from a slider, a step button or its own clock.
 * - `BossRunLayer`: what the fight stage mounts. It owns a clock that starts at the run's `startedAt` and draws the frames until the move ends.
 *
 * Both sit inside the stage's overlay and find what they need by looking in the stage (`.stage-boss-art` for the boss's hand,
 * `[data-slot]` for the board's tiles), so nothing is passed down through the stage. Everything is decoration (`aria-hidden`): the
 * board's own flashes and numbers say what happened. Never mounted under reduced motion.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { cssVars } from '../css-vars';
import { Sprite } from '../sprites/Sprite';
import { usePrefersReducedMotion } from '../hooks';
import { frameAt, shakeAt, type Box, type FrameItem, type Geometry } from './frame';
import { resolveLook } from './looks';
import type { AnimPlan, Cell } from './plan';

/** One boss move being played: the plan, whose it is and the clock it runs on. */
export interface BossRun {
  /** The beat the move lands in: a new run is a new key. */
  id: number;
  plan: AnimPlan;
  bossId: string | null;
  element: string | null;
  /** The whole move in real milliseconds (speed and a round's budget already applied). */
  totalMs: number;
  /** `performance.now()` when the move began. */
  startedAt: number;
}

/** Where the boss's hand is on its picture: the lower right, where a held weapon stands. */
const HAND = { x: 0.68, y: 0.62 } as const;

/** Measures the stage the layer is in, as the frame wants it. Null before the stage is on the page. */
function measure(layer: HTMLElement, grid: { rows: number; cols: number }): Geometry | null {
  const stage = layer.closest('.stage');
  if (stage === null) return null;
  const origin = layer.getBoundingClientRect();
  const relative = (r: DOMRect): Box => ({
    x: r.left - origin.left,
    y: r.top - origin.top,
    w: r.width,
    h: r.height,
  });
  const boss = stage.querySelector('.stage-boss-art');
  const bossBox = boss === null ? null : relative(boss.getBoundingClientRect());
  return {
    layer: { w: origin.width, h: origin.height },
    hand:
      bossBox === null
        ? { x: origin.width / 2, y: origin.height / 4 }
        : { x: bossBox.x + bossBox.w * HAND.x, y: bossBox.y + bossBox.h * HAND.y },
    grid,
    cell: (c: Cell): Box | null => {
      const tile = stage.querySelector(`[data-slot="${String(c.col * grid.rows + c.row)}"]`);
      return tile === null ? null : relative(tile.getBoundingClientRect());
    },
  };
}

function Item({ item }: { item: FrameItem }) {
  switch (item.kind) {
    case 'cell':
      return (
        <div
          class={`ba-cell ${item.tone}`}
          ref={cssVars({
            '--x': `${String(item.box.x)}px`,
            '--y': `${String(item.box.y)}px`,
            '--w': `${String(item.box.w)}px`,
            '--h': `${String(item.box.h)}px`,
            '--o': item.opacity,
          })}
        />
      );
    case 'sprite':
      return (
        <div
          class={item.glow === undefined ? 'ba-sprite' : 'ba-sprite weapon'}
          ref={cssVars({
            '--x': `${item.x.toFixed(1)}px`,
            '--y': `${item.y.toFixed(1)}px`,
            '--rot': `${item.rot.toFixed(1)}deg`,
            '--s': item.scale.toFixed(3),
            '--o': item.opacity.toFixed(3),
            ...(item.glow === undefined ? {} : { '--glow': item.glow }),
          })}
        >
          <Sprite sprite={item.asset.sprite} scale={item.asset.scale} />
        </div>
      );
  }
}

interface FrameProps {
  plan: AnimPlan;
  bossId: string | null;
  element: string | null;
  totalMs: number;
  /** Milliseconds into the move. */
  t: number;
  grid: { rows: number; cols: number };
}

/** One frame of a move at `t`. */
export function BossAnimFrame({ plan, bossId, element, totalMs, t, grid }: FrameProps) {
  const layer = useRef<HTMLDivElement>(null);
  const [, mounted] = useState(false);
  useLayoutEffect(() => {
    mounted(true);
  }, []);
  const geom = layer.current === null ? null : measure(layer.current, grid);
  const look = resolveLook(bossId, element, {
    id: plan.moveId,
    shape: plan.shape,
    form: plan.form,
  });
  const items = geom === null ? [] : frameAt(plan, look, geom, totalMs, t);
  // A heavy move rattles the board as it lands (never with reduced motion).
  const reduced = usePrefersReducedMotion();
  const shake = reduced ? { x: 0, y: 0 } : shakeAt(plan, look, totalMs, t);
  useLayoutEffect(() => {
    const board = layer.current?.closest('.stage')?.querySelector<HTMLElement>('.raid-board');
    if (board === null || board === undefined) return undefined;
    board.style.translate =
      shake.x === 0 && shake.y === 0 ? '' : `${String(shake.x)}px ${String(shake.y)}px`;
    return () => {
      board.style.translate = '';
    };
  }, [shake.x, shake.y]);
  return (
    <div class="boss-anim" ref={layer} aria-hidden="true">
      {items.map((item) => (
        <Item key={item.key} item={item} />
      ))}
    </div>
  );
}

/** The layer the fight stage mounts: plays a run from its start, a frame for each screen refresh, and draws nothing once it is over. */
export function BossRunLayer({
  run,
  grid,
}: {
  run: BossRun | null;
  grid: { rows: number; cols: number };
}) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (run === null) return undefined;
    let frame = 0;
    const tick = (): void => {
      const t = performance.now() - run.startedAt;
      setNow(t);
      if (t < run.totalMs) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [run?.id, run?.startedAt]);
  if (run === null) return null;
  const t = performance.now() - run.startedAt;
  void now;
  if (t > run.totalMs) return null;
  return (
    <BossAnimFrame
      key={run.id}
      plan={run.plan}
      bossId={run.bossId}
      element={run.element}
      totalMs={run.totalMs}
      t={t}
      grid={grid}
    />
  );
}
