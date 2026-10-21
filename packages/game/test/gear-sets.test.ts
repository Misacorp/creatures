import { describe, expect, it } from 'vitest';
import {
  applyGear,
  baseFor,
  baseMinLevel,
  basesFor,
  blueprintBases,
  craftLevelNeeded,
  craftable,
  createSeededRng,
  dropBase,
  eligibleBases,
  gearBase,
  gearContent,
  gearSet,
  itemOf,
  loadGear,
  rollBlueprint,
  rollExpeditionItem,
  rollFinaleReward,
  setCounts,
  setPieces,
  wearBlock,
  wornEffects,
  type GearItem,
  type GearRarity,
  type Role,
  type Stats,
  type Wearer,
} from '../src/index';
import basesJson from '../src/content/data/gear.json';
import legacyJson from '../src/content/data/gear-legacy.json';
import linesJson from '../src/content/data/gear-lines.json';
import setsJson from '../src/content/data/gear-sets.json';
import reactionsJson from '../src/content/data/reactions.json';

/**
 * Gear sets (docs/design/gear-and-creatures-v2.md, 6.2): three named pieces sharing a tag; the pieces one
 * creature wears are counted; two pieces give plain lines, three a named effect that the fold turns into
 * numbers on the modifier sheet or the trip rules.
 */

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const STATS: Stats = { hp: 1_000, atk: 100, spd: 10 };
const reactions = reactionsJson as {
  name: string;
  triggerElement: 'tide' | 'ember' | 'grove' | 'spark';
}[];

/** One piece of a set at an item level, with no rolled lines (so only the set speaks). */
function piece(setId: string, slot: 'hat' | 'scarf' | 'charm', rarity: GearRarity = 'common') {
  const base = setPieces(setId).find((b) => b.slot === slot);
  if (base === undefined) throw new Error(`no ${slot} in ${setId}`);
  return itemOf(base.id, rarity, Math.max(12, baseMinLevel(base)), []);
}
const wearing = (setId: string, count: number): GearItem[] =>
  (['hat', 'scarf', 'charm'] as const).slice(0, count).map((slot) => piece(setId, slot));

const WEARER: Record<string, Wearer> = {
  'tidepool-finery': { role: 'payoff', element: 'tide' },
  'forge-warm-kit': { role: 'payoff', element: 'ember' },
  'hollow-weave': { role: 'payoff', element: 'grove' },
  'ridge-copper': { role: 'payoff', element: 'spark' },
  'wardens-watch': { role: 'guard', element: 'grove' },
  'hearth-helpers': { role: 'support', element: 'ember' },
  'first-footprints': { role: 'setter', element: 'tide' },
  'pounce-set': { role: 'payoff', element: 'ember' },
  'crossroads-wanderer': { role: 'setter', element: 'tide' },
  'lantern-night': { role: 'guard', element: 'ember' },
};

