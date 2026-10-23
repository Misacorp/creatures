import { describe, expect, it } from 'vitest';
import { expandRows, spriteSize, validateSprite } from '../../sprites/sprite-data';
import {
  FLOE_MAX_RADIUS,
  FLOE_MIN_RADIUS,
  MELON_FRAMES,
  THERMO_TUBE,
  floePlacements,
  garland,
  onFloe,
  ropeEllipse,
  thermometerFill,
  trackPoint,
} from './drawn';
import { GAMES_PROP_DATA } from './data/games-props';
import { GAMES_TILE_DATA } from './data/games-tiles';
import { flipX, flipY, rotateCW, shiftX } from './pixel';
import { GAMES_PROPS, PROP_NAMES, PROP_TINTS, propSprite, propTinted } from './props';
import {
  GAMES_SCENES,
  GAMES_SCENE_IDS,
  SCENE_SIZE,
  STANDS_SIZE,
  floeSpots,
  sceneWidthFor,
  standsSeats,
  type SceneLayers,
} from './scenes';
import { GAMES_TILES, TILE, TILE_NAMES, tilemapPlacements, tileFrame } from './tiles';
import { PRIMARY_KEYS, RAMPS, RAMP_NAMES, SECONDARY_KEYS, tintSprite } from './tint';

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function expectSprite(def: Parameters<typeof validateSprite>[0], label: string): void {
  expect(() => {
    validateSprite(def);
  }, label).not.toThrow();
  const { width, height } = spriteSize(def);
  expect(width, label).toBeLessThanOrEqual(64);
  expect(height, label).toBeLessThanOrEqual(64);
}

describe('the ramps', () => {
  it('are four hex colours each, light to dark', () => {
    for (const name of RAMP_NAMES) {
      const ramp = RAMPS[name];
      expect(ramp, name).toHaveLength(4);
      for (const c of ramp) expect(c, name).toMatch(HEX);
    }
  });

  it('reuse the token colours of the elements and the gold accent', () => {
    expect(RAMPS.tide[2]).toBe('#4f8fe6');
    expect(RAMPS.ember[2]).toBe('#ef6a3a');
    expect(RAMPS.grove[2]).toBe('#5cbf5a');
    expect(RAMPS.spark[2]).toBe('#f2d43d');
    expect(RAMPS.mire[2]).toBe('#b8864a');
    expect(RAMPS.gold[1]).toBe('#ffd25a');
  });
});

describe('the tiles', () => {
  it('are all 16x16 sprites, every frame', () => {
    for (const name of TILE_NAMES) {
      const frames = GAMES_TILES[name];
      expect(frames.length, name).toBeGreaterThan(0);
      for (const [i, def] of frames.entries()) {
        validateSprite(def, { width: TILE, height: TILE });
        expectSprite(def, `${name}[${String(i)}]`);
      }
    }
  });

  it('keep the material in ramp keys, so they can be re-themed', () => {
    for (const [name, def] of Object.entries(GAMES_TILE_DATA)) {
      const keys = Object.keys(def.palette);
      expect(
        keys.some((k) => (PRIMARY_KEYS as readonly string[]).includes(k)),
        name,
      ).toBe(true);
    }
  });

  it('have no ink outline on the ground (floors, water, walls)', () => {
    for (const name of [
      'grass',
      'dirt',
      'sand',
      'water',
      'deepWater',
      'planks',
      'woodWall',
      'snow',
      'ice',
    ] as const) {
      expect(GAMES_TILE_DATA[name].palette['k'], name).toBeUndefined();
    }
  });

  it('animate the water in two frames that are different but the same size', () => {
    for (const name of ['water', 'deepWater'] as const) {
      const [a, b] = GAMES_TILES[name];
      expect(a?.rows).not.toEqual(b?.rows);
    }
    expect(tileFrame('water', 2)).toBe(tileFrame('water', 0));
    expect(tileFrame('water', -1)).toBe(tileFrame('water', 1));
  });

  it('turn the shore to every side and corner', () => {
    expect(GAMES_TILES.shoreS[0].rows[15]).toBe(GAMES_TILE_DATA.shore.rows[0]);
    // Land is sand (f/g), water is b: the east shore has land on its right edge.
    const east = GAMES_TILES.shoreE[0].rows;
    expect(east.every((r) => !r.endsWith('b'))).toBe(true);
    expect(east.every((r) => r.startsWith('b'))).toBe(true);
    // The north-west corner has land at its top-left and water at its bottom-right.
    const nw = GAMES_TILES.shoreNW[0].rows;
    expect(nw[0]?.[0]).not.toBe('b');
    expect(nw[15]?.[15]).toBe('b');
  });
});

