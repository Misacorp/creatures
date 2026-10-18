import { describe, expect, it } from 'vitest';
import {
  EDGE_ORDER,
  MAP_WIDTH,
  MIN_NODE,
  CACHE_LINE,
  CAMP_LINE,
  MYSTERY_LINE,
  canGo,
  edgePath,
  edgeStatus,
  foeDisplayName,
  hpLine,
  mapLayout,
  nodeAriaLabel,
  nodeElement,
  nodeGlyph,
  nodeLabel,
  nodeLines,
  nodeStatus,
  nodeTitle,
  reachableAhead,
} from './dungeon-map';
import { SAMPLE_MAP, SAMPLE_STAGES, sampleState } from './dungeon-map-sample';
import type { DungeonMapNode } from './dungeon-types';
import { glyph } from './glyphs';

function node(id: string): DungeonMapNode {
  const found = SAMPLE_MAP.nodes.find((n) => n.id === id);
  if (found === undefined) throw new Error(`no node ${id}`);
  return found;
}

function state(stage: (typeof SAMPLE_STAGES)[number]) {
  const s = sampleState(stage);
  if (s === null) throw new Error('no run');
  return s;
}

describe('the sample map', () => {
  it('follows the rules of the design (floors, camp, boss, lanes, no crossing)', () => {
    const byId = new Map(SAMPLE_MAP.nodes.map((n) => [n.id, n]));
    for (const n of SAMPLE_MAP.nodes) {
      expect(n.id).toBe(`f${String(n.floor)}l${String(n.lane)}`);
      for (const next of n.next) {
        const to = byId.get(next);
        expect(to, `${n.id} -> ${next}`).toBeDefined();
        expect(to?.floor).toBe(n.floor + 1);
        expect(Math.abs((to?.lane ?? 9) - n.lane)).toBeLessThanOrEqual(1);
      }
    }
    expect(node('f3l1').kind).toBe('camp');
    expect(node('f6l1').kind).toBe('boss');
    for (const f of [0, 1, 2, 4, 5]) {
      const count = SAMPLE_MAP.nodes.filter((n) => n.floor === f).length;
      expect(count === 2 || count === 3, `floor ${String(f)}`).toBe(true);
    }
    // No two paths cross: a->c and b->d with lane(a) < lane(b) means lane(c) <= lane(d).
    const edges = SAMPLE_MAP.nodes.flatMap((n) =>
      n.next.map((to) => ({ a: n.lane, c: byId.get(to)?.lane ?? 0, floor: n.floor })),
    );
    for (const e of edges) {
      for (const f of edges) {
        if (e.floor === f.floor && e.a < f.a) expect(e.c).toBeLessThanOrEqual(f.c);
      }
    }
  });
});

