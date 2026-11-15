import { describe, expect, it } from 'vitest';
import {
  completeSets,
  journalSetPages,
  knownBlueprints,
  stampsEarned,
  type HouseFeats,
  type HousingContent,
  type StampDef,
} from '../src/index';
import { clone, housingFixture } from './housing-fixture';

const base = housingFixture();

function withStamps(...unlocks: StampDef['unlock'][]): HousingContent {
  const c = clone(base);
  c.stamps = unlocks.map((unlock, i) => ({
    id: `s${String(i)}`,
    name: 'Stamp',
    unlock,
    line: 'x',
    hint: 'x',
  }));
  return c;
}

const feats = (over: Partial<HouseFeats> = {}): HouseFeats => ({
  journalPages: new Set(),
  stats: {},
  bossesBeaten: new Set(),
  dungeonDepth: 0,
  medals: { gold: 0, silver: 0, bronze: 0, pins: 0 },
  built: new Set(['hut']),
  setsComplete: 0,
  ...over,
});

describe('stampsEarned', () => {
  it('earns none of the starter or drop stamps, and nothing with no feats', () => {
    expect(stampsEarned(base, feats())).toEqual([]);
    expect(stampsEarned(base, feats({ stats: { places_visited: 99 } }))).toEqual(['wayfarer']);
  });

  it('a stat stamp needs the counter at the mark', () => {
    const c = withStamps({ kind: 'stat', stat: 'places_visited', at: 7 });
    expect(stampsEarned(c, feats({ stats: { places_visited: 6 } }))).toEqual([]);
    expect(stampsEarned(c, feats({ stats: { places_visited: 7 } }))).toEqual(['s0']);
    expect(stampsEarned(c, feats())).toEqual([]);
  });

  it('a journal-set stamp needs every page of the set', () => {
    const c = withStamps({ kind: 'journal-set', set: 'ledger' });
    const sets = journalSetPages([
      { id: 'a', set: 'ledger' },
      { id: 'b', set: 'ledger' },
      { id: 'c', set: 'other' },
    ]);
    expect(sets.get('ledger')).toEqual(['a', 'b']);
    expect(stampsEarned(c, feats({ journalPages: new Set(['a', 'c']) }), sets)).toEqual([]);
    expect(stampsEarned(c, feats({ journalPages: new Set(['a', 'b']) }), sets)).toEqual(['s0']);
    // Without the set table nothing can be earned.
    expect(stampsEarned(c, feats({ journalPages: new Set(['a', 'b']) }))).toEqual([]);
  });

  it('a boss stamp needs that boss beaten', () => {
    const c = withStamps({ kind: 'raid-boss', boss: 'colossus' });
    expect(stampsEarned(c, feats({ bossesBeaten: new Set(['other']) }))).toEqual([]);
    expect(stampsEarned(c, feats({ bossesBeaten: new Set(['colossus']) }))).toEqual(['s0']);
  });

  it('a depth stamp needs the depth', () => {
    const c = withStamps({ kind: 'dungeon-depth', at: 10 });
    expect(stampsEarned(c, feats({ dungeonDepth: 9 }))).toEqual([]);
    expect(stampsEarned(c, feats({ dungeonDepth: 10 }))).toEqual(['s0']);
  });

  it('a medal stamp needs the count of that medal', () => {
    const c = withStamps({ kind: 'games-medal', medal: 'gold', at: 1 });
    expect(stampsEarned(c, feats({ medals: { gold: 0, silver: 9, bronze: 9, pins: 9 } }))).toEqual(
      [],
    );
    expect(stampsEarned(c, feats({ medals: { gold: 1, silver: 0, bronze: 0, pins: 0 } }))).toEqual([
      's0',
    ]);
  });

  it('a house stamp needs the part built, or enough sets finished', () => {
    const c = withStamps(
      { kind: 'house-part', part: 'cottage' },
      { kind: 'house-sets', at: 2 },
      { kind: 'starter' },
      { kind: 'drop', moments: ['trip'] },
    );
    expect(stampsEarned(c, feats())).toEqual([]);
    expect(stampsEarned(c, feats({ built: new Set(['hut', 'cottage']) }))).toEqual(['s0']);
    expect(stampsEarned(c, feats({ setsComplete: 1 }))).toEqual([]);
    expect(stampsEarned(c, feats({ setsComplete: 2 }))).toEqual(['s1']);
  });
});

describe('knownBlueprints', () => {
  it('knows starters and ground skins from the start', () => {
    const known = knownBlueprints(base, new Set(), new Set(['hut']));
    expect([...known].sort()).toEqual(
      [
        'stool-plain',
        'lamp-plain',
        'curtains-plain',
        'thatch',
        'plaster',
        'plain-wall',
        'plain-floor',
        'lawn',
      ].sort(),
    );
  });

  it('adds what is learned and what a built part teaches', () => {
    const learned = new Set(['reef-bed']);
    const known = knownBlueprints(base, learned, new Set(['hut', 'cottage']));
    expect(known.has('reef-bed')).toBe(true);
    expect(known.has('slate')).toBe(true); // the cottage teaches it, and its unlock names it
    expect(known.has('reef-stool')).toBe(false);
    expect(knownBlueprints(base, learned, new Set(['hut'])).has('slate')).toBe(false);
    expect(learned.size).toBe(1);
  });
});

describe('completeSets', () => {
  const pieces = ['reef-bed', 'reef-stool', 'reef-lamp', 'reef-curtains'];

  it('is a set with every piece owned at least once', () => {
    expect(completeSets(base, new Map(pieces.map((p) => [p, 1])))).toEqual(['reef']);
    expect(completeSets(base, new Map([...pieces.map((p) => [p, 2] as const)]))).toEqual(['reef']);
  });

  it('is not complete with one piece missing or at zero', () => {
    expect(completeSets(base, new Map(pieces.slice(1).map((p) => [p, 1])))).toEqual([]);
    expect(completeSets(base, new Map(pieces.map((p, i) => [p, i === 0 ? 0 : 1])))).toEqual([]);
    expect(completeSets(base, new Map())).toEqual([]);
  });

  it('counts the starter set (tier 0) like any other', () => {
    const c = clone(base);
    c.sets.push({
      id: 'cosy',
      name: 'Cosy',
      element: null,
      tier: 0,
      primary: null,
      accent: null,
      sources: { moments: [], places: [], bosses: [] },
      keepsake: { name: 'Cushion', line: 'x' },
      theme: 'x',
      line: 'x',
    });
    for (const p of c.pieces) if (p.id.endsWith('-plain')) p.set = 'cosy';
    const owned = new Map(['stool-plain', 'lamp-plain', 'curtains-plain'].map((p) => [p, 1]));
    expect(completeSets(c, owned)).toEqual(['cosy']);
  });
});
