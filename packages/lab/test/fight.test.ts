import { createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  KEYWORDS,
  KNACKS,
  FORM_KNACKS,
  keywordsIn,
  labBoss,
  fight,
  weekend,
  type BossDef,
  type Placement,
} from '../src';

const at = (formId: string, row: number, col: number, knack?: string, owner = 'p1'): Placement => ({
  owner,
  formId,
  level: 25,
  row,
  col,
  ...(knack ? { knack } : {}),
});
const rng = (s: string) => createSeededRng(s);
const count = (events: readonly { kind: string }[], kind: string) =>
  events.filter((e) => e.kind === kind).length;

describe('combat v2 lab rules', () => {
  it('R1: the target rolls dodge first; a Guard intercepts only a failed dodge, and never rolls', () => {
    // Zipmouse with Zoom dodges a lot; Thornbuck beside it intercepts the rest.
    const boss: BossDef = {
      ...labBoss({ rows: 1, cols: 2, rounds: 10 }),
      plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 10_000 },
    };
    const r = fight(boss, [at('zipmouse', 0, 0, 'zoom'), at('thornbuck', 0, 1)], {
      rng: rng('r1'),
      log: true,
    });
    const dodges = r.events.filter((e) => e.kind === 'dodge');
    const intercepts = count(r.events, 'intercept');
    expect(dodges.length).toBeGreaterThan(0);
    expect(intercepts).toBeGreaterThan(0);
    expect(dodges.every((e) => e.text.startsWith('Zipmouse'))).toBe(true);
    expect(dodges.length + intercepts).toBe(10);
  });

  it('R13: a hit at or below armour is Blocked, and a Setter still marks', () => {
    const boss: BossDef = { ...labBoss({ rows: 1, cols: 1, rounds: 1 }), armour: 10_000, spd: 0 };
    const r = fight(boss, [at('tidewing', 0, 0)], { rng: rng('r13'), log: true });
    expect(r.damage).toBe(0);
    expect(count(r.events, 'blocked')).toBeGreaterThan(0);
    expect(r.events.some((e) => e.kind === 'mark' && e.text.startsWith('tide'))).toBe(true);
  });

  it('R4/R5: without a Setter nothing marks, so nothing reacts', () => {
    const boss: BossDef = { ...labBoss({ rows: 1, cols: 3, rounds: 6 }), spd: 0 };
    const r = fight(
      boss,
      [
        at('kilnmole', 0, 0, 'draw-fire'),
        at('tempestray', 0, 1, 'twin-strike'),
        at('magmole', 0, 2, 'tunnel-through'),
      ],
      { rng: rng('r4'), log: true },
    );
    expect(count(r.events, 'mark')).toBe(0);
    expect(r.reactions).toBe(0);
  });

  it('R5: only a Payoff cashes; a reaction leaves no mark, unless an effect says so (Leave a Trail)', () => {
    const boss: BossDef = { ...labBoss({ rows: 1, cols: 2, rounds: 1 }), spd: 0 };
    const plain = fight(boss, [at('tidewing', 0, 0), at('tempestray', 0, 1, 'twin-strike')], {
      rng: rng('r5'),
      log: true,
    });
    expect(plain.reactions).toBe(1);
    expect(plain.events.filter((e) => e.kind === 'mark').map((e) => e.text)).toEqual(['tide x1']);
    const trail = fight(boss, [at('tidewing', 0, 0), at('tempestray', 0, 1, 'leave-a-trail')], {
      rng: rng('r5'),
      log: true,
    });
    expect(trail.events.filter((e) => e.kind === 'mark').map((e) => e.text)).toEqual([
      'tide x1',
      'spark x1',
    ]);
  });

  it('R3: a mark holds at most 3 stacks', () => {
    const boss: BossDef = { ...labBoss({ rows: 1, cols: 1, rounds: 6 }), spd: 0 };
    const r = fight(boss, [at('tidewing', 0, 0)], { rng: rng('r3'), log: true });
    expect(
      r.events
        .filter((e) => e.kind === 'mark')
        .map((e) => e.text)
        .at(-1),
    ).toBe('tide x3');
  });

  it('R8: the boss takes a turn after each row', () => {
    const boss = labBoss({ rows: 3, cols: 1, rounds: 1 });
    const r = fight(boss, [at('thornbuck', 0, 0), at('kilnmole', 1, 0), at('ohmouse', 2, 0)], {
      rng: rng('r8'),
      log: true,
    });
    const turns = new Set(
      r.events
        .filter((e) => e.kind === 'hit' || e.kind === 'blocked' || e.kind === 'dodge')
        .map((e) => e.turn),
    );
    expect([...turns].sort()).toEqual([0, 1, 2]);
  });

  it('R12: a silenced creature loses its Knack (a silenced taunter no longer draws the plain attack)', () => {
    const boss: BossDef = {
      ...labBoss({ rows: 1, cols: 2, rounds: 2 }),
      spd: 0,
      moves: [
        {
          id: 's',
          name: 'Hush',
          pattern: { anchor: 'front', shape: 'all' },
          powerBp: 0,
          every: 1,
          turn: 0,
          silenceTurns: 3,
        },
      ],
    };
    const r = fight(boss, [at('thornbuck', 0, 0), at('kilnmole', 0, 1, 'draw-fire')], {
      rng: rng('r12'),
      log: true,
    });
    const hits = r.events.filter((e) => e.kind === 'hit' || e.kind === 'blocked');
    expect(hits.every((e) => !e.text.startsWith('Kilnmole'))).toBe(true);
  });

  it('Sunbeam heals the creature in front of it in its column, where a normal Support heals only beside it', () => {
    const boss: BossDef = {
      ...labBoss({ rows: 2, cols: 2, rounds: 2, atk: 150 }),
      spd: 0,
      plain: { pattern: { anchor: 'front', shape: 'all' }, powerBp: 10_000 },
    };
    const line = (k: string) => [
      at('thornbuck', 0, 0),
      at('tidewing', 0, 1),
      at('sunfawn', 1, 0, k),
      at('kilnmole', 1, 1),
    ];
    const hpOf = (k: string) =>
      fight(boss, line(k), { rng: rng('sun') }).fighters.find((f) => f.formId === 'thornbuck')
        ?.hp ?? 0;
    expect(hpOf('sunbeam')).toBeGreaterThan(hpOf('curl-up'));
  });

  it('R14: a raid weekend carries HP between stages and replaces knocked-out creatures from the bench', () => {
    const boss = labBoss({ rows: 1, cols: 3, rounds: 6, atk: 500, hp: 1_000_000 });
    const team = [at('tidewing', 0, 0), at('tempestray', 0, 1), at('thornbuck', 0, 2)];
    const w = weekend(boss, team, [at('kilnmole', 0, 0, 'draw-fire')], { rng: rng('wk') });
    expect(w.stages.length).toBe(3);
    expect(w.replacements).toBe(1);
    const second = w.stages[1];
    expect(second?.fighters.some((f) => f.formId === 'kilnmole')).toBe(true);
    expect(second?.fighters.every((f) => f.hp <= f.maxHp)).toBe(true);
  });
});

