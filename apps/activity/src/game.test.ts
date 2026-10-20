import { describe, expect, it } from 'vitest';
import { createKeyStore, outcomeUnknown } from './actions';
import collectionState from './fixtures/collection-state.json';
import { ApiError, parseGameState, type Creature } from './api';
import { abilityDef } from './live';
import {
  catchBadgeTags,
  clockOffset,
  creatureAbilityText,
  creatureName,
  errorText,
  evolutionText,
  fusionStars,
  isFirstOnServer,
  personalityLine,
  speciesAbout,
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
  caughtAt: 1_000,
  quirk: 'hums-quietly',
  stats: { hp: 1, atk: 1, spd: 1 },
  statsWithGear: { hp: 1, atk: 1, spd: 1 },
  dodgeBp: 0,
  gear: [],
  busy: null,
  exp: 0,
  expNeeded: 27,
  waiting: false,
  ribbons: 0,
  nextUnlock: { level: 7, name: 'Scarf' },
  ribbon: null,
  treatCost: 4,
  ability: { id: 'tidal-mark', unlocked: false, unlockLevel: 10, nextId: 'tidal-mark-2' },
  explorer: { rank: 1, xp: 0, nextRankXp: 200, trips: 0 },
  lineSlot: 1,
  talents: { slots: [], signature: null, book: [] },
};