describe('the gear sets content', () => {
  it('has the ten sets of the design, each with one Hat, one Scarf and one Charm', () => {
    expect(gearContent.sets.map((s) => s.id)).toEqual([
      'tidepool-finery',
      'forge-warm-kit',
      'hollow-weave',
      'ridge-copper',
      'wardens-watch',
      'hearth-helpers',
      'first-footprints',
      'pounce-set',
      'crossroads-wanderer',
      'lantern-night',
    ]);
    for (const set of gearContent.sets) {
      const pieces = setPieces(set.id);
      expect(
        pieces.map((p) => p.slot),
        set.id,
      ).toEqual(['hat', 'scarf', 'charm']);
      expect(gearSet(set.id)).toBe(set);
    }
    // 27 new bases for the nine plain sets, plus the Festival Lantern Cap for Lantern Night.
    expect(
      gearContent.bases.filter((b) => b.set !== undefined && b.festival !== true),
    ).toHaveLength(27);
    expect(setPieces('lantern-night').every((b) => b.festival === true)).toBe(true);
  });

  it('gives a set piece the stats of the fine (item level 10) base of its slot and tag, and unlocks it at 12', () => {
    for (const set of gearContent.sets.filter((s) => s.tag !== 'festival')) {
      const tag = ['tide', 'ember', 'grove', 'spark'].includes(set.tag) ? set.tag : 'neutral';
      for (const p of setPieces(set.id)) {
        expect(baseMinLevel(p), p.id).toBe(12);
        expect(p.tag).toBe(set.tag);
        const plain = basesFor(p.slot, tag as never).find((b) => baseMinLevel(b) === 10);
        if (p.slot === 'charm') {
          const first = baseFor('charm', set.tag as never);
          expect(p.implicit, p.id).toEqual(first?.implicit);
        } else {
          expect(p.stats, p.id).toEqual(plain?.stats);
        }
      }
    }
  });

  it('keeps set pieces out of the plain bases of a slot and tag, so a conversion or the welcome kit never picks one', () => {
    for (const tag of ['neutral', 'tide', 'ember', 'grove', 'spark'] as const) {
      for (const slot of ['hat', 'scarf', 'charm'] as const) {
        expect(basesFor(slot, tag).every((b) => b.set === undefined)).toBe(true);
        expect(eligibleBases(slot, tag, 20).every((b) => b.set === undefined)).toBe(true);
      }
    }
    // A drop does see them, from item level 12.
    expect(eligibleBases('hat', 'tide', 11, false, true).some((b) => b.set !== undefined)).toBe(
      false,
    );
    expect(eligibleBases('hat', 'tide', 12, false, true).some((b) => b.set !== undefined)).toBe(
      true,
    );
  });

  it('locks the pieces of a role set to that role, Hat and Scarf included', () => {
    for (const set of gearContent.sets.filter((s) =>
      ['guard', 'support', 'setter', 'payoff'].includes(s.tag),
    )) {
      for (const p of setPieces(set.id)) {
        const other = (['guard', 'support', 'setter', 'payoff'] as Role[]).find(
          (r) => r !== set.tag,
        ) as Role;
        expect(
          wearBlock({ slot: p.slot, tag: p.tag, itemLevel: 12 }, { level: 20, role: other }),
        ).toEqual({
          reason: 'role',
          role: set.tag,
        });
        expect(
          wearBlock(
            { slot: p.slot, tag: p.tag, itemLevel: 12 },
            { level: 20, role: set.tag as Role },
          ),
        ).toBeNull();
      }
    }
    // Any creature can wear an element, explorer or Festival set.
    for (const id of ['tidepool-finery', 'crossroads-wanderer', 'lantern-night']) {
      for (const p of setPieces(id)) {
        expect(
          wearBlock({ slot: p.slot, tag: p.tag, itemLevel: 1 }, { level: 20, role: 'guard' }),
        ).toBeNull();
      }
    }
  });

  it('rejects broken set content', () => {
    const cases: [string, (b: Record<string, unknown>[], s: Record<string, unknown>[]) => void][] =
      [
        [
          'a set with no Charm',
          (b) =>
            b.splice(
              b.findIndex((x) => x['id'] === 'tidepool-locket'),
              1,
            ),
        ],
        [
          'a piece of another tag',
          (b) =>
            ((b.find((x) => x['id'] === 'tidepool-cowl') as Record<string, unknown>)['tag'] =
              'ember'),
        ],
        [
          'a base in an unknown set',
          (b) =>
            ((b.find((x) => x['id'] === 'trail-cap') as Record<string, unknown>)['set'] = 'nope'),
        ],
        [
          'a duplicate set id',
          (_, s) => ((s[1] as Record<string, unknown>)['id'] = 'tidepool-finery'),
        ],
        [
          'a bonus line that does not exist',
          (_, s) =>
            ((s[0] as { two: { lines: { line: string }[] } }).two.lines[0] = {
              line: 'nope',
              value: 1,
            } as never),
        ],
        [
          'a bonus that is an item-only line',
          (_, s) =>
            ((s[0] as { two: { lines: { line: string }[] } }).two.lines[0] = {
              line: 'attack-local-pct',
              value: 100,
            } as never),
        ],
        [
          'an effect the fold does not know',
          (_, s) => ((s[0] as { three: { effect: string } }).three.effect = 'nope'),
        ],
        [
          'a Festival set with a plain piece',
          (b) =>
            ((b.find((x) => x['id'] === 'festival-lantern-cap') as Record<string, unknown>)[
              'festival'
            ] = false),
        ],
        [
          'a Hat locked to a role without a set',
          (b) =>
            ((b.find((x) => x['id'] === 'trail-cap') as Record<string, unknown>)['tag'] = 'guard'),
        ],
      ];
    for (const [name, change] of cases) {
      const bases = clone(basesJson) as Record<string, unknown>[];
      const sets = clone(setsJson) as Record<string, unknown>[];
      change(bases, sets);
      expect(() => loadGear(bases, linesJson, legacyJson, reactions, sets), name).toThrow(
        /Invalid gear/,
      );
    }
    expect(() => loadGear(basesJson, linesJson, legacyJson, reactions, [])).toThrow(/Invalid gear/);
  });
});

