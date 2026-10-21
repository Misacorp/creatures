import { describe, expect, it } from 'vitest';
import {
  applyCatchToCollection,
  fuseInto,
  fusionLevel,
  fusionProgress,
  fusionThreshold,
  fusionPointsFor,
  RULES,
  compareStrength,
  content,
  creaturePower,
  effectiveStats,
  fusionBonusBp,
  recallCatches,
  sanitizeNickname,
  strongest,
} from '../src/index';

describe('recallCatches', () => {
  const start = 1_000_000;
  const end = start + 12 * 3_600_000;

  it('is floor(rolls x elapsed / total)', () => {
    expect(recallCatches(3, start, end, start)).toBe(0);
    expect(recallCatches(3, start, end, start + (end - start) / 2)).toBe(1); // 1.5 floors to 1
    expect(recallCatches(2, start, end, start + (end - start) / 2)).toBe(1);
    expect(recallCatches(3, start, end, end)).toBe(3);
    expect(recallCatches(3, start, end, end - 1)).toBe(2);
  });

  it('clamps a clock before the start or after the end', () => {
    expect(recallCatches(3, start, end, start - 5_000_000)).toBe(0);
    expect(recallCatches(3, start, end, end + 99_000_000)).toBe(3);
  });

  it('validates its arguments', () => {
    expect(() => recallCatches(3, end, start, start)).toThrow(RangeError);
    expect(() => recallCatches(3, start, start, start)).toThrow(RangeError);
    expect(() => recallCatches(-1, start, end, start)).toThrow(RangeError);
    expect(() => recallCatches(1.5, start, end, start)).toThrow(RangeError);
  });
});

describe('fusion', () => {
  it('has the cumulative bonus table, capped at 5 fusions', () => {
    expect([0, 1, 2, 3, 4, 5].map(fusionBonusBp)).toEqual([0, 600, 1100, 1500, 1800, 2000]);
    expect(fusionBonusBp(6)).toBe(2000);
    expect(fusionBonusBp(100)).toBe(2000);
    expect(() => fusionBonusBp(-1)).toThrow(RangeError);
    expect(() => fusionBonusBp(1.5)).toThrow(RangeError);
  });

  it('adds new lines to the collection', () => {
    expect(
      applyCatchToCollection(undefined, { species: { rarity: 'common' }, shiny: false }),
    ).toEqual({
      kind: 'new',
    });
  });

  it('turns a catch of a line the player owns into a duplicate, never into a fusion or Bait', () => {
    const rare = { species: { rarity: 'rare' as const }, shiny: false };
    expect(applyCatchToCollection(undefined, rare)).toEqual({ kind: 'new' });
    for (let n = 0; n <= 5; n++) {
      expect(applyCatchToCollection({ fusionCount: n, shiny: false }, rare)).toEqual({
        kind: 'duplicate',
        becameShiny: false,
      });
    }
  });

  it('turns points into levels by steep thresholds, 1 3 5 9 16 points per level', () => {
    expect(RULES.fusion.thresholds).toHaveLength(RULES.fusion.maxFusions);
    const levels = [0, 1, 3, 4, 8, 9, 17, 18, 33, 34, 40].map(fusionLevel);
    expect(levels).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect([1, 2, 3, 4, 5].map(fusionThreshold)).toEqual([1, 4, 9, 18, 34]);
    expect(fusionThreshold(0)).toBe(0);
    // Each level costs more than the one before.
    const steps = [1, 2, 3, 4, 5].map((l) => fusionThreshold(l) - fusionThreshold(l - 1));
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1] as number);
    expect(() => fusionLevel(-1)).toThrow(RangeError);
    expect(() => fusionLevel(1.5)).toThrow(RangeError);
    expect(() => fusionThreshold(6)).toThrow(RangeError);
  });

  it('adds points by the duplicate rarity, caps at the maximum and then offers none', () => {
    expect(['common', 'rare', 'epic'].map((r) => fusionPointsFor(r as 'common'))).toEqual([
      1, 2, 4,
    ]);
    expect(fuseInto(0, 'common')).toBe(1);
    expect(fuseInto(1, 'rare')).toBe(3);
    expect(fusionLevel(fuseInto(5, 'common') as number)).toBe(2);
    // Past the maximum nothing is stored: the last step stops at the top threshold.
    expect(fuseInto(32, 'epic')).toBe(34);
    expect(fuseInto(34, 'common')).toBeNull();
    expect(fuseInto(0, 'epic')).toBe(4);
    // Commons alone: 34 duplicates reach level 5.
    let points = 0;
    let n = 0;
    for (let next = fuseInto(points, 'common'); next !== null; next = fuseInto(points, 'common')) {
      points = next;
      n += 1;
    }
    expect(n).toBe(34);
    expect(fusionLevel(points)).toBe(5);
    expect(() => fuseInto(-1, 'common')).toThrow(RangeError);
  });

  it('reports progress toward the next level', () => {
    expect(fusionProgress(0)).toEqual({ level: 0, into: 0, need: 1 });
    expect(fusionProgress(4)).toEqual({ level: 2, into: 0, need: 5 });
    expect(fusionProgress(10)).toEqual({ level: 3, into: 1, need: 9 });
    expect(fusionProgress(34)).toEqual({ level: 5, into: 0, need: null });
  });

  it('makes the creature shiny from a shiny duplicate, only once', () => {
    const plain = { fusionCount: 2, shiny: false };
    expect(applyCatchToCollection(plain, { species: { rarity: 'epic' }, shiny: true })).toEqual({
      kind: 'duplicate',
      becameShiny: true,
    });
    const shiny = { fusionCount: 2, shiny: true };
    expect(
      applyCatchToCollection(shiny, { species: { rarity: 'epic' }, shiny: true }),
    ).toMatchObject({
      becameShiny: false,
    });
    const maxed = { fusionCount: 5, shiny: false };
    expect(applyCatchToCollection(maxed, { species: { rarity: 'epic' }, shiny: true })).toEqual({
      kind: 'duplicate',
      becameShiny: true,
    });
  });
});

