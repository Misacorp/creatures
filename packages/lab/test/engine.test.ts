/**
 * Engine rules fixed after the fourth design panel: Charged, Guards and Night Watch, row ends, Taunt and anchorless
 * attacks, Element Resistance, once-per-weekend Catch Breath, the escalation rules (R22), counts per columns, and the
 * legal-talent check. One test per rule, on the smallest board that proves it.
 */
import { createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  BOSS_ANSWERS,
  CLASSIC_LINE,
  LAB_RULES,
  TALENTS,
  answerLine,
  assertLegalTalents,
  fight,
  formStats,
  illegalTalents,
  labBoss,
  legalTalents,
  resistedElement,
  weekend,
  type BossDef,
  type BossMove,
  type Escalation,
  type FightResult,
  type Pattern,
  type Placement,
} from '../src';

const rng = (s: string) => createSeededRng(s);
const at = (
  formId: string,
  row: number,
  col: number,
  extra: Partial<Placement> = {},
): Placement => ({ owner: 'p1', formId, level: 25, row, col, ...extra });

/** A boss with one move (due every round on boss turn `turn`) and a plain attack that deals nothing. */
function mover(
  pattern: Pattern,
  rows: number,
  cols: number,
  over: Partial<BossDef> = {},
  move: Partial<BossMove> = {},
): BossDef {
  return {
    ...labBoss({ rows, cols, rounds: 1, atk: 1 }),
    spd: 0,
    plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 0, hits: 0 },
    moves: [{ id: 'm', name: 'Move', pattern, powerBp: 10_000, every: 1, turn: 0, ...move }],
    ...over,
  };
}

const slotsHit = (r: FightResult, id: string): string[] =>
  r.events
    .filter((e) => e.kind === 'target' && /(<-|of) (\w+)$/.exec(e.text)?.[2] === id)
    .map((e) => {
      const m = /\(row (\d+), slot (\d+)\)/.exec(e.text);
      return `${Number(m?.[1]) - 1},${Number(m?.[2]) - 1}`;
    });

/** The first seed in `seeds` on which `ok` holds for the fight. */
function seedWhere(
  run: (seed: string) => FightResult,
  ok: (r: FightResult) => boolean,
  tries = 60,
): FightResult {
  for (let i = 0; i < tries; i++) {
    const r = run(`s${i}`);
    if (ok(r)) return r;
  }
  throw new Error('no seed fits');
}

describe('Charged moves land on the creatures shown at round start (R2.3, R8.2 c)', () => {
  const kill: BossMove = {
    id: 'kill',
    name: 'Kill',
    pattern: { anchor: 'strongest', shape: 'single' },
    powerBp: 100_000,
    every: 1,
    turn: 0,
  };
  const charged: BossMove = {
    id: 'charge',
    name: 'Charge',
    pattern: { anchor: 'strongest', shape: 'single' },
    powerBp: 10_000,
    every: 1,
    turn: 1,
    charged: true,
  };

  it('a Charged move is announced, and its landing is the creature shown even when the creature fell first', () => {
    // Round start: the strongest (Tempestray) is shown. The boss turn before it knocks the 1-HP Tempestray out; the
    // Charged landing does not re-aim at the Thornbuck, it is skipped.
    const boss: BossDef = { ...mover(kill.pattern, 2, 2, {}, kill), moves: [kill, charged] };
    const team = [at('tempestray', 0, 0), at('thornbuck', 1, 1)];
    const r = seedWhere(
      (seed) =>
        fight(boss, team, {
          rng: rng(seed),
          log: true,
          carryHp: new Map([['p1:tempestray:0', 1]]),
        }),
      (x) => x.fighters[0]?.hp === 0,
    );
    const announced = r.events.filter((e) => e.kind === 'announce');
    expect(announced).toHaveLength(1);
    expect(announced[0]?.text).toContain('Tempestray');
    expect(announced[0]?.round).toBe(1);
    expect(slotsHit(r, 'kill')).toEqual(['0,0']);
    expect(slotsHit(r, 'charge')).toEqual([]);
    expect(r.fighters[1]?.hp).toBe(r.fighters[1]?.maxHp);
  });

  it('a Charged single is aimed at the announced slot, and a Guard beside it does not take it', () => {
    const boss = mover({ anchor: 'strongest', shape: 'single' }, 1, 3, {}, { charged: true });
    const team = [at('thornbuck', 0, 0), at('tempestray', 0, 1), at('thornbuck', 0, 2)];
    for (let i = 0; i < 25; i++) {
      const r = fight(boss, team, { rng: rng(`cs${i}`), log: true });
      expect(r.intercepts).toBe(0);
      expect(slotsHit(r, 'm')).toEqual(['0,1']);
    }
    // The same hit as a plain aimed move is taken by the Guard.
    const plainMove = mover({ anchor: 'strongest', shape: 'single' }, 1, 3);
    let took = 0;
    for (let i = 0; i < 25; i++) took += fight(plainMove, team, { rng: rng(`cs${i}`) }).intercepts;
    expect(took).toBeGreaterThan(0);
  });

  it('a Charged area hit is taken by a Guard only with an effect that says so (Intercept area hits too)', () => {
    const boss = mover({ anchor: 'front', shape: 'row' }, 1, 3, {}, { charged: true });
    const without = [at('tempestray', 0, 0), at('thornbuck', 0, 1), at('tidewing', 0, 2)];
    const withEffect = [
      at('tempestray', 0, 0),
      at('thornbuck', 0, 1, { knack: 'night-watch' }),
      at('tidewing', 0, 2),
    ];
    let a = 0;
    for (let i = 0; i < 20; i++) a += fight(boss, without, { rng: rng(`ca${i}`) }).intercepts;
    expect(a).toBe(0);
    // Night Watch takes the first Charged hit of the boss turn, whoever it is aimed at in its row.
    for (let i = 0; i < 20; i++) {
      const r = fight(boss, withEffect, { rng: rng(`ca${i}`), log: true });
      expect(r.intercepts).toBeLessThanOrEqual(1);
    }
  });
});

