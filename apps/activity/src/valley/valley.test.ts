import { createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import type { Creature } from '../api';
import { sampleRoster } from '../creature-card-sample';
import type { Place } from '../tabs';
import { placeScale, skyColumns, SKY_WIDTH } from './place-scene';
import { sceneGeometry } from './SceneFrame';
import { sceneScale } from './scale';
import { isAtHome, trayBadge, trayFor, type TrayInput } from './tray-state';
import { tileFrame } from '../games/art/tiles';
import {
  PLACES,
  PLACE_IDS,
  TILE,
  VALLEY_COLS,
  VALLEY_ROWS,
  VALLEY_SIZE,
  featureGrid,
  placeOf,
  valleyDrawing,
} from './valley-art';
import {
  PAGE_TITLES,
  PLACE_TAB,
  OPEN_PLACES,
  SOON_LINES,
  isOpenPlace,
  viewOf,
  type HomeAt,
} from './valley-nav';
import {
  edgeArrows,
  fitValley,
  freeTabs,
  hopOf,
  maxScroll,
  newWalker,
  readingOrder,
  scrollToPlace,
  startScroll,
  stepWalker,
} from './valley-logic';
import { placePlacements, DEFAULT_LOOK } from './valley-places';

describe('where today’s pages live', () => {
  it('has eleven places: seven open, four not yet', () => {
    expect(PLACE_IDS).toHaveLength(11);
    expect(OPEN_PLACES).toHaveLength(7);
    expect(PLACE_IDS.filter((id) => !isOpenPlace(id)).sort()).toEqual([
      'bonfire',
      'market',
      'school',
      'visitor',
    ]);
    for (const id of PLACE_IDS.filter((x) => !isOpenPlace(x))) {
      expect(SOON_LINES[id]).toMatch(/\.$/);
    }
  });

  it('gives every open place a page title and a tab, and every tab a place', () => {
    const tabs = new Set<Place>();
    for (const id of OPEN_PLACES) {
      expect(PAGE_TITLES[id]).not.toBe('');
      tabs.add(PLACE_TAB[id]);
    }
    expect(tabs).toEqual(
      new Set<Place>(['dungeon', 'games', 'home', 'collection', 'workshop', 'raid', 'expeditions']),
    );
    const all: Place[] = [
      'home',
      'collection',
      'workshop',
      'journal',
      'stats',
      'expeditions',
      'dungeon',
      'raid',
      'games',
    ];
    for (const tab of all) {
      expect(viewOf(tab, 'valley')).toBeDefined();
    }
  });

  it('draws Home as the map, the House or a place not open yet', () => {
    expect(viewOf('home', 'valley')).toEqual({ kind: 'valley' });
    expect(viewOf('home', 'house')).toEqual({ kind: 'place', place: 'house', book: null });
    const soon: HomeAt = 'school';
    expect(viewOf('home', soon)).toEqual({ kind: 'soon', place: 'school' });
  });

  it('keeps the Journal and the Stats in the House', () => {
    expect(viewOf('journal', 'valley')).toEqual({ kind: 'place', place: 'house', book: 'journal' });
    expect(viewOf('stats', 'valley')).toEqual({ kind: 'place', place: 'house', book: 'stats' });
  });

  it('opens each tab’s own place', () => {
    for (const id of OPEN_PLACES) {
      if (id === 'house') continue;
      expect(viewOf(PLACE_TAB[id], 'valley')).toEqual({ kind: 'place', place: id, book: null });
    }
  });
});

describe('the map', () => {
  it('lets every road that leaves the valley reach the edge of the drawing', () => {
    const grid = featureGrid();
    const dirt = (c: number, r: number): boolean => grid[r]?.[c]?.tile === 'dirt';
    // The two roads from the west reach the valley's east edge; the road out of the south reaches its bottom.
    expect(dirt(VALLEY_COLS - 1, 9)).toBe(true);
    expect(dirt(VALLEY_COLS - 1, 18)).toBe(true);
    expect(dirt(26, VALLEY_ROWS - 1)).toBe(true);
    // In a margin they go on: the drawing at a wide window has dirt in the last column of rows 9 and 18.
    const wide = valleyDrawing({ left: 5, top: 0, right: 5, bottom: 2 });
    const lastCol = (VALLEY_COLS + 9) * TILE;
    const roadAt = (x: number, y: number): boolean =>
      wide.placements.some((p) => p.x === x && p.y === y && p.sprite === tileFrame('dirt'));
    expect(roadAt(lastCol - TILE, 9 * TILE)).toBe(true);
    expect(roadAt(lastCol - TILE, 18 * TILE)).toBe(true);
    expect(roadAt((5 + 26) * TILE, (VALLEY_ROWS + 1) * TILE)).toBe(true);
  });

  it('has a rectangle for every place, inside the valley', () => {
    expect(PLACES).toHaveLength(11);
    for (const p of PLACES) {
      expect(p.rect.width).toBeGreaterThan(0);
      expect(p.rect.x + p.rect.width).toBeLessThanOrEqual(VALLEY_SIZE.width + 16);
      expect(p.rect.y + p.rect.height).toBeLessThanOrEqual(VALLEY_SIZE.height + 16);
    }
    expect(readingOrder()).toHaveLength(11);
  });

  it('draws the eleven places in day light (no night)', () => {
    expect(placePlacements(DEFAULT_LOOK)).toHaveLength(11);
  });

  it('fits a phone by panning and a wide window by showing it whole', () => {
    expect(fitValley(390, 600).pans).toBe(true);
    expect(fitValley(1400, 800).pans).toBe(false);
    expect(maxScroll(1400)).toBe(0);
    expect(startScroll(390)).toBeGreaterThan(0);
    expect(scrollToPlace('signpost', 390)).toBeLessThanOrEqual(maxScroll(390));
  });

  it('a desktop never pans: every place shows whole at 1100, 1440 and 1920 px, the grass edges cropped evenly', () => {
    for (const width of [1100, 1440, 1920]) {
      const fit = fitValley(width, 800);
      expect(fit.pans, String(width)).toBe(false);
      for (const id of readingOrder()) {
        const r = placeOf(id).rect;
        // Where the place's edges land in the window (the drawing's margin tiles shift the valley right).
        const left = fit.left + (r.x + fit.margin.left * TILE) * fit.scale;
        const right = left + r.width * fit.scale;
        expect(left, `${id} at ${String(width)}`).toBeGreaterThanOrEqual(0);
        expect(right, `${id} at ${String(width)}`).toBeLessThanOrEqual(width);
      }
    }
  });

  it('a phone and a narrow window still pan', () => {
    for (const width of [390, 768, 900]) expect(fitValley(width, 700).pans).toBe(true);
  });

  it('shows edge chips only for places out of view, and never over a place', () => {
    const order = readingOrder();
    expect(edgeArrows(order, 0, 1400)).toEqual([]);
    const arrows = edgeArrows(order, startScroll(390), 390);
    expect(arrows.length).toBeGreaterThan(0);
    const heights = freeTabs(arrows, startScroll(390), 390);
    for (const a of arrows) {
      const y = heights.get(a.place);
      if (y !== undefined) expect(y).toBeGreaterThan(0);
    }
    expect(placeOf('forge').name).toBe('Forge');
  });

  it('walks a creature inside its area from a seeded generator', () => {
    const area = { x: 10, y: 20, width: 30, height: 14 };
    const rng = createSeededRng('walk');
    let w = newWalker(rng, area);
    for (let i = 0; i < 400; i++) {
      w = stepWalker(w, rng, area);
      expect(w.x).toBeGreaterThanOrEqual(area.x);
      expect(w.x).toBeLessThanOrEqual(area.x + area.width);
      expect(w.y).toBeGreaterThanOrEqual(area.y);
      expect(w.y).toBeLessThanOrEqual(area.y + area.height);
      expect([0, 1]).toContain(hopOf(w));
    }
  });
});

describe('a place’s scene', () => {
  it('uses one whole-number scale, 3 on a phone and 4 wide', () => {
    expect(sceneScale(390)).toBe(3);
    expect(sceneScale(1100)).toBe(4);
    const g = sceneGeometry(390, 800);
    expect(g.s).toBe(3);
    expect(g.W * g.s).toBeGreaterThanOrEqual(390);
  });

  it('keeps a place’s art inside its scene', () => {
    for (const name of ['bonfire', 'school', 'visitor', 'market'] as const) {
      for (const [w, h] of [
        [390, 600],
        [1100, 800],
      ] as const) {
        const s = placeScale(w, h, name);
        expect(s).toBeGreaterThanOrEqual(3);
        expect(s).toBeLessThanOrEqual(6);
      }
    }
  });

  it('tiles the sky from edge to edge', () => {
    const cols = skyColumns(300, 150);
    expect(cols[0]).toBeLessThanOrEqual(0);
    expect((cols.at(-1) ?? 0) + SKY_WIDTH).toBeGreaterThanOrEqual(300);
  });
});

describe('the tray', () => {
  const roster: Creature[] = sampleRoster(6);
  const first = roster[0] as Creature;
  const input = (over: Partial<TrayInput> = {}): TrayInput => ({
    trips: [],
    jobs: null,
    now: 1_000,
    ...over,
  });

  it('marks a free creature as free and one that can evolve with its mark', () => {
    expect(trayBadge(first, input()).state).toBe('free');
    const evolver = {
      ...first,
      evolution: { available: true },
    } as unknown as Creature;
    expect(trayBadge(evolver, input()).state).toBe('evolve');
  });

  it('shows a creature at work, and one done at the forge', () => {
    const job = {
      id: 'j1',
      creatureId: first.id,
      status: 'running',
      endsAt: 5_000,
    } as never;
    const working = { ...first, busy: { kind: 'job', id: 'j1' } } as Creature;
    expect(trayBadge(working, input({ jobs: [job] })).state).toBe('job');
    expect(trayBadge(working, input({ jobs: [job], now: 6_000 })).state).toBe('ready');
    expect(trayBadge(working, input()).state).toBe('job');
  });

  it('shows a trip out, and one home with loot', () => {
    const trip = {
      id: 't1',
      creatureId: first.id,
      destination: 'verdant-hollow',
      status: 'active',
      endsAt: 5_000,
    } as never;
    const away = { ...first, busy: { kind: 'expedition', id: 't1' } } as Creature;
    expect(trayBadge(away, input({ trips: [trip] })).state).toBe('trip');
    expect(trayBadge(away, input({ trips: [trip], now: 6_000 })).state).toBe('loot');
  });

  it('lists the ones that need you first, then free, then busy; at home means not at work', () => {
    const job = { id: 'j1', status: 'running', endsAt: 5_000 } as never;
    const busy = { ...first, busy: { kind: 'job', id: 'j1' } } as Creature;
    const rest = roster.slice(1);
    const list = trayFor([busy, ...rest], input({ jobs: [job] }));
    expect(list.at(-1)?.id).toBe(busy.id);
    expect(isAtHome(busy)).toBe(false);
    expect(isAtHome(rest[0] as Creature)).toBe(true);
  });
});
