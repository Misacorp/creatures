import { describe, expect, it } from 'vitest';
import {
  PART_KINDS,
  expeditionContent,
  glossary,
  loadResources,
  resource,
  resourceAmount,
  resourceIcon,
  resourceName,
  resources,
} from '../src';

describe('resource library schema', () => {
  const valid = {
    id: 'acorn',
    kind: 'currency',
    name: 'Acorn',
    plural: 'Acorns',
    icon: { kind: 'glyph', id: 'bait' },
  };

  it('accepts a well-formed entry', () => {
    expect(loadResources([valid])).toHaveLength(1);
  });
  it('rejects unknown keys, bad kinds, bad ids and duplicates', () => {
    expect(() => loadResources([{ ...valid, extra: 1 }])).toThrow();
    expect(() => loadResources([{ ...valid, kind: 'gold' }])).toThrow();
    expect(() => loadResources([{ ...valid, id: 'Acorn' }])).toThrow();
    expect(() => loadResources([valid, valid])).toThrow();
    expect(() => loadResources([{ ...valid, name: 'A‮B' }])).toThrow();
    expect(() => loadResources([{ ...valid, icon: { kind: 'gear', baseId: 'x' } }])).toThrow();
  });
});

describe('resource helpers', () => {
  it('gives the singular for one and the plural otherwise', () => {
    expect(resourceName('tide-shard')).toBe('Tide Shard');
    expect(resourceName('tide-shard', 1)).toBe('Tide Shard');
    expect(resourceName('tide-shard', 3)).toBe('Tide Shards');
    expect(resourceName('tide-shard', 0)).toBe('Tide Shards');
    expect(resourceAmount('scrap', 6)).toBe('6 Scrap');
    expect(resourceAmount('ember-shard', 1)).toBe('1 Ember Shard');
  });
  it("keeps today's names", () => {
    expect(resourceName('bait')).toBe('Bait');
    expect(resourceName('essence')).toBe('Essence');
    expect(resourceName('glimmer')).toBe('Glimmer');
  });
  it('falls back to the id for an unknown resource', () => {
    expect(resourceName('nope')).toBe('nope');
    expect(resource('nope')).toBeUndefined();
    expect(resourceIcon('nope')).toBeUndefined();
  });
  it('gives an icon', () => {
    expect(resourceIcon('bait')).toEqual({ kind: 'glyph', id: 'bait' });
    expect(resourceIcon('scrap')).toEqual({ kind: 'part', part: 'scrap' });
  });
});

describe('every resource a player holds has a library entry', () => {
  it('ledger currencies', () => {
    // The worker's CURRENCIES are `bait` and `essence` (its own test checks the list matches).
    for (const id of ['bait', 'essence']) expect(resource(id)?.kind).toBe('currency');
  });
  it('part kinds', () => {
    for (const kind of PART_KINDS) expect(resource(kind), kind).toBeDefined();
  });
  it('supplies, with the same name as the supply content', () => {
    for (const supply of expeditionContent.supplies) {
      expect(resource(supply.id)?.kind, supply.id).toBe('supply');
      expect(resourceName(supply.id), supply.id).toBe(supply.name);
      expect(resource(supply.id)?.icon).toEqual({ kind: 'supply', id: supply.kind });
    }
  });
});

describe('the glossary names resources as the library does', () => {
  it('every resource entry has the library name (or plural) as its title', () => {
    const withEntry = resources.filter((r) => r.glossary !== undefined);
    expect(withEntry.length).toBeGreaterThan(10);
    for (const r of withEntry) {
      const entry = glossary.find((e) => e.id === r.glossary);
      expect(entry, `${r.id}: glossary entry ${String(r.glossary)}`).toBeDefined();
      expect([r.name, r.plural], r.id).toContain(entry?.title);
    }
  });
  it('every part and every currency has a glossary entry', () => {
    for (const r of resources.filter((x) => ['currency', 'material', 'shard'].includes(x.kind))) {
      expect(r.glossary, r.id).toBeDefined();
    }
  });
});