describe('the pixel transforms', () => {
  const def = { rows: ['ab.', 'cd.'], palette: { a: '#111', b: '#222', c: '#333', d: '#444' } };
  it('flip, turn and shift without losing pixels', () => {
    expect(flipX(def).rows).toEqual(['.ba', '.dc']);
    expect(flipY(def).rows).toEqual(['cd.', 'ab.']);
    expect(rotateCW(def).rows).toEqual(['ca', 'db', '..']);
    expect(shiftX(def, 1).rows).toEqual(['.ab', '.cd']);
    expect(shiftX(def, -1).rows).toEqual(['b.a', 'd.c']);
  });
});

describe('the props', () => {
  it('are all well-formed sprites of at most 64x64, in every frame and tint', () => {
    for (const name of PROP_NAMES) {
      const frames = GAMES_PROPS[name];
      expect(frames.length, name).toBeGreaterThan(0);
      const sizes = new Set(frames.map((f) => JSON.stringify(spriteSize(f))));
      // The cracks are three different shapes, not frames.
      if (name !== 'crack') expect(sizes.size, `${name}: every frame has the same size`).toBe(1);
      for (const [i, def] of frames.entries()) expectSprite(def, `${name}[${String(i)}]`);
      for (const tint of PROP_TINTS[name] ?? []) {
        for (const [i] of frames.entries())
          expectSprite(propTinted(name, tint, i), `${name} ${String(tint)}`);
      }
    }
  });

  it('draw the haul loads: a log that tilts and a pumpkin that rolls, both tintable', () => {
    const logs = GAMES_PROPS.log;
    expect(logs).toHaveLength(3);
    const size = (d: { rows: readonly string[] }) =>
      `${String(d.rows[0]?.length)}x${String(d.rows.length)}`;
    expect(new Set(logs.map(size)).size).toBe(1);
    expect(logs[1]?.rows).not.toEqual(logs[0]?.rows);
    expect(logs[2]?.rows).not.toEqual(logs[1]?.rows);
    const pumpkins = GAMES_PROPS.pumpkin;
    expect(pumpkins).toHaveLength(8);
    expect(new Set(pumpkins.map(size)).size).toBe(1);
    expect(new Set(pumpkins.map((d) => d.rows.join('|'))).size).toBe(8);
    for (const d of [...logs, ...pumpkins]) {
      // Primary and secondary ramps both present, so a tint reaches the bark and the rings, the rind and the stem.
      for (const key of ['a', 'b', 'c', 'd']) expect(d.palette[key], key).toBeDefined();
      expect(SECONDARY_KEYS.some((key) => d.palette[key] !== undefined)).toBe(true);
      expect(d.rows.length).toBeLessThanOrEqual(64);
    }
    const ghost = propSprite('pumpkin', 0, 'ghost', 'green');
    expect(ghost.palette['c']).toBe(RAMPS.ghost[2]);
  });

  it('have the ink outline (except soft effects and ground pieces)', () => {
    const soft = new Set([
      'steam',
      'dust',
      'cloud',
      'crack',
      'confetti',
      'icicles',
      'ripple',
      'dizzy',
      // A chequered stripe painted on the path.
      'finishBand',
    ]);
    for (const name of PROP_NAMES) {
      if (soft.has(name)) continue;
      expect(GAMES_PROPS[name][0].palette['k'], name).toBe('#0d0a1a');
    }
  });

  it('give the sizes the playback relies on', () => {
    expect(spriteSize(GAMES_PROP_DATA.pepper[0])).toEqual({ width: 8, height: 8 });
    expect(spriteSize(GAMES_PROP_DATA.medal[0])).toEqual({ width: 10, height: 12 });
    expect(MELON_FRAMES).toHaveLength(4);
    for (const f of MELON_FRAMES) expect(spriteSize(f)).toEqual({ width: 32, height: 32 });
    expect(GAMES_PROPS.steam).toHaveLength(3);
    expect(GAMES_PROPS.splash).toHaveLength(3);
    expect(GAMES_PROPS.flame).toHaveLength(3);
    expect(GAMES_PROPS.sharkFin).toHaveLength(2);
    expect(GAMES_PROPS.zap).toHaveLength(2);
    expect(GAMES_PROPS.dizzy).toHaveLength(2);
    expect(GAMES_PROPS.fan).toHaveLength(2);
  });

  it('roll the melon: each frame differs', () => {
    expect(new Set(MELON_FRAMES.map((f) => f.rows.join('/'))).size).toBe(4);
  });

  it('loop their frames', () => {
    expect(propSprite('flame', 3)).toBe(propSprite('flame', 0));
  });
});

