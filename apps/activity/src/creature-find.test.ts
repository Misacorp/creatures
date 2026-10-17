import { content } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { sampleRoster } from './creature-card-sample';
import {
  ELEMENT_OPTIONS,
  NO_FILTERS,
  ROLE_OPTIONS,
  QUERY_MAX,
  SUGGESTION_LIMIT,
  applyFilters,
  filterStorageKey,
  fold,
  isFiltered,
  loadFilters,
  matchesFilters,
  resultLine,
  saveFilters,
  suggest,
  suggestionCount,
  toggled,
  type FilterStorage,
} from './creature-find';

const roster = sampleRoster(12);
const names = (found: ReturnType<typeof suggest>): string[] => found.map((s) => s.name);

describe('the chips', () => {
  it('know every element and every role of the content', () => {
    expect(ELEMENT_OPTIONS.map((e) => e.id).sort()).toEqual(['ember', 'grove', 'spark', 'tide']);
    const roles = new Set(content.creatures.map((c) => c.role));
    expect([...roles].every((r) => ROLE_OPTIONS.some((o) => o.id === r))).toBe(true);
    expect(ROLE_OPTIONS.map((r) => r.name)).toEqual(['Guard', 'Setter', 'Payoff', 'Support']);
  });

  it('toggle a value in and out of a list', () => {
    expect(toggled([], 'ember')).toEqual(['ember']);
    expect(toggled(['ember', 'tide'], 'ember')).toEqual(['tide']);
  });

  it('say when anything is on', () => {
    expect(isFiltered(NO_FILTERS)).toBe(false);
    expect(isFiltered({ ...NO_FILTERS, needs: true })).toBe(true);
    expect(isFiltered({ ...NO_FILTERS, roles: ['guard'] })).toBe(true);
  });
});

describe('filtering', () => {
  const needy = new Set(['sample-0', 'sample-2']);
  const ids = (filters: Parameters<typeof applyFilters>[1]): string[] =>
    applyFilters(roster, filters, needy).map((c) => c.id);

  it('lets everything through with no chip', () => {
    expect(ids(NO_FILTERS)).toHaveLength(12);
  });

  it('"Needs you" keeps only the creatures that need the player', () => {
    expect(ids({ ...NO_FILTERS, needs: true })).toEqual(['sample-0', 'sample-2']);
  });

  it('an element chip keeps that element; two chips of one kind mean "either"', () => {
    const ember = ids({ ...NO_FILTERS, elements: ['ember'] });
    // Cindle, Pyrelynx, Ashmole and Magmole.
    expect(ember).toEqual(['sample-2', 'sample-3', 'sample-10', 'sample-11']);
    const either = ids({ ...NO_FILTERS, elements: ['ember', 'grove'] });
    expect(either).toHaveLength(6);
  });

  it('chips of different kinds combine with "and" (Ember and Payoff)', () => {
    expect(ids({ ...NO_FILTERS, elements: ['ember'], roles: ['payoff'] })).toEqual([
      'sample-2',
      'sample-3',
    ]);
    expect(ids({ needs: true, elements: ['ember'], roles: ['payoff'] })).toEqual(['sample-2']);
  });

  it('keeps nothing for a creature of an unknown species when an element is chosen', () => {
    const odd = { ...(roster[0] as (typeof roster)[number]), species: 'not-a-species' };
    expect(matchesFilters(odd, { ...NO_FILTERS, elements: ['ember'] }, new Set())).toBe(false);
    expect(matchesFilters(odd, NO_FILTERS, new Set())).toBe(true);
  });
});

describe('the words under the chips', () => {
  it('count the roster when nothing is on', () => {
    expect(resultLine(12, 12, NO_FILTERS)).toBe('12 creatures');
    expect(resultLine(1, 1, NO_FILTERS)).toBe('1 creature');
  });

  it('count what shows, and explain an empty result', () => {
    expect(resultLine(3, 12, { ...NO_FILTERS, roles: ['guard'] })).toBe('Showing 3 of 12');
    expect(resultLine(0, 12, { ...NO_FILTERS, needs: true })).toBe('Nothing needs you right now.');
    expect(resultLine(0, 12, { ...NO_FILTERS, needs: true, roles: ['guard'] })).toBe(
      'No creature matches these filters.',
    );
  });

  it('speak the suggestion count', () => {
    expect(suggestionCount(0)).toBe('No match');
    expect(suggestionCount(1)).toBe('1 suggestion');
    expect(suggestionCount(4)).toBe('4 suggestions');
  });
});

