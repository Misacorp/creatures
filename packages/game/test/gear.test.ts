import { describe, expect, it } from 'vitest';
import {
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
  festivalItemLevel,
  finaleDropOddsBp,
  finaleItemLevel,
  formatBp,
  gearBase,
  gearContent,
  gearLine,
  itemLines,
  itemOf,
  itemScore,
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
  return reactionsJson as { name: string; triggerElement: 'tide' | 'ember' | 'grove' | 'spark' }[];
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
    expect(gearContent.bases).toHaveLength(22);
  });

  it('expands the element lines into 16 lines and keeps every line weighted somewhere (but the glow)', () => {
    for (const family of ['attunement', 'hunter', 'reaction', 'ward']) {
      for (const element of ELEMENTS) expect(gearLine(`${element}-${family}`)).toBeDefined();
    }
    expect(gearLine('wildfire-bonus')).toBeUndefined();
    expect(gearLine('ember-reaction')?.name).toBe('Wildfire bonus');
    expect(gearLine('tide-hunter')?.name).toBe('Tide Hunter');
    for (const line of gearContent.lines) {
      const w = line.weights;
      if (line.effect.kind !== 'glow') expect(w.hat + w.scarf + w.charm).toBeGreaterThan(0);
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
          (b) => ((b[0] as { implicit: { line: string } }).implicit.line = 'nope'),
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
      expect(() => loadGear(bases, lines, legacyJson, reactions), name).toThrow(/Invalid gear/);
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
      ),
    ).toThrow(/Invalid gear/);
    expect(() =>
      loadGear(
        bases.filter((b) => b.tag !== 'guard'),
        linesJson,
        legacyJson,
        reactions,
      ),
    ).toThrow(/guard Charm/);
    expect(() =>
      loadGear(
        bases.filter((b) => !(b.slot === 'hat' && b.tag === 'tide')),
        linesJson,
        legacyJson,
        reactions,
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
  it('rolls 1 / 2 / 3 lines by rarity and 2 for a Festival piece, never the same line twice', () => {
    const rng = createSeededRng('lines');
    const expected: Record<GearRarity, number> = { common: 1, rare: 2, epic: 3, festival: 2 };
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
    const festival = gearContent.bases.find((b) => b.festival === true);
    expect(
      rollItem(rng, { baseId: festival?.id ?? '', rarity: 'festival', itemLevel: 18 }).lines,
    ).toHaveLength(2);
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
      linePool({ slot, tag: 'neutral' }, 'epic', 20).find((p) => p.line.id === id)?.weight ?? 0;
    expect(weight('hat', 'attack')).toBeGreaterThan(weight('scarf', 'attack'));
    expect(weight('scarf', 'hp')).toBeGreaterThan(weight('hat', 'hp'));
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

  it('refuses unknown bases and rarities the base cannot have', () => {
    const rng = createSeededRng('bad');
    expect(() => rollItem(rng, { baseId: 'nope', rarity: 'common', itemLevel: 1 })).toThrow(
      RangeError,
    );
    expect(() => rollItem(rng, { baseId: 'kelp-cap', rarity: 'festival', itemLevel: 1 })).toThrow(
      RangeError,
    );
    expect(() =>
      rollItem(rng, { baseId: 'festival-hearth-scarf', rarity: 'epic', itemLevel: 1 }),
    ).toThrow(RangeError);
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
  it('lists the base line first, then the Festival glow, then the rolled lines with tiers', () => {
    const lines = itemLines(
      item('festival-lantern-charm', 'festival', 18, [
        ['ember-reaction', 3],
        ['spark-share', 2],
      ]),
    );
    expect(lines.map((l) => l.source)).toEqual(['base', 'fixed', 'rolled', 'rolled']);
    expect(lines[0]?.text).toBe('Tide Attunement +5%');
    expect(lines[1]?.text).toBe('Festival glow +4%');
    expect(lines[2]?.text).toBe('Wildfire bonus +18%');
    expect(lines[2]?.tier).toBe(4);
    expect(lines[2]?.bestTier).toBe(4);
    expect(lines[3]?.tier).toBe(3);
  });

  it('shows the example Coal-Warm Cap numbers of the spec', () => {
    const cap = item('coal-warm-cap', 'epic', 20, [
      ['ember-reaction', 4],
      ['crit-damage', 3],
      ['attack', 3],
    ]);
    expect(itemLines(cap).map((l) => l.text)).toEqual([
      'Attack +6%',
      'Wildfire bonus +24%',
      'Crit damage +27 pt',
      'Attack +8%',
    ]);
  });

  it('writes reductions with a minus and once-only lines without a number or tier', () => {
    const scarf = item('seafoam-scarf', 'epic', 15, [
      ['unbothered', 0],
      ['area-ward', 3],
      ['brace', 2],
    ]);
    const lines = itemLines(scarf);
    expect(lines.map((l) => l.text)).toEqual([
      'HP +7%',
      'Unbothered',
      'Area ward −9%',
      'Brace −14%',
    ]);
    expect(lines[1]?.tier).toBeNull();
    expect(lines[2]?.bestTier).toBe(4);
  });

  it('formats basis points without trailing zeros', () => {
    expect(formatBp(150)).toBe('1.5');
    expect(formatBp(300)).toBe('3');
    expect(formatBp(50)).toBe('0.5');
    expect(formatBp(5)).toBe('0.05');
  });

  it('has the spec base values per item level band', () => {
    const at = (id: string, level: number) => itemLines(item(id, 'common', level))[0]?.text;
    expect(at('trail-cap', 1)).toBe('Attack +2%');
    expect(at('trail-cap', 20)).toBe('Attack +6%');
    expect(at('patch-scarf', 15)).toBe('HP +7%');
    expect(at('trail-charm', 10)).toBe('Attack +2%');
    expect(at('crossroads-compass', 20)).toBe('Trail XP +8%');
    expect(at('wardens-bell', 20)).toBe('Armor +4 pt');
    expect(at('hearth-bell', 15)).toBe('Boost +3 pt');
    expect(at('footprint-charm', 10)).toBe('Marking hit +6%');
    expect(at('pounce-charm', 20)).toBe("Payoff's pounce +5%");
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

  it('raises Attack and HP by percent, then flat, and never touches speed', () => {
    const out = applyGear(STATS, undefined, payoff, [
      item('trail-cap', 'rare', 20, [['sturdy-blow', 4]]),
      item('patch-scarf', 'rare', 20, [['thick-coat', 4]]),
    ]);
    // Attack +6% base, +12 flat; HP +8% base, +75 flat.
    expect(out.stats).toEqual({
      atk: Math.floor((50 * 10_600) / 10_000) + 12,
      hp: Math.floor((200 * 10_800) / 10_000) + 75,
      spd: 40,
    });
    expect(out.mods).toBeUndefined();
  });

  it('adds an Attunement only for a wearer of its element', () => {
    const cinder = item('cinder-charm', 'common', 20);
    expect(applyGear(STATS, undefined, payoff, [cinder]).stats.atk).toBe(
      Math.floor((50 * 10_600) / 10_000),
    );
    expect(applyGear(STATS, undefined, guard, [cinder]).stats.atk).toBe(50);
    expect(wornEffects(guard, [cinder]).idle).toEqual(['ember-attunement']);
  });

  it('adds the Festival glow to Attack and HP', () => {
    const lantern = item('festival-lantern-charm', 'festival', 20);
    const fx = wornEffects({ role: 'payoff', element: 'tide' }, [lantern]);
    expect(fx.atkBp).toBe(600 + 500);
    expect(fx.hpBp).toBe(500);
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
    expect(fx.mods.wardBp).toEqual({ spark: 1_700, tide: 400 });
    expect(fx.mods.reactionBp).toEqual({ wildfire: 2_400 });
    expect(fx.mods.besideRoleBp).toEqual({ guard: 1_700 });
    expect(fx.mods.chargedBp).toBe(2_500);
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
    const attack = item('trail-cap', 'rare', 20, [['attack', 4]]);
    const bell = item('wardens-bell', 'rare', 20, [['armor', 4]]);
    expect(itemScore(attack, w)).toBeGreaterThan(itemScore(bell, w));
    expect(itemScore(bell, { ...w, role: 'guard' })).toBeGreaterThan(itemScore(bell, w));
  });

  it('scores a better tier higher, and an Attunement of the wrong element as base only', () => {
    const w = { role: 'payoff', element: 'ember', stats: { atk: 60, hp: 300 } } as const;
    const low = item('trail-cap', 'common', 20, [['attack', 1]]);
    const high = item('trail-cap', 'common', 20, [['attack', 4]]);
    expect(itemScore(high, w)).toBeGreaterThan(itemScore(low, w));
    const tide = item('tidepool-charm', 'common', 20);
    const ember = item('cinder-charm', 'common', 20);
    expect(itemScore(ember, w)).toBeGreaterThan(itemScore(tide, w));
    expect(itemScore(tide, w)).toBe(0);
  });

  it('puts the best wearable item on a creature, one per slot, and takes nothing it cannot wear', () => {
    const creature = wearerOf('c1', 'payoff', 'ember', 12);
    const weak = { id: 'i1', item: item('trail-cap', 'common', 5) };
    const strong = { id: 'i2', item: item('coal-warm-cap', 'epic', 10, [['attack', 2]]) };
    const tooHigh = { id: 'i3', item: item('coal-warm-cap', 'epic', 13, [['attack', 2]]) };
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
    const best = { id: 'i1', item: item('coal-warm-cap', 'epic', 10, [['attack', 2]]) };
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
      ['attack', 4],
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
        ['attack', 4],
        ['ember-attunement', 4],
      ]),
    };
    const groveHat = {
      id: 'h2',
      item: item('acorn-cap', 'rare', 20, [
        ['attack', 4],
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
          ['attack', 4],
          ['crit-damage', 4],
        ]),
      },
      { id: 'h2', item: item('acorn-cap', 'rare', 20, [['attack', 2]]) },
      {
        id: 's1',
        item: item('leafknit-scarf', 'epic', 20, [
          ['hp', 4],
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
    expect(festivalItemLevel(1)).toBe(6);
    expect(festivalItemLevel(30)).toBe(20);
    expect([8, 18, 29, 38].map((d) => dungeonItemLevel(d, false))).toEqual([5, 10, 15, 20]);
    expect(dungeonItemLevel(7, true)).toBe(7);
    expect(dungeonItemLevel(60, true)).toBe(20);
    expect([3, 6, 10].map(expeditionItemLevel)).toEqual([6, 12, 20]);
    expect([5, 8, 10].map(craftItemLevel)).toEqual([10, 16, 20]);
    expect(craftItemLevel(1)).toBe(2);
  });

  it('converts to the higher of 3 + Boss Rank and the best depth drop level, at most 12', () => {
    expect(convertedItemLevel(1, 0)).toBe(4);
    expect(convertedItemLevel(5, 0)).toBe(8);
    expect(convertedItemLevel(1, 12)).toBe(7);
    expect(convertedItemLevel(2, 18)).toBe(10);
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
      expect(piece.rarity).not.toBe('festival');
    }
  });

  it('about 1 Charm in 20 of a finale is role-locked, and only Charms are', () => {
    const rng = createSeededRng('rolecharm');
    let charms = 0;
    let locked = 0;
    for (let i = 0; i < 30_000; i++) {
      const base = dropBase(rng, 'tide', { roleCharm: true });
      if (base.slot === 'charm') {
        charms++;
        if (['setter', 'payoff', 'support', 'guard'].includes(base.tag)) locked++;
      } else {
        expect(base.tag).toBe('tide');
      }
    }
    expect(locked / charms).toBeGreaterThan(0.04);
    expect(locked / charms).toBeLessThan(0.06);
    // Without the option no Charm is ever locked.
    for (let i = 0; i < 2_000; i++) {
      expect(['tide']).toContain(dropBase(rng, 'tide').tag);
    }
    expect(dropBase(rng, null).tag).toBe('neutral');
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

  it('blueprints are craftable bases only: no Festival piece and no role-locked Charm', () => {
    const rng = createSeededRng('bp');
    for (let i = 0; i < 300; i++) {
      const base = gearBase(rollBlueprint(rng));
      expect(base?.festival).not.toBe(true);
      expect(['setter', 'payoff', 'support', 'guard']).not.toContain(base?.tag);
    }
  });

  it('a Festival piece is of the creature element, Festival rarity, item level 5 + rank', () => {
    const rng = createSeededRng('fest');
    const lantern = rollFestivalItem(rng, 'tide', 8);
    expect(lantern.baseId).toBe('festival-lantern-charm');
    expect(lantern.rarity).toBe('festival');
    expect(lantern.itemLevel).toBe(13);
    expect(lantern.lines).toHaveLength(2);
    expect(rollFestivalItem(rng, 'ember', 1).baseId).toBe('festival-hearth-scarf');
    // An element with no Festival piece of its own still gets one.
    expect(gearBase(rollFestivalItem(rng, 'grove', 1).baseId)?.festival).toBe(true);
  });

  it('a dungeon piece has the room boss element and a level by depth, landmark bonus included', () => {
    const rng = createSeededRng('dungeon');
    const plain = rollDungeonItem(rng, 'rare', 18, false, 'grove');
    expect(plain.itemLevel).toBe(10);
    expect(['grove']).toContain(plain.tag);
    expect(rollDungeonItem(rng, 'common', 7, true, 'spark').itemLevel).toBe(7);
  });

  it('an expedition find has the place element and twice the explorer rank; the Crossroads gives the Compass', () => {
    const rng = createSeededRng('trip');
    const find = rollExpeditionItem(rng, 'rare', { element: 'tide', crossroads: false }, 6);
    expect(find.itemLevel).toBe(12);
    expect(find.tag).toBe('tide');
    const compass = rollExpeditionItem(rng, 'epic', { element: null, crossroads: true }, 10);
    expect(compass.baseId).toBe('crossroads-compass');
    expect(compass.itemLevel).toBe(20);
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
      expect(Object.keys(craftCost(kit.blueprint))).toEqual(['scrap']);
      expect(RULES.gear.drops.welcomeScrap).toBeGreaterThanOrEqual(
        craftCost(kit.blueprint).scrap ?? 0,
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
  it('crafting costs 6 scrap and a shard of the element, or 8 scrap for a neutral or explorer base', () => {
    expect(craftCost('kelp-cap')).toEqual({ scrap: 6, 'tide-shard': 1 });
    expect(craftCost('cinder-charm')).toEqual({ scrap: 6, 'ember-shard': 1 });
    expect(craftCost('trail-cap')).toEqual({ scrap: 8 });
    expect(craftCost('crossroads-compass')).toEqual({ scrap: 8 });
    expect(() => craftCost('nope')).toThrow(RangeError);
  });

  it('the fallback yield is the bottom of the range: scrap, a shard of the element tag, glimmer; nothing negative or fractional', () => {
    expect(dismantleYield({ baseId: 'trail-cap', rarity: 'common' })).toEqual({ scrap: 2 });
    expect(dismantleYield({ baseId: 'kelp-cap', rarity: 'rare' })).toEqual({
      scrap: 4,
      'tide-shard': 1,
    });
    expect(dismantleYield({ baseId: 'coal-warm-cap', rarity: 'epic' })).toEqual({
      scrap: 8,
      'ember-shard': 1,
    });
    // Every full 5 item levels add 1 scrap.
    expect(dismantleYield({ baseId: 'coal-warm-cap', rarity: 'epic', itemLevel: 20 })).toEqual({
      scrap: 12,
      'ember-shard': 1,
    });
    // Neutral, explorer and role pieces give no shard when nothing is rolled.
    expect(dismantleYield({ baseId: 'wardens-bell', rarity: 'epic' })).toEqual({ scrap: 8 });
    for (const base of gearContent.bases) {
      for (const rarity of ['common', 'rare', 'epic', 'festival'] as const) {
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

  it('asks a Crafting level, Essence, shards and glimmer for a Reach, and a longer job', () => {
    expect([reachMinLevel('none'), reachMinLevel('rare'), reachMinLevel('epic')]).toEqual([
      1, 3, 6,
    ]);
    expect([craftHours('none'), craftHours('rare'), craftHours('epic')]).toEqual([3, 6, 10]);
    // An element base pays the shards of its element.
    expect(craftCostFor('kelp-cap', 'none', {})).toEqual({
      parts: { scrap: 6, 'tide-shard': 1 },
      essence: 0,
    });
    expect(craftCostFor('kelp-cap', 'rare', {})).toEqual({
      parts: { scrap: 6, 'tide-shard': 2 },
      essence: 25,
    });
    expect(craftCostFor('kelp-cap', 'epic', {})).toEqual({
      parts: { scrap: 6, 'tide-shard': 3, glimmer: 1 },
      essence: 70,
    });
    // Other bases take the extra shards from the biggest piles, scrap only for the plain part.
    expect(
      craftCostFor('trail-cap', 'epic', { 'ember-shard': 1, 'grove-shard': 5, 'spark-shard': 4 }),
    ).toEqual({ parts: { scrap: 8, 'grove-shard': 2, glimmer: 1 }, essence: 70 });
    expect(craftCostFor('trail-cap', 'epic', { 'grove-shard': 1, 'spark-shard': 1 })).toEqual({
      parts: { scrap: 8, 'grove-shard': 1, 'spark-shard': 1, glimmer: 1 },
      essence: 70,
    });
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
        count[rarity as 'common' | 'rare' | 'epic']++;
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
    expect(rollCraft(createSeededRng('floor'), 'kelp-cap', 3, { floor: 'festival' }).rarity).toBe(
      'epic',
    );
  });
});

describe('dismantling: ranges, rolls, bundles, time and XP', () => {
  it('shows each rarity its range, 1 scrap more at both ends for every full 5 item levels', () => {
    expect(dismantleRange([{ baseId: 'trail-cap', rarity: 'common', itemLevel: 1 }])).toEqual({
      scrap: { min: 2, max: 4 },
      shards: { min: 0, max: 0, element: null },
      glimmer: { min: 0, max: 0 },
      essence: { min: 0, max: 0 },
    });
    expect(dismantleRange([{ baseId: 'kelp-cap', rarity: 'rare', itemLevel: 10 }])).toEqual({
      scrap: { min: 6, max: 10 },
      shards: { min: 1, max: 1, element: 'tide' },
      glimmer: { min: 0, max: 0 },
      essence: { min: 3, max: 8 },
    });
    expect(dismantleRange([{ baseId: 'wardens-bell', rarity: 'epic', itemLevel: 20 }])).toEqual({
      scrap: { min: 12, max: 18 },
      shards: { min: 1, max: 2, element: null },
      glimmer: { min: 0, max: 1 },
      essence: { min: 10, max: 25 },
    });
    // A Festival piece pays like an Epic.
    expect(
      dismantleRange([{ baseId: 'festival-lantern-charm', rarity: 'festival' }]).essence,
    ).toEqual({ min: 10, max: 25 });
    // A bundle of Commons adds its items' ranges.
    const bundle = dismantleRange(
      Array.from({ length: 5 }, () => ({ baseId: 'trail-cap', rarity: 'common' as const })),
    );
    expect(bundle.scrap).toEqual({ min: 10, max: 20 });
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
    expect(dismantleBundleError(['festival'])).toBeNull();
    expect(dismantleBundleError(['common', 'rare'])).toBe('mixed');
    expect(dismantleBundleError(['rare', 'rare'])).toBe('mixed');
  });

  it('takes 15 minutes, 1 hour or 2 hours, and gives 12 XP an hour, at least 6', () => {
    expect([15, 60, 120, 120]).toEqual(
      (['common', 'rare', 'epic', 'festival'] as const).map((r) => dismantleHours(r) * 60),
    );
    expect(dismantleXp('common')).toBe(6);
    expect(dismantleXp('rare')).toBe(12);
    expect(dismantleXp('epic')).toBe(24);
    expect(dismantleXp('festival')).toBe(24);
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
