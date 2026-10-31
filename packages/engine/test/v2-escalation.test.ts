/**
 * Combat v2: the boss's Build-up (R22: steps, phases, feeds, strength, how Mired slows it) and Mired itself (stacks, fading, Clinging,
 * Wicked, Shake It Off). Creatures and boss are built by hand with their effects named directly; the dice are scripted or a fixed
 * seed checks an invariant of the whole fight. These were the lab's `engine`, `strength` and `talents` rule tests about escalation.
 */
import type { BossDef, BossMove, Escalation, FightResult } from '@creatures/engine/v2';
import { describe, expect, it } from 'vitest';
import {
  boss,
  by,
  count,
  mired,
  move,
  play,
  playScripted,
  playWeekend,
  seeded,
  spec,
  striker,
  takes,
  texts,
  member,
} from './v2-helpers';

const esc = (over: Partial<Escalation> = {}): Escalation => ({
  name: 'Test Heat',
  feed: 'rounds',
  per: 4,
  cap: 4,
  grow: { atkBp: 5_000 },
  ...over,
});
const arena = (e: Escalation, over: Partial<BossDef> = {}): BossDef =>
  boss({ cols: 3, rounds: 3, atk: 1, escalation: e, ...over });
/** A Setter, a Payoff and a Guard: three creatures that do not need to be any more than that. */
const team = () => [
  spec({ name: 'S' }),
  spec({ name: 'P', role: 'payoff', element: 'spark', col: 1 }),
  spec({ name: 'G', role: 'guard', col: 2 }),
];
const song = (over = {}) => spec({ name: 'Song', fx: { miresAtStart: true }, ...over });
const stepRounds = (r: FightResult) =>
  r.events.filter((e) => e.kind === 'escalation' && e.text.includes(': step ')).map((e) => e.round);
const phaseMove: BossMove = move(
  { anchor: 'front', shape: 'single' },
  { id: 'p2', name: 'Second Wind', powerBp: 1 },
);

describe('the Build-up carries across a raid weekend like HP (R22)', () => {
  const weekend = (b: BossDef, stages: number) =>
    playWeekend(
      b,
      team().map((t) => member(t)),
      [],
      { stages },
    );

  it('step and count carry: the rounds feed counts the weekend, not the stage', () => {
    // 3 rounds a stage, a step per 4 rounds: never in one stage, but the weekend's 4th round steps it.
    const w = weekend(arena(esc()), 3);
    expect(w.stages.map((s) => s.escalation?.step)).toEqual([0, 1, 2]);
    expect(w.stages.map((s) => s.escalation?.count)).toEqual([3, 6, 9]);
  });

  it('a phase stays in once it has begun, and an event feed keeps counting', () => {
    const boss2 = arena(
      esc({ per: 1, cap: 2, phase: { atStep: 1, name: 'P2', moves: [phaseMove] } }),
    );
    const w = weekend(boss2, 2);
    expect(w.stages[0]?.escalation?.phase).toBe(true);
    const second = play(boss2, team(), { carryEscalation: { step: 1, phase: true, count: 3 } });
    // The phase moves are in play from round 1 of the next stage, with no new phase announcement.
    expect(
      second.events
        .filter((e) => e.kind === 'move' && e.text === 'Second Wind')
        .map((e) => e.round),
    ).toEqual([1, 2, 3]);
    expect(count(second, 'phase')).toBe(0);
    // Reactions it has taken carry as well.
    const reactions = arena(esc({ feed: 'reactions', per: 5, cap: 9 }));
    const carried = play(reactions, team(), {
      carryEscalation: { step: 0, phase: false, count: 4 },
    });
    expect(carried.escalation?.count).toBe(4 + carried.reactions);
    expect(carried.reactions).toBe(3);
  });

  it('a phase change is announced a round ahead and Mired does not stop it; the announcement carries over a stage break', () => {
    const phased = esc({ per: 2, cap: 2, phase: { atStep: 1, name: 'P2', moves: [phaseMove] } });
    for (const crew of [team(), [song(), ...team().slice(1)]]) {
      const r = play(arena(phased, { rounds: 8 }), crew);
      const ahead = r.events.find((e) => e.kind === 'announce' && /begins next round/.test(e.text));
      const applied = r.events.find((e) => e.kind === 'phase');
      // The feed reaches 2 rounds at round 3's start: announced then, applied at round 4's start, Mired or not.
      expect(ahead?.round).toBe(3);
      expect(applied?.round).toBe(4);
    }
    // Announced in the last round, it applies in the next stage's first.
    const w = playWeekend(
      arena(phased),
      team().map((t) => member(t)),
      [],
      { stages: 2 },
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
      const b = arena(esc({ feed, per: 1_000_000, cap: 1 }), {
        hp: 400,
        atk: 40,
        spd: 5,
        mods: { shedMarks: true },
        plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 10_000, hits: 1 },
      });
      const w = playWeekend(
        b,
        team().map((t) => member({ ...t, spd: 20 })),
        [member({ name: 'Bench', role: 'guard' })],
        { stages: 3 },
        seeded(`carry-${feed}`),
      );
      let last = 0;
      for (const st of w.stages) {
        const c = st.escalation?.count ?? 0;
        expect(c, feed).toBeGreaterThanOrEqual(last);
        last = c;
      }
    }
  });
});

