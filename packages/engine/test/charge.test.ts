import { describe, expect, it } from 'vitest';
import { content, type Gimmick } from '@creatures/game';
import {
  defaultAbilityRound,
  simulateFight,
  type AbilityChoice,
  type FightEvent,
  type FightInput,
} from '../src/index';
import { boss, eventsOf, randomInput, rng } from './helpers';
import { fightWith, gimmickHits, rowOf, rulesOf } from './pattern-helpers';

/**
 * Charge (docs/design/attack-patterns.md 2.7): announced at the start of the round before it lands
 * (after the dice, before abilities), with the victims fixed then; they are hit in the landing
 * round, a fallen one is skipped, and nothing is announced to land past the base rounds.
 * Rows of 9 are three rows of three: s0-s2 front, s3-s5 middle, s6-s8 back. The boss has Attack
 * 100, so a power of 10000 deals 100.
 */

type ChargeGimmick = Extract<Gimmick, { op: 'charge' }>;

function charge(then: ChargeGimmick['then'], every = 3, id = 'c'): Gimmick {
  return { id, name: id, trigger: { every }, op: 'charge', then };
}

const frontSweep = charge({ op: 'sweep', rows: ['front'], power: 10_000 });
const chargeEvents = (r: { events: FightEvent[] }) => eventsOf(r as never, 'charge');

describe('charge: announcement and landing', () => {
  it('is announced a round ahead with its marks, and lands in the trigger round on them', () => {
    const r = fightWith(rowOf(9), [charge({ op: 'sweep', rows: ['middle'], power: 10_000 })], {
      rounds: 7,
    });
    expect(chargeEvents(r)).toEqual([
      {
        t: 'charge',
        round: 2,
        landing: 3,
        gimmick: 'c',
        op: 'sweep',
        marks: ['s3', 's4', 's5'],
        rows: ['middle'],
      },
      {
        t: 'charge',
        round: 5,
        landing: 6,
        gimmick: 'c',
        op: 'sweep',
        marks: ['s3', 's4', 's5'],
        rows: ['middle'],
      },
    ]);
    // Nothing is hit in the announce round; the landing round hits the marks.
    expect(gimmickHits(r)).toEqual([
      [3, 's3', 100],
      [3, 's4', 100],
      [3, 's5', 100],
      [6, 's3', 100],
      [6, 's4', 100],
      [6, 's5', 100],
    ]);
    expect(eventsOf(r, 'gimmick')).toEqual([
      {
        t: 'gimmick',
        round: 3,
        gimmick: 'c',
        op: 'charge',
        targets: ['s3', 's4', 's5'],
        rows: ['middle'],
      },
      {
        t: 'gimmick',
        round: 6,
        gimmick: 'c',
        op: 'charge',
        targets: ['s3', 's4', 's5'],
        rows: ['middle'],
      },
    ]);
  });

  it('puts the charge event after the round start and before the abilities and turns', () => {
    const abilities: AbilityChoice[] = [
      { key: 'k', playerId: 'p1', abilityId: 'rally', fireAtRound: 2 },
    ];
    const r = fightWith(rowOf(9), [frontSweep], {
      rounds: 3,
      extra: { finaleAbilities: abilities },
    });
    const round2 = r.events.filter((e) => 'round' in e && e.round === 2).map((e) => e.t);
    expect(round2.slice(0, 3)).toEqual(['round_start', 'charge', 'ability']);
    expect(round2.indexOf('charge')).toBeLessThan(round2.indexOf('turn'));
  });

  it('fixes the marks at the announcement: a creature that fell in between is skipped, nobody is re-aimed', () => {
    // s0 has 200 HP and the plain attack takes 100 a round from the front: it is up at the
    // announcement (round 2 start) and down by the end of round 2.
    const r = fightWith(rowOf(9, { 0: { hp: 200 } }), [frontSweep], { rounds: 4 });
    const [announced] = chargeEvents(r);
    expect(announced).toMatchObject({ round: 2, landing: 3, marks: ['s0', 's1', 's2'] });
    expect(eventsOf(r, 'knockout')[0]).toMatchObject({ round: 2, creature: 's0' });
    expect(gimmickHits(r)).toEqual([
      [3, 's1', 100],
      [3, 's2', 100],
    ]);
    // The landing names the marks still standing, and the row only while it has a mark standing.
    expect(eventsOf(r, 'gimmick')[0]).toMatchObject({
      round: 3,
      targets: ['s1', 's2'],
      rows: ['front'],
    });
  });

  it('fizzles when every mark has fallen: nobody is hit and no row is named', () => {
    // A one-creature front row that is down before the landing.
    const r = fightWith(rowOf(3, { 0: { hp: 150 } }), [frontSweep], { rounds: 4 });
    expect(chargeEvents(r)[0]).toMatchObject({ round: 2, marks: ['s0'] });
    expect(gimmickHits(r)).toEqual([]);
    expect(eventsOf(r, 'gimmick')[0]).toMatchObject({ round: 3, targets: [], rows: [] });
  });

  it('never announces a charge that would land past the base rounds, and never in an enrage round', () => {
    // Every 3rd round: landings in rounds 3 and 6. With 5 rounds the second is not announced.
    const five = fightWith(rowOf(9), [frontSweep], { rounds: 5 });
    expect(chargeEvents(five).map((e) => [e.round, e.landing])).toEqual([[2, 3]]);
    expect(eventsOf(five, 'gimmick').map((e) => e.round)).toEqual([3]);
    // With enrage rounds after them, nothing is announced or landed in rounds 5 to 7 either.
    const enraged = fightWith(rowOf(9), [frontSweep], {
      rounds: 5,
      extra: { enrage: { rounds: 2, powerBp: 10_000 } },
    });
    expect(enraged.enraged).toBe(true);
    expect(chargeEvents(enraged).map((e) => [e.round, e.landing])).toEqual([[2, 3]]);
    expect(eventsOf(enraged, 'gimmick').map((e) => e.round)).toEqual([3]);
    // A landing exactly in the last base round is announced in the round before it.
    const three = fightWith(rowOf(9), [frontSweep], { rounds: 3 });
    expect(chargeEvents(three).map((e) => [e.round, e.landing])).toEqual([[2, 3]]);
  });

  it('cannot land in round 1: a charge due every round is announced from round 1 and lands from round 2', () => {
    const every = fightWith(
      rowOf(9),
      [
        {
          id: 'c',
          name: 'c',
          trigger: { eachRound: true },
          op: 'charge',
          then: { op: 'sweep', rows: ['front'], power: 10_000 },
        },
      ],
      { rounds: 4 },
    );
    expect(chargeEvents(every).map((e) => [e.round, e.landing])).toEqual([
      [1, 2],
      [2, 3],
      [3, 4],
    ]);
    expect(eventsOf(every, 'gimmick').map((e) => e.round)).toEqual([2, 3, 4]);
  });

  it('walks a sweep across its rows by firing, as an uncharged sweep does', () => {
    const r = fightWith(
      rowOf(9),
      [charge({ op: 'sweep', rows: ['middle', 'back', 'front'], power: 10_000 }, 2)],
      { rounds: 7 },
    );
    expect(chargeEvents(r).map((e) => e.rows)).toEqual([['middle'], ['back'], ['front']]);
  });
});

