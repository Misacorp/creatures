/**
 * Combat v2: the boss's turns (R1, R2, R8, R9, R13): where its moves and plain attack aim (patterns, anchors, Taunt, announce at round
 * start), who takes a hit (dodge first, then a Guard, Night Watch, Catch the Bolts), dodge and its auras, the boss's own dodge, wards and
 * Breakwater, and the strength of its rule cards. Creatures and boss are built by hand with their effects named directly; the dice are
 * scripted or the fight's own invariants are checked, so no number depends on a seed. These were the lab's `fight`, `luck`, `engine`
 * and `strength` rule tests about the boss.
 */
import { describe, expect, it } from 'vitest';
import {
  NO,
  YES,
  aimedAt,
  boss,
  by,
  count,
  hush,
  mired,
  move,
  mover,
  play,
  playScripted,
  seeded,
  slotsHit,
  spec,
  striker,
  takes,
  texts,
  type SpecOver,
} from './v2-helpers';

const row = (cols: number[], over: SpecOver = {}, r = 0) =>
  cols.map((c) => spec({ name: `C${r}${c}`, role: 'guard', row: r, col: c, ...over }));

describe('R1 and R8: the turn order and who takes a hit', () => {
  it('the target rolls dodge first; a Guard intercepts only a failed dodge, and never rolls', () => {
    // The Setter dodges 50% (a flat dodge effect); the Guard beside it intercepts what it does not dodge.
    // Per round the draws are the two creatures' crit rolls, then the dodge roll of the creature the boss aimed at.
    const team = [
      spec({ name: 'A', fx: { dodgeBonusBp: 5_000 } }),
      spec({ name: 'G', role: 'guard', col: 1 }),
    ];
    const { res, draws } = playScripted(striker({ rounds: 2, cols: 2 }), team, [
      NO,
      NO,
      YES,
      NO,
      NO,
      NO,
    ]);
    expect(texts(res, 'dodge')).toEqual(['A dodges']);
    expect(res.intercepts).toBe(1);
    expect(texts(res, 'intercept')).toEqual(['G intercepts for A']);
    // The Guard rolled no dodge for the hit it took: six draws in all.
    expect(draws).toBe(6);
  });

  it('R8: the boss takes a turn after each row', () => {
    const team = [0, 1, 2].map((r) => spec({ name: `R${r}`, role: 'guard', row: r }));
    const r = play(striker({ rows: 3 }), team);
    const turns = new Set(
      r.events.filter((e) => ['hit', 'blocked', 'dodge'].includes(e.kind)).map((e) => e.turn),
    );
    expect([...turns].sort()).toEqual([0, 1, 2]);
  });

  it('the log tags each event with the row whose turns it follows', () => {
    const team = [
      spec({ name: 'A', element: 'tide', row: 0 }),
      spec({ name: 'B', element: 'spark', row: 1 }),
      spec({ name: 'C', element: 'tide', row: 2 }),
    ];
    const r = play(boss({ rows: 3 }), team);
    expect(r.events.filter((e) => e.kind === 'mark').map((e) => [e.turn, e.text])).toEqual([
      [0, 'tide x1'],
      [1, 'spark x1'],
      [2, 'tide x2'],
    ]);
  });
});

