import { describe, expect, it } from 'vitest';
import {
  buildable,
  loadHousingContent,
  houseGrid,
  type GridRoom,
  type HousingContent,
} from '../src/index';
import { FIXTURE_CTX, fixtureResources, housingFixtureRaw } from './housing-fixture';

function part(
  id: string,
  kind: string,
  requires: string[],
  rooms: [string, string, number, number][],
  order: number,
  side?: 'west' | 'east',
) {
  return {
    id,
    name: id,
    kind,
    requires,
    rooms: rooms.map(([key, roomKind, col, floor]) => ({ key, kind: roomKind, col, floor })),
    price: [],
    ...(side === undefined ? {} : { side }),
    unlocks: [],
    line: 'x',
    order,
  };
}

/** The part table of section 2.4 with three small room kinds. */
function fullHouse(): HousingContent {
  const raw = housingFixtureRaw();
  const room = (id: string, w: 1 | 2, outdoor: boolean) => ({
    id,
    name: id,
    outdoor,
    cells: { w, h: 1 },
    spots: [{ id: 'floor-a', type: 'floor-large', x: 10, w: 48 }],
    fixtures: [],
    wall: 'plain-wall',
    floor: 'plain-floor',
  });
  raw.rooms.push(room('r1', 1, false), room('r2', 2, false), room('yard', 2, true));
  raw.parts = [
    part('hut', 'core', [], [['hearth', 'hearth', 0, 0]], 0),
    part(
      'cottage',
      'core',
      ['hut'],
      [
        ['kitchen', 'r1', 1, 0],
        ['loft', 'r1', 0, 1],
      ],
      1,
    ),
    part(
      'house',
      'core',
      ['cottage'],
      [
        ['study', 'r1', 1, 1],
        ['attic', 'r2', 0, 2],
      ],
      2,
    ),
    part('cellar', 'cellar', ['cottage'], [['cellar', 'r2', 0, -1]], 3),
    part('west-wing', 'wing', ['house'], [['hall', 'r2', 0, 0]], 4, 'west'),
    part('west-upper', 'wing', ['west-wing'], [['gallery', 'r2', 0, 1]], 5, 'west'),
    part('east-wing', 'wing', ['house'], [['conservatory', 'r2', 0, 0]], 6, 'east'),
    part(
      'east-upper',
      'wing',
      ['east-wing'],
      [
        ['bath', 'r1', 0, 1],
        ['guest', 'r1', 1, 1],
      ],
      7,
      'east',
    ),
    part('terrace', 'grounds', ['cottage'], [['terrace', 'yard', 0, 0]], 8, 'west'),
    part('garden', 'grounds', ['cottage'], [['garden', 'yard', 0, 0]], 9, 'east'),
    part('pool', 'grounds', ['garden', 'house'], [['pool', 'yard', 0, 0]], 10, 'east'),
  ] as never;
  return loadHousingContent(raw, fixtureResources(), FIXTURE_CTX);
}

const ALL = [
  'hut',
  'cottage',
  'house',
  'cellar',
  'west-wing',
  'west-upper',
  'east-wing',
  'east-upper',
  'terrace',
  'garden',
  'pool',
];

function at(grid: GridRoom[], roomId: string): GridRoom {
  const room = grid.find((r) => r.roomId === roomId);
  if (room === undefined) throw new Error(`no room ${roomId}`);
  return room;
}

/** Every (col, floor) cell a room covers. */
function cells(grid: GridRoom[]): string[] {
  return grid.flatMap((r) =>
    Array.from({ length: r.w }, (_, i) => `${String(r.col + i)},${String(r.floor)}`),
  );
}

