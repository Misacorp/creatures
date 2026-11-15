import { describe, expect, it } from 'vitest';
import { housing } from '@creatures/game/housing-content';
import { expandRows, type SpriteDef } from '../sprites/sprite-data';
import { pieceArt } from './house-art';
import {
  DAY_LIGHTING,
  LEVEL_WEIGHT,
  LIGHT_SHAPE,
  STEPS,
  duskSky,
  duskWindowPixel,
  flameCentre,
  levelMap,
  lightCentre,
  lightKindOf,
  lightOf,
  luma,
  pixelHash,
  shade,
  skyForPhase,
  tintSprite,
  toneOf,
  type Lighting,
  type Rgb,
  type SceneLight,
} from './house-light';
import { rasterize } from './house-paint';
import { composeHouse, composeRoom, type Placement } from './house-scene';
import { HUT, MANSION, THREE_FLOORS, sceneHouse } from './house-scene-sample';

/** A plain painter: the placements in order, each sprite's own colours, no lighting. */
function reference(
  placements: readonly Placement[],
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (const p of placements) {
    const rows = expandRows(p.sprite);
    const w = p.w ?? rows[0]?.length ?? 0;
    const h = p.h ?? rows.length;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const hex = p.sprite.palette[rows[y]?.[x] ?? '.'];
        if (hex === undefined) continue;
        const full = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join('') : hex.slice(1);
        const n = Number.parseInt(full, 16);
        const at = ((p.y + y) * width + p.x + x) * 4;
        out[at] = (n >> 16) & 255;
        out[at + 1] = (n >> 8) & 255;
        out[at + 2] = n & 255;
        out[at + 3] = 255;
      }
    }
  }
  return out;
}

const NIGHT: Lighting = { phase: 'night', lights: [] };

describe('day', () => {
  // One small house proves the rule (the paint pass is per placement, not per house size); a bigger one only costs seconds.
  it('a hut is painted pixel for pixel as the sprites are drawn', () => {
    const house = sceneHouse({ parts: HUT, housemates: 2 });
    const model = composeHouse(house);
    expect(model.lighting.phase).toBe('day');
    expect(model.lighting.lights).toHaveLength(0);
    const all = [...model.back, ...model.front];
    const want = reference(all, model.width, model.height);
    expect(rasterize(all, model.width, model.height)).toEqual(want);
    expect(rasterize(all, model.width, model.height, model.lighting)).toEqual(want);
    expect(rasterize(all, model.width, model.height, DAY_LIGHTING)).toEqual(want);
  });

  it('draws the same placements whether or not the phase is named', () => {
    const house = sceneHouse({ parts: THREE_FLOORS, housemates: 2 });
    const a = composeHouse(house);
    const b = composeHouse(house, { phase: 'day' });
    const bare = (ps: Placement[]) => ps.map(({ sprite, x, y, w, h }) => ({ sprite, x, y, w, h }));
    expect(bare(b.back)).toEqual(bare(a.back));
    expect(bare(b.front)).toEqual(bare(a.front));
  });

  it('maps no colour', () => {
    expect(shade([200, 120, 40], 'wall', 'day', 0)).toEqual([200, 120, 40]);
    expect(shade([200, 120, 40], 'auto', 'day', 3)).toEqual([200, 120, 40]);
  });
});

