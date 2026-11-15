import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { houseGrid, resource, resources } from '../src/index';
import { housing } from '../src/content/housing';

/** The shipped housing content (docs/design/housing.md 2.5): it loads, it has the counts of the spec, and the compendium names it. */

const NINE = ['bed', 'cupboard', 'table', 'shelf', 'stool', 'lamp', 'rug', 'frame', 'curtains'];

function compendium(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, '../../../docs/compendium/housing.md'), 'utf8');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasNamedEntry(text: string, name: string): boolean {
  const n = escapeRegExp(name);
  return [
    new RegExp(`^#{1,6} ${n}(?![\\w])`, 'm'),
    new RegExp(`\\*\\*${n}\\*\\*`),
    new RegExp(`\\|\\s*${n}\\s*\\|`),
  ].some((re) => re.test(text));
}

/** Sets made since the first night's nine (by `pnpm housing new-set`): each adds nine pieces and two skins. */
const MADE = housing.sets.length - 9;

describe('housing content: counts', () => {
  it('has the first content of the spec', () => {
    expect(MADE).toBeGreaterThanOrEqual(0);
    expect(housing.forms).toHaveLength(22);
    expect(housing.rooms).toHaveLength(19);
    expect(housing.parts).toHaveLength(15);
    expect(housing.materials).toHaveLength(16);
    expect(housing.pieces).toHaveLength(127 + 9 * MADE);
    expect(housing.skins.filter((s) => s.gen === undefined)).toHaveLength(54 + 2 * MADE);
    // the generated room layers (housing C5): 12 wallpapers, 7 floors, 4 trims, 4 ceilings, 3 frames
    const gen = (kind: string) =>
      housing.skins.filter((s) => s.gen !== undefined && s.kind === kind);
    expect(gen('wall')).toHaveLength(12);
    expect(gen('floor')).toHaveLength(7);
    expect(gen('trim')).toHaveLength(4);
    expect(gen('ceiling')).toHaveLength(4);
    expect(gen('frame')).toHaveLength(3);
    expect(housing.stamps).toHaveLength(24);
  });

  it('has 72 set pieces, 18 Cosy pieces, 12 wild pieces and 25 garden, orchard and pond pieces', () => {
    const bySet = (id: string) => housing.pieces.filter((p) => p.set === id);
    expect(housing.sets.filter((s) => s.id !== 'cosy')).toHaveLength(8 + MADE);
    for (const s of housing.sets.filter((x) => x.id !== 'cosy')) {
      expect(bySet(s.id).map((p) => p.form)).toEqual(NINE);
      expect(bySet(s.id).map((p) => p.id)).toEqual(NINE.map((f) => `${s.id}-${f}`));
    }
    expect(bySet('cosy')).toHaveLength(18);
    const free = housing.pieces.filter((p) => p.set === null);
    const garden = free.filter((p) =>
      ['yard-big', 'yard-bit', 'fence', 'poolside', 'float'].includes(p.form),
    );
    expect(garden).toHaveLength(25);
    expect(free).toHaveLength(37);
  });

  it('gives every set a wallpaper, a floor and a keepsake', () => {
    const skins = new Set(housing.skins.map((s) => s.id));
    for (const s of housing.sets) {
      expect(skins.has(`${s.id}-wall`)).toBe(true);
      expect(skins.has(`${s.id}-floor`)).toBe(true);
      expect(s.keepsake.name.length).toBeGreaterThan(0);
    }
  });

  it('teaches each exterior skin by building one part', () => {
    const taught = housing.parts.flatMap((p) => p.unlocks).sort();
    expect(taught).toEqual(
      [
        'slate',
        'timber',
        'fieldstone',
        'red-tile',
        'copper-green',
        'brick',
        'moss',
        'shingle',
      ].sort(),
    );
  });
});

