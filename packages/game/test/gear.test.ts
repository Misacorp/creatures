import { describe, expect, it } from 'vitest';
import {
  ELEMENTS,
  GEAR_RARITIES,
  GEAR_STATS,
  MAX_SKILL_LEVEL,
  PART_KINDS,
  RULES,
  addParts,
  applyGear,
  cappedBonus,
  craftCost,
  craftRarity,
  createSeededRng,
  dismantleYield,
  droppableBases,
  enchantCost,
  enchantDef,
  expeditionLoot,
  finaleDropOddsBp,
  gearBase,
  gearBonus,
  gearContent,
  improveCost,
  jobDuration,
  jobHours,
  jobXp,
  loadGear,
  rarityFitsBase,
  rerollSecondary,
  rollBlueprint,
  rollFestivalDrop,
  rollFinaleDrop,
  rollGear,
  rollWelcomeKit,
  secondaryChoices,
  shardOf,
  skillLevel,
  upgradeCost,
  type GearItem,
  type GearRarity,
  type GearRolls,
  type GearStat,
  type Rng,
  type Role,
  type Stats,
} from '../src/index';
import basesJson from '../src/content/data/gear.json';
import enchantsJson from '../src/content/data/enchants.json';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const ROLES: readonly Role[] = ['setter', 'payoff', 'support', 'guard'];
const STATS: Stats = { hp: 200, atk: 50, spd: 40 };

/** An rng that always returns the same value: 0 gives every minimum. */
const fixedRng = (value: number): Rng => ({ nextU32: () => value });
/**
 * An rng whose chances (out of 10000) always miss and whose small ranges land near the top. It must
 * stay below 2^32 minus the rejection limit of `int`, or the unbiased sampler would loop forever.
 */
const HIGH = 4_294_959_999;

/** The highest possible rolls of a base at a rarity, built from the rules (the first secondaries, all at maximum). */
function maxRolls(baseId: string, rarity: GearRarity): GearRolls {
  const base = gearBase(baseId);
  if (base === undefined) throw new Error('unknown base');
  const { primaryBp, secondaries } = RULES.gear.rarity[rarity];
  return {
    primary: Math.floor((RULES.gear.rolls.primary[base.primary].max * primaryBp) / 10_000),
    secondary: secondaryChoices(base)
      .slice(0, secondaries)
      .map((stat) => ({ stat, bp: RULES.gear.rolls.secondary[stat].max })),
  };
}

const item = (
  baseId: string,
  rarity: GearRarity,
  level: number,
  rolls: GearRolls,
  enchantId: string | null = null,
): GearItem => ({ baseId, rarity, level, rolls, enchantId });

/** Rarities a base can take: festival bases only festival, the others the three normal ones. */
const raritiesOf = (baseId: string): GearRarity[] =>
  GEAR_RARITIES.filter((r) => rarityFitsBase(gearBase(baseId) ?? { blueprint: 'common' }, r));

