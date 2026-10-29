/**
 * The general boss grammar added with the raid bosses and dungeon foes: attack shapes (scatter, chain, columns, rows,
 * cross, checker), anchors (back, weakest), Element Resistance and the boss's escalation (its Store). One test per rule.
 */
import { createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  fight,
  labBoss,
  weekend,
  type BossDef,
  type BossMove,
  type Escalation,
  type Pattern,
  type Placement,
} from '../src';

const at = (
  formId: string,
  row: number,
  col: number,
  extra: Partial<Placement> = {},
): Placement => ({
  owner: 'p1',
  formId,
  level: 25,
  row,
  col,
  ...extra,
});
const rng = (s: string) => createSeededRng(s);

/** A boss whose only move is `pattern`, due every round after the first boss turn; its plain attack deals nothing. */
function mover(pattern: Pattern, rows: number, cols: number, over: Partial<BossDef> = {}): BossDef {
  return {
    ...labBoss({ rows, cols, rounds: 1, atk: 1 }),
    spd: 0,
    plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 0 },
    moves: [{ id: 'm', name: 'Move', pattern, powerBp: 10_000, every: 1, turn: 0 }],
    ...over,
  };
}

/** The slots the test boss's move aimed at, in order, as "row,slot" (0-based). */
function aimed(boss: BossDef, team: readonly Placement[], seed = 'aim'): string[] {
  const r = fight(boss, team, { rng: rng(seed), log: true });
  const all = r.events
    .filter((e) => e.kind === 'target' && e.text.endsWith('<- m'))
    .map((e) => {
      const m = /\(row (\d+), slot (\d+)\)/.exec(e.text);
      return `${Number(m?.[1]) - 1},${Number(m?.[2]) - 1}`;
    });
  return all;
}

const full = (rows: number, cols: number, form = 'thornbuck'): Placement[] =>
  Array.from({ length: rows * cols }, (_, i) => at(form, Math.floor(i / cols), i % cols));

