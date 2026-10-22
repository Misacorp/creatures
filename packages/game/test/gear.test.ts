import { describe, expect, it } from 'vitest';
import {
  content,
  craftScrapCost,
  ELEMENTS,
  GEAR_SLOTS,
  MAX_SKILL_LEVEL,
  PART_KINDS,
  RULES,
  addParts,
  baseFor,
  blueprintBases,
  convertedItemLevel,
  craftCost,
  craftItemLevel,
  anyShards,
  craftCostFor,
  craftHours,
  craftOdds,
  craftRarity,
  dismantleBundleError,
  dismantleHours,
  dismantleLearnBp,
  dismantleRange,
  dismantleXp,
  reachMinLevel,
  rollCraftItem,
  rollCraftRarity,
  rollDismantle,
  stepUpBp,
  createSeededRng,
  dismantleYield,
  dropBase,
  dungeonItemLevel,
  expeditionItemLevel,
  expeditionLoot,
  finaleDropOddsBp,
  finaleItemLevel,
  formatBp,
  gearBase,
  gearContent,
  gearLine,
  itemLines,
  itemOf,
  itemScore,
  itemStat,
  itemStats,
  statText,
  basesFor,
  eligibleBases,
  bestBaseForTint,
  craftLevelNeeded,
  BASE_STAT_KINDS,
  rollConvertedRarity,
  rollFinaleRarity,
  jobDuration,
  jobHours,
  jobXp,
  legacyDismantleYield,
  legacyUpgradeSpent,
  linePool,
  loadGear,
  nextSkillXp,
  planEquipBest,
  rollBlueprint,
  rollCraft,
  rollDungeonItem,
  rollExpeditionItem,
  rollFestivalItem,
  festivalBaseFor,
  festivalBases,
  rollFinaleItem,
  rollFinaleReward,
  rollItem,
  rollLines,
  rollTier,
  rollWelcomeKit,
  skillLevel,
  tierCap,
  wearBlock,
  wornEffects,
  applyGear,
  type BestCreature,
  type GearItem,
  type GearRarity,
  type GearSlot,
  type Rng,
  type Role,
  type Stats,
} from '../src/index';
import basesJson from '../src/content/data/gear.json';
import legacyJson from '../src/content/data/gear-legacy.json';
import linesJson from '../src/content/data/gear-lines.json';
import setsJson from '../src/content/data/gear-sets.json';
import reactionsJson from '../src/content/data/reactions.json';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const STATS: Stats = { hp: 200, atk: 50, spd: 40 };
const ROLES: readonly Role[] = ['setter', 'payoff', 'support', 'guard'];

/** An rng that always returns the same value: 0 picks the first of everything. */
const fixedRng = (value: number): Rng => ({ nextU32: () => value });
/** Stays below 2^32 minus the rejection limit of `int`, or the unbiased sampler would loop. */
const HIGH = 4_294_959_999;

function item(
  baseId: string,
  rarity: GearRarity,
  itemLevel: number,
  lines: [string, number][] = [],
): GearItem {
  return itemOf(
    baseId,
    rarity,
    itemLevel,
    lines.map(([id, tier]) => ({ id, tier })),
  );
}

function reactionRefs() {
  return reactionsJson as {
    name: string;
    triggerElement: 'tide' | 'ember' | 'grove' | 'spark' | 'mire';
  }[];
}

describe('the gear content', () => {
  it('has three slots with a base for neutral and every element, a Festival piece and the special Charms', () => {
    for (const slot of GEAR_SLOTS) {
      for (const tag of ['neutral', ...ELEMENTS] as const) {
        expect(baseFor(slot, tag), `${slot} ${tag}`).toBeDefined();
      }
    }
    expect(gearContent.bases.filter((b) => b.festival === true).length).toBeGreaterThanOrEqual(2);
    for (const role of ROLES) expect(baseFor('charm', role)?.slot).toBe('charm');
    expect(gearContent.bases.some((b) => b.tag === 'explorer')).toBe(true);
    // 6 tags x 3 makes of Hats and of Scarves, the Festival pieces, 12 Charms, and the nine plain gear
    // sets (a Hat, a Scarf and a Charm each; Lantern Night is made of the three Festival pieces).
    expect(gearContent.bases.filter((b) => b.slot === 'hat')).toHaveLength(28);
    expect(gearContent.bases.filter((b) => b.slot === 'scarf')).toHaveLength(28);
    expect(gearContent.bases.filter((b) => b.slot === 'charm')).toHaveLength(21);
    expect(gearContent.bases).toHaveLength(77);
  });

  it('expands the element lines into 16 lines and keeps every line weighted somewhere (but the fixed-only ones)', () => {
    for (const family of ['attunement', 'hunter', 'reaction', 'ward']) {
      for (const element of ELEMENTS) expect(gearLine(`${element}-${family}`)).toBeDefined();
    }
    expect(gearLine('wildfire-bonus')).toBeUndefined();
    expect(gearLine('ember-reaction')?.name).toBe('Wildfire bonus');
    expect(gearLine('tide-hunter')?.name).toBe('Tide Hunter');
    for (const line of gearContent.lines) {
      const w = line.weights;
      if (line.fixedOnly) expect(w.hat + w.scarf + w.charm).toBe(0);
      else expect(w.hat + w.scarf + w.charm).toBeGreaterThan(0);
      for (let i = 1; i < 5; i++) {
        expect(line.values[i] as number).toBeGreaterThanOrEqual(line.values[i - 1] as number);
      }
    }
  });

  it('marks the slot-exclusive lines of the spec', () => {
    const only = (id: string, slot: GearSlot) => {
      const w = gearLine(id)?.weights;
      for (const s of GEAR_SLOTS) {
        if (s === slot) expect(w?.[s]).toBeGreaterThan(0);
        else expect(w?.[s]).toBe(0);
      }
    };
    for (const id of ['crit-damage', 'first-pounce']) only(id, 'hat');
    for (const id of ['all-damage-taken', 'unbothered', 'brace', 'between-room-rest']) {
      only(id, 'scarf');
    }
    for (const id of [
      'cover',
      'boost',
      'spark-share',
      'lingering',
      'adaptation-pierce',
      'quick-feet',
      'lucky-find',
      'packer',
      'apprentice',
    ]) {
      only(id, 'charm');
    }
  });

  it('does not have the dropped lines', () => {
    expect(gearLine('tinkers-eye')).toBeUndefined();
    expect(gearLine('growing')).toBeUndefined();
  });

  it('rejects unknown keys, duplicate ids and bad cross references', () => {
    const reactions = reactionRefs();
    const cases: [string, (b: Record<string, unknown>[], l: Record<string, unknown>[]) => void][] =
      [
        ['an unknown key on a base', (b) => ((b[0] as Record<string, unknown>)['extra'] = 1)],
        ['an unknown key on a line', (_, l) => ((l[0] as Record<string, unknown>)['extra'] = 1)],
        [
          'an id that is not kebab-case',
          (b) => ((b[0] as Record<string, unknown>)['id'] = 'Bad Id'),
        ],
        [
          'a duplicate base id',
          (b) => ((b[1] as Record<string, unknown>)['id'] = (b[0] as { id: string }).id),
        ],
        [
          'a duplicate line id',
          (_, l) => ((l[1] as Record<string, unknown>)['id'] = (l[0] as { id: string }).id),
        ],
        ['an unknown slot', (b) => ((b[0] as Record<string, unknown>)['slot'] = 'boots')],
        ['an unknown tag', (b) => ((b[0] as Record<string, unknown>)['tag'] = 'void')],
        [
          'a base line that does not exist',
          (b) => {
            const charm = b.find((x) => x['slot'] === 'charm') as { implicit: { line: string } };
            charm.implicit.line = 'nope';
          },
        ],
        [
          'a Hat without base stats',
          (b) => delete (b.find((x) => x['slot'] === 'hat') as Record<string, unknown>)['stats'],
        ],
        [
          'a Hat with only one base stat',
          (b) => {
            const hat = b.find((x) => x['slot'] === 'hat') as { stats: unknown[] };
            hat.stats.pop();
          },
        ],
        [
          'a Scarf that lists Attack before HP',
          (b) => {
            const scarf = b.find((x) => x['slot'] === 'scarf') as { stats: unknown[] };
            scarf.stats.reverse();
          },
        ],
        [
          'a base stat listed twice',
          (b) => {
            const hat = b.find((x) => x['slot'] === 'hat') as { stats: { stat: string }[] };
            hat.stats.push({ stat: 'atk' });
          },
        ],
        [
          'a base stat of a kind that does not exist',
          (b) => {
            const hat = b.find((x) => x['slot'] === 'hat') as { stats: { stat: string }[] };
            hat.stats.push({ stat: 'armor' });
          },
        ],
        [
          'a base stat nothing can change',
          (_, l) => {
            for (let i = l.length - 1; i >= 0; i--) {
              const effect = (l[i] as { effect: { kind: string; stat?: string } }).effect;
              if (effect.kind === 'local' && effect.stat === 'critDamage') l.splice(i, 1);
            }
          },
        ],
        [
          'two bases of one slot and tag at the same item level',
          (b) => {
            const second = b.filter((x) => x['slot'] === 'hat' && x['tag'] === 'neutral')[1] as {
              minItemLevel: number;
            };
            second.minItemLevel = 1;
          },
        ],
        [
          'an element tag with no base from item level 1',
          (b) => {
            for (const x of b) {
              if (x['slot'] === 'hat' && x['tag'] === 'tide' && x['minItemLevel'] === undefined) {
                x['minItemLevel'] = 3;
              }
            }
          },
        ],
        [
          'a Festival piece that needs a high item level',
          (b) =>
            ((b.find((x) => x['festival'] === true) as Record<string, unknown>)['minItemLevel'] =
              5),
        ],
        [
          'a Charm with a minimum item level',
          (b) =>
            ((b.find((x) => x['slot'] === 'charm') as Record<string, unknown>)['minItemLevel'] = 8),
        ],
        [
          'a Hat with an implicit line as well',
          (b) => {
            const hat = b.find((x) => x['slot'] === 'hat') as Record<string, unknown>;
            hat['implicit'] = { line: 'attack', values: [100, 100, 100, 100, 100] };
          },
        ],
        [
          'a Charm with a base stat',
          (b) => {
            const charm = b.find((x) => x['slot'] === 'charm') as Record<string, unknown>;
            charm['stats'] = [
              { stat: 'atk', value: 1 },
              { stat: 'hp', value: 1 },
            ];
          },
        ],
        [
          'a base stat that is not whole',
          (b) => {
            const hat = b.find((x) => x['slot'] === 'hat') as { stats: { value: number }[] };
            (hat.stats[0] as { value: number }).value = 1.5;
          },
        ],
        [
          'a Festival piece with no narrow pool',
          (b) => delete (b.find((x) => x['festival'] === true) as Record<string, unknown>)['pool'],
        ],
        [
          'a pool that names a line that cannot roll in the slot',
          (b) => {
            const piece = b.find((x) => x['festival'] === true) as { pool: string[] };
            piece.pool = ['crit-damage', 'boost', 'hp-local-pct'];
          },
        ],
        [
          'a local line that rolls on a Charm',
          (_, l) => {
            const line = l.find((x) => x['id'] === 'attack-local-pct') as {
              weights: { charm: number };
            };
            line.weights.charm = 10;
          },
        ],
        [
          'a fixed line that can also roll',
          (b) => {
            const piece = b.find((x) => x['festival'] === true) as { fixed: { line: string } };
            piece.fixed.line = 'area-ward';
          },
        ],
        ['four tier values', (_, l) => (l[0] as { values: number[] }).values.pop()],
        [
          'a line that gets weaker at a higher tier',
          (_, l) => ((l[0] as { values: number[] }).values = [900, 800, 700, 600, 500]),
        ],
        ['a negative value', (_, l) => ((l[0] as { values: number[] }).values[0] = -1)],
        ['a long name', (b) => ((b[0] as Record<string, unknown>)['name'] = 'x'.repeat(33))],
        [
          'a role-locked Hat',
          (b) => {
            (b[0] as Record<string, unknown>)['tag'] = 'guard';
          },
        ],
      ];
    for (const [name, change] of cases) {
      const bases = clone(basesJson) as Record<string, unknown>[];
      const lines = clone(linesJson) as Record<string, unknown>[];
      change(bases, lines);
      expect(() => loadGear(bases, lines, legacyJson, reactions, setsJson), name).toThrow(
        /Invalid gear/,
      );
    }
  });

  it('rejects content without a Festival base, a role Charm or a base for an element', () => {
    const reactions = reactionRefs();
    const bases = clone(basesJson) as { festival?: boolean; tag: string; slot: string }[];
    expect(() =>
      loadGear(
        bases.filter((b) => b.festival !== true),
        linesJson,
        legacyJson,
        reactions,
        setsJson,
      ),
    ).toThrow(/Invalid gear/);
    expect(() =>
      loadGear(
        bases.filter((b) => b.tag !== 'guard'),
        linesJson,
        legacyJson,
        reactions,
        setsJson,
      ),
    ).toThrow(/guard Charm/);
    expect(() =>
      loadGear(
        bases.filter((b) => !(b.slot === 'hat' && b.tag === 'tide')),
        linesJson,
        legacyJson,
        reactions,
        setsJson,
      ),
    ).toThrow(/no tide hat/);
  });

  it('maps every old base to a slot, and Festival ones to the Festival piece', () => {
    expect(gearContent.legacy.bases).toHaveLength(19);
    for (const old of gearContent.legacy.bases) {
      expect(baseFor(old.slot, old.tint ?? 'neutral', old.festival === true)).toBeDefined();
    }
  });
});

