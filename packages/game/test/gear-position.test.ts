import { describe, expect, it } from 'vitest';
import {
  SPECIAL_GROUPS,
  applyGear,
  createSeededRng,
  gearContent,
  gearLine,
  itemOf,
  itemScore,
  linePool,
  placeRow,
  rollCraftItem,
  rollDismantle,
  rollItem,
  rollLines,
  specialLinesOf,
  wornEffects,
  type CritBonus,
  type Element,
  type FoldKit,
  type GearBase,
  type GearItem,
  type Placement,
  type RowLayout,
  type RowMember,
  type Role,
  type Stats,
  type Wearer,
  type Zone,
} from '../src/index';

/**
 * Position lines (docs/design/gear-and-creatures-v2.md, 6.1): folded when the fight input is built, from the
 * creature's row and neighbours, so the engine only sees numbers; at most one special line per item.
 */

const STATS: Stats = { hp: 1_000, atk: 100, spd: 10 };
const TIER_V = 4;

/** An item at item level 20 with rolled lines at the given tiers (0 is tier I). */
function item(
  baseId: string,
  lines: [string, number][],
  rarity: 'common' | 'rare' | 'epic' = 'epic',
): GearItem {
  return itemOf(
    baseId,
    rarity,
    20,
    lines.map(([id, tier]) => ({ id, tier })),
  );
}
const hatWith = (id: string, tier = TIER_V) => item('trail-cap', [[id, tier]], 'common');

const wearer = (element: Element, role: Role = 'payoff'): Wearer => ({ element, role });
const place = (p: Partial<Placement> = {}): Placement => ({
  index: 1,
  length: 3,
  zone: 'middle',
  beside: [],
  rowElements: [],
  lanternHpBp: 0,
  rowShieldWall: 0,
  ...p,
});
const fold = (id: string, w: Wearer, p: Placement | undefined, tier = TIER_V) =>
  wornEffects({ ...w, placement: p }, [hatWith(id, tier)]);

const POSITION_IDS = [
  'shoulder-to-shoulder',
  'odd-one-out',
  'edge-walker',
  'heart-of-the-row',
  'front-liner',
  'back-row-patience',
  'lantern-bearer',
  'four-winds',
  'sheltered',
  'beside-the-mark-maker',
];

describe('the position lines content', () => {
  it('has the lines of the design (and Guard shadow) in the special group, at the spec tier V numbers', () => {
    for (const id of [...POSITION_IDS, 'guards-shadow']) {
      const line = gearLine(id);
      expect(line, id).toBeDefined();
      expect(line?.group, id).toBe('position');
      expect(line?.special, id).toBe(true);
    }
    expect(SPECIAL_GROUPS).toEqual(['position', 'chance', 'trigger']);
    const v = (id: string) => (gearLine(id)?.values ?? [])[4];
    expect(v('shoulder-to-shoulder')).toBe(500);
    expect(v('odd-one-out')).toBe(1_000);
    expect(v('edge-walker')).toBe(1_000);
    expect(v('heart-of-the-row')).toBe(1_200);
    expect(v('front-liner')).toBe(1_000);
    expect(v('back-row-patience')).toBe(400);
    expect(v('lantern-bearer')).toBe(600);
    expect(v('four-winds')).toBe(1_000);
    expect(v('sheltered')).toBe(600);
    expect(v('beside-the-mark-maker')).toBe(1_000);
    // The special lines are the position lines and (since 2026-10-18) the chance and trigger lines.
    expect(
      gearContent.lines
        .filter((l) => l.special && l.group === 'position')
        .map((l) => l.id)
        .sort(),
    ).toEqual([...POSITION_IDS, 'guards-shadow'].sort());
    for (const l of gearContent.lines.filter((x) => x.special)) {
      expect(['position', 'chance', 'trigger']).toContain(l.group);
    }
  });

  it('rolls in the slots the design leans them to, and every tier grows', () => {
    for (const id of POSITION_IDS) {
      const line = gearLine(id);
      const w = line?.weights;
      expect((w?.hat ?? 0) + (w?.scarf ?? 0) + (w?.charm ?? 0), id).toBeGreaterThan(0);
      const values: readonly number[] = line?.values ?? [];
      for (let i = 1; i < 5; i++) expect(values[i], id).toBeGreaterThan(values[i - 1] as number);
    }
    // A Front row line is for Scarves and Charms, a Back row one for Hats and Charms.
    expect(gearLine('front-liner')?.weights.hat).toBe(0);
    expect(gearLine('back-row-patience')?.weights.scarf).toBe(0);
  });

  it('reads naturally in an item card: the name and its number', () => {
    const lines = itemLinesOf(hatWith('shoulder-to-shoulder'));
    expect(lines).toEqual(['Shoulder to shoulder +5%']);
    expect(itemLinesOf(hatWith('front-liner'))).toEqual(['Front-liner −10%']);
    expect(itemLinesOf(hatWith('back-row-patience'))).toEqual(['Back-row patience +4 pt']);
    expect(itemLinesOf(hatWith('sheltered'))).toEqual(['Sheltered +6 pt']);
  });
});