describe('attack shapes and anchors', () => {
  it('scatter hits n different creatures, and all of them when fewer stand', () => {
    const boss = mover({ anchor: 'random', shape: 'scatter', n: 3 }, 2, 3);
    for (const seed of ['a', 'b', 'c', 'd']) {
      const slots = aimed(boss, full(2, 3), seed);
      expect(slots).toHaveLength(3);
      expect(new Set(slots).size).toBe(3);
    }
    expect(aimed(boss, [at('thornbuck', 0, 0), at('thornbuck', 0, 1)])).toHaveLength(2);
  });

  it('scatter is rolled from the RNG: different seeds can pick different slots', () => {
    const boss = mover({ anchor: 'random', shape: 'scatter', n: 2 }, 2, 3);
    const picks = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((s) => aimed(boss, full(2, 3), s).join('|')),
    );
    expect(picks.size).toBeGreaterThan(1);
  });

  it('chain: the anchor is aimed, each jump goes to the strongest unhit creature right next to the last one', () => {
    // A 3x3 arena of Thornbucks (Attack 78) with a Tempestray (190) in the middle and a Bloomback (190) at the back left.
    const team = full(3, 3).map((p) => p);
    const swap = (row: number, col: number, form: string) => {
      const i = team.findIndex((p) => p.row === row && p.col === col);
      team[i] = at(form, row, col);
    };
    swap(1, 1, 'tempestray');
    swap(2, 0, 'bloomback');
    swap(0, 1, 'tidewing');
    const boss = mover({ anchor: 'strongest', shape: 'chain', n: 3, decayBp: 6_000 }, 3, 3);
    const slots = aimed(boss, team);
    // Strongest: the front-most of the two 190s is the Tempestray at (1,1); next to it the strongest unhit is the Tidewing (0,1) (111);
    // next to that, the Thornbucks at (0,0) and (0,2) tie on Attack: the leftmost; then (0,2)... only unhit neighbours of the last count.
    expect(slots[0]).toBe('1,1');
    expect(slots[1]).toBe('0,1');
    expect(slots).toHaveLength(4);
    for (let i = 1; i < slots.length; i++) {
      const [r1, c1] = (slots[i - 1] as string).split(',').map(Number) as [number, number];
      const [r2, c2] = (slots[i] as string).split(',').map(Number) as [number, number];
      expect(Math.abs(r1 - r2) + Math.abs(c1 - c2)).toBe(1);
    }
    expect(new Set(slots).size).toBe(slots.length);
  });

  it('chain: each jump deals decay of the hit before it', () => {
    // A row of Hearthshells (armour 40, 46 Speed): boss Attack 1000 at 10000: 1000 on the anchor, then 600, 360.
    const boss = mover({ anchor: 'front', shape: 'chain', n: 2, decayBp: 6_000 }, 1, 3, {
      atk: 1_000,
    });
    const team = [at('hearthshell', 0, 0), at('hearthshell', 0, 1), at('hearthshell', 0, 2)];
    let found = false;
    for (let i = 0; i < 30 && !found; i++) {
      const r = fight(boss, team, { rng: rng(`chain${i}`), log: true });
      const hits = r.events
        .filter((e) => e.kind === 'hit')
        .map((e) => Number(/takes (\d+)/.exec(e.text)?.[1]));
      // Cover and the Guards' own area cut change the numbers; compare the unreduced chain by armour only through a no-cover form instead.
      if (r.events.some((e) => e.kind === 'dodge' || e.kind === 'intercept') || hits.length < 3)
        continue;
      found = true;
      expect(hits[0]).toBeGreaterThan(hits[1] as number);
      expect(hits[1]).toBeGreaterThan(hits[2] as number);
    }
    expect(found).toBe(true);
  });

  it('columns: n neighbouring columns from the anchor, shifted left to fit at the right edge', () => {
    const boss = mover({ anchor: 'front', shape: 'columns', n: 2 }, 2, 4);
    // The front-most creature stands at column 3: columns 2 and 3 are hit.
    const team = [at('thornbuck', 0, 3), ...full(2, 4).filter((p) => p.row === 1)];
    const cols = new Set(aimed(boss, team).map((s) => Number(s.split(',')[1])));
    expect([...cols].sort()).toEqual([2, 3]);
    const left = new Set(aimed(boss, full(2, 4)).map((s) => Number(s.split(',')[1])));
    expect([...left].sort()).toEqual([0, 1]);
  });

  it('rows: n neighbouring rows from the anchor, shifted forward to fit at the back', () => {
    const boss = mover({ anchor: 'back', shape: 'rows', n: 2 }, 3, 2);
    const rows = new Set(aimed(boss, full(3, 2)).map((s) => Number(s.split(',')[0])));
    expect([...rows].sort()).toEqual([1, 2]);
    const front = mover({ anchor: 'front', shape: 'rows', n: 2 }, 3, 2);
    expect(
      [...new Set(aimed(front, full(3, 2)).map((s) => Number(s.split(',')[0])))].sort(),
    ).toEqual([0, 1]);
  });

  it('cross: the anchor and the creatures right beside it, in front of it and behind it', () => {
    const boss = mover({ anchor: 'strongest', shape: 'cross' }, 3, 3);
    const team = full(3, 3).map((p) => (p.row === 1 && p.col === 1 ? at('tempestray', 1, 1) : p));
    expect(aimed(boss, team).sort()).toEqual(['0,1', '1,0', '1,1', '1,2', '2,1']);
  });

  it('checker: every other slot of the arena, the anchor slot among them', () => {
    const boss = mover({ anchor: 'front', shape: 'checker' }, 2, 3);
    expect(aimed(boss, full(2, 3)).sort()).toEqual(['0,0', '0,2', '1,1']);
  });

  it('back anchors on the back-most creature, weakest on the one with the lowest share of its HP', () => {
    const back = mover({ anchor: 'back', shape: 'single' }, 3, 2);
    expect(aimed(back, full(3, 2))).toEqual(['2,0']);
    const weak = mover({ anchor: 'weakest', shape: 'single' }, 1, 3);
    const team = full(1, 3);
    const hp = new Map<string, number>();
    const probe = fight(weak, team, { rng: rng('probe') });
    const second = probe.fighters[1];
    expect(second).toBeDefined();
    hp.set(second?.uid ?? '', 100);
    const r = fight(weak, team, { rng: rng('w'), log: true, carryHp: hp });
    const targets = r.events
      .filter((e) => e.kind === 'target' && e.text.endsWith('<- m'))
      .map((e) => e.text);
    expect(targets[0]).toContain('slot 2');
  });
});

