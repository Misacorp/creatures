/**
 * Combat v2: the raid weekend (R14, R24): attrition and replacements, what carries from stage to stage and what starts fresh, Catch
 * Breath and Refuse to Fall once per weekend, Adapts (Reaction Resistance) and Element Resistance, damage potential (the boss that cannot
 * die, with its shadow HP) and Determination. Creatures and boss are built by hand with their effects named directly. These were the
 * lab's `fight`, `engine`, `strength`, `potential` and `fightLiving` rule tests.
 */
import { createSeededRng } from '@creatures/game';
import { resistedElement, type FightEvent } from '@creatures/engine/v2';
import { describe, expect, it } from 'vitest';
import {
  boss,
  by,
  count,
  mired,
  marks,
  member,
  play,
  playWeekend,
  seeded,
  spec,
  striker,
  texts,
  type SpecOver,
} from './v2-helpers';

const crew = (...over: SpecOver[]) => over.map((o) => member(o));
/** What a stage's creature named `name` ended with. */
const ended = (stage: ReturnType<typeof playWeekend>['stages'][number], name: string) =>
  by(stage, name);

describe('attrition and carried state (R14)', () => {
  it('a raid weekend carries HP between stages and replaces knocked-out creatures from the bench', () => {
    const arena = striker({ cols: 3, rounds: 6, atk: 500 });
    const team = crew(
      { name: 'A' },
      { name: 'B', col: 1, role: 'payoff', element: 'spark' },
      { name: 'C', col: 2, role: 'guard' },
    );
    const w = playWeekend(arena, team, crew({ name: 'Kiln', role: 'guard', maxHp: 1_000 }), {
      stages: 3,
    });
    expect(w.stages).toHaveLength(3);
    expect(w.replacements).toBe(1);
    // The boss knocks out one creature a round: all three fall in stage 1, and only the first slot is filled from the bench.
    expect(w.stages[0]?.knockouts).toBe(3);
    expect(w.stages[1]?.fighters.map((f) => f.formId)).toEqual(['kiln']);
    expect(w.stages[1]?.fighters.every((f) => f.hp <= f.maxHp)).toBe(true);
  });

  it('HP carries from stage to stage, and nobody heals between them', () => {
    const w = playWeekend(striker({ rounds: 3, atk: 100 }), crew({ name: 'A', maxHp: 1_000 }), [], {
      stages: 3,
    });
    expect(w.stages.map((s) => ended(s, 'A').hp)).toEqual([700, 400, 100]);
  });

  it('marks, Mired and each-fight effects start fresh each stage; a knocked-out creature of an owner is replaced by that owner only', () => {
    const team = crew({ name: 'S', fx: { miresAtStart: true, firstHitBp: 5_000 } });
    const w = playWeekend(boss({ rounds: 2 }), team, [], { stages: 2 });
    for (const stage of w.stages) {
      expect(marks(stage)).toEqual(['tide x1', 'tide x2']);
      expect(mired(stage)).toEqual(['Mired x1', 'Mired x2', 'Mired x1']);
      expect(by(stage, 'S').fires['firstHitBp']).toBe(1);
    }
    const owners = playWeekend(
      striker({ cols: 2, rounds: 1, atk: 5_000 }),
      crew({ name: 'A', owner: 'p1' }, { name: 'B', owner: 'p2', col: 1 }),
      crew({ name: 'Mine', owner: 'p2' }),
      { stages: 1 },
    );
    // The boss knocks out A (owner p1) in the only stage: p1 has no bench creature, and p2's does not step in for it.
    expect(owners.replacements).toBe(0);
  });

  it('the round count restarts each stage', () => {
    const w = playWeekend(boss({ rounds: 3 }), crew({ name: 'A' }), [], { stages: 3 });
    expect(w.stages).toHaveLength(3);
    for (const st of w.stages)
      expect([...new Set(st.events.map((e) => e.round))]).toEqual([1, 2, 3]);
  });
});

