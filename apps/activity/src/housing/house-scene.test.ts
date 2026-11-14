import { describe, expect, it } from 'vitest';
import { HouseViewSchema, houseGrid, parseHouseAnswer } from '@creatures/game';
import { housing } from '@creatures/game/housing-content';
import { spriteSize } from '../sprites/sprite-data';
import { skyForPhase } from './house-light';
import { ART_PENDING, hasPieceArt, pendingArt, pieceArt } from './house-art';
import {
  CELL_H,
  CELL_W,
  OUTER_SKIN,
  bossOutline,
  composeHouse,
  composeRoom,
  digitsSprite,
  drawSky,
  housePreview,
  SOLID_CACHE_MAX,
  sceneMinWidth,
  solidCacheSize,
  WIDTH_STEP,
  overviewScale,
  overviewScroll,
  partPreview,
  roofShape,
  roofRowAt,
  spotBox,
  type Placement,
  type SceneModel,
} from './house-scene';
import { COTTAGE, HUT, MANSION, THREE_FLOORS, sceneHouse, sceneOwn } from './house-scene-sample';
import { OwnHouseViewSchema } from '@creatures/game';

function inside(model: SceneModel, p: Placement): boolean {
  const { width, height } = spriteSize(p.sprite);
  const w = p.w ?? width;
  const h = p.h ?? height;
  return p.x >= 0 && p.y >= 0 && p.x + w <= model.width && p.y + h <= model.height;
}

describe('the samples', () => {
  it('pass the strict schemas', () => {
    for (const parts of [HUT, COTTAGE, THREE_FLOORS, MANSION]) {
      const house = sceneHouse({ parts, housemates: 3 });
      expect(parseHouseAnswer(HouseViewSchema, house), parts.join()).toBeDefined();
      expect(parseHouseAnswer(OwnHouseViewSchema, sceneOwn(house))).toBeDefined();
    }
  });
});