describe('steps and bars (R22)', () => {
  it('an event feed with perColumns needs more units a step in a wider arena; a feed without it does not', () => {
    const e = esc({ feed: 'reactions', per: 2, perColumns: 4, cap: 9 });
    const nextAt = (cols: number, x: Escalation) =>
      play(arena(x, { cols, rounds: 1 }), team()).escalation?.nextAt;
    // Step 1 needs `per` units for 4 columns: 2 at 4, 4 at 8, 1 at 2 (at least 1).
    expect(nextAt(4, e)).toBe(2);
    expect(nextAt(8, e)).toBe(4);
    expect(nextAt(2, e)).toBe(1);
    expect(nextAt(8, esc({ feed: 'reactions', per: 2, cap: 9 }))).toBe(2);
  });

  it('at most one step a round, at round start, announced before the boss turn', () => {
    const r = play(striker({ cols: 3, rounds: 6, escalation: esc({ per: 1, cap: 5 }) }), team(), {
      carryEscalation: { step: 0, phase: false, count: 100 },
    });
    expect(stepRounds(r)).toEqual([1, 2, 3, 4, 5]);
    expect(r.escalation?.step).toBe(5);
    const firstTurnEvent = r.events.findIndex((e) => e.round === 1 && e.kind === 'target');
    const firstStep = r.events.findIndex((e) => e.kind === 'escalation');
    expect(firstTurnEvent).toBeGreaterThan(-1);
    expect(firstStep).toBeLessThan(firstTurnEvent);
  });

  it('growth adds up in a straight line: step 3 adds three times what step 1 does', () => {
    const b = striker({
      rounds: 4,
      atk: 100,
      escalation: esc({ per: 1, cap: 3, grow: { atkBp: 10_000 } }),
    });
    const r = play(b, [spec({ baseArmour: 5, maxHp: 100_000 })]);
    // Steps 0, 1, 2, 3 add 0, 100, 200, 300 percent of 100: not 100, 200, 400, 800.
    expect(takes(r, 'A')).toEqual([100, 200, 300, 400].map((a) => a - 5));
  });

  it('a step grows the boss by the strength share', () => {
    const grow = esc({ per: 1, cap: 3, grow: { atkBp: 10_000, jumps: 2 } });
    const hits = (strengthBp: number, e: Escalation = grow) =>
      takes(
        play(striker({ rounds: 6, atk: 100, strengthBp, escalation: e }), [
          spec({ baseArmour: 5, maxHp: 100_000 }),
        ]),
        'A',
      );
    // After the cap (round 4 on) the hit is 4x at full strength, 2.5x at half and 1x with none.
    expect(hits(10_000).at(-1)).toBe(400 - 5);
    expect(hits(5_000).at(-1)).toBe(250 - 5);
    expect(hits(0).at(-1)).toBe(100 - 5);
    // A step's own strength overrides the boss's.
    expect(hits(10_000, { ...grow, strengthBp: 0 }).at(-1)).toBe(100 - 5);
  });

  it('a step can add more hits, jumps and targets to the boss', () => {
    const plain = (grow: Escalation['grow']) =>
      striker({ rounds: 3, cols: 2, escalation: esc({ per: 1, cap: 2, grow }) });
    const hitsOnA = (grow: Escalation['grow']) =>
      count(
        play(plain(grow), [spec({ name: 'A', maxHp: 100_000 }), spec({ name: 'B', col: 1 })]),
        'target',
      );
    // One plain hit a round; a step adds one: rounds 1 to 3 give 1 + 2 + 3 hits (steps 0, 1, 2).
    expect(hitsOnA({ hits: 1 })).toBe(1 + 2 + 3);
  });

  it('a falling armour comes in on the steps Mired does not slow (R22.3)', () => {
    // A step is Attack up and armour down together; Mired holds the first back, never the second.
    const b = arena(esc({ per: 1, cap: 3, grow: { atkBp: 5_000, armour: -30 } }), {
      rounds: 4,
      armour: 200,
    });
    const free = play(b, team());
    const slowed = play(b, [song(), ...team().slice(1)]);
    expect(free.escalation?.step).toBe(3);
    expect(free.escalation?.fallStep).toBe(3);
    // Mired: the boss-helping step is behind, the falling one is not.
    expect(slowed.escalation?.step).toBeLessThan(3);
    expect(slowed.escalation?.fallStep).toBe(3);
    // A growth with no falling part keeps one count: nothing to split.
    const noFall = play(arena(esc({ per: 1, cap: 3 }), { rounds: 4 }), [
      song(),
      ...team().slice(1),
    ]);
    expect(noFall.escalation?.fallStep).toBe(noFall.escalation?.step);
    // The falling step carries across a weekend with the others.
    const w = playWeekend(
      b,
      team().map((t) => member(t)),
      [],
      { stages: 2 },
    );
    expect(w.stages[1]?.escalation?.fallStep).toBeGreaterThanOrEqual(
      w.stages[0]?.escalation?.fallStep ?? 0,
    );
  });

  it('Mired slows a step instead of freezing it', () => {
    const b = arena(esc({ per: 1, cap: 1 }), { rounds: 8 });
    const free = play(b, team());
    const slowed = play(b, [song(), ...team().slice(1)]);
    // Free: the count reaches 1 at round 2. Mired: a quarter of a step's units more per stack, so the step comes later but does come.
    expect(stepRounds(free)).toEqual([2]);
    expect(stepRounds(slowed)).toEqual([3]);
    expect(
      slowed.events.some((e) => e.kind === 'escalation' && e.text.includes('slowed by the Mired')),
    ).toBe(true);
  });
});

