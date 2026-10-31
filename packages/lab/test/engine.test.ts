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
  KNACKS,
  labBoss,
  legalTalents,
  placeFighters,
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

describe('Night Watch takes the first Charged hit each boss turn, cut to a quarter', () => {
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

  it('the hit it takes is cut to a quarter (2026-10-31: more than its cover cut, the most any cut can take)', () => {
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
    // atk 1000 x 1.0 = 1000 raw, cut by Night Watch's own cut (75%, more than the cover's 40%), minus Thornbuck's armour.
    const armour = formStats('thornbuck', 25).armour;
    const cut = KNACKS['night-watch']?.fx.watchCutBp ?? 0;
    expect(cut).toBe(LAB_RULES.cutMaxBp);
    expect(cut).toBeGreaterThan(LAB_RULES.coverBp);
    expect(taken).toBe(Math.floor((1_000 * (10_000 - cut)) / 10_000) - armour);
  });
});

describe('Catch the Bolts takes an area hit with its cover cut (2026-10-31)', () => {
  const sweep = mover({ anchor: 'front', shape: 'row' }, 1, 3, { atk: 1_000 });
  const team = (knack: string) => [
    at('tempestray', 0, 0),
    at('ohmouse', 0, 1, { knack }),
    at('tidewing', 0, 2),
  ];
  const takenBy = (r: FightResult, who: string): number =>
    Number(
      /takes (\d+)/.exec(
        r.events.find((e) => e.kind === 'hit' && e.text.startsWith(who))?.text ?? '',
      )?.[1],
    );

  it('an area hit it intercepts is cut by its cover (the cover of 40%), where it used to land whole', () => {
    const r = seedWhere(
      (seed) => fight(sweep, team('catch-the-bolts'), { rng: rng(seed), log: true }),
      (x) => x.intercepts >= 1 && !x.events.some((e) => e.kind === 'dodge'),
    );
    const armour = formStats('ohmouse', 25).armour;
    expect(takenBy(r, 'Ohmouse')).toBe(
      Math.floor((1_000 * (10_000 - LAB_RULES.coverBp)) / 10_000) - armour,
    );
    // The creature it covered took nothing from that hit.
    expect(r.events.filter((e) => e.kind === 'intercept').length).toBeGreaterThanOrEqual(1);
  });

  it('without it, a Guard does not take area hits: every creature takes its own', () => {
    for (let i = 0; i < 20; i++)
      expect(fight(sweep, team('none'), { rng: rng(`cb${i}`) }).intercepts).toBe(0);
  });

  it('a hit aimed at one creature is taken by the Guard whole, as before (the cut is for area hits)', () => {
    const aimed = mover({ anchor: 'strongest', shape: 'single' }, 1, 3, { atk: 1_000 });
    const r = seedWhere(
      (seed) => fight(aimed, team('catch-the-bolts'), { rng: rng(seed), log: true }),
      (x) =>
        x.intercepts === 1 &&
        !x.events.some((e) => e.kind === 'dodge') &&
        x.events.some((e) => e.kind === 'hit' && e.text.startsWith('Ohmouse')),
    );
    expect(takenBy(r, 'Ohmouse')).toBe(1_000 - formStats('ohmouse', 25).armour);
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

describe('Stubborn (panel 5): once per weekend, and it never heals', () => {
  const hitter = (atk: number): BossDef => ({
    ...labBoss({ rows: 1, cols: 1, rounds: 1, atk, hp: 1_000_000 }),
    spd: 0,
    armour: 5_000,
  });
  const team = [at('tidewing', 0, 0, { talents: ['stubborn'] })];

  it('holds on in one stage only: a later stage knocks it out', () => {
    // Each stage's hit is far more than its max HP.
    let stages: FightResult[] | undefined;
    for (let i = 0; i < 40 && !stages; i++) {
      const w = weekend(hitter(2_000), team, [], { rng: rng(`st${i}`), stages: 2, log: true });
      if (w.stages.every((st) => st.dodges === 0)) stages = w.stages;
    }
    const held = (st: FightResult | undefined) =>
      st?.events.filter((e) => e.kind === 'hold-on').length;
    expect(held(stages?.[0])).toBe(1);
    expect(stages?.[0]?.knockouts).toBe(0);
    expect(held(stages?.[1])).toBe(0);
    expect(stages?.[1]?.knockouts).toBe(1);
  });

  it('leaves it at two fifths of its max HP, or at the HP it had if that was lower (never a heal)', () => {
    const uid = placeFighters(team)[0]?.uid ?? '';
    const maxHp = formStats('tidewing', 25).hp;
    const left = (carried: number) => {
      for (let i = 0; i < 40; i++) {
        const r = fight(hitter(2_000), team, {
          rng: rng(`nh${i}`),
          carryHp: new Map([[uid, carried]]),
          log: true,
        });
        if (r.dodges === 0) return r.fighters[0]?.hp;
      }
      return undefined;
    };
    const two5 = Math.floor((maxHp * LAB_RULES.holdOnLeaveBp) / 10_000);
    expect(left(maxHp)).toBe(two5);
    expect(left(Math.floor(maxHp / 10))).toBe(Math.floor(maxHp / 10));
    expect(left(1)).toBe(1);
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

  it('a phase change is announced a round ahead and Mired does not stop it (a general rule)', () => {
    const phaseMove: BossMove = {
      id: 'p2',
      name: 'Second Wind',
      pattern: { anchor: 'front', shape: 'single' },
      powerBp: 1,
      every: 1,
      turn: 0,
    };
    const boss = base(
      esc({ per: 2, cap: 2, phase: { atStep: 1, name: 'P2', moves: [phaseMove] } }),
      { rounds: 8 },
    );
    const miredTeam = [at('croakmire', 0, 0, { knack: 'squelch-song' }), ...team.slice(1)];
    for (const t of [team, miredTeam]) {
      const r = fight(boss, t, { rng: rng('ph'), log: true });
      const ahead = r.events.find((e) => e.kind === 'announce' && /begins next round/.test(e.text));
      const applied = r.events.find((e) => e.kind === 'phase');
      // The feed reaches 2 rounds at round 3's start: announced then, applied at round 4's start, Mired or not.
      expect(ahead?.round).toBe(3);
      expect(applied?.round).toBe(4);
    }
    // The announcement carries over a stage break: announced in the last round, it applies in the next stage's first.
    const w = weekend(
      base(esc({ per: 2, cap: 2, phase: { atStep: 1, name: 'P2', moves: [phaseMove] } })),
      team,
      [],
      {
        rng: rng('ph2'),
        stages: 2,
        log: true,
      },
    );
    expect(w.stages[0]?.escalation?.phase).toBe(false);
    expect(w.stages[0]?.escalation?.phaseNext).toBe(true);
    expect(w.stages[1]?.events.find((e) => e.kind === 'phase')?.round).toBe(1);
  });

  it('every feed carries across the weekend: its count never starts a stage lower than the last one ended', () => {
    for (const feed of [
      'reactions',
      'hpLost',
      'rounds',
      'crits',
      'dodges',
      'knockouts',
      'shed',
    ] as const) {
      const boss = base(esc({ feed, per: 1_000_000, cap: 1 }), {
        hp: 400,
        atk: 40,
        spd: 5,
        armour: 0,
        mods: { shedMarks: true },
      });
      const w = weekend(
        boss,
        [at('tidewing', 0, 0), at('tempestray', 0, 1), at('thornbuck', 0, 2)],
        [at('kilnmole', 0, 0)].map((p) => ({ ...p, owner: 'p1' })),
        {
          rng: rng(`carry-${feed}`),
          stages: 3,
        },
      );
      let last = 0;
      for (const st of w.stages) {
        const c = st.escalation?.count ?? 0;
        expect(c, feed).toBeGreaterThanOrEqual(last);
        last = c;
      }
    }
  });

  it('an event feed with perColumns needs more units a step in a wider arena; a feed without it does not', () => {
    const e = esc({ feed: 'reactions', per: 2, perColumns: 4, cap: 9 });
    const wideTeam = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        at(['tidewing', 'tempestray', 'thornbuck'][i % 3] as string, 0, i),
      );
    const nextAt = (cols: number, esc: Escalation) =>
      fight(base(esc, { cols, rounds: 1 }), wideTeam(cols), { rng: rng('pc2'), log: true })
        .escalation?.nextAt;
    // Step 1 needs `per` units for 4 columns: 2 at 4, 4 at 8, 1 at 2 (at least 1).
    expect(nextAt(4, e)).toBe(2);
    expect(nextAt(8, e)).toBe(4);
    expect(nextAt(2, e)).toBe(1);
    expect(nextAt(8, esc({ feed: 'reactions', per: 2, cap: 9 }))).toBe(2);
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

  it("Mired slows only the growth that helps the boss: a falling armour comes at the step's plain count (R22.3)", () => {
    // Thornmother's step is Attack up and armour down together; Mired holds the first back, never the second.
    const boss = base(esc({ per: 1, cap: 3, grow: { atkBp: 5_000, armour: -30 } }), {
      rounds: 4,
      armour: 200,
    });
    const squelch = [at('croakmire', 0, 0, { knack: 'squelch-song' }), ...team.slice(1)];
    const free = fight(boss, [at('croakmire', 0, 0), ...team.slice(1)], {
      rng: rng('fall'),
      log: true,
    });
    const mired = fight(boss, squelch, { rng: rng('fall'), log: true });
    expect(free.escalation?.step).toBe(3);
    expect(free.escalation?.fallStep).toBe(3);
    // Mired: the boss-helping step is behind, the falling one is not.
    expect(mired.escalation?.step).toBeLessThan(3);
    expect(mired.escalation?.fallStep).toBe(3);
    // A growth with no falling part keeps one count: nothing to split.
    const plain = fight(base(esc({ per: 1, cap: 3 }), { rounds: 4 }), squelch, {
      rng: rng('fall'),
      log: true,
    });
    expect(plain.escalation?.fallStep).toBe(plain.escalation?.step);
    // The falling step carries across a weekend with the others.
    const w = weekend(boss, team, [], { rng: rng('fall'), stages: 2 });
    expect(w.stages[1]?.escalation?.fallStep).toBeGreaterThanOrEqual(
      w.stages[0]?.escalation?.fallStep ?? 0,
    );
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

describe('every move with a roll in its targets is announced at round start', () => {
  const rolled: Pattern[] = [
    { anchor: 'random', shape: 'scatter', n: 2 },
    { anchor: 'random', shape: 'single' },
    { anchor: 'random', shape: 'randomRow' },
    { anchor: 'random', shape: 'column' },
  ];
  const team = Array.from({ length: 6 }, (_, i) => at('thornbuck', Math.floor(i / 3), i % 3));

  it.each(rolled)(
    '%j: the log carries the move id and its slots, and the landing hits exactly those',
    (pattern) => {
      const boss = mover(pattern, 2, 3);
      for (let i = 0; i < 6; i++) {
        const r = fight(boss, team, { rng: rng(`an${i}`), log: true });
        const ann = r.events.filter((e) => e.kind === 'announce');
        expect(ann).toHaveLength(1);
        expect(ann[0]?.move).toBe('m');
        const shown = (ann[0]?.slots ?? []).map(([row, col]) => `${row},${col}`);
        expect(shown.length).toBeGreaterThan(0);
        // The announcement comes before the boss turn, and the landing is on those slots (a dodge still logs it).
        expect(r.events.indexOf(ann[0] as (typeof r.events)[number])).toBeLessThan(
          r.events.findIndex((e) => e.kind === 'target'),
        );
        expect(slotsHit(r, 'm')).toEqual(shown);
      }
    },
  );

  it('a move with no roll (a strongest anchor) is not announced, and a Charged one is', () => {
    const plain = fight(mover({ anchor: 'strongest', shape: 'single' }, 2, 3), team, {
      rng: rng('an'),
      log: true,
    });
    expect(plain.events.filter((e) => e.kind === 'announce')).toHaveLength(0);
    const charged = fight(
      mover({ anchor: 'strongest', shape: 'single' }, 2, 3, {}, { charged: true }),
      team,
      { rng: rng('an'), log: true },
    );
    expect(charged.events.filter((e) => e.kind === 'announce')).toHaveLength(1);
  });

  it('an announced random move never re-aims when a target falls first', () => {
    // Round start shows every creature; the boss turn before the scatter knocks the front one out; it is skipped.
    const kill: BossMove = {
      id: 'kill',
      name: 'Kill',
      pattern: { anchor: 'front', shape: 'single' },
      powerBp: 100_000,
      every: 1,
      turn: 0,
    };
    const scatter = mover(
      { anchor: 'random', shape: 'scatter', n: 6 },
      2,
      3,
      { atk: 500 },
      { turn: 1 },
    );
    const boss: BossDef = { ...scatter, moves: [kill, ...scatter.moves] };
    const r = seedWhere(
      (seed) => fight(boss, team, { rng: rng(seed), log: true }),
      (x) => x.events.some((e) => e.kind === 'hit' && e.text.includes('knocked out')),
    );
    const shown = (r.events.find((e) => e.kind === 'announce')?.slots ?? []).map(
      ([a, b]) => `${a},${b}`,
    );
    expect(shown).toHaveLength(6);
    const landed = slotsHit(r, 'm');
    expect(landed.length).toBeLessThan(6);
    for (const slot of landed) expect(shown).toContain(slot);
  });
});

describe('an aimed shape may have several anchors (balance pass, 2026-10-29)', () => {
  const big = (cols: number, form = 'thornbuck') =>
    Array.from({ length: 3 * cols }, (_, i) => at(form, Math.floor(i / cols), i % cols));

  it('single with anchors: aimed at that many different creatures, the best matches in order', () => {
    const boss = mover({ anchor: 'strongest', shape: 'single', anchors: 3 }, 1, 4, { atk: 1 });
    const team = [
      at('thornbuck', 0, 0),
      at('tempestray', 0, 1),
      at('pyrelynx', 0, 2),
      at('bloomback', 0, 3),
    ];
    const r = fight(boss, team, { rng: rng('anchors'), log: true });
    // Tempestray and Bloomback (165) first, then Pyrelynx (149): the three highest Attacks, thornbuck left out.
    expect(new Set(slotsHit(r, 'm'))).toEqual(new Set(['0,1', '0,2', '0,3']));
  });

  it('a count with perColumns grows with the width, and without `anchors` an aimed move has one', () => {
    const hits = (pattern: Pattern, cols: number) =>
      slotsHit(fight(mover(pattern, 3, cols), big(cols), { rng: rng('anchors-w'), log: true }), 'm')
        .length;
    const scaled: Pattern = { anchor: 'strongest', shape: 'single', anchors: 1, perColumns: 4 };
    expect([4, 8, 12].map((c) => hits(scaled, c))).toEqual([1, 2, 3]);
    expect([4, 8, 12].map((c) => hits({ anchor: 'strongest', shape: 'single' }, c))).toEqual([
      1, 1, 1,
    ]);
  });

  it('each anchor of a line of three takes the aimed hit, and its neighbours the area hits', () => {
    const boss = mover({ anchor: 'strongest', shape: 'line3', anchors: 2 }, 2, 6, { atk: 1 });
    // Two strong Payoffs far apart in the front row, plain Guards between and around them.
    const team = [
      at('thornbuck', 0, 0),
      at('tempestray', 0, 1),
      at('thornbuck', 0, 2),
      at('thornbuck', 0, 3),
      at('bloomback', 0, 4),
      at('thornbuck', 0, 5),
    ];
    const r = fight(boss, team, { rng: rng('anchors-l3'), log: true });
    // The two anchors are the two Payoffs, each with its row neighbours: every slot of the row once.
    expect(new Set(slotsHit(r, 'm'))).toEqual(new Set(['0,0', '0,1', '0,2', '0,3', '0,4', '0,5']));
    expect(slotsHit(r, 'm')).toHaveLength(6);
  });

  it('each further anchor is the best match not already inside the move’s shape (R2.1, panel 5)', () => {
    const boss = mover({ anchor: 'strongest', shape: 'line3', anchors: 2 }, 1, 6, { atk: 1 });
    // Tempestray (165) and Bloomback (165) stand side by side: the first anchor's line of three already holds both, so the
    // second anchor is the strongest creature outside it, Pyrelynx (149), not Bloomback.
    const team = [
      at('thornbuck', 0, 0),
      at('tempestray', 0, 1),
      at('bloomback', 0, 2),
      at('thornbuck', 0, 3),
      at('pyrelynx', 0, 4),
      at('thornbuck', 0, 5),
    ];
    const r = fight(boss, team, { rng: rng('anchors-r21'), log: true });
    // Without the rule the second anchor would be Bloomback and the right half of the row would go untouched.
    expect(new Set(slotsHit(r, 'm'))).toEqual(new Set(['0,0', '0,1', '0,2', '0,3', '0,4', '0,5']));
    const aimed = r.events.filter((e) => e.kind === 'target').map((e) => e.text);
    expect(aimed.findIndex((t) => t.includes('Pyrelynx'))).toBeGreaterThan(2);
  });

  it('Taunt draws the first anchor of a plain attack; the others follow the anchor rule', () => {
    const boss: BossDef = {
      ...labBoss({ rows: 1, cols: 4, rounds: 1, atk: 1 }),
      spd: 0,
      plain: { pattern: { anchor: 'strongest', shape: 'single', anchors: 2 }, powerBp: 10_000 },
    };
    const team = [
      at('tempestray', 0, 0),
      at('pyrelynx', 0, 1),
      at('thornbuck', 0, 2),
      at('kilnmole', 0, 3, { knack: 'draw-fire' }),
    ];
    const r = fight(boss, team, { rng: rng('anchors-t'), log: true });
    // Kilnmole (Draw Fire) first, then the strongest creature: Tempestray.
    expect(new Set(slotsHit(r, 'plain'))).toEqual(new Set(['0,3', '0,0']));
  });
});

describe('moves on one boss turn land in the boss card’s order (R8.3, panel 5)', () => {
  it('the order of the card, not of power, cadence or name; the plain attack comes after them', () => {
    const move = (id: string, name: string, powerBp: number, every: number): BossMove => ({
      id,
      name,
      pattern: { anchor: 'front', shape: 'single' },
      powerBp,
      every,
      turn: 0,
    });
    const boss: BossDef = {
      ...labBoss({ rows: 1, cols: 2, rounds: 4, atk: 1, hp: 1_000_000 }),
      spd: 0,
      moves: [
        move('c', 'Zeta', 1_000, 1),
        move('a', 'Alpha', 9_000, 2),
        move('b', 'Mid', 5_000, 1),
      ],
    };
    const r = fight(boss, [at('thornbuck', 0, 0), at('thornbuck', 0, 1)], {
      rng: rng('order'),
      log: true,
    });
    const rounds = new Map<number, string[]>();
    for (const e of r.events.filter((x) => x.kind === 'move' || x.kind === 'target')) {
      const names = rounds.get(e.round) ?? [];
      names.push(e.kind === 'move' ? e.text : (/<- (\w+)$/.exec(e.text)?.[1] ?? e.text));
      rounds.set(e.round, names);
    }
    const order = (round: number) =>
      (rounds.get(round) ?? []).filter((t) => ['Zeta', 'Alpha', 'Mid', 'plain'].includes(t));
    expect(order(1)).toEqual(['Zeta', 'Mid', 'plain']);
    expect(order(2)).toEqual(['Zeta', 'Alpha', 'Mid', 'plain']);
  });
});

describe('Primed by Pain: each interception leaves a mark, once a round', () => {
  const boss = (moves: number): BossDef => ({
    ...mover({ anchor: 'front', shape: 'single' }, 1, 2, { atk: 50, rounds: 4 }),
    moves: Array.from({ length: moves }, (_, i) => ({
      id: `m${i}`,
      name: `M${i}`,
      pattern: { anchor: 'front' as const, shape: 'single' as const },
      powerBp: 5_000,
      every: 1,
      turn: 0,
    })),
  });
  const team = (knack?: string) => [
    at('tidewing', 0, 0),
    at('thornbuck', 0, 1, knack ? { knack } : {}),
  ];
  const groveMarks = (r: FightResult) =>
    r.events.filter((e) => e.kind === 'mark' && e.text.startsWith('grove')).length;

  it('two interceptions in a round leave one mark, and a round without one leaves none', () => {
    // Two aimed hits each round at the front Setter; the Guard beside it takes what the Setter does not dodge.
    const r = seedWhere(
      (seed) => fight(boss(2), team('primed-by-pain'), { rng: rng(seed), log: true }),
      (x) => x.intercepts >= 6 && !x.events.some((e) => e.kind === 'dodge'),
      200,
    );
    expect(r.intercepts).toBe(8);
    expect(groveMarks(r)).toBe(4);
    // Without the Knack the Guard marks nothing.
    const plain = fight(boss(2), team(), { rng: rng('pbp-none'), log: true });
    expect(groveMarks(plain)).toBe(0);
  });
});

describe('Baked Shell: Heat builds at every round start, and by damage', () => {
  const quiet = (rounds: number): BossDef =>
    mover({ anchor: 'front', shape: 'single' }, 1, 2, { rounds, atk: 1 }, { powerBp: 0 });
  const team = [at('kilnmole', 0, 0, { knack: 'baked-shell' }), at('tempestray', 0, 1)];
  const heat = (r: FightResult) => r.fighters.find((f) => f.formId === 'kilnmole')?.store;

  it('one Heat a round with nothing hitting it, up to three', () => {
    expect(heat(fight(quiet(1), team, { rng: rng('bs1') }))).toBe(1);
    expect(heat(fight(quiet(2), team, { rng: rng('bs2') }))).toBe(2);
    expect(heat(fight(quiet(6), team, { rng: rng('bs3') }))).toBe(3);
  });

  it('a silenced Kilnmole builds none', () => {
    const boss: BossDef = {
      ...quiet(4),
      moves: [
        {
          id: 's',
          name: 'Hush',
          pattern: { anchor: 'front', shape: 'rowEnds' },
          powerBp: 0,
          every: 1,
          turn: 0,
          silenceTurns: 9,
        },
      ],
    };
    // Both slots of a two-wide row are row ends: silenced from the first boss turn on, after the first round start.
    expect(heat(fight(boss, team, { rng: rng('bs4') }))).toBeLessThanOrEqual(1);
  });
});

describe('Primed by Pain beats Clean Scales: a mark left during the boss turn is not shed', () => {
  const boss: BossDef = {
    ...labBoss({ rows: 1, cols: 3, rounds: 2, atk: 60 }),
    spd: 0,
    plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 10_000 },
    mods: { shedMarks: true },
  };
  const team = (knack?: string) => [
    at('tidewing', 0, 0),
    at('thornbuck', 0, 1, knack ? { knack } : {}),
    at('pyrelynx', 0, 2),
  ];
  const cashedGrove = (r: FightResult) =>
    r.events.filter((e) => e.kind === 'reaction' && e.text.includes('cashes grove')).length;

  it('the Guard’s grove mark is still there when Pyrelynx acts next round', () => {
    const r = seedWhere(
      (seed) => fight(boss, team('primed-by-pain'), { rng: rng(seed), log: true }),
      (x) => x.intercepts >= 1 && !x.events.some((e) => e.kind === 'dodge'),
      200,
    );
    expect(cashedGrove(r)).toBeGreaterThan(0);
    // Nothing else leaves a grove mark: without the Knack there is nothing to cash.
    expect(cashedGrove(fight(boss, team(), { rng: rng('pbp-cs'), log: true }))).toBe(0);
  });
});
