import { describe, expect, it } from 'vitest';
import { NO_LUCK, RULES, createSeededRng, type LuckConfig } from '@creatures/game';
import { simulateFight, type FightEvent, type FightInput, type FightResult } from '../src/index';
import { describeEvent } from '../src/describe';
import { eventsOf, input, randomInput, run, slot } from './helpers';

const OFF: LuckConfig = RULES.combat.luck;
const CRIT: LuckConfig = { ...OFF, critChanceBp: 3_000, critBp: 10_000 };
const SPREAD: LuckConfig = { ...OFF, spreadBp: 3_000 };
const STREAKS: LuckConfig = {
  ...OFF,
  surgeChanceBp: 2_000,
  slumpChanceBp: 2_000,
  swingBp: 5_000,
  swingRounds: 3,
};

const row = () => [slot('a'), slot('b', { owner: 'p2' }), slot('c', { owner: 'p3' })];
const fight = (luck: LuckConfig | undefined, rounds = 12): FightInput =>
  input(row(), {
    phase: 'finale',
    boss: { ...input(row()).boss, finaleRounds: rounds },
    ...(luck === undefined ? {} : { luck }),
  });
const play = (luck: LuckConfig | undefined, seed: string) =>
  simulateFight(fight(luck), createSeededRng(seed));
const damageOf = (events: readonly FightEvent[]): number =>
  events.reduce((n, e) => (e.t === 'hit' ? n + e.damage : n), 0);

describe('luck is off by default', () => {
  it('ships with every chance at zero', () => {
    expect(RULES.combat.luck.critChanceBp).toBe(0);
    expect(RULES.combat.luck.spreadBp).toBe(0);
    expect(RULES.combat.luck.surgeChanceBp).toBe(0);
    expect(RULES.combat.luck.slumpChanceBp).toBe(0);
  });

  it('ignores the seed: any seed gives the same fight, the same with luck absent or all zero', () => {
    const first = play(undefined, 'seed-0');
    for (let s = 1; s < 40; s++) {
      expect(play(undefined, `seed-${s}`).events).toEqual(first.events);
      expect(play(OFF, `seed-${s}`).events).toEqual(first.events);
      expect(play(NO_LUCK, `seed-${s}`).events).toEqual(first.events);
    }
  });

  it('draws nothing from the RNG', () => {
    let draws = 0;
    simulateFight(fight(undefined), {
      nextU32: () => {
        draws += 1;
        return 0;
      },
    });
    expect(draws).toBe(0);
  });

  it('never adds luck fields to events', () => {
    const r = play(undefined, 'x');
    for (const e of r.events) {
      if (e.t === 'hit') expect(e.crit === undefined && e.luckBp === undefined).toBe(true);
      if (e.t === 'round_start') expect(e.luck).toBeUndefined();
    }
  });
});