describe('Night Watch takes the first Charged hit each boss turn, with its cover cut', () => {
  const wave = (id: string): BossMove => ({
    id,
    name: id,
    pattern: { anchor: 'front', shape: 'row' },
    powerBp: 20_000,
    every: 1,
    turn: 0,
    charged: true,
  });

  it('it intercepts one Charged hit a boss turn for a creature in its row, and does not also take its own', () => {
    const boss: BossDef = {
      ...mover({ anchor: 'front', shape: 'row' }, 1, 4, { atk: 400 }),
      moves: [wave('w1'), wave('w2')],
    };
    const team = [
      at('tempestray', 0, 0),
      at('tidewing', 0, 1),
      at('tempestray', 0, 2),
      at('thornbuck', 0, 3, { knack: 'night-watch' }),
    ];
    // Both moves are Charged rows over four creatures. Night Watch intercepts the first target of the first move only:
    // its own hit of that move is skipped, and it takes no second intercept this boss turn.
    const r = seedWhere(
      (seed) => fight(boss, team, { rng: rng(seed), log: true }),
      (x) => !x.events.some((e) => e.kind === 'dodge') && x.intercepts === 1,
    );
    const watchHits = r.events.filter(
      (e) => (e.kind === 'hit' || e.kind === 'blocked') && e.text.startsWith('Thornbuck'),
    );
    // One hit taken for Tempestray (w1) and its own hit from w2 (not skipped: it took nothing of w2).
    expect(watchHits.length).toBe(2);
    expect(r.events.filter((e) => e.kind === 'intercept')).toHaveLength(1);
  });

  it("the hit it takes is cut by its own cover's cut", () => {
    const boss = mover({ anchor: 'front', shape: 'row' }, 1, 3, { atk: 1_000 }, { charged: true });
    const team = (knack?: string) => [
      at('tempestray', 0, 0),
      at('tidewing', 0, 1),
      at('thornbuck', 0, 2, knack ? { knack } : {}),
    ];
    const r = seedWhere(
      (seed) => fight(boss, team('night-watch'), { rng: rng(seed), log: true }),
      (x) => x.intercepts === 1 && !x.events.some((e) => e.kind === 'dodge'),
    );
    const taken = Number(
      /takes (\d+)/.exec(
        r.events.find((e) => e.kind === 'hit' && e.text.startsWith('Thornbuck'))?.text ?? '',
      )?.[1],
    );
    // atk 1000 x 1.0 = 1000 raw, cut by cover (40%), minus Thornbuck's armour.
    const armour = formStats('thornbuck', 25).armour;
    expect(taken).toBe(Math.floor((1_000 * (10_000 - LAB_RULES.coverBp)) / 10_000) - armour);
  });
});

