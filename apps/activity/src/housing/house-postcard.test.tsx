import { afterEach, describe, expect, it } from 'vitest';
import { houseGrid, type HouseView } from '@creatures/game';
import { housing } from '@creatures/game/housing-content';
import { byRole, createPage, type Page } from '../test-dom';
import { expandRows } from '../sprites/sprite-data';
import { POSTCARD_ART } from '../sprites/data/house/postcard';
import { HousePostcard, postcardScale } from './HousePostcard';
import {
  POSTCARD_CELL_H,
  POSTCARD_CELL_W,
  composePostcard,
  postcardName,
  type PostcardBox,
} from './house-postcard';
import { DAY_LIGHTING, moonSprite, skyForPhase } from './house-light';
import { HousePhaseContext } from './house-phase';
import { rasterize } from './house-paint';
import { COTTAGE, HUT, MANSION, THREE_FLOORS, sceneHouse } from './house-scene-sample';

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

const skins = (roof = 'thatch', walls = 'plaster') => ({ roof, walls });
const EXTRAS = ['cellar', 'terrace', 'garden', 'pool', 'west-wing', 'east-wing'] as const;
const STAGES: readonly (readonly [string, readonly string[]])[] = [
  ['hut', HUT],
  ['cottage', COTTAGE],
  ['house', THREE_FLOORS],
  ...EXTRAS.map((e) => [e, [...THREE_FLOORS, e]] as const),
  ['west upper', [...THREE_FLOORS, 'west-wing', 'west-upper']],
  ['east upper', [...THREE_FLOORS, 'east-wing', 'east-upper']],
  ['mansion', MANSION],
];

function overlap(a: PostcardBox, b: PostcardBox): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** The colours a model's picture uses. */
function coloursOf(parts: readonly string[], roof: string, walls: string): Set<string> {
  return new Set(Object.values(composePostcard({ parts, ...skins(roof, walls) }).sprite.palette));
}