describe('the indoor grades (the living room as the model)', () => {
  const sofa: Rgb = [0xc3, 0x65, 0x5f];
  const chair: Rgb = [0xb3, 0x70, 0x3f];

  it('keep furniture close to its day colour: at most one step darker, still colourful', () => {
    for (const phase of ['twilight', 'night'] as const) {
      for (const c of [sofa, chair, [0x5a, 0xa3, 0xe6] as Rgb, [0x8a, 0xb0, 0x58] as Rgb]) {
        const out = shade(c, 'auto', phase, 0);
        expect(luma(out)).toBeGreaterThan(luma(c) * 0.78);
        expect(Math.max(...out) - Math.min(...out)).toBeGreaterThan(
          (Math.max(...c) - Math.min(...c)) * 0.6,
        );
      }
    }
    // the sofa stays red at night, a little cooler than by day
    const night = shade(sofa, 'auto', 'night', 0);
    expect(night[0]).toBeGreaterThan(night[1] * 1.4);
    expect(night[2] / night[0]).toBeGreaterThan(sofa[2] / sofa[0]);
  });

  it('keep creatures readable and colourful', () => {
    const out = shade(sofa, 'creature', 'night', 0);
    expect(luma(out)).toBeGreaterThan(luma(sofa) * 0.85);
    expect(shade([0x0d, 0x0a, 0x1a], 'creature', 'night', 0)).toEqual([0x0d, 0x0a, 0x1a]);
  });

  it('take the wall and floor of the Cosy room to the living room: indigo wall, plum floor at night', () => {
    // the living room's own tile: wall #8b80bd and floor #ad7650 by day
    const wall = shade([0x8b, 0x80, 0xbd], 'wall', 'night', 0);
    const want = [0x35, 0x2e, 0x66];
    for (const [i, w] of want.entries()) expect(Math.abs((wall[i] ?? 0) - w)).toBeLessThan(0x20);
    const floor = shade([0xad, 0x76, 0x50], 'floor', 'night', 0);
    const wantFloor = [0x6a, 0x44, 0x53];
    for (const [i, w] of wantFloor.entries())
      expect(Math.abs((floor[i] ?? 0) - w)).toBeLessThan(0x20);
    const dusk = shade([0x8b, 0x80, 0xbd], 'wall', 'twilight', 0);
    expect(dusk[0]).toBeGreaterThan(dusk[2] * 0.85); // rosier than the day's lavender
  });

  it('keep a loud wallpaper from glaring: an orange wall is quieter at night than by day and darker than a lit lamp', () => {
    const orange: Rgb = [0xe0, 0x8a, 0x4a];
    const night = shade(orange, 'wall', 'night', 0);
    expect(luma(night)).toBeLessThan(luma(orange) * 0.6);
    expect(Math.max(...night) - Math.min(...night)).toBeLessThan(
      Math.max(...orange) - Math.min(...orange),
    );
  });

  it('turn a window at dusk into a stepped sky, violet at the top and amber at the bottom', () => {
    expect(duskWindowPixel(0, 0, 0, false)[2]).toBeGreaterThan(duskWindowPixel(0, 0, 0, false)[0]);
    const low = duskWindowPixel(1, 1, 1, false);
    expect(low[0]).toBeGreaterThan(low[2]);
    expect(duskWindowPixel(0.5, 3, 4, true)).not.toEqual(duskWindowPixel(0.5, 3, 4, false));
  });
});