describe('the gear content', () => {
  it('ships about a dozen bases plus Festival ones, and about eight enchants', () => {
    expect(gearContent.bases.length).toBeGreaterThanOrEqual(12);
    expect(gearContent.bases.some((b) => b.blueprint === 'festival')).toBe(true);
    expect(gearContent.enchants.length).toBeGreaterThanOrEqual(8);
    for (const base of gearContent.bases) expect(base.id).toMatch(/^[a-z]+(-[a-z0-9]+)*$/);
    for (const enchant of gearContent.enchants) expect(enchant.id).toMatch(/^[a-z]+(-[a-z0-9]+)*$/);
  });

  it('has 3 bases per element tint, one for each normal rarity, plus neutral ones', () => {
    for (const element of ELEMENTS) {
      const tinted = gearContent.bases.filter(
        (b) => b.tint === element && b.blueprint !== 'festival',
      );
      expect(tinted.map((b) => b.blueprint).sort()).toEqual(['common', 'epic', 'rare']);
    }
    expect(gearContent.bases.filter((b) => b.tint === null).length).toBeGreaterThanOrEqual(3);
  });

  it('rejects unknown keys, duplicate ids and bad cross references', () => {
    const cases: [string, (b: Record<string, unknown>[], e: Record<string, unknown>[]) => void][] =
      [
        ['an unknown key on a base', (b) => ((b[0] as Record<string, unknown>)['extra'] = 1)],
        [
          'an unknown key on an enchant',
          (_, e) => ((e[0] as Record<string, unknown>)['extra'] = 1),
        ],
        [
          'an id that is not kebab-case',
          (b) => ((b[0] as Record<string, unknown>)['id'] = 'Bad Id'),
        ],
        [
          'a duplicate base id',
          (b) => ((b[1] as Record<string, unknown>)['id'] = (b[0] as { id: string }).id),
        ],
        [
          'a duplicate enchant id',
          (_, e) => ((e[1] as Record<string, unknown>)['id'] = (e[0] as { id: string }).id),
        ],
        ['an unknown element', (b) => ((b[0] as Record<string, unknown>)['tint'] = 'void')],
        ['an unknown stat', (b) => ((b[0] as Record<string, unknown>)['primary'] = 'luck')],
        [
          'a condition with both a role and an element',
          (_, e) =>
            ((e[0] as Record<string, unknown>)['when'] = { role: 'guard', element: 'tide' }),
        ],
        ['a negative enchant amount', (_, e) => ((e[0] as Record<string, unknown>)['bp'] = -5)],
        ['a long name', (b) => ((b[0] as Record<string, unknown>)['name'] = 'x'.repeat(33))],
      ];
    for (const [name, change] of cases) {
      const bases = clone(basesJson) as Record<string, unknown>[];
      const enchants = clone(enchantsJson) as Record<string, unknown>[];
      change(bases, enchants);
      expect(() => loadGear(bases, enchants), name).toThrow(/Invalid gear/);
    }
  });

  it('rejects content that leaves a rarity or the Festival without a base', () => {
    const noFestival = (clone(basesJson) as { blueprint: string }[]).filter(
      (b) => b.blueprint !== 'festival',
    );
    expect(() => loadGear(noFestival, enchantsJson)).toThrow(/festival/);
    const noEpic = (clone(basesJson) as { blueprint: string; tint: string | null }[]).filter(
      (b) => !(b.blueprint === 'epic' && b.tint === 'tide'),
    );
    expect(() => loadGear(noEpic, enchantsJson)).toThrow(/tide base with a epic/);
  });
});

describe('rollGear', () => {
  it('is deterministic for a seed and uses the rarity multiplier and secondary count', () => {
    const a = rollGear(createSeededRng('gear-a'), 'cinder-charm', 'epic');
    const b = rollGear(createSeededRng('gear-a'), 'cinder-charm', 'epic');
    expect(a).toEqual(b);
    expect(a.secondary).toHaveLength(2);
    expect(rollGear(createSeededRng('x'), 'cinder-charm', 'common').secondary).toHaveLength(0);
    expect(rollGear(createSeededRng('x'), 'cinder-charm', 'rare').secondary).toHaveLength(1);
  });

  it('keeps every roll inside its range, with distinct secondaries that are never the primary', () => {
    const rng = createSeededRng('ranges');
    for (const base of gearContent.bases) {
      for (const rarity of raritiesOf(base.id)) {
        for (let i = 0; i < 40; i++) {
          const rolls = rollGear(rng, base.id, rarity);
          const range = RULES.gear.rolls.primary[base.primary];
          const mult = RULES.gear.rarity[rarity].primaryBp;
          expect(rolls.primary).toBeGreaterThanOrEqual(Math.floor((range.min * mult) / 10_000));
          expect(rolls.primary).toBeLessThanOrEqual(Math.floor((range.max * mult) / 10_000));
          const stats = rolls.secondary.map((s) => s.stat);
          expect(new Set(stats).size).toBe(stats.length);
          expect(stats).not.toContain(base.primary);
          for (const s of rolls.secondary) {
            const r = RULES.gear.rolls.secondary[s.stat];
            expect(s.bp).toBeGreaterThanOrEqual(r.min);
            expect(s.bp).toBeLessThanOrEqual(r.max);
          }
        }
      }
    }
  });

  it('reaches both ends of the range', () => {
    expect(rollGear(fixedRng(0), 'trail-charm', 'common').primary).toBe(
      RULES.gear.rolls.primary.atk.min,
    );
    const rng = createSeededRng('both-ends');
    const seen = new Set<number>();
    for (let i = 0; i < 3_000; i++) seen.add(rollGear(rng, 'trail-charm', 'common').primary);
    expect(Math.max(...seen)).toBe(RULES.gear.rolls.primary.atk.max);
    expect(Math.min(...seen)).toBe(RULES.gear.rolls.primary.atk.min);
  });

  it('refuses unknown bases and rarities the base cannot have', () => {
    const rng = createSeededRng('bad');
    expect(() => rollGear(rng, 'no-such-base', 'common')).toThrow(RangeError);
    expect(() => rollGear(rng, 'trail-charm', 'festival')).toThrow(RangeError);
    expect(() => rollGear(rng, 'lantern-charm', 'epic')).toThrow(RangeError);
    expect(() => rollGear(rng, 'lantern-charm', 'festival')).not.toThrow();
  });
});

