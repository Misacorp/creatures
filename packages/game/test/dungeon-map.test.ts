import { describe, expect, it } from 'vitest';
import {
  RULES,
  createSeededRng,
  dungeonContent,
  dungeonEvents,
  dungeonFoe,
  dungeonMapValid,
  generateDungeonMap,
  mapNode,
  nodeId,
  reachableNodes,
  type DungeonMap,
  type MapNode,
} from '../src/index';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const SEEDS = 600;
const maps: DungeonMap[] = Array.from({ length: SEEDS }, (_, i) =>
  generateDungeonMap(createSeededRng(`map-${String(i)}`)),
);

const floorOf = (map: DungeonMap, floor: number): MapNode[] =>
  map.nodes.filter((n) => n.floor === floor);
const node = (map: DungeonMap, id: string): MapNode => {
  const found = mapNode(map, id);
  if (found === undefined) throw new Error(`no node ${id}`);
  return found;
};

describe('the rules the map uses', () => {
  it('has the numbers of the design', () => {
    const d = RULES.dungeon;
    expect(d.floors).toBe(7);
    expect(d.campFloor).toBe(3);
    expect(d.map.twoNodeFloorBp).toBe(3_500);
    expect(Object.values(d.map.kinds).reduce((a, b) => a + b, 0)).toBe(10_000);
    expect(d.elite).toEqual({ hpBp: 14_000, atkBp: 12_000 });
    expect(d.camp).toEqual({ restBp: 4_000, offers: 2 });
    expect(d.defeatKeepBp).toBe(5_000);
  });
});