describe('the ramps', () => {
  const wood: Rgb = [0x91, 0x5d, 0x42];
  const cloth: Rgb = [0xc3, 0x65, 0x5f];

  it('are palette swaps: one colour always gives one colour', () => {
    expect(shade(wood, 'auto', 'night', 0)).toEqual(shade(wood, 'auto', 'night', 0));
    expect(shade(wood, 'auto', 'twilight', 2)).toEqual(shade(wood, 'auto', 'twilight', 2));
  });

  it('make a colour darker at night than at twilight, and at twilight than by day, outside every light', () => {
    for (const c of [wood, cloth, [0x8c, 0xc6, 0xf2] as Rgb, [0xe8, 0xe2, 0xd4] as Rgb]) {
      const day = luma(c);
      const dusk = luma(shade(c, 'auto', 'twilight', 0));
      const night = luma(shade(c, 'auto', 'night', 0));
      expect(night).toBeLessThan(dusk);
      expect(dusk).toBeLessThan(day);
    }
  });

  it('leave ink alone, so outlines survive', () => {
    expect(shade([0x0d, 0x0a, 0x1a], 'auto', 'night', 0)).toEqual([0x0d, 0x0a, 0x1a]);
    expect(shade([0x0d, 0x0a, 0x1a], 'wall', 'night', 0)).not.toEqual([0, 0, 0]);
    for (const c of [wood, cloth]) {
      expect(luma(shade(c, 'auto', 'night', 0))).toBeGreaterThan(luma([0x0d, 0x0a, 0x1a]) + 0.04);
    }
  });

  it('go by material: the same colour is a different night on a wall, a roof and a lawn', () => {
    const outs = (['wall', 'roof', 'ground', 'earth', 'exterior', 'creature'] as const).map((m) =>
      shade(wood, m, 'night', 0).join(),
    );
    expect(new Set(outs).size).toBe(outs.length);
  });

  it('keep distinct colours distinct (nothing turns to mud)', () => {
    const a = shade([0xbc, 0x80, 0x50], 'auto', 'night', 0);
    const b = shade([0x6c, 0x47, 0x34], 'auto', 'night', 0);
    expect(luma(a) - luma(b)).toBeGreaterThan(0.04);
  });

  it('are brighter in each step of a light, and the brightest step is the warmed day colour', () => {
    const lum = ([0, 1, 2, 3] as const).map((l) => luma(shade(cloth, 'auto', 'night', l)));
    expect(lum[1]).toBeGreaterThan(lum[0] ?? 0);
    expect(lum[2]).toBeGreaterThan(lum[1] ?? 0);
    expect(lum[3]).toBeGreaterThan(lum[2] ?? 0);
    expect(LEVEL_WEIGHT[3]).toBe(1);
    const lit = shade(cloth, 'auto', 'night', 3);
    expect(lit[0]).toBeGreaterThanOrEqual(cloth[0]);
    expect(lit[2]).toBeLessThan(cloth[2]);
  });

  it('only dapple a wall or floor with warm under a light (a pool, never the flood of day)', () => {
    const wall: Rgb = [0x7b, 0x70, 0xaf];
    const lum = ([0, 1, 2, 3] as const).map((l) => luma(shade(wall, 'wall', 'night', l)));
    for (let i = 1; i < 4; i++) expect(lum[i]).toBeGreaterThan(lum[i - 1] ?? 0);
    expect(lum[3] ?? 1).toBeLessThan(luma(wall) - 0.1);
    const [r0, , b0] = shade(wall, 'wall', 'night', 0);
    const [r3, , b3] = shade(wall, 'wall', 'night', 3);
    expect(r3 / b3).toBeGreaterThan(r0 / b0);
  });

  it('leave the sky and the moon as drawn, and lay a warm halo on the sky near a light', () => {
    const sky: Rgb = [0x2e, 0x28, 0x62];
    expect(shade(sky, 'fixed', 'night', 0)).toEqual([0x2e, 0x28, 0x62]);
    const halo = shade(sky, 'fixed', 'night', 3);
    expect(halo[0]).toBeGreaterThan(sky[0]);
  });

  it('sort colours into tones', () => {
    expect(toneOf([0x0d, 0x0a, 0x1a])).toBe('ink');
    expect(toneOf([0xff, 0xd2, 0x5a])).toBe('flame');
    expect(toneOf([0x8c, 0xc6, 0xf2])).toBe('glass');
    expect(toneOf([0x47, 0x88, 0x57])).toBe('foliage');
    expect(toneOf([0x91, 0x5d, 0x42])).toBe('wood');
    expect(toneOf([0x8c, 0x86, 0x78])).toBe('metal');
    expect(toneOf([0xc3, 0x65, 0x5f])).toBe('cloth');
  });

  it('keep a candle bright in the dark: a flame never goes below its glow', () => {
    const flame: Rgb = [0xff, 0xd2, 0x5a];
    const lit = shade(flame, 'light', 'night', 0);
    const plain = shade(flame, 'auto', 'night', 0);
    expect(luma(lit)).toBeGreaterThan(luma(plain));
  });

  it('tint a sprite like its pixels: the day sprite is returned as it is', () => {
    const sprite: SpriteDef = { rows: ['ab'], palette: { a: '#c3655f', b: '#0d0a1a' } };
    expect(tintSprite(sprite, 'creature', 'day', 0)).toBe(sprite);
    const night = tintSprite(sprite, 'creature', 'night', 0);
    expect(night.palette['a']).not.toBe('#c3655f');
    expect(night.palette['b']).toBe('#0d0a1a');
    expect(night.rows).toBe(sprite.rows);
  });
});

