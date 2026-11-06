/**
 * Patchwork pieces (V-FORGE-12, decision 2026-11-06 "Patchwork pieces"): the content (`data/patchwork.json`, its schema and loader),
 * and the Forge's pure pass for an order of a patchwork blueprint: the shard element is the order's or, left unset, the pile held most when
 * a piece starts; the piece takes the blueprint's own price; Common or Rare only; no Reach.
 */
import { describe, expect, it } from 'vitest';
import {
  GEAR_RARITIES,
  GEAR_SLOTS,
  RULES,
  VALLEY_ELEMENTS,
  VALLEY_RULES,
  createSeededRng,
  fullestPile,
  gearBase,
  loadPatchwork,
  orderNeeds,
  patchworkBase,
  patchworkBlueprint,
  patchworkBlueprints,
  patchworkContent,
  patchworkMaxRarity,
  patchworkRolledLines,
  rollItem,
  settle,
  type Rng,
  type SettleAnvil,
  type SettleForge,
  type SettleOrder,
  type SettleState,
} from '../src';
import patchworkJson from '../src/content/data/patchwork.json';

const H = 3_600_000;
const R = VALLEY_RULES;
const COUNT = VALLEY_ELEMENTS.length;

describe('the patchwork content', () => {
  it('has one blueprint per slot, none of them a gear base, with a price in scrap and shards', () => {
    const list = patchworkBlueprints();
    expect(list.map((b) => b.slot)).toEqual(['hat', 'scarf', 'charm']);
    for (const bp of list) {
      expect(gearBase(bp.id)).toBeUndefined();
      expect(bp.scrap).toBeGreaterThan(0);
      expect(bp.shards).toBeGreaterThan(0);
      expect(patchworkBlueprint(bp.id)).toBe(bp);
    }
    expect(patchworkBlueprint('kelp-cap')).toBeUndefined();
  });

  it('rolls Common or Rare only, with fewer lines than a proper piece of each rarity', () => {
    expect(patchworkContent.maxRarity).toBe('rare');
    expect(patchworkMaxRarity()).toBe(1);
    for (const rarity of GEAR_RARITIES) {
      expect(patchworkRolledLines(rarity)).toBeLessThan(RULES.gear.rolledLines[rarity]);
    }
  });

  it('makes the plainest piece of the slot in the shard element', () => {
    for (const slot of GEAR_SLOTS) {
      for (const element of VALLEY_ELEMENTS) {
        const base = patchworkBase(slot, element);
        expect(base.slot).toBe(slot);
        expect(base.tag).toBe(element);
        expect(base.minItemLevel ?? 1).toBe(1);
        expect(base.set).toBeUndefined();
      }
    }
    expect(patchworkBase('hat', 'tide').id).toBe('kelp-cap');
  });

  it('rolls the lines it is told to (a patchwork piece has fewer than the rarity gives)', () => {
    const rng = createSeededRng('patch-lines');
    const plain = rollItem(rng, { baseId: 'kelp-cap', rarity: 'rare', itemLevel: 10 });
    const patch = rollItem(rng, {
      baseId: 'kelp-cap',
      rarity: 'rare',
      itemLevel: 10,
      lines: patchworkRolledLines('rare'),
    });
    expect(plain.lines.length).toBe(RULES.gear.rolledLines.rare);
    expect(patch.lines.length).toBe(patchworkRolledLines('rare'));
    expect(
      rollItem(rng, { baseId: 'kelp-cap', rarity: 'common', itemLevel: 10, lines: 0 }).lines,
    ).toEqual([]);
  });

  it('is refused when it breaks a rule: two for a slot, a duplicate id, as many lines as a proper piece, an unknown key', () => {
    const proper = RULES.gear.rolledLines;
    expect(() => loadPatchwork(patchworkJson, proper)).not.toThrow();
    const bp = patchworkJson.blueprints[0] as (typeof patchworkJson.blueprints)[number];
    const twice = { ...patchworkJson, blueprints: [bp, { ...bp, id: 'patchwork-other' }] };
    expect(() => loadPatchwork(twice, proper)).toThrow(/two blueprints for the hat slot/);
    const dup = {
      ...patchworkJson,
      blueprints: [bp, { ...bp, slot: 'scarf' }],
    };
    expect(() => loadPatchwork(dup, proper)).toThrow(/duplicate id/);
    const many = { ...patchworkJson, rolledLines: { common: 1, rare: 1, epic: 1 } };
    expect(() => loadPatchwork(many, proper)).toThrow(/must be fewer/);
    expect(() => loadPatchwork({ ...patchworkJson, extra: 1 }, proper)).toThrow();
    expect(() => loadPatchwork({ ...patchworkJson, maxRarity: 'mythic' }, proper)).toThrow();
    const free = { ...patchworkJson, blueprints: [{ ...bp, shards: 0 }] };
    expect(() => loadPatchwork(free, proper)).toThrow();
  });
});

