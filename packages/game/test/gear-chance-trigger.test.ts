import { describe, expect, it } from 'vitest';
import {
  CHANCE_BONUS_BP,
  RULES,
  SPECIAL_GROUPS,
  craftCost,
  createSeededRng,
  gearBase,
  gearContent,
  gearLine,
  itemLines,
  itemOf,
  lineScore,
  linePool,
  loadGear,
  dismantleRange,
  rollDismantle,
  rollItem,
  rollTalent,
  rollTalentSecondLook,
  specialLinesOf,
  talentDef,
  talentScore,
  foldTalent,
  wornEffects,
  type DismantleItem,
  type GearItem,
  type GearRarity,
  type Element,
  type Rng,
  type Wearer,
} from '../src/index';
import basesJson from '../src/content/data/gear.json';
import legacyJson from '../src/content/data/gear-legacy.json';
import linesJson from '../src/content/data/gear-lines.json';
import setsJson from '../src/content/data/gear-sets.json';
import reactionsJson from '../src/content/data/reactions.json';

/**
 * Chance lines and trigger lines as gear content (docs/design/gear-and-creatures-v2.md 6.3 and 6.4): the
 * data, the one-special-line rule, the Epic and Festival bonus, the fold into the sheet and the rules, the
 * Equip best worth, and the two chance lines of the Workshop and the trips (Tinker's luck, Second look).
 * The fights themselves are in the engine's tests.
 */

const CHANCE_IDS = [
  'second-wind',
  'echo',
  'sidestep',
  'quick-remark',
  'steady-paws',
  'spill-over',
  'warm-heart',
  'tinkers-luck',
  'second-look',
];
const TRIGGER_IDS = [
  'payback',
  'kindling',
  'opening-mark',
  'rally-cry',
  'ember-tail',
  'storm-warning',
  'stubborn',
  'last-stand',
  'overflow',
  'second-breath',
  'patient',
  'shared-warmth',
];
const FIELD: Record<string, string> = {
  'second-wind': 'secondWindBp',
  echo: 'echoBp',
  sidestep: 'sidestepBp',
  'quick-remark': 'quickRemarkBp',
  'steady-paws': 'steadyPawsBp',
  'spill-over': 'spillOverBp',
  'warm-heart': 'warmHeartBp',
  payback: 'paybackBp',
  kindling: 'kindlingBp',
  'opening-mark': 'openingMark',
  'rally-cry': 'rallyCryBp',
  'ember-tail': 'emberTailBp',
  'storm-warning': 'stormWarningBp',
  stubborn: 'stubborn',
  'last-stand': 'lastStandBp',
  overflow: 'overflowBp',
  'second-breath': 'secondBreathBp',
  patient: 'patientBp',
  'shared-warmth': 'sharedWarmthBp',
};

const hat = (rarity: GearRarity, lines: [string, number][], level = 20): GearItem =>
  itemOf(
    'trail-cap',
    rarity,
    level,
    lines.map(([id, tier]) => ({ id, tier })),
  );
const charm = (rarity: GearRarity, lines: [string, number][], level = 20): GearItem =>
  itemOf(
    'trail-charm',
    rarity,
    level,
    lines.map(([id, tier]) => ({ id, tier })),
  );
const wearer: Wearer = { role: 'payoff', element: 'tide' };

