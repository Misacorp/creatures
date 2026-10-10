import { describe, expect, it } from 'vitest';
import { createKeyStore, outcomeUnknown } from './actions';
import { ApiError, parseGameState, type Creature } from './api';
import {
  catchBadges,
  clockOffset,
  creatureName,
  errorText,
  evolutionText,
  formatCountdown,
  fusionStars,
  isFirstOnServer,
  oddsText,
} from './game';

const creature: Creature = {
  id: 'c1',
  species: 'splashet',
  line: 'splashet',
  level: 1,
  levelCap: 15,
  fusionCount: 0,
  shiny: false,
  nickname: null,
  away: false,
  stats: { hp: 1, atk: 1, spd: 1 },
  trainCost: 15,
};

describe('formatCountdown', () => {
  it.each([
    [0, '0s'],
    [-5000, '0s'],
    [999, '1s'],
    [12_000, '12s'],
    [65_000, '1m 05s'],
    [3_723_000, '1h 02m 03s'],
    [12 * 3_600_000, '12h 00m 00s'],
  ])('%i ms is %s', (ms, text) => {
    expect(formatCountdown(ms)).toBe(text);
  });
});

describe('display helpers', () => {
  it('counts fusion stars between 0 and 5', () => {
    expect(fusionStars(0)).toBe('☆☆☆☆☆');
    expect(fusionStars(3)).toBe('★★★☆☆');
    expect(fusionStars(9)).toBe('★★★★★');
  });

  it('shows the odds from the shared rules', () => {
    expect(oddsText('basic')).toBe('Common 72% / Rare 25% / Epic 3%');
    expect(oddsText('great')).toBe('Common 50% / Rare 38% / Epic 12%');
  });

  it('prefers the nickname', () => {
    expect(creatureName(creature)).toBe('Splashet');
    expect(creatureName({ ...creature, nickname: 'Bubbles' })).toBe('Bubbles');
  });

  it('applies the server clock offset', () => {
    expect(clockOffset(10_000, 4_000)).toBe(6000);
  });

  it('describes catches', () => {
    const base = { species: 'zipmouse', shiny: false, firstOnServer: false };
    expect(catchBadges({ ...base, outcome: 'new' })).toEqual(['New!']);
    expect(catchBadges({ ...base, outcome: 'fused', fusionCount: 3 })).toEqual(['Fused ★3']);
    expect(catchBadges({ ...base, outcome: 'converted', bait: 5 })).toEqual(['+5 Bait']);
    expect(catchBadges({ ...base, outcome: 'new', shiny: true, firstOnServer: true })).toEqual([
      'New!',
      'Shiny!',
      'First on server!',
    ]);
  });

  it("finds first-on-server records by species or by the line's first stage", () => {
    const mine = { kind: 'catch' as const, species: 'splashet', at: 1, mine: true, holders: ['A'] };
    expect(isFirstOnServer(creature, [mine])).toBe(true);
    expect(isFirstOnServer(creature, [{ ...mine, mine: false }])).toBe(false);
    expect(isFirstOnServer({ ...creature, species: 'tidewing' }, [mine])).toBe(true);
    expect(isFirstOnServer(creature, [{ ...mine, species: 'cindle' }])).toBe(false);
  });

  it('explains errors in plain words', () => {
    expect(errorText(new ApiError(409, 'insufficient_funds'))).toBe('Not enough Bait.');
    expect(errorText(new ApiError(400, 'invalid_nickname', 'too_long'))).toContain('20');
    expect(errorText(new ApiError(418, 'teapot'))).toContain('teapot');
    expect(errorText(new TypeError('Failed to fetch'))).toContain('connection');
  });

  it('names the currency that ran out', () => {
    expect(errorText(new ApiError(409, 'insufficient_funds'), 'Essence')).toBe(
      'Not enough Essence.',
    );
  });

  it.each([
    'locked',
    'slot_taken',
    'not_your_creature',
    'not_in_team',
    'not_in_roster',
    'duplicate_creatures',
    'invalid_slot',
  ])('has a plain message for the raid error "%s"', (code) => {
    const text = errorText(new ApiError(409, code));
    expect(text).not.toContain('_');
    expect(text).not.toContain('Something went wrong');
    expect(text.length).toBeGreaterThan(10);
  });
});

