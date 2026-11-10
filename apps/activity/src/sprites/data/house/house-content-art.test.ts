import { describe, expect, it } from 'vitest';
import { resources } from '@creatures/game';
import { housing } from '@creatures/game/housing-content';
import { spriteSize, type SpriteDef } from '../../sprite-data';
import { HOUSING_GLYPHS } from '../../../housing/housing-glyphs';

/** The game's housing content against the art packs: every id the content names has art that fits (housing.md 5). */

interface Pack {
  pieces?: Record<string, { sprite: SpriteDef; front?: SpriteDef; glow?: SpriteDef }>;
  skins?: Record<string, { tile: SpriteDef }>;
  keepsakes?: Record<string, SpriteDef>;
  stamps?: Record<string, SpriteDef>;
}

const modules = import.meta.glob<{ HOUSE_ART?: Pack }>(['./*.ts', '!./*.test.ts'], { eager: true });
const packs: Pack[] = [];
for (const m of Object.values(modules)) if (m.HOUSE_ART !== undefined) packs.push(m.HOUSE_ART);

function find<T>(pick: (p: Pack) => Record<string, T> | undefined, id: string): T | undefined {
  for (const p of packs) {
    const hit = pick(p)?.[id];
    if (hit !== undefined) return hit;
  }
  return undefined;
}

describe('housing content has art', () => {
  it('loads the packs', () => {
    expect(packs.length).toBeGreaterThanOrEqual(10);
  });

  it('every piece has a sprite that fits its form box', () => {
    const forms = new Map(housing.forms.map((f) => [f.id, f]));
    const problems: string[] = [];
    for (const piece of housing.pieces) {
      const art = find((p) => p.pieces, piece.id);
      const form = forms.get(piece.form);
      if (art === undefined || form === undefined) {
        problems.push(`${piece.id}: no art`);
        continue;
      }
      const { width, height } = spriteSize(art.sprite);
      if (width > form.box.w || height > form.box.h) {
        problems.push(`${piece.id}: ${width}x${height} exceeds ${form.box.w}x${form.box.h}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('every skin has art', () => {
    const missing = housing.skins.filter((s) => find((p) => p.skins, s.id) === undefined);
    expect(missing.map((s) => s.id)).toEqual([]);
  });

  it('every set has a keepsake sprite', () => {
    const missing = housing.sets.filter((s) => find((p) => p.keepsakes, s.id) === undefined);
    expect(missing.map((s) => s.id)).toEqual([]);
  });

  it('every stamp has a stamp sprite', () => {
    const missing = housing.stamps.filter((s) => find((p) => p.stamps, s.id) === undefined);
    expect(missing.map((s) => s.id)).toEqual([]);
  });

  it('every material has a lux glyph', () => {
    const missing = housing.materials.filter((m) => HOUSING_GLYPHS[`lux-${m.id}`] === undefined);
    expect(missing.map((m) => m.id)).toEqual([]);
    for (const r of resources.filter((x) => x.kind === 'luxury')) {
      expect(r.icon).toEqual({ kind: 'glyph', id: `lux-${r.id}` });
    }
  });
});