describe('the content', () => {
  it('has the nine chance lines and twelve trigger lines of the design, in their groups', () => {
    for (const id of CHANCE_IDS) {
      const line = gearLine(id);
      expect(line, id).toBeDefined();
      expect(line?.group, id).toBe('chance');
      expect(line?.unit, id).toBe('chance');
      expect(line?.special, id).toBe(true);
    }
    for (const id of TRIGGER_IDS) {
      const line = gearLine(id);
      expect(line, id).toBeDefined();
      expect(line?.group, id).toBe('trigger');
      expect(line?.special, id).toBe(true);
    }
    expect(SPECIAL_GROUPS).toEqual(['position', 'chance', 'trigger']);
  });

  it('chance is 4, 6, 8, 10 and 12% at tiers I to V for every chance line', () => {
    for (const id of CHANCE_IDS) {
      expect(gearLine(id)?.values, id).toEqual([400, 600, 800, 1_000, 1_200]);
    }
    expect(CHANCE_BONUS_BP).toBe(200);
  });

  it('trigger lines carry the design numbers at tier V', () => {
    const v = (id: string) => (gearLine(id)?.values ?? [])[4];
    expect(v('payback')).toBe(3_000);
    expect(v('rally-cry')).toBe(1_500);
    expect(v('ember-tail')).toBe(2_000);
    expect(v('storm-warning')).toBe(3_000);
    expect(v('last-stand')).toBe(2_000);
    expect(v('overflow')).toBe(1_500);
    expect(v('second-breath')).toBe(1_000);
    expect(v('patient')).toBe(2_500);
    expect(v('shared-warmth')).toBe(300);
    // Kindling is a start-of-fight boost that works once, so it is bigger than a Support's every-round 15%.
    expect(v('kindling')).toBe(4_000);
  });

  it('Stubborn and Opening mark are single-value lines (no tiers), and Stubborn is an Epic from item level 12', () => {
    const stubborn = gearLine('stubborn');
    expect(stubborn).toMatchObject({ single: true, minRarity: 'epic', minItemLevel: 12 });
    expect(gearLine('opening-mark')).toMatchObject({ single: true, unit: 'once' });
  });

  it('they roll from Rare up (never on a Common) and about words fit the glossary', () => {
    for (const id of [...CHANCE_IDS, ...TRIGGER_IDS]) {
      const line = gearLine(id);
      expect(line?.minRarity, id).not.toBe('common');
      expect(line?.about.length, id).toBeLessThanOrEqual(80);
      for (const slot of ['hat', 'scarf', 'charm'] as const) {
        const rolls = linePool({ slot, tag: 'neutral' }, 'common', 20).some(
          (p) => p.line.id === id,
        );
        expect(rolls, `${id} on a common ${slot}`).toBe(false);
      }
    }
    // Stubborn is an Epic line only.
    expect(
      linePool({ slot: 'scarf', tag: 'neutral' }, 'rare', 20).some((p) => p.line.id === 'stubborn'),
    ).toBe(false);
    expect(
      linePool({ slot: 'scarf', tag: 'neutral' }, 'epic', 20).some((p) => p.line.id === 'stubborn'),
    ).toBe(true);
    expect(
      linePool({ slot: 'scarf', tag: 'neutral' }, 'epic', 11).some((p) => p.line.id === 'stubborn'),
    ).toBe(false);
  });

  it('the in-fight chance lines only fill their own sheet field and the two rules fill the trip rules', () => {
    for (const id of Object.keys(FIELD)) {
      const effect = gearLine(id)?.effect;
      expect(effect, id).toMatchObject({ kind: 'sheet', field: FIELD[id] });
    }
    expect(gearLine('tinkers-luck')?.effect).toEqual({ kind: 'rule', rule: 'tinkersLuck' });
    expect(gearLine('second-look')?.effect).toEqual({ kind: 'rule', rule: 'secondLook' });
  });

  it('refuses a chance line outside its group, a chance unit on another line and a chance above 100%', () => {
    const reactions = reactionsJson.map((r) => ({
      name: r.name,
      triggerElement: r.triggerElement as Element,
    }));
    const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
    const cases: [string, (l: Record<string, unknown>[]) => void][] = [
      [
        'a chance effect in the utility group',
        (l) =>
          ((l.find((x) => x['id'] === 'echo') as Record<string, unknown>)['group'] = 'utility'),
      ],
      [
        'a trigger effect in the chance group',
        (l) =>
          ((l.find((x) => x['id'] === 'payback') as Record<string, unknown>)['group'] = 'chance'),
      ],
      [
        'a chance line with another unit',
        (l) => ((l.find((x) => x['id'] === 'echo') as Record<string, unknown>)['unit'] = 'pct'),
      ],
      [
        'a chance unit on a trigger line',
        (l) =>
          ((l.find((x) => x['id'] === 'payback') as Record<string, unknown>)['unit'] = 'chance'),
      ],
      [
        'a chance above 100%',
        (l) =>
          ((l.find((x) => x['id'] === 'echo') as Record<string, unknown>)['values'] = [
            400, 600, 800, 1_000, 10_100,
          ]),
      ],
      [
        'a plain line in the trigger group',
        (l) =>
          ((l.find((x) => x['id'] === 'attack') as Record<string, unknown>)['group'] = 'trigger'),
      ],
    ];
    for (const [name, change] of cases) {
      const lines = clone(linesJson) as Record<string, unknown>[];
      change(lines);
      expect(() => loadGear(basesJson, lines, legacyJson, reactions, setsJson), name).toThrow(
        /Invalid gear/,
      );
    }
  });
});