describe('dodge, its auras and the boss own dodge (R1)', () => {
  /** The boss's plain attack aims at the front creature once a round. */
  const aimed = (rounds = 1) => striker({ rounds, cols: 3 });
  const dodges = (team: ReturnType<typeof spec>[], roll: number) =>
    // Draws: a crit roll for each creature, then the dodge roll of the front creature.
    count(playScripted(aimed(), team, [...team.map(() => NO), roll]).res, 'dodge');

  it('Speed gives dodge (1 point of basis per Speed point x 10, up to the cap)', () => {
    expect(dodges([spec({ spd: 12 })], 119)).toBe(1);
    expect(dodges([spec({ spd: 12 })], 120)).toBe(0);
    // The cap: 50%.
    expect(dodges([spec({ spd: 1_000 })], 4_999)).toBe(1);
    expect(dodges([spec({ spd: 1_000 })], 5_000)).toBe(0);
  });

  it('Hide in Mist: creatures beside it dodge more (a creature two away does not get it)', () => {
    const near = [spec({ name: 'A' }), spec({ name: 'M', col: 1, fx: { besideDodgeBp: 2_000 } })];
    expect(dodges(near, 1_999)).toBe(1);
    expect(dodges(near, 2_000)).toBe(0);
    const far = [
      spec({ name: 'A' }),
      spec({ name: 'X', col: 1 }),
      spec({ name: 'M', col: 2, fx: { besideDodgeBp: 2_000 } }),
    ];
    expect(dodges(far, 1_999)).toBe(0);
  });

  it('a row aura gives every creature in the row dodge, whoever stands beside it; it does not help itself', () => {
    const team = [
      spec({ name: 'A' }),
      spec({ name: 'X', col: 1 }),
      spec({ name: 'M', col: 2, fx: { rowDodgeBp: 2_000 } }),
    ];
    expect(dodges(team, 1_999)).toBe(1);
    expect(dodges([spec({ name: 'M', fx: { rowDodgeBp: 2_000 } })], 1_999)).toBe(0);
  });

  it('area hits are dodged at half the chance, and a Charged landing at the full chance', () => {
    const team = [spec({ name: 'A', fx: { dodgeBonusBp: 4_000 } })];
    const area = (charged: boolean) =>
      mover({ anchor: 'front', shape: 'row' }, 1, 1, {}, { charged });
    // Half of 40% is 20%; the area dodge effect adds on top of the half.
    expect(count(playScripted(area(false), team, [NO, 1_999]).res, 'dodge')).toBe(1);
    expect(count(playScripted(area(false), team, [NO, 2_000]).res, 'dodge')).toBe(0);
    expect(count(playScripted(area(true), team, [NO, 3_999]).res, 'dodge')).toBe(1);
    expect(count(playScripted(area(true), team, [NO, 4_000]).res, 'dodge')).toBe(0);
    const warded = [spec({ name: 'A', fx: { dodgeBonusBp: 4_000, areaDodgeBp: 1_000 } })];
    expect(count(playScripted(area(false), warded, [NO, 2_999]).res, 'dodge')).toBe(1);
  });

  it('Slippery: the boss dodges a flat share more, a debuff does not slow it, and only a hit that cannot be dodged gets past it', () => {
    const slippery = (over = {}) => boss({ cols: 4, dodgeBp: 3_000, ...over });
    const dodged = (b: ReturnType<typeof boss>, team: ReturnType<typeof spec>[], roll: number) =>
      // The first draw is the first creature's dodge roll against the boss (a Setter that is not silenced hits first).
      count(playScripted(b, team, [roll]).res, 'boss-dodge');
    // A flat 30%, with no Speed at all.
    expect(dodged(slippery(), [spec()], 2_999)).toBe(1);
    expect(dodged(slippery(), [spec()], 3_000)).toBe(0);
    expect(dodged(boss({ cols: 4 }), [spec()], 0)).toBe(0);
    // Speed 50 adds 5%. Mired x1 (round start) takes off 1.5% of that, and nothing off the flat part.
    const song = [spec({ name: 'S', fx: { miresAtStart: true } })];
    expect(dodged(slippery({ spd: 50 }), [spec()], 3_499)).toBe(1);
    expect(dodged(slippery({ spd: 50 }), [spec()], 3_500)).toBe(0);
    expect(dodged(slippery({ spd: 50 }), song, 3_349)).toBe(1);
    expect(dodged(slippery({ spd: 50 }), song, 3_350)).toBe(0);
    // With no Speed the Mired has nothing to take off: the flat part is the whole chance.
    expect(dodged(slippery(), song, 2_999)).toBe(1);
    expect(dodged(slippery(), song, 3_000)).toBe(0);
    // Clear Skies: the hits of the creatures beside the Support cannot be dodged. Draws: A's crit roll (no dodge roll for it), then
    // the Support's dodge roll and the far creature's, both dodged.
    const team = [
      spec({ name: 'A' }),
      spec({ name: 'H', role: 'support', col: 1, fx: { support: 'clearSkies' } }),
      spec({ name: 'F', col: 3 }),
    ];
    const r = playScripted(slippery(), team, [NO, YES, YES]).res;
    expect(by(r, 'A').damageDealt).toBe(100);
    expect(by(r, 'F').damageDealt).toBe(0);
    expect(count(r, 'boss-dodge')).toBe(2);
  });
});

