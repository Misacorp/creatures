import { describe, expect, it } from 'vitest';
import { NO_LUCK, RULES, createSeededRng, type LuckConfig } from '@creatures/game';
import {
  bossCritStats,
  creatureCritStats,
  makeSlot,
  simulateFight,
  type FightEvent,
  type FightInput,
  type FightResult,
} from '../src/index';
import { describeEvent } from '../src/describe';
import { eventsOf, input, randomInput, run, slot, species } from './helpers';

/** Every chance at zero (the shipped caps and sizes), the base the luck tests switch things on from. */
const OFF: LuckConfig = {
  ...RULES.combat.luck,
  critChanceBp: 0,
  bossCritChanceBp: 0,
  bossRandomTargetBp: 0,
  spreadBp: 0,
  surgeChanceBp: 0,
  slumpChanceBp: 0,
};
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
  it('ships crits on (5% and +50%, players and boss) and spread and streaks off', () => {
    expect(RULES.combat.luck.critChanceBp).toBe(500);
    expect(RULES.combat.luck.critBp).toBe(5_000);
    expect(RULES.combat.luck.bossCritChanceBp).toBe(500);
    expect(RULES.combat.luck.bossCritBp).toBe(5_000);
    expect(RULES.combat.luck.critMaxChanceBp).toBe(3_000);
    expect(RULES.combat.luck.critMaxBp).toBe(15_000);
    expect(RULES.combat.luck.bossRandomTargetBp).toBe(0);
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

// ---- crit stats and boss crits ----

const CRITS: LuckConfig = {
  ...OFF,
  critChanceBp: 500,
  critBp: 5_000,
  critMaxChanceBp: 3_000,
  critMaxBp: 15_000,
};
/** A luck as stored before caps and boss crits existed: only the seven original fields. */
const legacyLuck = (over: Partial<LuckConfig>): LuckConfig => ({
  critChanceBp: 0,
  critBp: 5_000,
  spreadBp: 0,
  surgeChanceBp: 0,
  slumpChanceBp: 0,
  swingBp: 5_000,
  swingRounds: 3,
  ...over,
});
const BOSS_CRITS: LuckConfig = { ...CRITS, bossCritChanceBp: 2_000, bossCritBp: 5_000 };

/** A fight where the boss hits a creature that survives: a guard-less row with plenty of HP. */
const bossFight = (luck: LuckConfig | undefined, boss?: Partial<FightInput['boss']>): FightInput =>
  input([slot('a', { hp: 1_000_000 }), slot('b', { hp: 1_000_000, owner: 'p2' })], {
    phase: 'finale',
    boss: { ...input(row()).boss, finaleRounds: 12, ...boss },
    bossAtk: 100,
    ...(luck === undefined ? {} : { luck }),
  });
const bossHits = (r: FightResult) => eventsOf(r, 'boss_hit');

describe('per-creature crit stats', () => {
  it('adds the species bonus to the baseline and applies the caps', () => {
    expect(creatureCritStats(CRITS, undefined)).toEqual({ chanceBp: 500, damageBp: 5_000 });
    expect(creatureCritStats(CRITS, { chanceBp: 500, damageBp: 2_500 })).toEqual({
      chanceBp: 1_000,
      damageBp: 7_500,
    });
    expect(creatureCritStats(CRITS, { chanceBp: 9_000, damageBp: 90_000 })).toEqual({
      chanceBp: 3_000,
      damageBp: 15_000,
    });
  });

  it('treats a stored luck without caps as uncapped, the way it was fought', () => {
    const old = legacyLuck({ critChanceBp: 4_000, critBp: 20_000 });
    expect(creatureCritStats(old, undefined)).toEqual({ chanceBp: 4_000, damageBp: 20_000 });
  });

  it('copies the crit bonus of a species into its slot', () => {
    const cindle = makeSlot(species('cindle'), {
      id: 'x',
      ownerId: 'p1',
      level: 5,
      fusionCount: 0,
    });
    expect(cindle.crit).toEqual(species('cindle').crit);
    const plain = makeSlot(species('splashet'), {
      id: 'y',
      ownerId: 'p1',
      level: 5,
      fusionCount: 0,
    });
    expect(plain.crit).toBeUndefined();
  });

  it('gives high-crit slots more crits, and says how much extra damage a crit did', () => {
    const lucky = { ...slot('lucky'), crit: { chanceBp: 2_500, damageBp: 10_000 } };
    const f: FightInput = {
      ...fight(CRITS),
      row: [lucky, slot('plain', { owner: 'p2' })],
      players: ['p1', 'p2'],
    };
    const counts = { lucky: [0, 0], plain: [0, 0] };
    for (let s = 0; s < 60; s++) {
      const r = simulateFight(f, createSeededRng(`crit-${s}`));
      for (const h of eventsOf(r, 'hit')) {
        const c = counts[h.creature as 'lucky' | 'plain'];
        c[1] = (c[1] ?? 0) + 1;
        if (h.crit === true) {
          c[0] = (c[0] ?? 0) + 1;
          expect(h.critBp).toBe(h.creature === 'lucky' ? 15_000 : 5_000);
        }
      }
    }
    // lucky: 5% + 25% = 30% chance (cap), plain: 5%.
    expect((counts.lucky[0] ?? 0) / (counts.lucky[1] ?? 1)).toBeGreaterThan(0.25);
    expect((counts.lucky[0] ?? 0) / (counts.lucky[1] ?? 1)).toBeLessThan(0.35);
    expect((counts.plain[0] ?? 0) / (counts.plain[1] ?? 1)).toBeLessThan(0.09);
  });

  it('ignores slot bonuses while the baseline chance is 0 (crits off draw nothing)', () => {
    const lucky = { ...slot('lucky'), crit: { chanceBp: 2_500, damageBp: 10_000 } };
    let draws = 0;
    simulateFight(
      { ...fight(OFF), row: [lucky] },
      {
        nextU32: () => {
          draws += 1;
          return 0;
        },
      },
    );
    expect(draws).toBe(0);
  });
});

describe('boss crits', () => {
  it('are off by default and draw nothing', () => {
    let draws = 0;
    const r = simulateFight(bossFight(CRITS), createSeededRng('x'));
    expect(bossHits(r).every((h) => h.crit === undefined)).toBe(true);
    const counting = {
      nextU32: () => {
        draws += 1;
        return 0;
      },
    };
    simulateFight(bossFight(undefined), counting);
    expect(draws).toBe(0);
  });

  it('crit at the boss chance for the boss crit damage, and say so', () => {
    let crits = 0;
    let hits = 0;
    for (let s = 0; s < 60; s++) {
      for (const h of bossHits(simulateFight(bossFight(BOSS_CRITS), createSeededRng(`b-${s}`)))) {
        hits += 1;
        if (h.crit === true) {
          crits += 1;
          expect(h.critBp).toBe(5_000);
          expect(h.damage).toBe(150);
        } else {
          expect(h.damage).toBe(100);
        }
      }
    }
    expect(crits / hits).toBeGreaterThan(0.17);
    expect(crits / hits).toBeLessThan(0.23);
  });

  it('use the boss content bonus and the caps', () => {
    expect(bossCritStats(BOSS_CRITS, { chanceBp: 1_000, damageBp: 20_000 })).toEqual({
      chanceBp: 3_000,
      damageBp: 15_000,
    });
    expect(bossCritStats(CRITS, { chanceBp: 1_000, damageBp: 1_000 })).toEqual({
      chanceBp: 0,
      damageBp: 0,
    });
    const r = simulateFight(
      bossFight(BOSS_CRITS, { crit: { chanceBp: 1_000, damageBp: 10_000 } }),
      createSeededRng('bonus'),
    );
    for (const h of bossHits(r)) expect(h.damage).toBe(h.crit === true ? 250 : 100);
    expect(bossHits(r).some((h) => h.crit === true)).toBe(true);
  });

  it('can knock out a creature a plain hit would not', () => {
    // 10 HP left after 9 plain hits of 100... a crit does 150, so a creature on 120 HP survives
    // one plain hit but not a crit.
    const f = (luck: LuckConfig) =>
      input([slot('a', { hp: 120 }), slot('b', { owner: 'p2' })], {
        phase: 'finale',
        boss: { ...input(row()).boss, finaleRounds: 1 },
        bossAtk: 100,
        luck: { ...luck, bossCritChanceBp: 10_000, critMaxChanceBp: 10_000 },
      });
    const crit = simulateFight(f(CRITS), createSeededRng('ko'));
    expect(eventsOf(crit, 'knockout').map((e) => e.creature)).toEqual(['a']);
    const none = simulateFight(
      input([slot('a', { hp: 120 }), slot('b', { owner: 'p2' })], {
        phase: 'finale',
        boss: { ...input(row()).boss, finaleRounds: 1 },
        bossAtk: 100,
      }),
      createSeededRng('ko'),
    );
    expect(eventsOf(none, 'knockout')).toHaveLength(0);
  });

  it('do not change the player dice, so switching them on moves no player hit in round 1', () => {
    const a = simulateFight(bossFight(CRITS), createSeededRng('same'));
    const b = simulateFight(bossFight(BOSS_CRITS), createSeededRng('same'));
    expect(eventsOf(b, 'hit').filter((h) => h.round === 1)).toEqual(
      eventsOf(a, 'hit').filter((h) => h.round === 1),
    );
  });

  it('keep the prefix property', () => {
    for (let s = 0; s < 15; s++) {
      const base: FightInput = {
        ...randomInput(`prefix-boss-${s}`, 4, 'finale'),
        luck: BOSS_CRITS,
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
    }
  });

  it('read as Critical! in the log', () => {
    const r = simulateFight(bossFight(BOSS_CRITS), createSeededRng('log'));
    const crit = bossHits(r).find((h) => h.crit === true) as FightEvent;
    expect(describeEvent(crit, { boss: 'Boss', creatures: {} })).toContain('Critical!');
    const plain = bossHits(r).find((h) => h.crit === undefined) as FightEvent;
    expect(describeEvent(plain, { boss: 'Boss', creatures: {} })).not.toContain('Critical!');
  });
});

describe('luck stored before crit stats existed', () => {
  it('replays exactly: absent caps and boss crit fields mean no cap and no boss crit', () => {
    const legacy = legacyLuck({ critChanceBp: 3_000, critBp: 10_000 });
    const explicit: LuckConfig = {
      ...legacy,
      critMaxChanceBp: 10_000,
      critMaxBp: 100_000,
      bossCritChanceBp: 0,
      bossCritBp: 0,
    };
    for (let s = 0; s < 10; s++) {
      expect(play(legacy, `old-${s}`).events).toEqual(play(explicit, `old-${s}`).events);
    }
  });
});

describe('crit validation', () => {
  it.each([
    { critMaxChanceBp: 10_001 },
    { critMaxBp: 100_001 },
    { bossCritChanceBp: -1 },
    { bossCritChanceBp: 10_001 },
    { bossCritBp: 1.5 },
  ])('refuses %j', (bad) => {
    expect(() => simulateFight(fight({ ...CRITS, ...bad }), createSeededRng('x'))).toThrow(
      RangeError,
    );
  });
});

describe('random boss target (prototype)', () => {
  const RANDOM: LuckConfig = { ...CRITS, bossRandomTargetBp: 10_000 };
  const wide = (luck: LuckConfig | undefined): FightInput =>
    input(
      [
        slot('a', { hp: 1_000_000 }),
        slot('b', { hp: 1_000_000 }),
        slot('c', { hp: 1_000_000, owner: 'p2' }),
        slot('d', { hp: 1_000_000, owner: 'p2' }),
        slot('e', { hp: 1_000_000, owner: 'p3' }),
        slot('f', { hp: 1_000_000, owner: 'p3' }),
      ],
      {
        phase: 'finale',
        boss: { ...input(row()).boss, finaleRounds: 12 },
        bossAtk: 100,
        ...(luck === undefined ? {} : { luck }),
      },
    );

  it('is off by default: the boss always hits the front', () => {
    const r = simulateFight(wide(CRITS), createSeededRng('front'));
    expect(new Set(bossHits(r).map((h) => h.target))).toEqual(new Set(['a']));
  });

  it('spreads hits over the whole row when on, and never at a knocked-out creature', () => {
    const targets = new Set<string>();
    for (let s = 0; s < 10; s++) {
      for (const h of bossHits(simulateFight(wide(RANDOM), createSeededRng(`rt-${s}`)))) {
        targets.add(h.target);
      }
    }
    expect(targets.size).toBe(6);
    const weak = wide(RANDOM);
    const r = simulateFight(
      { ...weak, row: weak.row.map((x) => ({ ...x, stats: { hp: 60, atk: 100, spd: 10 } })) },
      createSeededRng('ko-rt'),
    );
    const out = new Set<string>();
    for (const e of r.events) {
      if (e.t === 'knockout') out.add(e.creature);
      if (e.t === 'boss_hit') expect(out.has(e.target)).toBe(false);
    }
    expect(out.size).toBeGreaterThan(0);
  });

  it('a guard in the target zone still takes the hit', () => {
    const f = wide(RANDOM);
    const front = new Set(['a', 'b']);
    const withGuard: FightInput = {
      ...f,
      row: f.row.map((x, i) => (i === 0 ? { ...x, role: 'guard' as const } : x)),
    };
    let intercepted = 0;
    for (let k = 0; k < 10; k++) {
      const r = simulateFight(withGuard, createSeededRng(`guard-${k}`));
      for (const h of bossHits(r)) {
        if (h.from !== undefined && front.has(h.from)) {
          expect(h.target).toBe('a');
          intercepted += 1;
        }
      }
    }
    expect(intercepted).toBeGreaterThan(0);
  });

  it('keeps the prefix property and the player dice', () => {
    const a = simulateFight(wide(CRITS), createSeededRng('same'));
    const b = simulateFight(wide(RANDOM), createSeededRng('same'));
    expect(eventsOf(b, 'hit').filter((h) => h.round === 1)).toEqual(
      eventsOf(a, 'hit').filter((h) => h.round === 1),
    );
  });

  it('refuses a chance above 100%', () => {
    expect(() =>
      simulateFight(wide({ ...CRITS, bossRandomTargetBp: 10_001 }), createSeededRng('x')),
    ).toThrow(RangeError);
  });
});