describe('generateDungeonMap', () => {
  it('draws a valid map for every one of many seeds', () => {
    expect(maps.length).toBeGreaterThanOrEqual(500);
    for (const [i, map] of maps.entries())
      expect(dungeonMapValid(map), `seed ${String(i)}`).toBe(true);
  });

  it('is the same for the same stream and differs between streams', () => {
    const a = generateDungeonMap(createSeededRng('same'));
    const b = generateDungeonMap(createSeededRng('same'));
    expect(b).toEqual(a);
    const distinct = new Set(maps.slice(0, 50).map((m) => JSON.stringify(m)));
    expect(distinct.size).toBeGreaterThan(40);
  });

  it('has seven floors with a camp and a boss in the middle lane', () => {
    for (const map of maps) {
      expect(map.floors).toBe(7);
      expect(floorOf(map, 3).map((n) => [n.id, n.kind])).toEqual([['f3l1', 'camp']]);
      expect(floorOf(map, 6).map((n) => [n.id, n.kind])).toEqual([['f6l1', 'boss']]);
      for (const f of [0, 1, 2, 4, 5]) {
        const lanes = floorOf(map, f).map((n) => n.lane);
        expect(lanes.length === 2 || lanes.length === 3).toBe(true);
        // Two nodes leave out lane 0 or lane 2, never the middle.
        if (lanes.length === 2) expect(lanes.includes(1)).toBe(true);
      }
    }
  });

  it('has the paths of the design: lane steps, no crossings, exits and ways in', () => {
    for (const map of maps) {
      for (const n of map.nodes) {
        for (const id of n.next) {
          const to = node(map, id);
          expect(to.floor).toBe(n.floor + 1);
          expect(Math.abs(to.lane - n.lane)).toBeLessThanOrEqual(1);
        }
        if ([0, 1, 4, 5].includes(n.floor)) {
          expect(n.next.length).toBeGreaterThanOrEqual(1);
          expect(n.next.length).toBeLessThanOrEqual(2);
        }
        if (n.floor > 0) expect(map.nodes.some((p) => p.next.includes(n.id))).toBe(true);
      }
      // Floor 2 leads only to the camp, the camp to all of floor 4, floor 5 to the boss.
      for (const n of floorOf(map, 2)) expect(n.next).toEqual(['f3l1']);
      expect(node(map, 'f3l1').next.sort()).toEqual(
        floorOf(map, 4)
          .map((n) => n.id)
          .sort(),
      );
      for (const n of floorOf(map, 5)) expect(n.next).toEqual(['f6l1']);
    }
  });

  it('every node is reachable from floor 0 and reaches the boss', () => {
    for (const map of maps) {
      const seen = new Set<string>();
      let frontier = reachableNodes(map, null);
      while (frontier.length > 0) {
        for (const id of frontier) seen.add(id);
        frontier = frontier.flatMap((id) => reachableNodes(map, id));
      }
      expect(seen.size).toBe(map.nodes.length);
      const canReachBoss = (id: string): boolean =>
        id === 'f6l1' || node(map, id).next.some(canReachBoss);
      expect(map.nodes.every((n) => canReachBoss(n.id))).toBe(true);
    }
  });

  it('follows the kind rules', () => {
    const m = RULES.dungeon.map;
    for (const map of maps) {
      expect(floorOf(map, 0).every((n) => n.kind === 'fight')).toBe(true);
      const count = (kind: string): number => map.nodes.filter((n) => n.kind === kind).length;
      expect(count('elite')).toBeGreaterThanOrEqual(m.minElites);
      expect(count('elite')).toBeLessThanOrEqual(m.maxElites);
      expect(count('cache')).toBeLessThanOrEqual(m.maxCaches);
      expect(count('mystery')).toBeGreaterThanOrEqual(m.minMysteries);
      expect(count('mystery')).toBeLessThanOrEqual(m.maxMysteries);
      for (const n of map.nodes.filter((x) => x.kind === 'elite')) {
        expect(m.eliteFloors as readonly number[]).toContain(n.floor);
      }
      for (let f = 0; f <= 6; f++) {
        expect(floorOf(map, f).filter((n) => n.kind === 'elite').length).toBeLessThanOrEqual(1);
      }
      // Siblings (two nodes with the same parent) are never both a cache or both a mystery.
      for (const parent of map.nodes) {
        for (const kind of ['cache', 'mystery']) {
          expect(
            parent.next.filter((id) => node(map, id).kind === kind).length,
          ).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('fills the rooms: real foes, none twice on a floor, three elements, events once, a floor boss', () => {
    for (const map of maps) {
      const elements = new Set<string>();
      const events = new Set<string>();
      for (const n of map.nodes) {
        if (n.kind === 'fight' || n.kind === 'elite') {
          const foe = dungeonFoe(n.foeId ?? '');
          expect(foe?.kind).toBe('foe');
          expect(n.modifierId).toBeDefined();
          elements.add(foe?.element ?? '');
        } else if (n.kind === 'boss') {
          expect(dungeonFoe(n.foeId ?? '')?.kind).toBe('boss');
          expect(n.modifierId).toBeDefined();
        } else if (n.kind === 'mystery') {
          expect(dungeonEvents.some((e) => e.id === n.eventId)).toBe(true);
          expect(events.has(n.eventId ?? '')).toBe(false);
          events.add(n.eventId ?? '');
        } else {
          expect(n.foeId ?? n.modifierId ?? n.eventId).toBeUndefined();
        }
      }
      expect(elements.size).toBeGreaterThanOrEqual(RULES.dungeon.map.minElements);
      for (let f = 0; f < 6; f++) {
        const ids = floorOf(map, f)
          .map((n) => n.foeId)
          .filter((id) => id !== undefined);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });

  it('roughly follows the odds', () => {
    const rolled = maps.flatMap((m) => m.nodes.filter((n) => [1, 2, 4, 5].includes(n.floor)));
    const share = (kind: string): number =>
      rolled.filter((n) => n.kind === kind).length / rolled.length;
    // The caps and the repairs pull these a little away from 55 / 25 / 10 / 10, but not far.
    expect(share('fight')).toBeGreaterThan(0.5);
    expect(share('fight')).toBeLessThan(0.75);
    expect(share('mystery')).toBeGreaterThan(0.12);
    expect(share('mystery')).toBeLessThan(0.3);
    expect(share('cache')).toBeGreaterThan(0.02);
    expect(share('cache')).toBeLessThan(0.1);
    expect(share('elite')).toBeGreaterThan(0.03);
    expect(share('elite')).toBeLessThan(0.15);
    // 35% of the floors with a choice have two nodes.
    const floors = maps.flatMap((m) => [0, 1, 2, 4, 5].map((f) => floorOf(m, f).length));
    const twos = floors.filter((n) => n === 2).length / floors.length;
    expect(twos).toBeGreaterThan(0.3);
    expect(twos).toBeLessThan(0.4);
    // Both ways of leaving out a lane happen.
    const left = maps.flatMap((m) =>
      [0, 1, 2, 4, 5].map((f) =>
        floorOf(m, f)
          .map((n) => n.lane)
          .join(),
      ),
    );
    expect(left).toContain('0,1');
    expect(left).toContain('1,2');
  });

  it('draws from the content it is given and fails when it cannot fill a map', () => {
    const pack = {
      foes: dungeonContent.foes,
      modifiers: dungeonContent.modifiers,
      events: dungeonEvents,
    };
    expect(() =>
      generateDungeonMap(createSeededRng('few'), { ...pack, events: dungeonEvents.slice(0, 0) }),
    ).toThrow();
    expect(() =>
      generateDungeonMap(createSeededRng('few'), {
        ...pack,
        foes: dungeonContent.foes.filter((f) => f.kind === 'boss'),
      }),
    ).toThrow();
  });
});

describe('dungeonMapValid refuses a map that breaks a rule', () => {
  const wide = maps.find((m) => [0, 1, 2, 4, 5].every((f) => floorOf(m, f).length === 3));
  const base = (): DungeonMap => clone(wide as DungeonMap);
  const edit = (change: (m: DungeonMap) => void): DungeonMap => {
    const m = base();
    change(m);
    return m;
  };
  const cases: [string, (m: DungeonMap) => void][] = [
    ['an unknown key', (m) => ((m.nodes[0] as unknown as Record<string, unknown>)['x'] = 1)],
    ['wrong floors', (m) => (m.floors = 6)],
    ['a missing node', (m) => (m.nodes = m.nodes.filter((n) => n.id !== 'f0l0'))],
    ['a node of the wrong id', (m) => (node(m, 'f1l1').id = 'f1l0')],
    ['an elite on floor 1', (m) => (node(m, 'f1l1').kind = 'elite')],
    ['a camp that is a fight', (m) => (node(m, 'f3l1').kind = 'fight')],
    ['a fight on the boss floor', (m) => (node(m, 'f6l1').kind = 'fight')],
    ['floor 0 with a mystery', (m) => (node(m, 'f0l0').kind = 'mystery')],
    ['an edge that skips a floor', (m) => node(m, 'f0l0').next.push('f2l0')],
    ['an edge that jumps two lanes', (m) => (node(m, 'f1l0').next = ['f2l2'])],
    ['a node with no exit', (m) => (node(m, 'f1l1').next = [])],
    ['a node with three exits', (m) => (node(m, 'f1l1').next = ['f2l0', 'f2l1', 'f2l2'])],
    ['a floor-2 node that skips the camp', (m) => (node(m, 'f2l0').next = [])],
    ['a camp that misses a floor-4 node', (m) => (node(m, 'f3l1').next = ['f4l0'])],
    ['a foe that is not in the content', (m) => (node(m, 'f0l0').foeId = 'no-such-foe')],
    ['a fight with no modifier', (m) => delete node(m, 'f0l0').modifierId],
    ['a boss that is a normal foe', (m) => (node(m, 'f6l1').foeId = 'puddle-imp')],
    ['a camp that holds a foe', (m) => (node(m, 'f3l1').foeId = 'puddle-imp')],
    [
      'the same foe twice on a floor',
      (m) => (node(m, 'f0l1').foeId = node(m, 'f0l0').foeId as string),
    ],
  ];
  it('accepts the map before the change', () => expect(dungeonMapValid(base())).toBe(true));
  for (const [name, change] of cases) {
    it(`refuses ${name}`, () => expect(dungeonMapValid(edit(change))).toBe(false));
  }

  it('refuses crossing edges', () => {
    // Make every f1 node reach f2 crossed: l0 -> l1 and l1 -> l0 cross each other.
    const m = base();
    node(m, 'f1l0').next = ['f2l1'];
    node(m, 'f1l1').next = ['f2l0'];
    expect(dungeonMapValid(m)).toBe(false);
  });

  it('refuses a map with no elite, no mystery, two caches, an event twice or sibling mysteries', () => {
    const toFight = (from: string) => (m: DungeonMap) => {
      for (const n of m.nodes.filter((x) => x.kind === from)) {
        n.kind = 'fight';
        delete n.eventId;
        n.foeId = 'puddle-imp';
        n.modifierId = 'flooded';
      }
    };
    expect(dungeonMapValid(edit(toFight('mystery')))).toBe(false);
    expect(dungeonMapValid(edit(toFight('elite')))).toBe(false);

    // Two caches: the map's own, or two made from fights on floors 1 and 4 (not siblings).
    const twoCaches = edit((m) => {
      for (const id of ['f1l0', 'f4l0']) {
        const n = node(m, id);
        n.kind = 'cache';
        delete n.foeId;
        delete n.modifierId;
      }
    });
    expect(twoCaches.nodes.filter((n) => n.kind === 'cache').length).toBeGreaterThanOrEqual(2);
    expect(dungeonMapValid(twoCaches)).toBe(false);

    const many = maps.find((m) => m.nodes.filter((n) => n.kind === 'mystery').length >= 2);
    const twice = clone(many as DungeonMap);
    const mysteries = twice.nodes.filter((n) => n.kind === 'mystery');
    (mysteries[1] as MapNode).eventId = mysteries[0]?.eventId as string;
    expect(dungeonMapValid(twice)).toBe(false);

    // Two mysteries on floor 4 share the camp as their parent.
    const siblings = edit((m) => {
      for (const id of ['f4l0', 'f4l1']) {
        const n = node(m, id);
        n.kind = 'mystery';
        delete n.foeId;
        delete n.modifierId;
        n.eventId = dungeonEvents.find((e) => !m.nodes.some((x) => x.eventId === e.id))
          ?.id as string;
      }
    });
    expect(dungeonMapValid(siblings)).toBe(false);
  });

  it('refuses a map with fewer than three elements among the fights', () => {
    const m = base();
    const wisp = dungeonContent.foes.filter((f) => f.kind === 'foe' && f.element === 'tide');
    // Every floor keeps different foes, but only two elements are used.
    for (let f = 0; f < 6; f++) {
      const rooms = floorOf(m, f).filter((n) => n.foeId !== undefined && n.kind !== 'boss');
      const pool = dungeonContent.foes.filter(
        (x) => x.kind === 'foe' && (x.element === 'tide' || x.element === 'ember'),
      );
      rooms.forEach((n, i) => (n.foeId = pool[i % pool.length]?.id as string));
    }
    expect(wisp.length).toBe(2);
    expect(dungeonMapValid(m)).toBe(false);
  });

  it('never throws on garbage', () => {
    for (const bad of [null, undefined, 3, 'x', [], {}, { floors: 7 }, { floors: 7, nodes: 'x' }]) {
      expect(dungeonMapValid(bad)).toBe(false);
    }
  });
});

describe('reachableNodes and mapNode', () => {
  const map = maps[0] as DungeonMap;

  it('null is the floor-0 nodes, a node leads to its exits, the boss to nothing', () => {
    expect(reachableNodes(map, null)).toEqual(floorOf(map, 0).map((n) => n.id));
    const n = floorOf(map, 0)[0] as MapNode;
    expect(reachableNodes(map, n.id)).toEqual(n.next);
    expect(reachableNodes(map, 'f6l1')).toEqual([]);
    expect(reachableNodes(map, 'nope')).toEqual([]);
  });

  it('returns a copy, so a caller cannot change the map', () => {
    const n = floorOf(map, 0)[0] as MapNode;
    reachableNodes(map, n.id).push('x');
    expect(n.next).not.toContain('x');
  });

  it('finds a node by id', () => {
    expect(mapNode(map, nodeId(3, 1))?.kind).toBe('camp');
    expect(mapNode(map, 'f9l9')).toBeUndefined();
  });
});