describe('Guards: reach, Carry Them, Night Watch and Catch the Bolts (R1.3)', () => {
  it('Carry Them: a Payoff intercepts aimed hits for the creature beside it, like a Guard', () => {
    const team = (fx: object) => [
      spec({ name: 'A', role: 'setter' }),
      spec({ name: 'X', role: 'payoff', element: 'spark', col: 1, fx }),
    ];
    const arena = striker({ rounds: 6, cols: 2, atk: 10 });
    expect(play(arena, team({})).intercepts).toBe(0);
    const carried = play(arena, team({ interceptLikeGuard: true }));
    expect(carried.intercepts).toBe(6);
    expect(texts(carried, 'intercept').every((t) => t.startsWith('X'))).toBe(true);
  });

  it('a Guard intercepts before a creature that only intercepts through an effect (R1.3)', () => {
    // The Taunt creature draws the plain attack; the carrier on its left and the Guard on its right both stand beside it.
    const team = [
      spec({
        name: 'X',
        role: 'payoff',
        element: 'spark',
        col: 0,
        fx: { interceptLikeGuard: true },
      }),
      spec({ name: 'T', role: 'payoff', element: 'spark', col: 1, fx: { taunt: true } }),
      spec({ name: 'G', role: 'guard', col: 2 }),
    ];
    const r = play(striker({ rounds: 4, cols: 3, atk: 10 }), team);
    expect(texts(r, 'intercept').map((t) => t.split(' ')[0])).toEqual(['G', 'G', 'G', 'G']);
  });

  it('a creature with no interception effect never intercepts, and a silenced Guard does not (see silence)', () => {
    const team = [
      spec({ name: 'A' }),
      spec({ name: 'B', role: 'payoff', element: 'spark', col: 1 }),
    ];
    expect(play(striker({ rounds: 3, cols: 2 }), team).intercepts).toBe(0);
  });

  describe('Charged moves land on the creatures shown at round start (R2.3, R8.2 c)', () => {
    const kill = move(
      { anchor: 'strongest', shape: 'single' },
      { id: 'kill', name: 'Kill', powerBp: 100_000 },
    );
    const charged = move(
      { anchor: 'strongest', shape: 'single' },
      { id: 'charge', name: 'Charge', turn: 1, charged: true },
    );

    it('a Charged move is announced, and its landing is the creature shown even when the creature fell first', () => {
      // Round start: the strongest is shown. The boss turn before it knocks the 1-HP creature out; the Charged landing does not
      // re-aim at the other creature, it is skipped.
      const arena = boss({ rows: 2, cols: 2, atk: 500, moves: [kill, charged] });
      const team = [
        spec({ name: 'Strong', atk: 150 }),
        spec({ name: 'Other', role: 'guard', row: 1, col: 1 }),
      ];
      const r = play(arena, team, { carryHp: new Map([['Strong', 1]]) });
      const announced = r.events.filter((e) => e.kind === 'announce');
      expect(announced).toHaveLength(1);
      expect(announced[0]?.text).toContain('Strong');
      expect(announced[0]?.round).toBe(1);
      expect(slotsHit(r, 'kill')).toEqual(['0,0']);
      expect(slotsHit(r, 'charge')).toEqual([]);
      expect(by(r, 'Other').hp).toBe(by(r, 'Other').maxHp);
    });

    it('a Charged single is aimed at the announced slot, and a Guard beside it does not take it', () => {
      const team = [
        spec({ name: 'G0', role: 'guard' }),
        spec({ name: 'Strong', atk: 150, col: 1 }),
        spec({ name: 'G2', role: 'guard', col: 2 }),
      ];
      const aim = { anchor: 'strongest', shape: 'single' } as const;
      const charge = play(mover(aim, 1, 3, {}, { charged: true }), team);
      expect(charge.intercepts).toBe(0);
      expect(slotsHit(charge, 'm')).toEqual(['0,1']);
      // The same hit as a plain aimed move is taken by the Guard.
      expect(play(mover(aim, 1, 3), team).intercepts).toBe(1);
    });

    it('a Charged area hit is taken by a Guard only with an effect that says so (Intercept area hits too)', () => {
      const wave = mover({ anchor: 'front', shape: 'row' }, 1, 3, {}, { charged: true });
      const team = (fx: object) => [
        spec({ name: 'A' }),
        spec({ name: 'G', role: 'guard', col: 1, fx }),
        spec({ name: 'B', col: 2 }),
      ];
      expect(play(wave, team({})).intercepts).toBe(0);
      // Night Watch takes the first Charged hit of the boss turn, whoever it is aimed at in its row; Catch the Bolts takes area hits.
      expect(play(wave, team({ interceptCharged: true })).intercepts).toBe(1);
      expect(play(wave, team({ interceptArea: true })).intercepts).toBe(1);
    });
  });

  describe('Night Watch takes the first Charged hit each boss turn, cut to a quarter', () => {
    const wave = (id: string) =>
      move({ anchor: 'front', shape: 'row' }, { id, name: id, powerBp: 20_000, charged: true });

    it('it intercepts one Charged hit a boss turn for a creature in its row, and does not also take its own', () => {
      const arena = boss({ cols: 4, atk: 400, moves: [wave('w1'), wave('w2')] });
      const team = [
        ...[0, 1, 2].map((c) => spec({ name: `C${c}`, col: c, maxHp: 100_000 })),
        spec({ name: 'W', role: 'guard', col: 3, maxHp: 100_000, fx: { interceptCharged: true } }),
      ];
      // Both moves are Charged rows over four creatures. Night Watch intercepts the first target of the first move only: its own hit
      // of that move is skipped, and it takes no second intercept this boss turn.
      const r = play(arena, team);
      expect(r.intercepts).toBe(1);
      // One hit taken for C0 (w1), and its own hit from w2 (not skipped: it took nothing of w2).
      expect(count(r, 'hit', 'W')).toBe(2);
      expect(texts(r, 'intercept')).toEqual(['W intercepts for C0']);
    });

    it('the hit it takes is cut to a quarter: more than its cover cut, the most any cut can take', () => {
      const arena = mover(
        { anchor: 'front', shape: 'row' },
        1,
        3,
        { atk: 1_000 },
        { charged: true },
      );
      const team = [
        spec({ name: 'A' }),
        spec({ name: 'B', col: 1 }),
        spec({
          name: 'W',
          role: 'guard',
          col: 2,
          baseArmour: 5,
          fx: { interceptCharged: true, watchCutBp: 7_500 },
        }),
      ];
      // 1000 x 1.0 = 1000 raw, cut by its own 75% (more than the cover's 40%), minus its armour.
      expect(takes(play(arena, team), 'W')[0]).toBe(250 - 5);
    });
  });

  describe('Catch the Bolts takes an area hit with its cover cut', () => {
    const team = (fx: object) => [
      spec({ name: 'A', maxHp: 100_000, atk: 150 }),
      spec({ name: 'G', role: 'guard', col: 1, baseArmour: 5, maxHp: 100_000, fx }),
      spec({ name: 'B', col: 2, maxHp: 100_000 }),
    ];
    const sweep = mover({ anchor: 'front', shape: 'row' }, 1, 3, { atk: 1_000 });

    it('an area hit it intercepts is cut by its cover (40%), where it used to land whole', () => {
      const r = play(sweep, team({ interceptArea: true }));
      expect(r.intercepts).toBe(1);
      expect(takes(r, 'G')[0]).toBe(600 - 5);
      // The creature it covered took nothing from that hit.
      expect(takes(r, 'A')).toEqual([]);
    });

    it('without it, a Guard does not take area hits: every creature takes its own', () => {
      const r = play(sweep, team({}));
      expect(r.intercepts).toBe(0);
      // A and B stand in the Guard's reach, so their own hits are covered by it.
      expect(takes(r, 'A')).toEqual([600]);
    });

    it('a hit aimed at one creature is taken by the Guard whole (the cut is for area hits)', () => {
      const aimed = mover({ anchor: 'strongest', shape: 'single' }, 1, 3, { atk: 1_000 });
      const r = play(aimed, team({ interceptArea: true }));
      expect(r.intercepts).toBe(1);
      expect(takes(r, 'G')).toEqual([1_000 - 5]);
    });
  });
});