describe('housing content: parts and the economy', () => {
  it('prices the first eleven parts at 2,000 Acorns and 13,000 scrap, the tower, balcony, orchard and pond at 900 and 6,000 more', () => {
    const total = (ids: readonly string[], kind: 'bait' | 'scrap') =>
      housing.parts
        .filter((p) => ids.includes(p.id) === ids.length > 0)
        .flatMap((p) => p.price)
        .filter((l) => l.kind === kind)
        .reduce((n, l) => n + l.amount, 0);
    const next = ['tower', 'balcony', 'orchard', 'pond'];
    const first = housing.parts.map((p) => p.id).filter((id) => !next.includes(id));
    expect(total(first, 'bait')).toBe(2000);
    expect(total(first, 'scrap')).toBe(13000);
    expect(total(next, 'bait')).toBe(900);
    expect(total(next, 'scrap')).toBe(6000);
  });

  it('puts the tower on the house, the balcony on the house, the orchard past the garden and the pond past the terrace', () => {
    const part = (id: string) => housing.parts.find((p) => p.id === id);
    expect(part('tower')?.requires).toEqual(['house']);
    expect(part('balcony')?.requires).toEqual(['house']);
    expect(part('orchard')?.requires).toEqual(['garden']);
    expect(part('pond')?.requires).toEqual(['terrace']);
    expect(part('balcony')?.side).toBe('east');
    expect(part('orchard')?.side).toBe('east');
    expect(part('pond')?.side).toBe('west');
  });

  it('has a free hut and the pool needs the garden and the house', () => {
    const part = (id: string) => housing.parts.find((p) => p.id === id);
    expect(part('hut')?.price).toEqual([]);
    expect(part('pool')?.requires.sort()).toEqual(['garden', 'house']);
    expect(part('west-upper')?.requires).toEqual(['west-wing']);
  });

  it('names every luxury material in the resource library, with a glossary entry', () => {
    for (const m of housing.materials) {
      const r = resource(m.id);
      expect(r?.kind, m.id).toBe('luxury');
      expect(r?.icon).toEqual({ kind: 'glyph', id: `lux-${m.id}` });
    }
    expect(resources.filter((r) => r.kind === 'luxury')).toHaveLength(16);
  });

  it('keeps the three rare materials rare', () => {
    expect(
      housing.materials
        .filter((m) => m.rare)
        .map((m) => m.id)
        .sort(),
    ).toEqual(['fen-opal', 'moonstone', 'old-gold']);
  });
});

describe('housing content: the starter hut', () => {
  it('places only starter pieces, each in a spot of the hearth that fits it', () => {
    const hearth = housing.rooms.find((r) => r.id === 'hearth');
    expect(hearth).toBeDefined();
    for (const [spotId, pieceId] of Object.entries(housing.starter.layout)) {
      const spot = hearth?.spots.find((s) => s.id === spotId);
      const piece = housing.pieces.find((p) => p.id === pieceId);
      const form = housing.forms.find((f) => f.id === piece?.form);
      expect(spot, spotId).toBeDefined();
      expect(piece?.unlock.kind, pieceId).toBe('starter');
      expect(form?.spot, pieceId).toBe(spot?.type);
      expect(form?.box.w ?? 0, pieceId).toBeLessThanOrEqual(spot?.w ?? 0);
    }
  });

  it('has the Cosy set and the starter wild pieces known from the start', () => {
    const starter = housing.pieces.filter((p) => p.unlock.kind === 'starter').map((p) => p.id);
    for (const id of ['cosy-sofa', 'cosy-bed', 'rocking-chair', 'flowerbed', 'hedge']) {
      expect(starter).toContain(id);
    }
    expect(starter).toHaveLength(18 + 3);
  });

  it('puts the hearth first, with the workbench, the mailbox and the mantel', () => {
    const hearth = housing.rooms.find((r) => r.id === 'hearth');
    expect(hearth?.fixtures).toEqual(['workbench', 'mailbox']);
    expect(hearth?.spots.find((s) => s.id === 'mantel')?.display).toBe('raid-plaques');
  });
});

describe('housing content: rooms', () => {
  it('keeps every spot inside its room and every form placeable somewhere', () => {
    for (const r of housing.rooms) {
      for (const s of r.spots) {
        expect(s.x, `${r.id}.${s.id}`).toBeGreaterThanOrEqual(0);
        expect(s.x + s.w, `${r.id}.${s.id}`).toBeLessThanOrEqual(r.cells.w * 112);
      }
    }
    for (const f of housing.forms) {
      const fits = housing.rooms.some((r) =>
        r.spots.some((s) => s.type === f.spot && s.w >= f.box.w),
      );
      expect(fits, f.id).toBe(true);
    }
  });

  it('gives the trophy hall all eight displays', () => {
    const hall = housing.rooms.find((r) => r.id === 'hall');
    const kinds = hall?.spots.flatMap((s) => (s.display ? [s.display] : [])).sort();
    expect(kinds).toEqual(
      [
        'raid-plaques',
        'games-medals',
        'games-badges',
        'festival',
        'keepsakes',
        'journal',
        'dungeon',
        'set-keepsakes',
      ].sort(),
    );
  });
});