describe('counting the pieces a creature wears', () => {
  it('counts one piece per slot of a set, and sets apart', () => {
    expect(setCounts([])).toEqual(new Map());
    expect(setCounts(wearing('tidepool-finery', 2)).get('tidepool-finery')).toBe(2);
    const mixed = [
      piece('tidepool-finery', 'hat'),
      piece('forge-warm-kit', 'scarf'),
      piece('tidepool-finery', 'charm'),
    ];
    expect(setCounts(mixed)).toEqual(
      new Map([
        ['tidepool-finery', 2],
        ['forge-warm-kit', 1],
      ]),
    );
    // A plain item is in no set.
    expect(setCounts([itemOf('trail-cap', 'common', 1, [])]).size).toBe(0);
    // A second piece in the same slot (never worn together) counts once.
    expect(
      setCounts([piece('tidepool-finery', 'hat'), piece('tidepool-finery', 'hat')]).get(
        'tidepool-finery',
      ),
    ).toBe(1);
  });
});

describe('the two-piece bonuses', () => {
  const sheet = (id: string, count: number) =>
    wornEffects(WEARER[id] as Wearer, wearing(id, count));

  it('Tidepool Finery: Steam +8%; Forge-Warm: Wildfire and Flare +8% (Ember sets off both)', () => {
    expect(sheet('tidepool-finery', 1).mods.reactionBp).toBeUndefined();
    expect(sheet('tidepool-finery', 2).mods.reactionBp).toEqual({ steam: 800 });
    expect(sheet('forge-warm-kit', 2).mods.reactionBp).toEqual({ wildfire: 800, flare: 800 });
  });

  it('Hollow Weave: HP +8% of the creature (global, so it never multiplies an item stat)', () => {
    const pieces = wearing('hollow-weave', 2);
    const two = wornEffects(WEARER['hollow-weave'] as Wearer, pieces);
    expect(two.hpBp).toBe(800);
    const folded = applyGear(STATS, undefined, WEARER['hollow-weave'] as Wearer, pieces).stats;
    // 1000 x 1.08 = 1080, then the pieces' own HP (the Cap 67, the Shawl is not worn at two: Hat and Scarf).
    expect(folded.hp).toBe(1_080 + two.hpItem);
  });

  it('Ridge Copper: crit chance +2 pt (on top of the pieces own crit chance)', () => {
    const none = wornEffects(WEARER['ridge-copper'] as Wearer, wearing('ridge-copper', 1));
    const two = wornEffects(WEARER['ridge-copper'] as Wearer, wearing('ridge-copper', 2));
    expect(two.critChanceBp - none.critChanceBp).toBe(200 + 200);
  });

  it("Warden's Watch, Hearth Helpers, First Footprints and the Pounce Set: Armor, Boost, Marking hit, pounce", () => {
    expect(sheet('wardens-watch', 2).mods.armorBp).toBe(400);
    expect(sheet('hearth-helpers', 2).mods.boostBp).toBe(300);
    expect(sheet('first-footprints', 2).mods.markingHitBp).toBe(800);
    expect(sheet('pounce-set', 2).mods.pounceBp).toBe(500);
  });

  it('a set bonus that does nothing for the wearer adds nothing and marks no item line idle', () => {
    // Armor is a Guard line: a Support wearing two Warden pieces cannot (they are role-locked), but the fold is safe.
    const fx = wornEffects({ role: 'support', element: 'ember' }, wearing('wardens-watch', 2));
    expect(fx.mods.armorBp).toBeUndefined();
    expect(fx.idle).toEqual([]);
  });

  it('Crossroads Wanderer: trips take 4% less time; Lantern Night: Attack and HP +3%', () => {
    const base = wornEffects(
      WEARER['crossroads-wanderer'] as Wearer,
      wearing('crossroads-wanderer', 1),
    );
    const two = wornEffects(
      WEARER['crossroads-wanderer'] as Wearer,
      wearing('crossroads-wanderer', 2),
    );
    expect(two.rules.quickFeetBp - base.rules.quickFeetBp).toBe(400);
    const lantern = wornEffects(WEARER['lantern-night'] as Wearer, wearing('lantern-night', 2));
    expect(lantern.atkBp).toBe(300);
    expect(lantern.hpBp).toBe(300);
  });
});