describe('tiers', () => {
  it('unlock by item level: I from 1, II from 5, III from 10, IV from 15, V at 20', () => {
    const cap = [1, 4, 5, 9, 10, 14, 15, 19, 20].map(tierCap);
    expect(cap).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4]);
    expect(tierCap(0)).toBe(0);
    expect(tierCap(99)).toBe(4);
  });

  it('rolls counting down from the best tier at 15 / 30 / 30 / 25, and never below that', () => {
    const rng = createSeededRng('tiers');
    const count = (level: number): number[] => {
      const out = [0, 0, 0, 0, 0];
      for (let i = 0; i < 40_000; i++) (out[rollTier(rng, level)] as number)++;
      return out.map((n) => n / 40_000);
    };
    const l20 = count(20);
    expect(l20[0]).toBe(0);
    expect(l20[1]).toBeCloseTo(0.25, 1);
    expect(l20[2]).toBeCloseTo(0.3, 1);
    expect(l20[3]).toBeCloseTo(0.3, 1);
    expect(l20[4]).toBeCloseTo(0.15, 1);
    const l15 = count(17);
    expect(l15[4]).toBe(0);
    expect(l15[3]).toBeCloseTo(0.15, 1);
    expect(l15[0]).toBeCloseTo(0.25, 1);
    const l10 = count(12);
    expect(l10[2]).toBeCloseTo(0.2, 1);
    expect(l10[1]).toBeCloseTo(0.4, 1);
    expect(l10[0]).toBeCloseTo(0.4, 1);
    const l5 = count(7);
    expect(l5[1]).toBeCloseTo(0.33, 1);
    expect(l5[0]).toBeCloseTo(0.67, 1);
    expect(count(3)).toEqual([1, 0, 0, 0, 0]);
  });

  it('rolls at tier II or better when asked (the conversion), even below item level 5', () => {
    const rng = createSeededRng('floor');
    for (let i = 0; i < 300; i++) {
      expect(rollTier(rng, 4, 1)).toBe(1);
      expect([1, 2]).toContain(rollTier(rng, 10, 1));
    }
  });

  it('about 1 line in 7 rolls tier V at item level 20', () => {
    expect(RULES.gear.tierWeights[0]).toBe(15);
    expect(15 / RULES.gear.tierWeights.reduce((a, b) => a + b, 0)).toBeCloseTo(0.15, 5);
  });

  it('always draws once', () => {
    let draws = 0;
    const counting: Rng = { nextU32: () => (draws++, HIGH) };
    rollTier(counting, 1);
    rollTier(counting, 20);
    expect(draws).toBe(2);
  });
});

describe('rolling items', () => {
  it('rolls 1 / 2 / 3 lines by rarity (a Festival piece too), never the same line twice', () => {
    const rng = createSeededRng('lines');
    const expected: Record<GearRarity, number> = { common: 1, rare: 2, epic: 3 };
    for (const rarity of ['common', 'rare', 'epic'] as const) {
      for (let i = 0; i < 200; i++) {
        const base = gearContent.bases.filter((b) => b.festival !== true)[i % 17] as {
          id: string;
        };
        const rolled = rollItem(rng, { baseId: base.id, rarity, itemLevel: 1 + (i % 20) });
        expect(rolled.lines).toHaveLength(expected[rarity]);
        expect(new Set(rolled.lines.map((l) => l.id)).size).toBe(rolled.lines.length);
      }
    }
    for (const festival of gearContent.bases.filter((b) => b.festival === true)) {
      for (const rarity of ['common', 'rare', 'epic'] as const) {
        const rolled = rollItem(rng, { baseId: festival.id, rarity, itemLevel: 18 });
        expect(rolled.lines).toHaveLength(expected[rarity]);
        // Only the lines of the narrow pool, never the unique line (it comes from the base).
        for (const l of rolled.lines) expect(festival.pool).toContain(l.id);
      }
    }
  });

  it('keeps every tier inside what the item level allows and every line inside its slot and rarity', () => {
    const rng = createSeededRng('bounds');
    for (let i = 0; i < 600; i++) {
      const bases = gearContent.bases.filter((b) => b.festival !== true);
      const base = bases[i % bases.length] as { id: string; slot: GearSlot };
      const rarity = (['common', 'rare', 'epic'] as const)[i % 3] as GearRarity;
      const level = 1 + (i % 20);
      const rolled = rollItem(rng, { baseId: base.id, rarity, itemLevel: level });
      for (const l of rolled.lines) {
        const def = gearLine(l.id);
        expect(def).toBeDefined();
        expect(l.tier).toBeLessThanOrEqual(tierCap(level));
        expect(def?.weights[base.slot] ?? 0).toBeGreaterThan(0);
        if (def?.minRarity === 'rare') expect(rarity).not.toBe('common');
        if (def?.minRarity === 'epic') expect(rarity).toBe('epic');
        expect(level).toBeGreaterThanOrEqual(def?.minItemLevel ?? 1);
      }
    }
  });

  it('keeps Lingering and Unbothered to epic items of level 15 and more', () => {
    const ids = (level: number, rarity: GearRarity) =>
      linePool({ slot: 'charm', tag: 'neutral' }, rarity, level).map((p) => p.line.id);
    expect(ids(20, 'epic')).toContain('lingering');
    expect(ids(14, 'epic')).not.toContain('lingering');
    expect(ids(20, 'rare')).not.toContain('lingering');
    expect(linePool({ slot: 'scarf', tag: 'neutral' }, 'epic', 15).map((p) => p.line.id)).toContain(
      'unbothered',
    );
    expect(
      linePool({ slot: 'scarf', tag: 'neutral' }, 'epic', 14).map((p) => p.line.id),
    ).not.toContain('unbothered');
    // Rare-only lines need Rare.
    expect(ids(10, 'common')).not.toContain('lucky-find');
    expect(ids(10, 'rare')).toContain('lucky-find');
    expect(
      linePool({ slot: 'scarf', tag: 'neutral' }, 'common', 10).map((p) => p.line.id),
    ).not.toContain('all-damage-taken');
  });

  it('weights a slot by its pool: Hats lean to Attack, Scarves to HP, and some lines never roll in a slot', () => {
    const weight = (slot: GearSlot, id: string): number =>
      linePool(baseFor(slot, 'neutral') ?? { slot, tag: 'neutral' }, 'epic', 20).find(
        (p) => p.line.id === id,
      )?.weight ?? 0;
    // Both can roll either local line, but each leans to its own stat.
    expect(weight('hat', 'attack-local-pct')).toBeGreaterThan(weight('scarf', 'attack-local-pct'));
    expect(weight('scarf', 'attack-local-pct')).toBeGreaterThan(0);
    expect(weight('scarf', 'hp-local-pct')).toBeGreaterThan(weight('hat', 'hp-local-pct'));
    expect(weight('hat', 'hp-local-pct')).toBeGreaterThan(0);
    expect(weight('hat', 'hp-local-flat')).toBeGreaterThan(0);
    expect(weight('scarf', 'attack-local-flat')).toBeGreaterThan(0);
    // Local lines never roll on a Charm (it has no stats).
    for (const id of ['attack-local-pct', 'attack-local-flat', 'hp-local-pct', 'hp-local-flat']) {
      expect(weight('charm', id)).toBe(0);
    }
    // A crit local line only rolls on a base that has the crit stat.
    const pool = (id: string) =>
      linePool(gearBase(id) as NonNullable<ReturnType<typeof gearBase>>, 'epic', 20).map(
        (p) => p.line.id,
      );
    expect(pool('trail-cap')).not.toContain('crit-chance-local-pct');
    expect(pool('wayfarers-hood')).toContain('crit-chance-local-pct');
    expect(pool('wayfarers-hood')).not.toContain('crit-damage-local-pct');
    expect(pool('emberkeepers-crown')).toContain('crit-damage-local-pct');
    expect(pool('emberkeepers-crown')).not.toContain('crit-chance-local-pct');
    expect(weight('hat', 'crit-damage')).toBeGreaterThan(0);
    expect(weight('scarf', 'crit-damage')).toBe(0);
    expect(weight('charm', 'crit-damage')).toBe(0);
    expect(weight('hat', 'boost')).toBe(0);
  });

  it('an element tag triples its own four lines and nothing else', () => {
    const plain = linePool({ slot: 'hat', tag: 'neutral' }, 'epic', 20);
    const tide = linePool({ slot: 'hat', tag: 'tide' }, 'epic', 20);
    for (const p of plain) {
      const t = tide.find((x) => x.line.id === p.line.id)?.weight;
      expect(t).toBe(p.line.element === 'tide' ? p.weight * 3 : p.weight);
    }
  });

  it('a role-locked Charm triples its role and drops the other roles', () => {
    const plain = linePool({ slot: 'charm', tag: 'neutral' }, 'epic', 20);
    const guard = linePool({ slot: 'charm', tag: 'guard' }, 'epic', 20);
    const ids = guard.map((p) => p.line.id);
    expect(ids).toContain('armor');
    expect(ids).toContain('cover');
    expect(ids).not.toContain('boost');
    expect(ids).not.toContain('marking-hit');
    expect(ids).not.toContain('payoffs-pounce');
    expect(ids).toContain('lingering');
    expect(guard.find((p) => p.line.id === 'armor')?.weight).toBe(
      (plain.find((p) => p.line.id === 'armor')?.weight ?? 0) * 3,
    );
    // Lines with no role stay at their weight.
    expect(guard.find((p) => p.line.id === 'attack')?.weight).toBe(
      plain.find((p) => p.line.id === 'attack')?.weight,
    );
    expect(guard.find((p) => p.line.id === 'attack')?.weight).toBeGreaterThan(0);
  });

  it('the Crossroads Compass multiplies utility lines by 3 and combat lines by 0.3', () => {
    const plain = linePool({ slot: 'charm', tag: 'neutral' }, 'epic', 20);
    const compass = linePool({ slot: 'charm', tag: 'explorer' }, 'epic', 20);
    for (const p of plain) {
      const c = compass.find((x) => x.line.id === p.line.id)?.weight ?? 0;
      if (p.line.group === 'utility') expect(c).toBe(p.weight * 3);
      else expect(c).toBe(Math.max(1, Math.floor(p.weight * 0.3)));
    }
  });

  it('is deterministic for a seed and always draws the same way', () => {
    const a = rollItem(createSeededRng('same'), {
      baseId: 'kelp-cap',
      rarity: 'epic',
      itemLevel: 20,
    });
    const b = rollItem(createSeededRng('same'), {
      baseId: 'kelp-cap',
      rarity: 'epic',
      itemLevel: 20,
    });
    expect(a).toEqual(b);
    expect(a.slot).toBe('hat');
    expect(a.tag).toBe('tide');
  });

  it('refuses unknown bases', () => {
    const rng = createSeededRng('bad');
    expect(() => rollItem(rng, { baseId: 'nope', rarity: 'common', itemLevel: 1 })).toThrow(
      RangeError,
    );
  });

  it('rollLines can draw every line of a slot given enough rolls (the pool is reachable)', () => {
    const rng = createSeededRng('reach');
    const seen = new Set<string>();
    for (let i = 0; i < 4_000; i++) {
      for (const l of rollLines(rng, { slot: 'charm', tag: 'neutral' }, 'epic', 20)) seen.add(l.id);
    }
    for (const p of linePool({ slot: 'charm', tag: 'neutral' }, 'epic', 20)) {
      expect(seen.has(p.line.id), p.line.id).toBe(true);
    }
  });
});