describe('luck on', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    for (const luck of [CRIT, SPREAD, STREAKS]) {
      const a = play(luck, 'same');
      expect(play(luck, 'same').events).toEqual(a.events);
      const totals = new Set<number>();
      for (let s = 0; s < 20; s++) totals.add(damageOf(play(luck, `v-${s}`).events));
      expect(totals.size).toBeGreaterThan(5);
    }
  });

  it('crits add the crit bonus to the hit and say so (Critical!)', () => {
    const r = play(CRIT, 'crit');
    const crits = eventsOf(r, 'hit').filter((h) => h.crit === true);
    const plain = eventsOf(r, 'hit').filter((h) => h.crit !== true);
    expect(crits.length).toBeGreaterThan(0);
    expect(plain.length).toBeGreaterThan(0);
    // Same attacker and matchup, so a crit hit is twice a plain hit while no other bonus is on.
    for (const h of crits) {
      expect(h.luckBp).toBe(10_000);
      expect(h.damage).toBeGreaterThan(plain[0]?.damage ?? 0);
    }
    expect(describeEvent(crits[0] as FightEvent, { boss: 'Boss', creatures: {} })).toContain(
      'Critical!',
    );
  });

  it('the crit rate matches the chance', () => {
    let crits = 0;
    let hits = 0;
    for (let s = 0; s < 60; s++) {
      for (const h of eventsOf(play(CRIT, `rate-${s}`), 'hit')) {
        hits += 1;
        if (h.crit === true) crits += 1;
      }
    }
    expect(crits / hits).toBeGreaterThan(0.27);
    expect(crits / hits).toBeLessThan(0.33);
  });

  it('spread keeps every hit within the band', () => {
    const base = Math.max(...eventsOf(play(undefined, 'x'), 'hit').map((h) => h.damage));
    for (let s = 0; s < 20; s++) {
      for (const h of eventsOf(play(SPREAD, `sp-${s}`), 'hit')) {
        expect(h.luckBp ?? 0).toBeGreaterThanOrEqual(-3_000);
        expect(h.luckBp ?? 0).toBeLessThanOrEqual(3_000);
        expect(h.damage).toBeGreaterThanOrEqual(Math.floor((base * 7_000) / 10_000) - 1);
        expect(h.damage).toBeLessThanOrEqual(Math.floor((base * 13_000) / 10_000) + 1);
      }
    }
  });

  it('streaks last their rounds, do not overlap and change the damage of those rounds', () => {
    let seen = 0;
    for (let s = 0; s < 40; s++) {
      const r = play(STREAKS, `st-${s}`);
      const starts = eventsOf(r, 'round_start').filter((e) => e.luck !== undefined);
      let until = 0;
      for (const e of starts) {
        expect(e.round).toBeGreaterThan(until);
        expect(e.luck?.rounds).toBe(3);
        expect(e.luck?.bp).toBe(5_000);
        until = e.round + 2;
        seen += 1;
        const expected = e.luck?.kind === 'surge' ? 5_000 : -5_000;
        const hit = eventsOf(r, 'hit').find((h) => h.round === e.round);
        if (hit !== undefined) expect(hit.luckBp).toBe(expected);
      }
    }
    expect(seen).toBeGreaterThan(20);
  });

  it('a creature keeps its dice whatever else is in the row', () => {
    const base = fight(CRIT);
    const fewer: FightInput = { ...base, row: [slot('a'), slot('c', { owner: 'p3' })] };
    const firstHit = (r: FightResult) =>
      eventsOf(r, 'hit').find((h) => h.creature === 'a' && h.round === 1);
    const full = simulateFight(base, createSeededRng('dice'));
    const small = simulateFight(fewer, createSeededRng('dice'));
    // Dice are drawn for every slot in order, so slot "a" (first) rolls the same in both rows.
    expect(firstHit(full)?.crit).toBe(firstHit(small)?.crit);
    expect(firstHit(full)?.luckBp).toBe(firstHit(small)?.luckBp);
  });

  it('keeps the prefix property: an ability fired in round k leaves rounds before k unchanged', () => {
    for (let s = 0; s < 15; s++) {
      for (const luck of [CRIT, SPREAD, STREAKS]) {
        const base: FightInput = {
          ...randomInput(`prefix-luck-${s}`, 4, 'finale'),
          luck,
          finaleAbilities: [],
        };
        const extended: FightInput = {
          ...base,
          finaleAbilities: [
            { playerId: 'player-0', abilityId: 'rally', key: 'extra', fireAtRound: 8 },
          ],
        };
        const a = simulateFight(base, createSeededRng(`p-${s}`));
        const b = simulateFight(extended, createSeededRng(`p-${s}`));
        const before = (r: FightResult) => r.events.filter((e) => e.round < 8);
        expect(before(b)).toEqual(before(a));
        expect(before(a).length).toBeGreaterThan(0);
      }
    }
  });

  it('runs a normal phase with luck and clears or not without errors', () => {
    const r = run(row(), { luck: STREAKS });
    expect(r.rounds).toBeGreaterThan(0);
  });
});

describe('luck validation', () => {
  it.each([
    { critChanceBp: 10_001 },
    { critChanceBp: -1 },
    { critBp: 1.5 },
    { spreadBp: 10_001 },
    { surgeChanceBp: 9_000, slumpChanceBp: 2_000 },
    { swingRounds: 13 },
  ])('refuses %j', (bad) => {
    expect(() => simulateFight(fight({ ...OFF, ...bad }), createSeededRng('x'))).toThrow(
      RangeError,
    );
  });
});
