import { describe, expect, it } from 'vitest';
import { simulateFight, type FightInput, type FightResult } from '../src/index';
import { randomInput, rng } from './helpers';

const phases = ['phase1', 'phase2', 'finale'] as const;
const SEEDS = 150;

function checkResult(inp: FightInput, r: FightResult): void {
  const ints = (o: Record<string, number | string | null>) => {
    for (const v of Object.values(o)) {
      if (typeof v === 'number') {
        expect(Number.isSafeInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  };
  // Boss HP stays within [0, max] and only goes down.
  expect(r.bossHpEnd).toBeGreaterThanOrEqual(0);
  expect(r.bossHpEnd).toBeLessThanOrEqual(r.bossHpStart);
  expect(r.bossHpStart).toBe(inp.bossHpPool.current);
  expect(r.rounds).toBeGreaterThanOrEqual(1);
  let last = r.bossHpStart;
  for (const e of r.events) {
    if (e.t === 'hit') {
      expect(e.bossHp).toBeGreaterThanOrEqual(0);
      expect(e.bossHp).toBeLessThanOrEqual(last);
      expect(Number.isSafeInteger(e.damage)).toBe(true);
      last = e.bossHp;
    }
  }
  expect(last).toBe(r.bossHpEnd);

  // Totals are integers and contributions add up.
  let damage = 0;
  let setup = 0;
  let support = 0;
  let guard = 0;
  for (const t of Object.values(r.perPlayer)) {
    ints(t as unknown as Record<string, number>);
    expect(t.contribution).toBe(t.damage + t.setupCredit + t.supportCredit + t.guardCredit);
  }
  for (const [id, t] of Object.entries(r.perCreature)) {
    ints(t as unknown as Record<string, number>);
    expect(t.contribution).toBe(t.damage + t.setupCredit + t.supportCredit + t.guardCredit);
    damage += t.damage;
    setup += t.setupCredit;
    support += t.supportCredit;
    guard += t.guardCredit;
    expect(id).toBeTruthy();
  }
  // Damage + setup credit equals the nominal damage of all hits (creature and player level agree
  // except for credits that belong to guests or to finale abilities, which have no creature).
  const dealt = r.events.reduce((sum, e) => (e.t === 'hit' ? sum + e.damage : sum), 0);
  const abilitySetup = Object.values(r.perPlayer).reduce((s, p) => s + p.setupCredit, 0) - setup;
  // Setup and support credit are zero-sum: they move credit between creatures, never add to it.
  expect(damage + setup + support + abilitySetup).toBe(dealt);
  // So all contributions together equal the damage dealt plus what guards absorbed.
  const contributions = Object.values(r.perPlayer).reduce((sum, p) => sum + p.contribution, 0);
  const guestContributions = Object.values(r.perCreature)
    .filter((c) => c.ownerId === null)
    .reduce((sum, c) => sum + c.contribution, 0);
  expect(contributions + guestContributions).toBe(dealt + guard);
  expect(Object.values(r.damageByElement).reduce((a, b) => a + b, 0)).toBe(dealt);
  // Player totals never exceed the creature totals that feed them (plus ability setup credit).
  const playerDamage = Object.values(r.perPlayer).reduce((s, p) => s + p.damage, 0);
  const ownedDamage = Object.values(r.perCreature)
    .filter((c) => c.ownerId !== null)
    .reduce((s, c) => s + c.damage, 0);
  expect(playerDamage).toBe(ownedDamage);
  const taken = Object.values(r.perCreature).reduce((s, c) => s + c.damageTaken, 0);
  expect(guard).toBeLessThanOrEqual(taken);
  expect(support).toBeGreaterThanOrEqual(0);

  // Reaction counts match the events.
  const reactionEvents = r.events.filter((e) => e.t === 'reaction').length;
  expect(r.reactions.total).toBe(reactionEvents);
  expect(Object.values(r.reactions.byType).reduce((a, b) => a + b, 0)).toBe(reactionEvents);

  // Rounds are in order, and the clear flag agrees with the pool.
  let round = 0;
  for (const e of r.events) {
    if ('round' in e) {
      expect(e.round).toBeGreaterThanOrEqual(round);
      round = e.round;
    }
  }
  const lossBp = ((inp.bossHpPool.max - r.bossHpEnd) * 10_000) / inp.bossHpPool.max;
  const need = { phase1: 3000, phase2: 6000, finale: 10_000 }[inp.phase];
  expect(r.cleared).toBe(lossBp >= need);
  // Knocked-out creatures never act afterwards.
  const out = new Map<string, number>();
  for (const e of r.events) if (e.t === 'knockout') out.set(e.creature, e.round);
  for (const e of r.events) {
    if (e.t === 'turn' || e.t === 'hit') {
      const ko = out.get(e.creature);
      if (ko !== undefined) expect(e.round).toBeLessThanOrEqual(ko);
    }
  }
  if (inp.phase === 'phase1') expect(r.adaptationSuggestion).not.toBeNull();
  else expect(r.adaptationSuggestion).toBeNull();
}

describe('properties over seeded random fights', () => {
  it('keep integers, consistent totals and sane boss HP; never throw; are deterministic', () => {
    for (let i = 0; i < SEEDS; i++) {
      const players = 1 + (i % 15);
      const phase = phases[i % 3] as (typeof phases)[number];
      const inp = randomInput(`prop-${i}`, players, phase);
      const before = JSON.stringify(inp);
      const first = simulateFight(inp, rng());
      const second = simulateFight(inp, rng());
      expect(JSON.stringify(inp)).toBe(before);
      expect(second).toEqual(first);
      checkResult(inp, first);
    }
  });

  it('give the same result for a different RNG (the MVP rules draw no randomness)', () => {
    const inp = randomInput('rng-independent', 6, 'finale');
    const a = simulateFight(inp, rng());
    const b = simulateFight(inp, { nextU32: () => 12345 });
    expect(b).toEqual(a);
  });

  it('end early only when the boss falls or the whole row is knocked out', () => {
    for (let i = 0; i < 60; i++) {
      const inp = randomInput(`early-${i}`, 3, 'finale');
      const r = simulateFight(inp, rng());
      const planned = inp.boss.finaleRounds;
      if (r.rounds < planned) {
        const koCount = r.events.filter((e) => e.t === 'knockout').length;
        expect(r.bossHpEnd === 0 || koCount === inp.row.length).toBe(true);
      }
    }
  });
});