describe('effectiveStats', () => {
  const zip = content.creatures.find((c) => c.id === 'zipmouse');
  if (!zip) throw new Error('missing zipmouse');

  it('is base stats at level 1 with no fusions', () => {
    expect(effectiveStats(zip, 1, 0)).toEqual(zip.baseStats);
  });

  it('adds growth per level', () => {
    expect(effectiveStats(zip, 10, 0)).toEqual({
      hp: zip.baseStats.hp + zip.growth.hp * 9,
      atk: zip.baseStats.atk + zip.growth.atk * 9,
      spd: zip.baseStats.spd + zip.growth.spd * 9,
    });
  });

  it('applies the fusion bonus and floors', () => {
    const species = {
      baseStats: { hp: 101, atk: 7, spd: 9 },
      growth: { hp: 0, atk: 0, spd: 0 },
      levelCap: 15,
    };
    // 101 x 1.06 = 107.06, 7 x 1.06 = 7.42, 9 x 1.06 = 9.54
    expect(effectiveStats(species, 1, 1)).toEqual({ hp: 107, atk: 7, spd: 9 });
    // +20% at 5 fusions and beyond
    expect(effectiveStats(species, 1, 5)).toEqual({ hp: 121, atk: 8, spd: 10 });
    expect(effectiveStats(species, 1, 9)).toEqual(effectiveStats(species, 1, 5));
  });

  it('always returns integers', () => {
    for (let level = 1; level <= zip.levelCap; level++) {
      for (const fusions of [0, 1, 2, 3, 4, 5]) {
        for (const value of Object.values(effectiveStats(zip, level, fusions))) {
          expect(Number.isInteger(value)).toBe(true);
        }
      }
    }
  });

  it('rejects levels outside 1 to the species cap', () => {
    const stage1 = content.creatures.find((c) => c.id === 'splashet');
    if (!stage1) throw new Error('missing splashet');
    expect(() => effectiveStats(stage1, 0, 0)).toThrow(RangeError);
    expect(() => effectiveStats(stage1, 16, 0)).toThrow(RangeError);
    expect(() => effectiveStats(stage1, 1.5, 0)).toThrow(RangeError);
    expect(() => effectiveStats(stage1, 15, 0)).not.toThrow();
  });
});

