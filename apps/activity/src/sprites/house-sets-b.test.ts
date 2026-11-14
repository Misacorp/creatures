import { describe, expect, it } from 'vitest';
import { expandRows } from './sprite-data';
import { lintSprite } from './sprite-lint';
import { HOUSE_ART as stormglass } from './data/house/stormglass';
import { HOUSE_ART as fenkeeper } from './data/house/fenkeeper';
import { HOUSE_ART as ancient } from './data/house/ancient';
import { HOUSE_ART as lanternNight } from './data/house/lantern-night';

/** The biggest sprite of each form (docs/design/housing.md 2.5). */
const BOX: Readonly<Record<string, readonly [number, number]>> = {
  bed: [48, 26],
  cupboard: [30, 36],
  table: [44, 18],
  shelf: [40, 20],
  stool: [16, 12],
  lamp: [20, 16],
  rug: [56, 10],
  frame: [24, 16],
  curtains: [36, 26],
};

const SETS = {
  stormglass,
  fenkeeper,
  ancient,
  'lantern-night': lanternNight,
} as const;

const size = (rows: readonly string[]): [number, number] => [rows[0]?.length ?? 0, rows.length];

describe.each(Object.entries(SETS))('house set %s', (set, pack) => {
  it('has the nine pieces, a wallpaper, a floor and a keepsake', () => {
    expect(Object.keys(pack.pieces ?? {}).sort()).toEqual(
      Object.keys(BOX)
        .map((form) => `${set}-${form}`)
        .sort(),
    );
    expect(Object.keys(pack.skins ?? {}).sort()).toEqual([`${set}-floor`, `${set}-wall`]);
    expect(Object.keys(pack.keepsakes ?? {})).toEqual([set]);
  });

  it('fits every piece to its form box, and every layer to its piece', () => {
    for (const [form, [w, h]] of Object.entries(BOX)) {
      const art = pack.pieces?.[`${set}-${form}`];
      expect(art, form).toBeDefined();
      if (art === undefined) continue;
      const [sw, sh] = size(expandRows(art.sprite));
      expect(sw, `${form} width`).toBeLessThanOrEqual(w);
      expect(sh, `${form} height`).toBeLessThanOrEqual(h);
      for (const layer of [art.front, art.glow]) {
        if (layer !== undefined) expect(size(expandRows(layer))).toEqual([sw, sh]);
      }
    }
  });

  it('keeps the bed anchor, the lamp glow and the tile sizes', () => {
    expect(pack.pieces?.[`${set}-bed`]?.sleep).toBeDefined();
    expect(pack.pieces?.[`${set}-bed`]?.front).toBeDefined();
    expect(pack.pieces?.[`${set}-lamp`]?.glow).toBeDefined();
    expect(
      size(expandRows(pack.skins?.[`${set}-wall`]?.tile ?? { rows: [], palette: {} })),
    ).toEqual([16, 52]);
    expect(
      size(expandRows(pack.skins?.[`${set}-floor`]?.tile ?? { rows: [], palette: {} })),
    ).toEqual([16, 8]);
    expect(size(expandRows(pack.keepsakes?.[set] ?? { rows: [], palette: {} }))).toEqual([12, 12]);
  });

  it('passes the sprite lint, and every piece stands on its bottom row', () => {
    const sprites = [
      ...Object.values(pack.pieces ?? {}).flatMap((p) => [p.sprite, p.front, p.glow]),
      ...Object.values(pack.skins ?? {}).map((s) => s.tile),
      ...Object.values(pack.keepsakes ?? {}),
    ];
    for (const sprite of sprites) {
      if (sprite === undefined) continue;
      const errors = lintSprite(sprite, { kind: 'free' }).filter((f) => f.level === 'error');
      expect(errors).toEqual([]);
    }
    for (const form of ['bed', 'cupboard', 'table', 'stool', 'rug']) {
      const art = pack.pieces?.[`${set}-${form}`];
      const bottom = expandRows(art?.sprite ?? { rows: [''], palette: {} }).at(-1) ?? '';
      expect(bottom.replaceAll('.', '').length, form).toBeGreaterThan(0);
    }
  });
});