describe('Taunt moves only the attacks that have an anchor (R9)', () => {
  const team = () => [
    spec({ name: 'A', role: 'guard' }),
    spec({ name: 'B', role: 'payoff', element: 'spark', col: 1 }),
    spec({ name: 'T', role: 'guard', col: 2, fx: { taunt: true } }),
  ];
  const plainAttack = (pattern: Parameters<typeof striker>[1]) =>
    striker({ cols: 3, rounds: 6 }, pattern);

  it('an anchored plain attack goes to the taunter, whatever its anchor', () => {
    for (const anchor of ['random', 'front', 'strongest', 'weakest'] as const) {
      const r = play(plainAttack({ anchor, shape: 'single' }), team(), {}, seeded(anchor));
      expect(new Set(slotsHit(r, 'plain'))).toEqual(new Set(['0,2']));
    }
  });

  it('a scatter, a random row and everything ignore it', () => {
    // The scatter's one pick is the creature at index 1 (the draw after the three creatures' crit rolls), not the taunter.
    const scatter = playScripted(
      plainAttack({ anchor: 'random', shape: 'scatter', n: 1 }),
      team(),
      [NO, NO, NO, 1],
    );
    expect(aimedAt(scatter.res, 'plain')[0]).toBe('B');
    const all = play(plainAttack({ anchor: 'random', shape: 'all' }), team());
    expect(slotsHit(all, 'plain')).toHaveLength(18);
  });

  it('Taunt draws the first anchor of a plain attack; the others follow the anchor rule', () => {
    const arena = striker(
      { cols: 4, atk: 1 },
      { anchor: 'strongest', shape: 'single', anchors: 2 },
    );
    const crew = [
      spec({ name: 'S1', atk: 150 }),
      spec({ name: 'S2', atk: 120, col: 1 }),
      spec({ name: 'S3', col: 2 }),
      spec({ name: 'T', col: 3, fx: { taunt: true } }),
    ];
    // The taunter first, then the strongest creature.
    expect(aimedAt(play(arena, crew), 'plain')).toEqual(['T', 'S1']);
  });
});

