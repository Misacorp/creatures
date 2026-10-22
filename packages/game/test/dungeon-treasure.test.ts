import { describe, expect, it } from 'vitest';
import {
  RULES,
  baseMinLevel,
  blueprintBases,
  createSeededRng,
  dungeonEvent,
  dungeonEvents,
  dungeonItemLevel,
  eventHasTreasure,
  eventTreasureTable,
  gearBase,
  resolveEvent,
  rollRareEvent,
  rollTreasure,
  treasureBlueprintBases,
  treasureKinds,
  type DungeonEventDef,
  type EventContext,
  type Rng,
  type Treasure,
  type TreasureContext,
} from '../src/index';

const chasm = dungeonEvent('blue-chasm') as DungeonEventDef;
const fixed = (value: number): Rng => ({ nextU32: () => value });
const WIN = fixed(0);
const LOSE = fixed(4_294_959_999);

const ctx = (extra: Partial<TreasureContext> = {}): TreasureContext => ({
  depth: 5,
  elements: ['tide', 'ember', 'grove'],
  knownBlueprints: new Set(),
  ...extra,
});

/** The ids of the blueprint bases at one tier (`minItemLevel`). */
const tier = (level: number): string[] =>
  blueprintBases()
    .filter((b) => baseMinLevel(b) === level)
    .map((b) => b.id);

describe('the rare event roll', () => {
  it('turns a room into a rare one only from its depth, with its chance, and never one it met', () => {
    expect(rollRareEvent(WIN, 1, [])).toBeUndefined();
    expect(rollRareEvent(WIN, 2, [])?.id).toBe('hungry-door');
    expect(rollRareEvent(WIN, 3, [])?.id).toBe('blue-chasm');
    expect(rollRareEvent(LOSE, 9, [])).toBeUndefined();
    expect(rollRareEvent(WIN, 9, ['blue-chasm'])?.id).toBe('hungry-door');
    expect(rollRareEvent(WIN, 9, ['blue-chasm', 'hungry-door'])).toBeUndefined();
  });

  it('keeps each rare room its own chance over many rooms, and no room is favoured by its place', () => {
    const rng = createSeededRng('rare-rate');
    const n = 20_000;
    const counts: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const id = rollRareEvent(rng, 5, [])?.id;
      if (id !== undefined) counts[id] = (counts[id] ?? 0) + 1;
    }
    // Each hits with its own chance (15% and 20%); when both come up one is picked evenly, so the
    // marginals are chance minus half the overlap: 15% - 1.5% and 20% - 1.5%.
    expect((counts['blue-chasm'] ?? 0) / n).toBeGreaterThan(0.125);
    expect((counts['blue-chasm'] ?? 0) / n).toBeLessThan(0.15);
    expect((counts['hungry-door'] ?? 0) / n).toBeGreaterThan(0.175);
    expect((counts['hungry-door'] ?? 0) / n).toBeLessThan(0.2);
  });

  it('is the same for the same stream', () => {
    const seq = (): (string | undefined)[] => {
      const rng = createSeededRng('rare-same');
      return Array.from({ length: 50 }, () => rollRareEvent(rng, 5, [])?.id);
    };
    expect(seq()).toEqual(seq());
  });

  it('knows which events roll a treasure', () => {
    expect(eventHasTreasure(chasm)).toBe(true);
    expect(dungeonEvents.filter(eventHasTreasure).map((e) => e.id)).toEqual([
      'blue-chasm',
      'hungry-door',
    ]);
    expect(eventTreasureTable(chasm)).toBe('chasm');
    expect(eventTreasureTable(dungeonEvent('hungry-door') as DungeonEventDef)).toBe('door');
    expect(eventTreasureTable(dungeonEvent('glowing-pool') as DungeonEventDef)).toBeUndefined();
  });
});