describe('combat v2 lab rules, v0.4 fixes from the first panel', () => {
  const quiet = (b: BossDef): BossDef => ({ ...b, spd: 0, plain: { ...b.plain, powerBp: 0 } });

  it('Overcharge marks on every form that can equip it, a Guard included', () => {
    for (const form of ['zipmouse', 'voltaro', 'ohmouse']) {
      const r = fight(
        quiet(labBoss({ rows: 1, cols: 1, rounds: 1 })),
        [at(form, 0, 0, 'overcharge')],
        { rng: rng('oc'), log: true },
      );
      expect(
        r.events.filter((e) => e.kind === 'mark').map((e) => e.text),
        form,
      ).toEqual(['spark x2']);
    }
  });

  it('R9: Taunt draws every plain attack, whatever its anchor', () => {
    const base = labBoss({ rows: 1, cols: 3, rounds: 3, cards: ['swarm'] });
    const r = fight(
      { ...base, spd: 0 },
      [at('tidewing', 0, 0), at('tempestray', 0, 1), at('kilnmole', 0, 2, 'draw-fire')],
      { rng: rng('taunt'), log: true },
    );
    const struck = r.events.filter(
      (e) => e.kind === 'hit' || e.kind === 'blocked' || e.kind === 'dodge',
    );
    expect(struck.length).toBeGreaterThan(0);
    expect(struck.every((e) => e.text.startsWith('Kilnmole'))).toBe(true);
  });

  it('R5: a reaction on a trail mark leaves no further trail (the chain cap)', () => {
    const boss = quiet(labBoss({ rows: 1, cols: 4, rounds: 1 }));
    const r = fight(
      boss,
      [
        at('tidewing', 0, 0),
        at('tempestray', 0, 1, 'leave-a-trail'),
        at('bloomback', 0, 2, 'leave-a-trail'),
        at('pyrelynx', 0, 3, 'leave-a-trail'),
      ],
      { rng: rng('chain'), log: true },
    );
    // Tide x1 (Setter), then Spark x1 (trail), then Bloomback cashes the trail mark: no Grove trail.
    expect(r.events.filter((e) => e.kind === 'mark').map((e) => e.text)).toEqual([
      'tide x1',
      'spark x1',
    ]);
    expect(r.reactions).toBe(2);
  });

  it('Fizzle: a mark left by a reaction cannot be cashed before the next boss turn', () => {
    const boss = quiet(labBoss({ rows: 1, cols: 3, rounds: 1, cards: ['fizzle'] }));
    const r = fight(
      boss,
      [at('tidewing', 0, 0), at('tempestray', 0, 1, 'leave-a-trail'), at('bloomback', 0, 2)],
      { rng: rng('fz'), log: true },
    );
    expect(r.reactions).toBe(1);
  });

  it('R5: a minimum count is checked before picking the oldest mark (Big Spout)', () => {
    const boss = quiet(labBoss({ rows: 1, cols: 3, rounds: 1 }));
    // Wickat (Ember Setter) leaves Scorched x1: below Big Spout's x2, so no reaction; with Overcharge, x2.
    const r = fight(boss, [at('wickat', 0, 0), at('geyserpup', 0, 1, 'big-spout')], {
      rng: rng('bs'),
      log: true,
    });
    expect(r.reactions).toBe(0);
    const r2 = fight(boss, [at('wickat', 0, 0, 'overcharge'), at('geyserpup', 0, 1, 'big-spout')], {
      rng: rng('bs'),
      log: true,
    });
    expect(r2.reactions).toBe(1);
  });

  it('Clean Scales sheds only the marks that were on the boss when its turn began', () => {
    const boss = quiet(labBoss({ rows: 1, cols: 2, rounds: 2, cards: ['clean-scales'] }));
    const r = fight(boss, [at('tidewing', 0, 0), at('thornbuck', 0, 1)], {
      rng: rng('cs'),
      log: true,
    });
    // Each round Tidewing marks x1 again: the count never grows past 1 because it is shed each boss turn.
    expect(r.events.filter((e) => e.kind === 'mark').map((e) => e.text)).toEqual([
      'tide x1',
      'tide x1',
    ]);
  });

  it("R12: a silenced creature loses its Knack's armour too", () => {
    const hush = {
      id: 's',
      name: 'Hush',
      pattern: { anchor: 'front' as const, shape: 'all' as const },
      powerBp: 0,
      every: 1,
      turn: 0,
      silenceTurns: 3,
    };
    const base = { ...labBoss({ rows: 1, cols: 1, rounds: 2, atk: 40 }), spd: 0 };
    const quietRun = fight(base, [at('kilnmole', 0, 0, 'draw-fire')], { rng: rng('arm') });
    const hushed = fight({ ...base, moves: [hush] }, [at('kilnmole', 0, 0, 'draw-fire')], {
      rng: rng('arm'),
    });
    expect(hushed.fighters[0]?.hp ?? 0).toBeLessThan(quietRun.fighters[0]?.hp ?? 0);
  });
});

