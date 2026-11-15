import { describe, expect, it } from 'vitest';
import { homeInput } from '../workbench/home-sample';
import { SCALE_MAX, SCALE_MIN } from './bonfire-canvas';
import { CORNER } from './builders-corner';
import { withCommons } from './commons-sample';
import {
  MAX_AT_GATE,
  creaturesSpot,
  gateSpots,
  gateTarget,
  meadowAt,
  meadowFor,
  modeFor,
  paddockLayout,
  paddockScale,
  roamersOf,
  whereLine,
} from './paddock-canvas';
import { CREATURE_PX, PADDOCK_ROAM_AREA } from './place-cast';
import { PLATE_ROW_PX } from './place-plates';
import { artSize } from './place-scene';
import { sampleValley } from './signpost-sample';
import { sceneGeometry } from './SceneFrame';

const SIZES: [number, number][] = [
  [360, 600],
  [390, 700],
  [390, 780],
  [700, 600],
  [1100, 700],
  [1100, 780],
  [1440, 800],
  [1920, 1000],
];

const geometry = (width: number, height: number, corner: boolean) =>
  sceneGeometry(width, height, paddockScale(width, height, corner));

const each = (check: (w: number, h: number, corner: boolean) => void): void => {
  for (const [w, h] of SIZES) for (const corner of [false, true]) check(w, h, corner);
};

describe('the Paddock canvas: the scale', () => {
  it('is a whole number from the phone’s to the biggest, and a taller window never gets a smaller one', () => {
    each((w, h, corner) => {
      const s = paddockScale(w, h, corner);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(SCALE_MIN);
      expect(s).toBeLessThanOrEqual(SCALE_MAX);
      expect(paddockScale(w, h + 300, corner)).toBeGreaterThanOrEqual(s);
    });
  });

  it('fills a laptop: much bigger than the old band’s 3 to 6', () => {
    expect(paddockScale(1440, 800, false)).toBeGreaterThanOrEqual(6);
    expect(paddockScale(1100, 780, true)).toBeGreaterThanOrEqual(5);
  });

  it('the corner goes beside the yard on a wide window and under it on a phone', () => {
    expect(modeFor(98, true)).toBe('below');
    expect(modeFor(300, true)).toBe('beside');
    expect(modeFor(98, false)).toBe('none');
    expect(modeFor(500, false)).toBe('none');
  });
});

describe('the Paddock canvas: the layout', () => {
  it('keeps the art, the meadow, the gate and the corner inside the scene, the corner clear of the meadow', () => {
    each((w, h, corner) => {
      const g = geometry(w, h, corner);
      const lay = paddockLayout(g, corner);
      const name = `${String(w)}x${String(h)} ${corner ? 'corner' : 'no corner'}`;
      expect(lay.mode === 'none', name).toBe(!corner);
      expect(lay.box.y, name).toBeGreaterThanOrEqual(0);
      const meadow = meadowFor(g, lay);
      const underFeet = Math.ceil((PLATE_ROW_PX + 40) / g.s);
      expect(meadow.y + meadow.height + CREATURE_PX + underFeet, name).toBeLessThanOrEqual(g.H);
      // The gate's newcomers stand on the scene.
      const gate = gateTarget();
      expect(lay.box.x + gate.x + gate.w, name).toBeLessThanOrEqual(g.W);
      if (g.s > SCALE_MIN) expect(meadow.x, name).toBeGreaterThanOrEqual(0);
      if (lay.corner === null) return;
      if (g.s > SCALE_MIN) {
        expect(lay.corner.x, name).toBeGreaterThanOrEqual(0);
        expect(lay.corner.x + CORNER.w, name).toBeLessThanOrEqual(g.W);
      }
      expect(lay.corner.y + CORNER.feet + Math.ceil(PLATE_ROW_PX / g.s), name).toBeLessThanOrEqual(
        g.H,
      );
      if (lay.mode === 'below') {
        expect(lay.corner.y, name).toBeGreaterThanOrEqual(meadow.y + meadow.height + CREATURE_PX);
      } else {
        expect(lay.corner.x, name).toBeGreaterThan(lay.box.x + gate.x + gate.w - 4);
      }
    });
  });

  it('is the same for the same window every time, and centres the working area', () => {
    const g = geometry(1440, 800, true);
    const one = paddockLayout(g, true);
    expect(paddockLayout(g, true)).toEqual(one);
    const mid = (one.extent.left + one.extent.right) / 2;
    expect(Math.abs(mid - g.cx)).toBeLessThanOrEqual(CORNER.w / 2 + 10);
  });

  it('gives a taller window’s spare height to the meadow, keeping the rails high', () => {
    const short = geometry(390, 700, false);
    const tall = geometry(390, 900, false);
    const a = meadowFor(short, paddockLayout(short, false));
    const b = meadowFor(tall, paddockLayout(tall, false));
    expect(b.height).toBeGreaterThan(a.height);
    expect(paddockLayout(tall, false).box.y).toBeLessThan(tall.H / 4);
  });

  it('puts the "Creatures" button under the meadow’s front row, inside the scene, above the corner', () => {
    each((w, h, corner) => {
      const g = geometry(w, h, corner);
      const lay = paddockLayout(g, corner);
      const meadow = meadowFor(g, lay);
      const spot = creaturesSpot(meadow, g.s);
      expect(spot.y).toBeGreaterThanOrEqual(meadow.y + meadow.height + CREATURE_PX);
      expect(spot.y + Math.ceil(32 / g.s)).toBeLessThanOrEqual(g.H);
      if (lay.mode === 'below' && lay.corner !== null) {
        expect(spot.y + Math.ceil(32 / g.s)).toBeLessThanOrEqual(lay.corner.y);
      }
    });
  });
});

