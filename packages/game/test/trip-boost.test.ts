import { describe, expect, it } from 'vitest';
import {
  BOOST_BRACKETS,
  BOOST_CATEGORIES,
  BOOST_FLOOR_BP,
  boostLevel,
  boostWords,
  destinationDef,
  expectedTrip,
  expeditionContent,
  kitOf,
  RULES,
  referenceBoost,
  REFERENCE_TRIP,
  tripBoost,
  TRIPLE_FROM_BP,
  type DestinationDef,
  type ExpeditionLength,
  type TripBoostInput,
} from '../src';

function emberCaves(): DestinationDef {
  const found = destinationDef('ember-caves');
  if (found === undefined) throw new Error('no ember-caves');
  return found;
}
const place = emberCaves();

function boostOf(
  length: ExpeditionLength,
  kitIds: string[],
  extra: Partial<Omit<TripBoostInput, 'place' | 'kit' | 'length'>> = {},
) {
  return tripBoost({
    length,
    kit: kitOf(kitIds),
    place,
    role: 'payoff',
    stars: 0,
    twist: null,
    ...extra,
  });
}

describe('the boost brackets', () => {
  it('puts a relative boost in its bracket, at the edges', () => {
    expect(boostLevel(0)).toBe(0);
    expect(boostLevel(BOOST_FLOOR_BP / 10_000 - 0.0001)).toBe(0);
    expect(boostLevel(BOOST_FLOOR_BP / 10_000)).toBe(1);
    expect(boostLevel(0.2499)).toBe(1);
    expect(boostLevel(0.25)).toBe(2);
    expect(boostLevel(0.5999)).toBe(2);
    expect(boostLevel(0.6)).toBe(3);
    expect(boostLevel(0.9999)).toBe(3);
    expect(boostLevel(1)).toBe(4);
    expect(boostLevel(14)).toBe(4);
    expect(boostLevel(Infinity)).toBe(4);
  });

  it('says each bracket in words without a digit', () => {
    expect(BOOST_BRACKETS.map((b) => b.words)).toEqual([
      'slightly more',
      'more',
      'a lot more',
      'at least double',
    ]);
    expect(boostWords(0)).toBe('');
    for (const b of BOOST_BRACKETS) expect(b.words).not.toMatch(/[\d%]/);
  });
});

describe('the boost of a kit on a trip', () => {
  it('is exactly the ratio of the expected hauls with and without the kit', () => {
    const input = {
      length: 'long',
      place,
      role: 'payoff',
      stars: 0,
      twist: null,
      milestonePartsBp: 0,
      milestoneRarityBp: 0,
      gearPartsBp: 0,
      weatherPartsBp: 0,
      ownedShare: 0.5,
      newSpeciesWorth: 0,
    } as const;
    const plain = expectedTrip({ ...input, kit: [] });
    const lured = expectedTrip({ ...input, kit: kitOf(['lure-good']) });
    const boost = boostOf('long', ['lure-good']);
    expect(boost.creatures).toBeCloseTo(lured.creatures / plain.creatures - 1, 12);
    expect(boost.newSpecies).toBeCloseTo(lured.newSpecies / plain.newSpecies - 1, 12);
    const w = RULES.expeditions.worth;
    const partsOf = (e: typeof plain) =>
      e.scrap * w.scrap + e.shards * w.shard + e.glimmer * w.glimmer;
    const satchel = expectedTrip({ ...input, kit: kitOf(['satchel-good']) });
    expect(boostOf('long', ['satchel-good']).parts).toBeCloseTo(
      partsOf(satchel) / partsOf(plain) - 1,
      12,
    );
  });

  it('is nothing for an empty kit', () => {
    for (const c of BOOST_CATEGORIES) expect(boostOf('long', [])[c]).toBe(0);
  });

  it('puts a Small Satchel at least double on parts on 2 h and "more" on 12 h', () => {
    expect(boostLevel(boostOf('short', ['satchel-basic']).parts)).toBe(4);
    expect(boostLevel(boostOf('long', ['satchel-basic']).parts)).toBe(2);
  });

  it('has a map raise every category', () => {
    for (const length of ['short', 'long'] as const) {
      const boost = boostOf(length, ['map-scrap-good']);
      for (const c of ['creatures', 'newSpecies', 'parts', 'gear', 'xp'] as const) {
        expect(boost[c], `${length} ${c}`).toBeGreaterThan(0);
      }
    }
  });

  it('raises the deeper creatures with a lantern and the new species and creatures with a lure', () => {
    const lantern = boostOf('long', ['lantern-good']);
    expect(lantern.deepCreatures).toBeGreaterThan(0);
    expect(lantern.parts).toBe(0);
    const lure = boostOf('long', ['lure-good']);
    expect(lure.newSpecies).toBeGreaterThan(lure.creatures);
    expect(lure.deepCreatures).toBe(0);
  });

  it('gives a better tier at least as much on every category and every length', () => {
    for (const kind of ['lure', 'map-scrap', 'lantern', 'satchel'] as const) {
      const tiers = expeditionContent.supplies.filter((s) => s.kind === kind).map((s) => s.id);
      for (const length of ['short', 'medium', 'long', 'day'] as const) {
        let last = boostOf(length, []);
        for (const id of tiers) {
          const next = boostOf(length, [id]);
          for (const c of BOOST_CATEGORIES)
            expect(next[c], `${id} ${length} ${c}`).toBeGreaterThanOrEqual(last[c]);
          last = next;
        }
      }
    }
  });

  it('shrinks with the length: the same supply is worth less on a longer trip', () => {
    expect(boostOf('short', ['lure-basic']).creatures).toBeGreaterThan(
      boostOf('long', ['lure-basic']).creatures,
    );
  });

  it('follows the explorer and the twist (a Guard already finds more parts, so a satchel adds relatively less)', () => {
    const payoff = boostOf('long', ['satchel-basic']).parts;
    const guard = boostOf('long', ['satchel-basic'], { role: 'guard' }).parts;
    expect(guard).toBeLessThan(payoff);
    const rolls = boostOf('long', ['lure-basic'], { twist: { kind: 'rolls', extra: 5 } }).creatures;
    expect(rolls).toBeLessThan(boostOf('long', ['lure-basic']).creatures);
  });
});

