import { describe, expect, it } from 'vitest';
import { RULES, content } from '@creatures/game';
import {
  defaultAbilityRound,
  liveFightRules,
  needsCreature,
  simulateFight,
  type AbilityChoice,
  type FightEvent,
  type FightInput,
} from '../src/index';
import { boss, eventsOf, randomInput, rng, run, slot } from './helpers';

/**
 * The live finale rests on the prefix property: rounds 1..r of a fight depend only on the input,
 * the seed and the abilities that fire in rounds 1..r. These tests pin it down.
 */

const SEEDS = 40;
const eventsBefore = (events: readonly FightEvent[], round: number): FightEvent[] =>
  events.filter((e) => e.round < round);
const eventsUpTo = (events: readonly FightEvent[], round: number): FightEvent[] =>
  events.filter((e) => e.round <= round);

/** A finale input with the given abilities (the random ones are replaced). */
function finaleInput(seed: string, abilities: AbilityChoice[]): FightInput {
  const base = randomInput(seed, 4, 'finale');
  return { ...base, finaleAbilities: abilities };
}

/**
 * Every content ability (basic and creature, strikes, timed rallies, shields and purges
 * included), owned by the players in turn, with options that exercise the params. Abilities that
 * need a creature get one of the owner's.
 */
function extraAbility(input: FightInput, index: number, round: number): AbilityChoice {
  const def = content.finaleAbilities[index % content.finaleAbilities.length];
  const playerId = input.players[index % input.players.length];
  if (def === undefined || playerId === undefined) throw new Error('no ability or player');
  const creature = input.row.find((s) => s.ownerId === playerId);
  return {
    playerId,
    abilityId: def.id,
    key: `extra:${index}:${round}`,
    fireAtRound: round,
    ...(needsCreature(def) && creature !== undefined ? { creatureId: creature.id } : {}),
    ...(def.id === 'shield-wall' ? { params: { zone: 'middle' as const } } : {}),
    ...(def.id === 're-mark' ? { params: { element: 'grove' as const } } : {}),
  };
}

describe('the prefix property', () => {
  it('adding an ability at round k leaves every event before round k unchanged', () => {
    let compared = 0;
    for (let s = 0; s < SEEDS; s++) {
      const seed = `prefix-${s}`;
      // A mix of default-timed and chosen abilities as the base.
      const probe = randomInput(seed, 4, 'finale');
      const baseAbilities: AbilityChoice[] = probe.finaleAbilities.slice(0, 2);
      const base = finaleInput(seed, baseAbilities);
      const baseResult = simulateFight(base, rng());
      for (const k of [2, 3, 5, 8, 12]) {
        const extended = {
          ...base,
          finaleAbilities: [...baseAbilities, extraAbility(base, s + k, k)],
        };
        const result = simulateFight(extended, rng());
        expect(eventsBefore(result.events, k)).toEqual(eventsBefore(baseResult.events, k));
        compared += eventsBefore(baseResult.events, k).length;
      }
    }
    expect(compared).toBeGreaterThan(1000);
  });

  it('holds with the shipped luck rules (player and boss crits) switched on', () => {
    let crits = 0;
    for (let s = 0; s < 20; s++) {
      const seed = `prefix-shipped-${s}`;
      const base: FightInput = { ...finaleInput(seed, []), luck: RULES.combat.luck };
      const baseResult = simulateFight(base, rng());
      crits += baseResult.events.filter((e) => 'crit' in e && e.crit === true).length;
      for (const k of [2, 5, 9]) {
        const extra = extraAbility(base, s + k, k);
        const result = simulateFight({ ...base, finaleAbilities: [extra] }, rng());
        expect(eventsBefore(result.events, k)).toEqual(eventsBefore(baseResult.events, k));
      }
    }
    // The comparison is not vacuous: crits really happen.
    expect(crits).toBeGreaterThan(0);
  });

  it('holds with the live combat rules (Guard armor and the Guard dice) and luck switched on', () => {
    let armored = 0;
    for (let s = 0; s < 20; s++) {
      const seed = `prefix-rules-${s}`;
      const base: FightInput = {
        ...finaleInput(seed, []),
        luck: RULES.combat.luck,
        rules: liveFightRules(),
      };
      const baseResult = simulateFight(base, rng());
      armored += baseResult.events.filter(
        (e) => e.t === 'boss_hit' && e.armored !== undefined,
      ).length;
      for (const k of [2, 5, 9]) {
        const extra = extraAbility(base, s + k, k);
        const result = simulateFight({ ...base, finaleAbilities: [extra] }, rng());
        expect(eventsBefore(result.events, k)).toEqual(eventsBefore(baseResult.events, k));
      }
    }
    // The comparison is not vacuous: Guards really take armored hits.
    expect(armored).toBeGreaterThan(0);
  });

  it('moving a later ability between rounds after k changes nothing up to round k', () => {
    for (let s = 0; s < SEEDS; s++) {
      const seed = `prefix-move-${s}`;
      const base = finaleInput(seed, []);
      const k = 2 + (s % 4);
      const fixed = extraAbility(base, s, k);
      const results = [k + 1, k + 3, 12].map((later) =>
        simulateFight(
          { ...base, finaleAbilities: [fixed, extraAbility(base, s + 1, later)] },
          rng(),
        ),
      );
      const first = results[0];
      if (first === undefined) throw new Error('no result');
      for (const r of results) {
        expect(eventsUpTo(r.events, k)).toEqual(eventsUpTo(first.events, k));
      }
    }
  });

  it('holds for every content ability added at round k, one at a time', () => {
    // Covers every op: rally, shield_wall (own and choose), re_mark (own and choose), purge, strike.
    for (const [i, def] of content.finaleAbilities.entries()) {
      for (const k of [3, 7]) {
        const base = finaleInput(`prefix-each-${i}`, []);
        const extra = extraAbility(base, i, k);
        expect(extra.abilityId).toBe(def.id);
        const baseResult = simulateFight(base, rng());
        const result = simulateFight({ ...base, finaleAbilities: [extra] }, rng());
        expect(eventsBefore(result.events, k)).toEqual(eventsBefore(baseResult.events, k));
        // The ability really fires, so the comparison is not vacuous.
        if (result.rounds >= k) {
          expect(result.events.some((e) => e.t === 'ability' && e.key === extra.key)).toBe(true);
        }
      }
    }
  });

  it('holds with several abilities per player, creature abilities included', () => {
    for (let s = 0; s < 10; s++) {
      const base = finaleInput(`prefix-multi-${s}`, []);
      // Everyone brings their basic ability and a creature ability per creature.
      const mine: AbilityChoice[] = base.players.flatMap((_player, p) =>
        [3, 5, 8].map((round, j) => extraAbility(base, s + p * 7 + j * 5, round)),
      );
      const keyed = new Set(mine.map((a) => a.key));
      expect(keyed.size).toBe(mine.length);
      const grouped = new Set(mine.map((a) => a.playerId));
      expect(grouped.size).toBeGreaterThan(1);
      for (const k of [3, 6, 9]) {
        const without = simulateFight(
          { ...base, finaleAbilities: mine.filter((a) => (a.fireAtRound ?? 0) < k) },
          rng(),
        );
        const withAll = simulateFight({ ...base, finaleAbilities: mine }, rng());
        expect(eventsBefore(withAll.events, k)).toEqual(eventsBefore(without.events, k));
      }
    }
  });

  it('holds for abilities that fire at the last round and for defaults that fire later', () => {
    for (let s = 0; s < 10; s++) {
      const base = randomInput(`prefix-last-${s}`, 4, 'finale');
      const rounds = base.boss.finaleRounds;
      // Every ability of every player (basic and creature) at its default round...
      const withDefaults: FightInput = {
        ...base,
        finaleAbilities: base.finaleAbilities.map((a) => ({
          playerId: a.playerId,
          abilityId: a.abilityId,
          key: a.key,
          ...(a.creatureId === undefined ? {} : { creatureId: a.creatureId }),
        })),
      };
      expect(withDefaults.finaleAbilities.length).toBeGreaterThan(base.players.length);
      // ...against pressing Hold on every ability, which turns "fires at its default round"
      // into "fires in the last round": the rounds before the earliest default must not change.
      const held = {
        ...withDefaults,
        finaleAbilities: withDefaults.finaleAbilities.map((a) => ({ ...a, fireAtRound: rounds })),
      };
      const earliest = Math.min(
        ...withDefaults.finaleAbilities.map((a) => {
          const def = content.finaleAbilities.find((d) => d.id === a.abilityId);
          if (def === undefined) throw new Error('unknown ability');
          return defaultAbilityRound(base.boss, def, rounds);
        }),
      );
      const a = simulateFight(withDefaults, rng());
      const b = simulateFight(held, rng());
      expect(eventsBefore(a.events, earliest)).toEqual(eventsBefore(b.events, earliest));
    }
  });
});