describe('housing content: the compendium', () => {
  const text = compendium();
  const named: { kind: string; id: string; name: string }[] = [
    ...housing.parts.map((p) => ({ kind: 'part', id: p.id, name: p.name })),
    ...housing.rooms.map((p) => ({ kind: 'room', id: p.id, name: p.name })),
    ...housing.forms.map((p) => ({ kind: 'form', id: p.id, name: p.name })),
    ...housing.sets.map((p) => ({ kind: 'set', id: p.id, name: p.name })),
    ...housing.sets.map((p) => ({ kind: 'keepsake', id: p.id, name: p.keepsake.name })),
    ...housing.pieces.map((p) => ({ kind: 'piece', id: p.id, name: p.name })),
    ...housing.skins.map((p) => ({ kind: 'skin', id: p.id, name: p.name })),
    ...housing.stamps.map((p) => ({ kind: 'stamp', id: p.id, name: p.name })),
    ...resources
      .filter((r) => r.kind === 'luxury')
      .map((r) => ({ kind: 'material', id: r.id, name: r.name })),
  ];

  it('names every part, room, form, set, keepsake, piece, skin, stamp and material', () => {
    const missing = named
      .filter((n) => !hasNamedEntry(text, n.name))
      .map((n) => `add ${n.kind} ${n.id} ("${n.name}") to docs/compendium/housing.md`);
    expect(missing).toEqual([]);
  });
});

describe('housing content: text', () => {
  it('has plain, short text with no em dashes', () => {
    const all = JSON.stringify(housing);
    expect(all).not.toContain('—');
    for (const p of housing.pieces) {
      expect(p.line.length, p.id).toBeLessThanOrEqual(90);
      expect(p.hint.length, p.id).toBeLessThanOrEqual(90);
    }
  });

  it('leaves no TODO from `pnpm housing new-set` in the content or the compendium', () => {
    const left = [
      ...housing.sets.flatMap((s) => [
        [s.id, s.theme],
        [s.id, s.line],
        [s.id, s.keepsake.name],
        [s.id, s.keepsake.line],
      ]),
      ...housing.pieces.map((p) => [p.id, `${p.name} ${p.line} ${p.hint}`]),
      ...housing.skins.map((s) => [s.id, `${s.name} ${s.hint ?? ''}`]),
    ]
      .filter(([, text]) => /TODO/.test(text ?? ''))
      .map(([id]) => id);
    expect(left).toEqual([]);
    const draft = compendium()
      .split('\n')
      .filter((l) => /TODO|\| draft: /.test(l));
    expect(draft).toEqual([]);
  });
});