describe('Catch Breath and Refuse to Fall are once per weekend', () => {
  it('Catch Breath: a creature that used it in an earlier stage does not heal again in a later one', () => {
    // One hit a stage of 60% of its max HP: below half, so it fires the first time (it heals 40%).
    const w = playWeekend(
      striker({ rounds: 1, atk: 240 }),
      crew({ name: 'A', fx: { secondWindBp: 4_000 } }),
      [],
      { stages: 2 },
    );
    expect(w.stages.map((s) => s.healed)).toEqual([160, 0]);
  });

  it('a replacement from the bench has its own Catch Breath', () => {
    const wind = { secondWindBp: 4_000 };
    // Stage 1 knocks the frail first creature out; the replacement (1000 HP) takes 600, falls below half and heals 400.
    const w = playWeekend(
      striker({ rounds: 1, atk: 600 }),
      crew({ name: 'A', fx: wind }),
      crew({ name: 'Bench', maxHp: 1_000, fx: wind }),
      { stages: 2 },
    );
    expect(w.replacements).toBe(1);
    expect(w.stages.map((s) => s.healed)).toEqual([0, 400]);
  });

  it('Refuse to Fall holds on in one stage only: a later stage knocks it out', () => {
    // Each stage's hit is far more than its max HP.
    const w = playWeekend(
      striker({ rounds: 1, atk: 2_000 }),
      crew({ name: 'A', fx: { holdOn: true } }),
      [],
      { stages: 2 },
    );
    expect(w.stages.map((s) => count(s, 'hold-on'))).toEqual([1, 0]);
    expect(w.stages.map((s) => s.knockouts)).toEqual([0, 1]);
  });
});

describe('Adapts (Reaction Resistance) and Element Resistance', () => {
  it('Element Resistance: a tie for the most damage resists nothing; one element alone on top is resisted', () => {
    expect(resistedElement({ ember: 100, tide: 100 })).toBeUndefined();
    expect(resistedElement({ ember: 100, tide: 99 })).toBe('ember');
    expect(resistedElement({ ember: 5 })).toBe('ember');
    expect(resistedElement({})).toBeUndefined();
    expect(resistedElement({ ember: 0, tide: 0 })).toBeUndefined();
  });

  it('from stage 2 the element that dealt the most damage hits a quarter softer (counters and hits of others are not cut)', () => {
    const arena = boss({ cols: 2, rounds: 1, mods: { adaptsElement: true } });
    const stage2 = (second: number) =>
      playWeekend(
        arena,
        crew(
          { name: 'A', role: 'guard', element: 'tide' },
          { name: 'B', role: 'guard', element: 'ember', col: 1, atk: second },
        ),
        [],
        { stages: 2 },
      ).stages;
    // A tie in stage 1: nothing is resisted in stage 2.
    expect(stage2(100).map((s) => s.damage)).toEqual([200, 200]);
    // Ember dealt the most in stage 1: stage 2's ember hits start from 75%: 120 becomes 90.
    expect(stage2(120).map((s) => s.damage)).toEqual([220, 190]);
  });

  it('a strike-back is damage but not a hit: it is not counted for the element, and Element Resistance does not cut it', () => {
    // A Guard with a strike-back intercepts: that damage is a counter.
    const arena = striker({ cols: 2, rounds: 4, atk: 100 });
    const team = [
      spec({ name: 'T' }),
      spec({
        name: 'G',
        role: 'guard',
        element: 'ember',
        col: 1,
        fx: { interceptHitBackBp: 5_000 },
      }),
    ];
    const free = play(arena, team);
    expect(free.intercepts).toBe(4);
    const g = by(free, 'G');
    expect(g.damageDealt - g.hitDamage).toBe(4 * 50);
    const resisted = play(arena, team, { resistElement: 'ember' });
    const g2 = by(resisted, 'G');
    // The same dice: the counters are identical; only its hits are cut (a quarter off).
    expect(g2.damageDealt - g2.hitDamage).toBe(g.damageDealt - g.hitDamage);
    expect([g.hitDamage, g2.hitDamage]).toEqual([400, 300]);
  });

  it('Element Resistance cuts by a share of what it cuts at full strength', () => {
    const second = (strengthBp: number) =>
      playWeekend(
        boss({ cols: 2, rounds: 1, strengthBp, mods: { adaptsElement: true } }),
        crew(
          { name: 'A', role: 'guard', element: 'ember' },
          { name: 'B', role: 'guard', element: 'ember', col: 1 },
        ),
        [],
        { stages: 2 },
      ).stages[1]?.damage;
    // A quarter at full strength, an eighth at half (100 becomes 75, or 87), nothing at none.
    expect(second(10_000)).toBe(150);
    expect(second(5_000)).toBe(174);
    expect(second(0)).toBe(200);
  });

  it('Adapts: from stage 2 the boss resists the reaction used most so far, by the card strength (half the bonus at full)', () => {
    // A tide Setter and a spark Payoff: a reaction on the tide mark each round.
    const pair = crew({ name: 'S' }, { name: 'P', role: 'payoff', element: 'spark', col: 1 });
    const bonuses = (strengthBp: number) =>
      playWeekend(boss({ cols: 2, rounds: 1, strengthBp, mods: { adapts: true } }), pair, [], {
        stages: 2,
      }).stages.map((s) => Number(texts(s, 'reaction')[0]?.split('+')[1]));
    expect(bonuses(10_000)).toEqual([100, 50]);
    expect(bonuses(5_000)).toEqual([100, 75]);
    expect(bonuses(0)).toEqual([100, 100]);
  });

  it('Adapts resists only the reaction used most: the others land whole', () => {
    // Tide is cashed in both rounds, grove only in the second (its Payoff needs two counts).
    const team = crew(
      { name: 'S1' },
      { name: 'P1', role: 'payoff', element: 'spark', col: 1 },
      { name: 'S2', element: 'grove', col: 2 },
      { name: 'P2', role: 'payoff', element: 'ember', col: 3, fx: { minStacks: 2 } },
    );
    const w = playWeekend(boss({ cols: 4, rounds: 2, mods: { adapts: true } }), team, [], {
      stages: 2,
    });
    const bonusOf = (stage: ReturnType<typeof playWeekend>['stages'][number], who: string) =>
      texts(stage, 'reaction')
        .filter((t) => t.startsWith(who))
        .map((t) => Number(t.split('+')[1]));
    expect([bonusOf(w.stages[0] as never, 'P1'), bonusOf(w.stages[0] as never, 'P2')]).toEqual([
      [100, 100],
      [100],
    ]);
    // Stage 2: tide (cashed twice) is halved, grove (once) is not.
    expect([bonusOf(w.stages[1] as never, 'P1'), bonusOf(w.stages[1] as never, 'P2')]).toEqual([
      [50, 50],
      [100],
    ]);
  });
});