describe('the supply blurbs are anchored to the reference trip', () => {
  /** The words a blurb may use per bracket (lanterns speak of chance). Each is checked as a whole phrase. */
  const WORDS: Record<'creature' | 'lantern', Record<1 | 2 | 3 | 4, readonly string[]>> = {
    creature: {
      1: ['slightly more'],
      2: ['more'],
      3: ['many more', 'much more'],
      4: ['double', 'at least double'],
    },
    lantern: {
      1: ['a slight chance'],
      2: ['a fair chance'],
      3: ['a strong chance'],
      4: ['a very strong chance'],
    },
  };

  /** Bracket 4 says "triple" from TRIPLE_FROM_BP and "double" below it. */
  const phrasesOf = (kind: string, level: 1 | 2 | 3 | 4, bp = 0) =>
    level === 4 && kind !== 'lantern'
      ? bp >= TRIPLE_FROM_BP
        ? ['triple']
        : ['double', 'at least double']
      : WORDS[kind === 'lantern' ? 'lantern' : 'creature'][level];

  const allPhrases = (kind: string) =>
    [...([1, 2, 3, 4] as const).flatMap((l) => phrasesOf(kind, l)), 'triple'].sort(
      (a, b) => b.length - a.length,
    );

  it('names the reference trip: 12 hours at the economy study place, a payoff, no stars', () => {
    expect(REFERENCE_TRIP).toEqual({
      length: 'long',
      placeId: 'ember-caves',
      role: 'payoff',
      stars: 0,
    });
  });

  it('opens each blurb with the strength word of its bracket on that trip, and no other', () => {
    for (const s of expeditionContent.supplies) {
      if (s.kind === 'map-scrap') continue; // the documented exception, below
      const level = boostLevel(referenceBoost(s));
      expect(level, `${s.id} is visible on the reference trip`).toBeGreaterThan(0);
      const blurb = s.blurb.toLowerCase();
      const own = phrasesOf(s.kind, level as 1 | 2 | 3 | 4, referenceBoost(s) * 10_000);
      // The blurb starts with the phrase (after an optional "A good route: " style lead).
      const lead = blurb.replace(/^[^:]*: /, '');
      const used = own.find((p) => lead.startsWith(p) || lead.startsWith(`a ${p}`));
      expect(used, `${s.id} (bracket ${String(level)}): "${s.blurb}"`).toBeDefined();
      // Nothing else in it names a different bracket ("more" alone and "double" are parts of other phrases).
      const rest = lead.replace(used ?? '', '');
      for (const p of allPhrases(s.kind)) {
        if (p === 'more' || p === 'double' || p === 'triple' || p === 'at least double') continue;
        expect(rest.includes(p), `${s.id}: "${p}" in "${s.blurb}"`).toBe(false);
      }
    }
  });

  it('says triple only from +200% and double below it', () => {
    const word = (id: string) => {
      const s = expeditionContent.supplies.find((x) => x.id === id);
      if (s === undefined) throw new Error(id);
      return { bp: referenceBoost(s) * 10_000, blurb: s.blurb.toLowerCase() };
    };
    const sturdy = word('satchel-good');
    expect(sturdy.bp).toBeGreaterThanOrEqual(10_000);
    expect(sturdy.bp).toBeLessThan(TRIPLE_FROM_BP);
    expect(sturdy.blurb).toMatch(/^double /);
    const pack = word('satchel-great');
    expect(pack.bp).toBeGreaterThanOrEqual(TRIPLE_FROM_BP);
    expect(pack.blurb).toMatch(/^triple /);
  });

  it('promises glimmer only as a chance unless the satchel always gives it', () => {
    for (const s of expeditionContent.supplies) {
      if (s.kind !== 'satchel' || !/glimmer/i.test(s.blurb)) continue;
      if (s.glimmerBp >= 10_000) continue;
      expect(s.blurb.toLowerCase(), s.id).toMatch(/chance of glimmer/);
    }
  });

  it('words maps relative to each other (the one exception to the brackets), never a longer trip', () => {
    const maps = expeditionContent.supplies.filter((s) => s.kind === 'map-scrap');
    const boosts = maps.map((s) => referenceBoost(s));
    for (let i = 1; i < boosts.length; i++) expect(boosts[i]).toBeGreaterThan(boosts[i - 1] ?? 0);
    const ladder = ['a bit more', 'more', 'much more'];
    expect(maps).toHaveLength(ladder.length);
    maps.forEach((s, i) => {
      const lead = s.blurb.toLowerCase().replace(/^[^:]*: /, '');
      expect(lead, s.id).toMatch(new RegExp(`^${ladder[i] ?? ''} of everything$`));
      expect(s.blurb.toLowerCase(), s.id).not.toMatch(/longer|hours|time/);
    });
  });

  it('reads as rising within a kind: a better tier is never in a lower bracket', () => {
    for (const kind of ['lure', 'map-scrap', 'lantern', 'satchel'] as const) {
      const levels = expeditionContent.supplies
        .filter((s) => s.kind === kind)
        .map((s) => boostLevel(referenceBoost(s)));
      expect(
        [...levels].sort((a, b) => a - b),
        kind,
      ).toEqual(levels);
    }
  });
});