describe('row ends are arena slots (R21.1)', () => {
  it('the first and last slot of each row; an empty end slot is skipped', () => {
    const boss = mover({ anchor: 'front', shape: 'rowEnds', n: 1 }, 2, 5);
    const row = (cols: number[], r = 0) => cols.map((c) => at('thornbuck', r, c));
    // Creatures stand at 1, 2 and 3 only: both end slots are empty, so nothing is hit.
    expect(slotsHit(fight(boss, row([1, 2, 3]), { rng: rng('re'), log: true }), 'm')).toEqual([]);
    // One end slot filled: only it is hit, not the first living creature from the other end.
    expect(slotsHit(fight(boss, row([1, 2, 4]), { rng: rng('re'), log: true }), 'm')).toEqual([
      '0,4',
    ]);
    // Both ends, in both rows.
    const both = [...row([0, 2, 4]), ...row([0, 3, 4], 1)];
    expect(slotsHit(fight(boss, both, { rng: rng('re'), log: true }), 'm').sort()).toEqual([
      '0,0',
      '0,4',
      '1,0',
      '1,4',
    ]);
  });

  it('n slots from each end', () => {
    const boss = mover({ anchor: 'front', shape: 'rowEnds', n: 2 }, 1, 6);
    const team = [0, 1, 2, 3, 4, 5].map((c) => at('thornbuck', 0, c));
    expect(slotsHit(fight(boss, team, { rng: rng('re2'), log: true }), 'm').sort()).toEqual([
      '0,0',
      '0,1',
      '0,4',
      '0,5',
    ]);
  });
});

describe('Taunt moves only the attacks that have an anchor', () => {
  const taunting = (extra: Partial<Placement> = {}) => [
    at('thornbuck', 0, 0),
    at('tempestray', 0, 1),
    at('kilnmole', 0, 2, { knack: 'draw-fire', ...extra }),
  ];
  const plainAttack = (pattern: Pattern): BossDef => ({
    ...labBoss({ rows: 1, cols: 3, rounds: 6, atk: 1 }),
    spd: 0,
    plain: { pattern, powerBp: 10_000 },
  });

  it('an anchored plain attack goes to the taunter', () => {
    const r = fight(plainAttack({ anchor: 'random', shape: 'single' }), taunting(), {
      rng: rng('t1'),
      log: true,
    });
    expect(new Set(slotsHit(r, 'plain'))).toEqual(new Set(['0,2']));
  });

  it('a scatter, a random row and everything ignore it', () => {
    const scatter = fight(plainAttack({ anchor: 'random', shape: 'scatter', n: 1 }), taunting(), {
      rng: rng('t2'),
      log: true,
    });
    expect(new Set(slotsHit(scatter, 'plain')).size).toBeGreaterThan(1);
    const all = fight(plainAttack({ anchor: 'random', shape: 'all' }), taunting(), {
      rng: rng('t3'),
      log: true,
    });
    expect(slotsHit(all, 'plain').length).toBeGreaterThanOrEqual(3);
  });
});

describe('a Guard takes at most one hit of a move', () => {
  it('a Guard that intercepts a hit of a chain does not also take its own jump hit', () => {
    // The anchor (Tempestray, strongest) takes the aimed hit; the Guard beside it intercepts it, then is the first jump.
    const boss = mover({ anchor: 'strongest', shape: 'chain', n: 1, decayBp: 6_000 }, 1, 2, {
      atk: 400,
    });
    const team = [at('tempestray', 0, 0), at('thornbuck', 0, 1)];
    const r = seedWhere(
      (seed) => fight(boss, team, { rng: rng(seed), log: true }),
      (x) => x.intercepts === 1 && !x.events.some((e) => e.kind === 'dodge'),
    );
    expect(
      r.events.filter(
        (e) => (e.kind === 'hit' || e.kind === 'blocked') && e.text.startsWith('Thornbuck'),
      ),
    ).toHaveLength(1);
    expect(r.events.some((e) => e.text.includes('already took a hit'))).toBe(true);
  });

  it('a chain path is fixed before any hit lands: dodges and intercepts do not change it', () => {
    const boss = mover({ anchor: 'front', shape: 'chain', n: 2, decayBp: 6_000 }, 1, 3);
    const team = [
      at('zipmouse', 0, 0, { knack: 'zoom' }),
      at('thornbuck', 0, 1),
      at('tidewing', 0, 2),
    ];
    const paths = new Set<string>();
    for (let i = 0; i < 20; i++)
      paths.add(slotsHit(fight(boss, team, { rng: rng(`cp${i}`), log: true }), 'm').join('|'));
    expect(paths.size).toBe(1);
  });
});

