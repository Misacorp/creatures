import type { BossDef, Gimmick, SlamAim, SweepRow } from '@creatures/game';
import type { Zone } from './types';

/** True if a gimmick fires in `round` (`every: N` fires on rounds N, 2N, 3N, ...). */
export function gimmickDue(g: Gimmick, round: number): boolean {
  return 'every' in g.trigger ? round % g.trigger.every === 0 : true;
}

/** How many times a gimmick has fired up to and including `round` (0 if it is not due by then). */
export function firingIndex(g: Gimmick, round: number): number {
  return 'every' in g.trigger ? Math.floor(round / g.trigger.every) : round;
}

/**
 * The row a sweep hits in `round`: firing n hits `rows[(n - 1) mod length]` (`all`: every row;
 * `payoffs`: the row with the most living Payoffs, which only the fight knows). The content and the
 * round number name it, so the forecast can say it.
 */
export function sweepRow(rows: readonly SweepRow[], firing: number): Zone | 'all' | 'payoffs' {
  const row = rows[(((firing - 1) % rows.length) + rows.length) % rows.length];
  if (row === undefined) throw new Error('sweep has no rows');
  return row;
}

/**
 * What the boss will do in `round` besides its normal attack, from the content and the round number
 * only. Gimmicks are deterministic per round, so this is the same for every fight of the boss and
 * needs no fight state. Players use it to time Shield Wall and the like one round ahead.
 *
 * `target` says whom the gimmick is aimed at, as far as the content decides it: a zone (a zone hit,
 * or the row a sweep's walk reaches this firing), every row, the two ends of the row, the creature
 * with the highest Attack and how many times it jumps on, random creatures (a barrage: the count
 * depends on who is still up, so it is a range), a slam's aim, a lance's lane rule, a pincer's
 * scope, nobody (the reflect gimmick arms a trap for the first reaction), or a charge: `gathering`
 * in the round before the announcement, `landing` in the round it lands (its victims are marked by
 * the `charge` event, which is fight state, not content).
 */
export type PatternTarget =
  | { kind: 'zone'; zone: Zone }
  | { kind: 'all' }
  /** A sweep of the row with the most living Payoffs (picked when the sweep lands or is announced). */
  | { kind: 'payoffs' }
  | { kind: 'random'; min: number; max: number }
  | { kind: 'slam'; aim: SlamAim }
  | { kind: 'lane'; lane: 'random' | 'strongest' }
  | { kind: 'pincer'; scope: 'rows' | 'row' };

export type WarningTarget =
  | PatternTarget
  | { kind: 'ends' }
  | { kind: 'strongest'; jumps: number }
  | { kind: 'reaction' }
  | { kind: 'charge'; stage: 'gathering' | 'landing'; inner: PatternTarget };

export interface BossWarning {
  /** The gimmick's content id. */
  gimmick: string;
  /** The gimmick's display name from the content. */
  name: string;
  /** The gimmick's operation (`hit_zone`, `silence_ends`, ...). */
  op: Gimmick['op'];
  target: WarningTarget;
}

type Pattern = Extract<Gimmick, { op: 'sweep' | 'barrage' | 'slam' | 'lance' | 'pincer' }>;
type PatternShape = Pattern extends infer P
  ? P extends Gimmick
    ? Omit<P, 'id' | 'name' | 'trigger'>
    : never
  : never;

function patternTarget(p: PatternShape, firing: number): PatternTarget {
  switch (p.op) {
    case 'sweep': {
      const row = sweepRow(p.rows, firing);
      if (row === 'all') return { kind: 'all' };
      return row === 'payoffs' ? { kind: 'payoffs' } : { kind: 'zone', zone: row };
    }
    case 'barrage':
      return { kind: 'random', min: p.shells.min, max: p.shells.max };
    case 'slam':
      return { kind: 'slam', aim: p.aim };
    case 'lance':
      return { kind: 'lane', lane: p.lane };
    case 'pincer':
      return { kind: 'pincer', scope: p.scope };
  }
}

/**
 * The warnings for `round` (1-based). Empty for rounds outside 1..`boss.finaleRounds`. Pass the boss
 * as the week fights it (`bossAtRank`): a move of a higher rank is not in its list.
 */
export function bossWarnings(boss: BossDef, round: number): BossWarning[] {
  if (!Number.isInteger(round) || round < 1 || round > boss.finaleRounds) return [];
  const out: BossWarning[] = [];
  for (const g of boss.gimmicks) {
    const base = { gimmick: g.id, name: g.name, op: g.op };
    if (g.op === 'charge') {
      // Announced at the start of the round before it lands, and only if it lands in time.
      if (gimmickDue(g, round)) {
        out.push({
          ...base,
          target: {
            kind: 'charge',
            stage: 'landing',
            inner: patternTarget(g.then, firingIndex(g, round)),
          },
        });
      } else if (round + 1 <= boss.finaleRounds && gimmickDue(g, round + 1)) {
        out.push({
          ...base,
          target: {
            kind: 'charge',
            stage: 'gathering',
            inner: patternTarget(g.then, firingIndex(g, round + 1)),
          },
        });
      }
      continue;
    }
    if (!gimmickDue(g, round)) continue;
    switch (g.op) {
      case 'hit_zone':
        out.push({ ...base, target: { kind: 'zone', zone: g.zone } });
        break;
      case 'silence_ends':
        out.push({ ...base, target: { kind: 'ends' } });
        break;
      case 'strike_highest_atk':
        out.push({ ...base, target: { kind: 'strongest', jumps: g.jumps ?? 0 } });
        break;
      case 'reflect_first_reaction':
        out.push({ ...base, target: { kind: 'reaction' } });
        break;
      default:
        out.push({ ...base, target: patternTarget(g, firingIndex(g, round)) });
    }
  }
  return out;
}
