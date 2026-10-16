import { describe, expect, it } from 'vitest';
import type { Gimmick } from '@creatures/game';
import {
  beatEnds,
  beatTiming,
  describeEvent,
  simulateFight,
  type FightInput,
  type Mutator,
} from '../src/index';
import { eventsOf, input, rng, run } from './helpers';
import { everyRound, fightWith, rowOf, rulesOf } from './pattern-helpers';

/**
 * Enrage (`FightInput.enrage`): when the base rounds run out with the boss and a creature standing,
 * up to `rounds` more rounds are played. In each the creatures take their turns, the boss makes its
 * plain attack and then hits every living creature for `powerBp` of its Attack (area hits).
 * Gimmicks and finale abilities rest. The boss has Attack 100, so 20000 deals 200.
 */

const ENRAGE = { rounds: 2, powerBp: 20_000 };
const enrageHits = (r: { events: unknown[] }) =>
  (r as Parameters<typeof eventsOf>[0]).events.flatMap((e) =>
    e.t === 'boss_hit' && e.source === 'enrage' ? [[e.round, e.target, e.damage] as const] : [],
  );

describe('enrage rounds', () => {
  it('play after the base rounds run out with both sides standing', () => {
    const r = fightWith(rowOf(3), [], { rounds: 3, extra: { enrage: ENRAGE } });
    expect(r.enraged).toBe(true);
    expect(r.rounds).toBe(5);
    expect(eventsOf(r, 'round_start').map((e) => e.round)).toEqual([1, 2, 3, 4, 5]);
    expect(eventsOf(r, 'enrage')).toEqual([
      { t: 'enrage', round: 4, first: true },
      { t: 'enrage', round: 5, first: false },
    ]);
    // Boss still standing at the end: not cleared.
    expect(r.cleared).toBe(false);
    expect(r.retreated).toBe(false);
  });

  it('are one round_start, the enrage marker, the turns, the plain attack, then a hit on every creature', () => {
    const r = fightWith(rowOf(3), [], {
      rounds: 1,
      extra: { enrage: { rounds: 1, powerBp: 20_000 } },
    });
    const round2 = r.events.filter((e) => 'round' in e && e.round === 2);
    expect(round2.map((e) => (e.t === 'boss_hit' ? `boss_hit:${e.source}` : e.t))).toEqual([
      'round_start',
      'enrage',
      'turn',
      'hit',
      'turn',
      'hit',
      'turn',
      'hit',
      'boss_hit:attack',
      'boss_hit:enrage',
      'boss_hit:enrage',
      'boss_hit:enrage',
      'round_end',
    ]);
    // Every living creature takes 200 (200% of Attack 100) in slot order, as an area hit.
    expect(enrageHits(r)).toEqual([
      [2, 's0', 200],
      [2, 's1', 200],
      [2, 's2', 200],
    ]);
  });

  it('never happen in a fight without `enrage`', () => {
    const r = fightWith(rowOf(3), [], { rounds: 3 });
    expect(r.enraged).toBe(false);
    expect(r.rounds).toBe(3);
    expect(eventsOf(r, 'enrage')).toEqual([]);
    expect(enrageHits(r)).toEqual([]);
    // 0 rounds of enrage is none either.
    const none = fightWith(rowOf(3), [], {
      rounds: 3,
      extra: { enrage: { rounds: 0, powerBp: 20_000 } },
    });
    expect(none).toEqual(r);
  });

  it('do not start when the boss fell in the base rounds', () => {
    // Three creatures of Attack 1 deal about 3 a round; this pool is gone in round 2.
    const r = run(rowOf(3), {
      phase: 'finale',
      bossAtk: 1,
      bossHpPool: { max: 5, current: 5 },
      enrage: ENRAGE,
      boss: { ...input([]).boss, gimmicks: [], finaleRounds: 4 },
    });
    expect(r.bossHpEnd).toBe(0);
    expect(r.enraged).toBe(false);
    expect(r.rounds).toBeLessThan(4);
  });

  it('do not start when the row was wiped out in the base rounds', () => {
    const r = fightWith(rowOf(2, {}, { hp: 150 }), [], {
      rounds: 6,
      extra: { enrage: ENRAGE },
    });
    // The plain attack takes 100 a round, front first: both are down in round 4.
    expect(eventsOf(r, 'knockout').map((e) => [e.round, e.creature])).toEqual([
      [2, 's0'],
      [4, 's1'],
    ]);
    expect(r.rounds).toBe(4);
    expect(r.enraged).toBe(false);
  });

  it('stop on a wipe: the row falls in an enrage round and no more are played', () => {
    // 3 base rounds of 100 on s0, then the enrage rounds: 100 + 200 on s0 and 200 on s1.
    const r = fightWith(rowOf(2, {}, { hp: 450 }), [], {
      rounds: 3,
      extra: { enrage: { rounds: 3, powerBp: 20_000 } },
    });
    expect(eventsOf(r, 'knockout').map((e) => [e.round, e.creature])).toEqual([
      [4, 's0'],
      [5, 's1'],
    ]);
    expect(r.rounds).toBe(5);
    expect(r.enraged).toBe(true);
    expect(r.hpEnd).toEqual({ s0: 0, s1: 0 });
    expect(r.cleared).toBe(false);
    expect(eventsOf(r, 'enrage')).toHaveLength(2);
  });

  it('stop on a kill: the boss falls in an enrage round and takes no further action', () => {
    // Three creatures deal 3 a round (9 in the base rounds); 11 HP leaves 2 for round 4.
    const r = run(rowOf(3), {
      phase: 'finale',
      bossAtk: 100,
      turnOrderOverride: 'left_to_right',
      bossHpPool: { max: 11, current: 11 },
      enrage: { rounds: 3, powerBp: 20_000 },
      boss: { ...input([]).boss, gimmicks: [], finaleRounds: 3 },
    });
    expect(r.bossHpEnd).toBe(0);
    expect(r.cleared).toBe(true);
    expect(r.enraged).toBe(true);
    expect(r.rounds).toBe(4);
    // Round 4 began (the marker is there) but the boss fell before its attack and the enrage hit.
    expect(eventsOf(r, 'enrage')).toEqual([{ t: 'enrage', round: 4, first: true }]);
    expect(enrageHits(r)).toEqual([]);
    expect(eventsOf(r, 'boss_hit').filter((e) => e.round === 4)).toEqual([]);
  });

  it('are an area hit: Guard cover softens it, Shield Walls soften it, the single-hit cap holds', () => {
    // Row of 9: s4 is a Guard in the middle row; s3 and s5 stand beside it.
    const row = rowOf(9, { 4: { role: 'guard' } }, { hp: 100_000 });
    const r = fightWith(row, [], {
      rounds: 1,
      rules: rulesOf({ coverBp: 4_000, maxHitBp: 0 }),
      extra: { enrage: { rounds: 1, powerBp: 10_000 } },
    });
    const hits = eventsOf(r, 'boss_hit').filter((e) => e.source === 'enrage');
    expect(hits).toHaveLength(9);
    const byTarget = Object.fromEntries(hits.map((h) => [h.target, h]));
    // Beside the Guard: 40% less, credited to the Guard. Elsewhere and the Guard itself: whole.
    expect(byTarget['s3']).toMatchObject({ damage: 60, covered: { guard: 's4', prevented: 40 } });
    expect(byTarget['s5']).toMatchObject({ damage: 60, covered: { guard: 's4', prevented: 40 } });
    expect(byTarget['s4']).toMatchObject({ damage: 100 });
    expect(byTarget['s0']).toMatchObject({ damage: 100 });
    expect(byTarget['s0']?.covered).toBeUndefined();
    expect(r.perCreature.s4?.guardCredit).toBeGreaterThanOrEqual(80);

    // The cap: no hit takes more than 50% of the victim's max HP (here 100 HP and a 400 hit).
    const capped = fightWith(rowOf(3, {}, { hp: 100 }), [], {
      rounds: 1,
      bossAtk: 100,
      rules: rulesOf({ coverBp: 0, maxHitBp: 5_000 }),
      extra: { enrage: { rounds: 1, powerBp: 40_000 } },
    });
    const first = eventsOf(capped, 'boss_hit').find((e) => e.source === 'enrage');
    expect(first).toMatchObject({ damage: 50, capped: true });
  });

  it('are softened by a Shield Wall still running from the base rounds', () => {
    // The wall fires in the last base round (3) and lasts 2 rounds, so it covers enrage round 4.
    const r = fightWith(rowOf(9), [], {
      rounds: 3,
      extra: {
        enrage: { rounds: 1, powerBp: 10_000 },
        finaleAbilities: [
          {
            key: 'wall',
            playerId: 'p1',
            abilityId: 'test-half-wall',
            fireAtRound: 3,
            params: { zone: 'middle' },
          },
        ],
      },
    });
    const hits = eventsOf(r, 'boss_hit').filter((e) => e.source === 'enrage');
    expect(hits.filter((h) => ['s3', 's4', 's5'].includes(h.target))).toSatisfy(
      (list: typeof hits) =>
        list.length === 3 && list.every((h) => h.damage === 50 && h.reducedBp === 5_000),
    );
    expect(hits.find((h) => h.target === 's0')).toMatchObject({ damage: 100 });
  });

  it('rest the gimmicks: none fires or is armed or announced in them', () => {
    const gimmicks: Gimmick[] = [
      everyRound({ op: 'sweep', rows: ['front'], power: 5_000 }, 'sweep'),
      {
        id: 'c',
        name: 'c',
        trigger: { every: 2 },
        op: 'charge',
        then: { op: 'pincer', scope: 'rows', power: 5_000 },
      },
      { id: 'r', name: 'r', trigger: { eachRound: true }, op: 'reflect_first_reaction' },
    ];
    const r = fightWith(rowOf(3), gimmicks, { rounds: 3, extra: { enrage: ENRAGE } });
    expect(r.enraged).toBe(true);
    const inEnrage = r.events.filter((e) => 'round' in e && e.round > 3);
    expect(inEnrage.some((e) => e.t === 'gimmick' || e.t === 'charge')).toBe(false);
    expect(
      inEnrage.filter((e) => e.t === 'boss_hit').map((e) => (e.t === 'boss_hit' ? e.source : '')),
    ).not.toContain('gimmick');
    // The base rounds are as they were without enrage.
    const plain = fightWith(rowOf(3), gimmicks, { rounds: 3 });
    expect(r.events.filter((e) => 'round' in e && e.round <= 3)).toEqual(plain.events);
  });

  it('keep finale abilities to the base rounds: one set for a later round never fires', () => {
    const r = fightWith(rowOf(3), [], {
      rounds: 3,
      extra: {
        enrage: ENRAGE,
        finaleAbilities: [{ key: 'late', playerId: 'p1', abilityId: 'rally', fireAtRound: 4 }],
      },
    });
    expect(r.enraged).toBe(true);
    expect(eventsOf(r, 'ability')).toEqual([]);
  });

  it('give the creatures their normal turns, Support effects included', () => {
    const r = fightWith(rowOf(9, { 4: { role: 'support' } }), [], {
      rounds: 1,
      extra: { enrage: { rounds: 1, powerBp: 10_000 } },
    });
    const round2 = r.events.filter((e) => 'round' in e && e.round === 2);
    expect(round2.filter((e) => e.t === 'turn')).toHaveLength(9);
    expect(round2.filter((e) => e.t === 'support_buff').length).toBeGreaterThan(0);
  });

  it('run the mutator hooks as in a normal round', () => {
    const seen: string[] = [];
    const spy: Mutator = {
      id: 'spy',
      hooks: {
        onRoundStart: (c) => void seen.push(`start:${String(c.round)}`),
        onRoundEnd: (c) => void seen.push(`end:${String(c.round)}`),
        onKnockout: (c) => void seen.push(`ko:${String(c.round)}`),
      },
    };
    const base = input(rowOf(1, {}, { hp: 250 }), {
      phase: 'finale',
      bossAtk: 100,
      bossHpPool: { max: 1_000_000_000, current: 1_000_000_000 },
      boss: { ...input([]).boss, gimmicks: [], finaleRounds: 2 },
      enrage: { rounds: 2, powerBp: 20_000 },
      mutators: ['spy'],
    });
    const r = simulateFight(base, rng(), { mutators: [spy] });
    // Rounds 1-2 plain (100 a round), round 3: 100 + 200 knocks it out.
    expect(r.rounds).toBe(3);
    expect(seen).toEqual(['start:1', 'end:1', 'start:2', 'end:2', 'start:3', 'ko:3', 'end:3']);
  });

  it('are deterministic and replay exactly from a stored input', () => {
    const base: FightInput = {
      ...input(rowOf(6), {
        phase: 'finale',
        bossAtk: 40,
        bossHpPool: { max: 1_000_000, current: 1_000_000 },
        enrage: ENRAGE,
        rules: rulesOf({ maxHitBp: 5_000 }),
      }),
    };
    const a = simulateFight(base, rng());
    const b = simulateFight(JSON.parse(JSON.stringify(base)) as FightInput, rng());
    expect(b).toEqual(a);
  });

  it('refuse a malformed enrage', () => {
    for (const enrage of [
      { rounds: -1, powerBp: 100 },
      { rounds: 1.5, powerBp: 100 },
      { rounds: 99, powerBp: 100 },
      { rounds: 1, powerBp: -5 },
      { rounds: 1, powerBp: 2_000_000 },
    ]) {
      expect(() => fightWith(rowOf(1), [], { rounds: 1, extra: { enrage } })).toThrow(/enrage/);
    }
  });
});