describe('the treasure roll', () => {
  it('is the same for the same stream and varies with it', () => {
    expect(rollTreasure(createSeededRng('t1'), ctx())).toEqual(
      rollTreasure(createSeededRng('t1'), ctx()),
    );
    const kinds = new Set<string>();
    for (let i = 0; i < 80; i++) {
      kinds.add(rollTreasure(createSeededRng(`t-${String(i)}`), ctx()).kind);
    }
    expect([...kinds].sort()).toEqual(['blueprint', 'gear', 'shards', 'supplies']);
  });

  it('draws the kind evenly among the kinds that apply', () => {
    const counts: Record<string, number> = {};
    const rng = createSeededRng('t-even');
    for (let i = 0; i < 2000; i++) {
      const t = rollTreasure(rng, ctx());
      counts[t.kind] = (counts[t.kind] ?? 0) + 1;
    }
    for (const kind of ['gear', 'blueprint', 'supplies', 'shards']) {
      expect(counts[kind], kind).toBeGreaterThan(400);
      expect(counts[kind], kind).toBeLessThan(600);
    }
  });

  it('a gear piece is Epic at the item level of the run depth', () => {
    for (const depth of [3, 8, 15]) {
      let seen = 0;
      for (let i = 0; i < 60 && seen < 3; i++) {
        const t = rollTreasure(
          createSeededRng(`gear-${String(depth)}-${String(i)}`),
          ctx({ depth }),
        );
        if (t.kind !== 'gear') continue;
        seen += 1;
        expect(t.item.rarity).toBe('epic');
        expect(t.item.itemLevel).toBe(dungeonItemLevel(depth, false));
        expect(gearBase(t.item.baseId)).toBeDefined();
      }
      expect(seen).toBeGreaterThan(0);
    }
  });

  it('two great supplies of one kind, never a lure', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const t = rollTreasure(createSeededRng(`sup-${String(i)}`), ctx());
      if (t.kind !== 'supplies') continue;
      expect(t.count).toBe(RULES.dungeon.treasure.supplies.count);
      expect(t.supplyId.endsWith(`-${RULES.dungeon.treasure.supplies.tier}`)).toBe(true);
      expect(t.supplyId.startsWith('lure')).toBe(false);
      seen.add(t.supplyId);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('shards: two per creature by its element, and the glimmer', () => {
    const find = (c: TreasureContext): Treasure => {
      for (let i = 0; i < 200; i++) {
        const t = rollTreasure(createSeededRng(`sh-${String(i)}`), c);
        if (t.kind === 'shards') return t;
      }
      throw new Error('no shards');
    };
    expect(find(ctx())).toEqual({
      kind: 'shards',
      parts: { 'tide-shard': 2, 'ember-shard': 2, 'grove-shard': 2, glimmer: 4 },
    });
    expect(find(ctx({ elements: ['spark', 'spark', 'mire'] }))).toEqual({
      kind: 'shards',
      parts: { 'spark-shard': 4, 'mire-shard': 2, glimmer: 4 },
    });
  });
});

describe('the treasure gear piece', () => {
  it('is fully rolled with the treasure (stats, lines, level, tag) and the win hands over that same piece', () => {
    const find = (seed: string): Extract<Treasure, { kind: 'gear' }> => {
      for (let i = 0; i < 200; i++) {
        const t = rollTreasure(createSeededRng(`${seed}-${String(i)}`), ctx());
        if (t.kind === 'gear') return t;
      }
      throw new Error('no gear');
    };
    const a = find('card');
    expect(find('card')).toEqual(a);
    expect(a.item.rarity).toBe('epic');
    expect(a.item.itemLevel).toBe(dungeonItemLevel(5, false));
    expect(a.item.lines.length).toBeGreaterThan(0);
    const won = resolveEvent(
      chasm,
      0,
      { hp: { a: 10 }, hpMax: { a: 10 }, keepsakes: [], treasure: a },
      WIN,
    );
    expect(won.treasure).toBe(a);
  });
});

describe('the treasure blueprint', () => {
  it('is one tier above the best the player knows', () => {
    expect(tier(1).length).toBeGreaterThan(0);
    // Knowing only tier 1: the nearest tier above is 5.
    const pool = treasureBlueprintBases(new Set(tier(1)));
    expect(pool.length).toBeGreaterThan(0);
    for (const b of pool) expect(baseMinLevel(b)).toBe(5);
    // Knowing a tier 5 base: tier 10.
    const known5 = new Set([...tier(1), ...tier(5).slice(0, 1)]);
    for (const b of treasureBlueprintBases(known5)) expect(baseMinLevel(b)).toBe(10);
    // Knowing nothing: the first tier.
    for (const b of treasureBlueprintBases(new Set())) expect(baseMinLevel(b)).toBe(1);
  });

  it('never a base the player knows, and a rolled one is of the pool', () => {
    const known = new Set(tier(1));
    const pool = new Set(treasureBlueprintBases(known).map((b) => b.id));
    for (const id of pool) expect(known.has(id)).toBe(false);
    for (let i = 0; i < 100; i++) {
      const t = rollTreasure(createSeededRng(`bp-${String(i)}`), ctx({ knownBlueprints: known }));
      if (t.kind === 'blueprint') expect(pool.has(t.baseId)).toBe(true);
    }
  });

  it('moves up a tier when the player knows a tier completely, and from the top falls back to the highest unknown', () => {
    // Best known is 10 (one base), so the nearest unknown above it is the sets' 12.
    const best10 = new Set([...tier(1), ...tier(5), ...tier(10).slice(0, 1)]);
    for (const b of treasureBlueprintBases(best10)) expect(baseMinLevel(b)).toBe(12);
    // Knows one tier-12 base: nothing above 12, so the highest unknown tier (12, the rest of the sets).
    const knownTop = new Set(tier(12).slice(0, 1));
    const pool = treasureBlueprintBases(knownTop);
    expect(pool.length).toBeGreaterThan(0);
    for (const b of pool) {
      expect(baseMinLevel(b)).toBe(12);
      expect(knownTop.has(b.id)).toBe(false);
    }
  });

  it('is not a kind at all when the player knows every blueprint', () => {
    const everything = new Set(blueprintBases().map((b) => b.id));
    expect(treasureBlueprintBases(everything)).toEqual([]);
    expect(treasureKinds(ctx({ knownBlueprints: everything }))).toEqual([
      'gear',
      'supplies',
      'shards',
    ]);
    for (let i = 0; i < 60; i++) {
      const t = rollTreasure(
        createSeededRng(`all-${String(i)}`),
        ctx({ knownBlueprints: everything }),
      );
      expect(t.kind).not.toBe('blueprint');
    }
  });
});

describe('resolving the chasm', () => {
  const team = (): EventContext => ({
    hp: { a: 50, b: 100, c: 0 },
    hpMax: { a: 100, b: 100, c: 100 },
    keepsakes: [],
    treasure: { kind: 'supplies', supplyId: 'map-scrap-great', count: 2 },
  });

  it('crossing and winning takes the treasure the room rolled and changes nothing else', () => {
    const r = resolveEvent(chasm, 0, team(), WIN);
    expect(r.won).toBe(true);
    expect(r.treasure).toEqual({ kind: 'supplies', supplyId: 'map-scrap-great', count: 2 });
    expect(r.fell).toBeUndefined();
    expect(r.hp).toEqual({ a: 50, b: 100, c: 0 });
    expect(r.packDelta).toEqual({ bait: 0, essence: 0, scrap: 0 });
    expect(r.outcome).toBe('Lucky! You cross the plank and take the treasure.');
  });

  it('crossing and losing is a fall: everyone is down, the run ends, no treasure', () => {
    const r = resolveEvent(chasm, 0, team(), LOSE);
    expect(r.won).toBe(false);
    expect(r.fell).toBe(true);
    expect(r.treasure).toBeUndefined();
    expect(r.hp).toEqual({ a: 0, b: 0, c: 0 });
    expect(r.outcome).toContain('No luck.');
  });

  it("Don't risk it does nothing, whatever the dice say", () => {
    for (const rng of [WIN, LOSE]) {
      const r = resolveEvent(chasm, 1, team(), rng);
      expect(r.outcome).toBe('Nothing happens.');
      expect(r.treasure).toBeUndefined();
      expect(r.fell).toBeUndefined();
      expect(r.hp).toEqual({ a: 50, b: 100, c: 0 });
      expect(r.won).toBeNull();
    }
  });

  it('a win with no treasure rolled takes nothing and says so', () => {
    const none = { ...team(), treasure: undefined };
    const r = resolveEvent(chasm, 0, none, WIN);
    expect(r.treasure).toBeUndefined();
    expect(r.outcome).toContain('The treasure is gone.');
  });

  it('a crossing is a fair coin over many throws', () => {
    const rng = createSeededRng('coin');
    let wins = 0;
    for (let i = 0; i < 2000; i++) if (resolveEvent(chasm, 0, team(), rng).won === true) wins += 1;
    expect(wins).toBeGreaterThan(900);
    expect(wins).toBeLessThan(1100);
  });
});