describe('evolutionText', () => {
  const evolution = { toSpecies: 'splashet', level: 15, essence: 40, available: false };

  it('offers the evolution when the server says it is available', () => {
    const text = evolutionText(15, { ...evolution, available: true }, 50);
    expect(text.available).toBe(true);
    expect(text.label).toContain('40 Essence');
  });

  it('says what is missing', () => {
    expect(evolutionText(10, evolution, 100).label).toContain('needs level 15');
    expect(evolutionText(10, evolution, 100).label).not.toContain('Essence');
    expect(evolutionText(15, evolution, 5).label).toContain('needs 40 Essence');
    const both = evolutionText(3, evolution, 0);
    expect(both.label).toContain('level 15 and 40 Essence');
    expect(both.available).toBe(false);
  });
});

describe('idempotency keys', () => {
  const counter = () => {
    let n = 0;
    return () => `key-${String(++n)}`;
  };

  it('reuses the key after a network error or server error', () => {
    const keys = createKeyStore(counter());
    const first = keys.keyFor('train:c1');
    keys.settle('train:c1', new TypeError('Failed to fetch'));
    expect(keys.keyFor('train:c1')).toBe(first);
    keys.settle('train:c1', new ApiError(503, null));
    expect(keys.keyFor('train:c1')).toBe(first);
    keys.settle('train:c1', new ApiError(429, 'rate_limited'));
    expect(keys.keyFor('train:c1')).toBe(first);
  });

  it('makes a new key after success or a definite answer', () => {
    const keys = createKeyStore(counter());
    const first = keys.keyFor('train:c1');
    keys.settle('train:c1');
    const second = keys.keyFor('train:c1');
    expect(second).not.toBe(first);
    keys.settle('train:c1', new ApiError(409, 'insufficient_funds'));
    expect(keys.keyFor('train:c1')).not.toBe(second);
  });

  it('keeps separate keys per action', () => {
    const keys = createKeyStore(counter());
    expect(keys.keyFor('a')).not.toBe(keys.keyFor('b'));
    expect(keys.keyFor('a')).toBe(keys.keyFor('a'));
  });

  it('classifies errors', () => {
    expect(outcomeUnknown(new Error('x'))).toBe(true);
    expect(outcomeUnknown(new ApiError(500, null))).toBe(true);
    expect(outcomeUnknown(new ApiError(400, 'invalid_body'))).toBe(false);
    expect(outcomeUnknown(new ApiError(404, 'not_found'))).toBe(false);
  });

  it('generates UUIDs by default', () => {
    const keys = createKeyStore();
    expect(keys.keyFor('x')).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('parseGameState', () => {
  const valid = {
    serverNow: 5,
    balances: { bait: 1, essence: 0 },
    starterChosen: true,
    creatures: [creature],
    expeditions: [],
    slots: { total: 3, used: 0 },
    trainingMedianLevel: null,
    serverFirsts: [],
  };

  it('accepts the server shape and defaults starterOptions', () => {
    expect(parseGameState(valid).starterOptions).toEqual([]);
    expect(parseGameState({ ...valid, starterOptions: ['splashet'] }).starterOptions).toEqual([
      'splashet',
    ]);
  });

  it('reads the leet sync status when present and leaves it null otherwise', () => {
    const leetSync = {
      source: 'http',
      lastAttemptAt: 10,
      lastSyncedAt: null,
      lastError: 'unauthorized',
      lastDays: null,
    };
    expect(parseGameState({ ...valid, leetSync }).leetSync).toEqual(leetSync);
    expect(parseGameState(valid).leetSync).toBeNull();
  });

  it.each([
    ['null', null],
    ['a missing field', { ...valid, slots: undefined }],
    ['a bad creature', { ...valid, creatures: [{ ...creature, level: 'x' }] }],
    ['fractional balances', { ...valid, balances: { bait: 1.5, essence: 0 } }],
    ['bad starter options', { ...valid, starterOptions: [1] }],
    ['a malformed leet status', { ...valid, leetSync: { source: 'http' } }],
  ])('rejects %s', (_name, data) => {
    expect(() => parseGameState(data)).toThrow();
  });
});