describe('sanitizeNickname', () => {
  it('accepts ordinary names unchanged', () => {
    expect(sanitizeNickname('Biscuit')).toEqual({ ok: true, value: 'Biscuit' });
    expect(sanitizeNickname('Mr. Zip-Zap')).toEqual({ ok: true, value: 'Mr. Zip-Zap' });
  });

  it('trims and collapses whitespace', () => {
    expect(sanitizeNickname('  Big   Boss \u00a0 ')).toEqual({ ok: true, value: 'Big Boss' });
  });

  it('NFKC-normalises', () => {
    expect(sanitizeNickname('\uff21\uff22\uff23')).toEqual({ ok: true, value: 'ABC' }); // fullwidth
    expect(sanitizeNickname('e\u0301')).toEqual({ ok: true, value: '\u00e9' }); // e + acute
  });

  it('treats empty and whitespace-only input as clearing the nickname', () => {
    expect(sanitizeNickname('')).toEqual({ ok: true, value: null });
    expect(sanitizeNickname('   \u00a0\u3000 ')).toEqual({ ok: true, value: null });
  });

  it('rejects control characters', () => {
    for (const bad of ['a\u0000b', 'a\nb', 'a\tb', '\u0007', 'a\u007fb', 'a\u0085b']) {
      expect(sanitizeNickname(bad)).toEqual({ ok: false, reason: 'forbidden_characters' });
    }
  });

  it('rejects bidi overrides and isolates', () => {
    for (const bad of ['\u202eevil', 'ab\u202ccd', '\u2066x\u2069', 'a\u200fb', 'a\u061cb']) {
      expect(sanitizeNickname(bad)).toEqual({ ok: false, reason: 'forbidden_characters' });
    }
  });

  it('rejects zero-width characters, including the joiner and BOM', () => {
    for (const bad of ['a\u200bb', 'a\u200db', 'a\u200cb', 'a\u2060b', '\ufeffab', 'a\u00adb']) {
      expect(sanitizeNickname(bad)).toEqual({ ok: false, reason: 'forbidden_characters' });
    }
    // A zero-width joiner alone does not slip through as an "empty" nickname either.
    expect(sanitizeNickname('\u200d')).toEqual({ ok: false, reason: 'forbidden_characters' });
  });

  it('rejects unassigned code points and lone surrogates', () => {
    expect(sanitizeNickname('a\u0378b')).toEqual({ ok: false, reason: 'forbidden_characters' });
    expect(sanitizeNickname('a\ud800b')).toEqual({ ok: false, reason: 'forbidden_characters' });
    expect(sanitizeNickname('a\udc00')).toEqual({ ok: false, reason: 'forbidden_characters' });
  });

  it('counts code points, not UTF-16 units', () => {
    const twenty = '\u{1f600}'.repeat(20);
    expect(twenty.length).toBe(40);
    expect(sanitizeNickname(twenty)).toEqual({ ok: true, value: twenty });
    expect(sanitizeNickname(twenty + '\u{1f600}')).toEqual({ ok: false, reason: 'too_long' });
  });

  it('enforces the 20 code point limit after normalisation', () => {
    expect(sanitizeNickname('a'.repeat(20))).toEqual({ ok: true, value: 'a'.repeat(20) });
    expect(sanitizeNickname('a'.repeat(21))).toEqual({ ok: false, reason: 'too_long' });
    // U+FDFA expands to 18 characters under NFKC.
    expect(sanitizeNickname('\ufdfa\ufdfa')).toEqual({ ok: false, reason: 'too_long' });
  });

  it('allows combining marks on a base character and counts them as code points', () => {
    expect(sanitizeNickname('a\u0308\u0323')).toEqual({ ok: true, value: '\u1ea1\u0308' });
    // 21 code points that cannot compose: too long even though only 11 look like letters
    const marks =
      'x\u0300\u0301\u0302\u0303\u0304\u0305\u0306\u0307\u0308\u0309\u030a\u030b\u030c\u030d\u030e\u030f\u0310\u0311\u0312\u0313';
    expect(Array.from(marks.normalize('NFKC')).length).toBeGreaterThan(20);
    expect(sanitizeNickname(marks)).toEqual({ ok: false, reason: 'too_long' });
  });

  it('rejects strings made only of combining marks', () => {
    expect(sanitizeNickname('\u0301\u0302')).toEqual({
      ok: false,
      reason: 'no_visible_characters',
    });
    expect(sanitizeNickname(' \u0301 ')).toEqual({ ok: false, reason: 'no_visible_characters' });
  });

  it('rejects very long input quickly', () => {
    expect(sanitizeNickname('a'.repeat(1_000_000))).toEqual({ ok: false, reason: 'too_long' });
    expect(sanitizeNickname(' '.repeat(1_000_000))).toEqual({ ok: false, reason: 'too_long' });
  });
});

describe('creaturePower', () => {
  it('is Attack plus a tenth of HP, rounded down', () => {
    expect(creaturePower({ atk: 28, hp: 112 })).toBe(39);
    expect(creaturePower({ atk: 28, hp: 119 })).toBe(39);
    expect(creaturePower({ atk: 28, hp: 120 })).toBe(40);
    expect(creaturePower({ atk: 1, hp: 9 })).toBe(1);
  });

  it('uses effective stats, so fusion and level count', () => {
    const splashet = content.creatures.find((c) => c.id === 'splashet');
    if (splashet === undefined) throw new Error('missing species');
    const plain = creaturePower(effectiveStats(splashet, 1, 0));
    expect(plain).toBe(28 + 11);
    expect(creaturePower(effectiveStats(splashet, 15, 0))).toBeGreaterThan(plain);
    expect(creaturePower(effectiveStats(splashet, 1, 5))).toBeGreaterThan(plain);
  });
});

describe('strongest', () => {
  const c = (id: string, power: number, caughtAt: number) => ({ id, power, caughtAt });

  it('ranks by power, then the older creature, then the smaller id', () => {
    const list = [c('d', 10, 5), c('c', 10, 5), c('b', 10, 1), c('a', 30, 9), c('e', 5, 0)];
    expect(strongest(list, 5).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('keeps only the asked number, does not depend on the input order and leaves the input alone', () => {
    const list = [c('x', 1, 1), c('y', 3, 2), c('z', 2, 3), c('w', 4, 4)];
    const reversed = [...list].reverse();
    expect(strongest(list, 3).map((x) => x.id)).toEqual(['w', 'y', 'z']);
    expect(strongest(reversed, 3).map((x) => x.id)).toEqual(['w', 'y', 'z']);
    expect(list.map((x) => x.id)).toEqual(['x', 'y', 'z', 'w']);
    expect(strongest(list, 0)).toEqual([]);
  });

  it('compareStrength is zero only for the same creature', () => {
    expect(compareStrength(c('a', 1, 1), c('a', 1, 1))).toBe(0);
    expect(compareStrength(c('a', 1, 1), c('b', 1, 1))).toBeLessThan(0);
  });
});