describe('composePostcard', () => {
  it.each(STAGES)('%s: nothing is drawn out of bounds and the cells never overlap', (_n, parts) => {
    const model = composePostcard({ parts, ...skins() });
    expect(model.clipped).toBe(0);
    const rows = expandRows(model.sprite);
    expect(rows).toHaveLength(model.height);
    for (const row of rows) expect(row).toHaveLength(model.width);
    for (const b of model.boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(model.width);
      expect(b.y + b.h).toBeLessThanOrEqual(model.height);
    }
    // rooms and grounds are side by side; the cellar's course is under the rooms' feet
    const solid = model.boxes.filter((b) => b.kind !== 'cellar');
    for (const [i, a] of solid.entries())
      for (const b of solid.slice(i + 1))
        expect(overlap(a, b), `${a.roomId} / ${b.roomId}`).toBe(false);
    for (const c of model.boxes.filter((b) => b.kind === 'cellar')) {
      expect(c.y + c.h).toBe(model.groundY);
    }
    // the cell boxes are the grid's: one box per indoor cell above the ground and per outdoor or cellar room
    const grid = houseGrid(housing, new Set(parts));
    const cells = grid.filter((g) => !g.outdoor && g.floor >= 0).reduce((n, g) => n + g.w, 0);
    expect(model.boxes.filter((b) => b.kind === 'room')).toHaveLength(cells);
    expect(model.boxes.filter((b) => b.kind !== 'room')).toHaveLength(
      grid.filter((g) => g.outdoor || g.floor < 0).length,
    );
    // on one ground line: every floor 0 cell stands on it
    for (const b of model.boxes.filter((q) => q.kind === 'room' && q.y + q.h === model.groundY))
      expect(b.h).toBe(POSTCARD_CELL_H);
  });

  it('is as wide as its cells: the full mansion fits a 390 px phone at scale 1', () => {
    const mansion = composePostcard({ parts: MANSION, ...skins() });
    const cells = 12;
    expect(mansion.width).toBe(cells * POSTCARD_CELL_W + 8);
    expect(mansion.width).toBeLessThanOrEqual(390);
    expect(postcardScale(mansion.width, 390)).toBe(1);
    const hut = composePostcard({ parts: HUT, ...skins() });
    expect(hut.width).toBeLessThan(mansion.width / 5);
    expect(postcardScale(hut.width, 390)).toBeGreaterThanOrEqual(8);
  });

  it('a hut, a cottage and a house are told apart by their size', () => {
    const sizes = [HUT, COTTAGE, THREE_FLOORS].map((parts) => {
      const m = composePostcard({ parts, ...skins() });
      return [m.width, m.height] as const;
    });
    expect(sizes[1]?.[0]).toBeGreaterThan(sizes[0]?.[0] ?? 0);
    expect(sizes[2]?.[1]).toBeGreaterThan(sizes[1]?.[1] ?? 0);
    expect(sizes[1]?.[1]).toBeGreaterThan(sizes[0]?.[1] ?? 0);
  });

  it('every part built changes the picture', () => {
    const order = [
      'hut',
      'cottage',
      'house',
      'cellar',
      'terrace',
      'garden',
      'west-wing',
      'west-upper',
      'east-wing',
      'east-upper',
      'pool',
    ];
    let before = composePostcard({ parts: ['hut'], ...skins() }).sprite.rows.join('|');
    for (let n = 2; n <= order.length; n++) {
      const parts = order.slice(0, n);
      const now = composePostcard({ parts, ...skins() }).sprite.rows.join('|');
      expect(now, `after ${parts.at(-1) ?? ''}`).not.toBe(before);
      before = now;
    }
  });

  it('a skin changes the colours and keeps the shape', () => {
    const roofs = housing.skins.filter((s) => s.kind === 'roof').map((s) => s.id);
    const walls = housing.skins.filter((s) => s.kind === 'walls').map((s) => s.id);
    const base = composePostcard({ parts: THREE_FLOORS, ...skins() });
    for (const roof of roofs.slice(1)) {
      const m = composePostcard({ parts: THREE_FLOORS, ...skins(roof) });
      expect([m.width, m.height]).toEqual([base.width, base.height]);
      expect(coloursOf(THREE_FLOORS, roof, 'plaster')).not.toEqual(
        coloursOf(THREE_FLOORS, 'thatch', 'plaster'),
      );
    }
    for (const w of walls.slice(1)) {
      expect(coloursOf(THREE_FLOORS, 'thatch', w)).not.toEqual(
        coloursOf(THREE_FLOORS, 'thatch', 'plaster'),
      );
    }
    // thatch reads as thatch, slate as slate: the roof skin's own light and mid colours are in the picture
    const thatch = coloursOf(HUT, 'thatch', 'plaster');
    expect(thatch.has('#d3ab52')).toBe(true);
    expect(thatch.has('#6c749a')).toBe(false);
    const slate = coloursOf(HUT, 'slate', 'plaster');
    expect(slate.has('#6c749a')).toBe(true);
    expect(slate.has('#d3ab52')).toBe(false);
    // walls likewise
    expect(coloursOf(HUT, 'thatch', 'brick').has('#b45c42')).toBe(true);
  });

  it('puts the door on the Hearth, glass in a conservatory, water in a pool', () => {
    const colours = (parts: readonly string[]) =>
      new Set(Object.values(composePostcard({ parts, ...skins() }).sprite.palette));
    const door =
      Object.values(POSTCARD_ART['door']?.palette ?? {}).find((c) => c === '#d9a468') ?? '';
    expect(colours(HUT).has(door)).toBe(true);
    expect(colours(THREE_FLOORS).has('#9fd8ee')).toBe(false);
    expect(colours([...THREE_FLOORS, 'east-wing']).has('#9fd8ee')).toBe(true);
    expect(colours([...THREE_FLOORS, 'garden']).has('#6fc4dc')).toBe(false);
    expect(colours([...THREE_FLOORS, 'garden', 'pool']).has('#6fc4dc')).toBe(true);
  });

  it('reads a house view and a bare list of parts the same', () => {
    const view = sceneHouse({ parts: COTTAGE, roof: 'slate', walls: 'timber' });
    expect(composePostcard(view).sprite).toEqual(
      composePostcard({ parts: COTTAGE, roof: 'slate', walls: 'timber' }).sprite,
    );
  });
});