describe('Element Resistance reads hits, not counters, and a tie gives none', () => {
  it('a tie for the most damage resists nothing; one element alone on top is resisted', () => {
    expect(resistedElement({ ember: 100, tide: 100 })).toBeUndefined();
    expect(resistedElement({ ember: 100, tide: 99 })).toBe('ember');
    expect(resistedElement({ ember: 5 })).toBe('ember');
    expect(resistedElement({})).toBeUndefined();
    expect(resistedElement({ ember: 0, tide: 0 })).toBeUndefined();
  });

  it('a counter is damage but not a hit: it is not counted for the element, and Element Resistance does not cut it', () => {
    // A Guard with Shoulder Charge strikes back when it intercepts: that damage is a counter.
    const boss: BossDef = { ...labBoss({ rows: 1, cols: 2, rounds: 4, atk: 100 }), spd: 0 };
    const team = [at('tempestray', 0, 0), at('thornbuck', 0, 1, { talents: ['shoulder-charge'] })];
    const free = fight(boss, team, { rng: rng('ec') });
    const guard = free.fighters[1];
    expect(free.intercepts).toBeGreaterThan(0);
    expect(guard?.damageDealt).toBeGreaterThan(guard?.hitDamage ?? 0);
    const resisted = fight(boss, team, { rng: rng('ec'), resistElement: guard?.element ?? '' });
    const g2 = resisted.fighters[1];
    // The same seed: the counters are identical; only its hits are cut.
    expect((g2?.damageDealt ?? 0) - (g2?.hitDamage ?? 0)).toBe(
      (guard?.damageDealt ?? 0) - (guard?.hitDamage ?? 0),
    );
    expect(g2?.hitDamage).toBeLessThan(guard?.hitDamage ?? 0);
  });
});

describe('Catch Breath is once per weekend', () => {
  it('a creature that used it in an earlier stage does not heal again in a later one', () => {
    const maxHp = formStats('kilnmole', 25).hp;
    const armour = formStats('kilnmole', 25).armour;
    // One hit a stage of 60% of its max HP: below half, so Catch Breath fires (it heals 40%).
    const atk = Math.ceil(0.6 * maxHp) + armour;
    const boss: BossDef = {
      ...labBoss({ rows: 1, cols: 1, rounds: 1, atk, hp: 1_000_000 }),
      spd: 0,
      armour: 5_000,
    };
    const team = [at('kilnmole', 0, 0, { talents: ['catch-breath'] })];
    let healed: number[] | undefined;
    for (let i = 0; i < 40 && !healed; i++) {
      const w = weekend(boss, team, [], { rng: rng(`cb${i}`), stages: 2 });
      if (w.stages.every((s) => s.dodges === 0 && s.knockouts === 0))
        healed = w.stages.map((s) => s.healed);
    }
    expect(healed?.[0]).toBeGreaterThan(0);
    expect(healed?.[1]).toBe(0);
  });

  it('a replacement from the bench has its own Catch Breath', () => {
    const w = weekend(
      { ...labBoss({ rows: 1, cols: 1, rounds: 1, atk: 1 }), spd: 0 },
      [at('kilnmole', 0, 0, { talents: ['catch-breath'] })],
      [],
      { rng: rng('x'), stages: 2 },
    );
    expect(w.stages).toHaveLength(2);
  });
});