describe('mapLayout', () => {
  const layout = mapLayout(SAMPLE_MAP);

  it('keeps every room, whole, inside the coordinate space', () => {
    expect(layout.width).toBe(MAP_WIDTH);
    expect(layout.nodes).toHaveLength(SAMPLE_MAP.nodes.length);
    for (const n of layout.nodes) {
      expect(n.x - n.size / 2, n.id).toBeGreaterThanOrEqual(0);
      expect(n.x + n.size / 2, n.id).toBeLessThanOrEqual(layout.width);
      expect(n.y - n.size / 2, n.id).toBeGreaterThanOrEqual(0);
      expect(n.y + n.size / 2, n.id).toBeLessThanOrEqual(layout.height);
    }
  });

  it('makes every room a tap target of at least 44 px at 320 px wide', () => {
    // One unit is one pixel at 320 px wide.
    for (const n of layout.nodes) expect(n.size, n.id).toBeGreaterThanOrEqual(44);
    expect(MIN_NODE).toBeGreaterThanOrEqual(44);
  });

  it('keeps the rooms at least a tap apart, so none overlap', () => {
    for (const a of layout.nodes) {
      for (const b of layout.nodes) {
        if (a.id >= b.id) continue;
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        expect(distance, `${a.id} and ${b.id}`).toBeGreaterThanOrEqual((a.size + b.size) / 2 + 4);
      }
    }
  });

  it('puts the boss at the top, the entrance floor at the bottom and floors in order', () => {
    const boss = layout.nodes.find((n) => n.kind === 'boss');
    const ys = layout.nodes.map((n) => n.y);
    expect(boss?.y).toBe(Math.min(...ys));
    const floor0 = layout.nodes.filter((n) => n.floor === 0);
    for (const n of floor0) expect(n.y).toBe(Math.max(...ys));
    for (const a of layout.nodes) {
      for (const b of layout.nodes) {
        if (a.floor < b.floor) expect(a.y).toBeGreaterThan(b.y);
      }
    }
  });

  it('places the lanes left, middle and right, and centres single rooms', () => {
    const left = layout.nodes.find((n) => n.id === 'f0l0');
    const mid = layout.nodes.find((n) => n.id === 'f0l1');
    const right = layout.nodes.find((n) => n.id === 'f0l2');
    expect(left?.x).toBeLessThan(mid?.x ?? 0);
    expect(mid?.x).toBeLessThan(right?.x ?? 0);
    expect(mid?.x).toBe(layout.width / 2);
    expect(layout.nodes.find((n) => n.kind === 'camp')?.x).toBe(layout.width / 2);
    expect(layout.nodes.find((n) => n.kind === 'boss')?.x).toBe(layout.width / 2);
  });

  it('makes the camp and the boss a little bigger', () => {
    const size = (kind: string): number => layout.nodes.find((n) => n.kind === kind)?.size ?? 0;
    expect(size('camp')).toBeGreaterThan(size('fight'));
    expect(size('boss')).toBeGreaterThan(size('camp'));
  });

  it('has an edge for every path, from the lower floor to the upper one', () => {
    const total = SAMPLE_MAP.nodes.reduce((sum, n) => sum + n.next.length, 0);
    expect(layout.edges).toHaveLength(total);
    for (const e of layout.edges) expect(e.y2).toBeLessThan(e.y1);
    expect(edgePath(layout.edges[0] as (typeof layout.edges)[number])).toMatch(/^M [\d. ]+ C /);
  });

  it('leaves out a path to a room the map does not have, and survives an empty map', () => {
    const broken = {
      floors: 2,
      nodes: [{ id: 'f0l0', floor: 0, lane: 0, kind: 'fight' as const, next: ['f9l9'] }],
    };
    expect(mapLayout(broken).edges).toEqual([]);
    const empty = mapLayout({ floors: 0, nodes: [] });
    expect(Number.isFinite(empty.height)).toBe(true);
    expect(empty.nodes).toEqual([]);
  });
});

describe('nodeStatus', () => {
  it('is preview for every room when there is no run', () => {
    for (const n of SAMPLE_MAP.nodes) expect(nodeStatus(n, null)).toBe('preview');
  });

  it('lights the entrance rooms before the first step', () => {
    const s = state('entrance');
    expect(nodeStatus(node('f0l0'), s)).toBe('reachable');
    expect(nodeStatus(node('f1l1'), s)).toBe('locked');
  });

  it('marks visited, current, reachable and locked rooms mid-run', () => {
    const s = state('midway');
    expect(nodeStatus(node('f0l1'), s)).toBe('visited');
    expect(nodeStatus(node('f1l2'), s)).toBe('current');
    expect(nodeStatus(node('f2l1'), s)).toBe('reachable');
    expect(nodeStatus(node('f2l2'), s)).toBe('reachable');
    expect(nodeStatus(node('f2l0'), s)).toBe('locked');
    expect(nodeStatus(node('f0l0'), s)).toBe('locked');
  });

  it('has nothing to reach while the camp waits', () => {
    const s = state('camp');
    expect(nodeStatus(node('f3l1'), s)).toBe('current');
    expect(nodeStatus(node('f4l0'), s)).toBe('locked');
    expect(SAMPLE_MAP.nodes.some((n) => nodeStatus(n, s) === 'reachable')).toBe(false);
  });

  it('lights the way on after an elite and after the camp', () => {
    expect(nodeStatus(node('f2l0'), state('after-elite'))).toBe('current');
    expect(nodeStatus(node('f3l1'), state('after-elite'))).toBe('reachable');
    expect(nodeStatus(node('f4l0'), state('past-camp'))).toBe('reachable');
    expect(nodeStatus(node('f4l1'), state('past-camp'))).toBe('reachable');
  });

  it('leaves nothing lit when the run is finished', () => {
    const s = state('finished');
    expect(nodeStatus(node('f6l1'), s)).toBe('current');
    expect(nodeStatus(node('f5l1'), s)).toBe('visited');
    expect(nodeStatus(node('f5l0'), s)).toBe('locked');
    expect(SAMPLE_MAP.nodes.some((n) => nodeStatus(n, s) === 'reachable')).toBe(false);
  });
});