describe('postcardName', () => {
  it('says the core and what is built on, in build order', () => {
    const own = { parts: [] as string[], roof: 'thatch', walls: 'plaster' };
    expect(postcardName({ ...own, parts: HUT }, 'Anna')).toBe("Anna's house: hut");
    expect(postcardName({ ...own, parts: COTTAGE })).toBe('House: cottage');
    expect(
      postcardName({ ...own, parts: [...THREE_FLOORS, 'east-wing', 'pool', 'garden'] }, 'Anna'),
    ).toBe("Anna's house: house with a garden, an east wing and a pool");
    expect(postcardName({ ...own, parts: [...COTTAGE, 'east-wing'] }, 'Mika')).toContain(
      'with an east wing',
    );
    expect(postcardName({ ...own, parts: [...THREE_FLOORS, 'cellar', 'terrace'] }, 'Juno')).toBe(
      "Juno's house: house with a cellar and a terrace",
    );
  });

  it('takes the owner from a house view', () => {
    const view = sceneHouse({ parts: [...THREE_FLOORS, 'east-wing', 'pool', 'garden'] });
    expect(postcardName(view)).toBe(
      `${view.owner.name}'s house: house with a garden, an east wing and a pool`,
    );
  });
});

describe('HousePostcard', () => {
  it('is a picture with the spoken name and a canvas at the largest whole scale that fits', () => {
    const house = sceneHouse({ parts: [...COTTAGE, 'east-wing', 'garden', 'pool'] });
    page = createPage();
    page.draw(<HousePostcard house={house} maxWidth={390} />);
    const [img] = byRole(page.root, 'img');
    expect(img?.getAttribute('aria-label')).toBe(
      `${house.owner.name}'s house: cottage with a garden, an east wing and a pool`,
    );
    const model = composePostcard(house);
    const scale = postcardScale(model.width, 390);
    expect(img?.getAttribute('class')).toBe('hp-postcard');
    expect(scale * model.width).toBeLessThanOrEqual(390);
  });

  it('takes a label for the lead-in', () => {
    page = createPage();
    page.draw(
      <HousePostcard
        house={{ parts: HUT, roof: 'thatch', walls: 'plaster' }}
        maxWidth={390}
        label="Your house"
      />,
    );
    const [img] = byRole(page.root, 'img');
    expect(img?.getAttribute('aria-label')).toBe('Your house: hut');
  });
});

/** The picture as bytes, through the same painter the game uses. */
function bytesOf(model: ReturnType<typeof composePostcard>): Uint8ClampedArray {
  return rasterize(model.placements, model.width, model.height, model.lighting);
}

const WARM_PANE = '#ffcf6a';

/** How many lit windows a model has (its window lights). */
const windowLights = (model: ReturnType<typeof composePostcard>): number =>
  model.lighting.lights.filter((l) => l.kind === 'window').length;

