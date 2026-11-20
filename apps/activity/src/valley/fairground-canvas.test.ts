import { describe, expect, it } from 'vitest';
import {
  BOARD,
  POSTER,
  PRIZE,
  ROSETTE,
  SINGLE_W,
  STALL_H,
  STAND_H,
  STAND_W,
  TEAM_W,
  TENT,
  type Box,
} from './fairground-canvas-art';
import {
  COUNTER_FEET,
  EDGE,
  SCALE_MAX,
  SCALE_MIN,
  asideFits,
  eventOfSeat,
  fairLayout,
  fairScale,
  fairSceneDraw,
  neededRows,
  packRows,
  plateRows,
  plateWidth,
  posterBox,
  rosetteSpots,
  slotSpots,
  stallCasts,
  stallSeat,
  stallWidth,
  standColumns,
  type StallEvent,
} from './fairground-canvas';
import { sceneGeometry } from './SceneFrame';

/** A day's lineup as the fixtures have it: two single events and a team event. */
const THREE: StallEvent[] = [
  { id: 'melon-run', team: 1 },
  { id: 'pepper-panic', team: 1 },
  { id: 'log-carry', team: 3 },
];
/** A Wednesday: four events, the bonus one a team event too. */
const FOUR: StallEvent[] = [
  { id: 'shark-derby', team: 1 },
  { id: 'sauna-showdown', team: 1 },
  { id: 'floe-sumo', team: 1 },
  { id: 'bucket-brigade', team: 3 },
];
const NAMES: Record<string, string> = {
  'melon-run': 'Melon Run',
  'pepper-panic': 'Pepper Panic',
  'log-carry': 'Log Carry',
  'shark-derby': 'Shark Derby',
  'sauna-showdown': 'Sauna Showdown',
  'floe-sumo': 'Floe Sumo',
  'bucket-brigade': 'Bucket Brigade',
};

const SIZES: [number, number][] = [
  [360, 600],
  [390, 640],
  [390, 780],
  [700, 600],
  [1100, 700],
  [1100, 800],
  [1440, 800],
  [1920, 1000],
];

const geometry = (width: number, height: number, lineup: StallEvent[]) =>
  sceneGeometry(width, height, fairScale(width, height, lineup));