describe('the light shapes', () => {
  const clip = { x: 0, y: 0, w: 112, h: 60 };
  const light: SceneLight = { kind: 'lamp', x: 56, y: 20, clip };

  it('are stepped: the middle is the brightest step and the edge the dimmest, nothing outside', () => {
    const map = levelMap([light], 112, 64);
    expect(map[20 * 112 + 56]).toBe(3);
    const seen = new Set(map);
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
    const { rx } = LIGHT_SHAPE.lamp;
    expect(map[20 * 112 + (56 + rx + 2)] ?? 0).toBe(0);
    // along a row, the level never rises while moving away from the centre (a dithered edge may swap, never skip two steps)
    for (let x = 56; x < 56 + rx - 1; x++) {
      expect(Math.abs((map[20 * 112 + x] ?? 0) - (map[20 * 112 + x + 1] ?? 0))).toBeLessThanOrEqual(
        1,
      );
    }
  });

  it('stay inside their clip box (a room never lights its neighbour)', () => {
    const boxed: SceneLight = { ...light, clip: { x: 40, y: 0, w: 30, h: 30 } };
    const map = levelMap([boxed], 112, 64);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 112; x++) {
        const lit = (map[y * 112 + x] ?? 0) > 0;
        const inBox = x >= 40 && x < 70 && y >= 0 && y < 30;
        if (!inBox) expect(lit, `${String(x)},${String(y)}`).toBe(false);
      }
    }
    expect(map.some((v) => v > 0)).toBe(true);
  });

  it('take the strongest of overlapping lights, and are the same every time', () => {
    const other: SceneLight = { kind: 'fire', x: 80, y: 30, clip };
    const both = levelMap([light, other], 112, 64);
    const a = levelMap([light], 112, 64);
    const b = levelMap([other], 112, 64);
    for (let i = 0; i < both.length; i++) expect(both[i]).toBe(Math.max(a[i] ?? 0, b[i] ?? 0));
    expect(levelMap([light, other], 112, 64)).toEqual(both);
    expect(STEPS[0]).toBeLessThan(STEPS[1]);
  });

  it('light the pixels under them back towards day, and nothing else, in the picture', () => {
    const sprite: SpriteDef = { rows: ['cc', 'cc'], palette: { c: '#c3655f' } };
    const placements: Placement[] = [
      { sprite, x: 10, y: 10 },
      { sprite, x: 50, y: 10 },
    ];
    const lit = rasterize(placements, 64, 24, {
      phase: 'night',
      lights: [{ kind: 'porch', x: 11, y: 11, clip: { x: 0, y: 0, w: 30, h: 24 } }],
    });
    const dim = rasterize(placements, 64, 24, NIGHT);
    const at = (a: Uint8ClampedArray, x: number, y: number): number => a[(y * 64 + x) * 4] ?? 0;
    expect(at(lit, 10, 10)).toBeGreaterThan(at(dim, 10, 10));
    expect(at(lit, 50, 10)).toBe(at(dim, 50, 10));
    expect(at(dim, 0, 0)).toBe(0);
    expect(lit[(10 * 64 + 10) * 4 + 3]).toBe(255);
  });
});