describe('Element Resistance', () => {
  it('the resisted element deals a quarter less', () => {
    const boss: BossDef = {
      ...labBoss({ rows: 1, cols: 1, rounds: 3, atk: 1 }),
      spd: 0,
      armour: 0,
    };
    const team = [at('kilnmole', 0, 0)];
    const plain = fight(boss, team, { rng: rng('er') }).damage;
    const resisted = fight(boss, team, { rng: rng('er'), resistElement: 'ember' }).damage;
    const other = fight(boss, team, { rng: rng('er'), resistElement: 'tide' }).damage;
    expect(other).toBe(plain);
    expect(resisted).toBeGreaterThan(plain * 0.7);
    expect(resisted).toBeLessThan(plain * 0.8);
  });

  it('a raid weekend resists, from stage 2, the element that dealt the most damage', () => {
    const base: BossDef = {
      ...labBoss({ rows: 1, cols: 2, rounds: 4, atk: 1, hp: 1_000_000 }),
      spd: 0,
      armour: 0,
    };
    const team = [at('kilnmole', 0, 0), at('kilnmole', 0, 1)];
    const free = weekend(base, team, [], { rng: rng('ew'), stages: 2 });
    const adapting = weekend({ ...base, mods: { adaptsElement: true } }, team, [], {
      rng: rng('ew'),
      stages: 2,
    });
    expect(adapting.stages[0]?.damage).toBe(free.stages[0]?.damage);
    expect(adapting.stages[1]?.damage).toBeLessThan((free.stages[1]?.damage ?? 0) * 0.8);
  });
});