describe('charge: the inner patterns', () => {
  it('draws its victims from the announce round dice: the same marks as the uncharged pattern would pick then', () => {
    const barrage = {
      op: 'barrage' as const,
      shells: { min: 3, max: 3, shareBp: 1 },
      power: 10_000,
    };
    const plain = fightWith(rowOf(9), [{ id: 'b', name: 'b', trigger: { every: 2 }, ...barrage }], {
      rounds: 2,
    });
    const charged = fightWith(rowOf(9), [charge(barrage, 3, 'b')], { rounds: 3 });
    const picked = eventsOf(plain, 'gimmick')[0]?.targets;
    expect(picked).toHaveLength(3);
    expect(chargeEvents(charged)[0]?.marks).toEqual(picked);
    // And it hits those, in that order, when it lands.
    expect(gimmickHits(charged).map(([round, target]) => [round, target])).toEqual(
      (picked ?? []).map((t) => [3, t]),
    );
  });

  it('keeps a barrage from hitting the same creature in two charged volleys running', () => {
    const r = fightWith(
      rowOf(9),
      [charge({ op: 'barrage', shells: { min: 3, max: 3, shareBp: 1 }, power: 10_000 }, 2)],
      { rounds: 9 },
    );
    const volleys = chargeEvents(r).map((e) => e.marks);
    expect(volleys.length).toBeGreaterThan(2);
    for (let i = 1; i < volleys.length; i++) {
      for (const id of volleys[i] ?? []) expect(volleys[i - 1]).not.toContain(id);
    }
  });

  it('a charged slam marks its victim, hits it when it lands and splashes beside the impact', () => {
    const r = fightWith(
      rowOf(9, { 4: { atk: 50 } }),
      [charge({ op: 'slam', aim: 'strongest', power: 10_000, splashBp: 5_000 })],
      { rounds: 3, rules: rulesOf({ coverBp: 0, maxHitBp: 0 }) },
    );
    expect(chargeEvents(r)[0]).toMatchObject({ op: 'slam', marks: ['s4'] });
    const hits = eventsOf(r, 'boss_hit').filter((e) => e.round === 3 && e.source === 'gimmick');
    expect(hits.map((e) => [e.target, e.damage, e.splash ?? false])).toEqual([
      ['s4', 100, false],
      ['s3', 50, true],
      ['s5', 50, true],
    ]);
  });

  it('a charged lance marks the lane, and the lane when it lands is the marked one', () => {
    const r = fightWith(
      rowOf(9, { 1: { atk: 40 } }),
      [charge({ op: 'lance', lane: 'strongest', power: 10_000, falloffBp: 5_000 })],
      { rounds: 3 },
    );
    expect(chargeEvents(r)[0]?.marks).toEqual(['s1', 's4', 's7']);
    expect(gimmickHits(r)).toEqual([
      [3, 's1', 100],
      [3, 's4', 50],
      [3, 's7', 25],
    ]);
  });
});

