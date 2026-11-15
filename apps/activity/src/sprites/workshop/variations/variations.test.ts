import { describe, expect, it } from 'vitest';
import { expandRows, validateSprite } from '../../sprite-data';
import { SHIPPED_SETS } from '../sets';
import { makePiece } from '../pack';
import { FORMS } from '../forms';
import { VARIATIONS } from './index';

describe('art variations (review options, not content)', () => {
  const all = Object.values(VARIATIONS);

  it('each is for a shipped set and changes something', () => {
    expect(all.length).toBeGreaterThanOrEqual(6);
    for (const v of all) {
      expect(SHIPPED_SETS[v.set], v.id).toBeDefined();
      expect(v.wall !== undefined || v.floor !== undefined || v.pieces !== undefined, v.id).toBe(
        true,
      );
    }
  });

  it('every piece is exactly its form box, a valid sprite, and differs from the shipped one', () => {
    for (const v of all) {
      const source = SHIPPED_SETS[v.set];
      if (source === undefined) throw new Error(v.set);
      for (const [form, art] of Object.entries(v.pieces ?? {})) {
        const box = FORMS[form as keyof typeof FORMS].box;
        validateSprite(art.sprite, { width: box.w, height: box.h });
        const shipped = makePiece(source, form as keyof typeof FORMS);
        const rows = (s: typeof art.sprite): string => JSON.stringify([expandRows(s), s.palette]);
        expect(rows(art.sprite), `${v.id} ${form}`).not.toBe(rows(shipped.sprite));
      }
    }
  });

  it('the two new cupboards keep the cupboard standing on its last row and are not the shipped outline', () => {
    const shipped = SHIPPED_SETS['fenkeeper'];
    if (shipped === undefined) throw new Error('fenkeeper');
    const was = expandRows(makePiece(shipped, 'cupboard').sprite).map((r) =>
      r.replaceAll(/[^.]/g, '#'),
    );
    for (const id of ['fenkeeper-cupboard-stilts', 'fenkeeper-cupboard-hutch']) {
      const art = VARIATIONS[id]?.pieces?.cupboard;
      if (art === undefined) throw new Error(id);
      const rows = expandRows(art.sprite).map((r) => r.replaceAll(/[^.]/g, '#'));
      expect(rows[rows.length - 1]?.includes('#'), id).toBe(true);
      const same = rows.reduce(
        (n, r, y) => n + [...r].filter((c, x) => c === '#' && was[y]?.[x] === '#').length,
        0,
      );
      const either = rows.reduce(
        (n, r, y) => n + [...r].filter((c, x) => c === '#' || was[y]?.[x] === '#').length,
        0,
      );
      expect(same / either, id).toBeLessThan(0.85);
    }
  });
});
