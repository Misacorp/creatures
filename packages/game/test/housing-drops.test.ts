import { describe, expect, it } from 'vitest';
import {
  createSeededRng,
  rollHouseDrops,
  type HouseDrop,
  type HousingContent,
  type HousingMoment,
} from '../src/index';
import { clone, housingFixture } from './housing-fixture';

const content = housingFixture();
const none = { blueprints: new Set<string>(), stamps: new Set<string>() };

function many(
  n: number,
  moment: HousingMoment,
  known = none,
  c: HousingContent = content,
): HouseDrop[] {
  const rng = createSeededRng(`housing-drops-${moment.kind}`);
  return Array.from({ length: n }, () => rollHouseDrops(rng, c, moment, known));
}

const total = (d: HouseDrop): number => Object.values(d.materials).reduce((a, b) => a + b, 0);
const trip = (ticks: number, place = 'reef'): HousingMoment => ({
  kind: 'trip',
  key: 'k',
  place,
  element: null,
  ticks,
});
const raid = (
  cleared: boolean,
  extra: Partial<{ festival: string | null; element: 'tide' | 'ember' | null }> = {},
): HousingMoment => ({
  kind: 'raid',
  key: 'k',
  weekId: 'w1',
  bossId: 'colossus',
  rank: 1,
  cleared,
  festival: null,
  ...extra,
});

/** The fixture with the raid bonus material and the Festival set added (a loaded copy, not through the loader). */
function festive(): HousingContent {
  const c = clone(content);
  const base = { family: 'metal' as const, rare: true, places: [], line: 'x', hint: 'x' };
  c.materials.push(
    { id: 'old-gold', element: null, fights: ['raid'], ...base },
    { id: 'lantern-silk', element: null, fights: ['festival', 'games'], ...base, family: 'cloth' },
  );
  c.sets.push({
    id: 'lantern-night',
    name: 'Lantern Night',
    element: null,
    tier: 2,
    primary: { family: 'cloth' },
    accent: null,
    sources: { moments: ['games'], places: [], bosses: [] },
    keepsake: { name: 'Lantern', line: 'x' },
    theme: 'x',
    line: 'x',
  });
  c.pieces.push({
    id: 'lantern-lamp',
    name: 'Lantern Lamp',
    form: 'lamp',
    set: 'lantern-night',
    unlock: { kind: 'drop' },
    line: 'x',
    hint: 'x',
  });
  return c;
}

describe('rollHouseDrops: materials', () => {
  it('is deterministic for a seed', () => {
    const a = rollHouseDrops(createSeededRng('s'), content, trip(9), none);
    const b = rollHouseDrops(createSeededRng('s'), content, trip(9), none);
    expect(a).toEqual(b);
  });

  it('a trip rolls 1 + ticks/3 times at 40% and only brings the place materials', () => {
    const drops = many(1500, trip(7)); // 1 + 2 = 3 rolls
    expect(Math.max(...drops.map(total))).toBeLessThanOrEqual(3);
    const mean = drops.reduce((n, d) => n + total(d), 0) / drops.length;
    expect(mean).toBeGreaterThan(1.05); // 3 x 0.4 = 1.2
    expect(mean).toBeLessThan(1.35);
    for (const d of drops)
      for (const id of Object.keys(d.materials)) expect(['oak', 'opal']).toContain(id);
    const one = many(1500, trip(2)); // 1 roll
    expect(Math.max(...one.map(total))).toBe(1);
  });

  it('draws a rare material at a quarter of a common one', () => {
    const drops = many(4000, trip(0));
    const oak = drops.filter((d) => d.materials['oak'] === 1).length;
    const opal = drops.filter((d) => d.materials['opal'] === 1).length;
    expect(oak / opal).toBeGreaterThan(3.2);
    expect(oak / opal).toBeLessThan(4.9);
  });

  it('brings nothing where nothing drops', () => {
    for (const d of many(300, trip(30, 'nowhere'))) {
      expect(d.materials).toEqual({});
      expect(d.blueprint).toBeNull();
    }
  });

  it('a scout rolls 1 + finds at 30%', () => {
    const drops = many(1500, { kind: 'scout', key: 'k', place: 'reef', element: null, finds: 3 });
    expect(Math.max(...drops.map(total))).toBeLessThanOrEqual(4);
    const mean = drops.reduce((n, d) => n + total(d), 0) / drops.length;
    expect(mean).toBeGreaterThan(1.05); // 4 x 0.3 = 1.2
    expect(mean).toBeLessThan(1.35);
  });

  it('a dungeon run brings dungeon materials, one more roll when cleared', () => {
    const lost = many(800, { kind: 'dungeon', key: 'k', depth: 10, cleared: false }); // 3 rolls
    const won = many(800, { kind: 'dungeon', key: 'k', depth: 10, cleared: true }); // 4 rolls
    expect(Math.max(...lost.map(total))).toBeLessThanOrEqual(3);
    expect(Math.max(...won.map(total))).toBe(4);
    for (const d of won) for (const id of Object.keys(d.materials)) expect(id).toBe('oak');
  });

  it('a cleared raid finale brings exactly three materials of the boss element, a lost one brings one', () => {
    for (const d of many(100, raid(true))) expect(total(d)).toBe(3);
    for (const d of many(100, raid(false))) expect(total(d)).toBe(1);
    // Another element has no materials in the fixture.
    for (const d of many(50, raid(true, { element: 'ember' }))) expect(total(d)).toBe(0);
  });

  it('a cleared raid also rolls Old Gold, a Festival finale adds Lantern Silk', () => {
    const c = festive();
    const plain = many(1500, raid(true), none, c);
    const gold = plain.filter((d) => d.materials['old-gold'] === 1).length;
    expect(gold / plain.length).toBeGreaterThan(0.2);
    expect(gold / plain.length).toBeLessThan(0.3);
    expect(many(50, raid(false), none, c).every((d) => d.materials['old-gold'] === undefined)).toBe(
      true,
    );
    for (const d of many(50, raid(true, { festival: 'sprite' }), none, c)) {
      expect(d.materials['lantern-silk']).toBe(2);
    }
    for (const d of many(50, raid(true), none, c))
      expect(d.materials['lantern-silk']).toBeUndefined();
    for (const d of many(50, raid(false, { festival: 'sprite' }), none, c)) {
      expect(d.materials['lantern-silk']).toBeUndefined();
    }
  });

  it('a Games medal brings a games material by medal: gold always, silver 60%, bronze 30%', () => {
    const rate = (medal: 'gold' | 'silver' | 'bronze' | null): number => {
      const drops = many(2000, { kind: 'games', key: 'k', medal });
      for (const d of drops) for (const id of Object.keys(d.materials)) expect(id).toBe('opal');
      return drops.filter((d) => total(d) === 1).length / drops.length;
    };
    expect(rate('gold')).toBe(1);
    expect(rate('silver')).toBeGreaterThan(0.55);
    expect(rate('silver')).toBeLessThan(0.65);
    expect(rate('bronze')).toBeGreaterThan(0.25);
    expect(rate('bronze')).toBeLessThan(0.35);
    expect(rate(null)).toBe(0);
  });
});

