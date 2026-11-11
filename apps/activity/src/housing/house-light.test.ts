import { describe, expect, it } from 'vitest';
import { housing } from '@creatures/game/housing-content';
import { expandRows, type SpriteDef } from '../sprites/sprite-data';
import { pieceArt } from './house-art';
import {
  DAY_LIGHTING,
  LEVEL_WEIGHT,
  LIGHT_SHAPE,
  STEPS,
  levelMap,
  lightKindOf,
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
  it.each([
    ['a hut', HUT],
    ['three floors', THREE_FLOORS],
  ])('%s is painted pixel for pixel as the sprites are drawn', (_name, parts) => {
    const house = sceneHouse({ parts, housemates: 2 });
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
    const lum = ([0, 1, 2, 3] as const).map((l) => luma(shade(cloth, 'wall', 'night', l)));
    expect(lum[1]).toBeGreaterThan(lum[0] ?? 0);
    expect(lum[2]).toBeGreaterThan(lum[1] ?? 0);
    expect(lum[3]).toBeGreaterThan(lum[2] ?? 0);
    expect(LEVEL_WEIGHT[3]).toBe(1);
    const lit = shade(cloth, 'wall', 'night', 3);
    expect(lit[0]).toBeGreaterThanOrEqual(cloth[0]);
    expect(lit[2]).toBeLessThan(cloth[2]);
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
