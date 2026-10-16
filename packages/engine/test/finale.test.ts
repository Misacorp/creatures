import { describe, expect, it } from 'vitest';
import { content } from '@creatures/game';
import { simulateFight, type AbilityChoice } from '../src/index';
import { TEST_PACK, eventsOf, inRound, input, boss, rng, run, slot } from './helpers';

const solo = () => [slot('x', { element: 'tide', atk: 100 })];
const finale = { phase: 'finale' as const };

const hitDamage = (r: ReturnType<typeof run>, round: number) =>
  eventsOf(r, 'hit').find((h) => h.round === round)!.damage;

describe('finale abilities', () => {
  it('has default rounds in content for the basic abilities', () => {
    const defaults = Object.fromEntries(
      content.finaleAbilities.filter((a) => a.kind === 'basic').map((a) => [a.id, a.defaultRound]),
    );
    expect(defaults).toEqual({ rally: 6, 'shield-wall': 3, 're-mark': 4, purge: 2 });
  });

  describe('Rally', () => {
    it('fires at its default round for an absent player: +40% for the round', () => {
      const r = run(solo(), {
        ...finale,
        finaleAbilities: [{ key: 'p1:basic', playerId: 'p1', abilityId: 'rally' }],
      });
      expect(r.rounds).toBe(12);
      expect(eventsOf(r, 'ability')).toEqual([
        {
          t: 'ability',
          round: 6,
          player: 'p1',
          ability: 'rally',
          key: 'p1:basic',
          byDefault: true,
        },
      ]);
      expect(hitDamage(r, 5)).toBe(100);
      expect(hitDamage(r, 6)).toBe(140);
      expect(hitDamage(r, 7)).toBe(100);
    });

    it('fires at the round a present player chose', () => {
      const r = run(solo(), {
        ...finale,
        finaleAbilities: [{ key: 'a', playerId: 'p1', abilityId: 'rally', fireAtRound: 3 }],
      });
      expect(eventsOf(r, 'ability')[0]).toMatchObject({ round: 3, byDefault: false });
      expect(hitDamage(r, 3)).toBe(140);
      expect(hitDamage(r, 6)).toBe(100);
    });

    it('stacks with another rally and never fires after the last round', () => {
      const r = run(solo(), {
        ...finale,
        players: ['p1', 'p2'],
        finaleAbilities: [
          { key: 'a', playerId: 'p1', abilityId: 'rally', fireAtRound: 2 },
          { key: 'b', playerId: 'p2', abilityId: 'rally', fireAtRound: 2 },
          { key: 'c', playerId: 'p2', abilityId: 'rally', fireAtRound: 13 },
        ],
      });
      expect(hitDamage(r, 2)).toBe(180);
      expect(eventsOf(r, 'ability')).toHaveLength(2);
    });

    it('lasts for its rounds, counting the round it fires in', () => {
      // test-setter: re_mark own + rally +10% for 2 rounds, default round 3. Ember hits a tide boss
      // at x0.75: 75 plain, 82 with +10%.
      const r = run([slot('e', { element: 'ember', atk: 100 })], {
        ...finale,
        finaleAbilities: [
          { key: 'e:ability', playerId: 'p1', abilityId: 'test-setter', creatureId: 'e' },
        ],
      });
      expect([2, 3, 4, 5].map((round) => hitDamage(r, round))).toEqual([75, 82, 82, 75]);
    });
  });

  describe('Shield Wall', () => {
    const row = () => ['f0', 'f1', 'm2', 'm3', 'b4', 'b5'].map((id) => slot(id, { atk: 1 }));
    const undertow = { boss: boss('tidal-colossus'), bossAtk: 100, ...finale };

    it('by default lands on the first zone attack (round 3) on the attacked zone', () => {
      const r = run(row(), {
        ...undertow,
        finaleAbilities: [{ key: 'p1:basic', playerId: 'p1', abilityId: 'shield-wall' }],
      });
      expect(eventsOf(r, 'ability')).toEqual([
        {
          t: 'ability',
          round: 3,
          player: 'p1',
          ability: 'shield-wall',
          key: 'p1:basic',
          zone: 'front',
          byDefault: true,
        },
      ]);
      const round3 = inRound(r, 3).filter((e) => e.t === 'boss_hit');
      expect(round3).toHaveLength(3); // two zone hits and the normal attack
      for (const e of round3) expect(e).toMatchObject({ damage: 0, shielded: true });
      // Rounds 1, 2 and 6 are not shielded.
      expect(inRound(r, 2).filter((e) => e.t === 'boss_hit' && e.shielded === true)).toHaveLength(
        0,
      );
      expect(inRound(r, 6).filter((e) => e.t === 'boss_hit' && e.shielded === true)).toHaveLength(
        0,
      );
      expect(r.perCreature.f0!.damageTaken).toBeGreaterThan(0);
    });

    it('protects only the chosen zone, in the chosen round', () => {
      const r = run(row(), {
        ...undertow,
        finaleAbilities: [
          {
            key: 'a',
            playerId: 'p1',
            abilityId: 'shield-wall',
            fireAtRound: 2,
            params: { zone: 'front' },
          },
        ],
      });
      expect(eventsOf(r, 'ability')[0]).toMatchObject({
        round: 2,
        zone: 'front',
        byDefault: false,
      });
      // Round 2: the normal attack (front first) is stopped; round 3 hits land.
      expect(inRound(r, 2).filter((e) => e.t === 'boss_hit')[0]).toMatchObject({ shielded: true });
      expect(inRound(r, 3).filter((e) => e.t === 'boss_hit' && e.shielded === true)).toHaveLength(
        0,
      );
      const back = run(row(), {
        ...undertow,
        finaleAbilities: [
          {
            key: 'b',
            playerId: 'p1',
            abilityId: 'shield-wall',
            fireAtRound: 3,
            params: { zone: 'back' },
          },
        ],
      });
      expect(
        inRound(back, 3).filter((e) => e.t === 'boss_hit' && e.shielded === true),
      ).toHaveLength(0);
    });

    it('falls back to its default round and the front zone against a boss with no zone attack', () => {
      const r = run(row(), {
        boss: { ...input([]).boss, gimmicks: [] },
        ...finale,
        finaleAbilities: [{ key: 'p1:basic', playerId: 'p1', abilityId: 'shield-wall' }],
      });
      expect(eventsOf(r, 'ability')[0]).toMatchObject({ round: 3, zone: 'front' });
    });

    describe('with a reduction and rounds', () => {
      const bossHits = (r: ReturnType<typeof run>, round: number) =>
        inRound(r, round).filter((e) => e.t === 'boss_hit');
      const plain = { bossAtk: 100, ...finale };

      it('an own-zone shield covers its creature zone for its rounds, softening the damage', () => {
        // test-guard: own zone, 50% less for 2 rounds, fired at round 2 by f0 (front zone).
        const r = run(row(), {
          ...plain,
          finaleAbilities: [
            { key: 'g', playerId: 'p1', abilityId: 'test-guard', creatureId: 'f0', fireAtRound: 2 },
          ],
        });
        expect(eventsOf(r, 'ability')[0]).toEqual({
          t: 'ability',
          round: 2,
          player: 'p1',
          ability: 'test-guard',
          key: 'g',
          creature: 'f0',
          zone: 'front',
          byDefault: false,
        });
        expect(bossHits(r, 1)).toEqual([
          { t: 'boss_hit', round: 1, source: 'attack', target: 'f0', damage: 100 },
        ]);
        for (const round of [2, 3]) {
          expect(bossHits(r, round)).toEqual([
            {
              t: 'boss_hit',
              round,
              source: 'attack',
              target: 'f0',
              damage: 50,
              reducedBp: 5_000,
            },
          ]);
        }
        expect(bossHits(r, 4)).toEqual([
          { t: 'boss_hit', round: 4, source: 'attack', target: 'f0', damage: 100 },
        ]);
      });

      it('takes the zone of the creature it belongs to', () => {
        const r = run(row(), {
          ...plain,
          finaleAbilities: [
            { key: 'g', playerId: 'p1', abilityId: 'test-guard', creatureId: 'b4', fireAtRound: 2 },
          ],
        });
        expect(eventsOf(r, 'ability')[0]).toMatchObject({ zone: 'back', creature: 'b4' });
        // The boss attacks the front zone: nothing is softened.
        expect(bossHits(r, 2)[0]).toMatchObject({ damage: 100 });
      });

      it('walls on the same zone multiply: two 50% walls leave 25%', () => {
        const r = run(row(), {
          ...plain,
          finaleAbilities: [
            {
              key: 'g1',
              playerId: 'p1',
              abilityId: 'test-guard',
              creatureId: 'f0',
              fireAtRound: 2,
            },
            {
              key: 'g2',
              playerId: 'p1',
              abilityId: 'test-guard',
              creatureId: 'f1',
              fireAtRound: 2,
            },
          ],
        });
        expect(bossHits(r, 2)[0]).toMatchObject({ damage: 25, reducedBp: 7_500 });
      });

      it('a chosen-zone wall takes the player pick, and fully stopping damage still reads as shielded', () => {
        const r = run(row(), {
          ...plain,
          finaleAbilities: [
            {
              key: 'h',
              playerId: 'p1',
              abilityId: 'test-half-wall',
              fireAtRound: 2,
              params: { zone: 'front' },
            },
            { key: 'full', playerId: 'p1', abilityId: 'shield-wall', fireAtRound: 3 },
          ],
        });
        expect(bossHits(r, 2)[0]).toMatchObject({ damage: 50, reducedBp: 5_000 });
        // Round 3: the half wall (rounds 2 and 3) and the full wall (default zone: front) stack.
        expect(bossHits(r, 3)[0]).toMatchObject({ damage: 0, shielded: true });
        expect(bossHits(r, 4)[0]).toMatchObject({ damage: 100 });
      });

      it('lets a guard take the softened hit', () => {
        const guarded = [
          slot('g', { role: 'guard', atk: 1 }),
          slot('f1', { atk: 1 }),
          slot('f2', { atk: 1 }),
        ];
        const r = run(guarded, {
          ...plain,
          boss: {
            ...input([]).boss,
            gimmicks: [
              {
                id: 'lightning-rod',
                name: 'Lightning Rod',
                trigger: { eachRound: true },
                op: 'strike_highest_atk',
                power: 12_000,
              },
            ],
          },
          finaleAbilities: [
            { key: 'g', playerId: 'p1', abilityId: 'test-guard', creatureId: 'g', fireAtRound: 1 },
          ],
        });
        // The guard "g" stands alone in the front zone. Lightning Rod strikes the highest Attack
        // (first on ties: "g"); its zone is softened by 50%: 120 -> 60.
        const strike = bossHits(r, 1).find((e) => e.t === 'boss_hit' && e.source === 'gimmick');
        expect(strike).toMatchObject({ target: 'g', damage: 60, reducedBp: 5_000 });
      });
    });
  });

  describe('Re-mark', () => {
    const row = () => [slot('p', { owner: 'pp', element: 'spark', role: 'payoff', atk: 100 })];

    it('sets the boss mark at its default round (4) and credits setup to the player', () => {
      const r = run(row(), {
        ...finale,
        players: ['pp', 'pa'],
        finaleAbilities: [
          { key: 'pa:basic', playerId: 'pa', abilityId: 're-mark', params: { element: 'tide' } },
        ],
      });
      expect(eventsOf(r, 'ability')[0]).toEqual({
        t: 'ability',
        round: 4,
        player: 'pa',
        ability: 're-mark',
        key: 'pa:basic',
        element: 'tide',
        byDefault: true,
      });
      // Spark's own hit left a Charged mark at the end of round 3; Re-mark replaces it with Soaked.
      expect(eventsOf(r, 'mark').find((m) => m.round === 4)).toEqual({
        t: 'mark',
        round: 4,
        creature: null,
        player: 'pa',
        element: 'tide',
        replaced: 'spark',
      });
      // p's Spark hit then triggers Overload: 150 x 3.125 = 468, bonus 318, setup 190 (60%) to pa.
      expect(eventsOf(r, 'reaction').find((e) => e.round === 4)).toMatchObject({
        reaction: 'overload',
        setupCreature: null,
        setupPlayer: 'pa',
      });
      expect(r.perPlayer.pa).toMatchObject({ setupCredit: 190, damage: 0, contribution: 190 });
      expect(r.perPlayer.pp!.damage).toBe(11 * 150 + (468 - 190));
    });

    it("defaults to the element of the player's first creature, and a chosen round works", () => {
      const r = run(row(), {
        ...finale,
        finaleAbilities: [{ key: 'a', playerId: 'pp', abilityId: 're-mark', fireAtRound: 1 }],
      });
      expect(eventsOf(r, 'ability')[0]).toMatchObject({
        round: 1,
        element: 'spark',
        byDefault: false,
      });
    });

    it("an own-element re-mark uses its creature's element and credits setup to the creature", () => {
      // Ember creature 'e' (Scorched, cashed by Tide) with a Spark payoff owned by the same player:
      // test-combo's mark is Scorched; the Spark creature does not cash it, the Tide one does.
      const r = run(
        [
          slot('e', { element: 'ember', role: 'setter', atk: 10 }),
          slot('t', { element: 'tide', role: 'payoff', atk: 100 }),
        ],
        {
          ...finale,
          finaleAbilities: [
            { key: 'c', playerId: 'p1', abilityId: 'test-combo', creatureId: 'e', fireAtRound: 3 },
          ],
        },
      );
      expect(eventsOf(r, 'ability')[0]).toMatchObject({ element: 'ember', creature: 'e' });
      const mark = eventsOf(r, 'mark').find((m) => m.round === 3 && m.creature === 'e');
      expect(mark).toMatchObject({ player: 'p1', element: 'ember' });
      // Steam fires in round 3 (Tide cashes Scorched) with the setup credited to 'e'.
      const steam = eventsOf(r, 'reaction').find((e) => e.round === 3);
      expect(steam).toMatchObject({ reaction: 'steam', setupCreature: 'e', payoff: 't' });
      expect(r.perCreature.e!.setupCredit).toBeGreaterThan(0);
    });
  });

  describe('Purge', () => {
    it('removes the adaptation for the rest of the fight at its default round (2)', () => {
      const r = run([slot('p', { element: 'spark', atk: 100 })], {
        ...finale,
        adaptation: { rule: 'resist-top-element', target: 'spark' },
        finaleAbilities: [{ key: 'p1:basic', playerId: 'p1', abilityId: 'purge' }],
      });
      expect(hitDamage(r, 1)).toBe(112);
      expect(hitDamage(r, 2)).toBe(150);
      expect(hitDamage(r, 12)).toBe(150);
      expect(eventsOf(r, 'adaptation')).toEqual([
        {
          t: 'adaptation',
          round: 0,
          rule: 'resist-top-element',
          target: 'spark',
          status: 'active',
        },
        {
          t: 'adaptation',
          round: 2,
          rule: 'resist-top-element',
          target: 'spark',
          status: 'purged',
        },
      ]);
    });

    it('fires at a chosen round and is harmless without an adaptation', () => {
      const r = run([slot('p', { element: 'spark', atk: 100 })], {
        ...finale,
        adaptation: { rule: 'resist-top-element', target: 'spark' },
        finaleAbilities: [{ key: 'a', playerId: 'p1', abilityId: 'purge', fireAtRound: 5 }],
      });
      expect(hitDamage(r, 4)).toBe(112);
      expect(hitDamage(r, 5)).toBe(150);
      const none = run(solo(), {
        ...finale,
        finaleAbilities: [{ key: 'b', playerId: 'p1', abilityId: 'purge' }],
      });
      expect(eventsOf(none, 'ability')).toHaveLength(1);
      expect(eventsOf(none, 'adaptation')).toHaveLength(0);
    });

    it('a timed purge switches the adaptation off for its rounds, then back on', () => {
      // test-purge: 2 rounds, default round 2.
      const r = run([slot('p', { element: 'spark', atk: 100 })], {
        ...finale,
        adaptation: { rule: 'resist-top-element', target: 'spark' },
        finaleAbilities: [{ key: 'a', playerId: 'p1', abilityId: 'test-purge' }],
      });
      expect([1, 2, 3, 4, 5].map((round) => hitDamage(r, round))).toEqual([
        112, 150, 150, 112, 112,
      ]);
      expect(eventsOf(r, 'adaptation').map((e) => [e.round, e.status])).toEqual([
        [0, 'active'],
        [2, 'purged'],
        [4, 'restored'],
      ]);
    });
  });

  describe('Strike', () => {
    it('hits at once for atk x atkBp, credited like any hit, and carries its key', () => {
      // test-strike: 200% of Attack at round 2 (default). Plain hits are 100.
      const r = run(solo(), {
        ...finale,
        finaleAbilities: [
          { key: 'x:ability', playerId: 'p1', abilityId: 'test-strike', creatureId: 'x' },
        ],
      });
      const round2 = inRound(r, 2).filter((e) => e.t === 'hit' || e.t === 'ability');
      expect(round2.map((e) => e.t)).toEqual(['ability', 'hit', 'hit']);
      expect(round2[0]).toEqual({
        t: 'ability',
        round: 2,
        player: 'p1',
        ability: 'test-strike',
        key: 'x:ability',
        creature: 'x',
        byDefault: true,
      });
      expect(round2[1]).toMatchObject({
        t: 'hit',
        creature: 'x',
        damage: 200,
        ability: 'test-strike',
        key: 'x:ability',
      });
      expect(round2[2]).toMatchObject({ damage: 100 });
      expect((round2[2] as { key?: string }).key).toBeUndefined();
      expect(r.perPlayer.p1!.damage).toBe(12 * 100 + 200);
      expect(r.perCreature.x!.damage).toBe(12 * 100 + 200);
    });

    it('cashes in the mark like any hit: reaction damage, setup credit', () => {
      // pa's Re-mark sets Soaked at round 2, then pp's Spark strike (200 x 1.5 = 300) cashes
      // Overload: 300 x 3.125 = 937, bonus 637, setup 382 (60%, rounded down) to pa.
      const r = run([slot('p', { owner: 'pp', element: 'spark', role: 'payoff', atk: 100 })], {
        ...finale,
        players: ['pp', 'pa'],
        finaleAbilities: [
          {
            key: 'pa:basic',
            playerId: 'pa',
            abilityId: 're-mark',
            fireAtRound: 2,
            params: { element: 'tide' },
          },
          {
            key: 'p:ability',
            playerId: 'pp',
            abilityId: 'test-strike',
            creatureId: 'p',
            fireAtRound: 2,
          },
        ],
      });
      const strike = eventsOf(r, 'hit').find((h) => h.key === 'p:ability');
      expect(strike).toMatchObject({ round: 2, damage: 937, mark: 'tide', creature: 'p' });
      expect(eventsOf(r, 'reaction').find((e) => e.round === 2)).toMatchObject({
        reaction: 'overload',
        setupPlayer: 'pa',
        payoff: 'p',
        bonus: 637,
      });
      expect(r.perPlayer.pa).toMatchObject({ setupCredit: 382 });
      expect(r.reactions.total).toBeGreaterThan(0);
    });

    it('still lands when its creature has been knocked out', () => {
      const r = run([slot('x', { atk: 100, hp: 1 }), slot('y', { atk: 100 })], {
        ...finale,
        bossAtk: 100,
        finaleAbilities: [
          { key: 'x:ability', playerId: 'p1', abilityId: 'test-strike', creatureId: 'x' },
        ],
      });
      expect(eventsOf(r, 'knockout')).toEqual([{ t: 'knockout', round: 1, creature: 'x' }]);
      const hits = eventsOf(r, 'hit').filter((h) => h.creature === 'x');
      // Round 1: its normal turn. Round 2: only the strike (no turn for a knocked-out creature).
      expect(hits.map((h) => [h.round, h.damage, h.key ?? null])).toEqual([
        [1, 100, null],
        [2, 200, 'x:ability'],
      ]);
      expect(r.perCreature.x!.damage).toBe(300);
    });

    it('ends the fight at once when it kills the boss', () => {
      const r = run(solo(), {
        ...finale,
        bossHpPool: { max: 1_000, current: 250 },
        finaleAbilities: [
          { key: 'x:ability', playerId: 'p1', abilityId: 'test-strike', creatureId: 'x' },
        ],
      });
      expect(r.bossHpEnd).toBe(0);
      expect(r.rounds).toBe(2);
      expect(inRound(r, 2).map((e) => e.t)).toEqual(['round_start', 'ability', 'hit', 'round_end']);
    });

    it("does not use up the creature's support buff", () => {
      const r = run([slot('s', { role: 'support', atk: 1 }), slot('x', { atk: 100 })], {
        ...finale,
        finaleAbilities: [
          { key: 'x:ability', playerId: 'p1', abilityId: 'test-strike', creatureId: 'x' },
        ],
      });
      const round2 = eventsOf(r, 'hit').filter((h) => h.round === 2 && h.creature === 'x');
      expect(round2.map((h) => [h.key ?? null, h.bonusBp, h.damage])).toEqual([
        ['x:ability', 0, 200],
        [null, 1_500, 115],
      ]);
    });

    it('strike then re-mark in one ability: the strike cashes the old mark, then the mark is set', () => {
      // test-combo: strike 100% then re_mark own, default round 2. The Spark creature's strike
      // cashes the Soaked mark that pa set at round 2 (Re-mark fires first in list order).
      const r = run([slot('p', { owner: 'pp', element: 'spark', role: 'payoff', atk: 100 })], {
        ...finale,
        players: ['pp', 'pa'],
        finaleAbilities: [
          {
            key: 'pa:basic',
            playerId: 'pa',
            abilityId: 're-mark',
            fireAtRound: 2,
            params: { element: 'tide' },
          },
          { key: 'p:ability', playerId: 'pp', abilityId: 'test-combo', creatureId: 'p' },
        ],
      });
      const round2 = inRound(r, 2).filter(
        (e) => e.t === 'ability' || e.t === 'hit' || e.t === 'mark' || e.t === 'reaction',
      );
      expect(round2.map((e) => e.t)).toEqual([
        'ability', // pa's Re-mark
        'mark', // Soaked
        'ability', // test-combo
        'hit', // the strike (100% x 1.5 matchup) cashes the Soaked mark
        'reaction',
        'mark', // then the combo's own mark: Charged
        'hit', // the normal turn leaves the Charged mark alone (a Spark hit does not cash it)
      ]);
      const own = eventsOf(r, 'mark').find((m) => m.round === 2 && m.creature === 'p');
      expect(own).toMatchObject({ element: 'spark', replaced: null, player: 'pp' });
    });
  });

  describe('several abilities per player', () => {
    it("fires several players' abilities in the order given", () => {
      const r = run(solo(), {
        ...finale,
        players: ['p1', 'p2', 'p3'],
        finaleAbilities: [
          { key: 'a', playerId: 'p3', abilityId: 'rally', fireAtRound: 1 },
          { key: 'b', playerId: 'p1', abilityId: 'purge', fireAtRound: 1 },
          {
            key: 'c',
            playerId: 'p2',
            abilityId: 're-mark',
            fireAtRound: 1,
            params: { element: 'grove' },
          },
        ],
      });
      expect(eventsOf(r, 'ability').map((a) => a.player)).toEqual(['p3', 'p1', 'p2']);
    });

    it('lets one player hold a basic ability and several creature abilities, told apart by key', () => {
      const r = run(
        [slot('f0', { atk: 100 }), slot('f1', { atk: 100 }), slot('f2', { atk: 100 })],
        {
          ...finale,
          finaleAbilities: [
            { key: 'p1:basic', playerId: 'p1', abilityId: 'rally', fireAtRound: 2 },
            { key: 'f0:ability', playerId: 'p1', abilityId: 'test-strike', creatureId: 'f0' },
            { key: 'f1:ability', playerId: 'p1', abilityId: 'test-strike', creatureId: 'f1' },
          ],
        },
      );
      expect(eventsOf(r, 'ability').map((a) => [a.key, a.creature ?? null])).toEqual([
        ['p1:basic', null],
        ['f0:ability', 'f0'],
        ['f1:ability', 'f1'],
      ]);
      const strikes = eventsOf(r, 'hit').filter((h) => h.key !== undefined);
      // Rally +40% applies to the strikes too: 200 x 1.4 = 280.
      expect(strikes.map((h) => [h.creature, h.damage])).toEqual([
        ['f0', 280],
        ['f1', 280],
      ]);
      expect(r.perCreature.f0!.damage).toBeGreaterThan(r.perCreature.f2!.damage);
    });
  });

  describe('validation', () => {
    const go = (finaleAbilities: AbilityChoice[], players = ['p1']) =>
      simulateFight(
        input([slot('x', { owner: 'p1' }), slot('y', { owner: 'q1' })], {
          ...finale,
          players: [...new Set([...players, 'q1'])],
          finaleAbilities,
        }),
        rng(),
        { pack: TEST_PACK },
      );

    it('rejects duplicate keys, bad keys and ability needs', () => {
      const a: AbilityChoice = { key: 'k', playerId: 'p1', abilityId: 'rally' };
      expect(() => go([a, { ...a, abilityId: 'purge' }])).toThrow(/duplicate ability key/);
      expect(() => go([{ ...a, key: '' }])).toThrow(/key/);
      expect(() => go([{ ...a, key: 'x'.repeat(65) }])).toThrow(/key/);
      // A strike needs a creature.
      expect(() => go([{ ...a, abilityId: 'test-strike' }])).toThrow(/needs a creature/);
      expect(() => go([{ ...a, abilityId: 'test-guard' }])).toThrow(/needs a creature/);
      expect(() => go([{ ...a, abilityId: 'test-setter' }])).toThrow(/needs a creature/);
    });

    it("rejects creatures that are unknown or belong to another player, even when it isn't needed", () => {
      const a: AbilityChoice = { key: 'k', playerId: 'p1', abilityId: 'test-strike' };
      expect(() => go([{ ...a, creatureId: 'nobody' }])).toThrow(/unknown creature/);
      expect(() => go([{ ...a, creatureId: 'y' }])).toThrow(/another player/);
      expect(() => go([{ ...a, abilityId: 'rally', creatureId: 'y' }])).toThrow(/another player/);
      expect(() => go([{ ...a, creatureId: 'x' }])).not.toThrow();
      expect(() => go([{ ...a, abilityId: 'rally', creatureId: 'x' }])).not.toThrow();
    });
  });
});
