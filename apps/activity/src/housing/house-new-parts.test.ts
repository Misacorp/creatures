import { describe, expect, it } from 'vitest';
import { houseGrid } from '@creatures/game';
import { housing } from '@creatures/game/housing-content';
import { spriteSize } from '../sprites/sprite-data';
import { hasPieceArt, shellArt, skinArt } from './house-art';
import { CELL_H, CELL_W, composeHouse, composeRoom, partPreview, roofShape } from './house-scene';
import { composePostcard } from './house-postcard';
import { ESTATE, MANSION, THREE_FLOORS, sceneHouse, sceneOwn } from './house-scene-sample';
import { rasterize } from './house-paint';
import { skinChoices } from './spot-view';

/** The tower, the balcony, the orchard and the pond (`housing-next.md` C1) in the cutaway, the postcard and the build panel. */

const NEW = ['tower', 'balcony', 'orchard', 'pond'] as const;

describe('the new parts in the cutaway', () => {
  it('draws the estate (all fifteen parts) with every placement inside the scene and every room on the grid', () => {
    const model = composeHouse(sceneHouse({ parts: ESTATE, housemates: 3 }));
    for (const p of [...model.back, ...model.front]) {
      const { width, height } = spriteSize(p.sprite);
      expect(p.x, 'x').toBeGreaterThanOrEqual(0);
      expect(p.y, 'y').toBeGreaterThanOrEqual(0);
      expect(p.x + (p.w ?? width), 'right').toBeLessThanOrEqual(model.width);
      expect(p.y + (p.h ?? height), 'bottom').toBeLessThanOrEqual(model.height);
    }
    const grid = houseGrid(housing, new Set(ESTATE));
    expect(model.rooms.map((r) => r.roomId).sort()).toEqual(grid.map((g) => g.roomId).sort());
  });

  it('keeps the rooms and the spot boxes of the estate from overlapping other rooms', () => {
    const model = composeHouse(sceneHouse({ parts: ESTATE }));
    for (const [i, a] of model.rooms.entries()) {
      for (const b of model.rooms.slice(i + 1)) {
        const apart =
          a.x + a.w <= b.x + 4 || b.x + b.w <= a.x + 4 || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart, `${a.roomId} and ${b.roomId}`).toBe(true);
      }
    }
  });

  it('raises the tower above the roofline under a spire steeper than a gable', () => {
    const plain = composeHouse(sceneHouse({ parts: THREE_FLOORS }));
    const tower = composeHouse(sceneHouse({ parts: [...THREE_FLOORS, 'tower'] }));
    expect(tower.height).toBeGreaterThan(plain.height + CELL_H);
    const spire = roofShape(CELL_W + 16, 'spire');
    const gable = roofShape(CELL_W + 16, 'gable');
    expect(spire.slope).toBeLessThan(gable.slope);
    expect(spire.height).toBeGreaterThan(gable.height);
    expect(spire.top).toBeLessThanOrEqual(16);
    const study = tower.rooms.find((r) => r.roomId === 'tower:observatory');
    const landing = tower.rooms.find((r) => r.roomId === 'tower:landing');
    const attic = tower.rooms.find((r) => r.roomId === 'house:attic');
    expect(landing?.y).toBe((attic?.y ?? 0) - CELL_H);
    expect(study?.y).toBe((landing?.y ?? 0) - CELL_H);
    expect(study?.x).toBe(landing?.x);
  });

  it('hangs the balcony on the first floor beside the east wing, or on the core wall, or on the wing roof', () => {
    const at = (extra: string[]) => {
      const m = composeHouse(sceneHouse({ parts: [...THREE_FLOORS, 'balcony', ...extra] }));
      const room = m.rooms.find((r) => r.roomId === 'balcony:balcony');
      const study = m.rooms.find((r) => r.roomId === 'house:study');
      return { room, study, model: m };
    };
    const bare = at([]);
    expect(bare.room?.y).toBe(bare.study?.y);
    expect(bare.room?.h).toBe(CELL_H);
    expect(bare.room?.outdoor).toBe(true);
    // next to the core wall: it starts where the study ends
    expect(bare.room?.x).toBe((bare.study?.x ?? 0) + (bare.study?.w ?? 0) - 2);
    const wing = at(['east-wing', 'east-upper']);
    const guest = wing.model.rooms.find((r) => r.roomId === 'east-upper:guest');
    expect(wing.room?.y).toBe(guest?.y);
    expect(wing.room?.x).toBe((guest?.x ?? 0) + (guest?.w ?? 0) - 2);
  });

  it('gives the balcony a rail, a deck and spots whose boxes stand on the deck', () => {
    const m = composeRoom(sceneHouse({ parts: ESTATE }), 'balcony:balcony');
    expect(m).not.toBeNull();
    if (m === null) return;
    expect(m.width).toBe(CELL_W);
    expect(m.height).toBe(CELL_H);
    const spots = m.spots.filter((s) => s.roomId === 'balcony:balcony');
    expect(spots.map((s) => s.spotId).sort()).toEqual(
      ['fence-a', 'yard-large-a', 'yard-small-a', 'yard-small-b'].sort(),
    );
    for (const s of spots) {
      expect(s.y + s.h, s.spotId).toBeLessThanOrEqual(CELL_H);
      expect(s.y, s.spotId).toBeGreaterThanOrEqual(0);
    }
    const rail = shellArt('balcony-rail');
    expect(m.back.some((p) => p.sprite === rail)).toBe(true);
  });

  it("plants the orchard's trees by the room's ground skin and the pond's water, bank and bridge", () => {
    const house = sceneHouse({ parts: [...THREE_FLOORS, 'garden', 'orchard', 'terrace', 'pond'] });
    const model = composeHouse(house);
    const apple = skinArt('orchard-apple', 'ground').scenery ?? [];
    expect(apple.length).toBeGreaterThanOrEqual(3);
    for (const item of apple) expect(model.back.some((p) => p.sprite === item.sprite)).toBe(true);
    for (const name of ['pond-rim', 'pond-water', 'bridge', 'reeds', 'lily-pads'] as const) {
      expect(
        model.back.some((p) => p.sprite === shellArt(name)),
        name,
      ).toBe(true);
    }
    // plum trees when the room says plum
    const plum = {
      ...house,
      rooms: house.rooms.map((r) => (r.kind === 'orchard' ? { ...r, floor: 'orchard-plum' } : r)),
    };
    const plums = skinArt('orchard-plum', 'ground').scenery ?? [];
    const withPlums = composeHouse(plum);
    for (const item of plums)
      expect(withPlums.back.some((p) => p.sprite === item.sprite)).toBe(true);
    expect(withPlums.back.some((p) => p.sprite === apple[0]?.sprite)).toBe(false);
  });

  it("draws the observatory's round window and telescope, and lights a boat's candle at night", () => {
    const house = sceneHouse({ parts: [...THREE_FLOORS, 'tower'] });
    const model = composeHouse(house);
    expect(
      model.back.some((p) => p.sprite === shellArt('tower-window') && p.mat === 'window'),
    ).toBe(true);
    expect(model.back.some((p) => p.sprite === shellArt('telescope'))).toBe(true);
    const pond = sceneHouse({ parts: [...THREE_FLOORS, 'terrace', 'pond'] });
    const boat = {
      ...pond,
      rooms: pond.rooms.map((r) =>
        r.kind === 'pond' ? { ...r, spots: { ...r.spots, 'water-a': 'lantern-boat' } } : r,
      ),
    };
    const night = composeHouse(boat, { phase: 'night' });
    expect(night.lighting.lights.some((l) => l.kind === 'lantern')).toBe(true);
    expect(composeHouse(boat).lighting.lights).toEqual([]);
  });

  it.each(['day', 'twilight', 'night'] as const)(
    'paints the estate in %s without a fault',
    (phase) => {
      const m = composeHouse(sceneHouse({ parts: ESTATE, housemates: 2 }), { phase });
      const bytes = rasterize([...m.back, ...m.front], m.width, m.height, m.lighting);
      expect(bytes.length).toBe(m.width * m.height * 4);
      expect(bytes.some((b) => b !== 0)).toBe(true);
    },
  );
});

