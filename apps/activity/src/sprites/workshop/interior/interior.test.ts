import { describe, expect, it } from 'vitest';
import { expandRows } from '../../sprite-data';
import { CEILING_COLOURS, CEILING_KINDS, ceilingOverlay } from './ceilings';
import { FLOOR_PATTERNS, floorTile } from './floors';
import { FRAMES } from './frame';
import { CELL_H, CELL_W, luma } from './kit';
import { FLOOR_COLOURS, TRIM_COLOURS, WALL_COLOURS } from './palettes';
import { collisionTable } from './report';
import { houseMock, lookOf, MIXES, mixRoom } from './sheets';
import { TRIM_KINDS, trimOverlay } from './trim';
import {
  collisions,
  DOOR_H,
  DOOR_STYLES,
  DOOR_W,
  doorway,
  edgeZone,
  stair,
  STAIR_STYLES,
} from './ways';
import { WALL_PATTERNS, wallpaper } from './wallpaper';

const never = (): never => {
  throw new Error('missing test input');
};

const size = (s: { rows: readonly string[] }): { w: number; h: number } => ({
  w: s.rows[0]?.length ?? 0,
  h: s.rows.length,
});

describe('wallpaper', () => {
  it('is pattern x colour: 13 patterns, 12 colours', () => {
    expect(WALL_PATTERNS).toHaveLength(13);
    expect(WALL_COLOURS).toHaveLength(12);
  });

  it('every tile is the wall high and as wide as a divisor of a cell, so it tiles across rooms', () => {
    for (const p of WALL_PATTERNS) {
      expect(CELL_W % p.w, p.id).toBe(0);
      const t = wallpaper(p, WALL_COLOURS[0] ?? never());
      expect(size(t)).toEqual({ w: p.w, h: 52 });
      expect(new Set(t.rows.join('')).size).toBeLessThanOrEqual(4);
    }
  });

  it('stays soft: every tone within a budget of the ground, the body tone closer (furniture must read on top)', () => {
    for (const p of WALL_PATTERNS) {
      for (const c of WALL_COLOURS) {
        const t = wallpaper(p, c);
        for (const [key, colour] of Object.entries(t.palette)) {
          const d = Math.abs(luma(colour) - luma(c.a));
          expect(d, `${p.id} ${c.id} ${key}`).toBeLessThanOrEqual(key === 'b' ? 0.2 : 0.36);
        }
      }
    }
  });

  it('is deterministic', () => {
    for (const p of WALL_PATTERNS) {
      const c = WALL_COLOURS[3] ?? never();
      expect(wallpaper(p, c)).toEqual(wallpaper(p, c));
    }
  });
});

describe('floors', () => {
  it('are 8 rows, a divisor of a cell wide, 9 patterns x 8 colours', () => {
    expect(FLOOR_PATTERNS).toHaveLength(9);
    expect(FLOOR_COLOURS).toHaveLength(8);
    for (const p of FLOOR_PATTERNS) {
      expect(CELL_W % p.w, p.id).toBe(0);
      expect(size(floorTile(p, FLOOR_COLOURS[0] ?? never()))).toEqual({ w: p.w, h: 8 });
    }
  });
});

describe('trim', () => {
  const white = TRIM_COLOURS[0] ?? never();
  it('none is no overlay; every other kind is 28 x 52 and leaves the middle of the wall to the paper', () => {
    expect(trimOverlay('none', white, 4)).toBeUndefined();
    for (const k of TRIM_KINDS.filter((x) => x.id !== 'none')) {
      for (const c of TRIM_COLOURS) {
        const t = trimOverlay(k.id, c, 4);
        expect(t === undefined ? null : size(t)).toEqual({ w: 28, h: 52 });
        const rows = t?.rows ?? [];
        // skirting on the floor line, nothing at the paper's middle row for the kinds with a bare upper wall
        expect(rows[50]?.includes('.'), `${k.id} ${c.id} skirting`).toBe(false);
        if (k.id !== 'panelled') expect(rows[22]?.replaceAll('.', ''), `${k.id} ${c.id}`).toBe('');
      }
    }
  });
});

