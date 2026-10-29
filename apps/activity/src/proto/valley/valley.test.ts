import { createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { WORLD_MAP_SPRITE_DATA } from '../../sprites/data/world-map-sprites';
import { parseSprite } from '../../sprites/sprite-data';
import { TOUR, claimJob, claimTrip, initialWorld, needs, raidTeamIds, worldAtStep } from '../world';
import { anvilJobs } from './ForgeScene';
import { sceneGeometry, sceneScale } from './SceneFrame';
import { arenaDraw, caveDraw, fairDraw, forgeDraw, houseDraw, paddockDraw } from './scene-art';
import {
  CHEST_FRAMES,
  PLACES,
  SACK_FRAMES,
  SMOKE_FRAMES,
  VALLEY_SIZE,
  buildingPlacements,
  valleyDrawing,
} from './valley-art';
import {
  bubblesOf,
  edgeArrows,
  evolveInto,
  fitValley,
  hopOf,
  maxScroll,
  newWalker,
  placeLabel,
  placeOfNeed,
  placeRaidAt,
  readingOrder,
  scrollToPlace,
  stackTabs,
  startScroll,
  stepWalker,
} from './valley-logic';

describe('the valley art', () => {
  it('draws only valid sprites, with or without margins', () => {
    for (const margin of [
      { left: 0, top: 0, right: 0, bottom: 0 },
      { left: 5, top: 2, right: 5, bottom: 2 },
    ]) {
      const drawing = valleyDrawing(margin, 1);
      expect(drawing.width).toBe(VALLEY_SIZE.width + (margin.left + margin.right) * 16);
      for (const p of drawing.placements) expect(() => parseSprite(p.sprite)).not.toThrow();
    }
    for (const s of [...CHEST_FRAMES, ...SACK_FRAMES, ...SMOKE_FRAMES]) {
      expect(() => parseSprite(s)).not.toThrow();
    }
  });

  it('keeps every place inside the valley, at least 44 CSS px each way at scale 2', () => {
    for (const place of PLACES) {
      expect(place.rect.x).toBeGreaterThanOrEqual(0);
      expect(place.rect.y).toBeGreaterThanOrEqual(0);
      expect(place.rect.x + place.rect.width).toBeLessThanOrEqual(VALLEY_SIZE.width);
      expect(place.rect.y + place.rect.height).toBeLessThanOrEqual(VALLEY_SIZE.height);
      expect(place.rect.width * 2).toBeGreaterThanOrEqual(44);
      expect(place.rect.height * 2).toBeGreaterThanOrEqual(44);
    }
  });

  it('plants no tree inside a place', () => {
    const trees = buildingPlacements().filter(
      (p) =>
        p.sprite === WORLD_MAP_SPRITE_DATA.smallTree ||
        p.sprite === WORLD_MAP_SPRITE_DATA.smallPine,
    );
    for (const place of PLACES.filter((p) => p.id !== 'fair' && p.id !== 'cave')) {
      const r = place.rect;
      const inside = trees.filter(
        (t) => t.x >= r.x && t.x < r.x + r.width && t.y >= r.y && t.y < r.y + r.height,
      );
      expect(inside).toEqual([]);
    }
  });

  it('draws every inside scene with valid sprites', () => {
    for (const g of [sceneGeometry(390, 640), sceneGeometry(1440, 800)]) {
      for (const draw of [
        forgeDraw,
        arenaDraw,
        caveDraw,
        fairDraw,
        paddockDraw,
        houseDraw('day'),
      ]) {
        const placed = draw(g);
        expect(placed.length).toBeGreaterThan(0);
        for (const p of placed) expect(() => parseSprite(p.sprite)).not.toThrow();
      }
    }
  });
});

describe('needs on buildings', () => {
  it('pins each need of the Saturday to its building, one bubble each', () => {
    const world = initialWorld();
    expect(needs(world).map(placeOfNeed)).toEqual([
      'signpost',
      'forge',
      'arena',
      'cave',
      'house',
      'fair',
    ]);
    const bubbles = bubblesOf(world);
    expect(bubbles.map((b) => b.place)).toEqual([
      'signpost',
      'forge',
      'arena',
      'cave',
      'house',
      'fair',
    ]);
    expect(bubbles.find((b) => b.place === 'fair')?.time).toBe('13:37');
    expect(bubbles.filter((b) => b.place !== 'fair').every((b) => b.time === null)).toBe(true);
  });

  it('says the need in the place’s spoken name', () => {
    const world = initialWorld();
    const forge = bubblesOf(world).find((b) => b.place === 'forge');
    expect(placeLabel('forge', forge)).toBe('Forge, Workshop. Craft Kelp Cap is ready');
    expect(placeLabel('paddock', undefined)).toBe('Paddock, your creatures');
    const trip = bubblesOf(world).find((b) => b.place === 'signpost');
    expect(trip?.spoken).toBe('Sproutle is home from Verdant Hollow');
  });

  it('drops a bubble when its need is met', () => {
    let world = claimTrip(initialWorld(), TOUR.claimTripId);
    world = claimJob(world, TOUR.claimJobId);
    const places = bubblesOf(world).map((b) => b.place);
    expect(places).not.toContain('signpost');
    expect(places).not.toContain('forge');
    expect(bubblesOf(worldAtStep(7)).map((b) => b.place)).toEqual(['cave', 'fair']);
  });
});

describe('fitting the window', () => {
  it('pans sideways on a phone and shows the whole valley on a desktop', () => {
    const phone = fitValley(390, 780);
    expect(phone.pans).toBe(true);
    expect(phone.margin.left).toBe(0);
    expect(maxScroll(390)).toBe(1152 - 390);
    const desk = fitValley(1440, 836);
    expect(desk.pans).toBe(false);
    expect(desk.margin.left).toBeGreaterThan(0);
    // The valley itself is centred: its left edge sits at (1440 - 1152) / 2.
    expect(desk.left + desk.margin.left * 32).toBe(144);
  });

  it('starts a phone on the house, the paddock and the forge', () => {
    const left = startScroll(390);
    const house = PLACES.find((p) => p.id === 'house')?.rect;
    const forge = PLACES.find((p) => p.id === 'forge')?.rect;
    if (house === undefined || forge === undefined) throw new Error('missing places');
    expect(house.x * 2).toBeGreaterThanOrEqual(left);
    expect((forge.x + forge.width) * 2).toBeLessThanOrEqual(left + 390);
    expect(startScroll(360)).toBeGreaterThan(0);
  });

  it('points edge arrows at needs out of view, on the right side, and none on a desktop', () => {
    const left = startScroll(390);
    const arrows = edgeArrows(['signpost', 'forge', 'arena', 'cave', 'house', 'fair'], left, 390);
    expect(arrows.map((a) => `${a.place}:${a.side}`)).toEqual([
      'signpost:right',
      'arena:right',
      'cave:left',
      'fair:left',
    ]);
    expect(edgeArrows(['signpost'], 0, 1440)).toEqual([]);
    expect(edgeArrows(['signpost'], scrollToPlace('signpost', 390), 390)).toEqual([]);
  });

  it('reads the places west to east', () => {
    expect(readingOrder()).toEqual([
      'cave',
      'fair',
      'house',
      'paddock',
      'forge',
      'arena',
      'signpost',
    ]);
  });

  it('draws inside scenes at one world scale: 3 on a phone, 4 on a wide window, filling the space', () => {
    expect(sceneScale(390)).toBe(3);
    expect(sceneScale(1440)).toBe(4);
    const g = sceneGeometry(390, 640);
    expect(g.W * g.s).toBeGreaterThanOrEqual(390);
    expect(g.H * g.s).toBeGreaterThanOrEqual(640);
    expect(g.top * g.s).toBeGreaterThanOrEqual(56);
  });

  it('cuts a phone valley at the bottom, never at a building', () => {
    const fit = fitValley(390, 640);
    expect(fit.top).toBe(-32);
    const lowest = Math.max(...PLACES.map((p) => p.rect.y + p.rect.height));
    expect(lowest * 2 + fit.top).toBeLessThanOrEqual(640);
  });

  it('stacks edge tabs on a side so none overlap', () => {
    const arrows = edgeArrows(readingOrder(), 0, 390);
    const ys = stackTabs(arrows, 26);
    const right = arrows
      .filter((a) => a.side === 'right')
      .map((a) => ys.get(a.place) ?? 0)
      .sort((p, q) => p - q);
    for (let i = 1; i < right.length; i++) {
      expect((right[i] ?? 0) - (right[i - 1] ?? 0)).toBeGreaterThanOrEqual(26);
    }
    expect(arrows.every((a) => a.side === 'right')).toBe(true);
  });
});

describe('walkers', () => {
  const area = { x: 0, y: 0, width: 40, height: 20 };

  it('walk 1 px a tick inside their area, the same way every time for a seed', () => {
    const run = (): string[] => {
      const rng = createSeededRng('walker');
      let w = newWalker(rng, area, { index: 1, of: 4 });
      const seen: string[] = [];
      for (let i = 0; i < 200; i++) {
        const next = stepWalker(w, rng, area);
        expect(Math.abs(next.x - w.x) + Math.abs(next.y - w.y)).toBeLessThanOrEqual(1);
        expect(next.x).toBeGreaterThanOrEqual(0);
        expect(next.x).toBeLessThan(40);
        expect(next.y).toBeGreaterThanOrEqual(0);
        expect(next.y).toBeLessThan(20);
        expect(hopOf(next)).toBeLessThanOrEqual(1);
        w = next;
        seen.push(`${String(w.x)},${String(w.y)}`);
      }
      return seen;
    };
    expect(run()).toEqual(run());
  });

  it('start spread out in columns', () => {
    const xs = [0, 1, 2, 3].map(
      (i) => newWalker(createSeededRng(`w${String(i)}`), area, { index: i, of: 4 }).x,
    );
    expect(xs).toEqual([5, 15, 25, 35]);
  });
});

describe('actions of the scenes', () => {
  it('puts a raid creature on the slot that was tapped', () => {
    const world = worldAtStep(5);
    const [first] = TOUR.raidCreatureIds;
    if (first === undefined) throw new Error('no raid creature');
    const after = placeRaidAt(world, first, 4);
    const row = after.raid.party?.row ?? [];
    expect(row.find((s) => s.slot === 4)?.creature?.creatureId).toBe(first);
    expect(row.find((s) => s.slot === 0)?.creature).toBeNull();
    expect(after.raid.you.team?.creatures[0]?.slot).toBe(4);
    expect(raidTeamIds(after)).toEqual([first]);
  });

  it('evolves into the alternative form when picked', () => {
    const world = worldAtStep(6);
    const after = evolveInto(world, TOUR.evolveId, 'wickat');
    expect(after.creatures.find((c) => c.id === TOUR.evolveId)?.species).toBe('wickat');
    expect(after.balances.essence).toBe(world.balances.essence - 20);
  });

  it('puts the open jobs on the anvils, oldest first', () => {
    const world = initialWorld();
    expect(anvilJobs(world.jobs, 2)).toEqual([TOUR.claimJobId, null]);
    expect(anvilJobs(worldAtStep(5).jobs, 2)).toEqual([
      expect.stringMatching(/^proto-job-new/),
      null,
    ]);
  });
});
