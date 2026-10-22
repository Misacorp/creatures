import { describe, expect, it } from 'vitest';
import {
  RULES,
  createSeededRng,
  dungeonContent,
  dungeonEvent,
  dungeonGifts,
  dungeonKeepsakes,
  dungeonItemLevel,
  eventOptionBlock,
  eventOptionCosts,
  loadDungeonRun,
  resolveEvent,
  rollTreasure,
  treasureKinds,
  treasureTable,
  type DungeonEventDef,
  type EventContext,
  type Rng,
  type TreasureContext,
} from '../src/index';
import keepsakesJson from '../src/content/data/dungeon-keepsakes.json';
import eventsJson from '../src/content/data/dungeon-events.json';

const event = (id: string): DungeonEventDef => dungeonEvent(id) as DungeonEventDef;
const fixed = (value: number): Rng => ({ nextU32: () => value });
const WIN = fixed(0);
const LOSE = fixed(4_294_959_999);

const team = (extra: Partial<EventContext> = {}): EventContext => ({
  hp: { a: 80, b: 100, c: 60 },
  hpMax: { a: 100, b: 100, c: 100 },
  keepsakes: [],
  ...extra,
});

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const load = (events: unknown): unknown => loadDungeonRun(keepsakesJson, events, dungeonContent);
const refused = (events: unknown): void => expect(() => load(events)).toThrow(/Invalid|has/);

describe('Training Post', () => {
  it('Spar: every standing creature loses 10% of its max HP and gains 40 experience', () => {
    const r = resolveEvent(event('training-post'), 0, team({ hp: { a: 80, b: 100, c: 0 } }), WIN);
    expect(r.hp).toEqual({ a: 70, b: 90, c: 0 });
    expect(r.xp).toEqual({ a: 40, b: 40 });
  });

  it('Watch: every creature gains 15 experience and loses nothing', () => {
    const r = resolveEvent(event('training-post'), 1, team(), WIN);
    expect(r.hp).toEqual({ a: 80, b: 100, c: 60 });
    expect(r.xp).toEqual({ a: 15, b: 15, c: 15 });
  });

  it('only Spar costs', () => {
    const options = event('training-post').options;
    expect(options.map(eventOptionCosts)).toEqual([true, false]);
  });
});

describe('Crystal Hollow', () => {
  it('Chip a crystal gives 3 scrap and 1 Essence; Sit in the glow heals 30%', () => {
    const chip = resolveEvent(event('crystal-hollow'), 0, team(), WIN);
    expect(chip.packDelta).toEqual({ bait: 0, essence: 1, scrap: 3 });
    const glow = resolveEvent(event('crystal-hollow'), 1, team(), WIN);
    expect(glow.hp).toEqual({ a: 100, b: 100, c: 90 });
  });
});

describe('Cursed Idol', () => {
  it('Take it gives a keepsake and a run-long curse with an exact line; Leave it does nothing', () => {
    const take = resolveEvent(event('cursed-idol'), 0, team(), WIN);
    expect(take.keepsakesGained).toHaveLength(1);
    expect(take.curses).toHaveLength(1);
    expect(take.curses?.[0]?.curse).toBe(true);
    expect(take.curses?.[0]?.effects).toEqual([{ op: 'foe_stat', stat: 'atk', bp: 2000 }]);
    expect(take.outcome).toContain('Foes deal 20% more damage.');
    const leave = resolveEvent(event('cursed-idol'), 1, team(), WIN);
    expect(leave.curses).toBeUndefined();
    expect(leave.outcome).toBe('Nothing happens.');
  });

  it('a keepsake def can carry curse: true and is then never given as a gift', () => {
    const withCurse = [
      ...clone(keepsakesJson),
      {
        id: 'test-curse',
        name: 'Test Curse',
        description: 'Foes deal 10% more damage.',
        effects: [{ op: 'foe_stat', stat: 'atk', bp: 1000 }],
        curse: true,
      },
    ];
    expect(() => loadDungeonRun(withCurse, eventsJson, dungeonContent)).not.toThrow();
    const bad = clone(withCurse);
    (bad[bad.length - 1] as Record<string, unknown>)['curse'] = false;
    expect(() => loadDungeonRun(bad, eventsJson, dungeonContent)).toThrow();
    // The shipped keepsakes are all gifts; the Idol's curse is not a keepsake of the pool.
    expect(dungeonGifts).toHaveLength(dungeonKeepsakes.length);
    expect(dungeonGifts.every((k) => k.curse !== true)).toBe(true);
  });

  it('Take it counts as costing; Leave it is the free option', () => {
    expect(event('cursed-idol').options.map(eventOptionCosts)).toEqual([true, false]);
  });
});

