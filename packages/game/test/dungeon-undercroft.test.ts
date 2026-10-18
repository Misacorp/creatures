import { describe, expect, it } from 'vitest';
import {
  RULES,
  UNDERCROFT_MARKS,
  catchBreath,
  createSeededRng,
  dungeonContent,
  dungeonEvents,
  dungeonFoe,
  dungeonGearOddsBp,
  dungeonMapValid,
  drawMark,
  generateDungeonMap,
  generateUndercroftMap,
  landmarkBossId,
  mapNode,
  mapView,
  nodeLoot,
  reachableNodes,
  rollUndercroftChest,
  roomSpecForNode,
  scaledFoe,
  undercroftBaseFloors,
  undercroftDepth,
  undercroftFloorCount,
  undercroftGearOddsBp,
  undercroftLabel,
  undercroftMapValid,
  undercroftOpen,
  type DungeonMap,
  type MapNode,
  type UndercroftMark,
  type UndercroftSpec,
} from '../src/index';

const u = RULES.dungeon.undercroft;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const SPECS: UndercroftSpec[] = [
  { level: 1, floors: 2, marks: [] },
  { level: 1, floors: 3, marks: ['mystery'] },
  { level: 1, floors: 2, marks: ['cache', 'elite', 'fight'] },
  { level: 1, floors: 2, marks: ['fight', 'camp'] },
  { level: 1, floors: 5, marks: ['epic', 'camp'] },
  { level: 1, floors: 2, marks: ['camp', 'epic'] },
  { level: 2, floors: 2, marks: [] },
  { level: 3, floors: 2, marks: [] },
];
const SEEDS = 150;
const drawn = SPECS.flatMap((spec, s) =>
  Array.from({ length: SEEDS }, (_, i) => ({
    spec,
    map: generateUndercroftMap(createSeededRng(`uc-${String(s)}-${String(i)}`), spec),
    seed: `${String(s)}-${String(i)}`,
  })),
);

describe('the Undercroft rules', () => {
  it('has the numbers of the design', () => {
    expect(u).toMatchObject({
      fromDepth: 8,
      catchBreathBp: 2_000,
      depthBonus: 3,
      baseFloors: 2,
      perLandmark: 1,
      maxFloors: 5,
      maxMarks: 2,
      lootMultiplier: 2,
      crackBp: 1_500,
      maxLevels: 3,
      doorFloors: [4, 5],
    });
    expect(u.epic.loot).toEqual({ bait: 0, essence: 1, scrap: 2 });
    expect(u.chest).toMatchObject({ essence: 1, scrap: 2, gearBp: 4_000, itemLevelBonus: 2 });
    expect(Object.values(u.markOdds).reduce((a, b) => a + b, 0)).toBe(10_000);
    expect(Object.keys(u.markOdds).sort()).toEqual([...UNDERCROFT_MARKS].sort());
  });

  it('opens from depth 8 only', () => {
    expect(undercroftOpen(7)).toBe(false);
    expect(undercroftOpen(8)).toBe(true);
    expect(undercroftOpen(40)).toBe(true);
  });

  it('has 2 floors after the first landmark, one more for each landmark after it, at most 5', () => {
    const every = RULES.dungeon.landmarkEvery;
    expect(undercroftBaseFloors(8, 1)).toBe(2);
    expect(undercroftBaseFloors(every * 2, 1)).toBe(2);
    expect(undercroftBaseFloors(every * 2 + 1, 1)).toBe(3);
    expect(undercroftBaseFloors(every * 3 + 1, 1)).toBe(4);
    expect(undercroftBaseFloors(every * 4 + 1, 1)).toBe(5);
    expect(undercroftBaseFloors(every * 9 + 1, 1)).toBe(5);
    // A deeper level always has two.
    expect(undercroftBaseFloors(every * 9 + 1, 2)).toBe(u.deeperFloors);
    expect(undercroftBaseFloors(8, 3)).toBe(u.deeperFloors);
  });

  it('scales foes three depths higher for each level', () => {
    expect(undercroftDepth(8, 0)).toBe(8);
    expect(undercroftDepth(8, 1)).toBe(11);
    expect(undercroftDepth(8, 2)).toBe(14);
    expect(undercroftLabel(1)).toContain('Undercroft');
    expect(undercroftLabel(1)).toContain('fiercer');
    expect(undercroftLabel(2)).not.toBe(undercroftLabel(1));
  });

  it('gives the chest better odds and a higher item level than a normal drop', () => {
    const base = dungeonGearOddsBp(12, false);
    const odds = undercroftGearOddsBp(12);
    expect(odds.rare).toBe(base.rare + u.chest.rareBonusBp);
    expect(odds.epic).toBe(base.epic + u.chest.epicBonusBp);
    expect(odds.common + odds.rare + odds.epic).toBe(10_000);
  });

  it('rolls the chest gear with the chest odds and item level', () => {
    let drops = 0;
    const trials = 2_000;
    const rng = createSeededRng('chest');
    const normalLevel = (depth: number): number =>
      RULES.gear.itemLevel.dungeon.base +
      Math.floor(depth / RULES.gear.itemLevel.dungeon.depthPerLevel);
    for (let i = 0; i < trials; i++) {
      const gear = rollUndercroftChest(rng, 10, 'ember');
      expect(gear.length).toBeLessThanOrEqual(1);
      for (const item of gear) {
        drops += 1;
        expect(item.itemLevel).toBe(normalLevel(10) + u.chest.itemLevelBonus);
      }
    }
    const rate = (drops / trials) * 10_000;
    expect(Math.abs(rate - u.chest.gearBp)).toBeLessThan(500);
  });

  it('heals standing creatures a share of max HP on the way down and leaves the fallen down', () => {
    const out = catchBreath({ a: 10, b: 0, c: 95 }, { a: 100, b: 100, c: 100 });
    expect(out).toEqual({ a: 10 + 20, b: 0, c: 100 });
  });

  it('draws marks at the rules odds', () => {
    const rng = createSeededRng('marks');
    const counts: Record<UndercroftMark, number> = {
      fight: 0,
      elite: 0,
      mystery: 0,
      cache: 0,
      camp: 0,
      epic: 0,
    };
    const n = 6_000;
    for (let i = 0; i < n; i++) counts[drawMark(rng)] += 1;
    for (const mark of UNDERCROFT_MARKS) {
      expect(Math.abs((counts[mark] / n) * 10_000 - u.markOdds[mark])).toBeLessThan(400);
    }
  });
});

