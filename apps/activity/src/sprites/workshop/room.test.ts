import { describe, expect, it } from 'vitest';
import { housing } from '@creatures/game/housing-content';
import type { SpotDef } from '@creatures/game';
import { fitScale } from '../../housing/house-icon';
import {
  CELL_H,
  CELL_W,
  FEET,
  FLOOR_H,
  RUG_FEET,
  SLAB_H,
  WALL_H,
  WALL_T,
  spotBox,
} from '../../housing/house-scene';
import { FOCUS_BLEED, focusScale } from '../../housing/RoomFocus';
import type { SpriteDef } from '../sprite-data';
import { generatePiece } from './pack';
import {
  ROOM_GEOMETRY,
  SHOW_ROOM,
  SPOT_HEIGHT,
  catalogueScale,
  phoneRoomScale,
  setRoom,
  type RoomLayout,
} from './room';
import { PLAIN_PINE } from './sample/plain-pine';
import { SET_FORMS, type FormId } from './style';

const tile = (w: number, h: number): SpriteDef => ({
  rows: Array.from({ length: h }, () => 'a'.repeat(w)),
  palette: { a: '#888888' },
});

function layout(): RoomLayout {
  const kind = housing.rooms.find((r) => r.id === SHOW_ROOM);
  if (kind === undefined) throw new Error(SHOW_ROOM);
  return { id: kind.id, cells: kind.cells.w, spots: kind.spots };
}

describe('the room sheet', () => {
  it("uses the house scene's geometry and spot boxes", () => {
    expect(ROOM_GEOMETRY).toEqual({
      cellW: CELL_W,
      cellH: CELL_H,
      wallH: WALL_H,
      floorH: FLOOR_H,
      slabH: SLAB_H,
      wallT: WALL_T,
      feet: FEET,
      rugFeet: RUG_FEET,
    });
    for (const [type, h] of Object.entries(SPOT_HEIGHT)) {
      const spot = { id: 'x', type, x: 0, w: 10, y: 4 } as SpotDef;
      expect(spotBox(spot, false, 0, CELL_H).h, type).toBe(h);
    }
  });

  it('furnishes a one-cell room kind that has a spot for every form', () => {
    const l = layout();
    expect(l.cells).toBe(1);
    const types = new Set(l.spots.map((s) => s.type));
    for (const type of Object.keys(SPOT_HEIGHT)) expect(types.has(type), type).toBe(true);
  });

  it('places every form once or more, where the house scene puts it', () => {
    const pieces = Object.fromEntries(
      SET_FORMS.map((f) => [f, generatePiece(f, PLAIN_PINE)]),
    ) as Record<FormId, ReturnType<typeof generatePiece>>;
    const model = setRoom({
      layout: layout(),
      pieces,
      wall: tile(16, 52),
      floor: tile(16, 8),
      slab: tile(16, 4),
      walls: tile(16, 16),
      creature: tile(16, 16),
    });
    expect(model.width).toBe(3 * CELL_W + WALL_T);
    for (const form of SET_FORMS)
      expect(
        model.pieces.some((p) => p.form === form),
        form,
      ).toBe(true);
    for (const p of model.pieces) {
      const spot = layout().spots.find((s) => s.id === p.spot);
      expect(spot, p.spot).toBeDefined();
      if (spot === undefined) continue;
      const box = spotBox(spot as SpotDef, false, 0, CELL_H);
      if (spot.type === 'rug' || spot.type.startsWith('floor'))
        expect(p.y + p.h, `${p.form} stands on its spot`).toBe(box.y + box.h);
      else expect(p.y, `${p.form} hangs at its spot`).toBe(box.y);
      expect(p.on).toBe(spot.type === 'rug' ? 'floor' : 'wall');
    }
    // two housemates: one asleep in the bed, one by the cupboard
    expect(
      model.placements.filter((p) => p.sprite.rows.length === 16).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('draws the room at the scale a 390 px phone focuses it, and the tiles as the catalogue does', () => {
    const roomW = CELL_W + WALL_T;
    expect(phoneRoomScale(roomW)).toBe(3);
    expect(phoneRoomScale(roomW)).toBe(focusScale(390 - 24 + FOCUS_BLEED, roomW));
    for (const form of SET_FORMS) {
      const sprite = generatePiece(form, PLAIN_PINE).sprite;
      expect(catalogueScale(sprite), form).toBe(fitScale(sprite, 40, 3));
    }
  });
});