describe('patterns and anchors (R2)', () => {
  const guards = (cols: number, rows = 1) =>
    Array.from({ length: rows * cols }, (_, i) =>
      spec({
        name: `C${Math.floor(i / cols)}${i % cols}`,
        role: 'guard',
        row: Math.floor(i / cols),
        col: i % cols,
      }),
    );

  it('row ends are arena slots: the first and last slot of each row; an empty end slot is skipped (R21.1)', () => {
    const arena = mover({ anchor: 'front', shape: 'rowEnds', n: 1 }, 2, 5);
    // Creatures stand at 1, 2 and 3 only: both end slots are empty, so nothing is hit.
    expect(slotsHit(play(arena, row([1, 2, 3])), 'm')).toEqual([]);
    // One end slot filled: only it is hit, not the first living creature from the other end.
    expect(slotsHit(play(arena, row([1, 2, 4])), 'm')).toEqual(['0,4']);
    // Both ends, in both rows.
    const both = [...row([0, 2, 4]), ...row([0, 3, 4], {}, 1)];
    expect(slotsHit(play(arena, both), 'm').sort()).toEqual(['0,0', '0,4', '1,0', '1,4']);
  });

  it('n slots from each end', () => {
    const arena = mover({ anchor: 'front', shape: 'rowEnds', n: 2 }, 1, 6);
    expect(slotsHit(play(arena, row([0, 1, 2, 3, 4, 5])), 'm').sort()).toEqual([
      '0,0',
      '0,1',
      '0,4',
      '0,5',
    ]);
  });

  it('a chain path is fixed before any hit lands: dodges and intercepts do not change it', () => {
    const arena = mover({ anchor: 'front', shape: 'chain', n: 2, decayBp: 6_000 }, 1, 3);
    const team = [
      spec({ name: 'A', fx: { dodgeBonusBp: 5_000 } }),
      spec({ name: 'G', role: 'guard', col: 1 }),
      spec({ name: 'T', col: 2 }),
    ];
    // The dodge roll of the front creature is the fourth draw (after the three creatures' crit rolls).
    const path = (dodge: number) => {
      const { res } = playScripted(arena, team, [NO, NO, NO, dodge]);
      return { slots: slotsHit(res, 'm'), dodged: count(res, 'dodge') };
    };
    expect(path(YES).dodged).toBe(1);
    expect(path(NO).dodged).toBe(0);
    expect(path(YES).slots).toEqual(path(NO).slots);
    expect(path(NO).slots).toEqual(['0,0', '0,1', '0,2']);
  });

  it('a chain deals a share of the hit before at each jump', () => {
    const arena = mover({ anchor: 'front', shape: 'chain', n: 2, decayBp: 6_000 }, 1, 3, {
      atk: 1_000,
    });
    const r = play(
      arena,
      [0, 1, 2].map((c) => spec({ name: `C${c}`, col: c, maxHp: 100_000, atk: 100 + c })),
    );
    // Full, then 60%, then 60% of that.
    expect([takes(r, 'C0'), takes(r, 'C1'), takes(r, 'C2')]).toEqual([[1_000], [600], [360]]);
  });

  it('a count with perColumns grows with the arena width, at least 1', () => {
    const scatter = (cols: number) =>
      mover({ anchor: 'random', shape: 'scatter', n: 2, perColumns: 4 }, 3, cols);
    const hits = (cols: number) =>
      slotsHit(play(scatter(cols), guards(cols, 3), {}, seeded('pc')), 'm').length;
    expect([4, 8, 12, 1].map(hits)).toEqual([2, 4, 6, 1]);
    const fixed = mover({ anchor: 'random', shape: 'scatter', n: 2 }, 3, 8);
    expect(slotsHit(play(fixed, guards(8, 3), {}, seeded('pc')), 'm')).toHaveLength(2);
  });

  describe('every move with a roll in its targets is announced at round start', () => {
    const rolled = [
      { anchor: 'random', shape: 'scatter', n: 2 },
      { anchor: 'random', shape: 'single' },
      { anchor: 'random', shape: 'randomRow' },
      { anchor: 'random', shape: 'column' },
    ] as const;

    it.each(rolled)(
      '%j: the log carries the move id and its slots, and the landing hits exactly those',
      (pattern) => {
        const arena = mover(pattern, 2, 3);
        for (let i = 0; i < 4; i++) {
          const r = play(arena, guards(3, 2), {}, seeded(`an${i}`));
          const ann = r.events.filter((e) => e.kind === 'announce');
          expect(ann).toHaveLength(1);
          expect(ann[0]?.move).toBe('m');
          const shown = (ann[0]?.slots ?? []).map(([a, b]) => `${a},${b}`);
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
      const aim = { anchor: 'strongest', shape: 'single' } as const;
      expect(count(play(mover(aim, 2, 3), guards(3, 2)), 'announce')).toBe(0);
      expect(count(play(mover(aim, 2, 3, {}, { charged: true }), guards(3, 2)), 'announce')).toBe(
        1,
      );
    });

    it('an announced random move never re-aims when a target falls first', () => {
      // Round start shows every creature; the boss turn before the scatter knocks the front one out; it is skipped.
      const kill = move(
        { anchor: 'front', shape: 'single' },
        { id: 'kill', name: 'Kill', powerBp: 100_000 },
      );
      const scatter = move({ anchor: 'random', shape: 'scatter', n: 6 }, { turn: 1 });
      const arena = boss({ rows: 2, cols: 3, atk: 500, moves: [kill, scatter] });
      const r = play(arena, guards(3, 2));
      const shown = (r.events.find((e) => e.kind === 'announce')?.slots ?? []).map(
        ([a, b]) => `${a},${b}`,
      );
      expect(shown).toHaveLength(6);
      const landed = slotsHit(r, 'm');
      expect(landed).toHaveLength(5);
      for (const slot of landed) expect(shown).toContain(slot);
      expect(landed).not.toContain('0,0');
    });
  });

  describe('an aimed shape may have several anchors (balance pass, 2026-10-29)', () => {
    const atks = (...xs: number[]) =>
      xs.map((atk, c) => spec({ name: `C${c}`, role: 'guard', atk, col: c }));

    it('single with anchors: aimed at that many different creatures, the best matches in order', () => {
      const arena = mover({ anchor: 'strongest', shape: 'single', anchors: 3 }, 1, 4);
      // The three highest Attacks: the two 165s first, then 149; the 100 is left out.
      const r = play(arena, atks(100, 165, 149, 165));
      expect(new Set(slotsHit(r, 'm'))).toEqual(new Set(['0,1', '0,2', '0,3']));
      expect(aimedAt(r, 'm')).toEqual(['C1', 'C3', 'C2']);
    });

    it('a count with perColumns grows with the width, and without `anchors` an aimed move has one', () => {
      const hits = (pattern: Parameters<typeof mover>[0], cols: number) =>
        slotsHit(play(mover(pattern, 3, cols), guards(cols, 3)), 'm').length;
      const scaled = { anchor: 'strongest', shape: 'single', anchors: 1, perColumns: 4 } as const;
      expect([4, 8, 12].map((c) => hits(scaled, c))).toEqual([1, 2, 3]);
      expect([4, 8, 12].map((c) => hits({ anchor: 'strongest', shape: 'single' }, c))).toEqual([
        1, 1, 1,
      ]);
    });

    it('each anchor of a line of three takes the aimed hit, and its neighbours the area hits', () => {
      const arena = mover({ anchor: 'strongest', shape: 'line3', anchors: 2 }, 2, 6);
      // Two strong creatures far apart in the front row, plain ones between and around them.
      const r = play(arena, atks(100, 165, 100, 100, 165, 100));
      // The two anchors, each with its row neighbours: every slot of the row once.
      expect(new Set(slotsHit(r, 'm'))).toEqual(
        new Set(['0,0', '0,1', '0,2', '0,3', '0,4', '0,5']),
      );
      expect(slotsHit(r, 'm')).toHaveLength(6);
    });

    it('each further anchor is the best match not already inside the move shape (R2.1, panel 5)', () => {
      const arena = mover({ anchor: 'strongest', shape: 'line3', anchors: 2 }, 1, 6);
      // 165 and 165 stand side by side: the first anchor's line of three already holds both, so the second anchor is the
      // strongest creature outside it (149 at column 4), not the second 165.
      const r = play(arena, atks(100, 165, 165, 100, 149, 100));
      expect(new Set(slotsHit(r, 'm'))).toEqual(
        new Set(['0,0', '0,1', '0,2', '0,3', '0,4', '0,5']),
      );
      // Without the rule the second anchor would be column 2 and the right half of the row would go untouched.
      expect(aimedAt(r, 'm').indexOf('C4')).toBeGreaterThan(2);
    });
  });

  it('moves on one boss turn land in the boss card order, not by power, cadence or name; the plain attack comes after them (R8.3)', () => {
    const m = (id: string, name: string, powerBp: number, every: number) =>
      move({ anchor: 'front', shape: 'single' }, { id, name, powerBp, every });
    const arena = striker({
      cols: 2,
      rounds: 4,
      moves: [m('c', 'Zeta', 1_000, 1), m('a', 'Alpha', 9_000, 2), m('b', 'Mid', 5_000, 1)],
    });
    const r = play(arena, row([0, 1]));
    const order = (round: number) =>
      r.events
        .filter((e) => e.round === round && (e.kind === 'move' || e.kind === 'target'))
        .map((e) => (e.kind === 'move' ? e.text : (/<- (\w+)$/.exec(e.text)?.[1] ?? e.text)))
        .filter((t) => ['Zeta', 'Alpha', 'Mid', 'plain'].includes(t));
    expect(order(1)).toEqual(['Zeta', 'Mid', 'plain']);
    expect(order(2)).toEqual(['Zeta', 'Alpha', 'Mid', 'plain']);
  });
});

describe('wards and Breakwater: a boss whose waves break on wards', () => {
  /** The creature behind the ward's row takes a row sweep of 110: a Row Ward (a cut on area hits for its row) stands at the end. */
  const taken = (wardBp: number | undefined, fx: object) => {
    const arena = striker(
      { cols: 3, atk: 110, ...(wardBp === undefined ? {} : { mods: { wardBp } }) },
      { anchor: 'front', shape: 'row' },
    );
    const team = [
      spec({ name: 'T', baseArmour: 5 }),
      spec({ name: 'K', role: 'guard', col: 2, fx }),
    ];
    return takes(play(arena, team), 'T')[0];
  };
  const ward = { rowAreaCutBp: 2_000 };

  it('cuts more of its sweeps for a Row Ward, and nothing more for a party without one', () => {
    expect(taken(undefined, {})).toBe(110 - 5);
    // A Row Ward cuts 20% of an area hit: 88.
    expect(taken(undefined, ward)).toBe(88 - 5);
    // Three times as much: 60%: 44.
    expect(taken(30_000, ward)).toBe(44 - 5);
    // No ward in the row: the multiplier changes nothing. A multiplier of 1 changes nothing either.
    expect(taken(30_000, {})).toBe(110 - 5);
    expect(taken(10_000, ward)).toBe(88 - 5);
  });

  it('a creature beside a ward aura is cut too', () => {
    expect(taken(undefined, { besideAreaCutBp: 2_000 })).toBe(110 - 5);
    const beside = (wardBp?: number) => {
      const arena = striker(
        { cols: 2, atk: 110, ...(wardBp === undefined ? {} : { mods: { wardBp } }) },
        { anchor: 'front', shape: 'row' },
      );
      return takes(
        play(arena, [
          spec({ name: 'T', baseArmour: 5 }),
          spec({ name: 'K', role: 'guard', col: 1, fx: { besideAreaCutBp: 2_000 } }),
        ]),
        'T',
      )[0];
    };
    // Beside the ward: the Guard's own 40% cover multiplies with the ward's 20%: 110 x 0.6 x 0.8 = 52.
    expect(beside()).toBe(52 - 5);
    // Three times the ward (60%) and the cover would leave 24%: the total cut stops at 75%, a quarter of the hit.
    expect(beside(30_000)).toBe(27 - 5);
  });

  it('never cuts more than 75% of a hit, however large the multiplier', () => {
    const huge = taken(1_000_000, { rowAreaCutBp: 5_000 });
    expect(taken(100_000, { rowAreaCutBp: 5_000 })).toBe(huge);
    // Armour comes off after the cuts: a quarter of the raw hit is left, whatever the multiplier.
    expect(huge).toBe(Math.floor(110 / 4) - 5);
  });
});

describe('the strength of the boss gates and rule cards (Misa, 2026-10-29)', () => {
  const strength = (b: ReturnType<typeof boss>, strengthBp: number) => ({ ...b, strengthBp });

  it('Reflective Hide returns the card strength of the reaction bonus, and the rest lands', () => {
    const base = boss({ cols: 2, rounds: 6, mods: { reflectFirst: true } });
    const team = [
      spec({ name: 'S', maxHp: 100_000 }),
      spec({ name: 'P', role: 'payoff', element: 'spark', col: 1, maxHp: 100_000 }),
    ];
    const run = (st: number) => {
      const r = play(strength(base, st), team);
      return {
        back: texts(r, 'reflect').map((t) => Number(/reflects (\d+)/.exec(t)?.[1])),
        damage: r.damage,
      };
    };
    // The first reaction after each boss turn bounces: not in round 1 (no boss turn yet), then in rounds 2 to 6.
    expect(run(10_000).back).toEqual([100, 100, 100, 100, 100]);
    expect(run(5_000).back).toEqual([50, 50, 50, 50, 50]);
    expect(run(0).back).toEqual([0, 0, 0, 0, 0]);
    // What does not bounce lands on the boss: a weaker card costs the team less. Six Setter hits of 100 and six Payoff hits of 100.
    expect(run(0).damage).toBe(600 + 6 * 200);
    expect(run(5_000).damage).toBe(600 + 6 * 200 - 5 * 50);
    expect(run(10_000).damage).toBe(600 + 6 * 200 - 5 * 100);
  });

  it('Shake It Off clears the card strength of the Mired, all of it at full strength', () => {
    const song = [spec({ name: 'S', fx: { miresAtStart: true } })];
    const left = (st: number, every: number, rounds: number) =>
      mired(play(strength(boss({ rounds, mods: { shakeEvery: every } }), st), song)).at(-1);
    expect(left(10_000, 1, 1)).toBe('Mired x0');
    // The song adds three stacks over three rounds and one fades after round 2: at the end of round 3 there are two.
    expect(left(10_000, 3, 3)).toBe('Mired x0');
    expect(left(5_000, 3, 3)).toBe('Mired x1');
    expect(left(0, 3, 3)).toBe('Mired x2');
  });

  it('a silence hits the strength share of its slots and lasts that share of its turns (at least one)', () => {
    const team = [0, 1, 2, 3].map((c) => spec({ name: `C${c}`, col: c }));
    const gate = (st: number, turns: number, rolls: number[]) => {
      const arena = boss({ cols: 4, moves: [hush('all', turns, 0, { strengthBp: st })] });
      // The four creatures' crit rolls come first, then one roll for each slot the gate picks.
      const { res, draws } = playScripted(arena, team, [NO, NO, NO, NO, ...rolls]);
      const said = texts(res, 'silence');
      return {
        silenced: said.filter((t) => /is silenced/.test(t)).length,
        spared: said.filter((t) => /spared/.test(t)).length,
        turns: res.fighters.map((f) => f.silencedTurns),
        draws,
      };
    };
    // Full strength rolls nothing and silences every slot for the full turns.
    expect(gate(10_000, 2, [])).toEqual({ silenced: 4, spared: 0, turns: [2, 2, 2, 2], draws: 4 });
    // Half: each slot rolls 50%; the silence lasts half as long (at least one turn).
    expect(gate(5_000, 2, [YES, NO, YES, NO])).toEqual({
      silenced: 2,
      spared: 2,
      turns: [1, 0, 1, 0],
      draws: 8,
    });
    expect(gate(5_000, 4, [YES, YES, YES, YES]).turns).toEqual([2, 2, 2, 2]);
    expect(gate(2_500, 2, [YES, YES, YES, YES]).turns).toEqual([1, 1, 1, 1]);
    // None: nobody is silenced.
    expect(gate(0, 2, [YES, YES, YES, YES]).silenced).toBe(0);
  });

  it('a one-shot deals the strength share of the target Max HP, and a cover still cuts it', () => {
    const bolt = (st: number, shape: 'single' | 'row' = 'single') =>
      boss({
        cols: 2,
        moves: [
          move(
            { anchor: 'payoff', shape },
            { id: 'bolt', name: 'Bolt', powerBp: 70_000, oneShotBp: 12_000, strengthBp: st },
          ),
        ],
      });
    const left = (
      st: number,
      shape: 'single' | 'row' = 'single',
      team = [spec({ name: 'T', baseArmour: 5, role: 'payoff', element: 'spark' })],
    ) => by(play(bolt(st, shape), team), 'T').hp;
    // 120% of Max HP at full strength knocks it out; 60% at half strength, minus armour 5; 24% at a fifth.
    expect(left(10_000)).toBe(0);
    expect(left(5_000)).toBe(400 - (240 - 5));
    expect(left(2_000)).toBe(400 - (96 - 5));
    // A row sweep of it is an area hit: the Guard's cover (40%) comes off the 240 before the armour.
    const covered = [
      spec({ name: 'T', baseArmour: 5, role: 'payoff', element: 'spark' }),
      spec({ name: 'G', role: 'guard', col: 1 }),
    ];
    expect(left(5_000, 'row', covered)).toBe(400 - (144 - 5));
  });
});
