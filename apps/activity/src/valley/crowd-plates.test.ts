import { createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { HOME_NOW, homeInput } from '../workbench/home-sample';
import { CAST_PLACES, CREATURE_PX, castFor, type CastInput } from './place-cast';
import { dropPoint } from './creature-drag';
import { PLATE_MAX_PX, PLATE_ROW_PX, plateGap, roamPlan, standSpots } from './place-plates';
import { BAND_ROWS, artSize, bandArtBox } from './place-scene';
import { sceneScale } from './scale';
import { sceneGeometry } from './SceneFrame';
import { crowdSlots, newWalker, stepApart, type Walker } from './valley-logic';

/**
 * The nameplate rule of `ux-patterns.md` ("Creatures in a scene stand by their feet"): in a scene the gap between
 * creatures is the larger of a sprite and their plates, a spot keeps its whole plate inside the scene, and the scene
 * shows only as many creatures as fit that way (fewer on a phone). Sibling of `crowd.test.ts`.
 */
describe('nameplates: no two overlap and none leaves the scene, at the phone and the desktop scene', () => {
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
      scene: { boss: { id: 'x', name: 'X' }, party: ids.slice(0, 5) },
    },
    dungeonTeam: ids.slice(0, 5),
    dungeonPhase: null,
    waiting: [
      { id: 'a', species: 'cindle', shiny: false },
      { id: 'b', species: 'cindle', shiny: false },
    ],
    pending: 2,
    now: HOME_NOW,
  });

  /** A creature's box with its plate under its feet: the sprite and the plate, whichever is wider. */
  const boxOf = (p: { x: number; y: number }, s: number) => {
    const half = Math.max(CREATURE_PX / 2, PLATE_MAX_PX / s / 2);
    return {
      left: p.x + CREATURE_PX / 2 - half,
      right: p.x + CREATURE_PX / 2 + half,
      top: p.y,
      bottom: p.y + CREATURE_PX + PLATE_ROW_PX / s,
    };
  };
  type Box = ReturnType<typeof boxOf>;
  const overlap = (a: Box, b: Box): boolean =>
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

  /** The phone's scene (a 350 px window, scale 3) and a desktop's (1100 px, scale 4). */
  const scenes = [350, 1100].map((width) => {
    const s = sceneScale(width);
    const g = sceneGeometry(width, BAND_ROWS * s, s);
    return { width, g, scene: { W: g.W, H: g.H, s, top: g.top } };
  });

  const art = (place: (typeof CAST_PLACES)[number]) =>
    ({
      house: 'house',
      cave: 'cave',
      arena: 'arena',
      fair: 'fairground',
      paddock: 'paddock',
      signpost: 'road',
      forge: 'forge',
      market: 'market',
      visitor: 'visitor',
      school: 'school',
    })[place] as
      | 'house'
      | 'cave'
      | 'arena'
      | 'fairground'
      | 'paddock'
      | 'road'
      | 'forge'
      | 'market'
      | 'visitor'
      | 'school';

  it.each(CAST_PLACES.flatMap((place) => scenes.map((sc) => [place, sc.width, sc] as const)))(
    '%s at %i px',
    (place, _width, sc) => {
      const box = bandArtBox(sc.g, art(place));
      const c = castFor(place, input(), artSize(art(place)), []);
      const spots = standSpots(
        c.stands,
        box,
        sc.scene,
        c.gate.map((n) => ({ x: box.x + n.x, y: box.y + n.y })),
      );
      const boxes = spots.map((p) => boxOf(p, sc.scene.s));
      for (const [i, b] of boxes.entries()) {
        expect(b.left).toBeGreaterThanOrEqual(0);
        expect(b.right).toBeLessThanOrEqual(sc.scene.W);
        expect(b.bottom).toBeLessThanOrEqual(sc.scene.H);
        for (const other of boxes.slice(i + 1)) expect(overlap(b, other)).toBe(false);
      }
    },
  );

  it('the paddock: on a 1440 px window a hand can drop a creature anywhere on the scene, not only in the meadow', () => {
    const s = sceneScale(1408);
    const g = sceneGeometry(1408, BAND_ROWS * s, s);
    const scene = { W: g.W, H: g.H, s, top: g.top };
    const box = bandArtBox(g, 'paddock');
    const c = castFor('paddock', input(), artSize('paddock'), []);
    const plan = roamPlan(c, box, scene);
    if (plan === null) throw new Error('the paddock has a meadow');
    // The wanderers stay in the art's meadow, far narrower than the scene ...
    expect(plan.area.width).toBeLessThan(g.W / 2);
    // ... but a drop at 30% of the scene's width (left of the meadow) lands there, at the scene's scale.
    const pointer = { x: 16 + 1408 * 0.3, y: 56 + 200 };
    const to = dropPoint(
      { dx: 0, dy: 0 },
      pointer.x,
      pointer.y,
      { left: 16, top: 56 },
      s,
      plan.drag,
    );
    expect(to.x * s).toBeCloseTo(1408 * 0.3, -1);
    expect(to.x).toBeLessThan(plan.area.x);
  });

  it('the paddock: roamers keep their plates apart and inside the scene all the time, and fewer fit in a narrow scene', () => {
    const shown: number[] = [];
    const narrow = (() => {
      const s = sceneScale(200);
      const g = sceneGeometry(200, BAND_ROWS * s, s);
      return { width: 200, g, scene: { W: g.W, H: g.H, s, top: g.top } };
    })();
    for (const sc of [narrow, ...scenes]) {
      const box = bandArtBox(sc.g, 'paddock');
      const c = castFor('paddock', input(), artSize('paddock'), []);
      const plan = roamPlan(c, box, sc.scene);
      if (plan === null) throw new Error('the paddock has a meadow');
      shown.push(plan.shown);
      expect(plan.shown).toBeGreaterThan(0);
      const gap = plateGap(sc.scene.s);
      const rngs = Array.from({ length: plan.shown }, (_, i) => createSeededRng(`n-${String(i)}`));
      const slots = crowdSlots(plan.area, gap);
      const ws: Walker[] = rngs.map((rng, i) => {
        const w = newWalker(rng, plan.area, { index: i, of: plan.shown });
        const slot = slots[i];
        return slot === undefined ? w : { ...w, x: slot.x, y: slot.y };
      });
      for (let tick = 0; tick < 1200; tick++) {
        // One creature at a time, each seeing where the others now stand (as `useRoamers` does).
        for (const [i, w] of ws.entries()) {
          ws[i] = stepApart(
            w,
            rngs[i] ?? createSeededRng('x'),
            plan.area,
            ws.filter((_, j) => j !== i),
            gap,
          );
        }
        const boxes = ws.map((w) => boxOf(w, sc.scene.s));
        for (const [i, b] of boxes.entries()) {
          expect(b.left).toBeGreaterThanOrEqual(0);
          expect(b.right).toBeLessThanOrEqual(sc.scene.W);
          expect(b.bottom).toBeLessThanOrEqual(sc.scene.H);
          for (const other of boxes.slice(i + 1)) expect(overlap(b, other)).toBe(false);
        }
      }
      // The meadow stops short of the gate's newcomers.
      for (const n of c.gate) {
        expect(plan.area.x + plan.area.width - 1 + CREATURE_PX).toBeLessThanOrEqual(box.x + n.x);
      }
    }
    // 200 px wide shows fewer than the phone and the desktop; those two show every one of the eight.
    expect(shown[0]).toBeLessThan(shown[1] ?? 0);
    expect(shown[1]).toBeLessThanOrEqual(shown[2] ?? 0);
  });
});