describe('at most one special line per item (position, chance and trigger share the cap)', () => {
  it('no item rolls two of them, in thousands of rolls of every rarity and slot', () => {
    const rng = createSeededRng('one-special');
    const bases = gearContent.bases.filter((b) => b.festival !== true);
    let chance = 0;
    let trigger = 0;
    for (let i = 0; i < 6_000; i++) {
      const base = bases[i % bases.length];
      if (base === undefined) throw new Error('no base');
      const rarity: GearRarity = (['common', 'rare', 'epic'] as const)[i % 3] ?? 'epic';
      const rolled = rollItem(rng, { baseId: base.id, rarity, itemLevel: 12 + (i % 9) });
      expect(specialLinesOf(rolled.lines).length).toBeLessThanOrEqual(1);
      for (const l of rolled.lines) {
        const group = gearLine(l.id)?.group;
        if (group === 'chance') chance += 1;
        if (group === 'trigger') trigger += 1;
      }
    }
    // Not vacuous: both kinds do roll.
    expect(chance).toBeGreaterThan(100);
    expect(trigger).toBeGreaterThan(100);
  });

  it('a Common never has one of the two new kinds, and a Rare or Epic has one about a quarter of the time', () => {
    const rng = createSeededRng('rarity-share');
    const base = gearBase('trail-charm');
    expect(base).toBeDefined();
    const count = (rarity: GearRarity): number => {
      let n = 0;
      for (let i = 0; i < 2_000; i++) {
        const rolled = rollItem(rng, { baseId: 'trail-charm', rarity, itemLevel: 20 });
        if (rolled.lines.some((l) => ['chance', 'trigger'].includes(gearLine(l.id)?.group ?? '')))
          n += 1;
      }
      return n;
    };
    expect(count('common')).toBe(0);
    for (const rarity of ['rare', 'epic'] as const) {
      const share = count(rarity) / 2_000;
      expect(share, rarity).toBeGreaterThan(0.1);
      expect(share, rarity).toBeLessThan(0.45);
    }
  });
});