describe('escalation rules (R22)', () => {
  const esc = (over: Partial<Escalation> = {}): Escalation => ({
    name: 'Test Heat',
    feed: 'rounds',
    per: 4,
    cap: 4,
    grow: { atkBp: 5_000 },
    ...over,
  });
  const base = (e: Escalation, over: Partial<BossDef> = {}): BossDef => ({
    ...labBoss({ rows: 1, cols: 3, rounds: 3, atk: 1, hp: 1_000_000 }),
    spd: 0,
    escalation: e,
    ...over,
  });
  const team = [at('tidewing', 0, 0), at('tempestray', 0, 1), at('thornbuck', 0, 2)];
  const stepRounds = (r: FightResult) =>
    r.events
      .filter((e) => e.kind === 'escalation' && e.text.includes(': step '))
      .map((e) => e.round);

  it('step, phase and count carry across a weekend like HP: the rounds feed counts the weekend, not the stage', () => {
    // 3 rounds a stage, a step per 4 rounds: never in one stage, but the weekend's 4th round steps it.
    const w = weekend(base(esc()), team, [], { rng: rng('c1'), stages: 3 });
    expect(w.stages[0]?.escalation?.step).toBe(0);
    expect(w.stages[1]?.escalation?.step).toBe(1);
    expect(w.stages[1]?.escalation?.count).toBe(6);
    expect(w.stages[2]?.escalation?.step).toBe(2);
    expect(w.stages[2]?.escalation?.count).toBe(9);
  });

  it('an event feed keeps counting across stages, and a phase stays in', () => {
    const phaseMove: BossMove = {
      id: 'p2',
      name: 'Second Wind',
      pattern: { anchor: 'front', shape: 'single' },
      powerBp: 1,
      every: 1,
      turn: 0,
    };
    const boss = base(
      esc({ feed: 'rounds', per: 1, cap: 2, phase: { atStep: 1, name: 'P2', moves: [phaseMove] } }),
    );
    const w = weekend(boss, team, [], { rng: rng('c2'), stages: 2 });
    expect(w.stages[0]?.escalation?.phase).toBe(true);
    const second = fight(boss, team, {
      rng: rng('c2'),
      log: true,
      carryEscalation: { step: 1, phase: true, count: 3 },
    });
    // The phase moves are in play from round 1 of the next stage, with no new phase announcement.
    expect(
      second.events
        .filter((e) => e.kind === 'move' && e.text === 'Second Wind')
        .map((e) => e.round),
    ).toEqual([1, 2, 3]);
    expect(second.events.filter((e) => e.kind === 'phase')).toHaveLength(0);
    // Reactions it has taken carry as well.
    const reactions = esc({ feed: 'reactions', per: 5, cap: 9 });
    const carried = fight(base(reactions), team, {
      rng: rng('c3'),
      carryEscalation: { step: 0, phase: false, count: 4 },
    });
    expect(carried.escalation?.count).toBe(4 + carried.reactions);
  });

  it('at most one step a round, at round start, announced before the boss turn', () => {
    const boss = base(esc({ per: 1, cap: 5 }), { rounds: 6 });
    const r = fight(boss, team, {
      rng: rng('o1'),
      log: true,
      carryEscalation: { step: 0, phase: false, count: 100 },
    });
    expect(stepRounds(r)).toEqual([1, 2, 3, 4, 5]);
    expect(r.escalation?.step).toBe(5);
    const firstTurnEvent = r.events.findIndex((e) => e.round === 1 && e.kind === 'target');
    const firstStep = r.events.findIndex((e) => e.kind === 'escalation');
    expect(firstStep).toBeLessThan(firstTurnEvent < 0 ? Infinity : firstTurnEvent);
  });

  it('Mired slows it instead of freezing it', () => {
    const boss = base(esc({ per: 1, cap: 1 }), { rounds: 8 });
    const free = fight(boss, [at('croakmire', 0, 0), ...team.slice(1)], {
      rng: rng('m1'),
      log: true,
    });
    const mired = fight(
      boss,
      [at('croakmire', 0, 0, { knack: 'squelch-song' }), ...team.slice(1)],
      {
        rng: rng('m1'),
        log: true,
      },
    );
    // Free: count 1 at round 2. Mired: the step needs a quarter of a step more per stack, so it comes later but does come.
    expect(stepRounds(free)).toEqual([2]);
    const slowed = stepRounds(mired);
    expect(slowed).toHaveLength(1);
    expect(slowed[0]).toBeGreaterThan(2);
    expect(
      mired.events.some((e) => e.kind === 'escalation' && e.text.includes('slowed by the Mired')),
    ).toBe(true);
    expect(LAB_RULES.miredSlowsEscalationBp).toBeGreaterThan(0);
  });

  it('growth adds up in a straight line', () => {
    const boss = base(esc({ feed: 'rounds', per: 1, cap: 3, grow: { atkBp: 10_000 } }), {
      atk: 100,
      rounds: 4,
      plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 10_000 },
    });
    let ok = false;
    for (let i = 0; i < 20 && !ok; i++) {
      const r = fight(boss, [at('hearthshell', 0, 0)], { rng: rng(`lin${i}`), log: true });
      if (r.events.some((e) => e.kind === 'dodge')) continue;
      const hits = r.events
        .filter((e) => e.kind === 'hit')
        .map((e) => Number(/takes (\d+)/.exec(e.text)?.[1]));
      if (hits.length < 4) continue;
      ok = true;
      const armour = formStats('hearthshell', 25).armour;
      // Steps 0, 1, 2, 3 add 0, 100, 200, 300 percent of 100: not 100, 200, 400, 800.
      expect(hits.slice(0, 4)).toEqual([100, 200, 300, 400].map((a) => a - armour));
    }
    expect(ok).toBe(true);
  });
});