describe('ceilings', () => {
  it('overlays are as wide as the room and as tall as their kind', () => {
    for (const k of CEILING_KINDS) {
      for (const c of CEILING_COLOURS) {
        const one = ceilingOverlay(k.id, c, CELL_W);
        const two = ceilingOverlay(k.id, c, 2 * CELL_W);
        expect(size(one).w).toBe(CELL_W);
        expect(size(two).w).toBe(2 * CELL_W);
        expect(size(one).h).toBeLessThanOrEqual(k.height);
      }
    }
  });

  it('the rafters are mirrored left to right', () => {
    const t = ceilingOverlay('rafters', CEILING_COLOURS[0] ?? never(), CELL_W);
    const solid = (key: string): boolean => key !== '.';
    for (const row of expandRows(t)) {
      const open = [...row].map(solid);
      expect(open).toEqual([...open].reverse());
    }
  });
});

describe('frame', () => {
  it('posts are 2 x 8 and slabs 16 x 4 with an ink row under them', () => {
    expect(FRAMES.length).toBeGreaterThanOrEqual(9);
    for (const f of FRAMES) {
      expect(size(f.post)).toEqual({ w: 2, h: 8 });
      expect(size(f.slab)).toEqual({ w: 16, h: 4 });
      expect(f.slab.rows[3]).toBe('kkkkkkkkkkkkkkkk');
    }
  });
});

describe('ways through', () => {
  it('a doorway is 20 x 38 with a threshold of ink and an opening', () => {
    for (const s of DOOR_STYLES) {
      const d = doorway(s.id, TRIM_COLOURS[0] ?? never(), WALL_COLOURS[1] ?? never());
      expect(size(d.sprite)).toEqual({ w: DOOR_W, h: DOOR_H });
      expect(d.sprite.rows[DOOR_H - 1]).toBe('k'.repeat(DOOR_W));
      expect(d.sprite.palette.p).toBeDefined();
    }
  });

  it('a stair climbs one floor and its hole fits its width', () => {
    for (const s of STAIR_STYLES) {
      const st = stair(s.id, {
        id: 'w',
        name: 'w',
        a: '#b07a4c',
        b: '#82553a',
        c: '#d29c68',
        d: '#5e3a28',
      });
      expect(size(st.sprite)).toEqual({ w: s.w, h: st.h });
      expect(st.h).toBeGreaterThanOrEqual(64);
      expect(st.hole.x).toBeGreaterThanOrEqual(0);
      expect(st.hole.x + st.hole.w).toBeLessThanOrEqual(s.w);
    }
  });

  it('collisions name the wall spots and floor spots a zone meets', () => {
    const room = {
      id: 'r',
      cells: 1,
      spots: [
        { id: 'window', type: 'window', x: 2, w: 36 },
        { id: 'shelf', type: 'wall-large', x: 40, w: 40 },
        { id: 'plant', type: 'floor-small', x: 3, w: 20 },
        { id: 'lamp', type: 'floor-small', x: 90, w: 20 },
        { id: 'rug', type: 'rug', x: 28, w: 56 },
      ],
    };
    const [a, b] = edgeZone(room, 'left', 10);
    expect(collisions(room, a, b)).toEqual({ wall: ['window'], floor: ['plant'] });
    const [c, d] = edgeZone(room, 'right', 10);
    expect(collisions(room, c, d)).toEqual({ wall: [], floor: ['lamp'] });
    expect(collisionTable([{ ...room, cells: { w: 1 } }])).toContain('| r |');
  });
});

describe('the mixes and the house', () => {
  it('eight mixes combine every layer and render a room cell', () => {
    expect(MIXES).toHaveLength(8);
    for (const m of MIXES) {
      const look = lookOf(m.mix);
      expect(look.trim, m.name).toBeDefined();
      expect(look.ceiling, m.name).toBeDefined();
      expect(look.frame, m.name).toBeDefined();
      expect(m.mix.door !== undefined || m.mix.stair !== undefined, m.name).toBe(true);
      expect(mixRoom(m).raster.h).toBe(CELL_H);
    }
  });

  it('no two mixes share a wall pattern and colour', () => {
    const keys = MIXES.map((m) => m.mix.wall?.join('/'));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('the house mock renders three floors', () => {
    const h = houseMock();
    expect(h.h).toBeGreaterThan(3 * CELL_H);
  });
});