describe('rerollSecondary', () => {
  it('changes only the chosen secondary and keeps the stats distinct', () => {
    const rng = createSeededRng('improve');
    const rolls = rollGear(rng, 'cinder-charm', 'epic');
    for (let i = 0; i < 50; i++) {
      const index = i % 2;
      const next = rerollSecondary(rng, 'cinder-charm', rolls, index);
      expect(next.primary).toBe(rolls.primary);
      expect(next.secondary[1 - index]).toEqual(rolls.secondary[1 - index]);
      const stats = next.secondary.map((s) => s.stat);
      expect(new Set(stats).size).toBe(2);
      expect(stats).not.toContain('atk');
      const changed = next.secondary[index] as { stat: GearStat; bp: number };
      const r = RULES.gear.rolls.secondary[changed.stat];
      expect(changed.bp).toBeGreaterThanOrEqual(r.min);
      expect(changed.bp).toBeLessThanOrEqual(r.max);
    }
  });

  it('refuses an index with no secondary', () => {
    const rolls = rollGear(createSeededRng('c'), 'cinder-charm', 'common');
    expect(() => rerollSecondary(createSeededRng('c'), 'cinder-charm', rolls, 0)).toThrow(
      RangeError,
    );
    const epic = rollGear(createSeededRng('c'), 'cinder-charm', 'epic');
    expect(() => rerollSecondary(createSeededRng('c'), 'cinder-charm', epic, 2)).toThrow(
      RangeError,
    );
    expect(() => rerollSecondary(createSeededRng('c'), 'cinder-charm', epic, -1)).toThrow(
      RangeError,
    );
  });
});