describe('tintSprite', () => {
  const pepper = GAMES_PROP_DATA.pepper[0];

  it('keeps the size and the rows and changes only the ramp colours', () => {
    const green = tintSprite(pepper, 'green');
    expect(green.rows).toBe(pepper.rows);
    expect(spriteSize(green)).toEqual(spriteSize(pepper));
    for (const [key, colour] of Object.entries(pepper.palette)) {
      if ((PRIMARY_KEYS as readonly string[]).includes(key)) {
        expect(green.palette[key]).toBe(RAMPS.green[PRIMARY_KEYS.indexOf(key as 'a')]);
      } else {
        expect(green.palette[key], key).toBe(colour);
      }
    }
    expect(Object.keys(green.palette).sort()).toEqual(Object.keys(pepper.palette).sort());
  });

  it('tints the secondary keys and never adds a key the sprite lacks', () => {
    const medal = GAMES_PROP_DATA.medal[0];
    const t = tintSprite(medal, 'silver', 'red');
    for (const [i, key] of SECONDARY_KEYS.entries()) {
      if (Object.hasOwn(medal.palette, key)) expect(t.palette[key]).toBe(RAMPS.red[i]);
    }
    const plain = tintSprite(GAMES_PROP_DATA.plate[0], 'red', 'blue');
    expect(plain.palette).toEqual(GAMES_PROP_DATA.plate[0].palette);
  });

  it('is memoised: the same sprite and ramps give the same object', () => {
    expect(tintSprite(pepper, 'red')).toBe(tintSprite(pepper, 'red'));
    expect(tintSprite(pepper, 'red', 'blue')).toBe(tintSprite(pepper, 'red', 'blue'));
    expect(tintSprite(pepper, 'red')).not.toBe(tintSprite(pepper, 'ghost'));
    expect(tintSprite(pepper, RAMPS.red)).toBe(tintSprite(pepper, 'red'));
  });
});

