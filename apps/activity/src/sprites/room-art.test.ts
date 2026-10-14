import { describe, expect, it } from 'vitest';
import {
  EDGE_TILE,
  EDGE_TILE_WIDTH,
  NOTE_ON_CUSHION,
  ROOM_BAND_HEIGHT,
  ROOM_PROPS,
  ROOM_SIZE,
  ROOM_SPOTS,
  SPOT_SIZE,
} from './room-art';
import { ROOM_SPRITE_DATA } from './data/room-sprites';
import { expandRows, spriteSize, validateSprite } from './sprite-data';

describe('the room props', () => {
  it('are all well-formed sprites of at most 64x64', () => {
    for (const [name, def] of Object.entries(ROOM_SPRITE_DATA)) {
      expect(() => {
        validateSprite(def);
      }, name).not.toThrow();
      const { width, height } = spriteSize(def);
      expect(width, name).toBeLessThanOrEqual(64);
      expect(height, name).toBeLessThanOrEqual(64);
    }
  });

  it('all lie inside the room', () => {
    expect(ROOM_SIZE).toEqual({ width: 288, height: 56 });
    for (const [i, p] of ROOM_PROPS.entries()) {
      const { width, height } = spriteSize(p.sprite);
      expect(p.x, `prop ${String(i)}`).toBeGreaterThanOrEqual(0);
      expect(p.y, `prop ${String(i)}`).toBeGreaterThanOrEqual(0);
      expect(p.x + width, `prop ${String(i)}`).toBeLessThanOrEqual(ROOM_SIZE.width);
      expect(p.y + height, `prop ${String(i)}`).toBeLessThanOrEqual(ROOM_SIZE.height);
    }
  });

  it('is a wall of edge tiles with every other prop below the title band', () => {
    const tiles = ROOM_PROPS.filter((p) => p.sprite === EDGE_TILE);
    expect(tiles.map((t) => t.x)).toEqual(
      Array.from({ length: ROOM_SIZE.width / EDGE_TILE_WIDTH }, (_, i) => i * EDGE_TILE_WIDTH),
    );
    for (const p of ROOM_PROPS) {
      if (p.sprite !== EDGE_TILE) expect(p.y).toBeGreaterThanOrEqual(ROOM_BAND_HEIGHT);
    }
  });

  it('uses both layers, with the couch and table split across them', () => {
    expect(ROOM_PROPS.some((p) => p.layer === 'back')).toBe(true);
    expect(ROOM_PROPS.some((p) => p.layer === 'front')).toBe(true);
    expect(ROOM_PROPS.filter((p) => p.layer === 'front').length).toBeGreaterThanOrEqual(3);
  });
});

describe('the edge tile', () => {
  it('is as tall as the room and 16 wide', () => {
    expect(spriteSize(EDGE_TILE)).toEqual({ width: EDGE_TILE_WIDTH, height: ROOM_SIZE.height });
    expect(EDGE_TILE_WIDTH).toBe(16);
  });

  it('keeps the title band plain: at most four colours in its top rows', () => {
    const band = expandRows(EDGE_TILE).slice(0, ROOM_BAND_HEIGHT).join('');
    expect(new Set(band).size).toBeLessThanOrEqual(5);
  });
});

describe('the cushion note', () => {
  it('is a 16x16 sprite', () => {
    expect(() => {
      validateSprite(NOTE_ON_CUSHION, SPOT_SIZE);
    }).not.toThrow();
  });
});

describe('the spots', () => {
  it('are 16 with unique ids', () => {
    expect(ROOM_SPOTS).toHaveLength(16);
    expect(new Set(ROOM_SPOTS.map((s) => s.id)).size).toBe(16);
  });

  it('lie inside the room, below the title band', () => {
    for (const s of ROOM_SPOTS) {
      expect(Number.isInteger(s.x) && Number.isInteger(s.y) && Number.isInteger(s.z), s.id).toBe(
        true,
      );
      expect(s.x, s.id).toBeGreaterThanOrEqual(0);
      expect(s.y, s.id).toBeGreaterThanOrEqual(ROOM_BAND_HEIGHT);
      expect(s.x + SPOT_SIZE.width, s.id).toBeLessThanOrEqual(ROOM_SIZE.width);
      expect(s.y + SPOT_SIZE.height, s.id).toBeLessThanOrEqual(ROOM_SIZE.height);
    }
  });

  it('are ordered back to front: a spot lower in the room never has a lower z', () => {
    const byY = [...ROOM_SPOTS].sort((a, b) => a.y - b.y);
    for (let i = 1; i < byY.length; i++) {
      expect(byY[i]?.z ?? 0).toBeGreaterThanOrEqual(byY[i - 1]?.z ?? 0);
    }
  });

  it('are spread across the five bays', () => {
    const bays = [0, 48, 112, 176, 232, 288];
    for (let b = 0; b < 5; b++) {
      const lo = bays[b] ?? 0;
      const hi = bays[b + 1] ?? 288;
      const inBay = ROOM_SPOTS.filter((s) => s.x + 8 >= lo && s.x + 8 < hi);
      expect(inBay.length, `bay ${String(b)}`).toBeGreaterThanOrEqual(3);
    }
  });
});