describe('housing content: the full house layout (housing.md 2.4)', () => {
  const grid = houseGrid(housing, new Set(housing.parts.map((p) => p.id)));
  const at = (id: string) => {
    const room = grid.find((r) => r.roomId === id);
    if (room === undefined) throw new Error(`no room ${id}`);
    return { col: room.col, floor: room.floor, w: room.w };
  };

  it('places the core rooms where the table says', () => {
    expect(at('hut:hearth')).toEqual({ col: 0, floor: 0, w: 1 });
    expect(at('cottage:kitchen')).toEqual({ col: 1, floor: 0, w: 1 });
    expect(at('cottage:loft')).toEqual({ col: 0, floor: 1, w: 1 });
    expect(at('house:study')).toEqual({ col: 1, floor: 1, w: 1 });
    expect(at('house:attic')).toEqual({ col: 0, floor: 2, w: 2 });
    expect(at('cellar:cellar')).toEqual({ col: 0, floor: -1, w: 2 });
  });

  it('puts the west wing and terrace on the west edge, the east wing, garden and pool on the east', () => {
    expect(at('west-wing:hall')).toEqual({ col: -2, floor: 0, w: 2 });
    expect(at('west-upper:gallery')).toEqual({ col: -2, floor: 1, w: 2 });
    expect(at('terrace:terrace')).toEqual({ col: -4, floor: 0, w: 2 });
    expect(at('east-wing:conservatory')).toEqual({ col: 2, floor: 0, w: 2 });
    expect(at('east-upper:bath')).toEqual({ col: 2, floor: 1, w: 1 });
    expect(at('east-upper:guest')).toEqual({ col: 3, floor: 1, w: 1 });
    expect(at('garden:garden')).toEqual({ col: 4, floor: 0, w: 2 });
    expect(at('pool:pool')).toEqual({ col: 6, floor: 0, w: 2 });
  });

  it('stacks the tower on the right half of the attic and hangs the balcony off the east edge of the first floor', () => {
    expect(at('tower:landing')).toEqual({ col: 1, floor: 3, w: 1 });
    expect(at('tower:observatory')).toEqual({ col: 1, floor: 4, w: 1 });
    // The east upper floor is built in the full house: the balcony is beside the guest room, over the garden.
    expect(at('balcony:balcony')).toEqual({ col: 4, floor: 1, w: 1 });
    expect(at('orchard:orchard')).toEqual({ col: 8, floor: 0, w: 2 });
    expect(at('pond:pond')).toEqual({ col: -6, floor: 0, w: 2 });
  });

  it('puts the balcony on the core wall, on a wing roof, or past the wing, by what stands on the east side', () => {
    const base = ['hut', 'cottage', 'house', 'balcony'];
    const col = (extra: string[]) =>
      houseGrid(housing, new Set([...base, ...extra])).find((r) => r.roomId === 'balcony:balcony')
        ?.col;
    expect(col([])).toBe(2);
    expect(col(['east-wing'])).toBe(2);
    expect(col(['east-wing', 'east-upper'])).toBe(4);
  });

  it('has no overlapping cells and no negative relative columns in the data', () => {
    const seen = new Set<string>();
    for (const r of grid) {
      for (let c = r.col; c < r.col + r.w; c++) {
        const key = `${c},${r.floor}`;
        expect(seen.has(key), key).toBe(false);
        seen.add(key);
      }
    }
    for (const p of housing.parts) for (const r of p.rooms) expect(r.col).toBeGreaterThanOrEqual(0);
  });
});

describe('housing content: room skins (art pass 2)', () => {
  const COSY_ROOMS = ['hearth', 'loft', 'study'];

  it('every indoor room outside the starter three has its own free, part-unlocked skins', () => {
    for (const room of housing.rooms.filter((r) => !r.outdoor)) {
      if (COSY_ROOMS.includes(room.id)) {
        expect([room.wall, room.floor]).toEqual(['cosy-wall', 'cosy-floor']);
        continue;
      }
      expect([room.wall, room.floor]).toEqual([`${room.id}-wall`, `${room.id}-floor`]);
      const part = housing.parts.find((p) => p.rooms.some((r) => r.kind === room.id));
      for (const id of [room.wall, room.floor]) {
        const skin = housing.skins.find((s) => s.id === id);
        expect(skin?.set, id).toBeNull();
        expect(skin?.unlock, id).toEqual({ kind: 'part', part: part?.id });
      }
    }
  });
});

/** Every string in a parsed JSON value, with the path it sits at. */
function strings(value: unknown, path: string): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${String(i)}]`));
  if (typeof value === 'object' && value !== null)
    return Object.entries(value).flatMap(([k, v]) => strings(v, `${path}.${k}`));
  return [];
}

describe('no draft text ships', () => {
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../src/content/data/housing');
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

  it('reads the housing data files', () => {
    expect(files.length).toBeGreaterThanOrEqual(9);
  });

  // `pnpm housing new-set` writes "TODO: ..." lines for the author to replace; an unfinished set must not pass CI.
  it('has no TODO in any housing content string', () => {
    for (const file of files) {
      const parsed: unknown = JSON.parse(readFileSync(resolve(dir, file), 'utf8'));
      const drafts = strings(parsed, file).filter(([, text]) => /\bTODO\b/.test(text));
      expect(drafts, `${file} has draft text`).toEqual([]);
    }
  });

  it('has no TODO in the housing compendium either', () => {
    expect(compendium()).not.toMatch(/\bTODO\b/);
  });
});