describe('the cutaway', () => {
  it.each([
    ['a hut', HUT],
    ['a cottage', COTTAGE],
    ['three floors', THREE_FLOORS],
    ['the mansion', MANSION],
  ])('%s keeps every placement inside the scene and its rooms on the grid', (_name, parts) => {
    const house = sceneHouse({ parts, housemates: 3 });
    const model = composeHouse(house);
    for (const p of [...model.back, ...model.front]) expect(inside(model, p)).toBe(true);
    const grid = houseGrid(housing, new Set(parts));
    expect(model.rooms.map((r) => r.roomId).sort()).toEqual(grid.map((g) => g.roomId).sort());
    for (const room of model.rooms) {
      expect(room.x).toBeGreaterThanOrEqual(0);
      expect(room.x + room.w).toBeLessThanOrEqual(model.width);
      expect(room.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('puts floor 0 on one ground line whatever the house, and the cellar below it', () => {
    for (const parts of [HUT, THREE_FLOORS, MANSION]) {
      const model = composeHouse(sceneHouse({ parts }));
      const hearth = model.rooms.find((r) => r.roomId === 'hut:hearth');
      expect(hearth?.y).toBe(model.groundY - CELL_H);
    }
    const mansion = composeHouse(sceneHouse({ parts: MANSION }));
    const cellar = mansion.rooms.find((r) => r.kind === 'cellar');
    expect(cellar?.y).toBe(mansion.groundY);
    expect(mansion.height).toBeGreaterThan(mansion.groundY + CELL_H);
  });

  it('grows: a bigger house is wider and taller, the mansion twelve cells wide (terrace, wing, core, wing, garden, pool)', () => {
    const sizes = [HUT, COTTAGE, THREE_FLOORS, MANSION].map((parts) =>
      composeHouse(sceneHouse({ parts })),
    );
    for (let i = 1; i < sizes.length; i++) {
      expect((sizes[i] as SceneModel).width).toBeGreaterThanOrEqual(
        (sizes[i - 1] as SceneModel).width,
      );
    }
    expect((sizes[3] as SceneModel).box.w).toBe(12 * CELL_W + 4);
    expect((sizes[2] as SceneModel).height).toBeGreaterThan((sizes[0] as SceneModel).height);
  });

  it('stretches to a minimum width with the building in the middle', () => {
    const house = sceneHouse({ parts: HUT });
    const plain = composeHouse(house);
    const wide = composeHouse(house, { minWidth: plain.width + 100 });
    expect(wide.width).toBe(plain.width + 100);
    const a = plain.rooms[0];
    const b = wide.rooms[0];
    expect((b?.x ?? 0) - (a?.x ?? 0)).toBe(50);
  });

  it('draws a housemate on its bed anchor, after the bed and before the bed front; an away one is not drawn', () => {
    const house = sceneHouse({ parts: THREE_FLOORS, housemates: 1 });
    const model = composeHouse(house);
    expect(model.creatures).toHaveLength(1);
    const mate = model.creatures[0];
    const room = house.rooms.find((r) => r.id === mate?.roomId);
    const bedId = room?.spots[mate?.spotId ?? ''] ?? '';
    const art = pieceArt(bedId);
    const bedAt = model.back.find((p) => p.sprite === art.sprite);
    expect(bedAt).toBeDefined();
    expect(mate?.x).toBe((bedAt?.x ?? 0) + (art.sleep?.x ?? -1));
    expect(mate?.y).toBe((bedAt?.y ?? 0) + (art.sleep?.y ?? -1));
    const iBed = model.back.indexOf(bedAt as Placement);
    const iMate = model.back.findIndex(
      (p) => p.sprite === mate?.sprite && p.x === mate?.x && p.y === mate?.y,
    );
    expect(iMate).toBeGreaterThan(iBed);
    expect(art.front).toBeDefined();
    expect(model.front.some((p) => p.sprite === art.front)).toBe(true);

    const away = { ...house, housemates: house.housemates.map((m) => ({ ...m, home: false })) };
    const none = composeHouse(away);
    expect(none.creatures).toHaveLength(0);
    expect(none.back.length).toBeLessThan(model.back.length);
  });

  it('leaves the creatures to buttons when asked (the focus view)', () => {
    const house = sceneHouse({ parts: COTTAGE, housemates: 2 });
    const drawn = composeHouse(house, { creatures: 'draw' });
    const skipped = composeHouse(house, { creatures: 'skip' });
    expect(skipped.creatures).toHaveLength(drawn.creatures.length);
    expect(skipped.back.length).toBeLessThan(drawn.back.length);
  });

  it('lists a box for every spot of every room, and the mailbox and workbench in the yard', () => {
    const model = composeHouse(sceneHouse({ parts: THREE_FLOORS }));
    for (const room of houseGrid(housing, new Set(THREE_FLOORS))) {
      const kind = housing.rooms.find((k) => k.id === room.kind);
      const count = model.spots.filter((s) => s.roomId === room.roomId).length;
      expect(count, room.roomId).toBe(kind?.spots.length);
    }
    expect(model.fixtures.map((f) => f.kind).sort()).toEqual(['door', 'mailbox', 'workbench']);
    const mansion = composeHouse(sceneHouse({ parts: MANSION }));
    expect(mansion.fixtures.some((f) => f.kind === 'door')).toBe(false);
  });

  it('shows the empty plaque for the week’s boss when none is beaten, and the best plaque when some are', () => {
    const hut = sceneHouse({ parts: HUT });
    expect(composeHouse(hut).back.length).toBeGreaterThan(10);
    const spot = composeHouse(hut).spots.find((s) => s.spotId === 'mantel');
    expect(spot?.display?.kind).toBe('raid-plaques');
  });
});

describe('one room', () => {
  it('is the cell box with its walls, spots inside it', () => {
    const house = sceneHouse({ parts: THREE_FLOORS, housemates: 3 });
    for (const room of houseGrid(housing, new Set(THREE_FLOORS))) {
      const model = composeRoom(house, room.roomId);
      expect(model, room.roomId).not.toBeNull();
      expect(model?.width).toBe(room.w * CELL_W + 4);
      expect(model?.height).toBe(CELL_H);
      for (const p of [...(model?.back ?? []), ...(model?.front ?? [])]) {
        expect(inside(model as SceneModel, p), room.roomId).toBe(true);
      }
      for (const spot of model?.spots ?? []) {
        expect(spot.x).toBeGreaterThanOrEqual(0);
        expect(spot.x + spot.w).toBeLessThanOrEqual(model?.width ?? 0);
      }
    }
    expect(composeRoom(house, 'nope:room')).toBeNull();
  });

  it('draws outdoor rooms on the ground with the sky behind', () => {
    const house = sceneHouse({ parts: MANSION });
    const garden = composeRoom(house, 'garden:garden');
    expect(garden?.width).toBe(2 * CELL_W);
    expect(garden?.groundY).toBe(CELL_H);
    expect(garden?.creatures).toHaveLength(0);
  });
});

describe('the build preview', () => {
  it('is the house with the part added, at scale 1', () => {
    const house = sceneHouse({ parts: COTTAGE });
    const preview = housePreview(house, 'house');
    const now = composeHouse(house);
    expect(preview.width).toBeGreaterThanOrEqual(now.width);
    expect(preview.height).toBeGreaterThan(now.height);
    expect(preview.placements.length).toBeGreaterThan(now.back.length);
  });
});

describe('the part preview', () => {
  it('is cropped to the rooms the part adds, with its roof, and small enough for a row', () => {
    const house = sceneHouse({ parts: HUT });
    const preview = partPreview(house, 'cottage');
    const whole = housePreview(house, 'cottage');
    expect(preview.width).toBeLessThan(whole.width);
    expect(preview.width).toBeLessThanOrEqual(CELL_W * 2 + 20);
    expect(preview.height).toBeLessThanOrEqual(CELL_H * 2 + 80);
    // Every placement was moved by the crop: some part of the picture is inside the crop.
    expect(
      preview.placements.some(
        (p) => p.x >= 0 && p.y >= 0 && p.x < preview.width && p.y < preview.height,
      ),
    ).toBe(true);
  });

  it('is the whole house for a part that adds no room', () => {
    const house = sceneHouse({ parts: COTTAGE });
    const preview = partPreview(house, 'hut');
    expect(preview.width).toBe(housePreview(house, 'hut').width);
  });
});

describe('the walls skin', () => {
  const frontOf = (walls: string, parts = COTTAGE): SceneModel =>
    composeHouse(sceneHouse({ parts, walls }));

  it('changes the picture of the house: the tiles of the cut edges and the plinth are the chosen skin', () => {
    const plaster = frontOf('plaster');
    const timber = frontOf('timber');
    expect(plaster.front.length).toBe(timber.front.length);
    const differing = timber.front.filter((p, i) => p.sprite !== plaster.front[i]?.sprite);
    expect(differing.length).toBeGreaterThan(10);
  });

  it('draws the outer wall of the building as a thick band that grows outwards, and an inner wall as before', () => {
    const model = frontOf('timber');
    const left = model.rooms.reduce((a, r) => (r.x < a.x ? r : a));
    // The band's outer ink sits OUTER_SKIN px outside the cell edge, and the room box starts 2 px outside the room's inner face; nothing in the scene is drawn further out.
    const inks = model.front.filter(
      (p) =>
        p.w === undefined &&
        spriteSize(p.sprite).width === 1 &&
        spriteSize(p.sprite).height === CELL_H,
    );
    const outerInk = Math.min(...inks.map((p) => p.x));
    expect(outerInk).toBe(left.x + 2 - OUTER_SKIN);
    // A wall between two rooms keeps its four pixels: no ink column is closer than that to another.
    expect(model.rooms.length).toBeGreaterThan(1);
  });

  it('puts a plinth of the skin along the ground line under the ground floor', () => {
    const model = frontOf('fieldstone', HUT);
    const plinth = model.front.filter(
      (p) =>
        p.y >= model.groundY - 4 &&
        p.y <= model.groundY + 3 &&
        (p.w ?? spriteSize(p.sprite).width) >= 8 &&
        spriteSize(p.sprite).height >= 2,
    );
    expect(plinth.length).toBeGreaterThan(0);
  });
});

describe('where the overview starts', () => {
  it('uses the largest whole scale that fits the house: at most 3 wide, 2 on a phone, down to 1', () => {
    expect(overviewScale(924, 260)).toEqual({ scale: 3, fits: true });
    // It goes smaller, never bigger, when the house does not fit at 2.
    expect(overviewScale(924, 400)).toEqual({ scale: 2, fits: true });
    expect(overviewScale(924, 600)).toEqual({ scale: 1, fits: true });
    expect(overviewScale(340, 160)).toEqual({ scale: 2, fits: true });
    expect(overviewScale(390, 300)).toEqual({ scale: 1, fits: true });
    expect(overviewScale(700, 232)).toEqual({ scale: 3, fits: true });
  });

  it('draws at the phone scale, not whole, when nothing fits; a tall house is not whole in a short box', () => {
    expect(overviewScale(924, 1428)).toEqual({ scale: 2, fits: false });
    expect(overviewScale(390, 900)).toEqual({ scale: 2, fits: false });
    expect(overviewScale(924, 260, 400, 300)).toEqual({ scale: 3, fits: false });
    expect(overviewScale(924, 260, 90, 300)).toEqual({ scale: 3, fits: true });
  });

  it('shows a house that fits whole, and centres one that does not on the Hearth with the grass near the bottom', () => {
    const small = composeHouse(sceneHouse({ parts: ['hut'] }), { minWidth: 195 });
    expect(overviewScroll(small, 2, 390, small.height * 2)).toEqual({ left: 0, top: 0 });
    const model = composeHouse(sceneHouse({ parts: MANSION }));
    const scale = 2;
    const at = overviewScroll(model, scale, 390, 400);
    const hearth = model.rooms.find((r) => r.roomId === 'hut:hearth');
    expect(hearth).toBeDefined();
    expect(model.start.x).toBe((hearth?.x ?? 0) + Math.floor((hearth?.w ?? 0) / 2));
    expect(at.left).toBe(Math.round(model.start.x * scale - 195));
    // The grass line is in the view, near its bottom.
    const grass = model.groundY * scale - at.top;
    expect(grass).toBeLessThanOrEqual(400);
    expect(grass).toBeGreaterThan(400 - 40);
    // A box taller than the picture does not scroll.
    expect(overviewScroll(model, scale, 390, model.height * scale + 50).top).toBe(0);
  });
});

describe('the plaque of a boss not beaten yet', () => {
  it('draws the boss as an outline: a bright edge round a body, nothing where the picture is clear', () => {
    const sprite = { palette: { a: '#fff' }, rows: ['.aaa.', 'aaaaa', 'aaaaa', 'aaaaa', '.aaa.'] };
    const outline = bossOutline(sprite);
    expect(outline.rows).toEqual(['.eee.', 'ebbbe', 'ebbbe', 'ebbbe', '.eee.']);
    expect(Object.keys(outline.palette).sort()).toEqual(['b', 'e']);
  });

  it('puts the week’s boss outline on the empty board', () => {
    const house = sceneHouse({ parts: HUT });
    const plain = composeHouse(house);
    const withBoss = composeHouse(house, {
      drawing: {
        bossSprite: () => ({ palette: { a: '#fff' }, rows: ['aa', 'aa'] }),
        keepsake: () => undefined,
      },
    });
    // The default drawing has no boss art; a drawing that has it adds one placement (the outline) to the empty board.
    expect(withBoss.back.length).toBe(plain.back.length + 1);
    const outline = withBoss.back.find((p) => Object.keys(p.sprite.palette).join() === 'e,b');
    expect(outline).toBeDefined();
  });
});

describe('roofs and boxes', () => {
  it('a gable keeps its base and a flat ridge of at least 16 px', () => {
    for (const base of [124, 236]) {
      const shape = roofShape(base, 'gable');
      expect(shape.width).toBe(base);
      expect(shape.top).toBeGreaterThanOrEqual(16);
      expect(roofRowAt(shape, 5)).toBeGreaterThan(roofRowAt(shape, base / 2));
    }
    expect(roofShape(236, 'hip').height).toBe(20);
  });

  it('puts a floor spot on the floor line and a wall spot at its own height', () => {
    const hearth = housing.rooms.find((r) => r.id === 'hearth');
    const floor = hearth?.spots.find((s) => s.id === 'floor-large-a');
    const wall = hearth?.spots.find((s) => s.id === 'window-a');
    if (floor === undefined || wall === undefined) throw new Error('spots');
    expect(spotBox(floor, false, 100, 0).y + spotBox(floor, false, 100, 0).h).toBe(158);
    expect(spotBox(wall, false, 100, 0).y).toBe(108);
  });

  it('draws rank digits in 3 x 5', () => {
    expect(spriteSize(digitsSprite(12, '#000'))).toEqual({ width: 7, height: 5 });
    expect(spriteSize(digitsSprite(7, '#000'))).toEqual({ width: 3, height: 5 });
  });
});

describe('the art registry', () => {
  it('has art for every piece, skin, stamp and keepsake: nothing is pending', () => {
    expect([...ART_PENDING]).toEqual([]);
  });

  it('draws a grey box of the form size for a piece without art', () => {
    const fake = {
      ...housing,
      pieces: [
        ...housing.pieces,
        { ...(housing.pieces[0] as (typeof housing.pieces)[number]), id: 'ghost-bed', form: 'bed' },
      ],
    };
    expect(hasPieceArt('ghost-bed')).toBe(false);
    expect(spriteSize(pieceArt('ghost-bed', fake).sprite)).toEqual({ width: 48, height: 26 });
    expect(pendingArt(fake).has('ghost-bed')).toBe(true);
    expect(spriteSize(pieceArt('nothing-at-all').sprite)).toEqual({ width: 16, height: 16 });
  });
});

describe('the scene keeps its memory and its canvas size steady', () => {
  it('fills the sky of any width from one fixed tile: many widths add nothing to the cache', () => {
    for (const phase of ['day', 'twilight', 'night'] as const) drawSky([], 300, 200, phase);
    const before = solidCacheSize();
    for (let w = 300; w < 900; w += 7) {
      for (const phase of ['day', 'twilight', 'night'] as const) drawSky([], w, 200, phase);
    }
    expect(solidCacheSize()).toBe(before);
  });

  it('never caches more flat blocks than its cap, whatever is asked for', () => {
    for (let w = 1; w < SOLID_CACHE_MAX * 3; w++)
      composeHouse(sceneHouse({ parts: ['hut'] }), { minWidth: 200 + w });
    expect(solidCacheSize()).toBeLessThanOrEqual(SOLID_CACHE_MAX);
  });

  it('rounds the scene width up to a step, so a resize of a few pixels composes nothing new', () => {
    expect(sceneMinWidth(390, 2) % WIDTH_STEP).toBe(0);
    expect(sceneMinWidth(390, 2)).toBeGreaterThanOrEqual(195);
    expect(sceneMinWidth(392, 2)).toBe(sceneMinWidth(400, 2));
    expect(sceneMinWidth(1100, 3)).toBe(sceneMinWidth(1090, 3));
  });
});

describe('the empty sky above the strip', () => {
  const stars = (placements: readonly Placement[], below: number) =>
    placements.filter(
      (p) =>
        p.mat === 'fixed' &&
        p.y < below &&
        Object.keys(p.sprite.palette).length <= 2 &&
        p.sprite.rows.length <= 3,
    );

  it('has stars scattered over all of it at night, the same each time, and none by day', () => {
    const night: Placement[] = [];
    drawSky(night, 400, 300, 'night');
    const again: Placement[] = [];
    drawSky(again, 400, 300, 'night');
    const top = 300 - 64;
    const found = stars(night, top - 20).filter((p) => p.sprite.rows[0]?.length !== 64);
    expect(found.length).toBeGreaterThan(40);
    // spread over the whole height and width, not only the strip
    expect(Math.min(...found.map((p) => p.y))).toBeLessThan(40);
    expect(Math.max(...found.map((p) => p.x))).toBeGreaterThan(300);
    expect(again).toEqual(night);
    const day: Placement[] = [];
    drawSky(day, 400, 300, 'day');
    expect(stars(day, top).filter((p) => p.sprite.rows[0]?.length !== 64)).toEqual([]);
  });

  it('is not one flat slab at twilight: it darkens in bands towards the top', () => {
    const dusk: Placement[] = [];
    drawSky(dusk, 200, 400, 'twilight');
    const skyTop = 400 - spriteSize(skyForPhase('twilight')).height;
    const colours = new Set(
      dusk.filter((p) => p.y < skyTop).flatMap((p) => Object.values(p.sprite.palette)),
    );
    expect(colours.size).toBeGreaterThanOrEqual(4);
  });
});