describe('enrage in the text and the playback', () => {
  const names = { boss: 'Boss', creatures: { a: 'Ann', b: 'Bob' } };

  it('is described, in the first and the later rounds', () => {
    expect(describeEvent({ t: 'enrage', round: 4, first: true }, names)).toBe(
      'Out of time: Boss is enraged!',
    );
    expect(describeEvent({ t: 'enrage', round: 5, first: false }, names)).toBe(
      'Boss is still enraged.',
    );
    expect(
      describeEvent({ t: 'boss_hit', round: 4, source: 'enrage', target: 'a', damage: 200 }, names),
    ).toBe('Boss rages at Ann for 200.');
  });

  it('gives the enraged volley one beat with a wind-up, whatever knocks out in between', () => {
    const r = fightWith(rowOf(3, {}, { hp: 150 }), [], {
      rounds: 1,
      extra: { enrage: { rounds: 1, powerBp: 20_000 } },
    });
    const start = r.events.findIndex((e) => e.t === 'boss_hit' && e.source === 'enrage');
    const volley = r.events.filter((e) => e.t === 'boss_hit' && e.source === 'enrage');
    expect(volley.length).toBeGreaterThan(1);
    const ends = beatEnds(r.events);
    // The first enrage hit starts a beat; the other hits (and knockouts) belong to it.
    expect(ends).toContain(start);
    const inside = ends.filter((end) => end > start && end <= start + 2 * volley.length);
    expect(inside.length).toBeLessThanOrEqual(1);
    const timing = beatTiming(r.events, start, ends.find((end) => end > start) ?? r.events.length);
    expect(timing.windupMs).toBe(600);
  });
});