describe('damage potential: the boss that cannot die (Misa, 2026-10-30)', () => {
  /** A boss with little HP, so that four creatures bring it down at once: they deal 400 a round. */
  const soft = boss({ cols: 4, rounds: 8, hp: 400 });
  const four = () => [0, 1, 2, 3].map((c) => spec({ name: `C${c}`, col: c }));

  it('lets the boss go below 0 HP without dying: the fight plays all its rounds and the damage is not cut at the HP', () => {
    const normal = play(soft, four());
    expect(normal.won).toBe(true);
    expect(normal.damage).toBe(400);
    const open = play(soft, four(), { potential: true });
    expect(open.won).toBe(false);
    expect(open.killingBlow).toBeNull();
    // Every round was fought: the normal fight ended with the boss in round 1.
    const rounds = (events: readonly FightEvent[]) => Math.max(...events.map((e) => e.round));
    expect(rounds(open.events)).toBe(8);
    expect(rounds(normal.events)).toBe(1);
    // Overkill counts, and the boss stays at 1 HP; its real HP goes on falling.
    expect(open.damage).toBe(8 * 400);
    expect(open.bossHpLeft).toBe(1);
    expect(open.bossHpReal).toBe(400 - 3_200);
  });

  it('is the normal fight until the boss would have died', () => {
    const arena = {
      ...soft,
      atk: 60,
      plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 10_000, hits: 1 },
    } as typeof soft;
    const normal = play(arena, four(), {}, seeded('same'));
    const open = play(arena, four(), { potential: true }, seeded('same'));
    // Up to the killing blow, which is the last event but one of the normal fight.
    const until = normal.events.findIndex((e) => e.kind === 'killing-blow');
    expect(until).toBeGreaterThan(0);
    expect(open.events.slice(0, until).map((e) => e.text)).toEqual(
      normal.events.slice(0, until).map((e) => e.text),
    );
    expect(open.events.some((e) => e.kind === 'killing-blow')).toBe(false);
  });

  it('leaves the normal fight as it was: no option, false and a zero Determination are all the same fight', () => {
    const arena = striker({ cols: 4, rounds: 8, hp: 400, atk: 60 });
    const base = play(arena, four(), {}, seeded('plain'));
    const off = play(arena, four(), { potential: false, determinationBp: 0 }, seeded('plain'));
    expect(off).toEqual(base);
    const a = playWeekend(arena, crew({ name: 'A' }), [], {}, seeded('wk'));
    const b = playWeekend(arena, crew({ name: 'A' }), [], { determinationBp: 0 }, seeded('wk'));
    expect(b).toEqual(a);
  });

  it('lets the weekend play all its stages, with knockouts and attrition between them', () => {
    const team = crew(...[0, 1, 2, 3].map((c) => ({ name: `C${c}`, col: c })));
    const normal = playWeekend(soft, team, [], { stages: 3 });
    expect(normal.stages).toHaveLength(1);
    const open = playWeekend(soft, team, [], { stages: 3, potential: true });
    expect(open.stages).toHaveLength(3);
    expect(open.won).toBe(false);
    // Knockouts run as normal: a boss that kills one a round wipes the team in stage 1, and they stay out in the later stages.
    const hard = striker({ cols: 4, rounds: 8, hp: 400, atk: 4_000 });
    const hit = playWeekend(hard, team, [], { stages: 3, potential: true });
    expect(hit.stages.map((s) => s.knockouts)).toEqual([4, 0, 0]);
    const standing = hit.stages.map((s) => s.fighters.filter((f) => f.hp > 0).length);
    expect(standing).toEqual([0, 0, 0]);
  });

  it('the boss is held at 1 HP, its real HP goes on falling, and a weekend carries it from stage to stage', () => {
    const team = crew(...[0, 1, 2, 3].map((c) => ({ name: `C${c}`, col: c })));
    const w = playWeekend(soft, team, [], { stages: 3, potential: true });
    const dealt = w.stages.reduce((n, st) => n + st.damage, 0);
    for (const st of w.stages) expect(st.bossHpLeft).toBe(1);
    expect(w.stages[0]?.bossHpReal).toBeLessThan(0);
    // Every point of damage came off the real HP, across all three stages (not reset to the 1 HP the boss is held at).
    expect(w.stages.at(-1)?.bossHpReal).toBe(soft.hp - dealt);
    expect(dealt).toBe(3 * 3_200);
    // A normal fight has no gap between the two.
    const normal = play(soft, four());
    expect(normal.bossHpReal).toBe(normal.bossHpLeft);
  });

  it('a Finisher bonus that would apply only through the clamp does not: the real HP is what is read', () => {
    // The boss has 3 HP: a third of it is under 1 HP, so the clamp that holds it at 1 HP is not "below a third", but its real HP is
    // far below 0 after the first hit. The second and third hits get the Finisher's bonus (the first does not: 3 HP is not below a third).
    const tiny = boss({ hp: 3, rounds: 3 });
    const finisher = spec({ fx: { finisherBp: 1_500 } });
    const r = play(tiny, [finisher], { potential: true });
    expect(by(r, 'A').fires['finisherBp']).toBe(2);
    expect(r.damage).toBe(100 + 115 + 115);
    expect(play(tiny, [spec()], { potential: true }).damage).toBe(300);
  });

  it('Culling Strike reads the real HP in potential mode: it fires, counts no damage, and the boss is still held at 1 HP', () => {
    // One hit of 100 leaves a boss of 101 HP at 1 HP: below the Culling Strike's 5% of its full HP.
    const arena = boss({ hp: 101 });
    const culler = [spec({ fx: { cullBp: 500 } })];
    expect(play(arena, [spec()]).bossHpLeft).toBe(1);
    const cull = play(arena, culler, { potential: true });
    const none = play(arena, [spec()], { potential: true });
    expect(by(cull, 'A').fires['cullBp']).toBe(1);
    expect(count(cull, 'cull')).toBe(1);
    // The HP the Culling Strike removes is not damage, and the boss does not die in potential.
    expect(cull.damage).toBe(none.damage);
    expect(cull.bossHpLeft).toBe(1);
    expect(cull.killingBlow).toBeNull();
    // A normal fight: the same Culling Strike defeats it.
    expect(play(arena, culler).killingBlow?.culled).toBe(true);
  });
});

