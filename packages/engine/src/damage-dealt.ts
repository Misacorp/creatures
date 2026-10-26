import type { FightEvent } from './types';

/**
 * The damage each creature really took off the boss, by creature id, from a fight's events: every
 * hit in full (its reaction bonus included, before any credit is shared with the setter or the
 * Supports) plus the extra hits of Echo and Riposte. Together they are the HP the boss lost.
 *
 * This is not `CreatureTotals.damage`, which is the hitter's share of the credit (the setup and
 * support shares moved to other creatures). A creature with no hit is absent.
 */
export function damageDealt(events: readonly FightEvent[]): Record<string, number> {
  const dealt: Record<string, number> = {};
  const add = (creature: string, amount: number): void => {
    if (amount > 0) dealt[creature] = (dealt[creature] ?? 0) + amount;
  };
  for (const e of events) {
    if (e.t === 'hit') add(e.creature, e.damage);
    else if (e.t === 'proc' && (e.kind === 'echo' || e.kind === 'riposte')) {
      add(e.creature, e.amount ?? 0);
    }
  }
  return dealt;
}