describe('the lights of a house come from data', () => {
  it('are decided by the art, the form or a glow, never by an id', () => {
    expect(lightKindOf({}, 'lamp')).toBe('lamp');
    expect(lightKindOf({}, 'hearth')).toBe('fire');
    expect(lightKindOf({}, 'bed')).toBeUndefined();
    expect(lightKindOf({}, undefined)).toBeUndefined();
    expect(lightKindOf({ glow: {} }, 'yard-bit')).toBe('lantern');
    expect(lightKindOf({ light: 'fire' }, 'bed')).toBe('fire');
    expect(lightKindOf({}, 'constructor')).toBeUndefined();
  });

  it('give every lamp and the lantern post a light, and no bed or table one', () => {
    const lamps = housing.pieces.filter((p) => p.form === 'lamp');
    expect(lamps.length).toBeGreaterThan(0);
    for (const p of lamps) expect(lightKindOf(pieceArt(p.id), p.form), p.id).toBe('lamp');
    const post = housing.pieces.find((p) => p.id === 'lantern-post');
    expect(post).toBeDefined();
    expect(lightKindOf(pieceArt('lantern-post'), post?.form)).toBe('lantern');
    for (const p of housing.pieces.filter((x) => ['bed', 'table', 'rug'].includes(x.form))) {
      expect(lightKindOf(pieceArt(p.id), p.form), p.id).toBeUndefined();
    }
  });

  it('are found in a placed house: the lamp, the hearth room, the porch, the lantern post', () => {
    const hut = composeHouse(sceneHouse({ parts: HUT }), { phase: 'night' });
    const kinds = hut.lighting.lights.map((l) => l.kind);
    expect(kinds).toContain('lamp');
    expect(kinds).toContain('porch');
    const mansion = composeHouse(sceneHouse({ parts: MANSION, housemates: 3 }), { phase: 'night' });
    expect(mansion.lighting.lights.map((l) => l.kind)).toContain('lantern');
    expect(mansion.lighting.lights.length).toBeGreaterThan(hut.lighting.lights.length);
    for (const l of mansion.lighting.lights) {
      expect(l.x).toBeGreaterThanOrEqual(l.clip.x);
      expect(l.x).toBeLessThan(l.clip.x + l.clip.w);
      expect(l.y).toBeGreaterThanOrEqual(l.clip.y);
      expect(l.y).toBeLessThan(l.clip.y + l.clip.h);
      expect(l.clip.x + l.clip.w).toBeLessThanOrEqual(mansion.width);
    }
  });

  it('are not in the day', () => {
    expect(composeHouse(sceneHouse({ parts: MANSION }), { phase: 'day' }).lighting.lights).toEqual(
      [],
    );
  });

  it('are in one room alone, clipped to the room', () => {
    const house = sceneHouse({ parts: HUT });
    const room = composeRoom(house, 'hut:hearth', { phase: 'night' });
    expect(room?.lighting.lights.map((l) => l.kind)).toEqual(['lamp']);
    const clip = room?.lighting.lights[0]?.clip;
    expect(clip?.x).toBeGreaterThanOrEqual(0);
    expect((clip?.x ?? 0) + (clip?.w ?? 0)).toBeLessThanOrEqual(room?.width ?? 0);
  });
});

describe('the sky and the windows', () => {
  it('is the valley night with its moon at night, a dusk at twilight and the old sky by day', () => {
    const house = sceneHouse({ parts: HUT });
    const day = composeHouse(house).back[0];
    const night = composeHouse(house, { phase: 'night' });
    const dusk = composeHouse(house, { phase: 'twilight' });
    expect(night.back.some((p) => p.sprite === skyForPhase('night'))).toBe(true);
    expect(dusk.back.some((p) => p.sprite === skyForPhase('twilight'))).toBe(true);
    expect(night.back.filter((p) => p.sprite.rows.length === 10).length).toBe(1); // the moon
    expect(dusk.back.filter((p) => p.sprite.rows.length === 10).length).toBe(0);
    expect(day?.mat).toBe('fixed');
    expect(skyForPhase('night')).not.toBe(skyForPhase('twilight'));
  });

  it('shows stars in a window at night, by a fixed rule, and none by day or at twilight', () => {
    const house = sceneHouse({ parts: HUT });
    const night = composeHouse(house, { phase: 'night' });
    const windows = [...night.back, ...night.front].filter((p) => p.mat === 'window');
    expect(windows.length).toBeGreaterThan(0);
    const stars = (phase: 'night' | 'twilight'): number => {
      const m = composeHouse(house, { phase });
      const all = [...m.back, ...m.front].filter((p) => p.mat === 'window');
      const px = rasterize(all, m.width, m.height, { phase, lights: [] });
      let n = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i] === 0xe9 && px[i + 1] === 0xed && px[i + 2] === 0xff) n++;
      }
      return n;
    };
    expect(stars('night')).toBeGreaterThan(0);
    expect(stars('twilight')).toBe(0);
    expect(pixelHash(3, 4)).toBe(pixelHash(3, 4));
  });
});