describe('suggestions', () => {
  it('fold case, width and accents', () => {
    expect(fold('ZIPMOUSE')).toBe('zipmouse');
    expect(fold('Zipmöuse')).toBe('zipmouse');
    expect(fold('ＺＩＰ')).toBe('zip');
  });

  it('suggest nothing for an empty or blank search', () => {
    expect(suggest(roster, '')).toEqual([]);
    expect(suggest(roster, '   ')).toEqual([]);
  });

  it('find a creature by its species name, in any case', () => {
    expect(names(suggest(roster, 'zip'))).toEqual(['Zipmouse']);
    expect(names(suggest(roster, 'ZIPMOUSE'))).toEqual(['Zipmouse']);
  });

  it('find a creature by its nickname, and show the species under it', () => {
    const found = suggest(roster, 'buddy 5');
    expect(names(found)).toEqual(['Buddy 5']);
    expect(found[0]?.species).toBe('Thornbuck');
  });

  it('find a nicknamed creature by its species too, after the name matches', () => {
    const found = suggest(roster, 'tidewing');
    expect(names(found)).toEqual(['Buddy 1']);
    expect(found[0]?.species).toBe('Tidewing');
  });

  it('rank exact, then prefix, then inside, and break ties by the higher level', () => {
    // "mole" is inside Ashmole and Magmole, a prefix of nothing; the higher level first.
    expect(names(suggest(roster, 'mole'))).toEqual(['Magmole', 'Ashmole']);
    // "s" starts Splashet (level 10) and Sproutle (level 7) and is only inside the others: prefixes first,
    // then the higher level.
    const s = names(suggest(roster, 's'));
    expect(s.slice(0, 2)).toEqual(['Splashet', 'Sproutle']);
  });

  it('keep to the limit', () => {
    expect(suggest(roster, 'e')).toHaveLength(SUGGESTION_LIMIT);
    expect(suggest(roster, 'e', 2)).toHaveLength(2);
  });

  it('ignore what is past the longest search', () => {
    const long = 'zip' + 'x'.repeat(QUERY_MAX);
    expect(suggest(roster, long.slice(0, QUERY_MAX))).toEqual([]);
    expect(names(suggest(roster, `zip${' '.repeat(QUERY_MAX)}`))).toEqual(['Zipmouse']);
  });

  it('match nothing for a name nobody has', () => {
    expect(suggest(roster, 'zzz')).toEqual([]);
  });
});

function memoryStorage(initial: Record<string, string> = {}): FilterStorage & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

const ELEMENT_IDS = ELEMENT_OPTIONS.map((e) => e.id);
const ROLE_IDS = ROLE_OPTIONS.map((r) => r.id);

describe('the last chips, per viewer', () => {
  it('are kept under the viewer, without "Needs you"', () => {
    const storage = memoryStorage();
    expect(saveFilters(storage, 'u1', { needs: true, elements: ['ember'], roles: ['guard'] })).toBe(
      true,
    );
    expect(Object.keys(storage.data)).toEqual([filterStorageKey('u1')]);
    expect(loadFilters(storage, 'u1', ELEMENT_IDS, ROLE_IDS)).toEqual({
      needs: false,
      elements: ['ember'],
      roles: ['guard'],
    });
    // Another viewer starts clean.
    expect(loadFilters(storage, 'u2', ELEMENT_IDS, ROLE_IDS)).toEqual(NO_FILTERS);
  });

  it('drop anything unreadable or unknown', () => {
    const key = filterStorageKey('u1');
    expect(loadFilters(memoryStorage({ [key]: 'not json' }), 'u1', ELEMENT_IDS, ROLE_IDS)).toEqual(
      NO_FILTERS,
    );
    expect(loadFilters(memoryStorage({ [key]: '42' }), 'u1', ELEMENT_IDS, ROLE_IDS)).toEqual(
      NO_FILTERS,
    );
    expect(
      loadFilters(
        memoryStorage({
          [key]: JSON.stringify({ elements: ['ember', 7, 'plasma'], roles: 'guard' }),
        }),
        'u1',
        ELEMENT_IDS,
        ROLE_IDS,
      ),
    ).toEqual({ needs: false, elements: ['ember'], roles: [] });
  });

  it('work without storage, and when the storage refuses', () => {
    expect(loadFilters(null, 'u1', ELEMENT_IDS, ROLE_IDS)).toEqual(NO_FILTERS);
    expect(saveFilters(null, 'u1', NO_FILTERS)).toBe(false);
    const refusing: FilterStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadFilters(refusing, 'u1', ELEMENT_IDS, ROLE_IDS)).toEqual(NO_FILTERS);
    expect(saveFilters(refusing, 'u1', NO_FILTERS)).toBe(false);
  });
});