describe('reachableAhead', () => {
  const sorted = (set: Set<string>): string[] => [...set].sort();

  it('is every room of the map before the run has left the entrance', () => {
    expect(sorted(reachableAhead(SAMPLE_MAP, null))).toEqual(
      SAMPLE_MAP.nodes.map((n) => n.id).sort(),
    );
  });

  it('follows the paths forward from the room the run stands in, near and far', () => {
    expect(sorted(reachableAhead(SAMPLE_MAP, 'f1l2'))).toEqual(
      ['f2l1', 'f2l2', 'f3l1', 'f4l0', 'f4l1', 'f5l0', 'f5l1', 'f5l2', 'f6l1'].sort(),
    );
  });

  it('leaves out the room the run stands in, the rooms behind it and the rooms on other paths', () => {
    const ahead = reachableAhead(SAMPLE_MAP, 'f2l1');
    expect(ahead.has('f2l1')).toBe(false);
    for (const behind of ['f0l1', 'f1l2', 'f1l1']) expect(ahead.has(behind)).toBe(false);
    for (const aside of ['f2l0', 'f2l2']) expect(ahead.has(aside)).toBe(false);
    expect(ahead.has('f3l1')).toBe(true);
  });

  it('is only the boss one floor below it, and nothing at the boss', () => {
    expect([...reachableAhead(SAMPLE_MAP, 'f5l1')]).toEqual(['f6l1']);
    expect(reachableAhead(SAMPLE_MAP, 'f6l1').size).toBe(0);
  });

  it('is empty for a room the map does not have, and never loops on a broken map', () => {
    expect(reachableAhead(SAMPLE_MAP, 'nowhere').size).toBe(0);
    const loop = {
      nodes: [
        { id: 'a', floor: 0, lane: 0, kind: 'fight' as const, next: ['b'] },
        { id: 'b', floor: 1, lane: 0, kind: 'fight' as const, next: ['a'] },
      ],
    };
    expect([...reachableAhead(loop, 'a')]).toEqual(['b']);
  });
});

