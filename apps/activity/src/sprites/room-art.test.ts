import { RULES } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  EDGE_TILE_WIDTH,
  ROOM_BAND_HEIGHT,
  ROOM_SIZE,
  ROOM_SPOTS,
  SPOT_SIZE,
  roomScene,
  type RoomPhase,
} from './room-art';
import { ROOM_SPRITE_DATA } from './data/room-sprites';
import { expandRows, spriteSize, validateSprite } from './sprite-data';

const PHASES: readonly RoomPhase[] = ['day', 'twilight', 'night'];

/** WCAG contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string): number => {
    const channel = (i: number): number => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

describe('the room props', () => {
  it('are all well-formed sprites of at most 64x64, in every light', () => {
    for (const [name, byPhase] of Object.entries(ROOM_SPRITE_DATA)) {
      expect(Object.keys(byPhase).length, name).toBeGreaterThan(0);
      for (const [phase, def] of Object.entries(byPhase)) {
        expect(() => {
          validateSprite(def);
        }, `${name} ${phase}`).not.toThrow();
        const { width, height } = spriteSize(def);
        expect(width, `${name} ${phase}`).toBeLessThanOrEqual(64);
        expect(height, `${name} ${phase}`).toBeLessThanOrEqual(64);
      }
    }
  });

  it('has the same size in every light for a prop that is drawn in several', () => {
    for (const [name, byPhase] of Object.entries(ROOM_SPRITE_DATA)) {
      const sizes = Object.values(byPhase).map((d) => JSON.stringify(spriteSize(d)));
      expect(new Set(sizes).size, name).toBe(1);
    }
  });
});

describe.each(PHASES)('the %s room', (phase) => {
  const scene = roomScene(phase);

  it('has props that all lie inside the room', () => {
    expect(ROOM_SIZE).toEqual({ width: 288, height: 56 });
    for (const [i, p] of scene.props.entries()) {
      const { width, height } = spriteSize(p.sprite);
      expect(p.x, `prop ${String(i)}`).toBeGreaterThanOrEqual(0);
      expect(p.y, `prop ${String(i)}`).toBeGreaterThanOrEqual(0);
      expect(p.x + width, `prop ${String(i)}`).toBeLessThanOrEqual(ROOM_SIZE.width);
      expect(p.y + height, `prop ${String(i)}`).toBeLessThanOrEqual(ROOM_SIZE.height);
    }
  });

  it('is a wall of edge tiles with every other prop below the title band', () => {
    const tiles = scene.props.filter((p) => p.sprite === scene.edgeTile);
    expect(tiles.map((t) => t.x)).toEqual(
      Array.from({ length: ROOM_SIZE.width / EDGE_TILE_WIDTH }, (_, i) => i * EDGE_TILE_WIDTH),
    );
    for (const p of scene.props) {
      if (p.sprite !== scene.edgeTile) expect(p.y).toBeGreaterThanOrEqual(ROOM_BAND_HEIGHT);
    }
  });

  it('uses both layers', () => {
    expect(scene.props.some((p) => p.layer === 'back')).toBe(true);
    expect(scene.props.filter((p) => p.layer === 'front').length).toBeGreaterThanOrEqual(3);
  });

  it('has an edge tile as tall as the room and 16 wide', () => {
    expect(spriteSize(scene.edgeTile)).toEqual({
      width: EDGE_TILE_WIDTH,
      height: ROOM_SIZE.height,
    });
    expect(EDGE_TILE_WIDTH).toBe(16);
  });

  it('keeps the title band calm and readable for light title text', () => {
    const def = scene.edgeTile;
    const keys = new Set(expandRows(def).slice(0, ROOM_BAND_HEIGHT).join(''));
    expect(keys.size).toBeLessThanOrEqual(6);
    const bone = '#f4eedc';
    const gold = '#ffd25a';
    for (const key of keys) {
      const colour = def.palette[key];
      expect(colour, key).toBeDefined();
      expect(contrast(colour ?? '#000000', bone), `${phase} ${key} vs bone`).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(contrast(colour ?? '#000000', gold), `${phase} ${key} vs gold`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it('has a 16x16 note on a cushion', () => {
    expect(() => {
      validateSprite(scene.note, SPOT_SIZE);
    }).not.toThrow();
  });
});

describe('the three lights', () => {
  const scenes = PHASES.map((p) => ({ phase: p, scene: roomScene(p) }));

  it('have the same furniture in the same places, apart from the glows', () => {
    const glows = (sprite: object): boolean =>
      ['lampGlow', 'fireGlow', 'tableLampGlow', 'daylight'].some((n) =>
        Object.values(ROOM_SPRITE_DATA[n as keyof typeof ROOM_SPRITE_DATA]).includes(
          sprite as never,
        ),
      );
    const layout = (s: ReturnType<typeof roomScene>): string[] =>
      s.props
        .filter((p) => !glows(p.sprite))
        .map(
          (p) => `${String(p.x)},${String(p.y)},${p.layer},${JSON.stringify(spriteSize(p.sprite))}`,
        );
    const [first, ...rest] = scenes;
    for (const other of rest) {
      expect(layout(other.scene), other.phase).toEqual(layout(first?.scene ?? other.scene));
    }
  });

  it('look different: the wall, the floor and the window differ between phases', () => {
    const wall = scenes.map((s) => JSON.stringify(s.scene.edgeTile.palette));
    expect(new Set(wall).size).toBe(3);
    const win = scenes.map((s) =>
      JSON.stringify(s.scene.props.find((p) => spriteSize(p.sprite).width === 36)),
    );
    expect(new Set(win).size).toBe(3);
  });

  it('have the lamps off by day and the daylight patch only by day and at twilight', () => {
    const names = (phase: RoomPhase): string[] =>
      (['lampGlow', 'fireGlow', 'tableLampGlow', 'daylight'] as const).filter(
        (n) => ROOM_SPRITE_DATA[n][phase] !== undefined,
      );
    expect(names('day')).toEqual(['daylight']);
    expect(names('twilight')).toEqual(['lampGlow', 'fireGlow', 'tableLampGlow', 'daylight']);
    expect(names('night')).toEqual(['lampGlow', 'fireGlow', 'tableLampGlow']);
  });

  it('keep the night room the same as the Moonlit Reef night: hours 20 to 6', () => {
    expect(RULES.expeditions.night).toEqual({ fromHour: 20, toHour: 6 });
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