describe('what a card shows', () => {
  it('lists a Charm base line first, then a Festival piece unique line, then the rolled lines with tiers', () => {
    const lines = itemLines(
      item('festival-lantern-charm', 'epic', 18, [
        ['tide-reaction', 3],
        ['tide-attunement', 2],
      ]),
    );
    expect(lines.map((l) => l.source)).toEqual(['base', 'fixed', 'rolled', 'rolled']);
    expect(lines[0]?.text).toBe('Tide Attunement +5%');
    expect(lines[1]?.text).toBe('Lantern luck +1 pt');
    expect(lines[2]?.text).toBe('Steam bonus +18%');
    expect(lines[2]?.tier).toBe(4);
    expect(lines[2]?.bestTier).toBe(4);
    expect(lines[3]?.tier).toBe(3);
  });

  it('a Hat or a Scarf has no base line: its base is the stat, and the local lines say (this item)', () => {
    const cap = item('coal-warm-cap', 'epic', 20, [
      ['ember-reaction', 4],
      ['attack-local-pct', 3],
      ['attack-local-flat', 4],
    ]);
    const lines = itemLines(cap);
    expect(lines.map((l) => l.source)).toEqual(['rolled', 'rolled', 'rolled']);
    expect(lines.map((l) => l.text)).toEqual([
      'Wildfire bonus +24%',
      '+90% Attack (this item)',
      '+12 Attack (this item)',
    ]);
    expect(lines.map((l) => l.local)).toEqual([false, true, true]);
    const scarf = itemLines(item('patch-scarf', 'rare', 12, [['hp-local-pct', 2]]));
    expect(scarf.map((l) => l.text)).toEqual(['+60% HP (this item)']);
  });

  it('writes reductions with a minus and once-only lines without a number or tier', () => {
    const scarf = item('seafoam-scarf', 'epic', 15, [
      ['unbothered', 0],
      ['area-ward', 3],
      ['brace', 2],
    ]);
    const lines = itemLines(scarf);
    expect(lines.map((l) => l.text)).toEqual(['Unbothered', 'Area ward −9%', 'Brace −14%']);
    expect(lines[0]?.tier).toBeNull();
    expect(lines[1]?.bestTier).toBe(4);
  });

  it('formats basis points without trailing zeros', () => {
    expect(formatBp(150)).toBe('1.5');
    expect(formatBp(300)).toBe('3');
    expect(formatBp(50)).toBe('0.5');
    expect(formatBp(5)).toBe('0.05');
  });

  it('has the spec Charm base values per item level band', () => {
    const at = (id: string, level: number) => itemLines(item(id, 'common', level))[0]?.text;
    expect(at('trail-charm', 10)).toBe('Creature Attack +2%');
    expect(at('crossroads-compass', 20)).toBe('Trail XP +8%');
    expect(at('wardens-bell', 20)).toBe('Armor +4 pt');
    expect(at('hearth-bell', 15)).toBe('Boost +3 pt');
    expect(at('footprint-charm', 10)).toBe('Marking hit +6%');
    expect(at('pounce-charm', 20)).toBe("Payoff's pounce +5%");
  });
});

describe('the item stats', () => {
  const stats = (id: string, lines: [string, number][] = [], level = 20) =>
    itemStats(item(id, 'epic', level, lines));

  it('are fixed per base: the same on every item of the base, whatever its level', () => {
    expect(stats('trail-cap', [], 1)).toEqual(stats('trail-cap', [], 20));
    expect(stats('trail-cap').map((s) => [s.stat, s.value])).toEqual([
      ['atk', 2],
      ['hp', 4],
    ]);
    expect(stats('patch-scarf').map((s) => [s.stat, s.value])).toEqual([
      ['hp', 12],
      ['atk', 1],
    ]);
    // A Charm has none.
    expect(stats('trail-charm')).toEqual([]);
  });

  it('give a Hat Attack first and a Scarf HP first, both of them two stats at least, some a crit stat', () => {
    for (const base of gearContent.bases) {
      if (base.slot === 'charm') continue;
      const kinds = (base.stats ?? []).map((s) => s.stat);
      expect(kinds.length, base.id).toBeGreaterThanOrEqual(2);
      expect(kinds[0], base.id).toBe(base.slot === 'hat' ? 'atk' : 'hp');
      expect(kinds[1], base.id).toBe(base.slot === 'hat' ? 'hp' : 'atk');
      for (const k of kinds) expect(BASE_STAT_KINDS).toContain(k);
    }
    expect(gearContent.bases.some((b) => b.stats?.some((s) => s.stat === 'critChance'))).toBe(true);
    expect(gearContent.bases.some((b) => b.stats?.some((s) => s.stat === 'critDamage'))).toBe(true);
  });

  it('lean to the slot: a Hat is Attack-heavy, a Scarf HP-heavy (in the same tier and tag)', () => {
    for (const base of gearContent.bases) {
      if (base.slot !== 'hat' && base.slot !== 'scarf') continue;
      const [a, b] = base.stats ?? [];
      if (a === undefined || b === undefined) throw new Error(base.id);
      // Attack counts for more than HP point for point; "heavy" means the first stat's share of power is larger.
      expect(a.value * (a.stat === 'atk' ? 10 : 1)).toBeGreaterThan(
        b.value * (b.stat === 'atk' ? 10 : 1),
      );
    }
  });

  it('grow over the item levels by better bases, each a fixed set of stats', () => {
    for (const slot of ['hat', 'scarf'] as const) {
      for (const tag of ['neutral', ...ELEMENTS] as const) {
        const tiers = basesFor(slot, tag);
        expect(
          tiers.map((b) => b.minItemLevel ?? 1),
          `${tag} ${slot}`,
        ).toEqual([1, 5, 10]);
        const first = (b: (typeof tiers)[number]) => b.stats?.[0]?.value ?? 0;
        expect(first(tiers[0] as (typeof tiers)[number])).toBeLessThan(
          first(tiers[1] as (typeof tiers)[number]),
        );
        expect(first(tiers[1] as (typeof tiers)[number])).toBeLessThan(
          first(tiers[2] as (typeof tiers)[number]),
        );
      }
    }
    expect(eligibleBases('hat', 'tide', 4).map((b) => b.id)).toEqual(['kelp-cap']);
    expect(eligibleBases('hat', 'tide', 5).map((b) => b.id)).toEqual(['kelp-cap', 'brine-hood']);
    expect(eligibleBases('hat', 'tide', 20)).toHaveLength(3);
    expect(bestBaseForTint('hat', 'tide', 7).id).toBe('brine-hood');
    expect(bestBaseForTint('scarf', null, 3).id).toBe('patch-scarf');
    expect(bestBaseForTint('scarf', null, 10).id).toBe('travellers-mantle');
  });

  it('are (base + flat local) x (1 + percent local) for each stat, rounded down', () => {
    const none = stats('trail-cap', [], 10);
    expect(none[0]).toMatchObject({ stat: 'atk', value: 2, base: 2, flat: 0, pctBp: 0 });
    const both = stats('trail-cap', [
      ['attack-local-flat', 4], // +12
      ['attack-local-pct', 4], // +120%
      ['crit-chance', 0],
    ]);
    expect(both[0]).toMatchObject({
      value: Math.floor((14 * 22_000) / 10_000),
      flat: 12,
      pctBp: 12_000,
    });
    expect(both[0]?.value).toBe(30);
    // HP is its own stat: an Attack line does not touch it.
    expect(both[1]).toMatchObject({ stat: 'hp', value: 4, flat: 0, pctBp: 0 });
    const hp = stats('patch-scarf', [
      ['hp-local-pct', 2], // +60%
      ['hp-local-flat', 2], // +40
      ['attack-local-flat', 0], // +2 Attack on the scarf
    ]);
    expect(hp[0]).toMatchObject({ stat: 'hp', value: Math.floor((52 * 16_000) / 10_000) });
    expect(hp[1]).toMatchObject({ stat: 'atk', value: 3 });
    // Two percentage lines add; they never multiply (not reachable by rolling, but safe).
    const two = stats('trail-cap', [
      ['attack-local-pct', 1],
      ['attack-local-pct', 2],
    ]);
    expect(two[0]?.value).toBe(Math.floor((2 * 20_000) / 10_000));
  });

  it('can be a crit stat: crit chance and crit damage are in basis points and take local percentages', () => {
    const hood = stats('wayfarers-hood', [['crit-chance-local-pct', 4]]);
    expect(hood.find((s) => s.stat === 'critChance')).toMatchObject({
      base: 200,
      value: Math.floor((200 * 22_000) / 10_000),
    });
    const crown = stats('emberkeepers-crown', [['crit-damage-local-pct', 2]]);
    expect(crown.find((s) => s.stat === 'critDamage')?.value).toBe(
      Math.floor((2_000 * 16_000) / 10_000),
    );
    expect(statText('critChance', 440)).toBe('Crit chance 4.4 pt');
    expect(statText('atk', 35)).toBe('Attack 35');
    expect(statText('hp', 140)).toBe('HP 140');
  });

  it('can be looked up by kind', () => {
    const cap = item('trail-cap', 'common', 3);
    expect(itemStat(cap, 'atk')?.value).toBe(2);
    expect(itemStat(cap, 'critChance')).toBeUndefined();
  });

  it('ignore a local line for a stat the base does not have', () => {
    // Not reachable by rolling (the pool never offers it) but safe if it ever happens.
    const odd = stats('trail-cap', [['crit-chance-local-pct', 4]]);
    expect(odd.map((s) => s.stat)).toEqual(['atk', 'hp']);
    expect(odd.map((s) => s.value)).toEqual([2, 4]);
    expect(itemStats(item('trail-charm', 'epic', 20, [['attack-local-pct', 4]]))).toEqual([]);
  });

  it('never spill a local line into a creature stat: it adds nothing outside the item', () => {
    const fx = wornEffects({ role: 'payoff', element: 'ember' }, [
      item('trail-cap', 'epic', 20, [
        ['attack-local-pct', 4],
        ['attack-local-flat', 4],
      ]),
    ]);
    expect(fx.atkBp).toBe(0);
    expect(fx.atkFlat).toBe(0);
    expect(fx.atkItem).toBe(30);
    expect(fx.hpItem).toBe(4);
    expect(fx.idle).toEqual([]);
  });

  it('carry crit stats into the crit bonus, with the crit lines', () => {
    const fx = wornEffects({ role: 'payoff', element: 'ember' }, [
      item('emberkeepers-crown', 'epic', 15, [['crit-damage', 0]]),
      item('forge-hood', 'epic', 15, [['crit-chance', 0]]),
    ]);
    expect(fx.critDamageBp).toBe(2_000 + 800);
    expect(fx.critChanceBp).toBe(100 + 100);
  });

  it('need a Crafting level for a better base: item level 5 is Crafting level 3, 10 is 5', () => {
    expect(craftLevelNeeded('kelp-cap')).toBe(1);
    expect(craftLevelNeeded('brine-hood')).toBe(3);
    expect(craftLevelNeeded('tidecallers-crown')).toBe(5);
    expect(craftLevelNeeded('trail-charm')).toBe(1);
    expect(() => craftLevelNeeded('nope')).toThrow(RangeError);
    for (const base of gearContent.bases) {
      expect(craftItemLevel(craftLevelNeeded(base.id)), base.id).toBeGreaterThanOrEqual(
        base.minItemLevel ?? 1,
      );
    }
  });
});