describe('Mired (R22.3, panel 3)', () => {
  const sing = (talent: object, rounds: number, over: Partial<BossDef> = {}) =>
    play(boss({ rounds, ...over }), [spec({ name: 'S', fx: { miresAtStart: true, ...talent } })]);

  it('Mired fades by 1 at the end of every second round, so Squelch Song alone builds stacks', () => {
    // The song adds a stack at each round start; the fade comes at the end of rounds 2, 4 and 6.
    expect(mired(sing({}, 6))).toEqual([
      'Mired x1',
      'Mired x2',
      'Mired x1',
      'Mired x2',
      'Mired x3',
      'Mired x2',
      'Mired x3',
      'Mired x4',
      'Mired x3',
    ]);
  });

  it('Clinging: Mired fades only every third round while it stands', () => {
    const r = sing({ clinging: true }, 6);
    // With Clinging the fade comes at the end of rounds 3 and 6 only.
    expect(mired(r)).toEqual([
      'Mired x1',
      'Mired x2',
      'Mired x3',
      'Mired x2',
      'Mired x3',
      'Mired x4',
      'Mired x5',
      'Mired x4',
    ]);
    // It held back the base fade at the end of rounds 2 and 4.
    expect(by(r, 'S').fires['clinging']).toBe(2);
  });

  it('a Mired stack takes more off the boss damage while Clinging stands', () => {
    // Round 1: the song has put x1 on the boss before it hits the strongest creature, which does not dodge.
    const aimed = striker({ cols: 2, atk: 1_000 }, { anchor: 'strongest', shape: 'single' });
    const hit = (fx: object) =>
      takes(
        play(aimed, [
          spec({ name: 'S', fx: { miresAtStart: true, ...fx } }),
          spec({ name: 'T', baseArmour: 5, atk: 150, col: 1 }),
        ]),
        'T',
      )[0];
    // 1.5% a stack: 985 of 1000; with Clinging 2.25% a stack: 977.
    expect(hit({})).toBe(985 - 5);
    expect(hit({ clinging: true })).toBe(977 - 5);
  });

  it('Wicked: its Mired has its number as the chance to add 1 extra stack', () => {
    const roll = (draw: number, fx: object = { miredExtraBp: 3_000 }) =>
      mired(playScripted(boss(), [spec({ fx: { miresAtStart: true, ...fx } })], [draw]).res);
    expect(roll(2_999)).toEqual(['Mired x2']);
    expect(roll(3_000)).toEqual(['Mired x1']);
    // Without it, never, and no die is drawn for it.
    const none = playScripted(boss(), [spec({ fx: { miresAtStart: true } })], [0]);
    expect(mired(none.res)).toEqual(['Mired x1']);
  });

  it('Sticky Mud: each hit it takes puts a Mired stack on the boss, Blocked or not', () => {
    const hit = (armour: number) =>
      mired(
        play(striker({ rounds: 2 }), [
          spec({ role: 'guard', baseArmour: armour, fx: { miresOnHit: true } }),
        ]),
      );
    expect(hit(0)).toEqual(['Mired x1', 'Mired x2', 'Mired x1']);
    expect(hit(50)).toEqual(['Mired x1', 'Mired x2', 'Mired x1']);
  });

  it('Mired takes off the boss damage and its dodge, per stack, and stops at the most stacks', () => {
    const aimed = (rounds: number) => striker({ rounds, atk: 1_000 });
    const r = play(aimed(8), [spec({ name: 'S', maxHp: 100_000, fx: { miresAtStart: true } })]);
    // Round 1: x1 (985 of 1000). The most a fight holds is 5 stacks.
    expect(takes(r, 'S')[0]).toBe(985);
    expect(Math.max(...mired(r).map((t) => Number(t.split('x')[1])))).toBeLessThanOrEqual(5);
  });

  it('Shake It Off: announced at round start, the boss clears every debuff when that round ends', () => {
    const r = play(boss({ rounds: 4, mods: { shakeEvery: 3 } }), [
      spec({ name: 'S', fx: { miresAtStart: true } }),
    ]);
    expect(r.events.filter((e) => e.kind === 'announce')).toHaveLength(1);
    expect(r.events.find((e) => e.kind === 'announce')?.round).toBe(3);
    expect(texts(r, 'shake')).toHaveLength(1);
    // x1, x2 (faded to x1 at the end of round 2), x2 in round 3, shaken to x0, round 4 starts from nothing.
    expect(mired(r)).toEqual([
      'Mired x1',
      'Mired x2',
      'Mired x1',
      'Mired x2',
      'Mired x0',
      'Mired x1',
      'Mired x0',
    ]);
  });
});
