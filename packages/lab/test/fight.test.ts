import { content, createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  KEYWORDS,
  KNACKS,
  FORM_KNACKS,
  keywordsIn,
  ADDITIVE_FIELDS,
  LAB_RULES,
  LINE_POOLS,
  OWN_KNACKS,
  knacksOf,
  lineRoles,
  FAMILIES,
  TALENTS,
  TALENT_LINES,
  labBoss,
  fight,
  mergeFx,
  talentPool,
  weekend,
  type BossDef,
  type KnackFx,
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
const hush = (shape: 'all' | 'rowEnds', turns = 9) => ({
  id: 's',
  name: 'Hush',
  pattern: { anchor: 'front' as const, shape },
  powerBp: 0,
  every: 1,
  turn: 0,
  silenceTurns: turns,
});
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

  it('Double Mark marks x2 on the Setters that can equip it', () => {
    for (const form of ['zipmouse', 'voltaro']) {
      const r = fight(
        quiet(labBoss({ rows: 1, cols: 1, rounds: 1 })),
        [at(form, 0, 0, 'double-mark')],
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

  it('R5: a minimum count is checked before picking the oldest mark (All at Once)', () => {
    const boss = quiet(labBoss({ rows: 1, cols: 3, rounds: 1 }));
    // Wickat with Double Mark leaves Ember x2: below All at Once's x3, so no reaction; Solmane adds the third.
    const r = fight(
      boss,
      [at('wickat', 0, 0, 'double-mark'), at('geyserpup', 0, 1, 'all-at-once')],
      { rng: rng('bs'), log: true },
    );
    expect(r.reactions).toBe(0);
    const r2 = fight(
      boss,
      [
        at('wickat', 0, 0, 'double-mark'),
        at('solmane', 0, 1),
        at('geyserpup', 0, 2, 'all-at-once'),
      ],
      { rng: rng('bs'), log: true },
    );
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

  it('every Knack belongs to a defined family (P-09)', () => {
    for (const k of Object.values(KNACKS)) expect(FAMILIES, k.id).toHaveProperty(k.family);
  });

  it('every Knack states its design intent', () => {
    for (const k of Object.values(KNACKS)) expect(k.intent.length, k.id).toBeGreaterThan(10);
  });
});

describe('combat v2 lab rules, the remaining species (phase 1, slice 2)', () => {
  it('Lantern Glow: creatures beside it cannot be silenced; it can', () => {
    const boss: BossDef = {
      ...labBoss({ rows: 1, cols: 3, rounds: 2 }),
      spd: 0,
      moves: [hush('all')],
    };
    const r = fight(
      boss,
      [at('tidewing', 0, 0), at('lanternfin', 0, 1, 'lantern-glow'), at('tempestray', 0, 2)],
      { rng: rng('glow'), log: true },
    );
    const silence = r.events.filter((e) => e.kind === 'silence').map((e) => e.text);
    expect(silence).toContain('Lanternfin is silenced');
    expect(silence).toContain('Tidewing shrugs off the silence');
    expect(silence).toContain('Tempestray shrugs off the silence');
  });

  it('Unbothered (a talent) wards its own creature from silence', () => {
    const boss: BossDef = {
      ...labBoss({ rows: 1, cols: 1, rounds: 1 }),
      spd: 0,
      moves: [hush('all')],
    };
    const r = fight(boss, [{ ...at('tidewing', 0, 0), talents: ['unbothered'] }], {
      rng: rng('calm'),
      log: true,
    });
    expect(r.events.filter((e) => e.kind === 'silence').map((e) => e.text)).toEqual([
      'Tidewing shrugs off the silence',
    ]);
  });

  it('Hide in Mist: creatures beside it dodge more', () => {
    const boss: BossDef = {
      ...labBoss({ rows: 1, cols: 2, rounds: 10 }),
      plain: { pattern: { anchor: 'random', shape: 'single' }, powerBp: 2_000, hits: 6 },
    };
    const team = (k?: string) => [at('tempestray', 0, 0), at('fogwyrm', 0, 1, k)];
    const dodges = (k?: string) => {
      let n = 0;
      for (let i = 0; i < 20; i++) {
        const r = fight(boss, team(k), { rng: rng(`mist:${i}`), log: true });
        n += r.events.filter((e) => e.kind === 'dodge' && e.text.startsWith('Tempestray')).length;
      }
      return n;
    };
    expect(dodges('hide-in-mist')).toBeGreaterThan(dodges() * 1.3);
  });

  it('Carry Them: a Payoff intercepts aimed hits for the creature beside it, like a Guard', () => {
    const boss: BossDef = {
      ...labBoss({ rows: 1, cols: 2, rounds: 6 }),
      plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 5_000 },
    };
    const team = (k?: string) => [at('voltaro', 0, 0), at('gaiadrake', 0, 1, k)];
    const without = fight(boss, team(), { rng: rng('carry'), log: true });
    const carried = fight(boss, team('carry-them'), { rng: rng('carry'), log: true });
    expect(without.intercepts).toBe(0);
    expect(carried.intercepts).toBeGreaterThan(0);
    expect(
      carried.events
        .filter((e) => e.kind === 'intercept')
        .every((e) => e.text.startsWith('Gaiadrake')),
    ).toBe(true);
  });

  it("Guard's Shadow and Territorial: a Payoff's bonus depends on who stands beside it or in its row", () => {
    const boss: BossDef = { ...labBoss({ rows: 1, cols: 2, rounds: 4 }), spd: 0 };
    const dmg = (team: Placement[]) => fight(boss, team, { rng: rng('place') }).damage;
    const shadow = dmg([at('kilnmole', 0, 0), at('pyrelynx', 0, 1, 'guards-shadow')]);
    const noShadow = dmg([at('kilnmole', 0, 0), at('pyrelynx', 0, 1)]);
    expect(shadow).toBeGreaterThan(noShadow);
    const alone = dmg([at('kilnmole', 0, 0), at('coralynx', 0, 1, 'territorial')]);
    const crowded = dmg([at('tempestray', 0, 0), at('coralynx', 0, 1, 'territorial')]);
    const plainAlone = dmg([at('kilnmole', 0, 0), at('coralynx', 0, 1)]);
    expect(alone).toBeGreaterThan(plainAlone);
    // With another Payoff in the row, Territorial adds nothing to Coralynx's own hits.
    const crowdedPlain = dmg([at('tempestray', 0, 0), at('coralynx', 0, 1)]);
    expect(crowded).toBe(crowdedPlain);
  });

  it('Drizzle heals the whole row and Starlight boosts it, in place of the Support verb', () => {
    // The boss sweeps the row, so damage is spread (a focused heal wins against one target).
    const boss: BossDef = {
      ...labBoss({ rows: 1, cols: 4, rounds: 6 }),
      spd: 0,
      plain: { pattern: { anchor: 'front', shape: 'row' }, powerBp: 6_000 },
    };
    const team = (form: string, k?: string): Placement[] => [
      at('tidewing', 0, 0),
      at(form, 0, 1, k),
      at('thornbuck', 0, 2),
      at('tempestray', 0, 3),
    ];
    const mean = (team: Placement[], of: (r: ReturnType<typeof fight>) => number) => {
      let n = 0;
      for (let i = 0; i < 20; i++) n += of(fight(boss, team, { rng: rng(`row:${i}`) }));
      return n / 20;
    };
    const hp = (r: ReturnType<typeof fight>) => r.fighters.reduce((a, f) => a + f.hp, 0);
    expect(mean(team('drizzlewt', 'drizzle'), hp)).toBeGreaterThan(mean(team('drizzlewt'), hp));
    // Tempestray stands two places away: only a row-wide boost reaches it.
    const dmg = (r: ReturnType<typeof fight>) => r.damage;
    expect(mean(team('aurorix', 'starlight'), dmg)).toBeGreaterThan(mean(team('aurorix'), dmg));
  });

  it('mergeFx adds numbers and combines flags', () => {
    expect(mergeFx([{ atkBp: 800, seal: true }, { atkBp: 500 }, { ignoreSilence: true }])).toEqual({
      atkBp: 1_300,
      seal: true,
      ignoreSilence: true,
    });
  });
});

describe('combat v2 content rules: Knacks and talents for every species', () => {
  it('every creature form has Knacks', () => {
    for (const c of content.creatures) expect(FORM_KNACKS, c.id).toHaveProperty(c.id);
  });

  it('every talent pool entry exists, and every line has a pool', () => {
    const lines = new Set(content.creatures.map((c) => c.line));
    expect(new Set(TALENT_LINES)).toEqual(lines);
    for (const ln of TALENT_LINES)
      for (const e of talentPool(ln))
        expect(TALENTS, `${ln}: ${e.talent}`).toHaveProperty(e.talent);
  });

  it('talents add only, and never repeat a Knack (P-06)', () => {
    for (const t of Object.values(TALENTS)) {
      for (const key of Object.keys(t.fx))
        expect(ADDITIVE_FIELDS.has(key as keyof KnackFx), `${t.id}: ${key}`).toBe(true);
      const keys = Object.keys(t.fx).sort().join();
      for (const k of Object.values(KNACKS))
        expect(Object.keys(k.fx).sort().join(), `${t.id} repeats ${k.id}`).not.toBe(keys);
    }
  });

  it('talent names are unique, never reuse a Knack name, and their keywords exist', () => {
    const names = [...Object.values(TALENTS), ...Object.values(KNACKS)].map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of Object.values(TALENTS)) {
      expect(t.intent.length, t.id).toBeGreaterThan(10);
      for (const w of keywordsIn(t.text)) expect(KEYWORDS, `${t.id} uses {${w}}`).toHaveProperty(w);
    }
  });
});

describe('panel 2 fixes', () => {
  it('R1.3: a Guard intercepts before a creature that only intercepts through an effect', () => {
    const boss: BossDef = {
      ...labBoss({ rows: 1, cols: 3, rounds: 4 }),
      spd: 0,
      plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 5_000 },
    };
    // Voltaro (Zigzag) taunts; Gaiadrake (Carry Them) and Thornbuck both stand beside it.
    const r = fight(
      boss,
      [at('gaiadrake', 0, 0, 'carry-them'), at('voltaro', 0, 1, 'zigzag'), at('thornbuck', 0, 2)],
      { rng: rng('order'), log: true },
    );
    const by = r.events.filter((e) => e.kind === 'intercept').map((e) => e.text.split(' ')[0]);
    expect(by.length).toBeGreaterThan(0);
    expect(new Set(by)).toEqual(new Set(['Thornbuck']));
  });

  it('Catch Breath heals once, the first time a hit drops it below half', () => {
    const boss: BossDef = {
      ...labBoss({ rows: 1, cols: 1, rounds: 10, atk: 120 }),
      spd: 0,
      plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 10_000 },
    };
    const plain = fight(boss, [at('kilnmole', 0, 0)], { rng: rng('wind') });
    const wind = fight(boss, [{ ...at('kilnmole', 0, 0), talents: ['catch-breath'] }], {
      rng: rng('wind'),
    });
    expect(wind.healed - plain.healed).toBeGreaterThan(0);
    // One heal of the talent's share of max HP, at most (a crit on the heal is not rolled for it).
    expect(wind.healed - plain.healed).toBeLessThanOrEqual(
      Math.ceil(
        ((wind.fighters[0]?.maxHp ?? 0) * (TALENTS['catch-breath']?.fx.secondWindBp ?? 0)) / 10_000,
      ),
    );
  });
});

describe('R11 and line talent pools (Misa, 2026-10-27)', () => {
  it('evolving adds the new form its own Knacks; a role change keeps only the new role', () => {
    // Splashet (Setter) to Tidewing (Setter): it keeps Steady Mark and Lead the Way, and learns more.
    expect(knacksOf('tidewing')).toEqual([
      'steady-mark',
      'lead-the-way',
      'double-mark',
      'circle-round',
    ]);
    // Splashet to Geyserpup (Payoff): only the Payoff's own.
    expect(knacksOf('geyserpup')).toEqual(OWN_KNACKS['geyserpup']);
    for (const c of content.creatures) expect(OWN_KNACKS, c.id).toHaveProperty(c.id);
  });

  it('every line has a pool of 7 talents, at least 3 of them fit each role in the line', () => {
    for (const ln of new Set(content.creatures.map((c) => c.line))) {
      const pool = LINE_POOLS[ln] ?? [];
      expect(pool.length, ln).toBe(7);
      expect(new Set(pool).size, ln).toBe(7);
      for (const role of lineRoles(ln))
        expect(
          pool.filter((t) => TALENTS[t]?.roles.includes(role)).length,
          `${ln} ${role}`,
        ).toBeGreaterThanOrEqual(3);
    }
  });

  it('Stubborn leaves it at two fifths of its max HP once; Hardy raises max HP', () => {
    const boss: BossDef = {
      ...labBoss({ rows: 1, cols: 1, rounds: 1, atk: 2_000 }),
      spd: 0,
      plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 10_000 },
    };
    const held = fight(boss, [{ ...at('tidewing', 0, 0), talents: ['stubborn'] }], {
      rng: rng('hold'),
      log: true,
    });
    expect(held.events.some((e) => e.kind === 'hold-on')).toBe(true);
    expect(held.fighters[0]?.hp).toBe(
      Math.floor(((held.fighters[0]?.maxHp ?? 0) * LAB_RULES.holdOnLeaveBp) / 10_000),
    );
    const hardy = fight(boss, [{ ...at('tidewing', 0, 0), talents: ['hardy'] }], { rng: rng('h') });
    const plain = fight(boss, [at('tidewing', 0, 0)], { rng: rng('h') });
    expect(hardy.fighters[0]?.maxHp).toBe(
      Math.floor(
        ((plain.fighters[0]?.maxHp ?? 0) * (10_000 + (TALENTS['hardy']?.fx.hpBp ?? 0))) / 10_000,
      ),
    );
  });
});
