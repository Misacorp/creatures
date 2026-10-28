import { describe, expect, it } from 'vitest';
import { PATTERN_OPS, RULES } from '@creatures/game';
import {
  damageDealt,
  liveFightRules,
  simulateFight,
  type FightInput,
  type FightResult,
} from '../src/index';
import { randomInput, rng } from './helpers';

const phases = ['phase1', 'phase2', 'finale'] as const;
const SEEDS = 150;

/**
 * Checks one result and returns what is wrong with it, one line per broken property (empty when all
 * hold). The checks run in hot loops (every event of every fight), so they do not call `expect`
 * each time: a failing run asserts once, on the list, and the lines say what broke and with what.
 */
function checkResult(inp: FightInput, r: FightResult): string[] {
  const bad: string[] = [];
  const check = (ok: boolean, what: string, got?: unknown): void => {
    if (!ok) bad.push(got === undefined ? what : `${what}: got ${JSON.stringify(got)}`);
  };
  const isInt = (v: number) => Number.isSafeInteger(v) && v >= 0;
  const ints = (what: string, o: Record<string, number | string | null>) => {
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'number') check(isInt(v), `${what}.${k} is a non-negative integer`, v);
    }
  };
  // Boss HP stays within [0, max] and only goes down.
  check(r.bossHpEnd >= 0, 'bossHpEnd >= 0', r.bossHpEnd);
  check(r.bossHpEnd <= r.bossHpStart, 'bossHpEnd <= bossHpStart', [r.bossHpEnd, r.bossHpStart]);
  check(r.bossHpStart === inp.bossHpPool.current, 'bossHpStart is the pool', r.bossHpStart);
  check(r.rounds >= 1, 'at least one round', r.rounds);
  let last = r.bossHpStart;
  for (const e of r.events) {
    if (e.t === 'hit') {
      check(e.bossHp >= 0, 'hit bossHp >= 0', e.bossHp);
      check(e.bossHp <= last, 'hit bossHp only goes down', [e.bossHp, last]);
      check(Number.isSafeInteger(e.damage), 'hit damage is an integer', e.damage);
      last = e.bossHp;
    }
  }
  check(last === r.bossHpEnd, 'last hit leaves bossHpEnd', [last, r.bossHpEnd]);

  // Totals are integers and contributions add up.
  let damage = 0;
  let setup = 0;
  let support = 0;
  let guard = 0;
  for (const [id, t] of Object.entries(r.perPlayer)) {
    ints(`perPlayer.${id}`, t as unknown as Record<string, number>);
    check(
      t.contribution === t.damage + t.setupCredit + t.supportCredit + t.guardCredit,
      `perPlayer.${id} contribution adds up`,
      t,
    );
  }
  for (const [id, t] of Object.entries(r.perCreature)) {
    ints(`perCreature.${id}`, t as unknown as Record<string, number>);
    check(
      t.contribution === t.damage + t.setupCredit + t.supportCredit + t.guardCredit,
      `perCreature.${id} contribution adds up`,
      t,
    );
    damage += t.damage;
    setup += t.setupCredit;
    support += t.supportCredit;
    guard += t.guardCredit;
    check(Boolean(id), 'creature id is not empty');
  }
  // Damage + setup credit equals the nominal damage of all hits (creature and player level agree
  // except for credits that belong to guests or to finale abilities, which have no creature).
  const dealt = r.events.reduce((sum, e) => (e.t === 'hit' ? sum + e.damage : sum), 0);
  const abilitySetup = Object.values(r.perPlayer).reduce((s, p) => s + p.setupCredit, 0) - setup;
  // Setup credit and the support credit for buffs and Overcharge are zero-sum: they move credit
  // between creatures, never add to it. Healing is the one support credit that is new credit (the
  // HP really restored, like what a Guard absorbs), so it is taken off first.
  const healed = r.events.reduce((sum, e) => (e.t === 'heal' ? sum + e.amount : sum), 0);
  check(support >= healed, 'support credit covers the healing', [support, healed]);
  check(
    damage + setup + (support - healed) + abilitySetup === dealt,
    'damage + setup + support (less healing) + ability setup = damage dealt',
    [damage, setup, support, healed, abilitySetup, dealt],
  );
  // So all contributions together equal the damage dealt plus what guards absorbed and Supports healed.
  const contributions = Object.values(r.perPlayer).reduce((sum, p) => sum + p.contribution, 0);
  const guestContributions = Object.values(r.perCreature)
    .filter((c) => c.ownerId === null)
    .reduce((sum, c) => sum + c.contribution, 0);
  check(
    contributions + guestContributions === dealt + guard + healed,
    'contributions = damage dealt + guard + healed',
    [contributions, guestContributions, dealt, guard, healed],
  );
  const byElement = Object.values(r.damageByElement).reduce((a, b) => a + b, 0);
  check(byElement === dealt, 'damageByElement adds up to the damage dealt', [byElement, dealt]);
  // Player totals never exceed the creature totals that feed them (plus ability setup credit).
  const playerDamage = Object.values(r.perPlayer).reduce((s, p) => s + p.damage, 0);
  const ownedDamage = Object.values(r.perCreature)
    .filter((c) => c.ownerId !== null)
    .reduce((s, c) => s + c.damage, 0);
  check(playerDamage === ownedDamage, 'player damage = owned creature damage', [
    playerDamage,
    ownedDamage,
  ]);
  // The damage each creature really dealt (the scoreboard's Damage) adds up to the HP the boss lost.
  const real = Object.values(damageDealt(r.events)).reduce((s, d) => s + d, 0);
  check(real === r.bossHpStart - r.bossHpEnd, 'damageDealt adds up to the HP lost', [
    real,
    r.bossHpStart - r.bossHpEnd,
  ]);
  const taken = Object.values(r.perCreature).reduce((s, c) => s + c.damageTaken, 0);
  check(guard <= taken, 'guard credit <= damage taken', [guard, taken]);
  check(support >= 0, 'support credit >= 0', support);

  // Reaction counts match the events.
  const reactionEvents = r.events.filter((e) => e.t === 'reaction').length;
  check(r.reactions.total === reactionEvents, 'reactions.total matches the events', [
    r.reactions.total,
    reactionEvents,
  ]);
  const byType = Object.values(r.reactions.byType).reduce((a, b) => a + b, 0);
  check(byType === reactionEvents, 'reactions.byType adds up to the events', [
    byType,
    reactionEvents,
  ]);

  // Rounds are in order, and the clear flag agrees with the pool.
  let round = 0;
  for (const e of r.events) {
    if ('round' in e) {
      check(e.round >= round, 'rounds are in order', [e.t, e.round, round]);
      round = e.round;
    }
  }
  const lossBp = ((inp.bossHpPool.max - r.bossHpEnd) * 10_000) / inp.bossHpPool.max;
  const need = RULES.raid.phases.find((p) => p.id === inp.phase)!.clearAtLossBp;
  check(r.cleared === lossBp >= need, 'cleared agrees with the pool', [r.cleared, lossBp, need]);
  // Knocked-out creatures never act afterwards (an ability's strike still lands).
  const out = new Map<string, number>();
  for (const e of r.events) if (e.t === 'knockout') out.set(e.creature, e.round);
  const fired = new Set(r.events.flatMap((e) => (e.t === 'ability' ? [e.key] : [])));
  for (const e of r.events) {
    if (e.t === 'hit' && e.key !== undefined) {
      check(fired.has(e.key), 'a keyed hit follows its ability', e.key);
    }
    if (e.t === 'turn' || (e.t === 'hit' && e.key === undefined)) {
      const ko = out.get(e.creature);
      if (ko !== undefined) {
        check(e.round <= ko, 'a knocked-out creature never acts afterwards', [
          e.creature,
          e.round,
          ko,
        ]);
      }
    }
  }
  if (inp.phase === 'phase1') {
    check(r.adaptationSuggestion !== null, 'phase 1 suggests an adaptation');
  } else check(r.adaptationSuggestion === null, 'only phase 1 suggests an adaptation');
  return bad;
}