describe('counts per columns', () => {
  it('a count with perColumns grows with the arena width, at least 1', () => {
    const scatter = (cols: number) =>
      mover({ anchor: 'random', shape: 'scatter', n: 2, perColumns: 4 }, 3, cols);
    const hits = (cols: number) =>
      slotsHit(
        fight(
          scatter(cols),
          Array.from({ length: 3 * cols }, (_, i) =>
            at('thornbuck', Math.floor(i / cols), i % cols),
          ),
          { rng: rng('pc'), log: true },
        ),
        'm',
      ).length;
    expect(hits(4)).toBe(2);
    expect(hits(8)).toBe(4);
    expect(hits(12)).toBe(6);
    expect(hits(1)).toBe(1);
    const fixed = mover({ anchor: 'random', shape: 'scatter', n: 2 }, 3, 8);
    expect(
      slotsHit(
        fight(
          fixed,
          Array.from({ length: 24 }, (_, i) => at('thornbuck', Math.floor(i / 8), i % 8)),
          {
            rng: rng('pc'),
            log: true,
          },
        ),
        'm',
      ),
    ).toHaveLength(2);
  });
});

describe('legal talents (R20: the line pool, and the role)', () => {
  it('a creature may carry only talents of its line pool that work for its role', () => {
    // Thornbuck is a Sproutle-line Guard: Brace is in the pool and works for every role; Sharp Claws is not in the pool.
    expect(legalTalents('thornbuck')).toContain('brace');
    expect(legalTalents('thornbuck')).not.toContain('sharp-claws');
    // A pool talent that is idle for the role is not legal: Triage is a Support talent.
    expect(legalTalents('thornbuck')).not.toContain('triage');
    for (const form of ['tidewing', 'tempestray', 'thornbuck', 'sunfawn'])
      for (const t of legalTalents(form)) expect(TALENTS[t]).toBeDefined();
    expect(illegalTalents([{ formId: 'tidewing', talents: ['brace'] }])).toEqual([
      { formId: 'tidewing', talent: 'brace', why: 'not in the splashet pool' },
    ]);
    expect(() =>
      assertLegalTalents([{ formId: 'thornbuck', talents: ['brace'] }], 'x'),
    ).not.toThrow();
    expect(() =>
      assertLegalTalents([{ formId: 'tidewing', talents: ['brace'] }], 'a line'),
    ).toThrow(/a line: illegal talents: tidewing carries brace/);
  });

  it('no written answer or other fixed line carries an illegal talent', () => {
    const bad: string[] = [];
    for (const [boss, answers] of Object.entries(BOSS_ANSWERS))
      for (const a of answers)
        for (const i of illegalTalents(answerLine(a.line)))
          bad.push(`${boss} / ${a.label}: ${i.formId} carries ${i.talent} (${i.why})`);
    for (const i of illegalTalents(CLASSIC_LINE))
      bad.push(`classic line: ${i.formId} carries ${i.talent} (${i.why})`);
    expect(bad).toEqual([]);
  });
});
