import { describe, expect, it } from 'vitest';
import { housing } from '@creatures/game/housing-content';
import { collectSets } from '../concepts/index';
import { spriteSize } from '../sprite-data';
import { PATHS } from './new-set';
import { SHIPPED_SETS } from './sets';
import { SET_FORMS } from './style';
import SHIPPED_LOCK from './shipped-art.json';

/**
 * Every furniture set agrees across the places that hold it (`pnpm housing check` runs this with the content, art
 * and lock tests). The content is the source: a set in `sets.json` needs its style, its pack, its concept wrapper, its
 * workshop list entry and its lock rows; the content tests and `house-content-art.test.ts` cover the pieces, skins,
 * keepsake and compendium. A set made by `pnpm housing new-set` starts out complete in all of them.
 */

const SETS = housing.sets.filter((s) => s.id !== 'cosy');

type Pack = { pieces?: Record<string, { sprite: unknown }>; skins?: Record<string, unknown> };
const styleFiles = Object.keys(import.meta.glob('./styles/*.ts'));
const packs = import.meta.glob<{ HOUSE_ART?: Pack }>('../data/house/*.ts', { eager: true });
const concepts = collectSets(import.meta.glob('../concepts/house-*.ts', { eager: true }));

describe.each(SETS.map((s) => [s.id, s] as const))('set %s', (id, set) => {
  it('has its style file, its pack file and its concept wrapper, named by its id', () => {
    expect(styleFiles, PATHS.style(id)).toContain(`./styles/${id}.ts`);
    expect(Object.keys(packs), PATHS.pack(id)).toContain(`../data/house/${id}.ts`);
    expect(
      concepts.map((c) => c.id),
      PATHS.concept(id),
    ).toContain(`house-${id}`);
  });

  it('is in the workshop list, with the style named as the content names it', () => {
    const source = SHIPPED_SETS[id];
    expect(source, `add ${id} to SHIPPED_SETS in workshop/sets.ts`).toBeDefined();
    expect(source?.style.id).toBe(id);
    expect(source?.style.name).toBe(set.name);
  });

  it('has a pack with its nine pieces and two skins, and a concept sheet that shows them', () => {
    const pack = packs[`../data/house/${id}.ts`]?.HOUSE_ART;
    for (const form of SET_FORMS) expect(pack?.pieces?.[`${id}-${form}`], form).toBeDefined();
    expect(Object.keys(pack?.skins ?? {}).sort()).toEqual([`${id}-floor`, `${id}-wall`]);
    const concept = concepts.find((c) => c.id === `house-${id}`);
    for (const form of SET_FORMS) {
      const key = Object.keys(concept?.sprites ?? {}).find(
        (k) => k === form || k === `${id}-${form}`,
      );
      expect(key, `${id} ${form} in the concept wrapper`).toBeDefined();
    }
    expect(Object.keys(concept?.sprites ?? {}).length).toBeGreaterThanOrEqual(SET_FORMS.length + 3);
  });

  it('has each piece in the content for each form, and each in the lock', () => {
    const ids = housing.pieces.filter((p) => p.set === id).map((p) => p.id);
    expect(ids).toEqual(SET_FORMS.map((f) => `${id}-${f}`));
    for (const pid of ids) expect(SHIPPED_LOCK, pid).toHaveProperty([pid]);
  });

  it('draws every piece inside its form box', () => {
    const pack = packs[`../data/house/${id}.ts`]?.HOUSE_ART;
    for (const form of SET_FORMS) {
      const box = housing.forms.find((f) => f.id === form)?.box;
      const art = pack?.pieces?.[`${id}-${form}`];
      if (box === undefined || art === undefined) throw new Error(`${id}-${form}`);
      const size = spriteSize(art.sprite as Parameters<typeof spriteSize>[0]);
      expect(size.width, form).toBeLessThanOrEqual(box.w);
      expect(size.height, form).toBeLessThanOrEqual(box.h);
    }
  });
});

describe('the lock', () => {
  it('holds only the pieces of sets that exist', () => {
    const ids = new Set(housing.pieces.map((p) => p.id));
    expect(Object.keys(SHIPPED_LOCK).filter((id) => !ids.has(id))).toEqual([]);
  });
});
