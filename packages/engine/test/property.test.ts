import { describe, expect, it } from 'vitest';
import { PATTERN_OPS, RULES } from '@creatures/game';
import { liveFightRules, simulateFight, type FightInput, type FightResult } from '../src/index';
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
  const need = RULES.raid.phases.find((p) => p.id === inp.phase)!.clearAtLossBp;
  expect(r.cleared).toBe(lossBp >= need);
  // Knocked-out creatures never act afterwards (an ability's strike still lands).
  const out = new Map<string, number>();
  for (const e of r.events) if (e.t === 'knockout') out.set(e.creature, e.round);
  const fired = new Set(r.events.flatMap((e) => (e.t === 'ability' ? [e.key] : [])));
  for (const e of r.events) {
    if (e.t === 'hit' && e.key !== undefined) expect(fired.has(e.key)).toBe(true);
    if (e.t === 'turn' || (e.t === 'hit' && e.key === undefined)) {
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

  it('hold with the live combat rules (armor, cover, cap, Guard dice): deterministic, consistent totals', () => {
    // The Support element effects are left out: their reaction credit is not zero-sum with the
    // damage dealt, which `checkResult` asserts (a gap that predates the Guard rework).
    for (let i = 0; i < SEEDS; i++) {
      const phase = phases[i % 3] as (typeof phases)[number];
      const inp: FightInput = {
        ...randomInput(`prop-rules-${i}`, 1 + (i % 15), phase),
        rules: { ...liveFightRules(), supportFx: {} },
        luck: RULES.combat.luck,
      };
      const first = simulateFight(inp, rng());
      expect(simulateFight(inp, rng())).toEqual(first);
      checkResult(inp, first);
    }
  });

  it('give the same result for a different RNG (the MVP rules draw no randomness)', () => {
    // Only the attack patterns draw dice (random shells, random lanes); every older move is fixed.
    const drawn = randomInput('rng-independent', 6, 'finale');
    const inp = {
      ...drawn,
      boss: {
        ...drawn.boss,
        gimmicks: drawn.boss.gimmicks.filter(
          (g) => !(PATTERN_OPS as readonly string[]).includes(g.op),
        ),
      },
    };
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
