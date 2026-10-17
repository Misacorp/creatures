import { describe, expect, it } from 'vitest';
import { ROOM_SPRITE_DATA } from './data/room-sprites';
import { CALENDAR_SIZE, SKY_GLYPHS, SKY_PICTURES, calendarSprite } from './data/weather-sprites';
import {
  CALENDAR_SPOT,
  ROOM_BAND_HEIGHT,
  ROOM_SIZE,
  ROOM_SPOTS,
  SPOT_SIZE,
  roomScene,
  type RoomPhase,
} from './room-art';
import { parseSprite, spriteSize, validateSprite } from './sprite-data';

describe('the wall calendar pictures', () => {
  it('are well-formed sprites of the calendar size', () => {
    for (const picture of SKY_PICTURES) {
      const sprite = calendarSprite(picture);
      expect(() => {
        validateSprite(sprite, CALENDAR_SIZE);
      }, picture).not.toThrow();
    }
    expect(CALENDAR_SPOT.width).toBe(CALENDAR_SIZE.width);
    expect(CALENDAR_SPOT.height).toBe(CALENDAR_SIZE.height);
  });

  it('are four different pictures, and a blank page has no weather on it', () => {
    expect(SKY_PICTURES).toEqual(['blank', 'sun', 'cloud', 'storm']);
    const drawn = SKY_PICTURES.map((p) => JSON.stringify(calendarSprite(p).rows));
    expect(new Set(drawn).size).toBe(SKY_PICTURES.length);
    const blank = parseSprite(calendarSprite('blank')).cells;
    const sun = parseSprite(calendarSprite('sun')).cells;
    expect(sun.length).toBeGreaterThan(blank.length);
  });

  it('do not rely on colour alone: the sun, the cloud and the storm have their own shapes', () => {
    const shapes = (['sun', 'cloud', 'storm'] as const).map((p) =>
      JSON.stringify(parseSprite(calendarSprite(p)).cells.map((c) => [c.x, c.y])),
    );
    expect(new Set(shapes).size).toBe(3);
  });
});

describe('the small sky icons', () => {
  it('are well-formed 8x8 sprites with their own shapes', () => {
    const names = Object.keys(SKY_GLYPHS) as (keyof typeof SKY_GLYPHS)[];
    expect(names.sort()).toEqual(['cloud', 'storm', 'sun']);
    const shapes = new Set<string>();
    for (const name of names) {
      const sprite = SKY_GLYPHS[name];
      expect(() => {
        validateSprite(sprite, { width: 8, height: 8 });
      }, name).not.toThrow();
      shapes.add(JSON.stringify(sprite.rows));
    }
    expect(shapes.size).toBe(3);
  });
});

describe('where the calendar hangs', () => {
  const left = CALENDAR_SPOT.x;
  const top = CALENDAR_SPOT.y;
  const right = left + CALENDAR_SPOT.width;
  const bottom = top + CALENDAR_SPOT.height;

  it('is inside the room, below the title band', () => {
    expect(left).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(ROOM_SIZE.width);
    expect(top).toBeGreaterThanOrEqual(ROOM_BAND_HEIGHT);
    expect(bottom).toBeLessThanOrEqual(ROOM_SIZE.height);
  });

  it('covers no spot where a creature sits', () => {
    for (const spot of ROOM_SPOTS) {
      const apart =
        right <= spot.x ||
        left >= spot.x + SPOT_SIZE.width ||
        bottom <= spot.y ||
        top >= spot.y + SPOT_SIZE.height;
      expect(apart, spot.id).toBe(true);
    }
  });

  it.each(['day', 'twilight', 'night'] as RoomPhase[])(
    'covers no furniture in the %s room (light and the wall tiles may lie behind it)',
    (phase) => {
      const light = new Set(
        (['lampGlow', 'fireGlow', 'tableLampGlow', 'daylight'] as const).flatMap((name) =>
          Object.values(ROOM_SPRITE_DATA[name]),
        ),
      );
      const edge = new Set(Object.values(ROOM_SPRITE_DATA.edge));
      for (const prop of roomScene(phase).props) {
        if (light.has(prop.sprite) || edge.has(prop.sprite)) continue;
        const size = spriteSize(prop.sprite);
        const apart =
          right <= prop.x ||
          left >= prop.x + size.width ||
          bottom <= prop.y ||
          top >= prop.y + size.height;
        if (apart) continue;
        // The boxes overlap: no pixel of the prop may lie inside the calendar's box.
        const hit = parseSprite(prop.sprite).cells.some((c) => {
          const x = prop.x + c.x;
          const y = prop.y + c.y;
          return x >= left && x < right && y >= top && y < bottom;
        });
        expect(hit, `a prop at ${String(prop.x)},${String(prop.y)}`).toBe(false);
      }
    },
  );
});