describe('generateUndercroftMap', () => {
  it('draws a valid map for every spec and many seeds', () => {
    for (const { map, seed } of drawn) expect(undercroftMapValid(map), seed).toBe(true);
  });

  it('is the same for the same stream and differs between streams', () => {
    const spec = SPECS[2] as UndercroftSpec;
    const a = generateUndercroftMap(createSeededRng('x'), spec);
    expect(generateUndercroftMap(createSeededRng('x'), spec)).toEqual(a);
    const distinct = new Set(
      Array.from({ length: 40 }, (_, i) =>
        JSON.stringify(generateUndercroftMap(createSeededRng(`d-${String(i)}`), spec)),
      ),
    );
    expect(distinct.size).toBeGreaterThan(30);
  });

  it('has the floors the spec asks for: the base floors, the marked floors and the keeper', () => {
    for (const { spec, map } of drawn) {
      expect(map.floors).toBe(spec.floors + spec.marks.length + 1);
      expect(map.floors).toBe(undercroftFloorCount(spec));
      expect(map.level).toBe(spec.level);
      const keeper = map.nodes.filter((n) => n.kind === 'boss');
      expect(keeper).toHaveLength(1);
      expect(keeper[0]?.floor).toBe(map.floors - 1);
      expect(keeper[0]?.lane).toBe(1);
      expect(map.nodes.filter((n) => n.kind === 'epic')).toHaveLength(
        spec.marks.filter((m) => m === 'epic').length,
      );
      // No camp unless marked.
      expect(map.nodes.filter((n) => n.kind === 'camp')).toHaveLength(
        spec.marks.filter((m) => m === 'camp').length,
      );
    }
  });

  it('gives each mark one floor of one room of its kind, camps last, before the keeper', () => {
    for (const { spec, map } of drawn) {
      const marked = Array.from({ length: spec.marks.length }, (_, i) =>
        map.nodes.filter((n) => n.floor === spec.floors + i),
      );
      expect(marked.every((f) => f.length === 1)).toBe(true);
      const kinds = marked.map((f) => f[0]?.kind);
      const expected = [
        ...spec.marks.filter((m) => m !== 'camp'),
        ...spec.marks.filter((m) => m === 'camp'),
      ];
      expect(kinds).toEqual(expected);
    }
  });

  it('puts two rooms on every ordinary floor and one on a marked floor or the keeper floor', () => {
    for (const { spec, map } of drawn) {
      const pairs = spec.floors;
      for (let f = 0; f < map.floors; f++) {
        const here = map.nodes.filter((n) => n.floor === f);
        expect(here, `floor ${String(f)}`).toHaveLength(f < pairs ? 2 : 1);
      }
    }
  });

  it('lengths by landmark and marks: base floors plus marks plus the keeper', () => {
    const depthFloors = [8, 15, 22, 29, 36].map((depth) => undercroftBaseFloors(depth, 1));
    expect(depthFloors).toEqual([2, 3, 4, 5, 5]);
    for (const [i, base] of depthFloors.entries()) {
      for (const marks of [[], ['epic'], ['camp', 'epic']] as UndercroftMark[][]) {
        const map = generateUndercroftMap(createSeededRng(`len-${String(i)}`), {
          level: 1,
          floors: base,
          marks,
        });
        expect(map.floors).toBe(base + marks.length + 1);
      }
    }
  });

  it('uses node ids that never clash with the main map and are unique', () => {
    const main = generateDungeonMap(createSeededRng('main'));
    const mainIds = new Set(main.nodes.map((n) => n.id));
    for (const { spec, map } of drawn) {
      const ids = map.nodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) {
        expect(id).toMatch(new RegExp(`^u${String(spec.level)}f\\d+l[02-9]?\\d?$`));
        expect(mainIds.has(id)).toBe(false);
      }
    }
    // A level's ids differ from another level's too.
    const a = generateUndercroftMap(createSeededRng('a'), { level: 1, floors: 2, marks: [] });
    const b = generateUndercroftMap(createSeededRng('a'), { level: 2, floors: 2, marks: [] });
    expect(a.nodes.some((n) => b.nodes.some((m) => m.id === n.id))).toBe(false);
  });

  it('is not a main map, and a main map is not an undercroft map', () => {
    for (const { map } of drawn.slice(0, 20)) expect(dungeonMapValid(map)).toBe(false);
    expect(undercroftMapValid(generateDungeonMap(createSeededRng('m')))).toBe(false);
  });

  it('leads every room to a way on, from the entrance to the keeper', () => {
    for (const { map } of drawn.slice(0, 200)) {
      const entrance = reachableNodes(map, null);
      expect(entrance.length).toBe(2);
      const seen = new Set(entrance);
      for (let f = 0; f < map.floors - 1; f++) {
        for (const n of map.nodes.filter((x) => x.floor === f && seen.has(x.id))) {
          expect(n.next.length).toBeGreaterThan(0);
          n.next.forEach((id) => seen.add(id));
        }
      }
      expect(seen.size).toBe(map.nodes.length);
      const keeper = map.nodes.find((n) => n.kind === 'boss') as MapNode;
      expect(keeper.next).toEqual([]);
    }
  });

  it('keeps the first floor to fights, caps elites, caches and mysteries, and fills rooms from the content', () => {
    for (const { map } of drawn) {
      expect(map.nodes.filter((n) => n.floor === 0).every((n) => n.kind === 'fight')).toBe(true);
      // The caps are for the floors of two rooms; a marked room is the door's gift.
      const pairRooms = map.nodes.filter((n) => n.lane !== 1);
      for (const [kind, cap] of [
        ['elite', u.map.maxElites],
        ['cache', u.map.maxCaches],
        ['mystery', u.map.maxMysteries],
      ] as const) {
        expect(pairRooms.filter((n) => n.kind === kind).length).toBeLessThanOrEqual(cap);
      }
      const events = map.nodes.flatMap((n) => (n.eventId === undefined ? [] : [n.eventId]));
      expect(new Set(events).size).toBe(events.length);
      for (const n of map.nodes) {
        if (n.kind === 'boss') expect(dungeonFoe(n.foeId as string)?.kind).toBe('boss');
        if (n.kind === 'epic') expect(dungeonFoe(n.foeId as string)?.kind).toBe('foe');
        if (n.eventId !== undefined) {
          expect(dungeonEvents.some((e) => e.id === n.eventId)).toBe(true);
        }
      }
    }
  });

  it('cracks the keeper floor with the rules chance, and never on the deepest level', () => {
    const n = 3_000;
    let cracked = 0;
    for (let i = 0; i < n; i++) {
      const map = generateUndercroftMap(createSeededRng(`crack-${String(i)}`), {
        level: 1,
        floors: 2,
        marks: [],
      });
      expect(typeof map.crack).toBe('boolean');
      if (map.crack === true) cracked += 1;
    }
    expect(Math.abs((cracked / n) * 10_000 - u.crackBp)).toBeLessThan(250);
    for (const { spec, map } of drawn) {
      if (spec.level === u.maxLevels) expect(map.crack).toBe(false);
    }
    expect(drawn.some(({ map }) => map.crack === true)).toBe(true);
  });

  it('draws from the content it is given and fails when it cannot fill a map', () => {
    const spec = SPECS[0] as UndercroftSpec;
    const noBosses = {
      foes: dungeonContent.foes.filter((f) => f.kind === 'foe'),
      modifiers: dungeonContent.modifiers,
      events: dungeonEvents,
    };
    expect(() => generateUndercroftMap(createSeededRng('s'), spec, noBosses)).toThrow();
    const oneFoe = { ...noBosses, foes: dungeonContent.foes.slice(0, 1) };
    expect(() => generateUndercroftMap(createSeededRng('s'), spec, oneFoe)).toThrow();
  });
});