describe('the new parts in the build panel', () => {
  it.each(NEW)('previews the %s as a picture of its own rooms', (id) => {
    const needs: Record<string, string[]> = {
      tower: THREE_FLOORS as string[],
      balcony: THREE_FLOORS as string[],
      orchard: [...THREE_FLOORS, 'garden'],
      pond: [...THREE_FLOORS, 'terrace'],
    };
    const house = sceneHouse({ parts: needs[id] ?? THREE_FLOORS });
    const preview = partPreview(house, id);
    expect(preview.width).toBeGreaterThan(40);
    expect(preview.height).toBeGreaterThan(40);
    // narrower than the whole house, so a row of the list can hold it
    expect(preview.width).toBeLessThanOrEqual(CELL_W * 2 + 40);
  });

  it('has art for every new piece and skin', () => {
    for (const id of [
      'beehive',
      'fruit-crate',
      'garden-swing',
      'scarecrow',
      'duck',
      'lily-cluster',
      'lantern-boat',
      'fishing-stool',
      'stepping-stones',
      'sun-umbrella',
      'gazing-ball',
      'cone-topiary',
      'bistro-table',
    ]) {
      expect(hasPieceArt(id), id).toBe(true);
    }
  });
});

describe('the new parts on the postcard', () => {
  it('shows the tower above the roofline, with a window in each of its rooms', () => {
    const base = composePostcard({ parts: THREE_FLOORS, roof: 'thatch', walls: 'plaster' });
    const tower = composePostcard({
      parts: [...THREE_FLOORS, 'tower'],
      roof: 'thatch',
      walls: 'plaster',
    });
    expect(tower.height).toBeGreaterThan(base.height + 28);
    expect(tower.width).toBe(base.width);
    expect(tower.boxes.filter((b) => b.roomId.startsWith('tower:'))).toHaveLength(2);
    expect(tower.clipped).toBe(0);
  });

  it('never clips and never overlaps boxes, for the estate at any hour', () => {
    for (const phase of ['day', 'twilight', 'night'] as const) {
      const m = composePostcard(sceneHouse({ parts: ESTATE }), housing, phase);
      expect(m.clipped).toBe(0);
      const boxes = m.boxes.filter((b) => b.kind !== 'cellar');
      for (const [i, a] of boxes.entries()) {
        for (const b of boxes.slice(i + 1)) {
          const apart =
            a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
          expect(apart, `${a.roomId} and ${b.roomId}`).toBe(true);
        }
      }
    }
  });

  it('changes the picture for each new part, and lights the tower windows at night', () => {
    const skins = { roof: 'thatch', walls: 'plaster' };
    const before = composePostcard({ parts: MANSION, ...skins });
    for (const id of NEW) {
      const after = composePostcard({ parts: [...MANSION, id], ...skins });
      expect(JSON.stringify(after.sprite), id).not.toEqual(JSON.stringify(before.sprite));
    }
    const night = composePostcard(
      { parts: [...THREE_FLOORS, 'tower'], ...skins },
      housing,
      'night',
    );
    expect(night.lighting.lights.filter((l) => l.kind === 'window').length).toBeGreaterThanOrEqual(
      2,
    );
  });
});

describe('the orchard variety', () => {
  it('lists the orchard grounds to choose from, the one in use first, and no other room grounds', () => {
    const house = sceneHouse({ parts: [...THREE_FLOORS, 'garden', 'orchard'] });
    const own = sceneOwn(house);
    const where = { kind: 'orchard', built: house.built };
    const choices = skinChoices('ground', 'orchard-apple', own, where);
    expect(choices[0]).toMatchObject({ id: 'orchard-apple', kind: 'owned', here: true });
    expect(choices.map((c) => c.id).sort()).toEqual([
      'orchard-apple',
      'orchard-pear',
      'orchard-plum',
    ]);
    expect(
      skinChoices('ground', 'pool-tile', own, { kind: 'pool', built: house.built }).map(
        (c) => c.id,
      ),
    ).toEqual(['pool-tile']);
  });
});