describe('defaultAbilityRound', () => {
  it('is the content default round for abilities without a zone-hit default', () => {
    const tidal = boss('tidal-colossus');
    const rounds = tidal.finaleRounds;
    const byId = Object.fromEntries(
      content.finaleAbilities
        .filter((a) => a.kind === 'basic')
        .map((a) => [a.id, defaultAbilityRound(tidal, a, rounds)]),
    );
    expect(byId['rally']).toBe(6);
    expect(byId['re-mark']).toBe(4);
    expect(byId['purge']).toBe(2);
  });

  it('puts Shield Wall on the first zone attack from round 2, else on its content round', () => {
    const shield = content.finaleAbilities.find((a) => a.id === 'shield-wall');
    if (shield === undefined) throw new Error('no shield wall');
    const tidal = boss('tidal-colossus'); // Undertow: every 3rd round, front zone
    expect(defaultAbilityRound(tidal, shield, tidal.finaleRounds)).toBe(3);
    // Not within the fight: back to the content default.
    expect(defaultAbilityRound(tidal, shield, 2)).toBe(shield.defaultRound);
    const plain = { ...tidal, gimmicks: [] };
    expect(defaultAbilityRound(plain, shield, 12)).toBe(shield.defaultRound);
    const everyTwo = {
      ...tidal,
      gimmicks: tidal.gimmicks.map((g) =>
        g.op === 'hit_zone' ? { ...g, trigger: { every: 2 } } : g,
      ),
    };
    expect(defaultAbilityRound(everyTwo, shield, 12)).toBe(2);
  });

  it('agrees with the round the engine fires default abilities in, for every boss', () => {
    for (const b of content.bosses) {
      const row = ['f0', 'f1', 'm2', 'm3', 'b4', 'b5'].map((id) => slot(id, { atk: 1 }));
      for (const def of content.finaleAbilities) {
        const r = run(row, {
          boss: b,
          bossAtk: 100,
          phase: 'finale',
          finaleAbilities: [{ key: 'k', playerId: 'p1', abilityId: def.id, creatureId: 'f0' }],
        });
        const fired = eventsOf(r, 'ability');
        expect(fired).toHaveLength(1);
        expect(fired[0]?.round).toBe(defaultAbilityRound(b, def, b.finaleRounds));
      }
    }
  });
});