describe('rooms out of reach', () => {
  it('greys the rooms of an open run that no path leads to any more, and keeps the later ones dim', () => {
    const s = state('midway');
    const ahead = reachableAhead(SAMPLE_MAP, s.at);
    // From the second floor's right lane the left lane of that floor is gone, and so are the entrances not taken.
    expect(nodeStatus(node('f2l0'), s, ahead)).toBe('unreachable');
    expect(nodeStatus(node('f0l0'), s, ahead)).toBe('unreachable');
    expect(nodeStatus(node('f1l1'), s, ahead)).toBe('unreachable');
    // Still ahead, only not next.
    expect(nodeStatus(node('f3l1'), s, ahead)).toBe('locked');
    expect(nodeStatus(node('f6l1'), s, ahead)).toBe('locked');
    // Where the run is, has been and may go now keep their looks.
    expect(nodeStatus(node('f1l2'), s, ahead)).toBe('current');
    expect(nodeStatus(node('f0l1'), s, ahead)).toBe('visited');
    expect(nodeStatus(node('f2l1'), s, ahead)).toBe('reachable');
  });

  it('keeps everything ahead dim while the camp waits, and nothing is out of reach at the entrance', () => {
    const camp = state('camp');
    const ahead = reachableAhead(SAMPLE_MAP, camp.at);
    expect(nodeStatus(node('f4l0'), camp, ahead)).toBe('locked');
    expect(nodeStatus(node('f2l0'), camp, ahead)).toBe('unreachable');
    const start = state('entrance');
    for (const n of SAMPLE_MAP.nodes) {
      expect(nodeStatus(n, start, reachableAhead(SAMPLE_MAP, null))).not.toBe('unreachable');
    }
  });

  it('never greys a finished run, the preview, or a call that has no `ahead`', () => {
    const done = state('finished');
    for (const n of SAMPLE_MAP.nodes) {
      expect(nodeStatus(n, done, reachableAhead(SAMPLE_MAP, done.at))).not.toBe('unreachable');
    }
    expect(nodeStatus(node('f2l0'), state('midway'))).toBe('locked');
    expect(nodeStatus(node('f2l0'), null, new Set())).toBe('preview');
  });

  it('greys the paths to and from a room out of reach, but not the walked ones', () => {
    const s = state('midway');
    const ahead = reachableAhead(SAMPLE_MAP, s.at);
    expect(edgeStatus({ from: 'f1l0', to: 'f2l0' }, s, ahead)).toBe('unreachable');
    expect(edgeStatus({ from: 'f0l1', to: 'f1l1' }, s, ahead)).toBe('unreachable');
    expect(edgeStatus({ from: 'f1l1', to: 'f2l1' }, s, ahead)).toBe('unreachable');
    expect(edgeStatus({ from: 'f2l1', to: 'f3l1' }, s, ahead)).toBe('dim');
    expect(edgeStatus({ from: 'f1l2', to: 'f2l1' }, s, ahead)).toBe('reachable');
    expect(edgeStatus({ from: 'f0l1', to: 'f1l2' }, s, ahead)).toBe('taken');
  });

  it('says so in the label, and draws the greyed paths first so a lit path is never covered', () => {
    expect(nodeAriaLabel(node('f2l0'), 'unreachable')).toContain('Out of reach');
    expect(EDGE_ORDER.indexOf('unreachable')).toBeLessThan(EDGE_ORDER.indexOf('dim'));
  });
});

describe('edgeStatus', () => {
  it('is preview for every path with no run', () => {
    for (const e of mapLayout(SAMPLE_MAP).edges) expect(edgeStatus(e, null)).toBe('preview');
  });

  it('draws the walked path gold, the next steps bright and the rest dim', () => {
    const s = state('midway');
    expect(edgeStatus({ from: 'f0l1', to: 'f1l2' }, s)).toBe('taken');
    expect(edgeStatus({ from: 'f1l2', to: 'f2l1' }, s)).toBe('reachable');
    expect(edgeStatus({ from: 'f1l2', to: 'f2l2' }, s)).toBe('reachable');
    expect(edgeStatus({ from: 'f0l1', to: 'f1l1' }, s)).toBe('dim');
    expect(edgeStatus({ from: 'f1l0', to: 'f2l0' }, s)).toBe('dim');
  });

  it('takes the path up to where the run stands, even when the path leaves that room out', () => {
    const s = { ...state('midway'), path: ['f0l1'], at: 'f1l2' };
    expect(edgeStatus({ from: 'f0l1', to: 'f1l2' }, s)).toBe('taken');
  });

  it('shows the whole taken path when finished', () => {
    const s = state('finished');
    const taken = mapLayout(SAMPLE_MAP).edges.filter((e) => edgeStatus(e, s) === 'taken');
    expect(taken.map((e) => `${e.from}>${e.to}`)).toEqual([
      'f0l1>f1l2',
      'f1l2>f2l1',
      'f2l1>f3l1',
      'f3l1>f4l1',
      'f4l1>f5l1',
      'f5l1>f6l1',
    ]);
  });
});

describe('canGo', () => {
  it('is true only for a reachable room of an active run', () => {
    expect(canGo(node('f2l1'), state('midway'))).toBe(true);
    expect(canGo(node('f2l0'), state('midway'))).toBe(false);
    expect(canGo(node('f2l1'), null)).toBe(false);
    expect(canGo(node('f6l1'), { ...state('midway'), reachable: ['f6l1'], status: 'done' })).toBe(
      false,
    );
  });
});