describe('Epic and Festival pieces: +2 points of chance', () => {
  it('a chance line is 2 points higher on an Epic than on a Rare, at the same tier', () => {
    const rare = itemLines(charm('rare', [['echo', 2]]));
    const epic = itemLines(charm('epic', [['echo', 2]]));
    expect(rare.find((l) => l.id === 'echo')?.value).toBe(800);
    expect(epic.find((l) => l.id === 'echo')?.value).toBe(1_000);
    expect(rare.find((l) => l.id === 'echo')?.text).toBe('Echo 8%');
    expect(epic.find((l) => l.id === 'echo')?.text).toBe('Echo 10%');
  });

  it('a Festival piece gets it at any rarity, and other lines never do', () => {
    const festival = itemOf('festival-lantern-cap', 'rare', 20, [{ id: 'echo', tier: 4 }]);
    expect(itemLines(festival).find((l) => l.id === 'echo')?.value).toBe(1_400);
    const trigger = itemLines(charm('epic', [['payback', 4]]));
    expect(trigger.find((l) => l.id === 'payback')?.value).toBe(3_000);
    const rule = itemLines(charm('epic', [['tinkers-luck', 4]]));
    expect(rule.find((l) => l.id === 'tinkers-luck')?.value).toBe(1_400);
  });

  it('the folded chance carries the bonus, and two items of the same line stay under 100%', () => {
    const fx = wornEffects(wearer, [charm('epic', [['echo', 4]])]);
    expect(fx.mods.echoBp).toBe(1_400);
    const both = wornEffects(wearer, [hat('epic', [['echo', 4]]), charm('epic', [['echo', 4]])]);
    expect(both.mods.echoBp).toBe(2_800);
    const many = wornEffects(wearer, [
      itemOf('festival-lantern-cap', 'epic', 20, [{ id: 'echo', tier: 4 }]),
      ...Array.from({ length: 2 }, () => charm('epic', [['echo', 4]])),
    ]);
    expect(many.mods.echoBp).toBeLessThanOrEqual(10_000);
  });
});

describe('the fold', () => {
  it('every chance and trigger line folds into its own sheet field at every tier', () => {
    for (const [id, plain] of Object.entries(FIELD)) {
      // With dodge on (the shipped rules) Sidestep folds into flat area dodge instead of its own chance.
      const field = id === 'sidestep' && RULES.combat.dodge.enabled ? 'areaDodgeBp' : plain;
      const line = gearLine(id);
      if (line === undefined) throw new Error(id);
      for (let tier = 0; tier < 5; tier++) {
        const fx = wornEffects(wearer, [charm('rare', [[id, tier]])]);
        const sheet = fx.mods as Record<string, number | undefined>;
        const value = line.single ? 1 : (line.values[tier] as number);
        expect(sheet[field], `${id} tier ${String(tier + 1)}`).toBe(value);
        expect(Object.keys(sheet), id).toEqual([field]);
        expect(fx.idle, id).toEqual([]);
      }
    }
  });

  it('the two rules fill the trip rules and nothing on the sheet', () => {
    const fx = wornEffects(wearer, [
      charm('rare', [['tinkers-luck', 2]]),
      hat('rare', [['second-look', 4]]),
    ]);
    expect(fx.rules.tinkersLuckBp).toBe(800);
    expect(fx.rules.secondLookBp).toBe(1_200);
    expect(Object.keys(fx.mods)).toEqual([]);
    expect(
      wornEffects(wearer, [
        charm('epic', [['tinkers-luck', 4]]),
        charm('epic', [['tinkers-luck', 4]]),
      ]).rules.tinkersLuckBp,
    ).toBe(2_800);
  });

  it('the sums are clamped to what the engine accepts', () => {
    const many = Array.from({ length: 3 }, () =>
      itemOf('festival-lantern-cap', 'epic', 20, [{ id: 'echo', tier: 4 }]),
    );
    expect(wornEffects(wearer, many).mods.echoBp).toBeLessThanOrEqual(10_000);
    const storm = Array.from({ length: 4 }, () => charm('rare', [['storm-warning', 4]]));
    expect(wornEffects(wearer, storm).mods.stormWarningBp).toBe(10_000);
  });
});

describe('Equip best does not over-value them', () => {
  it('a tier V line is worth under 4% of the wearer power, and under what a 5 pt crit chance is', () => {
    const power = 100 * 100 + 1_000 * 10;
    const crit = lineScore(gearLine('crit-chance') as never, 500, wearer, power);
    for (const id of [...CHANCE_IDS, ...TRIGGER_IDS]) {
      const line = gearLine(id);
      if (line === undefined) throw new Error(id);
      const value = line.single ? 1 : line.values[4] + (line.unit === 'chance' ? 200 : 0);
      const all = { role: 'guard', element: 'tide' } as const;
      for (const w of [wearer, all]) {
        const score = lineScore(line, value, w, power);
        expect(score, id).toBeLessThanOrEqual(Math.floor(power * 0.04));
        expect(score, id).toBeLessThanOrEqual(crit + 1);
      }
    }
  });

  it('they are worth something (a line with a worth of 0 would never be chosen)', () => {
    for (const id of [...CHANCE_IDS, ...TRIGGER_IDS])
      expect(gearLine(id)?.worth, id).toBeGreaterThan(0);
  });
});