describe('properties over seeded random fights', () => {
  it('keep integers, consistent totals and sane boss HP; never throw; are deterministic', () => {
    const problems: string[] = [];
    for (let i = 0; i < SEEDS; i++) {
      const players = 1 + (i % 15);
      const phase = phases[i % 3] as (typeof phases)[number];
      const inp = randomInput(`prop-${i}`, players, phase);
      const before = JSON.stringify(inp);
      const first = simulateFight(inp, rng());
      const second = simulateFight(inp, rng());
      if (JSON.stringify(inp) !== before) problems.push(`prop-${i}: the input was changed`);
      // The same fight twice must give the same result (JSON text, so one compare per fight).
      if (JSON.stringify(second) !== JSON.stringify(first)) {
        problems.push(`prop-${i}: two runs differ`);
      }
      for (const p of checkResult(inp, first)) problems.push(`prop-${i}: ${p}`);
    }
    expect(problems).toEqual([]);
  });

  it('hold with the live combat rules (armor, cover, cap, Guard dice): deterministic, consistent totals', () => {
    const problems: string[] = [];
    for (let i = 0; i < SEEDS; i++) {
      const phase = phases[i % 3] as (typeof phases)[number];
      const inp: FightInput = {
        ...randomInput(`prop-rules-${i}`, 1 + (i % 15), phase),
        rules: liveFightRules(),
        luck: RULES.combat.luck,
      };
      const first = simulateFight(inp, rng());
      if (JSON.stringify(simulateFight(inp, rng())) !== JSON.stringify(first)) {
        problems.push(`prop-rules-${i}: two runs differ`);
      }
      for (const p of checkResult(inp, first)) problems.push(`prop-rules-${i}: ${p}`);
    }
    expect(problems).toEqual([]);
  });

  it('count Echo and Riposte in the damage dealt: it adds up to the HP the boss lost', () => {
    const problems: string[] = [];
    let procs = 0;
    for (let i = 0; i < 40; i++) {
      const phase = phases[i % 3] as (typeof phases)[number];
      const base = randomInput(`prop-procs-${i}`, 1 + (i % 6), phase);
      const inp: FightInput = {
        ...base,
        row: base.row.map((s) => ({
          ...s,
          mods: { echoBp: 5_000, dodgeBp: 3_000, riposteBp: 3_000 },
        })),
        rules: liveFightRules(),
        luck: RULES.combat.luck,
      };
      const r = simulateFight(inp, rng());
      procs += r.events.filter(
        (e) => e.t === 'proc' && (e.kind === 'echo' || e.kind === 'riposte'),
      ).length;
      const real = Object.values(damageDealt(r.events)).reduce((s, d) => s + d, 0);
      if (real !== r.bossHpStart - r.bossHpEnd) {
        problems.push(
          `prop-procs-${i}: ${String(real)} dealt, ${String(r.bossHpStart - r.bossHpEnd)} lost`,
        );
      }
    }
    expect(problems).toEqual([]);
    expect(procs).toBeGreaterThan(0);
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
    const early: string[] = [];
    for (let i = 0; i < 60; i++) {
      const inp = randomInput(`early-${i}`, 3, 'finale');
      const r = simulateFight(inp, rng());
      const planned = inp.boss.finaleRounds;
      if (r.rounds < planned) {
        const koCount = r.events.filter((e) => e.t === 'knockout').length;
        if (!(r.bossHpEnd === 0 || koCount === inp.row.length)) early.push(`early-${i}`);
      }
    }
    expect(early).toEqual([]);
  });
});