const HAT = patchworkBlueprints()[0]!;
const order = (over: Partial<SettleOrder> = {}): SettleOrder => ({
  id: 'p1',
  blueprint: HAT.id,
  element: -1,
  count: 99,
  made: 0,
  reach: 'none',
  forTeam: false,
  stepUp: 0,
  ...over,
});
const forgeOf = (orders: SettleOrder[], shelf: Partial<SettleForge['shelf']> = {}): SettleForge => {
  const anvil: SettleAnvil = {
    id: 'a1',
    creature: 0,
    kit: null,
    orders,
    piece: null,
    floor: 0,
  };
  return {
    anvils: [anvil],
    shelf: { scrap: 10_000, shards: [10, 30, 20, 5, 0], essence: 1000, ...shelf },
    scrapCarry: 0,
    weak: new Array<number>(COUNT).fill(0),
    pending: new Array<number>(COUNT).fill(0),
    fireLevel: 1,
  };
};
const stateOf = (forge: SettleForge): SettleState => ({
  settledAt: 0,
  lastVisitAt: 0,
  hearth: 1,
  creatures: [{ xp: 0, carry: 0, capXp: Infinity, smithHours: 0 }],
  forge,
});
const best: Rng = { nextU32: () => 0xffffffff };
const worst: Rng = { nextU32: () => 0 };

describe('the pass for a patchwork order', () => {
  it('picks the pile held most when a piece starts, takes the blueprint price and makes the piece in that element', () => {
    // Ember (index 1) holds 30, the most.
    expect(fullestPile([10, 30, 20, 5, 0])).toBe(1);
    const after = settle(stateOf(forgeOf([order()])), 0, 17 * H, [], { rng: worst });
    const made = after.made ?? [];
    expect(made.length).toBe(1);
    expect(made[0]?.element).toBe(1);
    expect(made[0]?.blueprint).toBe(HAT.id);
    expect(made[0]?.rarity).toBe(0);
    // The first piece took its price from the biggest pile, the next started from whichever is biggest then (still ember: 26 > 20).
    expect(after.forge?.shelf.scrap).toBe(10_000 - 2 * HAT.scrap);
    expect(after.forge?.shelf.shards).toEqual([10, 30 - 2 * HAT.shards, 20, 5, 0]);
  });

  it('re-picks at every piece: as one pile falls under another the next piece is made of the new biggest', () => {
    // Each piece takes HAT.shards (4): ember 12 > grove 11 > tide 10, then ember 8 and grove 7 fall under tide's 10 ... 6.
    const forge = forgeOf([order()], { shards: [10, 12, 11, 0, 0] });
    const after = settle(stateOf(forge), 0, 16 * 3.2 * H, [], { rng: worst });
    expect((after.made ?? []).map((m) => m.element)).toEqual([1, 2, 0]);
  });

  it('breaks a tie by the first element of the list, as the lab and the client do', () => {
    expect(fullestPile([4, 4, 4, 4, 4])).toBe(0);
    expect(fullestPile([0, 0, 0, 0, 0])).toBe(0);
  });

  it('uses the element the order names, even when another pile is bigger', () => {
    const after = settle(stateOf(forgeOf([order({ element: 3 })])), 0, 17 * H, [], { rng: worst });
    expect(after.made?.[0]?.element).toBe(3);
    // Spark held 5: one piece took its 4; the second could not start (1 left), so it waits on spark shards.
    expect(after.forge?.shelf.shards[3]).toBe(5 - HAT.shards);
    expect(after.forge?.anvils[0]?.wait).toBe('shard');
    expect(after.forge?.anvils[0]?.waitElement).toBe(3);
  });

  it('waits on scrap, or on the biggest pile when no pile can pay, with the pile named', () => {
    const noScrap = settle(stateOf(forgeOf([order()], { scrap: HAT.scrap - 1 })), 0, 1, [], {
      rng: worst,
    });
    expect(noScrap.forge?.anvils[0]?.wait).toBe('scrap');
    const thin = settle(
      stateOf(forgeOf([order()], { shards: [1, 2, HAT.shards - 1, 0, 1] })),
      0,
      1,
      [],
      { rng: worst },
    );
    expect(thin.forge?.anvils[0]?.wait).toBe('shard');
    expect(thin.forge?.anvils[0]?.waitElement).toBe(2);
  });

  it('never makes better than Rare: an Epic draw becomes a Rare piece, even with a Reach asked for', () => {
    const forge = forgeOf([order({ reach: 'epic' })]);
    const after = settle(stateOf(forge), 0, 17 * H, [], { rng: best });
    expect(after.made?.[0]?.rarity).toBe(1);
    // A patchwork piece takes no Essence and no longer than a plain one.
    expect(after.forge?.shelf.essence).toBe(1000);
    expect(after.made?.[0]?.at).toBe(R.forge.pieceHours * H);
  });

  it('says what a piece takes through orderNeeds: the blueprint price, the shard of no element until one is picked', () => {
    const needs = orderNeeds(R, order(), -1);
    expect(needs).toEqual({ scrap: HAT.scrap, element: -1, shard: HAT.shards, essence: 0 });
    expect(orderNeeds(R, order({ element: 2, reach: 'rare' }), -1).essence).toBe(0);
    // A proper blueprint keeps the Forge's plain price.
    expect(orderNeeds(R, order({ blueprint: 'kelp-cap', element: 0 }), -1).scrap).toBe(
      R.forge.scrap,
    );
  });

  it('waits for the cheapest scrap to be made by tinkering, at the blueprint price (the boundary reads the order)', () => {
    // A patchwork order short of 2 scrap: tinkering returns 1 scrap per 12 h, so the piece starts about 24 h in.
    const forge = forgeOf([order()], { scrap: HAT.scrap - 2 });
    const after = settle(stateOf(forge), 0, 30 * H, [], { rng: worst });
    expect(after.forge?.anvils[0]?.piece).not.toBeNull();
    expect(after.forge?.anvils[0]?.wait).toBeNull();
  });
});