describe('the three-piece effects', () => {
  const three = (id: string, wearer: Wearer = WEARER[id] as Wearer) =>
    wornEffects(wearer, wearing(id, 3));

  it('fill the sheet only at three pieces', () => {
    expect(three('tidepool-finery').mods.unreflected).toBe(1);
    expect(
      wornEffects(WEARER['tidepool-finery'] as Wearer, wearing('tidepool-finery', 2)).mods
        .unreflected,
    ).toBeUndefined();
    expect(three('forge-warm-kit').mods.critWindowBp).toBe(2_000);
    expect(three('hollow-weave').mods.healOnReactionBp).toBe(300);
    expect(three('ridge-copper').mods.chainMark).toBe(1);
    expect(three('wardens-watch').mods.coverReach).toBe(1);
    expect(three('hearth-helpers').mods.boostReach).toBe(1);
    expect(three('first-footprints').mods.sealMark).toBe(1);
    expect(three('pounce-set').mods.firstReactionCrit).toBe(1);
  });

  it('works only for the element whose reaction it names', () => {
    // Steam is cashed by Tide wearers: an Ember wearer of the set gets the two-piece line but not the effect.
    expect(
      three('tidepool-finery', { role: 'payoff', element: 'ember' }).mods.unreflected,
    ).toBeUndefined();
    expect(
      three('forge-warm-kit', { role: 'payoff', element: 'tide' }).mods.critWindowBp,
    ).toBeUndefined();
    expect(
      three('hollow-weave', { role: 'payoff', element: 'tide' }).mods.healOnReactionBp,
    ).toBeUndefined();
    expect(
      three('ridge-copper', { role: 'payoff', element: 'tide' }).mods.chainMark,
    ).toBeUndefined();
    // Reach is for the role that has a cover or a boost.
    expect(
      three('wardens-watch', { role: 'support', element: 'ember' }).mods.coverReach,
    ).toBeUndefined();
    expect(
      three('hearth-helpers', { role: 'guard', element: 'grove' }).mods.boostReach,
    ).toBeUndefined();
  });

  it('Crossroads Wanderer adds a catch roll to 24 hour trips', () => {
    expect(three('crossroads-wanderer').rules.dayTripRolls).toBe(1);
    expect(
      wornEffects(WEARER['crossroads-wanderer'] as Wearer, wearing('crossroads-wanderer', 2)).rules
        .dayTripRolls,
    ).toBe(0);
  });

  it('Lantern Night gives nothing alone: the row gives its Guards a longer Shield Wall (see the position tests)', () => {
    expect(three('lantern-night').mods.lingerRounds).toBeUndefined();
  });

  it('applyGear passes the sheet on and leaves a creature without the set untouched', () => {
    const folded = applyGear(
      STATS,
      undefined,
      WEARER['pounce-set'] as Wearer,
      wearing('pounce-set', 3),
    );
    expect(folded.mods?.firstReactionCrit).toBe(1);
    // The set's 500 and the set Charm's own Payoff's pounce line (300 at item level 12).
    expect(folded.mods?.pounceBp).toBe(800);
    expect(applyGear(STATS, undefined, WEARER['pounce-set'] as Wearer, []).mods).toBeUndefined();
  });
});