/** A counting RNG, to check how many dice a roll draws. */
function counting(seed: string): { rng: Rng; count: () => number } {
  const inner = createSeededRng(seed);
  let n = 0;
  return {
    rng: {
      nextU32: () => {
        n += 1;
        return inner.nextU32();
      },
    },
    count: () => n,
  };
}

describe("Tinker's luck: a dismantle can refund the full craft cost", () => {
  const items = (): DismantleItem[] => [
    { baseId: 'kelp-cap', rarity: 'rare', itemLevel: 20 },
    { baseId: 'trail-cap', rarity: 'rare', itemLevel: 20 },
  ];

  it('without the line it is exactly the old roll (same draws, same refund)', () => {
    const a = counting('tinker');
    const without = rollDismantle(a.rng, items());
    const b = counting('tinker');
    const zero = rollDismantle(b.rng, items(), {}, 0);
    expect(zero).toEqual(without);
    expect(b.count()).toBe(a.count());
    expect(without).not.toHaveProperty('tinkered');
  });

  it('with the line it rolls one more die for each item, after the item other draws', () => {
    const a = counting('tinker');
    rollDismantle(a.rng, items(), {}, 0);
    const b = counting('tinker');
    rollDismantle(b.rng, items(), {}, 5_000);
    expect(b.count() - a.count()).toBeGreaterThanOrEqual(2);
    expect(b.count() - a.count()).toBeLessThanOrEqual(4);
  });

  it('a sure chance gives each item at least its full craft cost, and never less than the ranges rolled', () => {
    const list = items();
    const range = dismantleRange(list);
    // The costs of both items together.
    const cost: Record<string, number> = {};
    for (const item of list) {
      for (const [kind, n] of Object.entries(craftCost(item.baseId, item.itemLevel ?? 1))) {
        cost[kind] = (cost[kind] ?? 0) + n;
      }
    }
    for (let i = 0; i < 40; i++) {
      const out = rollDismantle(createSeededRng(`t-${String(i)}`), list, {}, 10_000);
      expect(out.tinkered).toBe(2);
      expect(out.parts.scrap ?? 0).toBeGreaterThanOrEqual(cost['scrap'] ?? 0);
      expect(out.parts['tide-shard'] ?? 0).toBeGreaterThanOrEqual(cost['tide-shard'] ?? 0);
      // The refund is the craft cost or what the ranges gave, whichever is more: never under the range.
      expect(out.parts.scrap ?? 0).toBeGreaterThanOrEqual(range.scrap.min);
      // Glimmer and Essence come from the ranges, not the craft cost.
      expect(out.essence).toBeGreaterThanOrEqual(range.essence.min);
      expect(out.essence).toBeLessThanOrEqual(range.essence.max);
      expect(out.parts.glimmer ?? 0).toBeLessThanOrEqual(range.glimmer.max);
    }
    // And it is more than the plain refund ever is at the same item level (the ranges are under half the cost).
    const plain = rollDismantle(createSeededRng('t-0'), list, { dismantleTopOfRange: true });
    expect(plain.parts.scrap ?? 0).toBeLessThan(cost['scrap'] ?? 0);
  });

  it('the craft cost is the plain craft: scrap by item level, and one shard of the item element', () => {
    expect(craftCost('kelp-cap', 20)).toEqual({
      scrap: RULES.gear.craft.scrap + Math.floor(20 / RULES.gear.craft.scrapPerItemLevels),
      'tide-shard': RULES.gear.craft.shard,
    });
    expect(Object.keys(craftCost('trail-cap', 20))).toEqual(['scrap']);
  });

  it('about the chance: a 50% line refunds about half the items in full', () => {
    const list = Array.from({ length: 5 }, () => items()[0] as DismantleItem);
    let tinkered = 0;
    for (let i = 0; i < 200; i++) {
      tinkered +=
        rollDismantle(createSeededRng(`half-${String(i)}`), list, {}, 5_000).tinkered ?? 0;
    }
    expect(tinkered / (200 * 5)).toBeGreaterThan(0.4);
    expect(tinkered / (200 * 5)).toBeLessThan(0.6);
  });
});

