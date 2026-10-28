/** The talent report's check lines: how many talents and pools meet Misa's strength targets. */
import { describe, expect, it } from 'vitest';
import { CARDS } from '../src/cards';
import { RAID_SCALE, RAID_SHAPED, type FormMeasure } from '../src/measure';
import {
  PLAIN_TALENTS,
  GOALS,
  checkGoals,
  goalLines,
  judgedPct,
  type Measured,
} from '../src/talentReport';
import { LINE_POOLS, TALENTS, lineRoles } from '../src/talents';
import { content } from '@creatures/game';
import type { Role } from '../src/types';

const cards = CARDS.filter((c) => c.id === 'plain');

/** A measurement of `tid` on `form` that gains `pct` percent of a score of 60 (raid-shaped talents: on the raid row). */
function fake(tid: string, form: string, role: Role, pct: number): Measured {
  const without = 60;
  const gauntlet: FormMeasure = {
    withTalent: new Map([
      ['plain', { score: without * (1 + (RAID_SHAPED.has(tid) ? 0 : pct) / 100), ko: 0 }],
    ]),
    without: new Map([['plain', { score: without, ko: 0 }]]),
    holdsNatural: undefined,
    holdsRow: undefined,
  };
  return {
    tid,
    form,
    line: content.creatures.find((c) => c.id === form)?.line ?? form,
    role,
    gauntlet,
    raid: RAID_SHAPED.has(tid) ? { bestPct: pct / RAID_SCALE, randomPct: 0 } : undefined,
  };
}

/** Every talent of every pool on every form of its roles, gaining `gain(tid, line, role)`. */
function everything(gain: (tid: string, line: string, role: Role) => number): Measured[] {
  const out: Measured[] = [];
  for (const [line, pool] of Object.entries(LINE_POOLS))
    for (const tid of pool)
      for (const c of content.creatures.filter((x) => x.line === line))
        if (TALENTS[tid]?.roles.includes(c.role))
          out.push(fake(tid, c.id, c.role, gain(tid, line, c.role)));
  return out;
}

const rowsOf = (ms: Measured[], bestCard: (m: Measured) => number = () => 0) => {
  const seen = new Map<
    string,
    { role: Role; tid: string; judged: number | undefined; bestCardPct: number }
  >();
  for (const m of ms) {
    const k = `${m.role}/${m.tid}`;
    if (!seen.has(k))
      seen.set(k, {
        role: m.role,
        tid: m.tid,
        judged: judgedPct(
          m.tid,
          ms.filter((x) => x.role === m.role && x.tid === m.tid),
          cards,
        ),
        bestCardPct: bestCard(m),
      });
  }
  return [...seen.values()];
};

describe('judged gain', () => {
  it('is the gauntlet gain, or the raid gain for a raid-shaped talent', () => {
    const plain = fake('first-pounce', 'tidewing', 'setter', 5);
    expect(judgedPct('first-pounce', [plain], cards)).toBeCloseTo(5);
    const raid = fake('edge-walker', 'tidewing', 'setter', 9);
    expect(judgedPct('edge-walker', [raid], cards)).toBeCloseTo(9);
    // The gauntlet side of a raid-shaped talent is not what it is judged on.
    expect(raid.gauntlet.withTalent.get('plain')?.score).toBe(60);
  });
});

describe('checkGoals', () => {
  it('counts a pool short when one talent of a role is far ahead of the rest, and fine when two lead', () => {
    // Every talent gains 2%, except one talent per pool role that gains 12%: the must-pick.
    const lead = new Map<string, string>();
    const must = everything((tid, line, role) => {
      const key = `${line}/${role}`;
      if (!lead.has(key) && TALENTS[tid]?.roles.includes(role)) lead.set(key, tid);
      return lead.get(key) === tid ? 12 : 2;
    });
    const a = checkGoals(must, rowsOf(must), cards);
    expect(a.poolsOk).toBe(0);
    expect(a.failingPools).toHaveLength(Object.keys(LINE_POOLS).length);
    // Two leaders per role: every pool has a pair within 3 points of its best.
    const leaders = new Map<string, string[]>();
    const two = everything((tid, line, role) => {
      const key = `${line}/${role}`;
      if (!TALENTS[tid]?.roles.includes(role)) return 0;
      const l = leaders.get(key) ?? [];
      if (l.length < 2 && !l.includes(tid)) l.push(tid);
      leaders.set(key, l);
      return l.includes(tid) ? 12 : 2;
    });
    const b = checkGoals(two, rowsOf(two), cards);
    expect(b.poolsOk).toBe(b.pools);
    expect(b.failingPools).toEqual([]);
  });

  it('counts the best card cap, the good band and the plain band', () => {
    const ms = everything((tid) => (PLAIN_TALENTS.has(tid) ? 3 : 10));
    const rows = rowsOf(ms, (m) => (m.tid === 'finisher' ? 30 : 15));
    const g = checkGoals(ms, rows, cards);
    expect(g.rows).toBe(rows.length);
    // Every Finisher row is over the cap of 20 (plus one point), the rest under.
    const finishers = rows.filter((r) => r.tid === 'finisher').length;
    expect(finishers).toBeGreaterThan(0);
    expect(g.bestCardOk).toBe(rows.length - finishers);
    expect(g.overCap).toHaveLength(finishers);
    expect(g.overCap[0]).toContain('Finisher');
    // 10% is inside 8..15 for every non-plain row; 3% inside 2..5 for every plain row.
    expect(g.goodOk).toBe(g.goodRows);
    expect(g.plainOk).toBe(g.plainRows);
    expect(g.plainRows).toBeGreaterThan(0);
    // Out of the band: 20% and 0%.
    const high = everything((tid) => (PLAIN_TALENTS.has(tid) ? 0 : 20));
    const h = checkGoals(high, rowsOf(high), cards);
    expect(h.goodOk).toBe(0);
    expect(h.plainOk).toBe(0);
    expect(Object.keys(h.goodByRole).sort()).toEqual(['guard', 'payoff', 'setter', 'support']);
  });

  it('states each target with its count', () => {
    const ms = everything(() => 10);
    const lines = goalLines(checkGoals(ms, rowsOf(ms), cards)).join('\n');
    expect(lines).toContain(`at most +${GOALS.bestCardMax}%`);
    expect(lines).toMatch(/Pools with no must-pick .*: \d+ of 16/);
    expect(lines).toContain('Plain stat talents');
    expect(lineRoles('cindle').length).toBeGreaterThan(0);
  });
});