describe('the wear rule', () => {
  const hat = item('trail-cap', 'common', 5);
  const scarf = item('patch-scarf', 'common', 5);
  const charm = item('trail-charm', 'common', 5);

  it('opens Hat from level 1, Scarf at 7 and Charm at 13', () => {
    expect(wearBlock(hat, { level: 5, role: 'guard' })).toBeNull();
    expect(wearBlock(scarf, { level: 6, role: 'guard' })).toEqual({
      reason: 'slot_locked',
      needs: 7,
    });
    expect(wearBlock(scarf, { level: 7, role: 'guard' })).toBeNull();
    expect(wearBlock(charm, { level: 12, role: 'guard' })).toEqual({
      reason: 'slot_locked',
      needs: 13,
    });
    expect(wearBlock(charm, { level: 13, role: 'guard' })).toBeNull();
  });

  it('an item level above the creature level waits in the bag', () => {
    const high = item('trail-cap', 'common', 14);
    expect(wearBlock(high, { level: 13, role: 'payoff' })).toEqual({
      reason: 'item_level',
      needs: 14,
    });
    expect(wearBlock(high, { level: 14, role: 'payoff' })).toBeNull();
    expect(wearBlock(hat, { level: 4, role: 'payoff' })).toEqual({
      reason: 'item_level',
      needs: 5,
    });
  });

  it('a role-locked Charm only fits its role', () => {
    const bell = item('wardens-bell', 'common', 1);
    expect(wearBlock(bell, { level: 20, role: 'support' })).toEqual({
      reason: 'role',
      role: 'guard',
    });
    expect(wearBlock(bell, { level: 20, role: 'guard' })).toBeNull();
  });
});

describe('folding worn items', () => {
  const payoff = { role: 'payoff', element: 'ember' } as const;
  const guard = { role: 'guard', element: 'grove' } as const;
  const support = { role: 'support', element: 'ember' } as const;

  it('returns the inputs unchanged without items', () => {
    const crit = { chanceBp: 100, damageBp: 200 };
    const out = applyGear(STATS, crit, payoff, []);
    expect(out.stats).toBe(STATS);
    expect(out.crit).toBe(crit);
    expect(out.mods).toBeUndefined();
  });

  it('adds the Hat Attack and the Scarf HP of the items to the creature, and never touches speed', () => {
    const out = applyGear(STATS, undefined, payoff, [
      item('trail-cap', 'rare', 20, [['attack-local-flat', 4]]),
      item('patch-scarf', 'rare', 20, [['hp-local-pct', 4]]),
    ]);
    // Hat: (2 + 12) Attack and 4 HP. Scarf: 12 HP x 2.2 and 1 Attack.
    expect(out.stats).toEqual({ atk: 50 + 14 + 1, hp: 200 + 4 + 26, spd: 40 });
    expect(out.mods).toBeUndefined();
  });

  it('adds a bare item its base stats, the same at any item level', () => {
    for (const level of [1, 7, 20]) {
      const out = applyGear(STATS, undefined, payoff, [
        item('trail-cap', 'common', level),
        item('patch-scarf', 'common', level),
      ]);
      expect(out.stats).toEqual({ atk: 50 + 2 + 1, hp: 200 + 4 + 12, spd: 40 });
    }
  });

  it('applies a Creature Attack or HP line to the creature only, before the item stats are added', () => {
    const out = applyGear(STATS, undefined, payoff, [
      item('trail-cap', 'common', 20, [['attack-local-pct', 4]]),
      item('trail-charm', 'epic', 20, [
        ['attack', 4],
        ['hp', 4],
      ]),
    ]);
    // Charm implicit +4% and Creature Attack +11% act on the creature's 50, not on the hat's 4 (2 x 2.2).
    expect(out.stats.atk).toBe(Math.floor((50 * (10_000 + 400 + 1_100)) / 10_000) + 4);
    expect(out.stats.hp).toBe(Math.floor((200 * 11_500) / 10_000) + 4);
  });

  it('keeps Creature Attack and HP rare: only Charms roll them', () => {
    for (const id of ['attack', 'hp']) {
      const w = gearLine(id)?.weights;
      expect(w?.hat).toBe(0);
      expect(w?.scarf).toBe(0);
      expect(w?.charm).toBeGreaterThan(0);
      expect(w?.charm).toBeLessThanOrEqual(10);
    }
    expect(gearLine('thick-coat')?.fixedOnly).toBe(true);
    expect(gearLine('sturdy-blow')).toBeUndefined();
  });

  it('adds an Attunement only for a wearer of its element', () => {
    const cinder = item('cinder-charm', 'common', 20);
    expect(applyGear(STATS, undefined, payoff, [cinder]).stats.atk).toBe(
      Math.floor((50 * 10_600) / 10_000),
    );
    expect(applyGear(STATS, undefined, guard, [cinder]).stats.atk).toBe(50);
    expect(wornEffects(guard, [cinder]).idle).toEqual(['ember-attunement']);
  });

  it('gives a Festival piece no raw power: its unique line is a small utility effect, not Attack or HP', () => {
    const lantern = item('festival-lantern-charm', 'epic', 20);
    const fx = wornEffects({ role: 'payoff', element: 'tide' }, [lantern]);
    // Only the Tide Attunement implicit, as on any Tide Charm; the Lantern luck is a trip rule.
    expect(fx.atkBp).toBe(600);
    expect(fx.hpBp).toBe(0);
    expect(fx.rules.luckyFindBp).toBe(150);
    const scarf = wornEffects({ role: 'guard', element: 'ember' }, [
      item('festival-hearth-scarf', 'epic', 20),
    ]);
    expect(scarf.rules.restBp).toBe(400);
    expect(scarf.hpBp).toBe(0);
    // Its base stats are those of the plain first-tier Ember Muffler, no more.
    const muffler = wornEffects({ role: 'guard', element: 'ember' }, [
      item('ember-muffler', 'epic', 20),
    ]);
    expect(scarf.hpItem).toBe(muffler.hpItem);
    expect(scarf.atkItem).toBe(muffler.atkItem);
    expect(gearBase('festival-hearth-scarf')?.stats).toEqual(gearBase('ember-muffler')?.stats);
  });

  it('adds crit chance and damage to the species bonus inside the engine room', () => {
    const luck = RULES.combat.luck;
    const hatItem = item('trail-cap', 'rare', 20, [
      ['crit-chance', 4],
      ['crit-damage', 4],
    ]);
    const out = applyGear(STATS, { chanceBp: 200, damageBp: 1_000 }, payoff, [hatItem]);
    expect(out.crit).toEqual({ chanceBp: 700, damageBp: 4_500 });
    const room = applyGear(
      STATS,
      { chanceBp: luck.critMaxChanceBp, damageBp: luck.critMaxBp },
      payoff,
      [hatItem],
    );
    // Already past the room: the species bonus stands, gear adds nothing.
    expect(room.crit).toEqual({ chanceBp: luck.critMaxChanceBp, damageBp: luck.critMaxBp });
    expect(applyGear(STATS, undefined, payoff, [hatItem]).crit).toEqual({
      chanceBp: 500,
      damageBp: 3_500,
    });
  });

  it('fills the sheet: Hunter and Ward resolve to the elements, reaction lines to the reaction', () => {
    const fx = wornEffects(payoff, [
      item('kelp-cap', 'epic', 20, [
        ['tide-hunter', 4],
        ['ember-reaction', 4],
        ['guards-shadow', 4],
      ]),
      item('seafoam-scarf', 'epic', 20, [
        ['tide-ward', 4],
        ['ember-ward', 0],
        ['brace', 4],
      ]),
    ]);
    // Tide beats Ember: a Tide Hunter hits Ember foes. Spark beats Tide: a Tide Ward cuts Spark foes.
    expect(fx.mods.vsElementBp).toEqual({ ember: 1_700 });
    // The Ember Ward (value 0 is tier I, 400) covers every element that deals 150% to Ember: Tide and Mire.
    expect(fx.mods.wardBp).toEqual({ spark: 1_700, tide: 400, mire: 400 });
    // Ember sets off two reactions (Wildfire on Overgrown, Flare on Muddied): its reaction line boosts both.
    expect(fx.mods.reactionBp).toEqual({ wildfire: 2_400, flare: 2_400 });
    expect(fx.mods.besideRoleBp).toEqual({ guard: 1_700 });
    expect(fx.mods.chargedBp).toBe(2_500);
  });

  it('folds Hunter, Ward and reaction lines over every element the chart names', () => {
    // A test-only chart: Tide also deals 150% to Grove, and Ember sets off a second reaction.
    const chartLength = content.elementChart.length;
    const reactionsLength = content.reactions.length;
    const steam = content.reactions.find((r) => r.triggerElement === 'tide');
    if (steam === undefined) throw new Error('no Steam');
    try {
      content.elementChart.push({ attacker: 'tide', defender: 'grove', bp: 15_000 });
      content.elementChart.push({ attacker: 'ember', defender: 'tide', bp: 15_000 });
      content.reactions.push({ ...steam, id: 'extra', triggerElement: 'ember' });
      const fx = wornEffects(payoff, [
        item('kelp-cap', 'epic', 20, [
          ['tide-hunter', 4],
          ['ember-reaction', 4],
          ['guards-shadow', 4],
        ]),
        item('seafoam-scarf', 'epic', 20, [
          ['tide-ward', 4],
          ['ember-ward', 0],
          ['brace', 4],
        ]),
      ]);
      // Hunter: every element Tide deals 150% to. Ward: every element that deals 150% to Tide.
      expect(fx.mods.vsElementBp).toEqual({ ember: 1_700, grove: 1_700 });
      expect(fx.mods.wardBp).toEqual({ spark: 1_700, ember: 1_700, tide: 400, mire: 400 });
      expect(fx.mods.reactionBp).toEqual({ wildfire: 2_400, flare: 2_400, extra: 2_400 });
    } finally {
      content.elementChart.length = chartLength;
      content.reactions.length = reactionsLength;
    }
  });

  it('sums every plain sheet line across items, and keeps Lingering to 3 rounds and Unbothered a switch', () => {
    const fx = wornEffects(support, [
      item('hearth-bell', 'epic', 20, [
        ['boost', 4],
        ['mend', 4],
        ['lingering', 0],
      ]),
      item('patch-scarf', 'epic', 20, [
        ['all-damage-taken', 4],
        ['area-ward', 4],
        ['unbothered', 0],
      ]),
      item('trail-charm', 'epic', 20, [
        ['spark-share', 4],
        ['lingering', 0],
        ['boost', 0],
      ]),
    ]);
    expect(fx.mods.boostBp).toBe(300 + 800 + 200);
    expect(fx.mods.mendBp).toBe(400);
    expect(fx.mods.shareBp).toBe(1_500);
    expect(fx.mods.takenBp).toBe(800);
    expect(fx.mods.areaBp).toBe(1_200);
    expect(fx.mods.lingerRounds).toBe(2);
    expect(fx.mods.ignoreSilence).toBe(1);
  });

  it('leaves a role line idle for another role (Armor on a Support does nothing)', () => {
    const bell = item('wardens-bell', 'rare', 20, [['cover', 4]]);
    expect(wornEffects(guard, [bell]).mods.armorBp).toBe(400);
    expect(wornEffects(guard, [bell]).mods.coverBp).toBe(1_200);
    const onSupport = wornEffects(support, [bell]);
    expect(onSupport.mods.armorBp).toBeUndefined();
    expect(onSupport.idle).toEqual(['armor', 'cover']);
  });

  it("folds a Guard's reach lines into the changes on each side, and keeps a side between 0 and 3", () => {
    const worn = (...ids: string[]) =>
      wornEffects(guard, [
        item(
          'wardens-bell',
          'epic',
          20,
          ids.map((id) => [id, 0]),
        ),
      ]).mods;
    expect(worn('wide-stance')).toMatchObject({ reachLeft: 1, reachRight: 1 });
    expect(worn('long-arm-left')).toMatchObject({ reachLeft: 2, reachRight: 0 });
    expect(worn('long-arm-right')).toMatchObject({ reachLeft: 0, reachRight: 2 });
    // Flank guard: 2 on one side and none on the other (the base is 1 each side).
    expect(worn('flank-guard-left')).toMatchObject({ reachLeft: 1, reachRight: -1 });
    expect(worn('flank-guard-right')).toMatchObject({ reachLeft: -1, reachRight: 1 });
    // Sources add up, then a side's change stops at -1 (reach 0) and +2 (reach 3).
    expect(worn('wide-stance', 'flank-guard-left')).toMatchObject({ reachLeft: 2, reachRight: 0 });
    expect(worn('long-arm-left', 'wide-stance', 'long-arm-left')).toMatchObject({
      reachLeft: 2,
      reachRight: 1,
    });
    expect(worn('flank-guard-left', 'flank-guard-left')).toMatchObject({ reachRight: -1 });
    // Only a Guard has a reach.
    const onSupport = wornEffects(support, [
      item('wardens-bell', 'epic', 20, [['wide-stance', 0]]),
    ]);
    expect(onSupport.mods.reachLeft).toBeUndefined();
    expect(onSupport.idle).toContain('wide-stance');
  });

  it("a talent with a reach line folds like the line, and adds to the items' reach", () => {
    const talent = { id: 'wide-as-a-puddle', effect: { line: 'wide-stance' }, value: 1 };
    const fx = wornEffects(
      guard,
      [item('wardens-bell', 'epic', 20, [['long-arm-right', 0]])],
      [talent],
    );
    expect(fx.mods).toMatchObject({ reachLeft: 1, reachRight: 2 });
  });

  it('folds the trip, Workshop and dungeon lines into rules, and none into the sheet', () => {
    const compass = item('crossroads-compass', 'epic', 20, [
      ['quick-feet', 4],
      ['keen-nose', 4],
      ['lucky-find', 4],
    ]);
    const scarf = item('patch-scarf', 'rare', 20, [
      ['between-room-rest', 4],
      ['packer', 0],
    ]);
    const hatItem = item('trail-cap', 'rare', 20, [
      ['busy-paws', 4],
      ['apprentice', 0],
    ]);
    const fx = wornEffects(payoff, [compass, scarf, hatItem]);
    expect(fx.rules).toEqual({
      trailXpBp: 800,
      quickFeetBp: 800,
      keenNoseBp: 2_500,
      luckyFindBp: 300,
      packerBp: 1_000,
      busyPawsBp: 1_200,
      apprenticeBp: 800,
      restBp: 700,
      glimmerFindBp: 0,
      dayTripRolls: 0,
      tinkersLuckBp: 0,
      secondLookBp: 0,
    });
    expect(Object.keys(fx.mods)).toEqual([]);
  });

  it('every line of the content folds without throwing, at every tier', () => {
    for (const line of gearContent.lines) {
      for (let tier = 0; tier < 5; tier++) {
        const base = gearContent.bases.find((b) => b.slot === 'charm' && b.tag === 'neutral');
        const it2 = item(base?.id ?? '', 'epic', 20, [[line.id, tier]]);
        for (const role of ROLES) {
          for (const element of ELEMENTS) {
            expect(
              () => applyGear(STATS, undefined, { role, element }, [it2]),
              line.id,
            ).not.toThrow();
          }
        }
      }
    }
  });

  it('never lowers a stat and keeps integers, whatever is worn', () => {
    const rng = createSeededRng('fold');
    for (let i = 0; i < 400; i++) {
      const items = (['hat', 'scarf', 'charm'] as const).map((slot, j) => {
        const base = baseFor(slot, ELEMENTS[(i + j) % 4] as 'tide') as { id: string };
        return rollItem(rng, { baseId: base.id, rarity: 'epic', itemLevel: 1 + (i % 20) });
      });
      const out = applyGear(
        STATS,
        undefined,
        { role: ROLES[i % 4] as Role, element: ELEMENTS[i % 4] as 'tide' },
        items,
      );
      expect(out.stats.atk).toBeGreaterThanOrEqual(STATS.atk);
      expect(out.stats.hp).toBeGreaterThanOrEqual(STATS.hp);
      expect(Number.isInteger(out.stats.atk) && Number.isInteger(out.stats.hp)).toBe(true);
    }
  });
});