const overlap = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('the Fairground canvas: the scale', () => {
  it('is a whole number in the range, and a taller window never gets a smaller one', () => {
    for (const lineup of [THREE, FOUR])
      for (const [w, h] of SIZES) {
        const s = fairScale(w, h, lineup);
        expect(Number.isInteger(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(SCALE_MIN);
        expect(s).toBeLessThanOrEqual(SCALE_MAX);
        expect(fairScale(w, h + 300, lineup)).toBeGreaterThanOrEqual(s);
      }
  });

  it('is the largest scale at which the whole fair fits the window', () => {
    for (const lineup of [THREE, FOUR])
      for (const [w, h] of SIZES) {
        const s = fairScale(w, h, lineup);
        if (s > SCALE_MIN) expect(neededRows(w, s, lineup)).toBeLessThanOrEqual(Math.ceil(h / s));
        if (s < SCALE_MAX && s > SCALE_MIN)
          expect(neededRows(w, s + 1, lineup)).toBeGreaterThan(Math.ceil(h / (s + 1)));
      }
  });

  it('shows two single stalls side by side on a phone', () => {
    const g = geometry(390, 780, THREE);
    const lay = fairLayout(g, THREE);
    expect(lay.stalls['melon-run']?.y).toBe(lay.stalls['pepper-panic']?.y);
    expect(lay.stalls['log-carry']?.y).toBeGreaterThan(lay.stalls['melon-run']?.y ?? 0);
  });

  it('does not depend on who is entered (it takes only the lineup)', () => {
    expect(fairScale(1100, 800, THREE)).toBe(fairScale(1100, 800, [...THREE]));
  });
});

describe('the Fairground canvas: the layout', () => {
  it('keeps every piece inside the scene, side to side', () => {
    for (const lineup of [THREE, FOUR])
      for (const [w, h] of SIZES) {
        const g = geometry(w, h, lineup);
        const lay = fairLayout(g, lineup);
        const boxes = [lay.tent, lay.prize, lay.rules, ...Object.values(lay.stalls)];
        for (const box of boxes) {
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.w).toBeLessThanOrEqual(g.W);
        }
      }
  });

  it('puts a stall for every event, wider for a team event', () => {
    const lay = fairLayout(geometry(1100, 800, FOUR), FOUR);
    expect(Object.keys(lay.stalls)).toEqual(FOUR.map((e) => e.id));
    expect(lay.stalls['shark-derby']?.w).toBe(SINGLE_W);
    expect(lay.stalls['bucket-brigade']?.w).toBe(TEAM_W);
    expect(stallWidth({ team: 3 })).toBe(TEAM_W);
    expect(stallWidth({ team: 1 })).toBe(SINGLE_W);
  });

  it('never lets two things stand on each other, and keeps the stalls below the tent', () => {
    for (const lineup of [THREE, FOUR])
      for (const [w, h] of SIZES) {
        const g = geometry(w, h, lineup);
        const lay = fairLayout(g, lineup);
        const boxes = [lay.tent, lay.prize, lay.rules, ...Object.values(lay.stalls)];
        for (let i = 0; i < boxes.length; i += 1)
          for (let j = i + 1; j < boxes.length; j += 1)
            expect(overlap(boxes[i] as Box, boxes[j] as Box), `${String(w)}x${String(h)}`).toBe(
              false,
            );
        for (const box of Object.values(lay.stalls)) {
          expect(box.y).toBeGreaterThanOrEqual(lay.tent.y + lay.tent.h);
        }
      }
  });

  it('keeps the plates of neighbours apart: a row leaves room for them, a plate is under its thing', () => {
    for (const lineup of [THREE, FOUR])
      for (const [w, h] of SIZES) {
        const g = geometry(w, h, lineup);
        const lay = fairLayout(g, lineup);
        const plates = [
          { box: lay.tent, text: 'Show Tue 13:40' },
          { box: lay.prize, text: 'Opens Wed 13:37' },
          { box: lay.rules, text: 'Rules' },
          ...lineup.flatMap((e) => {
            const box = lay.stalls[e.id];
            return box === undefined ? [] : [{ box, text: NAMES[e.id] ?? e.id }];
          }),
        ].map(({ box, text }) => {
          const pw = plateWidth(text, g.s);
          return {
            x: box.x + Math.floor(box.w / 2) - Math.floor(pw / 2),
            y: box.y + box.h + 1,
            w: pw,
            h: plateRows(g.s),
          };
        });
        for (let i = 0; i < plates.length; i += 1)
          for (let j = i + 1; j < plates.length; j += 1)
            expect(overlap(plates[i] as Box, plates[j] as Box), `${String(w)}x${String(h)}`).toBe(
              false,
            );
        // No plate is under another thing's art.
        const art = [lay.tent, lay.prize, lay.rules, ...Object.values(lay.stalls)];
        for (const plate of plates) for (const box of art) expect(overlap(plate, box)).toBe(false);
        // The scene shows every plate (a window too short even at the smallest scale cuts the fair at the bottom).
        if (lay.height <= g.H)
          for (const plate of plates) expect(plate.y + plate.h).toBeLessThanOrEqual(g.H);
      }
  });

  it('stands the board and the Prize Stall beside the tent when they fit, else in the flow', () => {
    const wide = fairLayout(geometry(1100, 800, THREE), THREE);
    expect(wide.aside).toBe(true);
    expect(wide.rules.x + BOARD.w).toBeLessThan(wide.tent.x);
    expect(wide.prize.x).toBeGreaterThan(wide.tent.x + TENT.w);
    // Their feet are level with the tent's.
    expect(wide.rules.y + wide.rules.h).toBe(wide.tent.y + wide.tent.h);
    expect(wide.prize.y + wide.prize.h).toBe(wide.tent.y + wide.tent.h);
    const narrow = sceneGeometry(300, 800, 2);
    expect(asideFits(narrow.W)).toBe(false);
    const flow = fairLayout(narrow, THREE);
    expect(flow.aside).toBe(false);
    expect(flow.prize.y).toBeGreaterThan(flow.tent.y + flow.tent.h);
    expect(flow.rules.y).toBeGreaterThan(flow.tent.y + flow.tent.h);
  });

  it('draws the grandstand to both edges, in tiles of its width', () => {
    for (const width of [195, 275, 366, 480, 960]) {
      const cols = standColumns(width, Math.floor(width / 2));
      expect(cols[0]).toBeLessThanOrEqual(0);
      expect((cols[cols.length - 1] ?? 0) + STAND_W).toBeGreaterThanOrEqual(width);
      cols.slice(1).forEach((x, i) => {
        expect(x - (cols[i] ?? 0)).toBe(STAND_W);
      });
    }
    // The tent's peak stands against the grandstand's bottom, not far below it.
    const lay = fairLayout(sceneGeometry(1100, 800, 3), THREE);
    expect(lay.tent.y).toBeGreaterThanOrEqual(STAND_H - 12);
  });

  it('packs rows left to right and starts a new one when the next does not fit', () => {
    const rows = packRows([{ w: 80 }, { w: 80 }, { w: 112 }, { w: 64 }], 200 - 2 * EDGE, 10);
    expect(rows.map((r) => r.map((i) => i.w))).toEqual([
      [80, 80],
      [112, 64],
    ]);
    expect(packRows([{ w: 300 }], 100, 10)).toEqual([[{ w: 300 }]]);
    expect(packRows([], 100, 10)).toEqual([]);
  });

  it('centres a row', () => {
    const g = sceneGeometry(1100, 800, 3);
    const lay = fairLayout(g, THREE);
    const boxes = THREE.map((e) => lay.stalls[e.id] as Box);
    const left = Math.min(...boxes.map((b) => b.x));
    const right = Math.max(...boxes.map((b) => b.x + b.w));
    expect(Math.abs(left + right - 2 * g.cx)).toBeLessThanOrEqual(2);
  });

  it('spreads a tall window’s spare height, a little, below the grandstand', () => {
    const lineup = THREE;
    const g = sceneGeometry(1100, 800, 3);
    const tall = fairLayout({ ...g, H: g.H + 60 }, lineup);
    const short = fairLayout(g, lineup);
    expect(tall.tent.y).toBeGreaterThanOrEqual(short.tent.y);
    expect(tall.height).toBeGreaterThanOrEqual(short.height);
    // The whole fair still fits.
    expect(tall.height).toBeLessThanOrEqual(g.H + 60);
  });
});

describe('the Fairground canvas: who stands where', () => {
  const owned = new Set(['a', 'b', 'c', 'd']);

  it('stands an event’s entries at its counter, slot by slot', () => {
    const casts = stallCasts(THREE, { 'melon-run': ['a'], 'log-carry': ['b', 'c', 'd'] }, owned);
    expect(casts.map((c) => c.eventId)).toEqual(['melon-run', 'pepper-panic', 'log-carry']);
    expect(casts[0]?.stands).toEqual([
      { creatureId: 'a', slot: 0, x: Math.floor((SINGLE_W - 16) / 2), y: COUNTER_FEET - 16 },
    ]);
    expect(casts[1]?.stands).toEqual([]);
    expect(casts[2]?.stands.map((s) => [s.creatureId, s.slot])).toEqual([
      ['b', 0],
      ['c', 1],
      ['d', 2],
    ]);
  });

  it('keeps the creatures of a team stall apart and inside it, feet on the counter', () => {
    const spots = slotSpots({ team: 3 });
    expect(spots).toHaveLength(3);
    for (const [i, spot] of spots.entries()) {
      expect(spot.x).toBeGreaterThanOrEqual(0);
      expect(spot.x + 16).toBeLessThanOrEqual(TEAM_W);
      expect(spot.y + 16).toBe(COUNTER_FEET);
      if (i > 0) expect(spot.x - (spots[i - 1]?.x ?? 0)).toBeGreaterThanOrEqual(16);
    }
    expect(slotSpots({ team: 1 })).toHaveLength(1);
    expect(COUNTER_FEET).toBeLessThanOrEqual(STALL_H);
  });

  it('puts the creatures under the poster, never over it', () => {
    for (const team of [1, 3] as const) {
      const poster = posterBox({ team });
      expect(poster.w).toBe(POSTER.w);
      expect(poster.h).toBe(POSTER.h);
      expect(poster.x + poster.w).toBeLessThanOrEqual(stallWidth({ team }));
      for (const spot of slotSpots({ team }))
        expect(spot.y).toBeGreaterThanOrEqual(poster.y + poster.h);
    }
  });

  it('leaves out a creature that is not owned any more, and entries beyond the stall’s slots', () => {
    const casts = stallCasts(
      THREE,
      { 'melon-run': ['gone'], 'pepper-panic': ['a', 'b'], 'log-carry': ['a', 'gone', 'c'] },
      owned,
    );
    expect(casts[0]?.stands).toEqual([]);
    expect(casts[1]?.stands.map((s) => s.creatureId)).toEqual(['a']);
    expect(casts[2]?.stands.map((s) => [s.creatureId, s.slot])).toEqual([
      ['a', 0],
      ['c', 2],
    ]);
  });

  it('names a stall for a drop and finds its event again', () => {
    expect(eventOfSeat(stallSeat('melon-run'))).toBe('melon-run');
    expect(eventOfSeat('communal:market')).toBeNull();
    expect(eventOfSeat(null)).toBeNull();
  });
});

describe('the Fairground canvas: rosettes and the drawing', () => {
  it('hangs the rosettes in a row on the tent, inside it and apart', () => {
    for (const n of [1, 2, 3, 4, 6]) {
      const spots = rosetteSpots(n);
      expect(spots).toHaveLength(n);
      for (const spot of spots) {
        expect(spot.x).toBeGreaterThanOrEqual(0);
        expect(spot.x + ROSETTE.w).toBeLessThanOrEqual(TENT.w);
        expect(spot.y + ROSETTE.h).toBeLessThanOrEqual(TENT.h);
      }
    }
    expect(rosetteSpots(0)).toEqual([]);
    expect(rosetteSpots(3).map((s) => s.x)).toEqual(
      [...rosetteSpots(3).map((s) => s.x)].sort((a, b) => a - b),
    );
  });

  it('draws the scene with the grass, the stands, the tent and a stall for every event', () => {
    const g = sceneGeometry(1100, 800, 3);
    const calm = fairSceneDraw(THREE, {
      locked: false,
      prizeOpen: false,
      crowd: false,
      medals: [],
    })(g);
    const locked = fairSceneDraw(THREE, {
      locked: true,
      prizeOpen: true,
      crowd: true,
      medals: ['gold', 'bronze'],
    })(g);
    expect(calm.length).toBeGreaterThan(g.W);
    // The crowd, the dimmed stalls and the rosettes add to or change what is drawn.
    expect(locked.length).toBeGreaterThan(calm.length);
    for (const p of [...calm, ...locked]) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
    expect(PRIZE.w).toBe(64);
  });
});