describe('houseGrid', () => {
  const content = fullHouse();

  it('is the hearth alone for a hut', () => {
    expect(houseGrid(content, new Set(['hut']))).toEqual([
      { roomId: 'hut:hearth', kind: 'hearth', col: 0, floor: 0, w: 1, outdoor: false, part: 'hut' },
    ]);
  });

  it('places the core parts where the table says', () => {
    const grid = houseGrid(content, new Set(['hut', 'cottage', 'house', 'cellar']));
    expect(at(grid, 'cottage:kitchen')).toMatchObject({ col: 1, floor: 0 });
    expect(at(grid, 'cottage:loft')).toMatchObject({ col: 0, floor: 1 });
    expect(at(grid, 'house:study')).toMatchObject({ col: 1, floor: 1 });
    expect(at(grid, 'house:attic')).toMatchObject({ col: 0, floor: 2, w: 2 });
    expect(at(grid, 'cellar:cellar')).toMatchObject({ col: 0, floor: -1, w: 2 });
  });

  it('places every part of a full house with no overlap, wings and grounds on the outer edges', () => {
    const grid = houseGrid(content, new Set(ALL));
    const all = cells(grid);
    expect(new Set(all).size).toBe(all.length);
    expect(grid).toHaveLength(14);
    // The core is columns 0..1; the west wing 2 cells left of it, the terrace left of the wing.
    expect(at(grid, 'west-wing:hall')).toMatchObject({ col: -2, floor: 0 });
    expect(at(grid, 'west-upper:gallery')).toMatchObject({ col: -2, floor: 1 });
    expect(at(grid, 'terrace:terrace')).toMatchObject({ col: -4, floor: 0, outdoor: true });
    // East: wing right of the core, then the garden, then the pool.
    expect(at(grid, 'east-wing:conservatory')).toMatchObject({ col: 2, floor: 0 });
    expect(at(grid, 'east-upper:bath')).toMatchObject({ col: 2, floor: 1 });
    expect(at(grid, 'east-upper:guest')).toMatchObject({ col: 3, floor: 1 });
    expect(at(grid, 'garden:garden')).toMatchObject({ col: 4, floor: 0 });
    expect(at(grid, 'pool:pool')).toMatchObject({ col: 6, floor: 0 });
    expect(Math.min(...grid.map((r) => r.col))).toBe(-4);
    expect(Math.max(...grid.map((r) => r.col + r.w))).toBe(8);
  });

  it('puts grounds on the core edge when there are no wings', () => {
    const grid = houseGrid(content, new Set(['hut', 'cottage', 'terrace', 'garden']));
    expect(at(grid, 'terrace:terrace')).toMatchObject({ col: -2 });
    expect(at(grid, 'garden:garden')).toMatchObject({ col: 2 });
    const cellsOf = cells(grid);
    expect(new Set(cellsOf).size).toBe(cellsOf.length);
  });

  it('moves a ground part inward only when the wing beside it exists, never the core', () => {
    const base = new Set(['hut', 'cottage', 'house', 'terrace']);
    const without = houseGrid(content, base);
    const withWing = houseGrid(content, new Set([...base, 'west-wing']));
    expect(at(without, 'terrace:terrace').col).toBe(-2);
    expect(at(withWing, 'terrace:terrace').col).toBe(-4);
    expect(at(withWing, 'hut:hearth').col).toBe(0);
  });

  it('lists the top floor first, then left to right', () => {
    const grid = houseGrid(content, new Set(ALL));
    const order = grid.map((r) => r.floor);
    expect(order).toEqual([...order].sort((a, b) => b - a));
    const ground = grid.filter((r) => r.floor === 0).map((r) => r.col);
    expect(ground).toEqual([...ground].sort((a, b) => a - b));
  });

  it('does not place a part that is not built', () => {
    expect(houseGrid(content, new Set(['hut', 'pool'])).map((r) => r.part)).toEqual([
      'hut',
      'pool',
    ]);
  });
});

describe('buildable', () => {
  const content = fullHouse();

  it('lists unbuilt parts whose requirements are all built, in build order', () => {
    expect(buildable(content, new Set(['hut']))).toEqual(['cottage']);
    expect(buildable(content, new Set(['hut', 'cottage']))).toEqual([
      'house',
      'cellar',
      'terrace',
      'garden',
    ]);
    expect(buildable(content, new Set(['hut', 'cottage', 'house', 'garden']))).toEqual([
      'cellar',
      'west-wing',
      'east-wing',
      'terrace',
      'pool',
    ]);
  });

  it('is empty when everything is built', () => {
    expect(buildable(content, new Set(ALL))).toEqual([]);
  });
});