describe('the postcard in a phase', () => {
  // A hut and a hut with grounds prove the rule once (the paint pass does not change with the size of the house).
  it.each(STAGES.filter(([n]) => n === 'hut' || n === 'terrace'))(
    '%s: by day it is exactly the picture it always was',
    (_n, parts) => {
      const house = { parts, ...skins() };
      const day = composePostcard(house, undefined, 'day');
      const plain = composePostcard(house);
      expect(day.lighting).toEqual(DAY_LIGHTING);
      expect(day.placements.some((p) => p.mat === 'fixed')).toBe(false); // no sky: transparent round the house
      const old = rasterize([{ sprite: day.sprite, x: 0, y: 0 }], day.width, day.height);
      expect(bytesOf(day)).toEqual(old);
      expect(bytesOf(plain)).toEqual(old);
    },
  );

  it('is the same drawing at night: the same size, the grounds and the cells where they were', () => {
    const house = { parts: MANSION, ...skins() };
    const day = composePostcard(house);
    for (const phase of ['twilight', 'night'] as const) {
      const dark = composePostcard(house, undefined, phase);
      expect(dark.width).toBe(day.width);
      expect(dark.height).toBe(day.height);
      expect(dark.groundY).toBe(day.groundY);
      expect(dark.boxes).toEqual(day.boxes);
      expect(dark.clipped).toBe(0);
      expect(dark.phase).toBe(phase);
      expect(dark.lighting.phase).toBe(phase);
    }
  });

  it('paints the valley sky behind it at twilight and night, and the night moon only at night', () => {
    const house = { parts: MANSION, ...skins() };
    const night = composePostcard(house, undefined, 'night');
    const dusk = composePostcard(house, undefined, 'twilight');
    expect(night.placements.some((p) => p.sprite === skyForPhase('night'))).toBe(true);
    expect(dusk.placements.some((p) => p.sprite === skyForPhase('twilight'))).toBe(true);
    expect(night.placements.some((p) => p.sprite === moonSprite())).toBe(true);
    expect(dusk.placements.some((p) => p.sprite === moonSprite())).toBe(false);
    // the sky fills the picture above the ground, so no pixel there is clear
    const bytes = bytesOf(night);
    for (let y = 0; y < night.groundY; y++)
      for (let x = 0; x < night.width; x++)
        expect(bytes[(y * night.width + x) * 4 + 3], `${String(x)},${String(y)}`).toBe(255);
  });

  it('makes the walls and the lawn darker at night and keeps the outline dark', () => {
    const house = { parts: THREE_FLOORS, ...skins() };
    const day = bytesOf(composePostcard(house));
    const night = bytesOf(composePostcard(house, undefined, 'night'));
    const m = composePostcard(house);
    const at = (a: Uint8ClampedArray, x: number, y: number): number =>
      (a[(y * m.width + x) * 4] ?? 0) +
      (a[(y * m.width + x) * 4 + 1] ?? 0) +
      (a[(y * m.width + x) * 4 + 2] ?? 0);
    const wall = m.boxes.find((b) => b.kind === 'room');
    expect(wall).toBeDefined();
    expect(at(night, (wall?.x ?? 0) + 2, (wall?.y ?? 0) + 4)).toBeLessThan(
      at(day, (wall?.x ?? 0) + 2, (wall?.y ?? 0) + 4),
    );
    expect(at(night, 10, m.groundY + 1)).toBeLessThan(at(day, 10, m.groundY + 1));
    // the outline (the left edge of the leftmost wall) is still darker than the wall beside it at night
    const rooms = m.boxes.filter((b) => b.kind === 'room');
    const edge = rooms.reduce((a, b) => (b.x < a.x ? b : a), rooms[0] ?? { x: 0, y: 0 });
    expect(at(night, edge.x, edge.y + 6)).toBeLessThan(at(night, edge.x + 1, edge.y + 6) - 40);
  });

  it('lights windows warm at night, from a stable pattern, with a glow on the wall round each', () => {
    const house = { parts: MANSION, ...skins() };
    const night = composePostcard(house, undefined, 'night');
    const again = composePostcard(house, undefined, 'night');
    expect(night.lighting.lights).toEqual(again.lighting.lights);
    const lit = windowLights(night);
    const rooms = night.boxes.filter((b) => b.kind === 'room').length;
    expect(lit).toBeGreaterThan(0);
    expect(lit).toBeLessThan(rooms);
    expect(night.sprite.palette).toBeDefined();
    expect(Object.values(night.sprite.palette)).toContain(WARM_PANE);
    expect(Object.values(composePostcard(house).sprite.palette)).not.toContain(WARM_PANE);
    // each glow stays in its own cell
    for (const l of night.lighting.lights.filter((q) => q.kind === 'window')) {
      expect(night.boxes.some((b) => b.x === l.clip.x && b.y === l.clip.y)).toBe(true);
    }
    // a lit window's pane is bright in the picture
    const bytes = bytesOf(night);
    const first = night.lighting.lights.find((l) => l.kind === 'window');
    const px = ((first?.y ?? 0) * night.width + (first?.x ?? 0)) * 4;
    expect(bytes[px]).toBeGreaterThan(200);
  });

  it('has fewer lit windows at twilight than at night, and none by day', () => {
    const house = { parts: MANSION, ...skins() };
    expect(windowLights(composePostcard(house))).toBe(0);
    expect(windowLights(composePostcard(house, undefined, 'twilight'))).toBeLessThanOrEqual(
      windowLights(composePostcard(house, undefined, 'night')),
    );
  });

  it('lights about four in five of the night windows at twilight; the rest are dark glass, not panes of the dusk', () => {
    const house = { parts: [...MANSION, 'tower'], ...skins() };
    const dusk = windowLights(composePostcard(house, undefined, 'twilight'));
    const night = windowLights(composePostcard(house, undefined, 'night'));
    expect(dusk).toBeGreaterThanOrEqual(Math.floor(night * 0.6));
    expect(dusk).toBeLessThan(night);
    const mats = (phase: 'twilight' | 'night') =>
      new Set(composePostcard(house, undefined, phase).placements.map((p) => p.mat));
    expect(mats('twilight').has('window')).toBe(false);
    expect(mats('twilight').has('outdoor')).toBe(true);
    expect(mats('night').has('window')).toBe(true);
  });

  it('puts a porch lamp by the Hearth door from dusk, and a lantern post in a garden', () => {
    const withGarden = { parts: [...THREE_FLOORS, 'garden'], ...skins() };
    const night = composePostcard(withGarden, undefined, 'night');
    const kinds = night.lighting.lights.map((l) => l.kind);
    expect(kinds).toContain('porch');
    expect(kinds).toContain('lantern');
    expect(
      composePostcard({ parts: THREE_FLOORS, ...skins() }, undefined, 'night').lighting.lights.map(
        (l) => l.kind,
      ),
    ).not.toContain('lantern');
    for (const l of night.lighting.lights) {
      expect(l.clip.x + l.clip.w).toBeLessThanOrEqual(night.width);
      expect(l.clip.y + l.clip.h).toBeLessThanOrEqual(night.height);
    }
  });

  it('lights the rooms of a house view that hold a light or a housemate, and only those', () => {
    const parts = [...THREE_FLOORS];
    const base = sceneHouse({ parts });
    const dark: HouseView = {
      ...base,
      housemates: [],
      rooms: base.rooms.map((r) => ({
        ...r,
        spots: Object.fromEntries(Object.keys(r.spots).map((k) => [k, null])),
      })),
    };
    const count = (house: HouseView): number =>
      windowLights(composePostcard(house, undefined, 'night'));
    expect(count(dark)).toBe(0);
    // a lamp in one non-hearth room
    const target = dark.rooms.find((r) => r.kind !== 'hearth');
    const lampSpot = housing.rooms
      .find((k) => k.id === target?.kind)
      ?.spots.find((s) => s.type === 'floor-small' || s.type === 'ceiling');
    expect(target).toBeDefined();
    const withLamp = {
      ...dark,
      rooms: dark.rooms.map((r) =>
        r === target ? { ...r, spots: { ...r.spots, [lampSpot?.id ?? 'x']: 'cosy-lamp' } } : r,
      ),
    };
    const cells = composePostcard(withLamp).boxes.filter((b) => b.roomId === target?.id).length;
    expect(count(withLamp)).toBe(cells);
    // a housemate at home lights their room; one away does not
    const mate = (home: boolean) => ({
      ...dark,
      housemates: [
        {
          roomId: target?.id ?? '',
          spotId: 'bed',
          home,
          creature: { id: 'c1', species: 'moss-hopper', shiny: false, nickname: null, level: 3 },
        },
      ],
    });
    expect(count(mate(true))).toBeGreaterThan(0);
    expect(count(mate(false))).toBe(0);
  });
});

describe('HousePostcard in a phase', () => {
  it('takes the house phase of its provider', () => {
    page = createPage();
    page.draw(
      <HousePhaseContext.Provider value="night">
        <HousePostcard house={{ parts: HUT, roof: 'thatch', walls: 'plaster' }} maxWidth={390} />
      </HousePhaseContext.Provider>,
    );
    const [img] = byRole(page.root, 'img');
    expect(img?.getAttribute('aria-label')).toBe('House: hut');
  });
});

describe('postcardScale', () => {
  it('is the largest whole scale that fits, at least 1', () => {
    expect(postcardScale(344, 390)).toBe(1);
    expect(postcardScale(344, 1100)).toBe(3);
    expect(postcardScale(36, 390)).toBe(10);
    expect(postcardScale(344, 100)).toBe(1);
    expect(postcardScale(0, 100)).toBe(100);
  });
});
