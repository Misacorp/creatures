import { createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { HOME_NOW, homeInput } from '../workbench/home-sample';
import { CAST_PLACES, MAX_ROAMERS, PADDOCK_ROAM_AREA, castFor, type CastInput } from './place-cast';
import { MAX_WANDERERS, PADDOCK_ROAM, placeOf, plateBox } from './valley-art';
import { MIN_GAP, crowdSlots, depthOf, newWalker, stepApart, type Walker } from './valley-logic';

const near = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

describe('depth: the lower the feet, the more in front', () => {
  it('orders by the bottom edge, then by x', () => {
    expect(depthOf(10, 30)).toBeGreaterThan(depthOf(40, 20));
    expect(depthOf(20, 30)).toBeGreaterThan(depthOf(10, 30));
    // A creature never ranks over one standing in front of it, at any x.
    for (const x of [0, 7, 100, 300]) expect(depthOf(x, 10)).toBeLessThan(depthOf(0, 11));
  });
});

describe('the gap between creatures', () => {
  it('the gap is a whole sprite, so none overlaps another', () => {
    expect(MIN_GAP).toBe(16);
  });

  it('the map draws four, the scene eight, each with room a gap apart', () => {
    expect(MAX_WANDERERS).toBe(4);
    for (const [area, n] of [
      [PADDOCK_ROAM, MAX_WANDERERS],
      [PADDOCK_ROAM_AREA, MAX_ROAMERS],
    ] as const) {
      const slots = crowdSlots(area);
      expect(slots.length).toBeGreaterThanOrEqual(n);
      for (const [i, a] of slots.entries()) {
        for (const b of slots.slice(i + 1)) expect(near(a, b)).toBeGreaterThanOrEqual(MIN_GAP);
      }
    }
  });

  it('on the map no wanderer can stand over the Paddock label', () => {
    const plate = plateBox(placeOf('paddock').rect);
    // Everywhere a creature's top-left can be, its 16 x 16 body stays above the plate.
    const feet = PADDOCK_ROAM.y + PADDOCK_ROAM.height - 1 + 16;
    expect(feet).toBeLessThanOrEqual(plate.y);
  });

  it.each([
    ['the map', PADDOCK_ROAM, MAX_WANDERERS],
    ['the scene', PADDOCK_ROAM_AREA, MAX_ROAMERS],
  ] as const)(
    'wandering on %s never brings two closer than the gap, and is the same every time',
    (_, area, count) => {
      const run = (): Walker[] => {
        const slots = crowdSlots(area);
        const rngs = Array.from({ length: count }, (_, i) =>
          createSeededRng(`valley-c${String(i)}`),
        );
        const ws: Walker[] = rngs.map((rng, i) => {
          const w = newWalker(rng, area);
          const slot = slots[i] ?? { x: w.x, y: w.y };
          return { ...w, x: slot.x, y: slot.y };
        });
        for (let tick = 0; tick < 1500; tick++) {
          for (const [i, rng] of rngs.entries()) {
            const w = ws[i];
            if (w === undefined) continue;
            const next = stepApart(
              w,
              rng,
              area,
              ws.filter((_, j) => j !== i),
            );
            ws[i] = next;
            for (const [j, other] of ws.entries()) {
              if (j !== i) expect(near(next, other)).toBeGreaterThanOrEqual(MIN_GAP);
            }
          }
        }
        return ws;
      };
      const first = run();
      expect(first.some((w) => w.steps > 20)).toBe(true);
      expect(run()).toEqual(first);
    },
  );
});

describe('every scene keeps its standing creatures a gap apart', () => {
  const base = homeInput('busy', true);
  const many = Array.from({ length: 12 }, (_, i) => ({
    ...base.creatures[0],
    id: `m${String(i)}`,
    away: false,
    busy: null,
  }));
  const ids = many.map((c) => c.id);
  const input = (): CastInput => ({
    ...base,
    creatures: many as never,
    games:
      base.games === null
        ? null
        : {
            ...base.games,
            next: {
              ...base.games.next,
              entries: Object.fromEntries(
                base.games.next.lineup.map((e, i) => [e.id, ids.slice(i * 3, i * 3 + 3)]),
              ),
            },
          },
    raid: {
      ...(base.raid ?? { schedule: {} as never }),
      scene: { boss: { id: 'x', name: 'X' }, party: ids.slice(0, 3) },
    },
    dungeonTeam: ids.slice(0, 3),
    waiting: [
      { id: 'a', species: 'cindle', shiny: false },
      { id: 'b', species: 'cindle', shiny: false },
    ],
    pending: 2,
    now: HOME_NOW,
  });

  it.each(CAST_PLACES)('%s', (place) => {
    const c = castFor(place, input(), { width: 64, height: 54 }, []);
    const spots = [...c.stands, ...c.gate];
    for (const [i, a] of spots.entries()) {
      for (const b of spots.slice(i + 1)) expect(near(a, b)).toBeGreaterThanOrEqual(MIN_GAP);
    }
    if (place === 'paddock') {
      // The gate stands clear of everywhere the roamers can reach.
      for (const n of c.gate) {
        for (let x = 0; x < PADDOCK_ROAM_AREA.width; x += 1) {
          for (const y of [0, PADDOCK_ROAM_AREA.height - 1]) {
            expect(
              near(n, { x: PADDOCK_ROAM_AREA.x + x, y: PADDOCK_ROAM_AREA.y + y }),
            ).toBeGreaterThanOrEqual(MIN_GAP);
          }
        }
      }
    }
  });
});