describe('scoring and Equip best', () => {
  const wearerOf = (
    id: string,
    role: Role,
    element: 'tide' | 'ember' | 'grove' | 'spark',
    level: number,
  ): BestCreature => ({
    id,
    level,
    role,
    element,
    stats: { atk: 60, hp: 300 },
    worn: {},
  });

  it('scores an Attack hat higher for an attacker than a Guard-only Armor charm for a Payoff', () => {
    const w = { role: 'payoff', element: 'ember', stats: { atk: 60, hp: 300 } } as const;
    const attack = item('trail-cap', 'rare', 20, [['attack-local-pct', 4]]);
    const bell = item('wardens-bell', 'rare', 20, [['armor', 4]]);
    expect(itemScore(attack, w)).toBeGreaterThan(itemScore(bell, w));
    expect(itemScore(bell, { ...w, role: 'guard' })).toBeGreaterThan(itemScore(bell, w));
  });

  it('scores a better tier higher, and an Attunement of the wrong element as base only', () => {
    const w = { role: 'payoff', element: 'ember', stats: { atk: 60, hp: 300 } } as const;
    const low = item('trail-cap', 'common', 20, [['attack-local-pct', 1]]);
    const high = item('trail-cap', 'common', 20, [['attack-local-pct', 4]]);
    expect(itemScore(high, w)).toBeGreaterThan(itemScore(low, w));
    const tide = item('tidepool-charm', 'common', 20);
    const ember = item('cinder-charm', 'common', 20);
    expect(itemScore(ember, w)).toBeGreaterThan(itemScore(tide, w));
    expect(itemScore(tide, w)).toBe(0);
  });

  it('puts the best wearable item on a creature, one per slot, and takes nothing it cannot wear', () => {
    const creature = wearerOf('c1', 'payoff', 'ember', 12);
    const weak = { id: 'i1', item: item('trail-cap', 'common', 5) };
    const strong = { id: 'i2', item: item('coal-warm-cap', 'epic', 10, [['attack-local-pct', 2]]) };
    const tooHigh = {
      id: 'i3',
      item: item('coal-warm-cap', 'epic', 13, [['attack-local-pct', 2]]),
    };
    const scarf = { id: 'i4', item: item('patch-scarf', 'common', 6) };
    const charm = { id: 'i5', item: item('trail-charm', 'common', 6) };
    const moves = planEquipBest([creature], [weak, strong, tooHigh, scarf, charm]);
    expect(moves).toEqual(
      expect.arrayContaining([
        { creatureId: 'c1', slot: 'hat', itemId: 'i2' },
        { creatureId: 'c1', slot: 'scarf', itemId: 'i4' },
      ]),
    );
    // Level 12 cannot wear a Charm (opens at 13) or the level 13 hat.
    expect(moves.some((m) => m.slot === 'charm')).toBe(false);
    expect(moves.some((m) => m.itemId === 'i3')).toBe(false);
  });

  it('changes a slot only for a better item and is empty when nothing is better', () => {
    const best = { id: 'i1', item: item('coal-warm-cap', 'epic', 10, [['attack-local-pct', 2]]) };
    const worse = { id: 'i2', item: item('trail-cap', 'common', 5) };
    const creature = { ...wearerOf('c1', 'payoff', 'ember', 12), worn: { hat: 'i1' } as const };
    expect(planEquipBest([creature], [best, worse])).toEqual([]);
    const swapped = { ...creature, worn: { hat: 'i2' } as const };
    expect(planEquipBest([swapped], [best, worse])).toEqual([
      { creatureId: 'c1', slot: 'hat', itemId: 'i1' },
    ]);
  });

  it('never leaves a creature with an empty slot or a worse item to hand its item to someone else', () => {
    const emberLines: [string, number][] = [
      ['attack-local-pct', 4],
      ['ember-attunement', 4],
    ];
    const hat = { id: 'h1', item: item('coal-warm-cap', 'rare', 20, emberLines) };
    const payoff = wearerOf('p', 'payoff', 'ember', 20);
    const guard = { ...wearerOf('g', 'guard', 'grove', 20), worn: { hat: 'h1' } as const };
    // The Payoff would get more from the hat than the Guard wearing it, and nothing else is on offer.
    expect(itemScore(hat.item, payoff)).toBeGreaterThan(itemScore(hat.item, guard));
    expect(planEquipBest([payoff, guard], [hat])).toEqual([]);
    // With a worse spare for the Guard, it still keeps its own hat: a slot changes only for a better item.
    const spare = { id: 'h2', item: item('trail-cap', 'common', 5) };
    expect(itemScore(spare.item, guard)).toBeLessThan(itemScore(hat.item, guard));
    expect(planEquipBest([payoff, guard], [hat, spare])).toEqual([
      { creatureId: 'p', slot: 'hat', itemId: 'h2' },
    ]);
  });

  it('swaps two items between creatures when both end up with something better', () => {
    const emberHat = {
      id: 'h1',
      item: item('coal-warm-cap', 'rare', 20, [
        ['attack-local-pct', 4],
        ['ember-attunement', 4],
      ]),
    };
    const groveHat = {
      id: 'h2',
      item: item('acorn-cap', 'rare', 20, [
        ['attack-local-pct', 4],
        ['grove-attunement', 4],
      ]),
    };
    const ember = { ...wearerOf('e', 'payoff', 'ember', 20), worn: { hat: 'h2' } as const };
    const grove = { ...wearerOf('g', 'payoff', 'grove', 20), worn: { hat: 'h1' } as const };
    expect(itemScore(emberHat.item, ember)).toBeGreaterThan(itemScore(groveHat.item, ember));
    expect(itemScore(groveHat.item, grove)).toBeGreaterThan(itemScore(emberHat.item, grove));
    expect(planEquipBest([ember, grove], [emberHat, groveHat])).toEqual(
      expect.arrayContaining([
        { creatureId: 'e', slot: 'hat', itemId: 'h1' },
        { creatureId: 'g', slot: 'hat', itemId: 'h2' },
      ]),
    );
  });

  it('shares items across a team, best pair first, each item once, and is the same in any order', () => {
    const a = wearerOf('a', 'payoff', 'ember', 20);
    const b = wearerOf('b', 'guard', 'grove', 20);
    const cands = [
      {
        id: 'h1',
        item: item('coal-warm-cap', 'epic', 20, [
          ['attack-local-pct', 4],
          ['crit-damage', 4],
        ]),
      },
      { id: 'h2', item: item('acorn-cap', 'rare', 20, [['attack-local-pct', 2]]) },
      {
        id: 's1',
        item: item('leafknit-scarf', 'epic', 20, [
          ['hp-local-pct', 4],
          ['aimed-ward', 4],
        ]),
      },
    ];
    const one = planEquipBest([a, b], cands);
    const two = planEquipBest([b, a], [...cands].reverse());
    const sorted = (moves: typeof one) =>
      [...moves].sort((x, y) => ((x.itemId ?? '') < (y.itemId ?? '') ? -1 : 1));
    expect(sorted(one)).toEqual(sorted(two));
    const items = one.map((m) => m.itemId);
    expect(new Set(items).size).toBe(items.length);
    expect(one).toEqual(expect.arrayContaining([{ creatureId: 'a', slot: 'hat', itemId: 'h1' }]));
  });

  it('a role-locked Charm goes only to its role', () => {
    const guardC = wearerOf('g', 'guard', 'grove', 20);
    const payoffC = wearerOf('p', 'payoff', 'ember', 20);
    const bell = { id: 'b', item: item('wardens-bell', 'epic', 15, [['cover', 3]]) };
    const moves = planEquipBest([payoffC, guardC], [bell]);
    expect(moves).toEqual([{ creatureId: 'g', slot: 'charm', itemId: 'b' }]);
  });
});

describe('item levels by source', () => {
  it('follows the spec table', () => {
    expect([2, 7, 12, 17].map(finaleItemLevel)).toEqual([5, 10, 15, 20]);
    expect(finaleItemLevel(40)).toBe(20);
    expect([12, 27, 42, 57].map((d) => dungeonItemLevel(d, false))).toEqual([5, 10, 15, 20]);
    expect(dungeonItemLevel(7, true)).toBe(6);
    expect(dungeonItemLevel(60, true)).toBe(20);
    expect([3, 6, 10].map(expeditionItemLevel)).toEqual([3, 6, 10]);
    expect([5, 8, 10].map(craftItemLevel)).toEqual([10, 16, 20]);
    expect(craftItemLevel(1)).toBe(2);
  });

  it('converts to the higher of 3 + Boss Rank and the best depth drop level, at most 12', () => {
    expect(convertedItemLevel(1, 0)).toBe(4);
    expect(convertedItemLevel(5, 0)).toBe(8);
    expect(convertedItemLevel(1, 12)).toBe(5);
    expect(convertedItemLevel(2, 18)).toBe(7);
    expect(convertedItemLevel(15, 40)).toBe(12);
  });
});