describe('the Paddock canvas: the gate', () => {
  it('stands at most two newcomers, one below the other, at the open side of the rails', () => {
    const art = artSize('paddock');
    expect(gateSpots(0)).toEqual([]);
    expect(gateSpots(1)).toHaveLength(1);
    const two = gateSpots(5);
    expect(two).toHaveLength(MAX_AT_GATE);
    expect(two[1]?.y).toBe((two[0]?.y ?? 0) + CREATURE_PX);
    expect(two[0]?.x).toBe(art.width - 2);
  });

  it('the gate’s tap covers every newcomer drawn', () => {
    const t = gateTarget();
    for (const n of gateSpots(MAX_AT_GATE)) {
      expect(n.x).toBeGreaterThanOrEqual(t.x);
      expect(n.x + CREATURE_PX).toBeLessThanOrEqual(t.x + t.w);
      expect(n.y).toBeGreaterThanOrEqual(t.y);
      expect(n.y + CREATURE_PX).toBeLessThanOrEqual(t.y + t.h);
    }
  });

  it('the meadow keeps its place the old scene gave it', () => {
    const m = meadowAt({ x: 10, y: 20 });
    expect(m).toEqual({
      x: 10 + PADDOCK_ROAM_AREA.x,
      y: 20 + PADDOCK_ROAM_AREA.y,
      width: PADDOCK_ROAM_AREA.width,
      height: PADDOCK_ROAM_AREA.height,
    });
  });
});

describe('the Paddock canvas: who roams and where each one is', () => {
  const free = homeInput('busy', true).creatures.map((c) => ({ ...c, busy: null, away: false }));
  const [a, b, c] = free;
  if (a === undefined || b === undefined || c === undefined) throw new Error('fixture');
  const visit = sampleValley(free, []);

  it('every free creature roams except the Paddock’s helper, a student and one away', () => {
    expect(roamersOf(free, visit, null).map((x) => x.id)).toEqual(free.map((x) => x.id));
    expect(roamersOf(free, visit, a.id).map((x) => x.id)).not.toContain(a.id);
    expect(roamersOf(free, visit, null, new Set([b.id])).map((x) => x.id)).not.toContain(b.id);
    const away = free.map((x) => (x.id === c.id ? { ...x, away: true } : x));
    expect(roamersOf(away, visit, null).map((x) => x.id)).not.toContain(c.id);
  });

  it('a creature at a communal seat is helping, not roaming, and says where', () => {
    const helped = withCommons(visit, undefined, { place: 'paddock', creatureId: a.id });
    expect(roamersOf(free, helped, null).map((x) => x.id)).not.toContain(a.id);
    expect(whereLine(a, helped, new Set())).toBe('Helping build the Paddock');
    expect(whereLine(b, helped, new Set())).toBe('At home in the Paddock');
    expect(whereLine(b, helped, new Set([b.id]))).toBe('At the School');
    expect(whereLine({ ...b, away: true }, helped, new Set())).toBe('Away');
  });
});