describe('the code-drawn shapes', () => {
  it('fill the thermometer from 0 to 100, clamped, memoised', () => {
    const empty = thermometerFill(0);
    const full = thermometerFill(100);
    const count = (d: typeof empty) => d.rows.filter((r) => r !== '...').length;
    expect(empty.rows).toHaveLength(THERMO_TUBE.height);
    expect(count(empty)).toBe(1);
    expect(count(full)).toBe(THERMO_TUBE.height);
    expect(count(thermometerFill(50))).toBeGreaterThan(count(thermometerFill(20)));
    expect(thermometerFill(150)).toBe(full);
    expect(thermometerFill(-5)).toBe(empty);
    expect(thermometerFill(42, 'tide')).toBe(thermometerFill(42, 'tide'));
    expectSprite(full, 'fill');
  });

  it('draw the floe smaller as the radius shrinks, always as valid pieces', () => {
    const area = (rx: number) =>
      floePlacements(rx).reduce(
        (sum, p) => sum + expandRows(p.sprite).join('').replaceAll('.', '').length,
        0,
      );
    for (const rx of [FLOE_MIN_RADIUS, 26, 52, 80, FLOE_MAX_RADIUS]) {
      for (const p of floePlacements(rx)) expectSprite(p.sprite, `floe ${String(rx)}`);
    }
    expect(area(80)).toBeGreaterThan(area(52));
    expect(area(52)).toBeGreaterThan(area(26));
    expect(floePlacements(52)).toBe(floePlacements(52.2));
    expect(floePlacements(500)).toBe(floePlacements(FLOE_MAX_RADIUS));
  });

  it('put every standing spot on the floe', () => {
    for (const rx of [26, 52, 80]) {
      for (const s of floeSpots(rx)) expect(onFloe(s.x, s.y - 2, rx), `${String(rx)}`).toBe(true);
    }
  });

  it('cut the rope ellipse and the garland into valid pieces', () => {
    for (const p of ropeEllipse({ cx: 96, cy: 62, rx: 72, ry: 34 })) expectSprite(p.sprite, 'rope');
    for (const p of garland(0, 191, 0, 7, ['red', 'blue'])) expectSprite(p.sprite, 'garland');
    expect(garland(0, 191, 0, 7, ['red'])).toBe(garland(0, 191, 0, 7, ['red']));
  });

  it('go round the track from the start at the bottom', () => {
    expect(trackPoint(0)).toEqual({ x: 96, y: 96 });
    expect(trackPoint(1)).toEqual(trackPoint(0));
    expect(trackPoint(0.25).x).toBeGreaterThan(160);
  });
});

function inside(p: { x: number; y: number }, w: number, h: number): boolean {
  return p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h;
}

function checkLayers(layers: SceneLayers, label: string): void {
  expect(layers.back.length, label).toBeGreaterThan(0);
  for (const p of [...layers.back, ...layers.front]) {
    expectSprite(p.sprite, label);
    expect(Number.isInteger(p.x) && Number.isInteger(p.y), label).toBe(true);
  }
}

describe.each(GAMES_SCENE_IDS)('the %s scene', (id) => {
  const scene = GAMES_SCENES[id];

  it('has tilemaps whose keys are all in their legends, with rows of equal width', () => {
    expect(scene.tilemaps.length).toBeGreaterThan(0);
    for (const { map } of scene.tilemaps) {
      const width = map.rows[0]?.length ?? 0;
      expect(width).toBeGreaterThan(0);
      for (const row of map.rows) {
        expect(row.length).toBe(width);
        for (const key of row) if (key !== '.') expect(Object.keys(map.legend)).toContain(key);
      }
      for (const ref of Object.values(map.legend)) expect(TILE_NAMES).toContain(ref.tile);
      expect(() => tilemapPlacements(map, { width: 400 })).not.toThrow();
    }
  });

  it('has anchors, all inside 192x112', () => {
    const names = Object.keys(scene.anchors);
    expect(names.length).toBeGreaterThan(0);
    for (const [name, points] of Object.entries(scene.anchors)) {
      expect(points.length, name).toBeGreaterThan(0);
      for (const p of points) {
        expect(inside(p, SCENE_SIZE.width, SCENE_SIZE.height), `${name} ${JSON.stringify(p)}`).toBe(
          true,
        );
      }
    }
  });

  it('draws valid sprites in every frame, on both layers, and its stands strip', () => {
    for (const frame of [0, 1, 2, 5]) {
      const layers = scene.layers({ frame, heat: 70, floeRadius: 40 });
      checkLayers(layers, `${id} frame ${String(frame)}`);
      expect(layers.height).toBe(SCENE_SIZE.height);
      const stands = scene.stands({ frame });
      checkLayers(stands, `${id} stands`);
      expect([stands.width, stands.height]).toEqual([STANDS_SIZE.width, STANDS_SIZE.height]);
    }
  });
});