describe('drops', () => {
  it('finale odds start at 75 / 22 / 3 at rank 1, sum to 100% and only get better with rank', () => {
    expect(finaleDropOddsBp(1)).toEqual({ common: 7_500, rare: 2_200, epic: 300 });
    let last = finaleDropOddsBp(1);
    for (let rank = 2; rank <= 40; rank++) {
      const odds = finaleDropOddsBp(rank);
      expect(odds.common + odds.rare + odds.epic).toBe(10_000);
      expect(odds.common).toBeLessThanOrEqual(last.common);
      last = odds;
    }
  });

  it('a finale piece has the boss element as its tag, the rank item level and never a Festival base', () => {
    const rng = createSeededRng('finale');
    for (let i = 0; i < 400; i++) {
      const piece = rollFinaleItem(rng, 7, 'spark');
      expect(piece.itemLevel).toBe(10);
      expect(['spark', 'setter', 'payoff', 'support', 'guard']).toContain(piece.tag);
      expect(gearBase(piece.baseId)?.festival).not.toBe(true);
    }
  });

  it('about 1 Charm in 20 of a finale is role-locked, and so is a Hat or Scarf of a role set once the level unlocks it', () => {
    const rng = createSeededRng('rolecharm');
    let charms = 0;
    let locked = 0;
    const roles = ['setter', 'payoff', 'support', 'guard'];
    for (let i = 0; i < 30_000; i++) {
      const base = dropBase(rng, 'tide', 20, { roleCharm: true });
      if (base.slot === 'charm') {
        charms++;
        if (roles.includes(base.tag)) locked++;
      } else if (roles.includes(base.tag)) {
        // Only the pieces of a role set (item level 12 and up) are locked besides the Charms.
        expect(base.set).toBeDefined();
      } else {
        expect(base.tag).toBe('tide');
      }
    }
    expect(locked / charms).toBeGreaterThan(0.04);
    expect(locked / charms).toBeLessThan(0.06);
    // Without the option no Charm is ever locked.
    for (let i = 0; i < 2_000; i++) {
      expect(['tide']).toContain(dropBase(rng, 'tide', 20).tag);
    }
    expect(dropBase(rng, null, 20).tag).toBe('neutral');
  });

  it('a drop is any base its item level unlocks: better bases only appear from their item level', () => {
    const rng = createSeededRng('unlock');
    const seen = (level: number): Set<string> => {
      const out = new Set<string>();
      for (let i = 0; i < 3_000; i++) out.add(dropBase(rng, 'ember', level).id);
      return out;
    };
    const low = seen(4);
    expect(low.has('forge-hood')).toBe(false);
    expect(low.has('emberkeepers-crown')).toBe(false);
    expect(low.has('coal-warm-cap')).toBe(true);
    const mid = seen(5);
    expect(mid.has('forge-hood')).toBe(true);
    expect(mid.has('forge-scarf')).toBe(true);
    expect(mid.has('emberkeepers-crown')).toBe(false);
    const high = seen(10);
    for (const id of ['coal-warm-cap', 'forge-hood', 'emberkeepers-crown', 'emberkeepers-mantle']) {
      expect(high.has(id), id).toBe(true);
    }
    // Every finale, dungeon and trip piece respects it.
    for (let i = 0; i < 400; i++) {
      const piece = rollDungeonItem(rng, 'common', 8, false, 'tide');
      const base = gearBase(piece.baseId);
      expect(base?.minItemLevel ?? 1).toBeLessThanOrEqual(piece.itemLevel);
      const found = rollExpeditionItem(rng, 'rare', { element: 'grove', crossroads: false }, 3);
      expect(gearBase(found.baseId)?.minItemLevel ?? 1).toBeLessThanOrEqual(found.itemLevel);
    }
  });

  it('splits gear and blueprints at blueprintBp, always exactly one of them', () => {
    const rng = createSeededRng('slot');
    let blueprints = 0;
    const n = 4_000;
    for (let i = 0; i < n; i++) {
      const reward = rollFinaleReward(rng, 3, 'ember', new Set());
      if (reward.kind === 'blueprint') {
        blueprints++;
        expect(blueprintBases().map((b) => b.id)).toContain(reward.baseId);
      } else {
        expect(reward.item.lines.length).toBeGreaterThan(0);
      }
    }
    expect(blueprints / n).toBeGreaterThan(0.22);
    expect(blueprints / n).toBeLessThan(0.28);
  });

  it('never repeats a known blueprint while unknown ones exist, and falls back to gear when all are known', () => {
    const all = new Set(blueprintBases().map((b) => b.id));
    const one = [...all][0] as string;
    const nearly = new Set([...all].filter((id) => id !== one));
    const rng = createSeededRng('known');
    for (let i = 0; i < 300; i++) {
      const reward = rollFinaleReward(rng, 3, 'ember', nearly);
      if (reward.kind === 'blueprint') expect(reward.baseId).toBe(one);
      expect(rollFinaleReward(rng, 3, 'ember', all).kind).toBe('gear');
    }
  });

  it('blueprints are craftable bases only: no Festival piece and no role-locked Charm (a role set piece may be)', () => {
    const rng = createSeededRng('bp');
    for (let i = 0; i < 600; i++) {
      const base = gearBase(rollBlueprint(rng));
      expect(base?.festival).not.toBe(true);
      if (['setter', 'payoff', 'support', 'guard'].includes(base?.tag ?? '')) {
        expect(base?.set).toBeDefined();
      }
    }
  });

  it('a Festival piece is special, not stronger: the finale item level (3 + rank) and the finale rarity odds', () => {
    const rng = createSeededRng('fest');
    const none: ReadonlySet<string> = new Set();
    const lantern = rollFestivalItem(rng, none, 8);
    expect(gearBase(lantern.baseId)?.festival).toBe(true);
    expect(lantern.itemLevel).toBe(finaleItemLevel(8));
    expect(lantern.itemLevel).toBe(11);
    expect(['common', 'rare', 'epic']).toContain(lantern.rarity);
    // Never a higher level than the same rank's finale piece, at any rank.
    for (let rank = 1; rank <= 40; rank++) {
      expect(rollFestivalItem(rng, none, rank).itemLevel).toBe(finaleItemLevel(rank));
    }
  });

  it('every Festival base can drop, the Lantern Cap included (it once could not: only the creature element picked)', () => {
    const all = festivalBases().map((b) => b.id);
    expect(all).toContain('festival-lantern-cap');
    expect(new Set(all)).toEqual(
      new Set(gearContent.bases.filter((b) => b.festival === true).map((b) => b.id)),
    );
    const rng = createSeededRng('fest-reach');
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(rollFestivalItem(rng, new Set(), 1 + (i % 17)).baseId);
    expect(seen).toEqual(new Set(all));
    // The same once the player owns every piece.
    const seenAll = new Set<string>();
    for (let i = 0; i < 300; i++) seenAll.add(rollFestivalItem(rng, new Set(all), 5).baseId);
    expect(seenAll).toEqual(new Set(all));
  });

  it('a Festival win gives a piece the player lacks: with two of three owned, always the third', () => {
    const all = festivalBases().map((b) => b.id);
    const rng = createSeededRng('fest-missing');
    for (const missing of all) {
      const owned = new Set(all.filter((id) => id !== missing));
      for (let i = 0; i < 40; i++) {
        expect(rollFestivalItem(rng, owned, 1 + (i % 17)).baseId).toBe(missing);
      }
    }
    // Ids that are not Festival bases (a plain Hat) change nothing about it.
    const owned = new Set(['trail-cap', ...all.slice(1)]);
    expect(rollFestivalItem(rng, owned, 3).baseId).toBe(all[0]);
    // With none owned, each of them is drawn (evenly: none is missing from 600 draws, none dominates).
    const counts = new Map<string, number>();
    for (let i = 0; i < 600; i++) {
      const id = rollFestivalItem(rng, new Set(), 3).baseId;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const id of all) expect(counts.get(id) ?? 0).toBeGreaterThan(600 / all.length / 2);
  });

  it('a Festival piece rolls its rarity at the finale odds: no floor, a Common at low ranks', () => {
    const rng = createSeededRng('fest-rarity');
    const at = (rank: number): Record<GearRarity, number> => {
      const out: Record<GearRarity, number> = { common: 0, rare: 0, epic: 0 };
      for (let i = 0; i < 20_000; i++) out[rollFestivalItem(rng, new Set(), rank).rarity] += 1;
      return out;
    };
    const odds = finaleDropOddsBp(1);
    const low = at(1);
    expect(low.common / 20_000).toBeCloseTo(odds.common / 10_000, 1);
    expect(low.epic / 20_000).toBeCloseTo(odds.epic / 10_000, 1);
    expect(low.common).toBeGreaterThan(low.rare);
    // The same odds as the finale's own rarity draw.
    // (the base is drawn first, one draw; the rarity follows)
    const a = createSeededRng('same-draw');
    const b = createSeededRng('same-draw');
    festivalBaseFor(b, new Set());
    expect(rollFestivalItem(a, new Set(), 6).rarity).toBe(rollFinaleRarity(b, 6));
  });

  it('a Festival piece rolls only from its narrow pool and always carries its unique line', () => {
    const rng = createSeededRng('fest-pool');
    for (const festive of festivalBases()) {
      const seen = new Set<string>();
      for (let i = 0; i < 400; i++) {
        const piece = rollFestivalItem(
          rng,
          new Set(festivalBases().flatMap((b) => (b.id === festive.id ? [] : [b.id]))),
          1 + (i % 17),
        );
        expect(piece.baseId).toBe(festive.id);
        const base = gearBase(piece.baseId);
        for (const l of piece.lines) {
          expect(base?.pool).toContain(l.id);
          seen.add(l.id);
        }
        const lines = itemLines(piece);
        expect(lines.some((l) => l.source === 'fixed')).toBe(true);
        expect(lines.filter((l) => l.source === 'fixed')).toHaveLength(1);
      }
      expect(seen.size).toBeGreaterThan(1);
      // The pool has five ordinary lines and one chance line (Second wind, Warm heart or Echo).
      expect(seen.size).toBeLessThanOrEqual(6);
    }
    // The unique line is not in anyone's roll pool.
    for (const slot of GEAR_SLOTS) {
      const ids = linePool({ slot, tag: 'neutral' }, 'epic', 20).map((p) => p.line.id);
      expect(ids).not.toContain('hearth-warmth');
      expect(ids).not.toContain('lantern-luck');
      expect(ids).not.toContain('thick-coat');
    }
  });

  it('an old Festival rarity converts at the finale odds, and the other rarities stay as they were', () => {
    const rng = createSeededRng('conv-rarity');
    expect(rollConvertedRarity(rng, 5, 'common')).toBe('common');
    expect(rollConvertedRarity(rng, 5, 'epic')).toBe('epic');
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) seen.add(rollConvertedRarity(rng, 12, 'festival'));
    expect(seen.has('common')).toBe(true);
    expect(seen.has('rare')).toBe(true);
    // It drew nothing for a rarity that stays.
    let draws = 0;
    const counting: Rng = { nextU32: () => (draws++, HIGH) };
    rollConvertedRarity(counting, 5, 'rare');
    expect(draws).toBe(0);
    rollConvertedRarity(counting, 5, 'festival');
    expect(draws).toBeGreaterThan(0);
  });

  it('a dungeon piece has the floor boss element and a level by depth, landmark bonus included', () => {
    const rng = createSeededRng('dungeon');
    const plain = rollDungeonItem(rng, 'rare', 18, false, 'grove');
    expect(plain.itemLevel).toBe(7);
    expect(['grove']).toContain(plain.tag);
    expect(rollDungeonItem(rng, 'common', 7, true, 'spark').itemLevel).toBe(6);
  });

  it('an expedition find has the place element and the explorer rank as its level; the Crossroads gives explorer pieces (the Compass until item level 12)', () => {
    const rng = createSeededRng('trip');
    const find = rollExpeditionItem(rng, 'rare', { element: 'tide', crossroads: false }, 6);
    expect(find.itemLevel).toBe(6);
    expect(find.tag).toBe('tide');
    const compass = rollExpeditionItem(rng, 'epic', { element: null, crossroads: true }, 5);
    expect(compass.baseId).toBe('crossroads-compass');
    expect(compass.itemLevel).toBe(5);
    const high = rollExpeditionItem(rng, 'epic', { element: null, crossroads: true }, 20);
    expect(high.tag).toBe('explorer');
    expect(high.itemLevel).toBe(20);
    expect(rollExpeditionItem(rng, 'rare', { element: null, crossroads: false }, 3).tag).toBe(
      'neutral',
    );
  });

  it('the welcome kit is a common level 1 Hat, the blueprint of a neutral piece, and scrap that pays for its craft', () => {
    const slots = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const kit = rollWelcomeKit(createSeededRng(`kit-${String(i)}`));
      expect(kit.item.rarity).toBe('common');
      expect(kit.item.slot).toBe('hat');
      expect(kit.item.tag).toBe('neutral');
      expect(kit.item.itemLevel).toBe(1);
      expect(kit.item.lines).toHaveLength(1);
      expect(blueprintBases().map((b) => b.id)).toContain(kit.blueprint);
      // A neutral base costs scrap only, so the welcome scrap pays for it on day 1.
      expect(gearBase(kit.blueprint)?.tag).toBe('neutral');
      expect(Object.keys(craftCost(kit.blueprint, craftItemLevel(1)))).toEqual(['scrap']);
      expect(RULES.gear.drops.welcomeScrap).toBeGreaterThanOrEqual(
        craftCost(kit.blueprint, craftItemLevel(1)).scrap ?? 0,
      );
      slots.add(gearBase(kit.blueprint)?.slot ?? '');
    }
    expect([...slots].sort()).toEqual(['charm', 'hat', 'scarf']);
  });

  it('expedition loot: scrap by duration, a share when recalled, extras only on a completed trip', () => {
    const rng = createSeededRng('exp');
    const done = (duration: 'short' | 'medium' | 'long', rolls: number) =>
      expeditionLoot(rng, duration, 'tide', { completed: true, caught: rolls, rolls });
    expect(done('short', 1).parts.scrap).toBe(1);
    expect(done('long', 3).parts.scrap).toBe(6);
    let draws = 0;
    const counting: Rng = { nextU32: () => (draws++, 0) };
    expect(
      expeditionLoot(counting, 'long', 'tide', { completed: false, caught: 1, rolls: 3 }),
    ).toEqual({ parts: { scrap: 2 }, blueprint: null });
    expect(draws).toBe(0);
    const best = expeditionLoot(fixedRng(0), 'long', 'grove', {
      completed: true,
      caught: 3,
      rolls: 3,
    });
    expect(best.parts).toEqual({ scrap: 6, 'grove-shard': 1, glimmer: 1 });
    expect(best.blueprint).not.toBeNull();
    expect(
      expeditionLoot(fixedRng(HIGH), 'long', 'grove', { completed: true, caught: 3, rolls: 3 }),
    ).toEqual({ parts: { scrap: 6 }, blueprint: null });
  });
});