describe('Determination (Misa, 2026-10-30): the server creatures deal and heal more for each failed week', () => {
  it('adds its share to the damage dealt', () => {
    const four = [0, 1, 2, 3].map((c) => spec({ name: `C${c}`, col: c }));
    const arena = boss({ cols: 4, rounds: 8, hp: 400 });
    const base = play(arena, four, { potential: true });
    const plus = play(arena, four, { potential: true, determinationBp: 5_000 });
    expect(base.damage).toBe(3_200);
    expect(plus.damage).toBe(4_800);
  });

  it('adds its share to the healing', () => {
    const team = [spec({ name: 'W' }), spec({ name: 'H', role: 'support', col: 1 })];
    const heal = (determinationBp: number) =>
      play(boss({ cols: 2 }), team, { carryHp: new Map([['W', 100]]), determinationBp }).healed;
    // A tide Support heals 16 of 400; with +50% it heals 24.
    expect(heal(0)).toBe(16);
    expect(heal(5_000)).toBe(24);
  });
});

describe('the living-fighters cache', () => {
  /**
   * The fight keeps a cache of who is still standing (it is dropped when a creature is knocked out). A stale cache would let a
   * knocked-out creature be aimed at, hit or sent past again, so this reads the log of seeded raid weekends against a boss that
   * uses every shape: after a creature's "is knocked out" line, no later line of that fight is about it.
   */
  const ABOUT_A_CREATURE = new Set(['target', 'hit', 'blocked', 'dodge', 'intercept', 'reaction']);
  const roles = ['setter', 'payoff', 'guard', 'support'] as const;
  const elements = ['tide', 'ember', 'grove', 'spark', 'mire'];
  const effects: object[] = [
    { markStacks: 2 },
    { twinStrikeBp: 5_000, trail: true },
    { interceptArea: true, reachBonus: 1 },
    { support: 'rowRain', spillOver: true },
    { retaliateBp: 3_000, dodgeBonusBp: 2_000 },
    { interceptCharged: true, primeOnIntercept: true },
    { bakedShell: true, taunt: true },
    { holdOn: true, secondWindBp: 4_000 },
  ];
  const team = () =>
    Array.from({ length: 10 }, (_, i) =>
      member({
        name: `U${i}`,
        role: roles[i % 4] as (typeof roles)[number],
        element: elements[i % 5] as string,
        row: Math.floor(i / 5),
        col: i % 5,
        atk: 80 + 7 * i,
        spd: 5 + i,
        maxHp: 300,
        fx: effects[i % effects.length] as object,
      }),
    );
  const bench = () =>
    Array.from({ length: 6 }, (_, i) =>
      member({ name: `B${i}`, role: 'guard', maxHp: 300, col: i % 5 }),
    );
  const every = (id: string, shape: string, extra: object = {}) => ({
    id,
    name: id,
    pattern: { anchor: id.length % 2 ? 'strongest' : 'random', shape, n: 2 },
    powerBp: 12_000,
    every: 1,
    turn: 0,
    ...extra,
  });
  const arena = boss({
    rows: 2,
    cols: 5,
    atk: 120,
    rounds: 6,
    spd: 8,
    plain: { pattern: { anchor: 'random', shape: 'single' }, powerBp: 10_000, hits: 2 },
    moves: [
      ...(
        [
          'chain',
          'scatter',
          'row',
          'column',
          'columns',
          'rowEnds',
          'randomRow',
          'line3',
          'cross',
          'rows',
          'checker',
        ] as const
      ).map((shape, i) =>
        every(`m${i}`, shape, { turn: i % 2, every: 1 + (i % 3), charged: i % 4 === 0 }),
      ),
    ] as never,
  });

  it('never lets a knocked-out creature appear in a later line of its fight', () => {
    let knockouts = 0;
    for (let i = 0; i < 8; i++) {
      const run = playWeekend(
        arena,
        team(),
        bench(),
        { stages: 3 },
        createSeededRng(`living:${i}`),
      );
      for (const stage of run.stages) {
        const down = new Set<string>();
        for (const e of stage.events) {
          if (ABOUT_A_CREATURE.has(e.kind))
            for (const name of down)
              expect(
                e.text.startsWith(`${name} `) || e.text.startsWith(`${name}'s`),
                `${e.kind}: ${e.text}`,
              ).toBe(false);
          const m = /^(.+) takes \d+ and is knocked out$/.exec(e.text);
          if (e.kind === 'hit' && m?.[1]) {
            down.add(m[1]);
            knockouts++;
          }
        }
      }
    }
    // Not vacuous: the weekends did knock creatures out.
    expect(knockouts).toBeGreaterThan(20);
  });
});