describe('Hungry Door', () => {
  const door = event('hungry-door');
  const treasure = { kind: 'supplies', supplyId: 'map-scrap-good', count: 2 } as const;
  const levels = { a: 7, b: 12, c: 9 };

  it('is rare, from depth 2, with its own treasure table', () => {
    expect(door.rare).toEqual({ fromDepth: 2 });
  });

  it('Feed it sends the highest-level standing creature home and takes the treasure', () => {
    const r = resolveEvent(door, 0, team({ levels, names: { b: 'Bee' }, treasure }), WIN);
    expect(r.sentHome).toEqual(['b']);
    expect(Object.keys(r.hp)).toEqual(['a', 'c']);
    expect(r.treasure).toEqual(treasure);
    expect(r.outcome).toBe('Bee heads home. You take the treasure.');
  });

  it('Feed it skips a knocked-out creature even if it is the highest level', () => {
    const r = resolveEvent(door, 0, team({ hp: { a: 80, b: 0, c: 60 }, levels, treasure }), WIN);
    expect(r.sentHome).toEqual(['c']);
  });

  it('a tie goes to the creature standing furthest left', () => {
    const r = resolveEvent(door, 0, team({ levels: { a: 9, b: 9, c: 9 }, treasure }), WIN);
    expect(r.sentHome).toEqual(['a']);
  });

  it('Feed it is not offered when fewer than two creatures stand', () => {
    const one = team({ hp: { a: 80, b: 0, c: 0 }, treasure });
    expect(eventOptionBlock(door.options[0] as never, one)).toBe('Needs two creatures standing.');
    expect(() => resolveEvent(door, 0, one, WIN)).toThrow(RangeError);
    expect(eventOptionBlock(door.options[1] as never, one)).toBeNull();
    expect(eventOptionBlock(door.options[0] as never, team())).toBeNull();
    // The other option still works with one creature standing.
    expect(resolveEvent(door, 1, one, WIN).treasure).toEqual(treasure);
  });

  it('Pry it open: 40% the treasure, 60% every creature loses 40% HP', () => {
    const win = resolveEvent(door, 1, team({ treasure }), WIN);
    expect(win.treasure).toEqual(treasure);
    expect(win.hp).toEqual({ a: 80, b: 100, c: 60 });
    const lose = resolveEvent(door, 1, team({ treasure }), LOSE);
    expect(lose.treasure).toBeUndefined();
    expect(lose.hp).toEqual({ a: 40, b: 60, c: 20 });
    const rng = createSeededRng('pry');
    let wins = 0;
    for (let i = 0; i < 4000; i++) {
      if (resolveEvent(door, 1, team({ treasure }), rng).won === true) wins += 1;
    }
    expect(wins / 4000).toBeGreaterThan(0.37);
    expect(wins / 4000).toBeLessThan(0.43);
  });

  it('Feed it is the free option (sending a creature home costs no HP and no run)', () => {
    expect(door.options.map(eventOptionCosts)).toEqual([false, true]);
  });
});