describe('costs, yields and jobs', () => {
  it('crafting costs 6 scrap and a shard of the element, or 8 scrap for a neutral or explorer base, and 1 scrap more for every 4 item levels', () => {
    expect(craftCost('kelp-cap', 2)).toEqual({ scrap: 6, 'tide-shard': 1 });
    expect(craftCost('cinder-charm', 2)).toEqual({ scrap: 6, 'ember-shard': 1 });
    expect(craftCost('trail-cap', 2)).toEqual({ scrap: 8 });
    expect(craftCost('crossroads-compass', 2)).toEqual({ scrap: 8 });
    // A level 10 crafter makes item level 20: +5 scrap.
    expect(craftCost('kelp-cap', 20)).toEqual({ scrap: 11, 'tide-shard': 1 });
    expect(craftCost('trail-cap', 20)).toEqual({ scrap: 13 });
    expect(craftCost('trail-cap', 3)).toEqual({ scrap: 8 });
    expect(craftCost('trail-cap', 4)).toEqual({ scrap: 9 });
    // Role-locked and Festival bases price like any other base without an element of its own.
    expect(craftScrapCost('wardens-bell', 8)).toBe(10);
    expect(() => craftCost('nope', 2)).toThrow(RangeError);
  });

  it('a dismantle never gives back what the craft cost: scrap under half of it, whatever the base, rarity and item level', () => {
    for (const base of gearContent.bases) {
      for (const rarity of ['common', 'rare', 'epic'] as const) {
        for (let itemLevel = 1; itemLevel <= RULES.gear.maxItemLevel; itemLevel++) {
          const range = dismantleRange([{ baseId: base.id, rarity, itemLevel }]);
          const cost = craftScrapCost(base.id, itemLevel);
          expect(range.scrap.min).toBeGreaterThanOrEqual(1);
          expect(range.scrap.max).toBeGreaterThanOrEqual(range.scrap.min);
          expect(
            range.scrap.max * 2,
            `${base.id} ${rarity} ${String(itemLevel)}`,
          ).toBeLessThanOrEqual(cost);
        }
      }
    }
    // A bundle of 5 Commons is 5 items, each under half of its own cost.
    const bundle = dismantleRange(
      Array.from({ length: 5 }, () => ({
        baseId: 'kelp-cap',
        rarity: 'common' as const,
        itemLevel: 20,
      })),
    );
    expect(bundle.scrap.max * 2).toBeLessThanOrEqual(5 * craftScrapCost('kelp-cap', 20));
  });

  it('a Common craft and dismantle loop loses scrap at every item level', () => {
    // The cheapest loop: a neutral Common (no shard). Its best refund still leaves at least half the cost spent.
    for (let itemLevel = 2; itemLevel <= RULES.gear.maxItemLevel; itemLevel += 2) {
      const cost = craftCost('trail-cap', itemLevel).scrap ?? 0;
      const best = dismantleRange([{ baseId: 'trail-cap', rarity: 'common', itemLevel }]).scrap.max;
      expect(cost - best).toBeGreaterThanOrEqual(Math.ceil(cost / 2));
    }
  });

  it('the fallback yield is the bottom of the range: scrap, a shard of the element tag, glimmer; nothing negative or fractional', () => {
    // Craft scrap cost: neutral 8 + 1 per 4 item levels, element 6 + the same. Common keeps 25%, Rare 35%, Epic 40% at the bottom.
    expect(dismantleYield({ baseId: 'trail-cap', rarity: 'common' })).toEqual({ scrap: 2 });
    expect(dismantleYield({ baseId: 'kelp-cap', rarity: 'rare' })).toEqual({
      scrap: 2,
      'tide-shard': 1,
    });
    expect(dismantleYield({ baseId: 'coal-warm-cap', rarity: 'epic' })).toEqual({
      scrap: 2,
      'ember-shard': 1,
    });
    // The share grows with the item level because the craft price does.
    expect(dismantleYield({ baseId: 'coal-warm-cap', rarity: 'epic', itemLevel: 20 })).toEqual({
      scrap: 4,
      'ember-shard': 1,
    });
    // Neutral, explorer and role pieces give no shard when nothing is rolled.
    expect(dismantleYield({ baseId: 'wardens-bell', rarity: 'epic', itemLevel: 20 })).toEqual({
      scrap: 5,
    });
    for (const base of gearContent.bases) {
      for (const rarity of ['common', 'rare', 'epic'] as const) {
        const parts = dismantleYield({ baseId: base.id, rarity });
        for (const [kind, amount] of Object.entries(parts)) {
          expect(PART_KINDS as readonly string[]).toContain(kind);
          expect(Number.isInteger(amount) && amount > 0).toBe(true);
        }
      }
    }
    expect(addParts({ scrap: 1 }, { scrap: 2, glimmer: 1 })).toEqual({ scrap: 3, glimmer: 1 });
  });

  it('a craft takes 3 hours, 3% shorter per skill level above 1, and Busy paws shorten it more', () => {
    const H = 3_600_000;
    expect(jobHours()).toBe(3);
    expect(jobDuration(1)).toBe(3 * H);
    expect(jobDuration(2)).toBe(Math.floor(3 * H * 0.97));
    expect(jobDuration(MAX_SKILL_LEVEL)).toBe(Math.floor(3 * H * 0.73));
    expect(jobDuration(1, 1_000)).toBe(Math.floor(3 * H * 0.9));
    expect(jobDuration(1, 99_999)).toBe(Math.floor(3 * H * 0.1));
    for (let level = 1; level < MAX_SKILL_LEVEL; level++) {
      expect(jobDuration(level + 1)).toBeLessThan(jobDuration(level));
    }
  });

  it('gives 12 XP per nominal hour, more with Apprentice, whatever the skill', () => {
    expect(jobXp()).toBe(36);
    expect(jobXp(1_000)).toBe(39);
  });

  it('maps XP to Crafting levels 1 to 10 on a slow curve', () => {
    expect(skillLevel(0)).toBe(1);
    expect(skillLevel(100)).toBe(2);
    expect(skillLevel(5_500)).toBe(10);
    expect(skillLevel(-5)).toBe(1);
    expect(skillLevel(Number.NaN)).toBe(1);
    expect(nextSkillXp(1)).toBe(100);
    expect(nextSkillXp(10)).toBeNull();
  });

  it('a plain craft is Common, or one rarity higher with 1% per level above 1, and always draws twice', () => {
    const rng = createSeededRng('craft');
    for (let i = 0; i < 200; i++) expect(craftRarity(rng, 1)).toBe('common');
    let up = 0;
    for (let i = 0; i < 20_000; i++) if (craftRarity(rng, 10) === 'rare') up++;
    expect(up / 20_000).toBeGreaterThan(0.075);
    expect(up / 20_000).toBeLessThan(0.105);
    let draws = 0;
    const counting: Rng = { nextU32: () => (draws++, HIGH) };
    craftRarity(counting, 1);
    craftRarity(counting, 7);
    expect(draws).toBe(4);
  });

  it('a craft has item level 2 x the crafter level and the blueprint base', () => {
    const rng = createSeededRng('rollcraft');
    const made = rollCraft(rng, 'kelp-cap', 4);
    expect(made.itemLevel).toBe(8);
    expect(made.baseId).toBe('kelp-cap');
    expect(['common', 'rare']).toContain(made.rarity);
  });
});

describe('the one-time conversion helpers', () => {
  it('refunds the upgrades in full and an old item at the old dismantle yield', () => {
    expect(legacyUpgradeSpent('common', 0)).toEqual({ essence: 0, scrap: 0 });
    expect(legacyUpgradeSpent('common', 5)).toEqual({ essence: 250, scrap: 30 });
    expect(legacyUpgradeSpent('epic', 2)).toEqual({ essence: 100, scrap: 10 });
    expect(legacyDismantleYield('epic', 'tide')).toEqual({
      scrap: 10,
      'tide-shard': 2,
      glimmer: 1,
    });
    expect(legacyDismantleYield('common', null)).toEqual({ scrap: 2 });
  });

  it('has an item level for conversion inside the cap and roll floor of the rules', () => {
    expect(RULES.gear.itemLevel.convert.max).toBe(12);
    expect(RULES.gear.itemLevel.convert.minTier).toBe(1);
  });
});