describe('charge: Shield Wall', () => {
  const half = (round: number): AbilityChoice => ({
    key: 'wall',
    playerId: 'p1',
    abilityId: 'test-half-wall',
    fireAtRound: round,
    params: { zone: 'front' },
  });

  it('a Shield Wall fired in the announce round halves a charged sweep on its row', () => {
    const wall = fightWith(rowOf(9), [frontSweep], {
      rounds: 3,
      extra: { finaleAbilities: [half(2)] },
    });
    // The wall covers rounds 2 and 3, so the landing is softened by 50%.
    expect(chargeEvents(wall)[0]).toMatchObject({ round: 2, landing: 3 });
    expect(gimmickHits(wall)).toEqual([
      [3, 's0', 50],
      [3, 's1', 50],
      [3, 's2', 50],
    ]);
    const hit = eventsOf(wall, 'boss_hit').find((e) => e.round === 3 && e.source === 'gimmick');
    expect(hit).toMatchObject({ reducedBp: 5_000 });
    // Without it the sweep lands whole; the marks do not depend on the wall.
    const bare = fightWith(rowOf(9), [frontSweep], { rounds: 3 });
    expect(gimmickHits(bare).map((h) => h[2])).toEqual([100, 100, 100]);
    expect(chargeEvents(bare)).toEqual(chargeEvents(wall));
  });

  it('knows the charged sweep row and its landing round for the default Shield Wall', () => {
    const shield = content.finaleAbilities.find((a) => a.id === 'shield-wall');
    if (shield === undefined) throw new Error('no shield wall');
    const base = { ...boss('tidal-colossus'), gimmicks: [] as Gimmick[] };
    const sweeps = (rows: ('front' | 'middle' | 'back' | 'all')[], every = 3): Gimmick =>
      charge({ op: 'sweep', rows, power: 10_000 }, every);
    // The landing round (3), not the announcement (2).
    expect(defaultAbilityRound({ ...base, gimmicks: [sweeps(['back'])] }, shield, 12)).toBe(3);
    // A charged sweep of all rows names no row: back to the content default.
    expect(defaultAbilityRound({ ...base, gimmicks: [sweeps(['all'])] }, shield, 12)).toBe(
      shield.defaultRound,
    );
    // A charge of another pattern is not a zone attack.
    expect(
      defaultAbilityRound(
        { ...base, gimmicks: [charge({ op: 'pincer', scope: 'rows', power: 10_000 })] },
        shield,
        12,
      ),
    ).toBe(shield.defaultRound);
    // A landing past the fight's rounds does not count.
    expect(defaultAbilityRound({ ...base, gimmicks: [sweeps(['back'], 5)] }, shield, 4)).toBe(
      shield.defaultRound,
    );

    // And the engine fires the default Shield Wall there, on the swept row.
    const r = fightWith(rowOf(9), [sweeps(['back'])], {
      rounds: 4,
      extra: {
        finaleAbilities: [{ key: 'w', playerId: 'p1', abilityId: 'shield-wall' }],
      },
    });
    const fired = eventsOf(r, 'ability')[0];
    expect(fired).toMatchObject({ round: 3, zone: 'back', byDefault: true });
  });

  it('the shipped bosses: Tidal Colossus default Shield Wall goes to its first zone attack', () => {
    const shield = content.finaleAbilities.find((a) => a.id === 'shield-wall');
    if (shield === undefined) throw new Error('no shield wall');
    const tidal = boss('tidal-colossus');
    // Undertow hits the front zone in round 3, before the Great Wave lands in round 5.
    expect(defaultAbilityRound(tidal, shield, tidal.finaleRounds)).toBe(3);
  });
});

