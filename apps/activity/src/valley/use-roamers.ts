/**
 * Creatures wandering inside an area (the valley map's paddock and the Paddock's scene): seeded waypoints from
 * the creature's id, one pixel a tick, a hop on every other step, resting at each waypoint. No `Math.random`;
 * the same creature wanders the same way. The caller drives the tick (`useTick`) and passes `moving` false for
 * reduced motion, where they stand still.
 */
import { createSeededRng, type Rng } from '@creatures/game';
import { useRef } from 'preact/hooks';
import type { Creature } from '../api';
import type { Rect } from './valley-art';
import { hopOf, newWalker, stepWalker, type Walker } from './valley-logic';

export interface Person<C extends Pick<Creature, 'id' | 'species' | 'shiny'> = Creature> {
  key: string;
  creature: C;
  x: number;
  y: number;
  flip: boolean;
}

/** The creatures (already capped by the caller) wander inside `area`; positions are in the area's own coordinates. */
export function useRoamers<C extends Pick<Creature, 'id' | 'species' | 'shiny'>>(
  creatures: readonly C[],
  tick: number,
  moving: boolean,
  area: Rect,
): Person<C>[] {
  const walkers = useRef(new Map<string, { w: Walker; rng: Rng }>());
  const lastTick = useRef(0);
  const out: Person<C>[] = [];
  const steps = moving ? tick - lastTick.current : 0;
  lastTick.current = tick;
  for (const [i, c] of creatures.entries()) {
    let entry = walkers.current.get(c.id);
    if (entry === undefined) {
      const rng = createSeededRng(`valley-${c.id}`);
      entry = { w: newWalker(rng, area, { index: i, of: creatures.length }), rng };
      walkers.current.set(c.id, entry);
    }
    for (let n = 0; n < steps; n++) entry.w = stepWalker(entry.w, entry.rng, area);
    out.push({
      key: c.id,
      creature: c,
      x: entry.w.x,
      y: entry.w.y - hopOf(entry.w),
      flip: entry.w.flip,
    });
  }
  return out;
}