describe('Second look: a duplicate talent rolls twice and the better stays', () => {
  const line = 'cindle';
  // A Cindle line creature: Ember Payoff.
  const cindle: Wearer & { stats: { atk: number; hp: number } } = {
    role: 'payoff',
    element: 'ember',
    stats: { atk: 80, hp: 300 },
  };

  it('without the line it is exactly rollTalent (same dice, same talent)', () => {
    for (let i = 0; i < 30; i++) {
      const a = counting(`sl-${String(i)}`);
      const plain = rollTalent(a.rng, line);
      const b = counting(`sl-${String(i)}`);
      const out = rollTalentSecondLook(b.rng, line, 0, cindle);
      expect(out.roll).toEqual(plain);
      expect(out).toMatchObject({ looked: false, kept: 'first', other: null });
      expect(b.count()).toBe(a.count());
    }
  });

  it('with a sure chance it rolls twice and keeps the one worth more to the creature', () => {
    const score = (r: { talentId: string; golden: boolean }) => {
      const def = talentDef(r.talentId);
      return def === undefined ? 0 : talentScore(foldTalent(def, r.golden), cindle);
    };
    let second = 0;
    for (let i = 0; i < 80; i++) {
      const out = rollTalentSecondLook(createSeededRng(`keep-${String(i)}`), line, 10_000, cindle);
      expect(out.looked).toBe(true);
      expect(out.other).not.toBeNull();
      const other = out.other as { talentId: string; golden: boolean };
      expect(score(out.roll)).toBeGreaterThanOrEqual(score(other));
      if (out.kept === 'second') {
        second += 1;
        expect(score(out.roll)).toBeGreaterThan(score(other));
      }
    }
    // Both outcomes happen (a better second roll, and a first roll that stays).
    expect(second).toBeGreaterThan(5);
    expect(second).toBeLessThan(75);
  });

  it('is better on average than one roll, and a tie keeps the first roll', () => {
    const mean = (bp: number): number => {
      let total = 0;
      for (let i = 0; i < 300; i++) {
        const out = rollTalentSecondLook(createSeededRng(`mean-${String(i)}`), line, bp, cindle);
        const def = talentDef(out.roll.talentId);
        total += def === undefined ? 0 : talentScore(foldTalent(def, out.roll.golden), cindle);
      }
      return total / 300;
    };
    expect(mean(10_000)).toBeGreaterThan(mean(0));
    // Two rolls that score the same (a creature with nothing to gain): the first roll stays.
    const none = { role: 'support', element: 'tide', stats: { atk: 0, hp: 0 } } as const;
    for (let i = 0; i < 20; i++) {
      const first = rollTalent(createSeededRng(`tie-${String(i)}`), line);
      const out = rollTalentSecondLook(createSeededRng(`tie-${String(i)}`), line, 10_000, none);
      expect(out.kept).toBe('first');
      expect(out.roll).toEqual(first);
    }
  });

  it('the chance die is rolled only when the line is worn, after the first roll', () => {
    const a = counting('draws');
    rollTalent(a.rng, line);
    const b = counting('draws');
    rollTalentSecondLook(b.rng, line, 1, cindle);
    // One extra die for the chance (and two more only if it hit).
    expect([a.count() + 1, a.count() + 3]).toContain(b.count());
  });
});