describe('escalation (the boss Store)', () => {
  const esc = (over: Partial<Escalation> = {}): Escalation => ({
    name: 'Test Heat',
    feed: 'rounds',
    per: 2,
    cap: 2,
    grow: { atkBp: 5_000 },
    ...over,
  });
  const base = (e: Escalation, over: Partial<BossDef> = {}): BossDef => ({
    ...labBoss({ rows: 1, cols: 3, rounds: 8, atk: 1 }),
    spd: 0,
    escalation: e,
    ...over,
  });
  const team = [at('tidewing', 0, 0), at('tempestray', 0, 1), at('thornbuck', 0, 2)];
  const announced = (events: readonly { kind: string; round: number; text: string }[]) =>
    events.filter((e) => e.kind === 'escalation');

  it('steps and a cap: a step every `per` units, none past the cap; the state shows the count and the next threshold', () => {
    const r = fight(base(esc()), team, { rng: rng('e1'), log: true });
    expect(announced(r.events).map((e) => e.round)).toEqual([3, 5]);
    expect(r.escalation).toMatchObject({ step: 2, cap: 2, nextAt: null, feed: 'rounds' });
    const early = fight(base(esc({ cap: 4 }), { rounds: 4 }), team, { rng: rng('e1') });
    expect(early.escalation).toMatchObject({ step: 1, cap: 4, nextAt: 4 });
  });

  it('announces each step at round start, before the boss turn it applies on', () => {
    const r = fight(base(esc()), team, { rng: rng('e2'), log: true });
    const first = r.events.findIndex((e) => e.kind === 'escalation');
    const sameRound = r.events.findIndex(
      (e) => e.round === 3 && (e.kind === 'target' || e.kind === 'hit'),
    );
    expect(first).toBeGreaterThan(-1);
    expect(first).toBeLessThan(sameRound);
    expect(r.events[first]?.turn).toBe(0);
    expect(r.events[first]?.text).toContain('step 1 of 2');
  });

  it('each step grows the boss: Attack', () => {
    const boss = base(esc({ per: 1, cap: 3, grow: { atkBp: 10_000 } }), {
      atk: 100,
      rounds: 4,
      plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 10_000 },
    });
    let ok = false;
    for (let i = 0; i < 20 && !ok; i++) {
      const r = fight(boss, [at('hearthshell', 0, 0)], { rng: rng(`atk${i}`), log: true });
      if (r.events.some((e) => e.kind === 'dodge')) continue;
      const hits = r.events
        .filter((e) => e.kind === 'hit')
        .map((e) => Number(/takes (\d+)/.exec(e.text)?.[1]));
      if (hits.length < 3) continue;
      ok = true;
      // Round 1 at step 0, round 2 at step 1 (+100%), round 3 at step 2 (+200%): 100, 200, 300 less armour 40.
      expect(hits.slice(0, 3)).toEqual([60, 160, 260]);
    }
    expect(ok).toBe(true);
  });

  it('each step grows the boss: scatter targets, chain jumps, area, plain hits, armour and dodge', () => {
    const arena = full(3, 4);
    const grow = (g: Escalation['grow'], pattern: Pattern) =>
      aimed(
        base(esc({ per: 1, cap: 1, grow: g }), {
          rows: 3,
          cols: 4,
          rounds: 2,
          moves: [{ id: 'm', name: 'M', pattern, powerBp: 100, every: 2, turn: 0 }],
        }),
        arena,
      );
    // The move is due in round 2, after one step (rounds feed: step 1 at round 2).
    expect(grow({ targets: 2 }, { anchor: 'random', shape: 'scatter', n: 2 })).toHaveLength(4);
    expect(grow({ jumps: 1 }, { anchor: 'front', shape: 'chain', n: 1 })).toHaveLength(3);
    expect(grow({ area: 1 }, { anchor: 'front', shape: 'columns', n: 1 })).toHaveLength(6);
    const hits = (g: Escalation['grow']) =>
      fight(
        base(esc({ per: 1, cap: 1, grow: g }), {
          rounds: 2,
          plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 0, hits: 1 },
        }),
        team,
        { rng: rng('hits'), log: true },
      ).events.filter((e) => e.kind === 'target' && e.text.endsWith('<- plain')).length;
    expect(hits({ hits: 2 })).toBe(1 + 3);
    const dmg = (g: Escalation['grow']) =>
      fight(
        base(esc({ per: 1, cap: 1, grow: g }), { rounds: 3, hp: 5_000, armour: 0 }),
        [at('tidewing', 0, 0)],
        {
          rng: rng('arm'),
        },
      ).damage;
    expect(dmg({ armour: 60 })).toBeLessThan(dmg({}));
    const boss = base(esc({ per: 1, cap: 1, grow: { dodgeBp: 5_000 } }), { rounds: 8 });
    const r = fight(boss, team, { rng: rng('dodge'), log: true });
    expect(r.events.filter((e) => e.kind === 'boss-dodge').length).toBeGreaterThan(0);
  });

  it('feeds: each kind counts what it says', () => {
    const count = (feed: Escalation['feed'], over: Partial<BossDef> = {}, t = team) => {
      const r = fight(base(esc({ feed, per: 1, cap: 99 }), { rounds: 6, ...over }), t, {
        rng: rng(`feed:${feed}`),
        log: true,
      });
      return { r, n: r.escalation?.count ?? -1 };
    };
    // reactions it takes
    const re = count('reactions');
    expect(re.r.reactions).toBeGreaterThan(0);
    expect(re.n).toBe(re.r.reactions);
    // crits it takes (Steady Rhythm: every third hit is a crit)
    const cr = count('crits', {}, [at('tempestray', 0, 0, { talents: ['steady-rhythm'] })]);
    expect(cr.n).toBeGreaterThanOrEqual(2);
    // its dodges
    const dg = count('dodges', { spd: 500 });
    expect(dg.n).toBe(dg.r.events.filter((e) => e.kind === 'boss-dodge').length);
    expect(dg.n).toBeGreaterThan(0);
    // creatures it knocks out
    const ko = count('knockouts', {
      atk: 3_000,
      plain: { pattern: { anchor: 'front', shape: 'row' }, powerBp: 10_000 },
    });
    expect(ko.n).toBe(ko.r.knockouts);
    expect(ko.n).toBeGreaterThan(0);
    // marks it sheds (Clean Scales)
    const sh = count('shed', { mods: { shedMarks: true } }, [
      at('tidewing', 0, 0),
      at('thornbuck', 0, 1),
    ]);
    expect(sh.n).toBeGreaterThan(0);
    // rounds passed
    expect(count('rounds').n).toBe(6);
    // HP lost: bp of its full HP
    const hp = count('hpLost', { hp: 4_000 });
    expect(hp.n).toBe(Math.floor(((4_000 - hp.r.bossHpLeft) * 10_000) / 4_000));
  });

  it('a phase change adds moves from its step on, announced once', () => {
    const phaseMove: BossMove = {
      id: 'p2',
      name: 'Second Wind',
      pattern: { anchor: 'front', shape: 'single' },
      powerBp: 1,
      every: 1,
      turn: 0,
    };
    const boss = base(
      esc({ per: 2, cap: 2, phase: { atStep: 2, name: 'Phase 2', moves: [phaseMove] } }),
      { rounds: 8 },
    );
    const r = fight(boss, team, { rng: rng('ph'), log: true });
    const phase = r.events.filter((e) => e.kind === 'phase');
    expect(phase).toHaveLength(1);
    expect(phase[0]?.round).toBe(5);
    const moves = r.events.filter((e) => e.kind === 'move' && e.text === 'Second Wind');
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((e) => e.round >= 5)).toBe(true);
    expect(r.escalation?.phase).toBe(true);
  });

  it('Mired slows it: the next step needs more units for each Mired stack, so it comes later but is not frozen', () => {
    const e = esc({ per: 1, cap: 3 });
    const mired = fight(
      base(e),
      [at('croakmire', 0, 0, { knack: 'squelch-song' }), ...team.slice(1)],
      {
        rng: rng('drain'),
        log: true,
      },
    );
    const free = fight(base(e), [at('croakmire', 0, 0), ...team.slice(1)], {
      rng: rng('drain'),
      log: true,
    });
    const stepRounds = (r: typeof free) =>
      r.events
        .filter((x) => x.kind === 'escalation' && x.text.includes(': step '))
        .map((x) => x.round);
    // Free: a step in each of rounds 2, 3 and 4. Mired: the steps still come, but later, and some rounds are logged as slowed.
    expect(stepRounds(free)).toEqual([2, 3, 4]);
    expect(mired.escalation?.step).toBeGreaterThan(0);
    expect(stepRounds(mired).at(-1)).toBeGreaterThan(4);
    expect(
      mired.events.some((x) => x.kind === 'escalation' && x.text.includes('slowed by the Mired')),
    ).toBe(true);
  });

  it('a boss without an escalation has no state', () => {
    expect(
      fight(labBoss({ rows: 1, cols: 1, rounds: 1 }), [at('tidewing', 0, 0)], { rng: rng('n') })
        .escalation,
    ).toBeNull();
  });
});