describe('where set pieces come from', () => {
  it('drop as ordinary bases of their slot and tag from item level 12, never before', () => {
    const rng = createSeededRng('set-drops');
    const seen = new Set<string>();
    for (let i = 0; i < 4_000; i++) {
      const base = dropBase(rng, 'tide', 11);
      expect(base.set, 'below 12').toBeUndefined();
      const high = dropBase(rng, 'tide', 12);
      if (high.set !== undefined) seen.add(high.set);
    }
    expect([...seen]).toEqual(['tidepool-finery']);
    // A quarter of the Hats and Scarves and half of the Charms (the plain one and the set's) are the set
    // piece: a third of all the drops of an element at item level 12 and up.
    let sets = 0;
    for (let i = 0; i < 6_000; i++) if (dropBase(rng, 'ember', 15).set !== undefined) sets++;
    expect(sets / 6_000).toBeGreaterThan(0.3);
    expect(sets / 6_000).toBeLessThan(0.37);
  });

  it('role sets drop through the finale role lock from item level 12, for Hats and Scarves too', () => {
    const rng = createSeededRng('role-sets');
    const roleSets = new Set<string>();
    let hatsAndScarves = 0;
    for (let i = 0; i < 40_000; i++) {
      const base = dropBase(rng, 'grove', 20, { roleCharm: true });
      if (base.slot !== 'charm' && base.set !== undefined && base.tag !== 'grove') {
        roleSets.add(base.set);
        hatsAndScarves++;
      }
    }
    expect([...roleSets].sort()).toEqual([
      'first-footprints',
      'hearth-helpers',
      'pounce-set',
      'wardens-watch',
    ]);
    // 1 in 20 of a Hat or a Scarf is role-locked, about 2 in 3 of all drops.
    expect(hatsAndScarves / 40_000).toBeGreaterThan(0.025);
    expect(hatsAndScarves / 40_000).toBeLessThan(0.042);
    // Below item level 12 a role lock still only makes a Charm, and the draws are the ones of before.
    const low = createSeededRng('role-low');
    for (let i = 0; i < 2_000; i++) {
      const base = dropBase(low, 'grove', 11, { roleCharm: true });
      expect(base.set).toBeUndefined();
      if (base.slot !== 'charm') expect(base.tag).toBe('grove');
    }
  });

  it('the Crossroads gives the Compass until item level 12, then the Wanderer pieces too', () => {
    const rng = createSeededRng('crossroads');
    for (let i = 0; i < 50; i++) {
      expect(rollExpeditionItem(rng, 'rare', { element: null, crossroads: true }, 5).baseId).toBe(
        'crossroads-compass',
      );
    }
    const ids = new Set<string>();
    for (let i = 0; i < 400; i++) {
      ids.add(rollExpeditionItem(rng, 'rare', { element: null, crossroads: true }, 12).baseId);
    }
    expect(ids).toEqual(
      new Set(['crossroads-compass', 'wanderers-hat', 'wanderers-scarf', 'wanderers-coin']),
    );
  });

  it('can be crafted from a blueprint at Crafting level 6, and a role set too; a Festival piece cannot', () => {
    for (const set of gearContent.sets.filter((s) => s.tag !== 'festival')) {
      for (const p of setPieces(set.id)) {
        expect(craftable(p), p.id).toBe(true);
        expect(craftLevelNeeded(p.id), p.id).toBe(6);
      }
    }
    for (const p of setPieces('lantern-night')) expect(craftable(p), p.id).toBe(false);
    expect(blueprintBases().filter((b) => b.set !== undefined)).toHaveLength(27);
    // A role-locked Charm that belongs to no set still has no blueprint.
    expect(craftable(gearBase('wardens-bell') as never)).toBe(false);
  });

  it('are one blueprint in five, whatever the number of bases', () => {
    const rng = createSeededRng('blueprints');
    let sets = 0;
    for (let i = 0; i < 6_000; i++) if (gearBase(rollBlueprint(rng))?.set !== undefined) sets++;
    expect(sets / 6_000).toBeGreaterThan(0.17);
    expect(sets / 6_000).toBeLessThan(0.23);
    // A finale reward that is a blueprint picks among the ones the player lacks.
    const owned = new Set(
      blueprintBases()
        .filter((b) => b.set !== undefined)
        .map((b) => b.id),
    );
    const left = createSeededRng('finale-bp');
    for (let i = 0; i < 400; i++) {
      const reward = rollFinaleReward(left, 20, 'tide', owned);
      if (reward.kind === 'blueprint') expect(gearBase(reward.baseId)?.set).toBeUndefined();
    }
  });
});