describe('labels', () => {
  it('names a fight with its foe and element', () => {
    expect(nodeLabel(node('f0l0'))).toBe('Fight: Puddle Imp, Tide');
    expect(nodeLabel(node('f1l2'))).toBe('Fight: Ember Mite, Ember');
  });

  it('names an elite "Fierce" once', () => {
    expect(nodeLabel(node('f2l0'))).toBe('Fierce Moss Lurker (elite)');
    const already = { foe: { ...(node('f2l0').foe as object), name: 'Fierce Moss Lurker' } };
    expect(foeDisplayName(already as Pick<DungeonMapNode, 'foe'>)).toBe('Fierce Moss Lurker');
    expect(foeDisplayName(node('f0l0'))).toBe('Puddle Imp');
  });

  it('names the other rooms', () => {
    expect(nodeLabel(node('f1l1'))).toBe('Mystery room');
    expect(nodeLabel(node('f2l2'))).toBe('Cache');
    expect(nodeLabel(node('f3l1'))).toBe('Camp');
    expect(nodeLabel(node('f6l1'))).toBe('Room boss: Coil Baron');
  });

  it('does not break on a fight with no foe', () => {
    expect(nodeLabel({ id: 'f0l0', floor: 0, lane: 0, kind: 'fight', next: [] })).toBe('Fight');
    expect(nodeLabel({ id: 'f6l1', floor: 6, lane: 1, kind: 'boss', next: [] })).toBe('Room boss');
  });

  it('tells a screen reader where the run stands with each room', () => {
    expect(nodeAriaLabel(node('f2l1'), 'reachable')).toBe(
      'Fight: Drift Wisp, Tide. You can go here. Show details',
    );
    expect(nodeAriaLabel(node('f0l1'), 'visited')).toContain('Visited');
    expect(nodeAriaLabel(node('f1l2'), 'current')).toContain('You are here');
    expect(nodeAriaLabel(node('f2l0'), 'locked')).toContain('Not on your path');
    expect(nodeAriaLabel(node('f2l0'), 'preview')).toBe('Fierce Moss Lurker (elite). Show details');
  });

  it('gives each kind a drawer title', () => {
    expect(SAMPLE_MAP.nodes.map((n) => nodeTitle(n))).toEqual(
      SAMPLE_MAP.nodes.map(
        (n) =>
          ({
            fight: 'Fight',
            elite: 'Elite fight',
            mystery: 'Mystery room',
            cache: 'Cache',
            camp: 'Camp',
            boss: 'Room boss',
          })[n.kind],
      ),
    );
  });

  it('says what a mystery room, a cache and the camp are', () => {
    expect(nodeLines(node('f1l1'))).toEqual([MYSTERY_LINE]);
    expect(MYSTERY_LINE).toBe("Something stirs. You'll see when you step in.");
    expect(nodeLines(node('f2l2'))).toEqual([CACHE_LINE]);
    expect(CACHE_LINE).toBe('Free loot: Bait and scrap for your pack.');
    expect(nodeLines(node('f3l1'))).toEqual([CAMP_LINE]);
    expect(CAMP_LINE).toBe(
      'Rest, swap a creature or take a keepsake, then push on or head home with your pack.',
    );
    expect(nodeLines(node('f0l0'))).toEqual([]);
  });

  it('writes the HP of a foe', () => {
    expect(hpLine(412)).toBe('HP 412');
    expect(hpLine(node('f6l1').foe?.hpMax ?? 0)).toBe('HP 1280');
  });
});

describe('kinds', () => {
  it('tints fights, elites and the boss by the foe element, and nothing else', () => {
    expect(nodeElement(node('f0l0'))).toBe('tide');
    expect(nodeElement(node('f2l0'))).toBe('grove');
    expect(nodeElement(node('f6l1'))).toBe('spark');
    expect(nodeElement(node('f1l1'))).toBeNull();
    expect(nodeElement(node('f3l1'))).toBeNull();
  });

  it('has an icon for every kind of room', () => {
    for (const kind of ['fight', 'elite', 'mystery', 'cache', 'camp', 'boss'] as const) {
      expect(glyph(nodeGlyph(kind)), kind).toBeDefined();
    }
  });
});
