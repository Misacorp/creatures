/**
 * When the Cave is a canvas: the valley is on AND the day's dungeon plays by combat v2 AND any run open now started on v2. Both
 * switches are staging-only, so production keeps the page. With a run open it is the run's own rules that count (a v1 run goes on
 * where it began); with none, today's. A finished v1 run's results stay on the page too. Pure.
 */
import type { DungeonToday } from '../dungeon-types';

export function caveCanvasOn(
  valley: boolean,
  today: Pick<DungeonToday, 'rules' | 'active' | 'canRun' | 'last'> | null,
): boolean {
  if (!valley || today === null || today.rules !== 2) return false;
  const open = today.active ?? null;
  if (open !== null && open.status === 'active') return open.rules === 2;
  if (!today.canRun && today.last !== null) return today.last.rules === 2;
  return true;
}