describe('silence stops the role (Misa, 2026-10-26)', () => {
  it('a silenced Setter does not mark, and a silenced Guard does not intercept', () => {
    const hushAll = {
      id: 's',
      name: 'Hush',
      pattern: { anchor: 'front' as const, shape: 'all' as const },
      powerBp: 0,
      every: 1,
      turn: 0,
      silenceTurns: 9,
    };
    const boss: BossDef = { ...labBoss({ rows: 1, cols: 2, rounds: 3 }), spd: 0, moves: [hushAll] };
    const r = fight(boss, [at('tidewing', 0, 0), at('thornbuck', 0, 1)], {
      rng: rng('hush'),
      log: true,
    });
    // Round 1: Tidewing marks before the first boss turn silences everyone; after that, nothing.
    expect(r.events.filter((e) => e.kind === 'mark').map((e) => e.text)).toEqual(['tide x1']);
    expect(r.intercepts).toBe(0);
  });
});

describe('the fight log', () => {
  it("tags each event with the row whose turns it follows (the boss's turn after row N is turn N)", () => {
    const boss: BossDef = { ...labBoss({ rows: 3, cols: 1, rounds: 1 }), spd: 0 };
    const r = fight(boss, [at('tidewing', 0, 0), at('voltaro', 1, 0), at('splashet', 2, 0)], {
      rng: rng('rows'),
      log: true,
    });
    expect(r.events.filter((e) => e.kind === 'mark').map((e) => [e.turn, e.text])).toEqual([
      [0, 'tide x1'],
      [1, 'spark x1'],
      [2, 'tide x2'],
    ]);
  });
});

describe('combat v2 content rules', () => {
  it('every keyword used in Knack text exists in the keyword list', () => {
    for (const k of Object.values(KNACKS))
      for (const w of keywordsIn(k.text)) expect(KEYWORDS, `${k.id} uses {${w}}`).toHaveProperty(w);
  });

  it('every Knack a form lists exists, and no two Knacks share a name (same effect, same name)', () => {
    for (const ks of Object.values(FORM_KNACKS))
      for (const id of ks) expect(KNACKS).toHaveProperty(id);
    const names = Object.values(KNACKS).map((k) => k.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every Knack states its design intent', () => {
    for (const k of Object.values(KNACKS)) expect(k.intent.length, k.id).toBeGreaterThan(10);
  });
});
