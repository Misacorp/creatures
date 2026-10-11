import type { BossDef, Gimmick } from '@creatures/game';
import type { Zone } from './types';

/** True if a gimmick fires in `round` (`every: N` fires on rounds N, 2N, 3N, ...). */
export function gimmickDue(g: Gimmick, round: number): boolean {
  return 'every' in g.trigger ? round % g.trigger.every === 0 : true;
}

/**
 * What the boss will do in `round` besides its normal attack, from the content and the round number
 * only. Gimmicks are deterministic per round, so this is the same for every fight of the boss and
 * needs no fight state. Players use it to time Shield Wall and the like one round ahead.
 *
 * `target` says whom the gimmick is aimed at, as far as the content decides it: a zone, the two
 * ends of the row, the creature with the highest Attack (which depends on the row, so the content
 * can only say "the strongest"), or nobody (the reflect gimmick arms a trap for the first reaction).
 */
export type WarningTarget =
  { kind: 'zone'; zone: Zone } | { kind: 'ends' } | { kind: 'strongest' } | { kind: 'reaction' };

export interface BossWarning {
  /** The gimmick's content id. */
  gimmick: string;
  /** The gimmick's display name from the content. */
  name: string;
  /** The gimmick's operation (`hit_zone`, `silence_ends`, ...). */
  op: Gimmick['op'];
  target: WarningTarget;
}

/** The warnings for `round` (1-based). Empty for rounds outside 1..`boss.finaleRounds`. */
export function bossWarnings(boss: BossDef, round: number): BossWarning[] {
  if (!Number.isInteger(round) || round < 1 || round > boss.finaleRounds) return [];
  const out: BossWarning[] = [];
  for (const g of boss.gimmicks) {
    if (!gimmickDue(g, round)) continue;
    const base = { gimmick: g.id, name: g.name, op: g.op };
    switch (g.op) {
      case 'hit_zone':
        out.push({ ...base, target: { kind: 'zone', zone: g.zone } });
        break;
      case 'silence_ends':
        out.push({ ...base, target: { kind: 'ends' } });
        break;
      case 'strike_highest_atk':
        out.push({ ...base, target: { kind: 'strongest' } });
        break;
      case 'reflect_first_reaction':
        out.push({ ...base, target: { kind: 'reaction' } });
        break;
    }
  }
  return out;
}