describe('a house at night', () => {
  it('keeps every sleeper readable: creatures stay brighter than the wall behind them', () => {
    const house = sceneHouse({ parts: THREE_FLOORS, housemates: 3 });
    const model = composeHouse(house, { phase: 'night' });
    const all = [...model.back, ...model.front];
    const px = rasterize(all, model.width, model.height, model.lighting);
    for (const c of model.creatures) {
      let best = 0;
      for (let y = c.y; y < c.y + 16; y++) {
        for (let x = c.x; x < c.x + 16; x++) {
          const at = (y * model.width + x) * 4;
          best = Math.max(best, luma([px[at] ?? 0, px[at + 1] ?? 0, px[at + 2] ?? 0]));
        }
      }
      expect(best, `${c.roomId}`).toBeGreaterThan(0.3);
    }
  });

  it('is clearly different from twilight and from day', () => {
    const house = sceneHouse({ parts: THREE_FLOORS, housemates: 3 });
    const mean = (phase: 'day' | 'twilight' | 'night'): number => {
      const m = composeHouse(house, { phase });
      const px = rasterize([...m.back, ...m.front], m.width, m.height, m.lighting);
      let sum = 0;
      let n = 0;
      for (let i = 0; i < px.length; i += 4) {
        if ((px[i + 3] ?? 0) === 0) continue;
        sum += luma([px[i] ?? 0, px[i + 1] ?? 0, px[i + 2] ?? 0]);
        n++;
      }
      return sum / n;
    };
    const d = mean('day');
    const t = mean('twilight');
    const n = mean('night');
    expect(d - t).toBeGreaterThan(0.08);
    expect(t - n).toBeGreaterThan(0.05);
  });
});

describe("a light in a piece's art", () => {
  const flame: SpriteDef = {
    rows: ['....', '.ff.', '.ff.', 'kkkk'],
    palette: { f: '#ffcf6a', k: '#0d0a1a' },
  };
  const size = { width: 4, height: 4 };

  it('is a bare kind or a spec with where it burns and how wide its pool is', () => {
    expect(lightOf({ light: 'fire' }, 'bed')).toEqual({ kind: 'fire' });
    const spec = { kind: 'lamp', at: { x: 3, y: 2 }, size: 0.5 } as const;
    expect(lightOf({ light: spec }, 'bed')).toEqual(spec);
    expect(lightOf({}, 'lamp')).toEqual({ kind: 'lamp' });
    expect(lightOf({ glow: {} }, 'yard-bit')).toEqual({ kind: 'lantern' });
    expect(lightOf({}, 'bed')).toBeUndefined();
  });

  it('burns where the art says, else in the middle of its flame-coloured pixels, else by kind', () => {
    expect(flameCentre(flame)).toEqual({ x: 2, y: 2 });
    expect(lightCentre({ kind: 'lamp', at: { x: 0, y: 1 } }, flame, size)).toEqual({ x: 0, y: 1 });
    expect(lightCentre({ kind: 'lamp' }, flame, size)).toEqual({ x: 2, y: 2 });
    const plain: SpriteDef = { rows: ['kk', 'kk'], palette: { k: '#0d0a1a' } };
    expect(flameCentre(plain)).toBeNull();
    expect(lightCentre({ kind: 'lamp' }, plain, { width: 20, height: 10 })).toEqual({
      x: 10,
      y: 8,
    });
  });

  it('makes a smaller pool with a smaller size', () => {
    const clip = { x: 0, y: 0, w: 112, h: 64 };
    const count = (scale?: number): number =>
      levelMap(
        [{ kind: 'lamp', x: 56, y: 32, clip, ...(scale === undefined ? {} : { size: scale }) }],
        112,
        64,
      ).filter((v) => v > 0).length;
    expect(count(0.5)).toBeLessThan(count());
    expect(count(0.5)).toBeGreaterThan(0);
  });

  it('flags the shelves that hold lanterns, the tank and the post, with the centre inside the piece', () => {
    const flagged = housing.pieces
      .filter((p) => lightOf(pieceArt(p.id), p.form) !== undefined)
      .map((p) => p.id);
    for (const id of ['lantern-post', 'reef-tank', 'emberhold-shelf', 'lantern-night-shelf'])
      expect(flagged, id).toContain(id);
    for (const id of flagged) {
      const piece = housing.pieces.find((p) => p.id === id);
      const art = pieceArt(id);
      const spec = lightOf(art, piece?.form) ?? { kind: 'lamp' as const };
      const rows = expandRows(art.sprite);
      const at = lightCentre(spec, art.sprite, {
        width: rows[0]?.length ?? 0,
        height: rows.length,
      });
      expect(at.x, id).toBeGreaterThanOrEqual(0);
      expect(at.x, id).toBeLessThan(rows[0]?.length ?? 0);
      expect(at.y, id).toBeGreaterThanOrEqual(0);
      expect(at.y, id).toBeLessThan(rows.length);
    }
  });
});