describe('undercroftMapValid refuses a map that breaks a rule', () => {
  const base = (): DungeonMap =>
    generateUndercroftMap(createSeededRng('valid-base'), {
      level: 1,
      floors: 5,
      marks: ['epic', 'camp'],
    });
  const mutate = (change: (m: DungeonMap) => void): boolean => {
    const m = clone(base());
    change(m);
    return undercroftMapValid(m);
  };
  it('accepts the map before the change', () => expect(undercroftMapValid(base())).toBe(true));
  it('refuses a missing or wrong level and a crack on the deepest level', () => {
    expect(mutate((m) => delete m.level)).toBe(false);
    expect(mutate((m) => (m.level = 0))).toBe(false);
    expect(mutate((m) => (m.level = u.maxLevels + 1))).toBe(false);
    const deepest = clone(
      generateUndercroftMap(createSeededRng('deep'), { level: u.maxLevels, floors: 2, marks: [] }),
    );
    deepest.crack = true;
    expect(undercroftMapValid(deepest)).toBe(false);
    expect(mutate((m) => delete m.crack)).toBe(false);
  });
  it('refuses a room boss that is not a boss, a foe twice on a floor and a door', () => {
    expect(
      mutate((m) => {
        (m.nodes.find((n) => n.kind === 'boss') as MapNode).foeId = dungeonContent.foes.find(
          (f) => f.kind === 'foe',
        )?.id as string;
      }),
    ).toBe(false);
    expect(
      mutate((m) => {
        const [a, b] = m.nodes.filter((n) => n.floor === 0) as [MapNode, MapNode];
        b.foeId = a.foeId as string;
      }),
    ).toBe(false);
    expect(mutate((m) => ((m.nodes[0] as MapNode).kind = 'door'))).toBe(false);
  });
  it('refuses broken paths: a crossing lane, a missing exit and a wrong order of floors', () => {
    expect(
      mutate((m) => ((m.nodes[0] as MapNode).next = [(m.nodes[1] as MapNode).next[0] as string])),
    ).toBe(false);
    expect(mutate((m) => ((m.nodes[0] as MapNode).next = []))).toBe(false);
    expect(
      mutate((m) => {
        const camp = m.nodes.find((n) => n.kind === 'camp') as MapNode;
        camp.kind = 'epic';
        camp.foeId = (m.nodes.find((n) => n.kind === 'epic') as MapNode).foeId as string;
        camp.modifierId = (m.nodes.find((n) => n.kind === 'epic') as MapNode).modifierId as string;
        const epic = m.nodes.find((n) => n.kind === 'epic' && n.id !== camp.id) as MapNode;
        epic.kind = 'camp';
        delete epic.foeId;
        delete epic.modifierId;
      }),
    ).toBe(false);
  });
  it('never throws on garbage', () => {
    for (const x of [
      null,
      undefined,
      1,
      'x',
      [],
      {},
      { floors: 2, nodes: [], level: 1, crack: false },
    ]) {
      expect(undercroftMapValid(x)).toBe(false);
    }
  });
});

