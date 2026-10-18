import { RULES } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  EDGE_ORDER,
  LEVEL_SEAM,
  DESCEND_LINE,
  MAP_WIDTH,
  MIN_NODE,
  CACHE_LINE,
  CAMP_LINE,
  DOOR_LINE,
  MYSTERY_LINE,
  canGo,
  edgePath,
  edgeStatus,
  foeDisplayName,
  hpLine,
  isKeeper,
  levelLabel,
  descentRooms,
  lostAt,
  startLevel,
  startMarkers,
  mapLayout,
  nodeAriaLabel,
  nodeElement,
  nodeGlossaryEntry,
  nodeGlyph,
  nodeGlyphOf,
  nodeLabel,
  nodeLevel,
  nodeLines,
  nodeStatus,
  nodeTitle,
  reachableAhead,
  reachableAheadAcross,
  stackLayout,
} from './dungeon-map';
import { undercroftState } from './dungeon-undercroft-sample';
import { SAMPLE_MAP, SAMPLE_STAGES, sampleState } from './dungeon-map-sample';
import type { DungeonMapNode, DungeonMapView } from './dungeon-types';
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

  it('puts the entrance row at the top, the boss at the bottom and rows in order downward', () => {
    const boss = layout.nodes.find((n) => n.kind === 'boss');
    const ys = layout.nodes.map((n) => n.y);
    expect(boss?.y).toBe(Math.max(...ys));
    expect(boss?.y).toBe(layout.height - 44);
    const floor0 = layout.nodes.filter((n) => n.floor === 0);
    for (const n of floor0) expect(n.y).toBe(Math.min(...ys));
    expect(Math.min(...ys)).toBe(44);
    for (const a of layout.nodes) {
      for (const b of layout.nodes) {
        if (a.floor < b.floor) expect(a.y).toBeLessThan(b.y);
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

  it('has an edge for every path, from a row to the next one down', () => {
    const total = SAMPLE_MAP.nodes.reduce((sum, n) => sum + n.next.length, 0);
    expect(layout.edges).toHaveLength(total);
    for (const e of layout.edges) expect(e.y2).toBeGreaterThan(e.y1);
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
    expect(nodeLabel(node('f6l1'))).toBe('Floor boss: Coil Baron');
  });

  it('does not break on a fight with no foe', () => {
    expect(nodeLabel({ id: 'f0l0', floor: 0, lane: 0, kind: 'fight', next: [] })).toBe('Fight');
    expect(nodeLabel({ id: 'f6l1', floor: 6, lane: 1, kind: 'boss', next: [] })).toBe('Floor boss');
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
            boss: 'Floor boss',
            door: 'Carved door',
            epic: 'Epic fight',
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

describe('the Undercroft on the map', () => {
  const down = undercroftState('entrance');
  const first = down.undercroft?.maps[0] as DungeonMapView;

  it('knows the level of a room by its id', () => {
    expect(nodeLevel('f2l1')).toBe(0);
    expect(nodeLevel('u1f0l0')).toBe(1);
    expect(nodeLevel('u3f12l2')).toBe(3);
    expect(nodeLevel('x1f0l0')).toBe(0);
    expect(nodeLevel('')).toBe(0);
  });

  it('draws the day exactly as before when there is no level and no locked band', () => {
    const plain = mapLayout(SAMPLE_MAP);
    const stacked = stackLayout(SAMPLE_MAP, []);
    expect(stacked.height).toBe(plain.height);
    expect(stacked.nodes).toEqual(plain.nodes);
    expect(stacked.edges).toEqual(plain.edges);
    expect(stacked.bands).toEqual([]);
  });

  it('stacks a level below the floor boss, with a seam for its label and a darker band', () => {
    const main = mapLayout(down.map);
    const level = mapLayout(first);
    const layout = stackLayout(down.map, [first]);
    expect(layout.height).toBe(main.height + level.height + LEVEL_SEAM);
    const at = (id: string) => layout.nodes.find((n) => n.id === id);
    // The level is below the whole day's map: its entrance row is lower than the floor boss.
    const boss = at('f6l1');
    const entrance = at('u1f0l0');
    const keeper = at('u1f3l1');
    expect(entrance && boss && entrance.y > boss.y + 31 + 23).toBe(true);
    // The day's own entrance row is at the very top; the level's floor boss is at the very bottom.
    expect(at('f0l0')?.y).toBe(44);
    expect(keeper?.y).toBe(layout.height - 44);
    expect(layout.nodes.map((n) => n.level)).toEqual([
      ...down.map.nodes.map(() => 0),
      ...first.nodes.map(() => 1),
    ]);
    // Its label stands in the seam at the band's top, between the day's boss and the level's entrance,
    // and the band covers the level down to the bottom of the picture.
    const [band] = layout.bands;
    expect(layout.bands).toHaveLength(1);
    expect(band).toMatchObject({ kind: 'undercroft', level: 1, label: first.label, crack: false });
    expect(band?.y).toBe(main.height);
    expect(band?.height).toBe(level.height + LEVEL_SEAM);
    expect((band?.y ?? 0) + (band?.height ?? 0)).toBe(layout.height);
    expect(band?.labelY).toBeGreaterThan(boss?.y ?? 0);
    expect(band?.labelY).toBeLessThan(entrance?.y ?? 0);
    // Every picture unit is inside the box, and every path of the level is drawn inside it.
    for (const n of layout.nodes) {
      expect(n.y).toBeGreaterThan(0);
      expect(n.y).toBeLessThan(layout.height);
    }
    expect(layout.edges.length).toBe(main.edges.length + level.edges.length);
    for (const e of layout.edges) expect(Math.min(e.y1, e.y2)).toBeGreaterThan(0);
  });

  it('stacks two levels, the second below the first', () => {
    const deeper = undercroftState('cracked-deeper');
    const maps = deeper.undercroft?.maps ?? [];
    const layout = stackLayout(deeper.map, maps);
    expect(layout.bands.map((b) => [b.level, b.crack])).toEqual([
      [1, true],
      [2, false],
    ]);
    const y = (id: string) => layout.nodes.find((n) => n.id === id)?.y ?? 0;
    expect(y('u2f0l0')).toBeGreaterThan(y('u1f3l1'));
    expect(y('u2f2l1')).toBeGreaterThan(y('u2f0l0'));
    expect(layout.bands[1]?.labelY).toBeGreaterThan(y('u1f3l1'));
    expect(layout.bands[1]?.labelY).toBeLessThan(y('u2f0l0'));
  });

  it('has no band below the boss before any level is drawn, only the levels that are', () => {
    expect(stackLayout(SAMPLE_MAP, []).bands).toEqual([]);
    expect(stackLayout(SAMPLE_MAP, []).height).toBe(mapLayout(SAMPLE_MAP).height);
    expect(stackLayout(down.map, [first]).bands.map((b) => b.kind)).toEqual(['undercroft']);
  });

  it('names a level by the server label, or plainly when it sent none', () => {
    expect(levelLabel(first)).toBe(first.label);
    expect(levelLabel({ level: 2 })).toBe('Undercroft floor 2');
    expect(levelLabel({})).toBe('Undercroft floor 1');
  });

  it('lights the rooms of the level the run is in, and greys the levels it left', () => {
    const levels = [down.map, first];
    // Before the entrance of level 1: its entrance floor is next, everything else is out of reach.
    const ahead = reachableAheadAcross(levels, null, 1);
    expect([...ahead].every((id) => id.startsWith('u1'))).toBe(true);
    expect(ahead.has('u1f3l1')).toBe(true);
    expect(ahead.has('f6l1')).toBe(false);
    const states = { ...down };
    expect(nodeStatus({ id: 'u1f0l0' }, states, ahead)).toBe('reachable');
    expect(nodeStatus({ id: 'u1f1l2' }, states, ahead)).toBe('locked');
    expect(nodeStatus({ id: 'f5l2' }, states, ahead)).toBe('unreachable');
    expect(nodeStatus({ id: 'f6l1' }, states, ahead)).toBe('visited');
    // In the middle of a level it is the map the run stands in.
    const mid = undercroftState('midway');
    const inLevel = reachableAheadAcross(levels, mid.at, 1);
    expect([...inLevel].sort()).toEqual(['u1f2l1', 'u1f3l1']);
    // On the day's map the level is not drawn yet, so it is that map alone, and an unknown room gives none.
    expect(reachableAheadAcross([down.map], 'f4l1', 0).has('f6l1')).toBe(true);
    expect(reachableAheadAcross(levels, 'nowhere', 0).size).toBe(0);
    expect(reachableAheadAcross([], null, 3).size).toBe(0);
  });

  it('gives the new rooms their glyphs, words, sizes and glossary entries', () => {
    const doorNode = down.map.nodes.find((n) => n.kind === 'door') as DungeonMapNode;
    const keeperNode = first.nodes.find((n) => n.kind === 'boss') as DungeonMapNode;
    const epicNode: DungeonMapNode = {
      ...(first.nodes.find((n) => n.id === 'u1f2l1') as DungeonMapNode),
      kind: 'epic',
    };
    expect(nodeLabel(doorNode)).toBe('Carved door');
    expect(nodeTitle(doorNode)).toBe('Carved door');
    expect(nodeLines(doorNode)).toEqual([DOOR_LINE]);
    expect(DOOR_LINE).toBe(
      'A carved door. Step through to add one room to the first Undercroft floor: a fight, a fierce foe, a mystery, a cache, a camp or an epic fight. You find out which when you descend.',
    );
    expect(nodeGlossaryEntry('door')).toBe('carved-door');
    expect(nodeGlossaryEntry('epic')).toBe('epic-fight');
    expect(nodeLabel(epicNode)).toBe('Fierce Ember Mite (epic fight)');
    expect(nodeTitle(epicNode)).toBe('Epic fight');
    expect(nodeElement(epicNode)).toBe('ember');
    expect(nodeElement(doorNode)).toBeNull();
    expect(isKeeper(keeperNode)).toBe(true);
    expect(isKeeper(node('f6l1'))).toBe(false);
    expect(nodeLabel(keeperNode)).toBe('Undercroft floor boss: Slag Tyrant');
    expect(nodeTitle(keeperNode)).toBe('Undercroft floor boss');
    expect(nodeGlyphOf(keeperNode)).toBe('map-keeper');
    expect(nodeGlyphOf(node('f6l1'))).toBe('map-boss');
    expect(nodeGlyphOf(doorNode)).toBe('map-door');
    for (const id of ['map-door', 'map-epic', 'map-keeper', 'map-crack']) {
      expect(glyph(id), id).toBeDefined();
    }
    expect(nodeAriaLabel(keeperNode, 'locked', { crack: true })).toBe(
      'Undercroft floor boss: Slag Tyrant. Cracked floor. Not on your path. Show details',
    );
    expect(nodeAriaLabel(keeperNode, 'preview')).toBe(
      'Undercroft floor boss: Slag Tyrant. Show details',
    );
    const laid = mapLayout(down.map);
    expect(laid.nodes.find((n) => n.kind === 'door')?.size).toBe(MIN_NODE);
  });
});

describe('the start markers', () => {
  const laid = mapLayout(SAMPLE_MAP);

  it('has one above every entrance room, pointing down into it, and none elsewhere', () => {
    const marks = startMarkers(laid, 0);
    expect(marks.map((m) => m.id)).toEqual(
      SAMPLE_MAP.nodes.filter((n) => n.floor === 0).map((n) => n.id),
    );
    for (const mark of marks) {
      const room = laid.nodes.find((n) => n.id === mark.id);
      const [apex, left, right] = mark.points.split(' ').map((p) => p.split(',').map(Number));
      if (room === undefined || apex === undefined || left === undefined || right === undefined) {
        throw new Error('a triangle has three corners');
      }
      // The apex is above the room's edge and centred over it; the base is wider and higher.
      expect(apex[0]).toBeCloseTo(room.x);
      expect(apex[1]).toBeLessThan(room.y - room.size / 2);
      expect(left[1]).toBeLessThan(apex[1] ?? 0);
      expect(right[1]).toBe(left[1]);
      expect(right[0]).toBeGreaterThan(left[0] ?? 0);
      // It stays on the picture.
      expect(left[1]).toBeGreaterThan(0);
      expect(left[0]).toBeGreaterThan(0);
      expect(right[0]).toBeLessThan(laid.width);
    }
    expect(startMarkers(laid, 1)).toEqual([]);
  });

  it('is shown before the first move only: the preview, or an open run that has not moved yet', () => {
    expect(startLevel(null)).toBe(0);
    expect(startLevel(state('entrance'))).toBe(0);
    expect(startLevel(state('midway'))).toBeNull();
    // A finished run's route never moves from nowhere: no markers on the results map.
    expect(startLevel({ ...state('entrance'), status: 'done' })).toBeNull();
    // After going down, the Undercroft's own entrance has them.
    expect(startLevel({ ...state('entrance'), level: 1 })).toBe(1);
  });

  it('marks the entrance of the Undercroft level a run is about to start', () => {
    const run = undercroftState('entrance');
    const layout = stackLayout(run.map, run.undercroft?.maps ?? []);
    const marks = startMarkers(layout, 1);
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.every((m) => m.id.startsWith('u1f0'))).toBe(true);
  });
});

describe('the way down badge', () => {
  const run = undercroftState('cracked');
  const maps = [run.map, ...(run.undercroft?.maps ?? [])];

  it('is on the floor boss from the depth that opens the Undercroft, and not below it', () => {
    const from = RULES.dungeon.undercroft.fromDepth;
    expect([...descentRooms([SAMPLE_MAP], from)]).toEqual(['f6l1']);
    expect([...descentRooms([SAMPLE_MAP], from + 20)]).toEqual(['f6l1']);
    expect(descentRooms([SAMPLE_MAP], from - 1).size).toBe(0);
    expect(descentRooms([SAMPLE_MAP], undefined).size).toBe(0);
  });

  it('is on a keeper only when its floor is cracked', () => {
    const rooms = descentRooms(maps, 14);
    const cracked = maps.flatMap((m, i) =>
      i > 0 && m.crack === true ? m.nodes.filter((n) => n.kind === 'boss').map((n) => n.id) : [],
    );
    expect(cracked.length).toBeGreaterThan(0);
    for (const id of cracked) expect(rooms.has(id)).toBe(true);
    const plain = maps.flatMap((m, i) =>
      i > 0 && m.crack !== true ? m.nodes.filter((n) => n.kind === 'boss').map((n) => n.id) : [],
    );
    for (const id of plain) expect(rooms.has(id)).toBe(false);
  });

  it('goes once the way down has been taken (the next level is drawn)', () => {
    const deeper = undercroftState('cracked-deeper');
    const stacked = [deeper.map, ...(deeper.undercroft?.maps ?? [])];
    expect(stacked.length).toBeGreaterThan(2);
    const rooms = descentRooms(stacked, 14);
    // The floor boss and the first keeper have been passed; the last level's keeper is the way on.
    expect(rooms.has('f6l1')).toBe(false);
    expect(rooms.has('u1f3l1')).toBe(false);
    const entered = undercroftState('entrance');
    expect(descentRooms([entered.map, ...(entered.undercroft?.maps ?? [])], 14).has('f6l1')).toBe(
      false,
    );
  });

  it('has its own glyph, and a line for the floor boss drawer', () => {
    expect(glyph('map-descend')).toBeDefined();
    expect(DESCEND_LINE).toBe('Beat it to descend into the Undercroft.');
  });

  it('is spoken on the room, unless the cracked floor already says it', () => {
    const boss = node('f6l1');
    expect(nodeAriaLabel(boss, 'preview', { descent: true })).toBe(
      'Floor boss: Coil Baron. The way down. Show details',
    );
  });
});

describe('the room where the run was lost', () => {
  it('is the room of a fight that was not cleared, and no other', () => {
    const lost = state('defeated');
    expect(lostAt(lost.history, 'f2l1')).toBe(true);
    expect(lostAt(lost.history, 'f1l2')).toBe(false);
    expect(lostAt(lost.history, 'f0l1')).toBe(false);
    expect(lostAt(undefined, 'f2l1')).toBe(false);
    expect(lostAt(state('finished').history, 'f6l1')).toBe(false);
  });

  it('is said in place of "Visited"', () => {
    expect(nodeAriaLabel(node('f2l1'), 'visited', { lost: true })).toContain(
      'You were defeated here',
    );
    expect(nodeAriaLabel(node('f2l1'), 'visited', { lost: true })).not.toContain('Visited');
  });
});
