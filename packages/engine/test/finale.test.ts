import { describe, expect, it } from 'vitest';
import { content } from '@creatures/game';
import { eventsOf, inRound, input, boss, run, slot } from './helpers';

const solo = () => [slot('x', { element: 'tide', atk: 100 })];
const finale = { phase: 'finale' as const };

const hitDamage = (r: ReturnType<typeof run>, round: number) =>
  eventsOf(r, 'hit').find((h) => h.round === round)!.damage;

describe('finale abilities', () => {
  it('has default rounds in content', () => {
    const defaults = Object.fromEntries(content.finaleAbilities.map((a) => [a.id, a.defaultRound]));
    expect(defaults).toEqual({ rally: 6, 'shield-wall': 3, 're-mark': 4, purge: 2 });
  });

  describe('Rally', () => {
    it('fires at its default round for an absent player: +40% for the round', () => {
      const r = run(solo(), {
        ...finale,
        finaleAbilities: [{ playerId: 'p1', abilityId: 'rally' }],
      });
      expect(r.rounds).toBe(12);
      expect(eventsOf(r, 'ability')).toEqual([
        { t: 'ability', round: 6, player: 'p1', ability: 'rally', byDefault: true },
      ]);
      expect(hitDamage(r, 5)).toBe(100);
      expect(hitDamage(r, 6)).toBe(140);
      expect(hitDamage(r, 7)).toBe(100);
    });

    it('fires at the round a present player chose', () => {
      const r = run(solo(), {
        ...finale,
        finaleAbilities: [{ playerId: 'p1', abilityId: 'rally', fireAtRound: 3 }],
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
          { playerId: 'p1', abilityId: 'rally', fireAtRound: 2 },
          { playerId: 'p2', abilityId: 'rally', fireAtRound: 2 },
          { playerId: 'p2', abilityId: 'rally', fireAtRound: 13 },
        ],
      });
      expect(hitDamage(r, 2)).toBe(180);
      expect(eventsOf(r, 'ability')).toHaveLength(2);
    });
  });

  describe('Shield Wall', () => {
    const row = () => ['f0', 'f1', 'm2', 'm3', 'b4', 'b5'].map((id) => slot(id, { atk: 1 }));
    const undertow = { boss: boss('tidal-colossus'), bossAtk: 100, ...finale };

    it('by default lands on the first zone attack (round 3) on the attacked zone', () => {
      const r = run(row(), {
        ...undertow,
        finaleAbilities: [{ playerId: 'p1', abilityId: 'shield-wall' }],
      });
      expect(eventsOf(r, 'ability')).toEqual([
        {
          t: 'ability',
          round: 3,
          player: 'p1',
          ability: 'shield-wall',
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
          { playerId: 'p1', abilityId: 'shield-wall', fireAtRound: 2, params: { zone: 'front' } },
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
          { playerId: 'p1', abilityId: 'shield-wall', fireAtRound: 3, params: { zone: 'back' } },
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
        finaleAbilities: [{ playerId: 'p1', abilityId: 'shield-wall' }],
      });
      expect(eventsOf(r, 'ability')[0]).toMatchObject({ round: 3, zone: 'front' });
    });
  });

  describe('Re-mark', () => {
    const row = () => [slot('p', { owner: 'pp', element: 'spark', role: 'payoff', atk: 100 })];

    it('sets the boss mark at its default round (4) and credits setup to the player', () => {
      const r = run(row(), {
        ...finale,
        players: ['pp', 'pa'],
        finaleAbilities: [{ playerId: 'pa', abilityId: 're-mark', params: { element: 'tide' } }],
      });
      expect(eventsOf(r, 'ability')[0]).toEqual({
        t: 'ability',
        round: 4,
        player: 'pa',
        ability: 're-mark',
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
      // p's Spark hit then triggers Overload: 150 x 3.125 = 468, bonus 318, setup 159 to pa.
      expect(eventsOf(r, 'reaction').find((e) => e.round === 4)).toMatchObject({
        reaction: 'overload',
        setupCreature: null,
        setupPlayer: 'pa',
      });
      expect(r.perPlayer.pa).toMatchObject({ setupCredit: 159, damage: 0, contribution: 159 });
      expect(r.perPlayer.pp!.damage).toBe(11 * 150 + (468 - 159));
    });

    it("defaults to the element of the player's first creature, and a chosen round works", () => {
      const r = run(row(), {
        ...finale,
        finaleAbilities: [{ playerId: 'pp', abilityId: 're-mark', fireAtRound: 1 }],
      });
      expect(eventsOf(r, 'ability')[0]).toMatchObject({
        round: 1,
        element: 'spark',
        byDefault: false,
      });
    });
  });

  describe('Purge', () => {
    it('removes the adaptation for the rest of the fight at its default round (2)', () => {
      const r = run([slot('p', { element: 'spark', atk: 100 })], {
        ...finale,
        adaptation: { rule: 'resist-top-element', target: 'spark' },
        finaleAbilities: [{ playerId: 'p1', abilityId: 'purge' }],
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
        finaleAbilities: [{ playerId: 'p1', abilityId: 'purge', fireAtRound: 5 }],
      });
      expect(hitDamage(r, 4)).toBe(112);
      expect(hitDamage(r, 5)).toBe(150);
      const none = run(solo(), {
        ...finale,
        finaleAbilities: [{ playerId: 'p1', abilityId: 'purge' }],
      });
      expect(eventsOf(none, 'ability')).toHaveLength(1);
      expect(eventsOf(none, 'adaptation')).toHaveLength(0);
    });
  });

  it("fires several players' abilities in the order given", () => {
    const r = run(solo(), {
      ...finale,
      players: ['p1', 'p2', 'p3'],
      finaleAbilities: [
        { playerId: 'p3', abilityId: 'rally', fireAtRound: 1 },
        { playerId: 'p1', abilityId: 'purge', fireAtRound: 1 },
        { playerId: 'p2', abilityId: 're-mark', fireAtRound: 1, params: { element: 'grove' } },
      ],
    });
    expect(eventsOf(r, 'ability').map((a) => a.player)).toEqual(['p3', 'p1', 'p2']);
  });
});