describe('the fixed geometry', () => {
  const a = (id: (typeof GAMES_SCENE_IDS)[number], name: string) =>
    GAMES_SCENES[id].anchors[name] ?? [];

  it('seats the sauna and the cold plunge on two benches, x 40 to 176 in 17s', () => {
    for (const id of ['sauna', 'frost-bath'] as const) {
      expect(a(id, 'upper').map((p) => p.x)).toEqual([40, 57, 74, 91, 108, 125, 142, 159, 176]);
      expect(new Set(a(id, 'upper').map((p) => p.y))).toEqual(new Set([60]));
      expect(new Set(a(id, 'lower').map((p) => p.y))).toEqual(new Set([84]));
      expect(a(id, 'exit')).toEqual([{ x: 186, y: 100 }]);
    }
  });

  it('seats the pepper eaters at two tables, x 24 to 168 in 18s, behind front-layer table fronts', () => {
    expect(a('pepper-table', 'back').map((p) => p.x)).toEqual([
      24, 42, 60, 78, 96, 114, 132, 150, 168,
    ]);
    expect(new Set(a('pepper-table', 'back').map((p) => p.y))).toEqual(new Set([56]));
    expect(new Set(a('pepper-table', 'front').map((p) => p.y))).toEqual(new Set([88]));
    const fronts = GAMES_SCENES['pepper-table'].tilemaps.filter((t) => t.layer === 'front');
    expect(fronts).toHaveLength(2);
    expect(GAMES_SCENES['pepper-table'].layers().front.length).toBeGreaterThan(20);
  });

  it('runs the melon hill in lanes 50 to 100 and repeats it as wide as asked', () => {
    for (const p of a('melon-hill', 'lanes')) expect(p.y >= 48 && p.y <= 100).toBe(true);
    expect(sceneWidthFor(10)).toBe(192);
    expect(sceneWidthFor(700) % 96).toBe(0);
    expect(sceneWidthFor(700)).toBeGreaterThanOrEqual(700);
    const wide = GAMES_SCENES['melon-hill'].layers({ width: 960 });
    expect(wide.width).toBe(960);
    expect(Math.max(...wide.back.map((p) => p.x))).toBeGreaterThan(900);
  });

  it('lands knocked-out swimmers on the beach at y 104', () => {
    expect(new Set(a('shark-lake', 'shore').map((p) => p.y))).toEqual(new Set([104]));
  });

  it('spreads up to fifteen creatures along the stands, inside the strip', () => {
    expect(standsSeats(0)).toEqual([]);
    expect(standsSeats(1)).toEqual([{ x: 96, y: 38 }]);
    const seats = standsSeats(15);
    expect(seats).toHaveLength(15);
    for (const s of seats) {
      expect(s.x - 8).toBeGreaterThanOrEqual(0);
      expect(s.x + 8).toBeLessThanOrEqual(STANDS_SIZE.width);
    }
  });

  it('draws the scenes the same way every time (no randomness)', () => {
    for (const id of GAMES_SCENE_IDS) {
      const one = GAMES_SCENES[id].layers({ frame: 3, heat: 40 });
      const two = GAMES_SCENES[id].layers({ frame: 3, heat: 40 });
      expect(two.back.map((p) => [p.x, p.y, p.sprite])).toEqual(
        one.back.map((p) => [p.x, p.y, p.sprite]),
      );
    }
  });
});
