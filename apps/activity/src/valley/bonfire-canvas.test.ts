import { describe, expect, it } from 'vitest';
import {
  ART_Y,
  CLUSTER_PAD,
  SCALE_MAX,
  SCALE_MIN,
  bonfireLayout,
  bonfireSceneDraw,
  bonfireScale,
  edgeDressing,
  fireTarget,
  groundArea,
  groundBlocks,
  modeFor,
  settleOnGround,
} from './bonfire-canvas';
import { fireSpots, FIRE_BOX, GRAND_BOX, GROUND_MARGIN, moreSpot } from './bonfire-cast';
import { SKY_BELOW_ART_TOP } from './place-scene';
import {
  CORNER,
  CORNER_AT,
  FLAG_AT,
  HELPER_AT,
  TABLE_BOX,
  cornerPieceBoxes,
  pileMaterial,
  pileSize,
} from './builders-corner';
import { cornerSize, cornerSprite } from './builders-corner-art';
import { PLATE_ROW_PX, plateGap, standBounds } from './place-plates';
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

const geometry = (width: number, height: number, grand: boolean, corner: boolean) =>
  sceneGeometry(width, height, bonfireScale(width, height, grand, corner));

const each = (check: (w: number, h: number, grand: boolean, corner: boolean) => void): void => {
  for (const [w, h] of SIZES) {
    for (const grand of [false, true]) {
      for (const corner of [false, true]) check(w, h, grand, corner);
    }
  }
};

describe('the Bonfire canvas: the scale', () => {
  it('is a whole number from the phone’s to the biggest, and a taller window never gets a smaller one', () => {
    each((w, h, grand, corner) => {
      const s = bonfireScale(w, h, grand, corner);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(SCALE_MIN);
      expect(s).toBeLessThanOrEqual(SCALE_MAX);
      expect(bonfireScale(w, h + 300, grand, corner)).toBeGreaterThanOrEqual(s);
    });
  });

  it('fills a laptop: bigger than the old fire, which was never over 6', () => {
    expect(bonfireScale(1440, 800, false, false)).toBe(8);
    expect(bonfireScale(1440, 800, false, true)).toBeGreaterThanOrEqual(6);
    expect(bonfireScale(1100, 780, false, true)).toBeGreaterThanOrEqual(6);
  });

  it('a corner below the fire costs a phone nothing in width, a hearth at the top level gets the room back', () => {
    for (const grand of [false, true]) {
      expect(bonfireScale(390, 780, grand, false)).toBeGreaterThanOrEqual(
        bonfireScale(390, 780, grand, true),
      );
    }
    expect(bonfireScale(390, 780, false, true)).toBe(4);
  });

  it('the corner goes beside the fire on a wide window and under it on a phone', () => {
    expect(modeFor(98, false, true)).toBe('below');
    expect(modeFor(260, false, true)).toBe('beside');
    expect(modeFor(98, false, false)).toBe('none');
    expect(modeFor(500, true, false)).toBe('none');
  });
});