describe('applyGear', () => {
  it('returns the inputs unchanged without an item', () => {
    const crit = { chanceBp: 500, damageBp: 1000 };
    expect(applyGear(STATS, crit, 'guard', 'tide', null)).toEqual({ stats: STATS, crit });
    expect(applyGear(STATS, undefined, 'guard', 'tide', null)).toEqual({
      stats: STATS,
      crit: undefined,
    });
  });

  it('adds the primary as a percentage of the stat, level steps included', () => {
    const rolls: GearRolls = { primary: 400, secondary: [] };
    const base = applyGear(
      STATS,
      undefined,
      'payoff',
      'ember',
      item('cinder-charm', 'common', 0, rolls),
    );
    expect(base.stats).toEqual({ hp: 200, atk: 52, spd: 40 }); // +4% of 50
    const upgraded = applyGear(
      STATS,
      undefined,
      'payoff',
      'ember',
      item('cinder-charm', 'common', 5, rolls),
    );
    expect(upgraded.stats.atk).toBe(
      Math.floor((50 * (10_000 + 400 + 5 * RULES.gear.upgradeStepBp.atk)) / 10_000),
    );
    expect(base.crit).toBeUndefined();
  });

  it('adds crit chance and damage to the species bonus', () => {
    const rolls: GearRolls = { primary: 150, secondary: [{ stat: 'critDamage', bp: 300 }] };
    const out = applyGear(
      STATS,
      { chanceBp: 200, damageBp: 500 },
      'setter',
      'spark',
      item('fortune-charm', 'rare', 0, rolls),
    );
    expect(out.crit).toEqual({ chanceBp: 350, damageBp: 800 });
    expect(out.stats).toEqual(STATS);
  });

  it('applies an enchant only to a matching wearer', () => {
    const rolls: GearRolls = { primary: 300, secondary: [] };
    const it1 = item('trail-charm', 'common', 0, rolls, 'payoffs-edge');
    const payoff = applyGear(STATS, undefined, 'payoff', 'tide', it1);
    const guard = applyGear(STATS, undefined, 'guard', 'tide', it1);
    expect(payoff.stats.atk).toBe(Math.floor((50 * (10_000 + 300 + 600)) / 10_000));
    expect(guard.stats.atk).toBe(Math.floor((50 * (10_000 + 300)) / 10_000));
    const luck = item('trail-charm', 'common', 0, rolls, 'spark-luck');
    expect(applyGear(STATS, undefined, 'payoff', 'spark', luck).crit?.chanceBp).toBe(300);
    expect(applyGear(STATS, undefined, 'payoff', 'tide', luck).crit).toBeUndefined();
    const steady = item('trail-charm', 'common', 0, rolls, 'steady-hand');
    for (const role of ROLES) {
      expect(applyGear(STATS, undefined, role, 'tide', steady).stats.atk).toBe(
        Math.floor((50 * (10_000 + 300 + 300)) / 10_000),
      );
    }
  });

  it('ignores an enchant id that is not in the content', () => {
    const rolls: GearRolls = { primary: 300, secondary: [] };
    const out = applyGear(
      STATS,
      undefined,
      'payoff',
      'ember',
      item('cinder-charm', 'common', 0, rolls, 'gone'),
    );
    expect(out.stats.atk).toBe(Math.floor((50 * 10_300) / 10_000));
  });

  it('keeps every combination within the caps and never lowers a stat', () => {
    const luck = RULES.combat.luck;
    const room = {
      chance: luck.critMaxChanceBp - luck.critChanceBp,
      damage: luck.critMaxBp - luck.critBp,
    };
    const speciesCrits = [undefined, { chanceBp: 1_000, damageBp: 5_000 }];
    const problems: string[] = [];
    let combos = 0;
    let capped = 0;
    const scale = (value: number, stat: GearStat) =>
      Math.floor((value * (10_000 + RULES.gear.caps[stat])) / 10_000);
    for (const base of gearContent.bases) {
      for (const rarity of raritiesOf(base.id)) {
        for (const rolls of [maxRolls(base.id, rarity), rollGear(fixedRng(0), base.id, rarity)]) {
          for (let level = 0; level <= RULES.gear.maxLevel; level++) {
            for (const enchantId of [null, ...gearContent.enchants.map((e) => e.id)]) {
              for (const role of ROLES) {
                for (const element of ELEMENTS) {
                  const gear = item(base.id, rarity, level, rolls, enchantId);
                  const where = `${base.id} ${rarity} +${String(level)} ${String(enchantId)} ${role} ${element}`;
                  const bonus = gearBonus(gear, role, element);
                  const limited = cappedBonus(bonus);
                  for (const stat of GEAR_STATS) {
                    if (limited[stat] > RULES.gear.caps[stat] || limited[stat] > bonus[stat]) {
                      problems.push(`${where}: ${stat} not capped`);
                    }
                    if (bonus[stat] > RULES.gear.caps[stat]) capped++;
                  }
                  for (const species of speciesCrits) {
                    const out = applyGear(STATS, species, role, element, gear);
                    const s = out.stats;
                    if (s.atk > scale(STATS.atk, 'atk') || s.atk < STATS.atk)
                      problems.push(`${where}: atk`);
                    if (s.hp > scale(STATS.hp, 'hp') || s.hp < STATS.hp)
                      problems.push(`${where}: hp`);
                    if (s.spd > scale(STATS.spd, 'spd') || s.spd < STATS.spd)
                      problems.push(`${where}: spd`);
                    if (![s.atk, s.hp, s.spd].every(Number.isInteger))
                      problems.push(`${where}: integer`);
                    const own = species ?? { chanceBp: 0, damageBp: 0 };
                    const crit = out.crit ?? { chanceBp: 0, damageBp: 0 };
                    // Gear adds at most its caps, and never takes the creature past the engine's room
                    // (a species that is past it already keeps what it has).
                    if (crit.chanceBp - own.chanceBp > RULES.gear.caps.critChance)
                      problems.push(`${where}: chance`);
                    if (crit.damageBp - own.damageBp > RULES.gear.caps.critDamage)
                      problems.push(`${where}: damage`);
                    if (crit.chanceBp > Math.max(own.chanceBp, room.chance))
                      problems.push(`${where}: room`);
                    if (crit.damageBp > Math.max(own.damageBp, room.damage))
                      problems.push(`${where}: room`);
                    if (crit.chanceBp < own.chanceBp || crit.damageBp < own.damageBp)
                      problems.push(`${where}: lowered`);
                    combos++;
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(problems.slice(0, 5)).toEqual([]);
    expect(combos).toBeGreaterThan(10_000);
    // The caps are not decoration: some maxed combination goes over and gets cut.
    expect(capped).toBeGreaterThan(0);
  });

  it('cuts the bonus at the cap, and lets the species bonus stand if it is already past the engine caps', () => {
    const rolls: GearRolls = {
      primary: 900,
      secondary: [
        { stat: 'spd', bp: 400 },
        { stat: 'critChance', bp: 700 },
      ],
    };
    const gear = item('keen-trinket', 'epic', 5, rolls, 'ember-fury');
    const out = applyGear(STATS, undefined, 'payoff', 'ember', gear);
    expect(out.crit?.chanceBp).toBe(RULES.gear.caps.critChance);
    expect(out.crit?.damageBp).toBe(RULES.gear.caps.critDamage);
    // A species whose own bonus already fills the engine's room gets nothing more, and keeps its own.
    const room = RULES.combat.luck.critMaxChanceBp - RULES.combat.luck.critChanceBp;
    const high = applyGear(STATS, { chanceBp: room + 100, damageBp: 0 }, 'payoff', 'ember', gear);
    expect(high.crit?.chanceBp).toBe(room + 100);
    const nearly = applyGear(STATS, { chanceBp: room - 100, damageBp: 0 }, 'payoff', 'ember', gear);
    expect(nearly.crit?.chanceBp).toBe(room);
  });

  it('gives a stronger creature a stronger result (monotonic in the stat)', () => {
    const rolls = maxRolls('cinder-charm', 'epic');
    const gear = item('cinder-charm', 'epic', 3, rolls);
    let previous = 0;
    for (let atk = 1; atk < 200; atk++) {
      const out = applyGear({ ...STATS, atk }, undefined, 'payoff', 'ember', gear).stats.atk;
      expect(out).toBeGreaterThanOrEqual(previous);
      previous = out;
    }
  });
});

describe('costs and yields', () => {
  it('upgrade prices rise per level and rarity, and stop at the top', () => {
    for (const rarity of GEAR_RARITIES) {
      let essence = 0;
      let scrap = 0;
      for (let level = 0; level < RULES.gear.maxLevel; level++) {
        const cost = upgradeCost({ rarity, level });
        expect(cost).not.toBeNull();
        expect(cost?.essence).toBeGreaterThan(essence);
        expect(cost?.scrap).toBeGreaterThanOrEqual(scrap);
        essence = cost?.essence ?? 0;
        scrap = cost?.scrap ?? 0;
      }
      expect(upgradeCost({ rarity, level: RULES.gear.maxLevel })).toBeNull();
    }
    expect(upgradeCost({ rarity: 'common', level: 0 })).toEqual({ essence: 20, scrap: 2 });
    expect(upgradeCost({ rarity: 'epic', level: 0 })).toEqual({ essence: 40, scrap: 4 });
    expect(upgradeCost({ rarity: 'rare', level: 4 })).toEqual({ essence: 135, scrap: 18 });
    expect(() => upgradeCost({ rarity: 'common', level: -1 })).toThrow(RangeError);
  });

  it('dismantling returns scrap, half the upgrade scrap, a shard of the tint and glimmer', () => {
    expect(dismantleYield({ baseId: 'trail-charm', rarity: 'common', level: 0 })).toEqual({
      scrap: 2,
    });
    expect(dismantleYield({ baseId: 'cinder-charm', rarity: 'rare', level: 0 })).toEqual({
      scrap: 5,
      'ember-shard': 1,
    });
    expect(dismantleYield({ baseId: 'storm-trinket', rarity: 'epic', level: 0 })).toEqual({
      scrap: 10,
      'spark-shard': 2,
      glimmer: 1,
    });
    // A neutral epic-like item has no shard; level 5 returns half the scrap its upgrades cost.
    let spent = 0;
    for (let level = 0; level < 5; level++)
      spent += upgradeCost({ rarity: 'common', level })?.scrap ?? 0;
    expect(dismantleYield({ baseId: 'trail-charm', rarity: 'common', level: 5 }).scrap).toBe(
      2 + Math.floor(spent / 2),
    );
    expect(() => dismantleYield({ baseId: 'nope', rarity: 'common', level: 0 })).toThrow(
      RangeError,
    );
  });

  it('never returns a negative or non-integer part, and only known kinds', () => {
    for (const base of gearContent.bases) {
      for (const rarity of raritiesOf(base.id)) {
        for (let level = 0; level <= RULES.gear.maxLevel; level++) {
          const yielded = dismantleYield({ baseId: base.id, rarity, level });
          for (const [kind, amount] of Object.entries(yielded)) {
            expect(PART_KINDS as readonly string[]).toContain(kind);
            expect(Number.isInteger(amount)).toBe(true);
            expect(amount).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('crafting costs follow the blueprint rarity, with a shard of the base tint only for tinted bases', () => {
    expect(craftCost('trail-charm')).toEqual({ scrap: 6 });
    expect(craftCost('fortune-charm')).toEqual({ scrap: 12 }); // neutral rare: no shard
    expect(craftCost('wave-band')).toEqual({ scrap: 12, 'tide-shard': 1 });
    expect(craftCost('pearl-trinket')).toEqual({ scrap: 24, 'tide-shard': 2, glimmer: 1 });
    expect(craftCost('lantern-charm')).toEqual({ scrap: 24, 'tide-shard': 2, glimmer: 2 });
    expect(() => craftCost('nope')).toThrow(RangeError);
  });

  it('improve is scrap only and needs a secondary; enchant costs glimmer and shards of its element', () => {
    expect(improveCost('common')).toBeNull();
    expect(improveCost('rare')).toEqual({ scrap: 6 });
    expect(improveCost('epic')).toEqual({ scrap: 12 });
    expect(improveCost('festival')).toEqual({ scrap: 12 });
    expect(enchantCost('ember-fury')).toEqual({ glimmer: 1, 'ember-shard': 3 });
    expect(enchantCost('no-such')).toBeNull();
    for (const e of gearContent.enchants) {
      expect(enchantCost(e.id)?.[shardOf(e.shard)]).toBe(RULES.gear.enchant.shard);
    }
  });

  it('adds part bundles', () => {
    expect(addParts({ scrap: 2 }, { scrap: 3, glimmer: 1 })).toEqual({ scrap: 5, glimmer: 1 });
  });
});

describe('jobs and the crafting skill', () => {
  it('uses the starting durations: craft 4 / 8 / 12 h by rarity, improve 2 h, enchant 6 h', () => {
    const H = 3_600_000;
    expect(jobDuration('craft', 'common', 1)).toBe(4 * H);
    expect(jobDuration('craft', 'rare', 1)).toBe(8 * H);
    expect(jobDuration('craft', 'epic', 1)).toBe(12 * H);
    expect(jobDuration('craft', 'festival', 1)).toBe(12 * H);
    expect(jobDuration('improve', 'epic', 1)).toBe(2 * H);
    expect(jobDuration('enchant', 'rare', 1)).toBe(6 * H);
  });

  it('shortens a job by 3% for every skill level above 1', () => {
    const H = 3_600_000;
    expect(jobDuration('craft', 'epic', 2)).toBe(Math.floor(12 * H * 0.97));
    expect(jobDuration('craft', 'epic', 5)).toBe(Math.floor(12 * H * 0.88));
    expect(jobDuration('craft', 'epic', MAX_SKILL_LEVEL)).toBe(Math.floor(12 * H * 0.73));
    // Levels outside the range are clamped.
    expect(jobDuration('craft', 'epic', 0)).toBe(12 * H);
    expect(jobDuration('craft', 'epic', 99)).toBe(jobDuration('craft', 'epic', MAX_SKILL_LEVEL));
    for (let level = 1; level < MAX_SKILL_LEVEL; level++) {
      expect(jobDuration('craft', 'rare', level + 1)).toBeLessThan(
        jobDuration('craft', 'rare', level),
      );
    }
  });

  it('gives XP of 10 per nominal hour, whatever the skill', () => {
    expect(jobXp('craft', 'common')).toBe(40);
    expect(jobXp('craft', 'epic')).toBe(120);
    expect(jobXp('improve', 'rare')).toBe(20);
    expect(jobXp('enchant', 'epic')).toBe(60);
    expect(jobHours('enchant', 'epic')).toBe(6);
  });

  it('maps XP to levels 1 to 10 on a slow curve', () => {
    expect(skillLevel(0)).toBe(1);
    expect(skillLevel(79)).toBe(1);
    expect(skillLevel(80)).toBe(2);
    expect(skillLevel(599)).toBe(4);
    expect(skillLevel(600)).toBe(5);
    expect(skillLevel(3_499)).toBe(9);
    expect(skillLevel(3_500)).toBe(10);
    expect(skillLevel(10_000_000)).toBe(10);
    expect(skillLevel(-5)).toBe(1);
    expect(skillLevel(Number.NaN)).toBe(1);
  });

  it('a daily crafter reaches level 5 in about a month', () => {
    // Scrap limits the work: a week of two 8 h crafts and two 2 h improves is 200 XP, 800 in a month.
    const week = 2 * jobXp('craft', 'rare') + 2 * jobXp('improve', 'rare');
    expect(skillLevel(4 * week)).toBeGreaterThanOrEqual(5);
    expect(skillLevel(4 * week)).toBeLessThanOrEqual(6);
    // A casual player (one rare craft a week) is around level 3 after the same month.
    expect(skillLevel(4 * jobXp('craft', 'rare'))).toBeLessThanOrEqual(4);
  });

  it('craftRarity: the blueprint rarity at level 1, one higher with 1% per level above 1', () => {
    const rng = createSeededRng('craft');
    for (let i = 0; i < 200; i++) expect(craftRarity(rng, 'common', 1)).toBe('common');
    let up = 0;
    const n = 20_000;
    for (let i = 0; i < n; i++) if (craftRarity(rng, 'common', 10) === 'rare') up++;
    // Level 10: 9% (the seed is fixed, the band is generous).
    expect(up / n).toBeGreaterThan(0.075);
    expect(up / n).toBeLessThan(0.105);
    // Epic and festival do not go higher; rare goes to epic.
    expect(craftRarity(fixedRng(0), 'epic', 10)).toBe('epic');
    expect(craftRarity(fixedRng(0), 'festival', 10)).toBe('festival');
    expect(craftRarity(fixedRng(0), 'rare', 10)).toBe('epic');
    expect(craftRarity(fixedRng(HIGH), 'rare', 10)).toBe('rare');
  });

  it('craftRarity always draws once, so scripted draws stay in step', () => {
    let draws = 0;
    const counting: Rng = { nextU32: () => (draws++, HIGH) };
    craftRarity(counting, 'epic', 1);
    craftRarity(counting, 'common', 7);
    expect(draws).toBe(2);
  });
});

describe('drops', () => {
  it('finale odds start at 75 / 22 / 3 at rank 1, always sum to 100% and only get better with rank', () => {
    expect(finaleDropOddsBp(1)).toEqual({ common: 7_500, rare: 2_200, epic: 300 });
    let last = finaleDropOddsBp(1);
    for (let rank = 2; rank <= 40; rank++) {
      const odds = finaleDropOddsBp(rank);
      expect(odds.common + odds.rare + odds.epic).toBe(10_000);
      expect(odds.common).toBeLessThanOrEqual(last.common);
      expect(odds.epic).toBeGreaterThanOrEqual(last.epic);
      expect(odds.rare).toBeGreaterThanOrEqual(last.rare);
      expect(odds.epic).toBeLessThanOrEqual(RULES.gear.drops.finale.maxBp.epic);
      last = odds;
    }
    expect(finaleDropOddsBp(0)).toEqual(finaleDropOddsBp(1));
  });

  it('rolls the rarity of finale drops at the stated odds, and never a Festival base', () => {
    const rng = createSeededRng('finale-odds');
    const counts = { common: 0, rare: 0, epic: 0 } as Record<string, number>;
    const n = 20_000;
    for (let i = 0; i < n; i++) {
      const drop = rollFinaleDrop(rng, 1);
      counts[drop.rarity] = (counts[drop.rarity] ?? 0) + 1;
      expect(gearBase(drop.baseId)?.blueprint).not.toBe('festival');
    }
    expect((counts['common'] ?? 0) / n).toBeGreaterThan(0.73);
    expect((counts['common'] ?? 0) / n).toBeLessThan(0.77);
    expect((counts['rare'] ?? 0) / n).toBeGreaterThan(0.2);
    expect((counts['rare'] ?? 0) / n).toBeLessThan(0.24);
    expect((counts['epic'] ?? 0) / n).toBeGreaterThan(0.02);
    expect((counts['epic'] ?? 0) / n).toBeLessThan(0.04);
  });

  it('rolls a Festival piece of the creature element, in the Festival rarity', () => {
    const rng = createSeededRng('fest');
    const tide = rollFestivalDrop(rng, 'tide');
    expect(tide.baseId).toBe('lantern-charm');
    expect(tide.rarity).toBe('festival');
    expect(tide.rolls.secondary).toHaveLength(2);
    expect(rollFestivalDrop(rng, 'ember').baseId).toBe('hearth-band');
    // An element with no Festival base of its own still gets a Festival piece.
    expect(gearBase(rollFestivalDrop(rng, 'grove').baseId)?.blueprint).toBe('festival');
  });

  it('rolls blueprints of droppable bases only, by rarity odds', () => {
    const rng = createSeededRng('bp');
    const seen = new Set<string>();
    for (let i = 0; i < 2_000; i++) seen.add(rollBlueprint(rng));
    for (const id of seen) expect(gearBase(id)?.blueprint).not.toBe('festival');
    expect(seen.size).toBe(droppableBases().length);
  });

  it('expedition loot: scrap by duration, a share of it when recalled, extras only on a completed trip', () => {
    const rng = createSeededRng('exp');
    const done = (duration: 'short' | 'medium' | 'long', rolls: number) =>
      expeditionLoot(rng, duration, 'tide', { completed: true, caught: rolls, rolls });
    expect(done('short', 1).parts.scrap).toBe(1);
    expect(done('medium', 2).parts.scrap).toBe(3);
    expect(done('long', 3).parts.scrap).toBe(6);
    // Recalled: floor(scrap x caught / rolls), and no extras, and no draws.
    let draws = 0;
    const counting: Rng = { nextU32: () => (draws++, 0) };
    const recalled = expeditionLoot(counting, 'long', 'tide', {
      completed: false,
      caught: 1,
      rolls: 3,
    });
    expect(recalled).toEqual({ parts: { scrap: 2 }, blueprint: null });
    expect(
      expeditionLoot(counting, 'long', 'tide', { completed: false, caught: 0, rolls: 3 }),
    ).toEqual({
      parts: {},
      blueprint: null,
    });
    expect(draws).toBe(0);
  });

  it('expedition loot: shard of the explorer element, glimmer and blueprint at their odds', () => {
    // Every draw 0 hits every chance.
    const best = expeditionLoot(fixedRng(0), 'long', 'grove', {
      completed: true,
      caught: 3,
      rolls: 3,
    });
    expect(best.parts).toEqual({ scrap: 6, 'grove-shard': 1, glimmer: 1 });
    expect(best.blueprint).not.toBeNull();
    // Every draw at the top hits none, and a short trip never has a blueprint or glimmer.
    const worst = expeditionLoot(fixedRng(HIGH), 'long', 'grove', {
      completed: true,
      caught: 3,
      rolls: 3,
    });
    expect(worst).toEqual({ parts: { scrap: 6 }, blueprint: null });
    const short = expeditionLoot(fixedRng(0), 'short', 'spark', {
      completed: true,
      caught: 1,
      rolls: 1,
    });
    expect(short.parts).toEqual({ scrap: 1, 'spark-shard': 1 });
    expect(short.blueprint).toBeNull();
  });

  it('expedition loot is deterministic for a seed', () => {
    const run = () =>
      Array.from({ length: 50 }, () => 0).map(
        (
          (rng) => () =>
            expeditionLoot(rng, 'long', 'ember', { completed: true, caught: 3, rolls: 3 })
        )(createSeededRng('same')),
      );
    expect(run()).toEqual(run());
  });

  it('the welcome kit is a common item, a common blueprint and enough scrap to craft', () => {
    for (let i = 0; i < 50; i++) {
      const kit = rollWelcomeKit(createSeededRng(`kit-${String(i)}`));
      expect(kit.item.rarity).toBe('common');
      expect(gearBase(kit.item.baseId)?.blueprint).toBe('common');
      expect(gearBase(kit.blueprint)?.blueprint).toBe('common');
      expect(kit.item.rolls.secondary).toHaveLength(0);
      // The welcome scrap pays for any common craft, so crafting can start on day 1.
      expect(craftCost(kit.blueprint)).toEqual({ scrap: RULES.gear.craft.common.scrap });
      expect(RULES.gear.drops.welcomeScrap).toBeGreaterThanOrEqual(RULES.gear.craft.common.scrap);
    }
  });
});

describe('numbers that keep the design honest', () => {
  it('a maxed epic item stays within the 15 to 25% power share', () => {
    // Power = atk + hp / 10 (creaturePower). Take a mid stage-1 creature and the best item for each stat.
    const stats: Stats = { hp: 160, atk: 40, spd: 30 };
    const power = (s: Stats) => s.atk + Math.floor(s.hp / 10);
    let best = 0;
    for (const base of gearContent.bases) {
      for (const enchantId of [null, ...gearContent.enchants.map((e) => e.id)]) {
        const gear = item(
          base.id,
          raritiesOf(base.id).at(-1) ?? 'epic',
          5,
          maxRolls(base.id, raritiesOf(base.id).at(-1) ?? 'epic'),
          enchantId,
        );
        for (const role of ROLES) {
          for (const element of ELEMENTS) {
            const out = applyGear(stats, undefined, role, element, gear).stats;
            best = Math.max(best, power(out) / power(stats));
          }
        }
      }
    }
    expect(best).toBeGreaterThan(1.1);
    expect(best).toBeLessThanOrEqual(1.25);
  });

  it('every enchant and base referenced by the rules exists', () => {
    for (const e of gearContent.enchants) expect(enchantDef(e.id)).toBe(e);
    for (const b of gearContent.bases) expect(gearBase(b.id)).toBe(b);
  });
});
