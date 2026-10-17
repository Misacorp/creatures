import { describe, expect, it } from 'vitest';
import {
  RULES,
  addFightsCleared,
  addPack,
  campOffers,
  campRest,
  createSeededRng,
  dungeonContent,
  dungeonEvent,
  dungeonEvents,
  dungeonKeepsake,
  dungeonKeepsakes,
  emptyPack,
  generateDungeonMap,
  keptOnDefeat,
  landmarkBossId,
  mapNode,
  mapView,
  nodeLoot,
  resolveEvent,
  roomSpecForNode,
  scaledFoe,
  type DungeonEventDef,
  type DungeonMap,
  type EventContext,
  type MapNode,
  type Rng,
} from '../src/index';

const map = generateDungeonMap(createSeededRng('run-map'));
const maps = Array.from({ length: 100 }, (_, i) =>
  generateDungeonMap(createSeededRng(`run-maps-${String(i)}`)),
);
const nodeOfKind = (m: DungeonMap, kind: MapNode['kind']): MapNode => {
  const found = m.nodes.find((n) => n.kind === kind);
  if (found === undefined) throw new Error(`no ${kind}`);
  return found;
};

/** A source that always returns the same number: 0 wins every gamble, WORST loses every gamble. */
const fixed = (value: number): Rng => ({ nextU32: () => value });
const WIN = fixed(0);
const LOSE = fixed(4_294_959_999); // 9999 mod 10000: above every chance a gamble can have