describe('the Bonfire canvas: the layout', () => {
  it('keeps the fire, its ring and the corner inside the scene, and the corner clear of the ring', () => {
    each((w, h, grand, corner) => {
      const g = geometry(w, h, grand, corner);
      const lay = bonfireLayout(g, grand, corner);
      const name = `${String(w)}x${String(h)} ${grand ? 'grand' : 'plain'} ${corner ? 'corner' : 'no corner'}`;
      expect(lay.box.y, name).toBeGreaterThanOrEqual(ART_Y);
      expect(lay.box.y + lay.box.height, name).toBeLessThanOrEqual(g.H);
      expect(lay.mode === 'none', name).toBe(!corner);
      if (lay.corner === null) return;
      // The corner is whole in the scene (a phone at the smallest scale may be narrower than it: then it is the one that cannot).
      if (g.s > SCALE_MIN) {
        expect(lay.corner.x, name).toBeGreaterThanOrEqual(0);
        expect(lay.corner.x + CORNER.w, name).toBeLessThanOrEqual(g.W);
        expect(
          lay.corner.y + CORNER.feet + Math.ceil(PLATE_ROW_PX / g.s),
          name,
        ).toBeLessThanOrEqual(g.H);
      }
      // Under the ring or beside it, never over it: the seats and the "+N more" button under the front seat end above or left of it.
      const front = lay.box.y + (grand ? 74 : 80);
      const under = Math.ceil((PLATE_ROW_PX + 40) / g.s);
      if (lay.mode === 'below') expect(lay.corner.y, name).toBeGreaterThanOrEqual(front + under);
      else expect(lay.corner.x, name).toBeGreaterThan(lay.box.x + (grand ? 82 : 60));
    });
  });

  it('shows at least the front three creatures on a phone with a corner, with or without a "+N more" under them', () => {
    for (const grand of [false, true]) {
      const g = geometry(390, 780, grand, true);
      const lay = bonfireLayout(g, grand, true);
      const many = Array.from({ length: 7 }, (_, i) => ({
        creature: {
          id: `c${String(i)}`,
          species: 'sproutle',
          level: 1,
          shiny: false,
          nickname: null,
        },
        gained: 0,
        warm: false,
      }));
      const spots = fireSpots(many, lay.box, g, { grand });
      expect(spots.length).toBeGreaterThanOrEqual(3);
      const bounds = standBounds(g);
      const gap = plateGap(g.s);
      // The "+N more" button's top stands below every seat's plate, and the corner below the button.
      const more = moreSpot(lay.box, g.s, grand);
      for (const spot of spots) expect(more.y).toBeGreaterThan(spot.y + gap.y - 16);
      expect(bounds.y).toBeLessThanOrEqual(lay.box.y);
    }
  });

  it('is the same for the same window every time, and centres the working area', () => {
    for (const grand of [false, true]) {
      const g = geometry(1440, 800, grand, true);
      const one = bonfireLayout(g, grand, true);
      expect(bonfireLayout(g, grand, true)).toEqual(one);
      const mid = (one.extent.left + one.extent.right) / 2;
      expect(Math.abs(mid - g.cx)).toBeLessThanOrEqual(CORNER.w / 2 + 10);
    }
  });
});

describe('the Bonfire canvas: the builders’ corner', () => {
  it('stands every piece inside its box, on the ground patch, with the helper beside the table', () => {
    for (const p of cornerPieceBoxes()) {
      expect(p.x, p.piece).toBeGreaterThanOrEqual(0);
      expect(p.y, p.piece).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w, p.piece).toBeLessThanOrEqual(CORNER.w);
      expect(p.y + p.h, p.piece).toBeLessThanOrEqual(CORNER.h);
    }
    expect(HELPER_AT.x).toBeGreaterThanOrEqual(TABLE_BOX.x + TABLE_BOX.w);
    expect(HELPER_AT.y + 16).toBe(CORNER.feet);
    expect(HELPER_AT.x + 16).toBeLessThanOrEqual(CORNER.w);
  });

  it('draws the pieces at the Art session’s sizes (the art is read by name)', () => {
    const sizes = {
      table: [32, 20],
      tarp: [48, 24],
      sawhorse: [16, 12],
      planks: [20, 8],
      toolbox: [12, 8],
      'help-flag': [8, 16],
      'pile-stone-s': [14, 5],
      'pile-stone-m': [22, 9],
      'pile-stone-l': [26, 13],
      'pile-timber-s': [10, 10],
      'pile-timber-m': [14, 14],
      'pile-timber-l': [23, 14],
      'pile-bags-s': [9, 9],
      'pile-bags-m': [17, 13],
      'pile-bags-l': [25, 13],
    } as const;
    for (const [name, [w, h]] of Object.entries(sizes) as [
      keyof typeof sizes,
      [number, number],
    ][]) {
      expect(cornerSize(name), name).toEqual({ w, h });
    }
  });

  it('the table stands under the tarp at its x 8, and the helper’s flag has clear ground (no pile touches it)', () => {
    expect(CORNER_AT.table.x).toBe(CORNER_AT.tarp.x + 8);
    expect(CORNER_AT.table.y + 19).toBe(CORNER_AT.tarp.y + 23);
    const flag = { x: FLAG_AT.x, y: FLAG_AT.y, w: 8, h: 16 };
    for (const p of cornerPieceBoxes()) {
      if (!p.piece.startsWith('pile-')) continue;
      const touches =
        p.x < flag.x + flag.w + 1 &&
        p.x + p.w > flag.x - 1 &&
        p.y < flag.y + flag.h + 1 &&
        p.y + p.h > flag.y - 1;
      expect(touches, p.piece).toBe(false);
    }
  });

  it('the pile grows with the project and its material follows the level', () => {
    expect([0, 33, 34, 66, 67, 100].map(pileSize)).toEqual(['s', 's', 'm', 'm', 'l', 'l']);
    expect([1, 2, 3, 4, 5].map(pileMaterial)).toEqual([
      'timber',
      'timber',
      'stone',
      'bags',
      'bags',
    ]);
  });
});