describe('the crafting loop: Reach, odds and marks', () => {
  const sum = (o: { common: number; rare: number; epic: number }): number =>
    o.common + o.rare + o.epic;

  it('asks a Crafting level, Essence and glimmer for a Reach (no extra shard), and a longer job', () => {
    expect([reachMinLevel('none'), reachMinLevel('rare'), reachMinLevel('epic')]).toEqual([
      1, 3, 6,
    ]);
    expect([craftHours('none'), craftHours('rare'), craftHours('epic')]).toEqual([3, 6, 10]);
    expect(craftCostFor('kelp-cap', 'none', {}, 2)).toEqual({
      parts: { scrap: 6, 'tide-shard': 1 },
      essence: 0,
    });
    // A Reach is the plain craft's parts plus Essence (and a glimmer for an Epic): it never takes more shards.
    expect(craftCostFor('kelp-cap', 'rare', {}, 6)).toEqual({
      parts: { scrap: 7, 'tide-shard': 1 },
      essence: RULES.gear.craft.reach.rare.essence,
    });
    expect(craftCostFor('kelp-cap', 'epic', {}, 12)).toEqual({
      parts: { scrap: 9, 'tide-shard': 1, glimmer: 1 },
      essence: RULES.gear.craft.reach.epic.essence,
    });
    expect(craftCostFor('trail-cap', 'epic', {}, 20)).toEqual({
      parts: { scrap: 13, glimmer: 1 },
      essence: RULES.gear.craft.reach.epic.essence,
    });
    expect(RULES.gear.craft.reach.rare.shard + RULES.gear.craft.reach.epic.shard).toBe(0);
  });

  it('puts the missing shards on the biggest pile, so a payment fails visibly', () => {
    expect(anyShards({ 'tide-shard': 1 }, 2)).toEqual({ 'tide-shard': 2 });
    expect(anyShards({}, 2)).toEqual({ 'tide-shard': 2 });
    expect(anyShards({ 'spark-shard': 3 }, 0)).toEqual({});
  });

  it('shows exact odds for every Reach, Crafting level and number of marks: every input is a whole percent, so nothing is rounded', () => {
    const inputs = [
      RULES.gear.skill.rarityUpBpPerLevel,
      RULES.gear.craft.marks.upBp,
      ...Object.values(RULES.gear.craft.reach.rare.oddsBp),
      ...Object.values(RULES.gear.craft.reach.epic.oddsBp),
    ];
    for (const bp of inputs) expect(bp % 100).toBe(0);
    for (const reach of ['none', 'rare', 'epic'] as const) {
      for (let level = 1; level <= MAX_SKILL_LEVEL; level++) {
        for (let marks = 0; marks <= 10; marks++) {
          const odds = craftOdds(reach, level, marks);
          expect(sum(odds)).toBe(10_000);
          for (const v of Object.values(odds)) {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(Number.isInteger(v)).toBe(true);
          }
        }
      }
    }
  });

  it('matches the spec: Reach for Rare 60/40, Reach for Epic 30/55/15, then 1 point per level above 1 and per mark', () => {
    expect(craftOdds('none', 1, 0)).toEqual({ common: 10_000, rare: 0, epic: 0 });
    expect(craftOdds('rare', 1, 0)).toEqual({ common: 4_000, rare: 6_000, epic: 0 });
    expect(craftOdds('epic', 1, 0)).toEqual({ common: 1_500, rare: 5_500, epic: 3_000 });
    // Level 6 (5 points) and 4 marks: a 9% step up. Rare 60%: 40% Common x 9% rises, 60% Rare x 9% rises.
    expect(stepUpBp(6, 4)).toBe(900);
    expect(craftOdds('rare', 6, 4)).toEqual({ common: 3_640, rare: 5_820 + 0, epic: 540 });
    expect(craftOdds('epic', 6, 4)).toEqual({ common: 1_365, rare: 5_005 + 135, epic: 3_495 });
    // Marks stop at 10 and the chance at 100%.
    expect(stepUpBp(1, 25)).toBe(1_000);
    expect(stepUpBp(10, 10)).toBe(1_900);
    expect(RULES.gear.craft.marks.max).toBe(10);
  });

  it('draws the rarity from exactly the shown odds', () => {
    const rng = createSeededRng('odds');
    const n = 40_000;
    for (const [reach, level, marks] of [
      ['rare', 4, 3],
      ['epic', 7, 10],
    ] as const) {
      const count = { common: 0, rare: 0, epic: 0 };
      for (let i = 0; i < n; i++) {
        const { rarity } = rollCraftRarity(rng, reach, level, marks);
        count[rarity]++;
      }
      const odds = craftOdds(reach, level, marks);
      for (const key of ['common', 'rare', 'epic'] as const) {
        expect(Math.abs(count[key] / n - odds[key] / 10_000)).toBeLessThan(0.012);
      }
    }
  });

  it('draws the Reach odds, then the step up, and says whether the step up raised it', () => {
    // Draw 1 low: Common; draw 2 low: the step up happens.
    const script = (...values: number[]): Rng => {
      let i = 0;
      return { nextU32: () => values[i++] ?? 0 };
    };
    const first = rollCraftRarity(script(0, 0), 'rare', 6, 0);
    expect(first).toEqual({ rarity: 'rare', upgraded: true });
    const second = rollCraftRarity(script(HIGH, HIGH), 'rare', 6, 0);
    expect(second).toEqual({ rarity: 'rare', upgraded: false });
    // An Epic stays Epic.
    expect(rollCraftRarity(script(HIGH, 0), 'epic', 6, 0).rarity).toBe('epic');
  });

  it('a craft has the item level of the crafter and can be raised to a floor', () => {
    const made = rollCraftItem(createSeededRng('floor'), 'kelp-cap', 3, { floor: 'epic' });
    expect(made.item.rarity).toBe('epic');
    expect(made.item.itemLevel).toBe(6);
    // A craft started before gear v2 may carry the old Festival floor, which counts as Epic.
    expect(rollCraft(createSeededRng('floor'), 'kelp-cap', 3, { floor: 'festival' }).rarity).toBe(
      'epic',
    );
  });
});

describe('dismantling: ranges, rolls, bundles, time and XP', () => {
  it('shows each rarity its range, the scrap a share of the craft cost that grows with the item level', () => {
    expect(dismantleRange([{ baseId: 'trail-cap', rarity: 'common', itemLevel: 1 }])).toEqual({
      scrap: { min: 2, max: 3 },
      shards: { min: 0, max: 0, element: null },
      glimmer: { min: 0, max: 0 },
      essence: { min: 0, max: 0 },
    });
    expect(dismantleRange([{ baseId: 'kelp-cap', rarity: 'rare', itemLevel: 10 }])).toEqual({
      scrap: { min: 2, max: 3 },
      shards: { min: 1, max: 1, element: 'tide' },
      glimmer: { min: 0, max: 0 },
      essence: { min: 3, max: 8 },
    });
    expect(dismantleRange([{ baseId: 'wardens-bell', rarity: 'epic', itemLevel: 20 }])).toEqual({
      scrap: { min: 5, max: 6 },
      shards: { min: 1, max: 2, element: null },
      glimmer: { min: 0, max: 1 },
      essence: { min: 10, max: 25 },
    });
    // A Festival piece pays by its rarity, like any other base.
    expect(dismantleRange([{ baseId: 'festival-lantern-charm', rarity: 'epic' }]).essence).toEqual({
      min: 10,
      max: 25,
    });
    expect(
      dismantleRange([{ baseId: 'festival-lantern-charm', rarity: 'common' }]).essence,
    ).toEqual({ min: 0, max: 0 });
    // A bundle of Commons adds its items' ranges.
    const bundle = dismantleRange(
      Array.from({ length: 5 }, () => ({ baseId: 'trail-cap', rarity: 'common' as const })),
    );
    expect(bundle.scrap).toEqual({ min: 10, max: 15 });
  });

  it('does not depend on who dismantles: the range function has no Crafting level to take', () => {
    expect(dismantleRange.length).toBe(1);
    expect(rollDismantle.length).toBe(2);
  });

  it('rolls inside the range, integers only, a shard of the element or a random kind, and is repeatable from a seed', () => {
    const items = [
      { baseId: 'coal-warm-cap', rarity: 'epic' as const, itemLevel: 12 },
      { baseId: 'trail-cap', rarity: 'rare' as const, itemLevel: 7 },
    ];
    const range = dismantleRange(items);
    const seen = new Set<number>();
    const kinds = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const rolled = rollDismantle(createSeededRng(`d${String(i)}`), items);
      const scrap = rolled.parts.scrap ?? 0;
      seen.add(scrap);
      expect(scrap).toBeGreaterThanOrEqual(range.scrap.min);
      expect(scrap).toBeLessThanOrEqual(range.scrap.max);
      let shards = 0;
      for (const [kind, amount] of Object.entries(rolled.parts)) {
        expect(Number.isInteger(amount)).toBe(true);
        if (kind.endsWith('-shard')) {
          shards += amount;
          kinds.add(kind);
        }
      }
      expect(shards).toBeGreaterThanOrEqual(range.shards.min);
      expect(shards).toBeLessThanOrEqual(range.shards.max);
      expect(rolled.parts.glimmer ?? 0).toBeLessThanOrEqual(range.glimmer.max);
      expect(rolled.essence).toBeGreaterThanOrEqual(range.essence.min);
      expect(rolled.essence).toBeLessThanOrEqual(range.essence.max);
    }
    // Both ends of the scrap range come up, and the neutral hat's shard is any kind.
    expect(Math.min(...seen)).toBe(range.scrap.min);
    expect(Math.max(...seen)).toBe(range.scrap.max);
    expect(kinds.size).toBeGreaterThan(2);
    expect(rollDismantle(createSeededRng('same'), items)).toEqual(
      rollDismantle(createSeededRng('same'), items),
    );
    // Commons give no shards and no Essence.
    const commons = rollDismantle(
      createSeededRng('commons'),
      Array.from({ length: 5 }, () => ({ baseId: 'kelp-cap', rarity: 'common' as const })),
    );
    expect(commons.essence).toBe(0);
    expect(Object.keys(commons.parts)).toEqual(['scrap']);
  });

  it('bundles up to 5 Commons; a Rare, an Epic or a Festival piece goes alone', () => {
    expect(dismantleBundleError([])).toBe('empty');
    expect(dismantleBundleError(['common', 'common', 'common', 'common', 'common'])).toBeNull();
    expect(dismantleBundleError(Array(6).fill('common') as GearRarity[])).toBe('too_many');
    expect(dismantleBundleError(['rare'])).toBeNull();
    expect(dismantleBundleError(['epic'])).toBeNull();
    expect(dismantleBundleError(['common', 'rare'])).toBe('mixed');
    expect(dismantleBundleError(['rare', 'rare'])).toBe('mixed');
  });

  it('takes 15 minutes, 1 hour or 2 hours, and gives 12 XP an hour, at least 6', () => {
    expect([15, 60, 120]).toEqual(
      (['common', 'rare', 'epic'] as const).map((r) => dismantleHours(r) * 60),
    );
    expect(dismantleXp('common')).toBe(6);
    expect(dismantleXp('rare')).toBe(12);
    expect(dismantleXp('epic')).toBe(24);
    expect(dismantleXp('rare', 1_000)).toBe(13);
    // The skill and Busy paws shorten the time like any job.
    expect(jobDuration(1, 0, dismantleHours('epic'))).toBe(2 * 3_600_000);
    expect(jobDuration(2, 0, dismantleHours('common'))).toBe(Math.floor(900_000 * 0.97));
  });

  it('teaches a blueprint with 6% and 1 point per Crafting level of the worker', () => {
    expect(dismantleLearnBp(1)).toBe(700);
    expect(dismantleLearnBp(5)).toBe(1_100);
    expect(dismantleLearnBp(MAX_SKILL_LEVEL)).toBe(1_600);
    expect(dismantleLearnBp(99)).toBe(1_600);
  });
});

describe('the day modifiers hook (Market Day, built by the Boons step)', () => {
  it('adds to the one-step-up chance and changes nothing when absent', () => {
    expect(craftOdds('rare', 3, 0, {})).toEqual(craftOdds('rare', 3, 0));
    expect(stepUpBp(3, 2, { stepUpBonusBp: 500 })).toBe(stepUpBp(3, 2) + 500);
    expect(stepUpBp(10, 10, { stepUpBonusBp: 99_999 })).toBe(10_000);
    const plain = craftOdds('rare', 3, 0);
    const boosted = craftOdds('rare', 3, 0, { stepUpBonusBp: 500 });
    expect(boosted.epic).toBeGreaterThan(plain.epic);
    expect(boosted.common + boosted.rare + boosted.epic).toBe(10_000);
    const rolled = rollCraftItem(createSeededRng('m'), 'kelp-cap', 3, {
      reach: 'rare',
      mods: { stepUpBonusBp: 10_000 },
    });
    // A certain step up: Reach for Rare gives Rare (or Epic): never Common.
    expect(rolled.item.rarity).not.toBe('common');
  });

  it('can roll the top of every refund range', () => {
    const items = [{ baseId: 'coal-warm-cap', rarity: 'epic' as const, itemLevel: 12 }];
    const range = dismantleRange(items);
    const top = rollDismantle(createSeededRng('top'), items, { dismantleTopOfRange: true });
    expect(top.parts.scrap).toBe(range.scrap.max);
    expect(top.parts['ember-shard']).toBe(range.shards.max);
    expect(top.parts.glimmer).toBe(range.glimmer.max);
    expect(top.essence).toBe(range.essence.max);
  });
});
