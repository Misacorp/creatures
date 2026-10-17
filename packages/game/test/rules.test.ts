import { describe, expect, it } from 'vitest';
import {
  RULES,
  applyCatchToCollection,
  fuseOnce,
  compareStrength,
  content,
  creaturePower,
  createSeededRng,
  effectiveStats,
  expeditionCost,
  fusionBonusBp,
  recallCatches,
  rollCatch,
  rollCatches,
  sanitizeNickname,
  strongest,
  type CatchContext,
  type DurationId,
  type Element,
  type Rarity,
  type Rng,
  type SuppliesId,
} from '../src/index';

function baseCtx(overrides: Partial<CatchContext> = {}): CatchContext {
  return {
    content,
    supplies: 'basic',
    explorerElement: 'spark',
    ownedLines: new Set(),
    dupeStreak: 0,
    zipmouseGuarantee: false,
    ...overrides,
  };
}

const catchableLines = content.creatures.filter((c) => c.catchable).map((c) => c.line);

describe('expedition config', () => {
  it('has the documented durations, rolls and costs', () => {
    const d = RULES.expedition.durations;
    expect([d.short.ms, d.medium.ms, d.long.ms]).toEqual([3_600_000, 21_600_000, 43_200_000]);
    expect([d.short.rolls, d.medium.rolls, d.long.rolls]).toEqual([1, 2, 3]);
    expect(expeditionCost('short', 'basic')).toBe(10);
    expect(expeditionCost('medium', 'good')).toBe(50);
    expect(expeditionCost('long', 'great')).toBe(150);
  });

  it('has odds that sum to 10000 basis points', () => {
    for (const s of Object.values(RULES.expedition.supplies)) {
      expect(s.oddsBp.common + s.oddsBp.rare + s.oddsBp.epic).toBe(10_000);
    }
  });
});

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