describe('the door treasure table', () => {
  const ctx = (extra: Partial<TreasureContext> = {}): TreasureContext => ({
    depth: 6,
    elements: ['tide', 'ember', 'grove'],
    knownBlueprints: new Set(),
    ...extra,
  });
  const door = treasureTable('door');

  it('is one tier down from the chasm and has no blueprints', () => {
    expect(door.gearRarity).toBe('rare');
    expect(door.supplies).toEqual({ tier: 'good', count: 2 });
    expect(door.shards).toBe(3);
    expect(door.glimmer).toBe(2);
    expect(door.blueprints).toBe(false);
    expect(treasureTable('chasm')).toBe(RULES.dungeon.treasure);
    expect(treasureKinds(ctx(), door)).toEqual(['gear', 'supplies', 'shards']);
    expect(treasureKinds(ctx())).toContain('blueprint');
  });

  it('draws only gear, supplies and shards, evenly, over many rolls', () => {
    const rng = createSeededRng('door-table');
    const counts: Record<string, number> = {};
    for (let i = 0; i < 3000; i++) {
      const t = rollTreasure(rng, ctx(), door);
      counts[t.kind] = (counts[t.kind] ?? 0) + 1;
      if (t.kind === 'gear') {
        expect(t.item.rarity).toBe('rare');
        expect(t.item.itemLevel).toBe(dungeonItemLevel(6, false));
      }
      if (t.kind === 'supplies') {
        expect(t.supplyId.endsWith('-good')).toBe(true);
        expect(t.count).toBe(2);
        expect(t.supplyId.startsWith('lure')).toBe(false);
      }
      if (t.kind === 'shards') {
        const shards = Object.entries(t.parts).filter(([k]) => k.endsWith('-shard'));
        expect(shards.reduce((n, [, v]) => n + v, 0)).toBe(3);
        expect(t.parts.glimmer).toBe(2);
      }
    }
    expect(Object.keys(counts).sort()).toEqual(['gear', 'shards', 'supplies']);
    for (const n of Object.values(counts)) {
      expect(n).toBeGreaterThan(850);
      expect(n).toBeLessThan(1150);
    }
  });

  it('never offers a blueprint even to a player who knows none', () => {
    const rng = createSeededRng('door-no-blueprint');
    for (let i = 0; i < 500; i++) {
      expect(rollTreasure(rng, ctx({ knownBlueprints: new Set() }), door).kind).not.toBe(
        'blueprint',
      );
    }
  });
});

describe('the schema of the new effects', () => {
  const events = (): Record<string, unknown>[] => clone(eventsJson);
  const optionOf = (list: Record<string, unknown>[], id: string, i: number) =>
    (
      (list.find((e) => e['id'] === id) as Record<string, unknown>)['options'] as Record<
        string,
        unknown
      >[]
    )[i] as Record<string, unknown>;

  it('loads the shipped content', () => {
    expect(() => load(eventsJson)).not.toThrow();
  });

  it('refuses a curse with a team effect, no effects, or an unknown key', () => {
    const base = (): Record<string, unknown>[] => events();
    const curseOf = (list: Record<string, unknown>[]) =>
      (
        (optionOf(list, 'cursed-idol', 0)['effects'] as Record<string, unknown>[])[1] as {
          curse: Record<string, unknown>;
        }
      ).curse;
    const a = base();
    curseOf(a)['effects'] = [{ op: 'team_stat', stat: 'atk', bp: -1000 }];
    refused(a);
    const b = base();
    curseOf(b)['effects'] = [];
    refused(b);
    const c = base();
    curseOf(c)['extra'] = 1;
    refused(c);
    const d = base();
    curseOf(d)['description'] = 'x'.repeat(91);
    refused(d);
    const e = base();
    delete curseOf(e)['curse'];
    refused(e);
  });

  it('refuses a send_home for anyone but the highest level, and a treasure of an unknown table', () => {
    const a = events();
    (
      (optionOf(a, 'hungry-door', 0)['effects'] as Record<string, unknown>[])[0] as Record<
        string,
        unknown
      >
    )['who'] = 'lowest_level';
    refused(a);
    const b = events();
    (
      (optionOf(b, 'hungry-door', 0)['effects'] as Record<string, unknown>[])[1] as Record<
        string,
        unknown
      >
    )['table'] = 'vault';
    refused(b);
  });

  it('counts a curse as a cost: a curse beside a hurt loads only with a free option beside it', () => {
    const list = events();
    const idol = list.find((e) => e['id'] === 'cursed-idol') as Record<string, unknown>;
    const options = idol['options'] as Record<string, unknown>[];
    (options[1] as Record<string, unknown>)['effects'] = [{ op: 'hurt', bp: 1000 }];
    refused(list);
  });

  it('refuses two treasures of different tables in one event, or two curses', () => {
    const a = events();
    const doorOptions = (a.find((e) => e['id'] === 'hungry-door') as Record<string, unknown>)[
      'options'
    ] as Record<string, unknown>[];
    (
      ((doorOptions[1] as Record<string, unknown>)['effects'] as Record<string, unknown>[])[0] as {
        win: Record<string, unknown>[];
      }
    ).win = [{ op: 'treasure' }];
    refused(a);
    const b = events();
    const effects = optionOf(b, 'cursed-idol', 0)['effects'] as Record<string, unknown>[];
    effects.push(clone(effects[1]) as Record<string, unknown>);
    refused(b);
  });
});
