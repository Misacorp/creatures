/** Experiment: patch the Colossus's spec in memory for the duration of a measurement. Not for the shipped code. */
import { RAID_SPECS, type RaidBossSpec } from './bosses';
import { SLOT_EXTRA_CARDS } from './track';

export * from './tidalExplore';
export const cardsModule = () => import('./cards');
export const ownModule = () => import('./ownability');
export const trackModule = () => import('./track');
import { KNACKS } from './knacks';

/** Sets numbers of a Knack's effect for the whole process (do it before any fight: effects are memoised). */
export function patchKnack(id: string, fx: Record<string, number>): void {
  const k = KNACKS[id] as unknown as { fx: Record<string, unknown> };
  Object.assign(k.fx, fx);
}

export function withTidal<T>(
  patch: (s: RaidBossSpec) => Partial<RaidBossSpec>,
  fn: () => T,
  extra?: Record<number, readonly string[]>,
): T {
  const arr = RAID_SPECS as RaidBossSpec[];
  const i = arr.findIndex((s) => s.id === 'tidal-colossus');
  const old = arr[i] as RaidBossSpec;
  arr[i] = { ...old, ...patch(old) };
  const table = SLOT_EXTRA_CARDS as Record<number, readonly string[]>;
  const oldExtra = { ...table };
  if (extra) {
    for (const k of Object.keys(table)) delete table[Number(k)];
    Object.assign(table, oldExtra, { 6: undefined }, extra);
    if (table[6] === undefined) delete table[6];
  }
  try {
    return fn();
  } finally {
    arr[i] = old;
    for (const k of Object.keys(table)) delete table[Number(k)];
    Object.assign(table, oldExtra);
  }
}