describe('the Bonfire canvas: the edges of the scene', () => {
  it('dresses only past the working area, never over the fire, its seats or the corner', () => {
    each((w, h, grand, corner) => {
      const g = geometry(w, h, grand, corner);
      const lay = bonfireLayout(g, grand, corner);
      for (const p of edgeDressing(g, lay.box, lay.extent)) {
        const width = p.sprite.rows[0]?.length ?? 0;
        const clear = p.x + width <= lay.extent.left || p.x >= lay.extent.right;
        expect(clear, `${String(w)}x${String(h)}: a piece at ${String(p.x)}`).toBe(true);
        const gapOk =
          lay.extent.left - (p.x + width) >= CLUSTER_PAD - 1 ||
          p.x - lay.extent.right >= CLUSTER_PAD - 1;
        expect(gapOk).toBe(true);
      }
    });
  });

  it('puts nothing below the scene, keeps every piece at least partly in view, and is the same every time', () => {
    each((w, h, grand, corner) => {
      const g = geometry(w, h, grand, corner);
      const lay = bonfireLayout(g, grand, corner);
      const one = edgeDressing(g, lay.box, lay.extent);
      expect(edgeDressing(g, lay.box, lay.extent)).toEqual(one);
      for (const p of one) {
        const width = p.sprite.rows[0]?.length ?? 0;
        expect(p.x + width).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(g.W);
        expect(p.y + p.sprite.rows.length).toBeLessThanOrEqual(g.H);
      }
    });
  });

  it('fills more of a wide window than of a phone, and draws back to front', () => {
    const count = (w: number, h: number) => {
      const g = geometry(w, h, false, false);
      const lay = bonfireLayout(g, false, false);
      return edgeDressing(g, lay.box, lay.extent).length;
    };
    expect(count(1920, 1000)).toBeGreaterThan(count(390, 700));
    const g = geometry(1920, 1000, false, false);
    const lay = bonfireLayout(g, false, false);
    const feet = edgeDressing(g, lay.box, lay.extent).map((p) => p.y + p.sprite.rows.length);
    expect(feet).toEqual([...feet].sort((a, b) => a - b));
  });

  it('draws the ground to every edge, the fire, the scaffolding over it while the project fills, and the corner while there is one', () => {
    const g = geometry(1100, 780, true, true);
    const pile = { material: 'timber', size: 's' } as const;
    const none = bonfireSceneDraw('bonfire-grand', 0, null)(g);
    const plain = bonfireSceneDraw('bonfire-grand', 0, pile)(g);
    const built = bonfireSceneDraw('bonfire-grand', 2, pile)(g);
    expect(built.length).toBe(plain.length + 1);
    // The corner: its table is drawn with it and not without it.
    const table = cornerSprite('table');
    expect(plain.some((p) => p.sprite === table)).toBe(true);
    expect(none.some((p) => p.sprite === table)).toBe(false);
    const lay = bonfireLayout(g, true, true);
    const last = built[built.length - 1];
    expect(last).toMatchObject({ x: lay.box.x, y: lay.box.y });
    const grass = none.filter((p) => p.sprite.rows.length === 16 && p.y >= 0);
    expect(Math.max(...grass.map((p) => p.x))).toBeGreaterThanOrEqual(g.W - 16);
    expect(Math.max(...grass.map((p) => p.y))).toBeGreaterThanOrEqual(g.H - 16);
  });

  it('the fire target is inside the art, clear of the seats round it', () => {
    for (const [grand, size] of [
      [false, FIRE_BOX],
      [true, GRAND_BOX],
    ] as const) {
      const t = fireTarget(grand);
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.x + t.w).toBeLessThanOrEqual(size.width);
      expect(t.y + t.h).toBeLessThanOrEqual(size.height);
    }
  });
});