describe('display helpers', () => {
  it('counts fusion stars between 0 and 5', () => {
    expect(fusionStars(0)).toBe('☆☆☆☆☆');
    expect(fusionStars(3)).toBe('★★★☆☆');
    expect(fusionStars(9)).toBe('★★★★★');
  });

  it('prefers the nickname', () => {
    expect(creatureName(creature)).toBe('Splashet');
    expect(creatureName({ ...creature, nickname: 'Bubbles' })).toBe('Bubbles');
  });

  it('applies the server clock offset', () => {
    expect(clockOffset(10_000, 4_000)).toBe(6000);
  });

  it('describes catches', () => {
    const badgeTexts = (entry: Parameters<typeof catchBadgeTags>[0]): string[] =>
      catchBadgeTags(entry).map((b) => b.text);
    const base = { species: 'zipmouse', shiny: false, firstOnServer: false };
    expect(badgeTexts({ ...base, outcome: 'new' })).toEqual(['New!']);
    expect(badgeTexts({ ...base, outcome: 'duplicate' })).toEqual(['Duplicate']);
    expect(catchBadgeTags({ ...base, outcome: 'duplicate' })[0]?.entry).toBe('duplicate-choice');
    expect(badgeTexts({ ...base, outcome: 'fused', fusionCount: 3 })).toEqual(['Fused ★3']);
    expect(badgeTexts({ ...base, outcome: 'converted', bait: 5 })).toEqual(['+5 Bait']);
    expect(badgeTexts({ ...base, outcome: 'new', shiny: true, firstOnServer: true })).toEqual([
      'New!',
      'Shiny!',
      'First on server!',
    ]);
  });

  it('points each catch badge at the glossary entry that explains it', () => {
    const base = { species: 'zipmouse', shiny: false, firstOnServer: false };
    expect(catchBadgeTags({ ...base, outcome: 'new' })).toEqual([{ text: 'New!', entry: null }]);
    expect(
      catchBadgeTags({
        ...base,
        outcome: 'fused',
        fusionCount: 2,
        shiny: true,
        firstOnServer: true,
      }),
    ).toEqual([
      { text: 'Fused ★2', entry: 'fusion' },
      { text: 'Shiny!', entry: 'shiny' },
      { text: 'First on server!', entry: 'first-on-server' },
    ]);
    expect(catchBadgeTags({ ...base, outcome: 'converted', bait: 5 })).toEqual([
      { text: '+5 Bait', entry: 'bait' },
    ]);
  });

  it("shows a Second look duplicate with a badge that opens the line's glossary entry", () => {
    const base = { species: 'zipmouse', shiny: false, firstOnServer: false };
    expect(catchBadgeTags({ ...base, outcome: 'duplicate', secondLook: true })).toEqual([
      { text: 'Duplicate', entry: 'duplicate-choice' },
      { text: 'Second look', entry: 'gear-line-second-look' },
    ]);
    expect(catchBadgeTags({ ...base, outcome: 'duplicate' }).map((b) => b.text)).toEqual([
      'Duplicate',
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
    'not_away',
    'not_in_party',
    'not_movable',
    'duplicate_creatures',
    'invalid_slot',
    'already_fired',
    'too_late',
    'not_in_fight',
    'hold_too_late',
    'not_held',
    'not_started',
    'invalid_body',
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

const withoutAbility: Record<string, unknown> = { ...creature };
delete withoutAbility['ability'];
const withoutQuirk: Record<string, unknown> = { ...creature };
delete withoutQuirk['quirk'];

describe('parseGameState', () => {
  const valid = {
    serverNow: 5,
    balances: { bait: 1, essence: 0 },
    starterChosen: true,
    creatures: [creature],
    expeditions: [],
    cancelled: [],
    slots: { total: 3, used: 0, rankSum: 0, tripsFinished: 0, next: null },
    supplies: {},
    trainingMedianLevel: null,
    serverFirsts: [],
    pending: [],
    bookSlotBait: 10,
    loungerId: null,
  };

  it('accepts the server shape and defaults starterOptions', () => {
    expect(parseGameState(valid).starterOptions).toEqual([]);
    expect(parseGameState({ ...valid, starterOptions: ['splashet'] }).starterOptions).toEqual([
      'splashet',
    ]);
  });

  it('accepts every kind of first-on-server record the server lists, and refuses a jackpot one', () => {
    const first = { species: 'splashet', at: 7, mine: true, holders: ['Misa'] };
    for (const kind of ['catch', 'evolve', 'festival']) {
      const parsed = parseGameState({ ...valid, serverFirsts: [{ ...first, kind }] });
      expect(parsed.serverFirsts[0]?.kind).toBe(kind);
    }
    expect(() =>
      parseGameState({ ...valid, serverFirsts: [{ ...first, kind: 'other' }] }),
    ).toThrow();
    // The jackpot is hidden from players: the server never lists its record.
    expect(() =>
      parseGameState({
        ...valid,
        serverFirsts: [{ ...first, species: 'jackpot', kind: 'jackpot' }],
      }),
    ).toThrow();
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
    ['slots without the next unlock', { ...valid, slots: { total: 1, used: 0 } }],
    [
      'a creature without an explorer',
      { ...valid, creatures: [{ ...creature, explorer: undefined }] },
    ],
    ['missing supplies', { ...valid, supplies: undefined }],
    ['a bad creature', { ...valid, creatures: [{ ...creature, level: 'x' }] }],
    ['fractional balances', { ...valid, balances: { bait: 1.5, essence: 0 } }],
    ['bad starter options', { ...valid, starterOptions: [1] }],
    ['a malformed leet status', { ...valid, leetSync: { source: 'http' } }],
    ['a creature without the ability field', { ...valid, creatures: [withoutAbility] }],
    ['a creature without the quirk field', { ...valid, creatures: [withoutQuirk] }],
    ['a numeric quirk', { ...valid, creatures: [{ ...creature, quirk: 7 }] }],
    [
      'a bad creature ability',
      { ...valid, creatures: [{ ...creature, ability: { id: 'x', unlocked: 'yes' } }] },
    ],
    [
      'a fractional unlock level',
      {
        ...valid,
        creatures: [{ ...creature, ability: { id: 'x', unlocked: true, unlockLevel: 9.5 } }],
      },
    ],
  ])('rejects %s', (_name, data) => {
    expect(() => parseGameState(data)).toThrow();
  });
});

describe('quirks and species lore in the client', () => {
  it('accepts a creature whose quirk is null', () => {
    const state = parseGameState({
      serverNow: 5,
      balances: { bait: 1, essence: 0 },
      starterChosen: true,
      creatures: [{ ...creature, quirk: null }],
      expeditions: [],
      cancelled: [],
      slots: { total: 3, used: 0, rankSum: 0, tripsFinished: 0, next: null },
      supplies: {},
      trainingMedianLevel: null,
      serverFirsts: [],
      pending: [],
      bookSlotBait: 10,
      loungerId: null,
    });
    expect(state.creatures[0]?.quirk).toBeNull();
  });

  it('shows the personality as "Personality: <text>", and nothing for an unknown id', () => {
    expect(personalityLine('hums-quietly')).toBe(
      'Personality: Hums a tiny tune when it thinks nobody is listening.',
    );
    expect(personalityLine(null)).toBeNull();
    expect(personalityLine('removed-from-the-data')).toBeNull();
  });

  it('every creature in the real server response has a personality line', () => {
    for (const c of parseGameState(collectionState).creatures) {
      expect(personalityLine(c.quirk), c.species).toMatch(/^Personality: .+/);
    }
  });

  it('gives players the description and traits of a species, and never the visual brief', () => {
    const about = speciesAbout('hearthshell');
    expect(about?.description).toContain('bonfire');
    expect(about?.traits.length).toBeGreaterThanOrEqual(3);
    expect(Object.keys(about ?? {}).sort()).toEqual(['description', 'traits']);
    expect(speciesAbout('no-such-species')).toBeNull();
  });
});

describe('parseGameState with a real server response (fixtures/collection-state.json)', () => {
  it('reads the finale ability of every creature', () => {
    const state = parseGameState(collectionState);
    expect(state.creatures.length).toBeGreaterThan(0);
    for (const c of state.creatures) {
      expect(c.ability).not.toBeNull();
      expect(abilityDef(c.ability?.id ?? '')).toBeDefined();
    }
    const cindle = state.creatures.find((c) => c.species === 'cindle');
    expect(cindle?.ability).toEqual({
      id: 'flare-strike',
      unlocked: true,
      unlockLevel: 10,
      nextId: 'flare-strike-2',
    });
    // A creature below level 10 has its ability locked.
    const low = state.creatures.find((c) => c.level < 10);
    expect(low?.ability).toMatchObject({ unlocked: false, unlockLevel: 10 });
  });
});

describe('parseGameState and a line that grows two ways', () => {
  it('reads the second form of Sproutle and of Cindle from the real response', () => {
    const state = parseGameState(collectionState);
    const sproutle = state.creatures.find((c) => c.species === 'sproutle');
    expect(sproutle?.evolution).toMatchObject({
      toSpecies: 'thornbuck',
      alt: { toSpecies: 'sunfawn' },
    });
    // Every evolving line grows two ways now, so a Cindle has its second form too.
    const cindle = state.creatures.find((c) => c.species === 'cindle');
    expect(cindle?.evolution).toMatchObject({
      toSpecies: 'pyrelynx',
      alt: { toSpecies: 'wickat' },
    });
  });

  it('refuses a second form of the wrong shape', () => {
    const base = collectionState as unknown as { creatures: Record<string, unknown>[] };
    const sproutle = base.creatures.find((c) => c['species'] === 'sproutle');
    const evolution = sproutle?.['evolution'] as Record<string, unknown>;
    for (const alt of [{ toSpecies: 7 }, 'sunfawn', null, {}]) {
      expect(() =>
        parseGameState({
          ...collectionState,
          creatures: [{ ...sproutle, evolution: { ...evolution, alt } }],
        }),
      ).toThrow();
    }
  });
});

describe('parseGameState and the server firsts', () => {
  it('has no jackpot record, and a server first never marks a creature that was not caught', () => {
    const state = parseGameState(collectionState);
    expect(JSON.stringify(state.serverFirsts)).not.toMatch(/jackpot/i);
    const first = state.creatures[0] as Creature;
    expect(isFirstOnServer(first, state.serverFirsts)).toBe(false);
  });
});

describe('creatureAbilityText', () => {
  const evolving: Pick<Creature, 'ability' | 'evolution'> = {
    ability: { id: 'flare-strike', unlocked: true, unlockLevel: 10, nextId: 'flare-strike-2' },
    evolution: { toSpecies: 'pyrelynx', level: 15, essence: 20, available: false },
  };

  it('shows the name and one line when unlocked, with the evolved form as a teaser', () => {
    const text = creatureAbilityText(evolving, abilityDef);
    expect(text?.unlocked).toBe(true);
    expect(text?.line).toBe('Flare Strike: Hits the boss at once for 220% of its Attack.');
    expect(text?.teaser).toBe('Evolves into: Pyrelynx (Inferno Strike)');
  });

  it('says when it unlocks while it is locked', () => {
    const text = creatureAbilityText(
      {
        ...evolving,
        ability: { id: 'flare-strike', unlocked: false, unlockLevel: 10, nextId: 'flare-strike-2' },
      },
      abilityDef,
    );
    expect(text).toEqual({
      line: 'Finale ability: unlocks at level 10',
      unlocked: false,
      teaser: 'Evolves into: Pyrelynx (Inferno Strike)',
    });
  });

  it('has no teaser for a stage 2 creature or a species that never evolves', () => {
    const text = creatureAbilityText(
      { ability: { id: 'flare-strike-2', unlocked: true, unlockLevel: 10 } },
      abilityDef,
    );
    expect(text?.teaser).toBeNull();
    expect(text?.line).toContain('Inferno Strike');
  });

  it('shows nothing for a species without an ability, and copes with an unknown id', () => {
    expect(creatureAbilityText({ ability: null }, abilityDef)).toBeNull();
    const odd = creatureAbilityText(
      { ability: { id: 'gone', unlocked: true, unlockLevel: 10 } },
      abilityDef,
    );
    expect(odd?.line).toBe('gone');
  });
});
