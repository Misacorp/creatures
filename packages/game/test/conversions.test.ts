import { describe, expect, it } from 'vitest';
import {
  RULES,
  SUPPLY_KINDS,
  conversionBlock,
  conversionContent,
  conversionInputs,
  conversionJobMs,
  conversionOutputs,
  conversionRecipe,
  conversionRecipes,
  conversionXp,
  expeditionContent,
  loadConversions,
  supplyDef,
} from '../src';

const recipe = (id: string) => {
  const r = conversionRecipe(id);
  if (r === undefined) throw new Error(`no recipe ${id}`);
  return r;
};

describe('conversion content', () => {
  it('refines every kind one tier up and recycles every good and great supply', () => {
    for (const kind of SUPPLY_KINDS) {
      expect(conversionRecipe(`refine-${kind}-basic`)).toBeDefined();
      expect(conversionRecipe(`refine-${kind}-good`)).toBeDefined();
      expect(conversionRecipe(`refine-${kind}-great`)).toBeUndefined();
      expect(conversionRecipe(`recycle-${kind}-basic`)).toBeUndefined();
      expect(conversionRecipe(`recycle-${kind}-good`)).toBeDefined();
      expect(conversionRecipe(`recycle-${kind}-great`)).toBeDefined();
    }
    expect(conversionRecipes()).toHaveLength(16);
    expect(new Set(conversionRecipes().map((r) => r.id)).size).toBe(16);
  });

  it('refines 3 into 1 of the next tier, needing the Crafting level of what it makes', () => {
    const r = recipe('refine-lure-basic');
    expect(conversionInputs(r)).toEqual({ supplies: { 'lure-basic': 3 }, parts: {} });
    expect(conversionOutputs(r)).toEqual({ supplies: { 'lure-good': 1 }, parts: {} });
    expect(r.craftingLevel).toBe(supplyDef('lure-good')?.blueprint.craftingLevel);
    expect(recipe('refine-satchel-good').craftingLevel).toBe(5);
  });

  it('recycles to less than half of each part of the recipe and never gives Bait', () => {
    for (const r of conversionRecipes().filter((c) => c.kind === 'recycle')) {
      const from = supplyDef(Object.keys(conversionInputs(r).supplies)[0] ?? '');
      expect(from).toBeDefined();
      const cost: Record<string, number | undefined> = from?.blueprint.parts ?? {};
      const out = conversionOutputs(r);
      expect(out.supplies).toEqual({});
      expect(Object.keys(out.parts).length).toBeGreaterThan(0);
      for (const [kind, n] of Object.entries(out.parts)) {
        expect(n * 2).toBeLessThan(cost[kind] ?? 0);
      }
      expect(JSON.stringify(r)).not.toContain('bait');
    }
    expect(conversionOutputs(recipe('recycle-lure-great'))).toEqual({
      supplies: {},
      parts: { scrap: 1 },
    });
    expect(conversionOutputs(recipe('recycle-lantern-great')).parts).toEqual({
      scrap: 3,
      'spark-shard': 1,
    });
  });

  it('rejects recipes that break a rule', () => {
    const supplies = expeditionContent.supplies;
    const ok = conversionContent[0];
    const bad = (patch: object) => () => loadConversions([{ ...ok, ...patch }], supplies);
    expect(bad({})).not.toThrow();
    expect(bad({ extra: 1 })).toThrow(/schema/);
    expect(bad({ kind: 'recycle' })).toThrow(/recycle/);
    expect(bad({ inputs: [{ type: 'supply', id: 'nope', amount: 3 }] })).toThrow(/no supply/);
    expect(bad({ outputs: [{ type: 'supply', id: 'lure-great', amount: 1 }] })).toThrow(
      /one tier up/,
    );
    expect(bad({ outputs: [{ type: 'supply', id: 'map-scrap-good', amount: 1 }] })).toThrow(
      /same kind/,
    );
    expect(bad({ craftingLevel: 1 })).toThrow(/Crafting level/);
    const recycle = {
      id: 'x',
      kind: 'recycle',
      inputs: [{ type: 'supply', id: 'lure-good', amount: 1 }],
      hours: 1,
      craftingLevel: 1,
    };
    const rec = (outputs: object[]) => () => loadConversions([{ ...recycle, outputs }], supplies);
    expect(rec([{ type: 'part', id: 'scrap', amount: 1 }])).not.toThrow();
    expect(rec([{ type: 'part', id: 'scrap', amount: 2 }])).toThrow(/cost/);
    expect(rec([{ type: 'part', id: 'tide-shard', amount: 1 }])).toThrow(/cost/);
    expect(rec([{ type: 'supply', id: 'lure-basic', amount: 1 }])).toThrow(/parts only/);
    expect(() => loadConversions([ok, ok], supplies)).toThrow(/duplicate/);
  });
});

describe('conversion rules', () => {
  const r = recipe('refine-map-scrap-good');
  const stock = { supplies: { 'map-scrap-good': 3 }, parts: {} };

  it('names why a recipe cannot start, in order', () => {
    expect(conversionBlock(r, 5, stock)).toBeNull();
    expect(conversionBlock(r, 4, stock)).toBe('skill_too_low');
    expect(conversionBlock(r, 5, { supplies: { 'map-scrap-good': 2 }, parts: {} })).toBe(
      'insufficient_supplies',
    );
    expect(conversionBlock(r, 5, { supplies: {}, parts: {} })).toBe('insufficient_supplies');
    const custom = {
      ...r,
      inputs: [...r.inputs, { type: 'part' as const, id: 'scrap' as const, amount: 2 }],
    };
    expect(conversionBlock(custom, 5, { ...stock, parts: { scrap: 1 } })).toBe(
      'insufficient_parts',
    );
    expect(conversionBlock(custom, 5, { ...stock, parts: { scrap: 2 } })).toBeNull();
  });

  it('shortens the job by the Crafting level like a supply job, and gives XP on nominal hours', () => {
    const hour = 3_600_000;
    expect(conversionJobMs(r, 1)).toBe(r.hours * hour);
    const keep = 10_000 - RULES.gear.skill.timeReductionBpPerLevel * 4;
    expect(conversionJobMs(r, 5)).toBe(Math.floor((r.hours * hour * keep) / 10_000));
    expect(conversionJobMs(r, 99)).toBeLessThan(conversionJobMs(r, 5));
    expect(conversionXp(r)).toBe(r.hours * RULES.gear.skill.xpPerHour);
  });
});
