import { describe, expect, it } from 'vitest';
import {
  AGAINST_TYPE_ODDS,
  content,
  createSeededRng,
  loadLore,
  lore,
  pickQuirk,
  pickQuirkFrom,
  quirkText,
  type LorePack,
  type Rng,
} from '../src/index';
import speciesLoreJson from '../src/content/data/species-lore.json';
import bossesLoreJson from '../src/content/data/bosses-lore.json';
import quirksJson from '../src/content/data/quirks.json';

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function rawLore(): LorePack {
  return deepClone({
    species: speciesLoreJson,
    bosses: bossesLoreJson,
    quirks: quirksJson,
  }) as unknown as LorePack;
}

function mutate(fn: (raw: LorePack) => void): unknown {
  const raw = rawLore();
  fn(raw);
  return raw;
}

function scripted(values: number[]): Rng {
  let i = 0;
  return {
    nextU32() {
      const v = values[i++];
      if (v === undefined) throw new Error('script exhausted');
      return v;
    },
  };
}

/** Hue in degrees of a #rrggbb colour. */
function hueOf(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** Hue bands that read as each element's colours (spark is yellow and storm violet). */
const HUE_BANDS: Record<string, [number, number][]> = {
  tide: [[165, 240]],
  ember: [
    [0, 50],
    [345, 360],
  ],
  grove: [[70, 165]],
  spark: [
    [40, 70],
    [235, 300],
  ],
};

function inBand(element: string, hex: string): boolean {
  const hue = hueOf(hex);
  return (HUE_BANDS[element] ?? []).some(([lo, hi]) => hue >= lo && hue <= hi);
}

describe('shipped lore', () => {
  it('has an entry for every one of the 24 species, and nothing else', () => {
    expect(content.creatures).toHaveLength(24);
    expect(Object.keys(lore.species).sort()).toEqual(content.creatures.map((c) => c.id).sort());
    expect(Object.keys(lore.species)).toEqual(
      expect.arrayContaining(['lanternfin', 'hearthshell']),
    );
  });

  it('has an entry for every boss', () => {
    expect(Object.keys(lore.bosses).sort()).toEqual(content.bosses.map((b) => b.id).sort());
  });

  it('keeps descriptions, traits and quirks within their length limits', () => {
    for (const entry of [...Object.values(lore.species), ...Object.values(lore.bosses)]) {
      expect(entry.description.length).toBeLessThanOrEqual(220);
    }
    for (const entry of Object.values(lore.species)) {
      expect(entry.traits.length).toBeGreaterThanOrEqual(3);
      expect(entry.traits.length).toBeLessThanOrEqual(4);
      for (const trait of entry.traits) expect(trait.length).toBeLessThanOrEqual(60);
    }
    const all = [...lore.quirks.general, ...Object.values(lore.quirks.againstType).flat()];
    for (const q of all) expect(q.text.length).toBeLessThanOrEqual(60);
  });

  it('has a palette that matches the element of every species and boss', () => {
    const elementOf = new Map<string, string>([
      ...content.creatures.map((c) => [c.id, c.element] as const),
      ...content.bosses.map((b) => [b.id, b.element] as const),
    ]);
    for (const [id, entry] of [...Object.entries(lore.species), ...Object.entries(lore.bosses)]) {
      const element = elementOf.get(id) as string;
      const matching = entry.appearance.palette.filter((c) => inBand(element, c.hex));
      expect(
        matching.length,
        `${id} palette should hold at least 2 ${element} colours`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it('describes every stage-2 form as an evolution of its stage-1 form, and no one else', () => {
    for (const c of content.creatures) {
      const brief = lore.species[c.id]?.appearance;
      expect(brief?.fromStage1 !== undefined, c.id).toBe(c.stage === 2);
    }
  });

  it('makes an evolved form bigger than its stage-1 form', () => {
    const order = ['tiny', 'small', 'medium', 'large'];
    for (const c of content.creatures.filter((x) => x.evolvesTo !== undefined)) {
      const from = lore.species[c.id]?.appearance.size as string;
      for (const evolution of [c.evolvesTo, c.altEvolvesTo]) {
        if (evolution === undefined) continue;
        const to = lore.species[evolution.species]?.appearance.size as string;
        expect(order.indexOf(to), `${c.id} -> ${evolution.species}`).toBeGreaterThan(
          order.indexOf(from),
        );
      }
    }
  });

  it('has unique quirk ids that all resolve to text', () => {
    const all = [...lore.quirks.general, ...Object.values(lore.quirks.againstType).flat()];
    const ids = all.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(lore.quirks.general.length).toBeGreaterThanOrEqual(35);
    for (const q of all) expect(quirkText(q.id)).toBe(q.text);
    expect(quirkText('no-such-quirk')).toBeUndefined();
  });

  it('has 2 to 3 against-type quirks for every evolution line', () => {
    const lines = content.creatures.filter((c) => c.stage === 1).map((c) => c.line);
    expect(Object.keys(lore.quirks.againstType).sort()).toEqual([...lines].sort());
    for (const list of Object.values(lore.quirks.againstType)) {
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list.length).toBeLessThanOrEqual(3);
    }
  });
});

describe('loadLore rejects invalid lore', () => {
  it('loads the shipped data', () => {
    expect(() => loadLore(rawLore(), content)).not.toThrow();
  });

  it('a missing species or boss', () => {
    expect(() =>
      loadLore(
        mutate((r) => delete r.species['zipmouse']),
        content,
      ),
    ).toThrow(/species "zipmouse" has no entry/);
    expect(() =>
      loadLore(
        mutate((r) => delete r.species['hearthshell']),
        content,
      ),
    ).toThrow(/hearthshell/);
    expect(() =>
      loadLore(
        mutate((r) => delete r.bosses['thornmother']),
        content,
      ),
    ).toThrow(/boss "thornmother" has no entry/);
  });

  it('an entry for something that does not exist', () => {
    expect(() =>
      loadLore(
        mutate((r) => {
          r.species['ghost'] = deepClone(r.species['zipmouse']) as never;
        }),
        content,
      ),
    ).toThrow(/"ghost" matches nothing/);
  });

  it('text over the limits', () => {
    expect(() =>
      loadLore(
        mutate(
          (r) => ((r.species['cindle'] as { description: string }).description = 'x'.repeat(221)),
        ),
        content,
      ),
    ).toThrow(/schema/);
    expect(() =>
      loadLore(
        mutate((r) => ((r.species['cindle'] as { traits: string[] }).traits[0] = 'x'.repeat(61))),
        content,
      ),
    ).toThrow(/schema/);
    expect(() =>
      loadLore(
        mutate((r) => ((r.quirks.general[0] as { text: string }).text = 'x'.repeat(61))),
        content,
      ),
    ).toThrow(/schema/);
  });

  it('a bad palette, size or list length', () => {
    expect(() =>
      loadLore(
        mutate(
          (r) =>
            ((
              r.species['cindle'] as { appearance: { palette: { hex: string }[] } }
            ).appearance.palette[0]!.hex = 'orange'),
        ),
        content,
      ),
    ).toThrow(/schema/);
    expect(() =>
      loadLore(
        mutate(
          (r) =>
            ((r.species['cindle'] as { appearance: { size: string } }).appearance.size =
              'gigantic'),
        ),
        content,
      ),
    ).toThrow(/schema/);
    expect(() =>
      loadLore(
        mutate((r) => ((r.species['cindle'] as { traits: string[] }).traits = ['one', 'two'])),
        content,
      ),
    ).toThrow(/schema/);
    expect(() =>
      loadLore(
        mutate(
          (r) =>
            ((r.species['cindle'] as { appearance: { never: string[] } }).appearance.never = []),
        ),
        content,
      ),
    ).toThrow(/schema/);
  });

  it('unknown keys', () => {
    expect(() =>
      loadLore(
        mutate((r) => Object.assign(r.species['cindle'] as object, { extra: 1 })),
        content,
      ),
    ).toThrow(/schema/);
  });

  it('a stage-2 form without "fromStage1", or a stage-1 form with one', () => {
    expect(() =>
      loadLore(
        mutate(
          (r) =>
            delete (r.species['tidewing'] as { appearance: Record<string, unknown> }).appearance[
              'fromStage1'
            ],
        ),
        content,
      ),
    ).toThrow(/"tidewing" needs "fromStage1"/);
    expect(() =>
      loadLore(
        mutate((r) => {
          const tidewing = r.species['tidewing'] as { appearance: { fromStage1: unknown } };
          (r.species['splashet'] as { appearance: Record<string, unknown> }).appearance[
            'fromStage1'
          ] = tidewing.appearance.fromStage1;
        }),
        content,
      ),
    ).toThrow(/"splashet" must not have/);
  });

  it('a repeated quirk id, within the pool or across pools', () => {
    expect(() =>
      loadLore(
        mutate(
          (r) =>
            ((r.quirks.general[1] as { id: string }).id = (
              r.quirks.general[0] as { id: string }
            ).id),
        ),
        content,
      ),
    ).toThrow(/duplicate quirk id/);
    expect(() =>
      loadLore(
        mutate((r) => {
          const first = r.quirks.againstType['splashet']?.[0] as { id: string };
          first.id = (r.quirks.general[0] as { id: string }).id;
        }),
        content,
      ),
    ).toThrow(/duplicate quirk id/);
  });

  it('a line without against-type quirks, or with too few', () => {
    expect(() =>
      loadLore(
        mutate((r) => delete r.quirks.againstType['aurorix']),
        content,
      ),
    ).toThrow(/line "aurorix" has no entry/);
    expect(() =>
      loadLore(
        mutate((r) => ((r.quirks.againstType['aurorix'] as unknown[]).length = 1)),
        content,
      ),
    ).toThrow(/schema/);
  });
});

describe('pickQuirk', () => {
  it('is pure: the same seed gives the same quirk', () => {
    for (const species of ['splashet', 'tidewing', 'hearthshell']) {
      expect(pickQuirk(species, createSeededRng('quirk-1'))).toBe(
        pickQuirk(species, createSeededRng('quirk-1')),
      );
    }
  });

  it('draws against type on a low first roll and from the general pool otherwise', () => {
    // chance(rng, 1, 4) is int(rng, 4) < 1, so a first draw of 0 is against type, 1 is not.
    const against = lore.quirks.againstType['cindle'] ?? [];
    expect(pickQuirk('cindle', scripted([0, 0]))).toBe(against[0]?.id);
    expect(pickQuirk('cindle', scripted([0, 2]))).toBe(against[2]?.id);
    expect(pickQuirk('cindle', scripted([1, 0]))).toBe(lore.quirks.general[0]?.id);
    const last = lore.quirks.general.length - 1;
    expect(pickQuirk('cindle', scripted([1, last]))).toBe(lore.quirks.general[last]?.id);
  });

  it('is about 25% against type, and the rest from the general pool', () => {
    const rng = createSeededRng('quirk-odds');
    const species = 'zipmouse';
    const againstIds = new Set((lore.quirks.againstType[species] ?? []).map((q) => q.id));
    const generalIds = new Set(lore.quirks.general.map((q) => q.id));
    const n = 8000;
    let against = 0;
    for (let i = 0; i < n; i++) {
      const id = pickQuirk(species, rng);
      if (againstIds.has(id)) against++;
      else expect(generalIds.has(id)).toBe(true);
    }
    const expected = (n * AGAINST_TYPE_ODDS.numerator) / AGAINST_TYPE_ODDS.denominator;
    // Six standard deviations of a binomial: about 160 draws.
    expect(Math.abs(against - expected)).toBeLessThan(160);
  });

  it('reaches every general quirk and every against-type quirk of a species', () => {
    const rng = createSeededRng('quirk-coverage');
    const seen = new Set<string>();
    for (let i = 0; i < 4000; i++) seen.add(pickQuirk('mossback', rng));
    for (const q of lore.quirks.general) expect(seen.has(q.id), q.id).toBe(true);
    for (const q of lore.quirks.againstType['mossback'] ?? []) expect(seen.has(q.id)).toBe(true);
  });

  it("uses the line of an evolved form, and never another species' against-type quirks", () => {
    const rng = createSeededRng('quirk-line');
    const own = new Set((lore.quirks.againstType['splashet'] ?? []).map((q) => q.id));
    const others = new Set(
      Object.entries(lore.quirks.againstType)
        .filter(([line]) => line !== 'splashet')
        .flatMap(([, list]) => list.map((q) => q.id)),
    );
    let ownSeen = 0;
    for (let i = 0; i < 400; i++) {
      const id = pickQuirk('tidewing', rng);
      expect(others.has(id)).toBe(false);
      if (own.has(id)) ownSeen++;
    }
    expect(ownSeen).toBeGreaterThan(0);
  });

  it('falls back to the general pool for an unknown species, and for a line without quirks', () => {
    const general = new Set(lore.quirks.general.map((q) => q.id));
    const rng = createSeededRng('quirk-unknown');
    for (let i = 0; i < 200; i++) expect(general.has(pickQuirk('no-such-species', rng))).toBe(true);
    const pool = { general: lore.quirks.general, againstType: {} };
    expect(general.has(pickQuirkFrom(pool, 'cindle', scripted([0, 0])))).toBe(true);
  });
});
