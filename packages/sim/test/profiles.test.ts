import { describe, expect, it } from 'vitest';
import { createSeededRng } from '@creatures/game';
import { ARCHETYPES, ARCHETYPE_CONFIG } from '../src/archetypes';
import { defaultProfiles } from '../src/journey-run';
import {
  DEFAULT_JOURNEY_MIX,
  LEGACY_PROFILES,
  PRESETS,
  PRESET_IDS,
  SERVER_MIXES,
  noisyProfile,
  parseMix,
  parseProfile,
  parseProfiles,
  profileById,
  proxyArchetype,
  rosterProfiles,
} from '../src/profiles';

describe('profiles', () => {
  it('the four presets and the four archetypes all parse', () => {
    for (const id of PRESET_IDS) expect(parseProfile(PRESETS[id])).toEqual(PRESETS[id]);
    for (const id of ARCHETYPES)
      expect(parseProfile(LEGACY_PROFILES[id])).toEqual(LEGACY_PROFILES[id]);
    expect(parseProfiles(defaultProfiles())).toHaveLength(4);
    expect(profileById('regular')).toBe(PRESETS.regular);
    expect(profileById('casual')).toBe(LEGACY_PROFILES.casual);
    expect(profileById('nobody')).toBeUndefined();
  });

  it('the presets follow the brief', () => {
    const { 'min-maxer': mm, engaged, regular, 'drop-in': drop } = PRESETS;
    expect(mm.loginDays).toBe(7);
    expect(mm.leetDays).toBe(7);
    expect(mm.checkInHours.length).toBeGreaterThanOrEqual(6);
    expect(mm.checkInHours.some((h) => h < 6)).toBe(true); // checks in at night
    expect(mm).toMatchObject({
      trainFocus: 3,
      evolutionPush: true,
      tripPercent: 100,
      supplyPercent: 100,
      dungeon: 'best',
      raidRow: 'protected',
      craftPercent: 100,
    });
    expect(engaged).toMatchObject({
      loginDays: 7,
      trainFocus: 6,
      dungeon: 'good',
      signUpPercent: 100,
    });
    expect(engaged.checkInHours).toHaveLength(2);
    expect(engaged.leetDays).toBeGreaterThanOrEqual(5);
    expect(engaged.leetDays).toBeLessThanOrEqual(6);
    expect(regular.loginDays).toBeGreaterThanOrEqual(4);
    expect(regular.loginDays).toBeLessThanOrEqual(5);
    expect(regular.checkInHours).toHaveLength(1);
    expect(regular.leetDays / regular.loginDays).toBeCloseTo(0.5, 1);
    expect(regular).toMatchObject({ trainFocus: 'spread', raidRow: 'auto' });
    expect(regular.craftPercent).toBeLessThan(engaged.craftPercent);
    expect(drop.loginDays).toBeLessThanOrEqual(2);
    expect(drop.loginDays).toBeGreaterThanOrEqual(1);
    expect(drop).toMatchObject({
      dungeon: 'random',
      craftPercent: 0,
      supplyPercent: 0,
      raidRow: 'auto',
    });
    expect(drop.leetDays).toBeLessThan(1);
    expect(drop.raidDayBias).toBeGreaterThan(0);
  });

  it("today's archetypes keep today's habits", () => {
    for (const id of ARCHETYPES) {
      const cfg = ARCHETYPE_CONFIG[id];
      const p = LEGACY_PROFILES[id];
      expect(p.leetDays).toBe(cfg.leetDaysPerWeek);
      expect(p.signUpPercent).toBe(cfg.signUpPercent);
      expect(p.joinWeek).toBe(cfg.joinWeek);
      expect(p.checkInHours).toEqual(cfg.checkIns === 'twice_daily' ? [9, 20] : [9]);
      expect(p.loginDays).toBe(cfg.checkIns === 'twice_daily' ? 7 : cfg.leetDaysPerWeek);
      // The decisions are the old single policy.
      expect(p).toMatchObject({
        trainFocus: 3,
        evolutionPush: true,
        tripPercent: 100,
        supplyPercent: 100,
        dungeon: 'good',
        raidRow: 'auto',
        craftPercent: 100,
        signUpNeedsLogin: false,
        raidDayBias: 0,
      });
    }
  });

  it('rejects bad profiles', () => {
    const ok = PRESETS.engaged;
    expect(() => parseProfile({ ...ok, surprise: 1 })).toThrow(/Invalid profile/);
    expect(() => parseProfile({ ...ok, tripPercent: 101 })).toThrow();
    expect(() => parseProfile({ ...ok, trainFocus: 4 })).toThrow();
    expect(() => parseProfile({ ...ok, dungeon: 'genius' })).toThrow();
    expect(() => parseProfile({ ...ok, checkInHours: [] })).toThrow();
    expect(() => parseProfile({ ...ok, checkInHours: [20, 9] })).toThrow(/ascending/);
    expect(() => parseProfile({ ...ok, checkInHours: [9, 9] })).toThrow(/ascending/);
    expect(() => parseProfile({ ...ok, checkInHours: [24] })).toThrow();
    expect(() => parseProfile({ ...ok, loginDays: 3, leetDays: 4 })).toThrow(/leetDays/);
    expect(() => parseProfile({ ...ok, id: 'Bad Id' })).toThrow();
    expect(() => parseProfiles([ok, ok])).toThrow(/duplicate/);
    expect(() => parseProfiles([])).toThrow();
  });

  it('a noisy profile stays valid, keeps its style and is reproducible', () => {
    for (const id of PRESET_IDS) {
      const rng = createSeededRng(`noise:${id}`);
      for (let k = 0; k < 100; k++) {
        const noisy = noisyProfile(PRESETS[id], rng);
        expect(parseProfile(noisy)).toEqual(noisy);
        expect(noisy.dungeon).toBe(PRESETS[id].dungeon);
        expect(noisy.raidRow).toBe(PRESETS[id].raidRow);
        expect(noisy.evolutionPush).toBe(PRESETS[id].evolutionPush);
        expect(Math.abs(noisy.loginDays - PRESETS[id].loginDays)).toBeLessThanOrEqual(1);
      }
    }
    const a = noisyProfile(PRESETS.regular, createSeededRng('same'));
    const b = noisyProfile(PRESETS.regular, createSeededRng('same'));
    expect(a).toEqual(b);
    // Noise actually moves something.
    const seen = new Set(
      Array.from({ length: 30 }, (_, k) =>
        JSON.stringify(noisyProfile(PRESETS.engaged, createSeededRng(`n${String(k)}`))),
      ),
    );
    expect(seen.size).toBeGreaterThan(5);
  });

  it('builds a roster from a mix, in profile order, noisy only when asked', () => {
    const plain = rosterProfiles(DEFAULT_JOURNEY_MIX, defaultProfiles());
    expect(plain.map((p) => p.id)).toEqual([
      'min-maxer',
      'engaged',
      'engaged',
      'engaged',
      'regular',
      'regular',
      'regular',
      'drop-in',
      'drop-in',
    ]);
    expect(plain[1]).toBe(PRESETS.engaged);
    const noisy = rosterProfiles(DEFAULT_JOURNEY_MIX, defaultProfiles(), 'seed');
    expect(noisy).toHaveLength(9);
    expect(noisy.map((p) => p.id)).toEqual(plain.map((p) => p.id));
    expect(rosterProfiles(DEFAULT_JOURNEY_MIX, defaultProfiles(), 'seed')).toEqual(noisy);
  });

  it('knows the named server mixes and parses a custom one', () => {
    expect(DEFAULT_JOURNEY_MIX).toEqual({ 'min-maxer': 1, engaged: 3, regular: 3, 'drop-in': 2 });
    const heavy = SERVER_MIXES['casual-heavy'];
    expect(heavy).toBeDefined();
    const casual = (heavy?.regular ?? 0) + (heavy?.['drop-in'] ?? 0);
    const total = Object.values(heavy ?? {}).reduce((a, b) => a + b, 0);
    expect(casual / total).toBeGreaterThan(0.6);
    const known = [...PRESET_IDS];
    expect(parseMix('min-maxer=2,drop-in=1', known)).toEqual({ 'min-maxer': 2, 'drop-in': 1 });
    expect(() => parseMix('wizard=1', known)).toThrow(/unknown/);
    expect(() => parseMix('regular', known)).toThrow(/cannot read/);
    expect(() => parseMix('regular=0', known)).toThrow(/at least one/);
    expect(() => parseMix('regular=99', known)).toThrow();
  });

  it('labels a profile with the closest archetype', () => {
    expect(proxyArchetype(PRESETS['min-maxer'])).toBe('top');
    expect(proxyArchetype(PRESETS.engaged)).toBe('daily');
    expect(proxyArchetype(PRESETS.regular)).toBe('casual');
    expect(proxyArchetype(PRESETS['drop-in'])).toBe('casual');
  });
});