describe('rooms of an Undercroft map', () => {
  const spec: UndercroftSpec = { level: 1, floors: 2, marks: ['epic'] };
  const map = generateUndercroftMap(createSeededRng('rooms'), spec);
  const node = (kind: string): MapNode => map.nodes.find((n) => n.kind === kind) as MapNode;

  it('scales a fight at the run depth plus the depth bonus', () => {
    const fight = map.nodes.find((n) => n.kind === 'fight') as MapNode;
    const room = roomSpecForNode(map, fight.id, 8, 0);
    const foe = dungeonFoe(fight.foeId as string)!;
    expect(room.hp).toBe(scaledFoe(foe, 11).hp);
    expect(room.atk).toBe(scaledFoe(foe, 11).atk);
    expect(room.elite).toBeUndefined();
    expect(room.signature).toBeUndefined();
    const deeper = generateUndercroftMap(createSeededRng('rooms'), { ...spec, level: 2 });
    const f2 = deeper.nodes.find((n) => n.kind === 'fight') as MapNode;
    expect(roomSpecForNode(deeper, f2.id, 8, 0).hp).toBe(
      scaledFoe(dungeonFoe(f2.foeId as string)!, 14).hp,
    );
  });

  it('boosts an epic fight and shows it as fierce', () => {
    const epic = node('epic');
    const room = roomSpecForNode(map, epic.id, 8, 3);
    const foe = dungeonFoe(epic.foeId as string)!;
    const scaled = scaledFoe(foe, 11);
    expect(room.hp).toBe(Math.floor((scaled.hp * u.epic.hpBp) / 10_000));
    expect(room.atk).toBe(Math.floor((scaled.atk * u.epic.atkBp) / 10_000));
    expect(room).toMatchObject({ epic: true, elite: true, index: 3 });
    // It is stronger than an elite of the same foe.
    expect(u.epic.hpBp).toBeGreaterThan(RULES.dungeon.elite.hpBp);
    expect(u.epic.atkBp).toBeGreaterThan(RULES.dungeon.elite.atkBp);
  });

  it('plays the keeper as its own room boss with its signature, even at a landmark depth', () => {
    const keeper = node('boss');
    const room = roomSpecForNode(map, keeper.id, 8, 5);
    expect(room.foe.id).toBe(keeper.foeId);
    expect(room.signature).toBe(true);
    expect(room.foe.signature).toBeDefined();
    expect(room.hp).toBe(scaledFoe(room.foe, 11).hp);
    // At a landmark depth the main map's boss is swapped; the keeper is not.
    const landmark = RULES.dungeon.landmarkEvery * 3;
    expect(landmarkBossId(landmark)).not.toBeNull();
    expect(roomSpecForNode(map, keeper.id, landmark, 0).foe.id).toBe(keeper.foeId);
  });

  it('refuses a room that is not a fight', () => {
    const empty = map.nodes.find((n) => n.kind === 'mystery' || n.kind === 'cache');
    if (empty !== undefined) expect(() => roomSpecForNode(map, empty.id, 8, 0)).toThrow();
    expect(() => roomSpecForNode(map, 'f0l0', 8, 0)).toThrow();
  });

  it('shows the map labelled, with the foes at the harder depth and the crack', () => {
    const cracked = { ...clone(map), crack: true };
    const view = mapView(cracked, 8);
    expect(view.level).toBe(1);
    expect(view.label).toBe(undercroftLabel(1));
    expect(view.crack).toBe(true);
    const fight = map.nodes.find((n) => n.kind === 'fight') as MapNode;
    expect(view.nodes.find((n) => n.id === fight.id)?.foe?.hpMax).toBe(
      roomSpecForNode(map, fight.id, 8, 0).hp,
    );
    const epic = view.nodes.find((n) => n.kind === 'epic');
    expect(epic?.foe?.elite).toBe(true);
    expect(epic?.foe?.hpMax).toBe(roomSpecForNode(map, node('epic').id, 8, 0).hp);
    const noCrack = mapView({ ...clone(map), crack: false }, 8);
    expect(noCrack.crack).toBeUndefined();
    // The main map has no level or label.
    const main = mapView(generateDungeonMap(createSeededRng('v')), 8);
    expect(main.level).toBeUndefined();
    expect(main.label).toBeUndefined();
  });

  it('pays the undercroft loot: twice a fight, the epic loot, the chest for the keeper', () => {
    expect(nodeLoot('fight', 1)).toEqual({
      bait: RULES.dungeon.loot.fight.bait * u.lootMultiplier,
      essence: 0,
      scrap: 0,
    });
    expect(nodeLoot('elite', 1).scrap).toBe(RULES.dungeon.loot.elite.scrap * u.lootMultiplier);
    expect(nodeLoot('cache', 1).bait).toBe(RULES.dungeon.loot.cache.bait * u.lootMultiplier);
    expect(nodeLoot('epic', 1)).toEqual({ bait: 0, essence: 1, scrap: 2 });
    expect(nodeLoot('boss', 1)).toEqual({
      bait: 0,
      essence: u.chest.essence,
      scrap: u.chest.scrap,
    });
    expect(nodeLoot('camp', 1)).toEqual({ bait: 0, essence: 0, scrap: 0 });
    expect(nodeLoot('door')).toEqual({ bait: 0, essence: 0, scrap: 0 });
    // The main map pays as before.
    expect(nodeLoot('fight')).toEqual(RULES.dungeon.loot.fight);
    expect(nodeLoot('boss')).toEqual(RULES.dungeon.loot.boss);
  });
});

