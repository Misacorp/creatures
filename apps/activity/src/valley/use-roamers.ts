/**
 * Creatures wandering inside an area (the valley map's paddock and the Paddock's scene): seeded waypoints from
 * the creature's id, one pixel a tick, a hop on every other step, resting at each waypoint. No `Math.random`;
 * the same creature wanders the same way. The caller drives the tick (`useTick`) and passes `moving` false for
 * reduced motion, where they stand still. `held` is a creature picked up by hand (`creature-drag.ts`): it stays
 * where it is held and carries on wandering from where it is put down.
 */
import { createSeededRng, type Rng } from '@creatures/game';
import { useRef } from 'preact/hooks';
import type { Creature } from '../api';
import type { Rect } from './valley-art';
import {
  MIN_GAP,
  crowdSlots,
  depthOf,
  hopOf,
  newWalker,
  stepApart,
  type Gap,
  type Walker,
} from './valley-logic';

export interface Person<C extends Pick<Creature, 'id' | 'species' | 'shiny'> = Creature> {
  key: string;
  creature: C;
  x: number;
  y: number;
  flip: boolean;
  /** The draw order (`depthOf`): lower feet in front. */
  z: number;
}

/** The creatures (already capped by the caller) wander inside `area`; positions are in the area's own coordinates. */
export function useRoamers<C extends Pick<Creature, 'id' | 'species' | 'shiny'>>(
  creatures: readonly C[],
  tick: number,
  moving: boolean,
  area: Rect,
  gap: Gap = MIN_GAP,
  held: { id: string; x: number; y: number } | null = null,
): Person<C>[] {
  const walkers = useRef(new Map<string, { w: Walker; rng: Rng }>());
  const lastTick = useRef(0);
  const out: Person<C>[] = [];
  const steps = moving ? tick - lastTick.current : 0;
  lastTick.current = tick;
  const slots = crowdSlots(area, gap);
  for (const [i, c] of creatures.entries()) {
    if (walkers.current.has(c.id)) continue;
    const rng = createSeededRng(`valley-${c.id}`);
    const w = newWalker(rng, area, { index: i, of: creatures.length });
    // Everyone starts on a spot a gap from the others (spread over the spots), not in a heap.
    const slot = slots[Math.floor((i * slots.length) / Math.max(1, creatures.length))];
    walkers.current.set(c.id, { w: slot === undefined ? w : { ...w, x: slot.x, y: slot.y }, rng });
  }
  // A creature held by a hand stands where it is held; let go, it wanders on from there.
  const hold = held === null ? undefined : walkers.current.get(held.id);
  if (held !== null && hold !== undefined) {
    hold.w = { ...hold.w, x: held.x, y: held.y, tx: held.x, ty: held.y, rest: 4, steps: 0 };
  }
  for (let n = 0; n < steps; n++) {
    for (const c of creatures) {
      if (held !== null && c.id === held.id) continue;
      const entry = walkers.current.get(c.id);
      if (entry === undefined) continue;
      const others = creatures
        .filter((o) => o.id !== c.id)
        .flatMap((o) => walkers.current.get(o.id)?.w ?? []);
      entry.w = stepApart(entry.w, entry.rng, area, others, gap);
    }
  }
  for (const c of creatures) {
    const w = walkers.current.get(c.id)?.w;
    if (w === undefined) continue;
    out.push({
      key: c.id,
      creature: c,
      x: w.x,
      y: w.y - hopOf(w),
      flip: w.flip,
      z: depthOf(w.x, w.y),
    });
  }
  return out;
}