describe('charge: the prefix property', () => {
  const eventsBefore = (events: readonly FightEvent[], round: number) =>
    events.filter((e) => e.round < round);

  function chargeInput(seed: string, bossId: string): FightInput {
    const base = randomInput(seed, 4, 'finale');
    return { ...base, boss: boss(bossId), finaleAbilities: [] };
  }

  it('an ability fired in round r changes nothing before round r, and not the charge announced in r', () => {
    let announced = 0;
    for (let s = 0; s < 20; s++) {
      for (const bossId of ['tidal-colossus', 'thornmother']) {
        const base = chargeInput(`charge-prefix-${s}`, bossId);
        const baseResult = simulateFight(base, rng());
        // Shield Wall and a Re-mark, in the announce round of the first charge (4) and after it.
        for (const k of [2, 4, 5, 8]) {
          const owner = base.players[s % base.players.length] ?? 'player-0';
          const extra: AbilityChoice = {
            playerId: owner,
            abilityId: s % 2 === 0 ? 'shield-wall' : 're-mark',
            key: 'extra',
            fireAtRound: k,
            params: s % 2 === 0 ? { zone: 'middle' } : { element: 'grove' },
          };
          const result = simulateFight({ ...base, finaleAbilities: [extra] }, rng());
          expect(eventsBefore(result.events, k)).toEqual(eventsBefore(baseResult.events, k));
          // The announcement is made before the abilities of its round, so it never differs.
          const upTo = (events: readonly FightEvent[]) =>
            events.filter((e) => e.t === 'charge' && e.round <= k);
          expect(upTo(result.events)).toEqual(upTo(baseResult.events));
          announced += upTo(baseResult.events).length;
        }
      }
    }
    expect(announced).toBeGreaterThan(20);
  });

  it('the landing depends only on the announcement and who is still standing', () => {
    // An ability in the landing round cannot change what the announcement picked a round earlier.
    const base = chargeInput('charge-landing', 'thornmother');
    const baseResult = simulateFight(base, rng());
    const marks = chargeEvents(baseResult).map((e) => e.marks);
    expect(marks.length).toBeGreaterThan(0);
    const extra: AbilityChoice = {
      playerId: base.players[0] ?? 'player-0',
      abilityId: 're-mark',
      key: 'extra',
      fireAtRound: 5,
      params: { element: 'grove' },
    };
    const result = simulateFight({ ...base, finaleAbilities: [extra] }, rng());
    expect(chargeEvents(result).map((e) => e.marks)).toEqual(marks);
  });
});

describe('charge: shipped bosses', () => {
  it('Seed Burst and Great Wave are announced before they land, in a full fight', () => {
    for (const [bossId, gimmick] of [
      ['thornmother', 'seed-burst'],
      ['tidal-colossus', 'great-wave'],
    ] as const) {
      const base = randomInput('shipped-charge', 4, 'finale');
      const r = simulateFight({ ...base, boss: boss(bossId), finaleAbilities: [] }, rng());
      const announced = chargeEvents(r).filter((e) => e.gimmick === gimmick);
      expect(announced.length).toBeGreaterThan(0);
      for (const a of announced) {
        expect(a.landing).toBe(a.round + 1);
        expect(a.landing).toBeLessThanOrEqual(boss(bossId).finaleRounds);
        expect(a.marks.length).toBeGreaterThan(0);
      }
      const landed = eventsOf(r, 'gimmick').filter((e) => e.gimmick === gimmick);
      for (const l of landed) expect(announced.map((a) => a.landing)).toContain(l.round);
    }
  });
});