function itemLinesOf(it: GearItem): string[] {
  // The text a card shows for each rolled line (no base line on a Hat).
  return it.lines.map((l) => {
    const line = gearLine(l.id);
    const value = (line?.values ?? [])[l.tier] ?? 0;
    const sign = line?.reduction === true ? '−' : '+';
    const number = line?.unit === 'pt' ? `${sign}${value / 100} pt` : `${sign}${value / 100}%`;
    return `${line?.name ?? ''} ${number}`;
  });
}

describe('at most one special line per item', () => {
  const only: Pick<GearBase, 'slot' | 'tag' | 'stats' | 'pool'> = {
    slot: 'hat',
    tag: 'neutral',
    stats: [
      { stat: 'atk', value: 2 },
      { stat: 'hp', value: 4 },
    ],
    pool: ['edge-walker', 'odd-one-out', 'shoulder-to-shoulder', 'guards-shadow'],
  };

  it('draws a second line from the ordinary lines once a special one is in', () => {
    // A pool of specials only: an Epic wants three lines and gets the one.
    for (let i = 0; i < 30; i++) {
      const lines = rollLines(createSeededRng(`only-${String(i)}`), only, 'epic', 20);
      expect(lines).toHaveLength(1);
      expect(specialLinesOf(lines)).toHaveLength(1);
    }
    // A pool with ordinary lines too: the special one is followed by ordinary ones only.
    const mixed = {
      ...only,
      pool: [...(only.pool ?? []), 'attack-local-pct', 'hp-local-flat', 'crit-damage'],
    };
    for (let i = 0; i < 200; i++) {
      const lines = rollLines(createSeededRng(`mixed-${String(i)}`), mixed, 'epic', 20);
      expect(specialLinesOf(lines).length).toBeLessThanOrEqual(1);
      expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
    }
  });

  it('holds for every roll of every base, rarity and level, and does not shorten items that roll one', () => {
    let withSpecial = 0;
    let rolled = 0;
    for (let i = 0; i < 3_000; i++) {
      const rng = createSeededRng(`rolls-${String(i)}`);
      const base = gearContent.bases[i % gearContent.bases.length];
      if (base === undefined) continue;
      const rarity = (['common', 'rare', 'epic'] as const)[i % 3] as 'common' | 'rare' | 'epic';
      const level = 1 + (i % 20);
      const made = rollItem(rng, { baseId: base.id, rarity, itemLevel: level });
      const specials = specialLinesOf(made.lines);
      expect(specials.length, base.id).toBeLessThanOrEqual(1);
      rolled++;
      if (specials.length === 1) withSpecial++;
      // An item still has as many lines as its rarity gives (the pool is never run dry here).
      const want = { common: 1, rare: 2, epic: 3 }[rarity];
      expect(made.lines.length, `${base.id} ${rarity}`).toBe(
        Math.min(want, linePool(base, rarity, level).length),
      );
    }
    // Specials do roll: a good share of items has one.
    expect(withSpecial / rolled).toBeGreaterThan(0.1);
  });

  it('holds on the crafting path, with and without a Reach for an Epic', () => {
    for (let i = 0; i < 400; i++) {
      const rng = createSeededRng(`craft-${String(i)}`);
      for (const reach of ['none', 'rare', 'epic'] as const) {
        const { item: made } = rollCraftItem(rng, 'trail-charm', 10, { reach });
        expect(specialLinesOf(made.lines).length).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is the one place lines are chosen: a dismantle and a fold never add a line', () => {
    const made = rollItem(createSeededRng('d'), {
      baseId: 'trail-cap',
      rarity: 'epic',
      itemLevel: 20,
    });
    expect(rollDismantle(createSeededRng('x'), [made]).parts).toBeDefined();
    expect(specialLinesOf(made.lines).length).toBeLessThanOrEqual(1);
  });
});

describe('folding each position line', () => {
  const tide = wearer('tide');

  it('without a placement (a card, "Equip best") a position line adds nothing and is not idle', () => {
    for (const id of POSITION_IDS.filter((x) => x !== 'beside-the-mark-maker')) {
      const fx = fold(id, tide, undefined);
      expect(fx.atkBp + fx.hpBp + fx.critChanceBp, id).toBe(0);
      expect(fx.mods, id).toEqual({});
      expect(fx.idle, id).toEqual([]);
    }
  });

  it('Shoulder to shoulder: Attack for each neighbour of its element, at most two', () => {
    const at = (beside: Element[]) => fold('shoulder-to-shoulder', tide, place({ beside })).atkBp;
    expect(at([])).toBe(0);
    expect(at(['ember', 'grove'])).toBe(0);
    expect(at(['tide'])).toBe(500);
    expect(at(['tide', 'ember'])).toBe(500);
    expect(at(['tide', 'tide'])).toBe(1_000);
    // A row never has more than two neighbours, but the rule caps at two anyway.
    expect(at(['tide', 'tide', 'tide'])).toBe(1_000);
  });

  it('Odd one out: Attack when nobody beside it shares its element', () => {
    const at = (beside: Element[]) => fold('odd-one-out', tide, place({ beside })).atkBp;
    expect(at(['ember', 'grove'])).toBe(1_000);
    expect(at(['ember'])).toBe(1_000);
    expect(at(['ember', 'tide'])).toBe(0);
    // Alone in its row nobody shares its element.
    expect(at([])).toBe(1_000);
  });

  it('Edge-walker: Attack at either end of its row, once, and also alone in a row', () => {
    const at = (index: number, length: number) =>
      fold('edge-walker', tide, place({ index, length })).atkBp;
    expect(at(0, 3)).toBe(1_000);
    expect(at(2, 3)).toBe(1_000);
    expect(at(1, 3)).toBe(0);
    expect(at(0, 1)).toBe(1_000);
    expect(at(0, 5)).toBe(1_000);
    expect(at(4, 5)).toBe(1_000);
    expect(at(2, 5)).toBe(0);
  });

  it('Heart of the row: HP in the middle of its row, never at an end', () => {
    const at = (index: number, length: number) =>
      fold('heart-of-the-row', tide, place({ index, length })).hpBp;
    expect(at(1, 3)).toBe(1_200);
    expect(at(0, 3)).toBe(0);
    expect(at(2, 3)).toBe(0);
    expect(at(1, 5)).toBe(1_200);
    expect(at(3, 5)).toBe(1_200);
    // A row of one or two has no middle.
    expect(at(0, 1)).toBe(0);
    expect(at(0, 2)).toBe(0);
    expect(at(1, 2)).toBe(0);
  });

  it('Front-liner: less damage taken from every hit in the Front row only', () => {
    const at = (zone: Zone) => fold('front-liner', tide, place({ zone })).mods.takenBp;
    expect(at('front')).toBe(1_000);
    expect(at('middle')).toBeUndefined();
    expect(at('back')).toBeUndefined();
  });

  it('Back-row patience: crit chance in the Back row only', () => {
    const at = (zone: Zone) => fold('back-row-patience', tide, place({ zone })).critChanceBp;
    expect(at('back')).toBe(400);
    expect(at('front')).toBe(0);
    expect(at('middle')).toBe(0);
  });

  it('Four winds: the reaction bonus of its element when its row holds four different elements', () => {
    const four: Element[] = ['tide', 'ember', 'grove', 'spark', 'tide'];
    expect(fold('four-winds', tide, place({ rowElements: four })).mods.reactionBp).toEqual({
      steam: 1_000,
    });
    expect(
      fold('four-winds', wearer('spark'), place({ rowElements: four })).mods.reactionBp,
    ).toEqual({ overload: 1_000 });
    expect(
      fold('four-winds', tide, place({ rowElements: ['tide', 'ember', 'grove', 'tide'] })).mods
        .reactionBp,
    ).toBeUndefined();
  });

  it('Sheltered: more cover from a Guard, wherever it stands', () => {
    expect(fold('sheltered', tide, place()).mods.shelterBp).toBe(600);
    expect(fold('sheltered', tide, place(), 0).mods.shelterBp).toBe(100);
  });

  it('Beside the mark-maker: damage while a Setter stands beside it, a fold for the engine', () => {
    const fx = wornEffects(tide, [hatWith('beside-the-mark-maker')]);
    expect(fx.mods.besideRoleBp).toEqual({ setter: 1_000 });
    // Guard's shadow is the Guard version.
    expect(wornEffects(tide, [hatWith('guards-shadow')]).mods.besideRoleBp).toEqual({
      guard: 1_700,
    });
  });

  it('Lantern bearer gives nothing to its own wearer', () => {
    const fx = fold('lantern-bearer', tide, place());
    expect(fx.hpBp).toBe(0);
    expect(fx.mods).toEqual({});
  });

  it('applyGear folds a position line into Attack the way an Attunement is: a share of the creature, then the items', () => {
    const folded = applyGear(STATS, undefined, { ...tide, placement: place({ index: 0 }) }, [
      hatWith('edge-walker'),
    ]);
    // 100 x 1.10 = 110, plus the Trail Cap's own 2 Attack.
    expect(folded.stats.atk).toBe(112);
    expect(applyGear(STATS, undefined, tide, [hatWith('edge-walker')]).stats.atk).toBe(102);
  });
});

/** A kit of a creature of an element and role with these worn items. */
function kit(element: Element, role: Role, items: GearItem[]): FoldKit {
  const crit: CritBonus | undefined = undefined;
  return { stats: STATS, crit, wearer: { element, role }, items, talents: [] };
}
const member = (element: Element, role: Role, items?: GearItem[]): RowMember => ({
  element,
  ...(items === undefined ? {} : { kit: kit(element, role, items) }),
});

/** The raid's row of nine as three zones of three, and the dungeon's line of three. */
const RAID: RowLayout = {
  rows: [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
  ],
  zones: ['front', 'front', 'front', 'middle', 'middle', 'middle', 'back', 'back', 'back'],
};
const LINE: RowLayout = { rows: [[0, 1, 2]], zones: ['front', 'middle', 'back'] };

describe('folding a row (the raid and the dungeon)', () => {
  it('leaves every creature without position gear exactly as it was', () => {
    const row = Array.from({ length: 9 }, () =>
      member('tide', 'payoff', [hatWith('guards-shadow')]),
    );
    expect(placeRow(row, RAID).every((x) => x === undefined)).toBe(true);
    expect(placeRow([member('tide', 'payoff')], LINE).every((x) => x === undefined)).toBe(true);
  });

  it('the raid: neighbours stop at the zone edge and Front and Back are the zones', () => {
    const items = (id: string) => [hatWith(id)];
    // Shoulder to shoulder at slot 2 (the end of Front): its only neighbour is slot 1, not slot 3.
    const row: RowMember[] = Array.from({ length: 9 }, () => member('ember', 'payoff', []));
    row[2] = member('tide', 'payoff', items('shoulder-to-shoulder'));
    row[1] = member('tide', 'payoff', []);
    row[3] = member('tide', 'payoff', []);
    const placed = placeRow(row, RAID);
    // 100 x 1.05 = 105 + the cap's 2.
    expect(placed[2]?.stats.atk).toBe(107);
    // Edge-walker at slot 2: the end of its row (Front), so yes; at slot 4: the middle of Middle, so no.
    row[2] = member('tide', 'payoff', items('edge-walker'));
    row[4] = member('tide', 'payoff', items('edge-walker'));
    const edge = placeRow(row, RAID);
    expect(edge[2]?.stats.atk).toBe(112);
    expect(edge[4]?.stats.atk).toBe(102);
    // Front-liner: Front only. Back-row patience: Back only.
    row[0] = member('tide', 'guard', items('front-liner'));
    row[3] = member('tide', 'guard', items('front-liner'));
    row[6] = member('tide', 'payoff', items('back-row-patience'));
    row[0] = member('tide', 'guard', items('front-liner'));
    const zones = placeRow(row, RAID);
    expect(zones[0]?.mods?.takenBp).toBe(1_000);
    expect(zones[3]?.mods?.takenBp).toBeUndefined();
    expect(zones[6]?.crit?.chanceBp).toBe(400);
  });

  it('the dungeon: one row, each slot beside the next, the ends are the two ends', () => {
    const items = (id: string) => [hatWith(id)];
    const edge = placeRow(
      [
        member('tide', 'payoff', items('edge-walker')),
        member('tide', 'payoff', items('edge-walker')),
        member('tide', 'payoff', items('edge-walker')),
      ],
      LINE,
    );
    expect(edge.map((x) => x?.stats.atk)).toEqual([112, 102, 112]);
    const heart = placeRow(
      [
        member('tide', 'guard', items('heart-of-the-row')),
        member('tide', 'guard', items('heart-of-the-row')),
        member('tide', 'guard', items('heart-of-the-row')),
      ],
      LINE,
    );
    // 1000 x 1.12 = 1120 plus the Trail Cap's 4 HP, for the middle one only.
    expect(heart.map((x) => x?.stats.hp)).toEqual([1_004, 1_124, 1_004]);
    const same = placeRow(
      [
        member('tide', 'payoff', items('shoulder-to-shoulder')),
        member('tide', 'payoff', items('shoulder-to-shoulder')),
        member('ember', 'payoff', []),
      ],
      LINE,
    );
    // The left one has one Tide neighbour, the middle one one Tide and one Ember neighbour.
    expect(same.map((x) => x?.stats.atk)).toEqual([107, 107, undefined]);
    const odd = placeRow(
      [
        member('ember', 'payoff', []),
        member('tide', 'payoff', items('odd-one-out')),
        member('grove', 'payoff', []),
      ],
      LINE,
    );
    expect(odd[1]?.stats.atk).toBe(112);
  });

  it('Lantern bearer raises the HP of the creatures beside it, even ones that wear nothing', () => {
    const row = [
      member('tide', 'guard', []),
      member('ember', 'support', [hatWith('lantern-bearer')]),
      member('grove', 'payoff', []),
    ];
    const placed = placeRow(row, LINE);
    // 1000 x 1.06 = 1060 for both neighbours; the bearer itself gains nothing.
    expect(placed[0]?.stats.hp).toBe(1_060);
    expect(placed[2]?.stats.hp).toBe(1_060);
    expect(placed[1]?.stats.hp).toBe(1_004); // its own Trail Cap's HP only
    // Two bearers beside one creature add up; a creature in another raid row is not beside.
    const raid: RowMember[] = Array.from({ length: 9 }, () => member('tide', 'payoff', []));
    raid[0] = member('tide', 'support', [hatWith('lantern-bearer')]);
    raid[2] = member('tide', 'support', [hatWith('lantern-bearer')]);
    raid[3] = member('tide', 'support', [hatWith('lantern-bearer')]);
    const rows = placeRow(raid, RAID);
    expect(rows[1]?.stats.hp).toBe(1_120);
    expect(rows[4]?.stats.hp).toBe(1_060);
    expect(rows[5]).toBeUndefined();
    // A guest (no kit) beside it is a neighbour that changes nothing.
    const guest = placeRow(
      [{ element: 'tide' }, member('ember', 'support', [hatWith('lantern-bearer')])],
      LINE,
    );
    expect(guest[0]).toBeUndefined();
  });

  it('Lantern Night: the Guards of the wearer row have Shield Walls that last one more round', () => {
    const night = (
      ['festival-lantern-cap', 'festival-hearth-scarf', 'festival-lantern-charm'] as const
    ).map((id) => itemOf(id, 'common', 10, []));
    const row: RowMember[] = Array.from({ length: 9 }, () => member('tide', 'payoff', []));
    row[0] = member('ember', 'support', night);
    row[1] = member('grove', 'guard', []);
    row[2] = member('tide', 'payoff', []);
    row[4] = member('grove', 'guard', []);
    const placed = placeRow(row, RAID);
    // The Guard in the same row gets a round; the support and payoff do not need one; the other row's Guard neither.
    expect(placed[1]?.mods?.lingerRounds).toBe(1);
    expect(placed[2]).toBeUndefined();
    expect(placed[4]).toBeUndefined();
    // Two wearers in a row do not stack.
    row[2] = member('ember', 'support', night);
    expect(placeRow(row, RAID)[1]?.mods?.lingerRounds).toBe(1);
    // Two pieces are not enough.
    row[0] = member('ember', 'support', night.slice(0, 2));
    row[2] = member('tide', 'payoff', []);
    expect(placeRow(row, RAID)[1]).toBeUndefined();
  });

  it('adds to a Guard Lingering line and stops at three rounds', () => {
    const night = (
      ['festival-lantern-cap', 'festival-hearth-scarf', 'festival-lantern-charm'] as const
    ).map((id) => itemOf(id, 'common', 10, []));
    const lingering = item('wardens-bell', [['lingering', 0]]);
    const row = [member('ember', 'support', night), member('grove', 'guard', [lingering])];
    const placed = placeRow(row, LINE);
    expect(placed[1]?.mods?.lingerRounds).toBe(2);
  });
});

describe('what Equip best sees', () => {
  it('counts a position line at its worth, as it counts Guard shadow (it cannot see the row)', () => {
    const w = { ...wearer('tide'), stats: { atk: 100, hp: 1_000 } };
    const edge = itemScore(hatWith('edge-walker'), w);
    const plain = itemScore(itemOf('trail-cap', 'common', 20, []), w);
    expect(edge).toBeGreaterThan(plain);
    expect(itemScore(hatWith('lantern-bearer'), w)).toBeGreaterThan(plain);
  });
});
