import { dungeonContent, roomModifier } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  sampleMap,
  sampleStateCamp,
  sampleStateEvent,
  sampleStateMid,
  sampleState,
} from './dungeon-path-samples';

/** The samples are hand-written, so they are held to the map rules of docs/design/dungeon-paths.md. */
describe('the sample map', () => {
  const map = sampleMap();
  const byId = new Map(map.nodes.map((n) => [n.id, n]));

  it('has seven floors, the camp alone on floor 3 and the boss alone on floor 6, both in lane 1', () => {
    expect(map.floors).toBe(7);
    const on = (floor: number) => map.nodes.filter((n) => n.floor === floor);
    expect(on(3).map((n) => [n.kind, n.lane])).toEqual([['camp', 1]]);
    expect(on(6).map((n) => [n.kind, n.lane])).toEqual([['boss', 1]]);
    for (const floor of [0, 1, 2, 4, 5]) {
      expect(on(floor).length, `floor ${String(floor)}`).toBeGreaterThanOrEqual(2);
      expect(on(floor).length).toBeLessThanOrEqual(3);
    }
    for (const n of map.nodes) expect(n.id).toBe(`f${String(n.floor)}l${String(n.lane)}`);
  });

  it('has only edges to the next floor, at most one lane away, that never cross', () => {
    for (const n of map.nodes) {
      for (const to of n.next) {
        const next = byId.get(to);
        expect(next, `${n.id} -> ${to}`).toBeDefined();
        expect(next?.floor).toBe(n.floor + 1);
        expect(Math.abs((next?.lane ?? 9) - n.lane)).toBeLessThanOrEqual(1);
      }
      if (n.floor !== 6 && n.floor !== 3 && n.floor !== 2) {
        expect(n.next.length, n.id).toBeGreaterThanOrEqual(1);
        expect(n.next.length).toBeLessThanOrEqual(2);
      }
    }
    const edges = map.nodes.flatMap((a) =>
      a.next.map((to) => ({ a, c: byId.get(to) as (typeof map.nodes)[number] })),
    );
    for (const x of edges) {
      for (const y of edges) {
        if (x.a.floor === y.a.floor && x.a.lane < y.a.lane) {
          expect(x.c.lane, `${x.a.id} and ${y.a.id}`).toBeLessThanOrEqual(y.c.lane);
        }
      }
    }
  });

  it('leads floor 2 to the camp only, the camp to floor 4, and floor 5 to the boss', () => {
    for (const n of map.nodes.filter((x) => x.floor === 2)) expect(n.next).toEqual(['f3l1']);
    const camp = byId.get('f3l1');
    expect(camp?.next.sort()).toEqual(
      map.nodes
        .filter((n) => n.floor === 4)
        .map((n) => n.id)
        .sort(),
    );
    for (const n of map.nodes.filter((x) => x.floor === 5)) expect(n.next).toEqual(['f6l1']);
  });

  it('can be walked to: every node but those of floor 0 has a way in', () => {
    const reached = new Set(map.nodes.flatMap((n) => n.next));
    for (const n of map.nodes.filter((x) => x.floor > 0))
      expect(reached.has(n.id), n.id).toBe(true);
  });

  it('places its kinds as the rules say', () => {
    const kind = (k: string) => map.nodes.filter((n) => n.kind === k);
    expect(map.nodes.filter((n) => n.floor === 0).every((n) => n.kind === 'fight')).toBe(true);
    const elites = kind('elite');
    expect(elites.length).toBeGreaterThanOrEqual(1);
    expect(elites.length).toBeLessThanOrEqual(2);
    expect(new Set(elites.map((n) => n.floor)).size).toBe(elites.length);
    for (const n of elites) expect([2, 4, 5]).toContain(n.floor);
    expect(kind('cache').length).toBeLessThanOrEqual(1);
    expect(kind('mystery').length).toBeGreaterThanOrEqual(1);
    expect(kind('mystery').length).toBeLessThanOrEqual(3);
  });

  it('holds real foes and modifiers, no foe twice on a floor and at least three elements', () => {
    const foeIds = new Set(dungeonContent.foes.map((f) => f.id));
    const elements = new Set<string>();
    for (const n of map.nodes) {
      if (n.foe !== undefined) {
        expect(foeIds.has(n.foe.id), n.foe.id).toBe(true);
        expect(n.foe.elite).toBe(n.kind === 'elite');
        elements.add(n.foe.element);
        expect(n.modifier, n.id).toBeDefined();
        expect(roomModifier(n.modifier?.id ?? '')?.name).toBe(n.modifier?.name);
      } else {
        expect(['mystery', 'cache', 'camp']).toContain(n.kind);
      }
    }
    for (let floor = 0; floor < 7; floor++) {
      const foes = map.nodes.filter((n) => n.floor === floor && n.foe !== undefined);
      expect(new Set(foes.map((n) => n.foe?.id)).size, `floor ${String(floor)}`).toBe(foes.length);
    }
    expect(elements.size).toBeGreaterThanOrEqual(3);
  });
});

describe('the sample states', () => {
  it('stand on nodes of their own map and only offer rooms the path allows', () => {
    for (const state of [sampleState(), sampleStateMid(), sampleStateEvent(), sampleStateCamp()]) {
      const ids = new Set(state.map.nodes.map((n) => n.id));
      for (const id of [
        ...state.path,
        ...state.reachable,
        ...(state.at === null ? [] : [state.at]),
      ]) {
        expect(ids.has(id), id).toBe(true);
      }
      expect(state.at === null ? [] : state.path.slice(-1)).toEqual(
        state.at === null ? [] : [state.at],
      );
      if (state.pending !== null) expect(state.reachable).toEqual([]);
      if (state.at !== null && state.pending === null) {
        const here = state.map.nodes.find((n) => n.id === state.at);
        expect(state.reachable.sort()).toEqual([...(here?.next ?? [])].sort());
      }
    }
  });
});