function rgbOf(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

describe('the dusk sky', () => {
  const strip = skyForPhase('night');
  const dusk = skyForPhase('twilight');

  it("keeps the strip's size and its hills, and is a gradient from violet to amber", () => {
    expect(dusk.rows).toHaveLength(strip.rows.length);
    expect(dusk.rows[0]).toHaveLength(strip.rows[0]?.length ?? 0);
    expect(dusk.palette[dusk.rows[0]?.[0] ?? '']).toBe('#3b2f6e');
    for (const [y, row] of strip.rows.entries())
      for (const [x, c] of [...row].entries())
        if ('hmijng'.includes(c)) expect(dusk.rows[y]?.[x]).toBe(c);
    const mean = (y: number): number => {
      const row = dusk.rows[y] ?? '';
      let sum = 0;
      for (const c of row) sum += luma(rgbOf(dusk.palette[c] ?? '#000000'));
      return sum / row.length;
    };
    expect(mean(20)).toBeGreaterThan(mean(2));
  });

  it('melts each step into the next with a dither, and names every colour it uses', () => {
    for (const k of new Set(dusk.rows.flatMap((r) => [...r])))
      expect(dusk.palette[k], k).toBeDefined();
    // somewhere two neighbouring ramp keys alternate in a row
    expect(dusk.rows.some((r) => /(\d)(\d)\1\2\1/.test(r))).toBe(true);
    expect(duskSky(strip)).toEqual(dusk);
  });
});

describe('pieces outdoors', () => {
  const scarecrow: Rgb = [0xd2, 0x3a, 0x3a];
  const leaf: Rgb = [0x6c, 0xb0, 0x4c];
  const wood: Rgb = [0xa8, 0x70, 0x40];

  it('take the night of the scene: darker and cooler than the same colour indoors, still readable, ink kept', () => {
    for (const phase of ['twilight', 'night'] as const) {
      for (const c of [scarecrow, leaf, wood]) {
        const indoor = shade(c, 'auto', phase, 0);
        const out = shade(c, 'outdoor', phase, 0);
        expect(luma(out)).toBeLessThan(luma(indoor) * 0.9);
        expect(luma(out)).toBeGreaterThan(luma(c) * 0.25);
        // cooler: blue gains on red against the indoor night
        expect(out[2] / Math.max(1, out[0])).toBeGreaterThan(indoor[2] / Math.max(1, indoor[0]));
      }
      expect(shade([0x0d, 0x0a, 0x1a], 'outdoor', phase, 0)).toEqual([0x0d, 0x0a, 0x1a]);
    }
    // a lantern post near them lifts them like any piece
    expect(luma(shade(wood, 'outdoor', 'night', 3))).toBeGreaterThan(
      luma(shade(wood, 'outdoor', 'night', 0)),
    );
  });

  it('are the day colour by day', () => {
    expect(shade(scarecrow, 'outdoor', 'day', 0)).toEqual([...scarecrow]);
  });

  it('are tagged outdoor in the scene (yard, water, terrace, balcony), except lights', () => {
    const model = composeHouse(sceneHouse({ parts: MANSION }), { phase: 'night' });
    const outdoor = new Set(model.rooms.filter((r) => r.outdoor).map((r) => r.roomId));
    const pieces = model.spots.filter((s) => s.pieceId !== null);
    const spritesOf = (spots: typeof pieces) =>
      new Set(spots.map((s) => pieceArt(s.pieceId ?? '', housing).sprite));
    const outside = spritesOf(pieces.filter((s) => outdoor.has(s.roomId)));
    const inside = spritesOf(pieces.filter((s) => !outdoor.has(s.roomId)));
    expect(outside.size).toBeGreaterThan(0);
    const all = [...model.back, ...model.front];
    const tags = new Set(all.filter((p) => outside.has(p.sprite)).map((p) => p.mat));
    expect(tags.has('outdoor')).toBe(true);
    expect([...tags].every((m) => m === 'outdoor' || m === 'light')).toBe(true);
    expect(all.some((p) => inside.has(p.sprite) && p.mat === 'outdoor')).toBe(false);
  });
});