const WIDE: [number, number][] = [...SIZES, [2560, 1080], [1920, 1080], [1100, 800], [390, 844]];

const crowd = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    creature: { id: `c${String(i)}`, species: 'sproutle', level: 1, shiny: false, nickname: null },
    gained: 0,
    warm: false,
  }));

const clearOf = (
  at: { x: number; y: number },
  r: { x: number; y: number; width: number; height: number },
) => at.x + 16 <= r.x || at.x >= r.x + r.width || at.y + 16 <= r.y || at.y >= r.y + r.height;

describe('the Bonfire canvas: the ground (Misa, 2026-11-16: creatures floated above the horizon)', () => {
  it('stands every resting creature below the horizon and clear of trees, the fire and the corner, at every window and crowd', () => {
    for (const [w, h] of WIDE) {
      for (const grand of [false, true]) {
        for (const corner of [false, true]) {
          const g = geometry(w, h, grand, corner);
          const lay = bonfireLayout(g, grand, corner);
          const blocks = groundBlocks(g, lay, grand);
          for (const n of [1, 3, 5, 7, 8, 10]) {
            const spots = fireSpots(crowd(n), lay.box, g, { grand });
            const name = `${String(w)}x${String(h)} grand ${String(grand)} corner ${String(corner)} x${String(n)}`;
            expect(spots.length, name).toBeGreaterThan(0);
            for (const spot of spots) {
              expect(spot.y + 16, name).toBeGreaterThanOrEqual(
                lay.box.y + SKY_BELOW_ART_TOP + GROUND_MARGIN,
              );
              for (const r of blocks)
                expect(clearOf(spot, r), `${name} at ${String(spot.x)},${String(spot.y)}`).toBe(
                  true,
                );
            }
          }
        }
      }
    }
  });

  it('seats seven creatures round the fire on a wide window', () => {
    for (const grand of [false, true]) {
      const g = geometry(2560, 1080, grand, false);
      const lay = bonfireLayout(g, grand, false);
      expect(fireSpots(crowd(7), lay.box, g, { grand })).toHaveLength(7);
    }
  });

  it('keeps a dropped creature on the ground: the sky clamps down, trees and the fire push it out', () => {
    for (const grand of [false, true]) {
      const g = geometry(1920, 1080, grand, true);
      const lay = bonfireLayout(g, grand, true);
      const area = groundArea(g, lay.box);
      const blocks = groundBlocks(g, lay, grand);
      expect(area.y + 16).toBeGreaterThanOrEqual(lay.box.y + SKY_BELOW_ART_TOP + GROUND_MARGIN);
      // Dropped high in the sky (and over the fire): lands on the ground, over nothing.
      const sky = settleOnGround({ x: lay.box.x + 20, y: 0 }, area, blocks, [], g.s);
      expect(sky.y).toBeGreaterThanOrEqual(area.y);
      const fire = fireTarget(grand);
      const land = [
        settleOnGround(
          { x: lay.box.x + fire.x + 4, y: lay.box.y + fire.y + 4 },
          area,
          blocks,
          [],
          g.s,
        ),
        ...blocks
          .slice(0, 6)
          .map((r) => settleOnGround({ x: r.x + 2, y: r.y + 2 }, area, blocks, [], g.s)),
      ];
      for (const at of land) {
        expect(at.y).toBeGreaterThanOrEqual(area.y);
        for (const r of blocks) expect(clearOf(at, r)).toBe(true);
      }
      // Dropped on another creature: a plate's gap away, and the same drop gives the same spot.
      const other = { x: lay.box.x + 20, y: lay.box.y + 64 };
      const near = settleOnGround(other, area, [], [other], g.s);
      expect(near).not.toEqual(other);
      expect(settleOnGround(other, area, [], [other], g.s)).toEqual(near);
    }
  });
});