describe('rooms from nodes', () => {
  it('a fight is the foe at the depth, with its modifier, both embedded in full', () => {
    const node = nodeOfKind(map, 'fight');
    const spec = roomSpecForNode(map, node.id, 5, 2);
    const foe = dungeonContent.foes.find((f) => f.id === node.foeId);
    expect(spec.index).toBe(2);
    expect(spec.foe).toEqual(foe);
    expect(spec.modifier.id).toBe(node.modifierId);
    const scaled = scaledFoe(foe as NonNullable<typeof foe>, 5);
    expect(spec.hp).toBe(scaled.hp);
    expect(spec.atk).toBe(scaled.atk);
    expect(spec.elite).toBeUndefined();
    expect(spec.keepsakes).toBeUndefined();
  });

  it('an elite has the boost on top of the depth, and the flag', () => {
    const node = nodeOfKind(map, 'elite');
    const spec = roomSpecForNode(map, node.id, 3, 0);
    const scaled = scaledFoe(spec.foe, 3);
    expect(spec.elite).toBe(true);
    expect(spec.hp).toBe(Math.floor((scaled.hp * RULES.dungeon.elite.hpBp) / 10_000));
    expect(spec.atk).toBe(Math.floor((scaled.atk * RULES.dungeon.elite.atkBp) / 10_000));
    expect(spec.hp).toBeGreaterThan(scaled.hp);
    expect(spec.atk).toBeGreaterThan(scaled.atk);
  });

  it('the boss is the map boss on a plain depth and the landmark boss on a landmark', () => {
    const boss = nodeOfKind(map, 'boss');
    expect(roomSpecForNode(map, boss.id, 6, 3).foe.id).toBe(boss.foeId);
    for (const depth of [7, 14, 21, 28, 35]) {
      const landmark = landmarkBossId(depth) as string;
      const spec = roomSpecForNode(map, boss.id, depth, 3);
      expect(spec.foe.id).toBe(landmark);
      expect(spec.foe.signature).toBeDefined();
      expect(spec.hp).toBe(scaledFoe(spec.foe, depth).hp);
      // The modifier is still the node's.
      expect(spec.modifier.id).toBe(boss.modifierId);
    }
  });

  it('refuses a node that is not a fight, and one that is not on the map', () => {
    expect(() => roomSpecForNode(map, 'f3l1', 1, 0)).toThrow(RangeError);
    expect(() => roomSpecForNode(map, 'f9l9', 1, 0)).toThrow(RangeError);
    const mystery = nodeOfKind(map, 'mystery');
    expect(() => roomSpecForNode(map, mystery.id, 1, 0)).toThrow(RangeError);
  });

  it('builds every room of many maps', () => {
    for (const m of maps) {
      for (const n of m.nodes) {
        if (n.kind === 'fight' || n.kind === 'elite' || n.kind === 'boss') {
          expect(roomSpecForNode(m, n.id, 1 + (n.floor % 9), n.floor).hp).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('the pack', () => {
  it('starts empty and adds', () => {
    expect(emptyPack()).toEqual({ bait: 0, essence: 0, scrap: 0 });
    expect(addPack({ bait: 1, essence: 2, scrap: 3 }, { bait: 4, essence: 0, scrap: 1 })).toEqual({
      bait: 5,
      essence: 2,
      scrap: 4,
    });
  });

  it('gives the loot of each kind of room from the rules, and nothing for a camp or a mystery', () => {
    for (const kind of ['fight', 'elite', 'cache', 'boss'] as const) {
      expect(nodeLoot(kind)).toEqual(RULES.dungeon.loot[kind]);
    }
    expect(nodeLoot('camp')).toEqual(emptyPack());
    expect(nodeLoot('mystery')).toEqual(emptyPack());
    // The loot returned is a copy.
    nodeLoot('fight').bait = 99;
    expect(nodeLoot('fight').bait).toBe(RULES.dungeon.loot.fight.bait);
  });

  it('keeps half of each amount on a defeat, rounded up', () => {
    expect(RULES.dungeon.defeatKeepBp).toBe(5_000);
    const kept = (n: number): number => keptOnDefeat({ bait: n, essence: n, scrap: n }).bait;
    expect([0, 1, 2, 3, 4, 5, 6, 7, 11].map(kept)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 6]);
    expect(keptOnDefeat({ bait: 3, essence: 1, scrap: 0 })).toEqual({
      bait: 2,
      essence: 1,
      scrap: 0,
    });
  });

  it('never keeps more than was found and never less than half', () => {
    for (let n = 0; n <= 40; n++) {
      const k = keptOnDefeat({ bait: n, essence: 0, scrap: 0 }).bait;
      expect(k).toBeLessThanOrEqual(n);
      expect(k * 2).toBeGreaterThanOrEqual(n);
    }
  });
});

describe('events', () => {
  const ctx = (over: Partial<EventContext> = {}): EventContext => ({
    hp: { a: 50, b: 100, c: 0 },
    hpMax: { a: 100, b: 100, c: 100 },
    keepsakes: [],
    ...over,
  });
  /** An event whose option 0 has `effects` and whose option 1 does nothing. */
  const event = (effects: unknown[]): DungeonEventDef =>
    ({
      id: 'test',
      name: 'Test',
      text: 'A test scene.',
      options: [
        { label: 'Try', description: 'It does something.', effects },
        { label: 'Leave', description: 'Nothing happens.', effects: [{ op: 'nothing' }] },
      ],
    }) as DungeonEventDef;

  it('a pack effect adds loot, and the outcome says so', () => {
    const r = resolveEvent(event([{ op: 'pack', bait: 2, scrap: 1 }]), 0, ctx(), WIN);
    expect(r.packDelta).toEqual({ bait: 2, essence: 0, scrap: 1 });
    expect(r.outcome).toBe('You find 2 Bait and 1 scrap.');
    expect(r.won).toBeNull();
    expect(r.hp).toEqual({ a: 50, b: 100, c: 0 });
  });

  it('heal raises standing creatures by a share of max HP, never above max, and leaves the fallen down', () => {
    const r = resolveEvent(event([{ op: 'heal', bp: 2500 }]), 0, ctx(), WIN);
    expect(r.hp).toEqual({ a: 75, b: 100, c: 0 });
    expect(r.outcome).toBe('Every creature heals 25% of its max HP.');
    const big = resolveEvent(event([{ op: 'heal', bp: 10_000 }]), 0, ctx(), WIN);
    expect(big.hp).toEqual({ a: 100, b: 100, c: 0 });
  });

  it('hurt lowers standing creatures by a share of max HP, never below 1', () => {
    const r = resolveEvent(event([{ op: 'hurt', bp: 1500 }]), 0, ctx(), WIN);
    expect(r.hp).toEqual({ a: 35, b: 85, c: 0 });
    expect(r.outcome).toBe('Every creature loses 15% of its max HP.');
    const hard = resolveEvent(
      event([{ op: 'hurt', bp: 5000 }]),
      0,
      ctx({ hp: { a: 3, b: 1, c: 0 } }),
      WIN,
    );
    expect(hard.hp).toEqual({ a: 1, b: 1, c: 0 });
  });

  it('does not change the context it is given', () => {
    const c = ctx();
    const before = JSON.stringify(c);
    resolveEvent(event([{ op: 'hurt', bp: 2000 }, { op: 'keepsake' }]), 0, c, WIN);
    expect(JSON.stringify(c)).toBe(before);
  });

  it('a keepsake effect gives one the run does not hold, and none when all are held', () => {
    const held = dungeonKeepsakes.slice(1).map((k) => k.id);
    const r = resolveEvent(event([{ op: 'keepsake' }]), 0, ctx({ keepsakes: held }), WIN);
    expect(r.keepsakesGained).toEqual([dungeonKeepsakes[0]?.id]);
    expect(r.outcome).toBe(`You gain the ${dungeonKeepsakes[0]?.name}.`);
    const all = dungeonKeepsakes.map((k) => k.id);
    const none = resolveEvent(event([{ op: 'keepsake' }]), 0, ctx({ keepsakes: all }), WIN);
    expect(none.keepsakesGained).toEqual([]);
    expect(none.outcome).toBe('There is nothing more to take here.');
  });

  it('two keepsake effects never give the same one twice', () => {
    for (let i = 0; i < 40; i++) {
      const r = resolveEvent(
        event([{ op: 'keepsake' }, { op: 'keepsake' }]),
        0,
        ctx(),
        createSeededRng(`two-${String(i)}`),
      );
      expect(new Set(r.keepsakesGained).size).toBe(2);
    }
  });

  it('nothing says "Nothing happens."', () => {
    const r = resolveEvent(event([{ op: 'nothing' }]), 0, ctx(), WIN);
    expect(r.outcome).toBe('Nothing happens.');
    expect(r.hp).toEqual({ a: 50, b: 100, c: 0 });
    expect(r.packDelta).toEqual(emptyPack());
  });

  const gamble = event([
    {
      op: 'gamble',
      chanceBp: 6000,
      win: [{ op: 'pack', scrap: 2 }],
      lose: [{ op: 'hurt', bp: 1500 }],
    },
  ]);

  it('a gamble plays its win branch when the roll is under the chance', () => {
    const r = resolveEvent(gamble, 0, ctx(), WIN);
    expect(r.won).toBe(true);
    expect(r.packDelta.scrap).toBe(2);
    expect(r.hp).toEqual({ a: 50, b: 100, c: 0 });
    expect(r.outcome).toBe('Lucky! You find 2 scrap.');
  });

  it('a gamble plays its lose branch otherwise', () => {
    const r = resolveEvent(gamble, 0, ctx(), LOSE);
    expect(r.won).toBe(false);
    expect(r.packDelta).toEqual(emptyPack());
    expect(r.hp).toEqual({ a: 35, b: 85, c: 0 });
    expect(r.outcome).toBe('No luck. Every creature loses 15% of its max HP.');
  });

  it('a gamble that loses into nothing says so', () => {
    const e = event([
      { op: 'gamble', chanceBp: 5000, win: [{ op: 'pack', bait: 1 }], lose: [{ op: 'nothing' }] },
    ]);
    expect(resolveEvent(e, 0, ctx(), LOSE).outcome).toBe('No luck. Nothing happens.');
  });

  it('a gamble draws once, and its odds are the chance (about 60 in 100)', () => {
    let draws = 0;
    const counting: Rng = { nextU32: () => (draws++, 0) };
    resolveEvent(gamble, 0, ctx(), counting);
    expect(draws).toBe(1);
    let wins = 0;
    const rng = createSeededRng('odds');
    for (let i = 0; i < 2000; i++) if (resolveEvent(gamble, 0, ctx(), rng).won === true) wins += 1;
    expect(wins).toBeGreaterThan(1100);
    expect(wins).toBeLessThan(1300);
  });

  it('refuses an option that does not exist', () => {
    expect(() => resolveEvent(gamble, 2, ctx(), WIN)).toThrow(RangeError);
    expect(() => resolveEvent(gamble, -1, ctx(), WIN)).toThrow(RangeError);
  });

  it('every shipped option resolves, both ways, and stays in bounds', () => {
    for (const e of dungeonEvents) {
      for (const option of [0, 1]) {
        for (const rng of [WIN, LOSE]) {
          const r = resolveEvent(e, option, ctx(), rng);
          expect(r.outcome.length, e.id).toBeGreaterThan(0);
          for (const [id, hp] of Object.entries(r.hp)) {
            expect(hp).toBeGreaterThanOrEqual(id === 'c' ? 0 : 1);
            expect(hp).toBeLessThanOrEqual(100);
          }
          expect(r.hp['c']).toBe(0);
        }
      }
    }
  });
});

describe('the camp', () => {
  it('offers two different keepsakes the run does not hold', () => {
    for (let i = 0; i < 50; i++) {
      const held = dungeonKeepsakes.slice(0, i % 4).map((k) => k.id);
      const offers = campOffers(createSeededRng(`camp-${String(i)}`), held);
      expect(offers).toHaveLength(RULES.dungeon.camp.offers);
      expect(new Set(offers).size).toBe(offers.length);
      for (const id of offers) {
        expect(held).not.toContain(id);
        expect(dungeonKeepsake(id)).toBeDefined();
      }
    }
  });

  it('is the same for the same stream, and offers what is left when little is', () => {
    expect(campOffers(createSeededRng('x'), [])).toEqual(campOffers(createSeededRng('x'), []));
    const all = dungeonKeepsakes.map((k) => k.id);
    expect(campOffers(createSeededRng('x'), all.slice(1))).toEqual([all[0]]);
    expect(campOffers(createSeededRng('x'), all)).toEqual([]);
  });

  it('Rest heals standing creatures by the camp share of max HP, never above max, and leaves the fallen down', () => {
    const out = campRest({ a: 10, b: 90, c: 0 }, { a: 100, b: 100, c: 100 });
    expect(out).toEqual({
      a: 10 + Math.floor((100 * RULES.dungeon.camp.restBp) / 10_000),
      b: 100,
      c: 0,
    });
    expect(out['a']).toBe(50);
  });
});

describe('experience tally', () => {
  it('counts a cleared fight for each creature that stood in the row', () => {
    let tally: Record<string, number> = {};
    tally = addFightsCleared(tally, ['a', 'b', 'c']);
    tally = addFightsCleared(tally, ['a', 'b', 'c']);
    const afterSwap = addFightsCleared(tally, ['a', 'b', 'd']);
    expect(tally).toEqual({ a: 2, b: 2, c: 2 });
    expect(afterSwap).toEqual({ a: 3, b: 3, c: 2, d: 1 });
  });
});

describe('mapView', () => {
  it('mirrors the map and shows the foe at the depth, modifiers and event names', () => {
    const view = mapView(map, 4);
    expect(view.floors).toBe(map.floors);
    expect(view.nodes.map((n) => n.id)).toEqual(map.nodes.map((n) => n.id));
    for (const n of view.nodes) {
      const raw = mapNode(map, n.id) as MapNode;
      expect(n.kind).toBe(raw.kind);
      expect(n.next).toEqual(raw.next);
      if (raw.kind === 'fight' || raw.kind === 'elite' || raw.kind === 'boss') {
        const foe = dungeonContent.foes.find((f) => f.id === raw.foeId);
        expect(n.foe).toMatchObject({
          id: foe?.id,
          name: foe?.name,
          element: foe?.element,
          kind: foe?.kind,
          elite: raw.kind === 'elite',
        });
        expect(n.modifier?.id).toBe(raw.modifierId);
        expect(n.modifier?.description.length).toBeGreaterThan(0);
        // The same HP the room is fought with.
        expect(n.foe?.hpMax).toBe(roomSpecForNode(map, raw.id, 4, 0).hp);
      } else {
        expect(n.foe).toBeUndefined();
        expect(n.modifier).toBeUndefined();
      }
      if (raw.kind === 'mystery') {
        const e = dungeonEvent(raw.eventId as string);
        expect(n.event).toEqual({ id: e?.id, name: e?.name });
      } else {
        expect(n.event).toBeUndefined();
      }
    }
  });

  it('never shows the scene or the options of an event before the player is in the room', () => {
    const json = JSON.stringify(mapView(map, 1));
    for (const e of dungeonEvents) {
      expect(json).not.toContain(e.text);
      for (const o of e.options) expect(json).not.toContain(o.description);
    }
  });

  it('grows with the depth and shows an elite stronger than a normal foe', () => {
    const shallow = mapView(map, 1);
    const deep = mapView(map, 20);
    const hp = (v: typeof shallow, id: string): number =>
      v.nodes.find((n) => n.id === id)?.foe?.hpMax ?? 0;
    const fight = nodeOfKind(map, 'fight');
    expect(hp(deep, fight.id)).toBeGreaterThan(hp(shallow, fight.id));
    const elite = nodeOfKind(map, 'elite');
    const spec = roomSpecForNode(map, elite.id, 1, 0);
    expect(hp(shallow, elite.id)).toBe(spec.hp);
    expect(spec.hp).toBeGreaterThan(scaledFoe(spec.foe, 1).hp);
  });

  it('shows the landmark boss on a landmark depth, and the map boss otherwise', () => {
    const boss = nodeOfKind(map, 'boss');
    const plain = mapView(map, 6).nodes.find((n) => n.id === boss.id);
    expect(plain?.foe?.id).toBe(boss.foeId);
    const landmark = mapView(map, 7).nodes.find((n) => n.id === boss.id);
    expect(landmark?.foe?.id).toBe(landmarkBossId(7));
    expect(landmark?.foe?.kind).toBe('boss');
  });

  it('is plain JSON', () => {
    const view = mapView(map, 3);
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });
});