describe('the carved door on the main map', () => {
  const mains = Array.from({ length: 800 }, (_, i) =>
    generateDungeonMap(createSeededRng(`door-${String(i)}`), undefined, { doors: true }),
  );
  const doors = (m: DungeonMap): MapNode[] => m.nodes.filter((n) => n.kind === 'door');

  it('is on at most one room of a map, on floor 4 or 5, holding nothing, and the map stays valid', () => {
    for (const m of mains) {
      expect(dungeonMapValid(m)).toBe(true);
      expect(doors(m).length).toBeLessThanOrEqual(1);
      for (const d of doors(m)) {
        expect((u.doorFloors as readonly number[]).includes(d.floor)).toBe(true);
        expect(d.foeId).toBeUndefined();
        expect(d.modifierId).toBeUndefined();
        expect(d.eventId).toBeUndefined();
      }
    }
  });

  it('is only drawn when asked for: a map without the option never has one and is the same as before doors', () => {
    let compared = 0;
    for (let i = 0; i < 200; i++) {
      const plain = generateDungeonMap(createSeededRng(`door-${String(i)}`));
      expect(plain.nodes.some((n) => n.kind === 'door')).toBe(false);
      // The same stream with doors differs from it only by the room that became the door.
      const withDoors = mains[i] as DungeonMap;
      // (A door that left a map invalid is a map drawn again: only the maps that kept their draw compare.)
      if (withDoors.nodes.length !== plain.nodes.length) continue;
      compared += 1;
      for (const n of withDoors.nodes) {
        const same = plain.nodes.find((p) => p.id === n.id);
        if (n.kind === 'door') expect(same?.kind).toBe('fight');
        else expect(same).toEqual(n);
      }
    }
    expect(compared).toBeGreaterThan(150);
  });

  it('appears on about doorBp of maps', () => {
    const rate = (mains.filter((m) => doors(m).length === 1).length / mains.length) * 10_000;
    expect(Math.abs(rate - u.doorBp)).toBeLessThan(600);
  });

  it('is shown as a door at depth 8 and as a quiet room below, and its drawer-facing node holds no foe', () => {
    const m = mains.find((x) => doors(x).length === 1) as DungeonMap;
    const id = (doors(m)[0] as MapNode).id;
    for (const depth of [1, 7]) {
      const node = mapView(m, depth).nodes.find((n) => n.id === id);
      expect(node?.kind).toBe('mystery');
      expect(node?.event).toEqual({ id: 'quiet-room', name: 'Quiet room' });
      expect(node?.foe).toBeUndefined();
    }
    for (const depth of [8, 20]) {
      const node = mapView(m, depth).nodes.find((n) => n.id === id);
      expect(node?.kind).toBe('door');
      expect(node?.foe).toBeUndefined();
      expect(mapNode(m, id)?.kind).toBe('door');
    }
  });

  it('is refused on the wrong floor, twice, or with a foe', () => {
    const m = clone(mains.find((x) => doors(x).length === 1) as DungeonMap);
    const d = doors(m)[0] as MapNode;
    const wrongFloor = clone(m);
    const spare = wrongFloor.nodes.find((n) => n.kind === 'fight' && n.floor === 1) as MapNode;
    spare.kind = 'door';
    delete spare.foeId;
    delete spare.modifierId;
    expect(dungeonMapValid(wrongFloor)).toBe(false);
    const withFoe = clone(m);
    (withFoe.nodes.find((n) => n.id === d.id) as MapNode).foeId = dungeonContent.foes[0]
      ?.id as string;
    expect(dungeonMapValid(withFoe)).toBe(false);
    const asEpic = clone(m);
    (asEpic.nodes.find((n) => n.id === d.id) as MapNode).kind = 'epic';
    expect(dungeonMapValid(asEpic)).toBe(false);
  });
});