describe('rollCatch', () => {
  it('matches the rarity odds in basis points for every supply level', () => {
    for (const supplies of ['basic', 'good', 'great'] as SuppliesId[]) {
      const rng = createSeededRng(`odds-${supplies}`);
      const draws = 100_000;
      const counts: Record<Rarity, number> = { common: 0, rare: 0, epic: 0 };
      for (let i = 0; i < draws; i++) {
        counts[rollCatch(rng, baseCtx({ supplies })).result.species.rarity]++;
      }
      const odds = RULES.expedition.supplies[supplies].oddsBp;
      for (const rarity of ['common', 'rare', 'epic'] as Rarity[]) {
        const expected = odds[rarity] / 10_000;
        // 0.8 percentage points is at least 5 standard deviations at 100k draws.
        expect(Math.abs(counts[rarity] / draws - expected)).toBeLessThan(0.008);
      }
    }
  });

  it('only returns catchable stage-1 species', () => {
    const rng = createSeededRng('catchable');
    for (let i = 0; i < 2000; i++) {
      const { species } = rollCatch(rng, baseCtx({ supplies: 'great' })).result;
      expect(species.catchable).toBe(true);
      expect(species.stage).toBe(1);
    }
  });

  it('makes species of the explorer element twice as likely within a rarity', () => {
    const rng = createSeededRng('affinity');
    const counts = new Map<string, number>();
    for (let i = 0; i < 100_000; i++) {
      const { species } = rollCatch(rng, baseCtx({ explorerElement: 'tide' })).result;
      if (species.rarity === 'common') counts.set(species.id, (counts.get(species.id) ?? 0) + 1);
    }
    const commons = content.creatures.filter((c) => c.catchable && c.rarity === 'common');
    const avg = (element: Element, same: boolean) => {
      const ids = commons.filter((c) => (c.element === element) === same);
      return ids.reduce((sum, c) => sum + (counts.get(c.id) ?? 0), 0) / ids.length;
    };
    const ratio = avg('tide', true) / avg('tide', false);
    expect(ratio).toBeGreaterThan(1.9);
    expect(ratio).toBeLessThan(2.1);
  });

  it('weighs all species equally when no species has the explorer element', () => {
    // Rare epic lines exist for tide, grove, spark and ember, so check rare/ember: no rare is ember.
    const rng = createSeededRng('no-affinity');
    const counts = new Map<string, number>();
    for (let i = 0; i < 100_000; i++) {
      const { species } = rollCatch(
        rng,
        baseCtx({ explorerElement: 'ember', supplies: 'great' }),
      ).result;
      if (species.rarity === 'rare') counts.set(species.id, (counts.get(species.id) ?? 0) + 1);
    }
    const values = [...counts.values()];
    expect(values).toHaveLength(3);
    expect(Math.max(...values) / Math.min(...values)).toBeLessThan(1.1);
  });

  describe('dupe shield', () => {
    // The player owns every catchable line except zipmouse, the only unowned common.
    const owned = new Set(catchableLines.filter((l) => l !== 'zipmouse'));

    function commonsAt(streak: number, draws: number) {
      const rng = createSeededRng(`shield-${streak}`);
      const picked: string[] = [];
      for (let i = 0; i < draws; i++) {
        const roll = rollCatch(
          rng,
          baseCtx({ ownedLines: owned, dupeStreak: streak, explorerElement: 'tide' }),
        );
        if (roll.result.species.rarity === 'common') picked.push(roll.result.species.id);
      }
      return picked;
    }

    it('does not trigger one below the shield streak', () => {
      const picked = commonsAt(RULES.catching.dupeShieldStreak - 1, 2000);
      expect(picked.some((id) => id !== 'zipmouse')).toBe(true);
    });

    it('triggers at the shield streak and above', () => {
      const at = RULES.catching.dupeShieldStreak;
      for (const streak of [at, at + 1, at + 16]) {
        const picked = commonsAt(streak, 2000);
        expect(picked.length).toBeGreaterThan(1000);
        expect(picked.every((id) => id === 'zipmouse')).toBe(true);
      }
    });

    it('falls back to normal rules when every species of the rarity is owned', () => {
      const rng = createSeededRng('shield-all-owned');
      const ownedAll = new Set(catchableLines);
      const seen = new Set<string>();
      for (let i = 0; i < 500; i++) {
        const roll = rollCatch(rng, baseCtx({ ownedLines: ownedAll, dupeStreak: 9 }));
        expect(roll.result.duplicate).toBe(true);
        expect(roll.dupeStreak).toBe(10);
        seen.add(roll.result.species.id);
      }
      expect(seen.size).toBeGreaterThan(3);
    });

    it('tracks the streak: duplicates add one, a new species resets to 0', () => {
      const rng = createSeededRng('streak');
      const dupe = rollCatch(rng, baseCtx({ ownedLines: new Set(catchableLines), dupeStreak: 2 }));
      expect(dupe.result.duplicate).toBe(true);
      expect(dupe.dupeStreak).toBe(3);
      const fresh = rollCatch(rng, baseCtx({ ownedLines: new Set(), dupeStreak: 3 }));
      expect(fresh.result.duplicate).toBe(false);
      expect(fresh.dupeStreak).toBe(0);
    });
  });

  describe('first-expedition guarantee', () => {
    it('always returns zipmouse as a new species and resets the streak', () => {
      const rng = createSeededRng('guarantee');
      for (let i = 0; i < 200; i++) {
        const roll = rollCatch(rng, baseCtx({ zipmouseGuarantee: true, dupeStreak: 3 }));
        expect(roll.result.species.id).toBe('zipmouse');
        expect(roll.result.duplicate).toBe(false);
        expect(roll.dupeStreak).toBe(0);
      }
    });

    it('applies to the first roll of the first claim only', () => {
      for (let i = 0; i < 50; i++) {
        const rng = createSeededRng(`first-${i}`);
        const { results } = rollCatches(rng, 3, {
          content,
          supplies: 'basic',
          explorerElement: 'tide',
          ownedLines: new Set(['splashet']),
          dupeStreak: 0,
          firstExpedition: true,
        });
        expect(results).toHaveLength(3);
        expect(results[0]?.species.id).toBe('zipmouse');
      }
      // The later rolls are normal rolls, so across many claims they are not always zipmouse.
      const rng = createSeededRng('first-later');
      const later = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const { results } = rollCatches(rng, 3, {
          content,
          supplies: 'basic',
          explorerElement: 'tide',
          ownedLines: new Set(['splashet']),
          dupeStreak: 0,
          firstExpedition: true,
        });
        later.add(results[1]?.species.id ?? '');
      }
      expect(later.size).toBeGreaterThan(1);
    });

    it('does not apply when it is not the first expedition or zipmouse is owned', () => {
      const notFirst = new Set<string>();
      const owned = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const rng = createSeededRng(`not-first-${i}`);
        const ctx = {
          content,
          supplies: 'basic' as const,
          explorerElement: 'tide' as const,
          dupeStreak: 0,
        };
        notFirst.add(
          rollCatches(rng, 1, { ...ctx, ownedLines: new Set(), firstExpedition: false }).results[0]
            ?.species.id ?? '',
        );
        owned.add(
          rollCatches(rng, 1, { ...ctx, ownedLines: new Set(['zipmouse']), firstExpedition: true })
            .results[0]?.species.id ?? '',
        );
      }
      expect(notFirst.size).toBeGreaterThan(1);
      expect(owned.size).toBeGreaterThan(1);
    });
  });

  describe('rollCatches', () => {
    it('carries owned lines and the dupe streak between rolls', () => {
      const rng = createSeededRng('carry');
      const out = rollCatches(rng, 40, {
        content,
        supplies: 'great',
        explorerElement: 'grove',
        ownedLines: new Set(),
        dupeStreak: 0,
        firstExpedition: false,
      });
      const seen = new Set<string>();
      let streak = 0;
      for (const r of out.results) {
        expect(r.duplicate).toBe(seen.has(r.species.line));
        streak = r.duplicate ? streak + 1 : 0;
        seen.add(r.species.line);
      }
      expect(out.dupeStreak).toBe(streak);
    });

    it('rejects a bad count', () => {
      const ctx = { ...baseCtx(), firstExpedition: false };
      expect(() => rollCatches(createSeededRng('x'), -1, ctx)).toThrow(RangeError);
      expect(rollCatches(createSeededRng('x'), 0, ctx).results).toEqual([]);
    });
  });

  describe('shiny', () => {
    it('is 1 in 500 over 1M seeded rolls', () => {
      const rng = createSeededRng('shiny-rate');
      const ctx = baseCtx({ ownedLines: new Set(catchableLines) });
      const draws = 1_000_000;
      let shinies = 0;
      for (let i = 0; i < draws; i++) {
        if (rollCatch(rng, ctx).result.shiny) shinies++;
      }
      // Expected 2000, sd about 45: allow 6 sd.
      expect(Math.abs(shinies - draws / 500)).toBeLessThan(270);
    });

    it('is decided exactly at the boundary with a scripted rng', () => {
      // Guaranteed zipmouse consumes no draws before the shiny draw.
      const scripted = (v: number): Rng => ({ nextU32: () => v });
      expect(rollCatch(scripted(0), baseCtx({ zipmouseGuarantee: true })).result.shiny).toBe(true);
      expect(rollCatch(scripted(1), baseCtx({ zipmouseGuarantee: true })).result.shiny).toBe(false);
    });
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

  it('steps a fusion one at a time up to 5, then offers none', () => {
    let count = 0;
    for (let n = 1; n <= 5; n++) {
      const next = fuseOnce(count);
      expect(next).toBe(n);
      count = next as number;
    }
    expect(fuseOnce(5)).toBeNull();
    expect(() => fuseOnce(-1)).toThrow(RangeError);
    expect(() => fuseOnce(1.5)).toThrow(RangeError);
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

// Keep the type imports honest.
const _durations: DurationId[] = ['short', 'medium', 'long'];
void _durations;