describe('rollHouseDrops: blueprints and stamps', () => {
  it('a blueprint matches the moment sources and is never one the player knows', () => {
    const drops = many(4000, trip(0)).filter((d) => d.blueprint !== null);
    expect(drops.length).toBeGreaterThan(60); // about 3% of 4000
    const seen = new Set(drops.map((d) => d.blueprint));
    // At the reef a trip may bring the reef set (pieces and its wallpaper) or the hammock; nothing else.
    expect([...seen].sort()).toEqual(
      ['hammock', 'reef-bed', 'reef-curtains', 'reef-lamp', 'reef-stool', 'reef-wall'].sort(),
    );
    const known = {
      blueprints: new Set(['hammock', 'reef-bed', 'reef-curtains', 'reef-lamp', 'reef-stool']),
      stamps: new Set<string>(),
    };
    const rest = many(4000, trip(0), known).filter((d) => d.blueprint !== null);
    expect(rest.length).toBeGreaterThan(0);
    expect(rest.every((d) => d.blueprint === 'reef-wall')).toBe(true);
    const all = { ...known, blueprints: new Set([...known.blueprints, 'reef-wall']) };
    expect(many(2000, trip(0), all).every((d) => d.blueprint === null)).toBe(true);
  });

  it('feat, starter and part blueprints never drop, and a place outside the sources brings none', () => {
    const ids = new Set(many(4000, trip(0)).map((d) => d.blueprint));
    for (const id of ['globe', 'stool-plain', 'slate']) expect(ids.has(id)).toBe(false);
    expect(many(2000, trip(0, 'nowhere')).every((d) => d.blueprint === null)).toBe(true);
  });

  it('a raid blueprint needs a clear and the boss to match', () => {
    expect(many(1000, raid(false)).every((d) => d.blueprint === null)).toBe(true);
    const won = many(1000, raid(true)).filter((d) => d.blueprint !== null);
    expect(won.length).toBeGreaterThan(150); // 25%
    expect(won.every((d) => d.blueprint?.startsWith('reef-'))).toBe(true);
    const other = many(1000, { ...raid(true), bossId: 'someone' } as HousingMoment);
    expect(other.every((d) => d.blueprint === null)).toBe(true);
  });

  it('a cleared Festival finale opens the Festival set to the blueprint roll', () => {
    const c = festive();
    const festival = many(1500, raid(true, { festival: 'sprite' }), none, c);
    expect(festival.some((d) => d.blueprint === 'lantern-lamp')).toBe(true);
    const plain = many(1500, raid(true), none, c);
    expect(plain.some((d) => d.blueprint === 'lantern-lamp')).toBe(false);
  });

  it('a stamp is a drop stamp for the moment that the player lacks', () => {
    const stamps = many(6000, trip(0)).filter((d) => d.stamp !== null);
    expect(stamps.length).toBeGreaterThan(20); // about 1%
    expect(stamps.every((d) => d.stamp === 'reef-shell')).toBe(true);
    const owned = { blueprints: new Set<string>(), stamps: new Set(['reef-shell']) };
    expect(many(6000, trip(0), owned).every((d) => d.stamp === null)).toBe(true);
    // The stamp is not a raid or Games drop in the fixture.
    expect(many(2000, raid(true)).every((d) => d.stamp === null)).toBe(true);
    expect(
      many(2000, { kind: 'games', key: 'k', medal: 'gold' }).every((d) => d.stamp === null),
    ).toBe(true);
  });

  it('a dungeon blueprint and stamp need a clear', () => {
    const lost = many(2000, { kind: 'dungeon', key: 'k', depth: 5, cleared: false });
    expect(lost.every((d) => d.blueprint === null && d.stamp === null)).toBe(true);
  });
});
