import { ACCOUNT_STATS } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { parseGameState } from './api';
import { parseProfile } from './expedition-parse';
import profileFixture from './fixtures/expedition-profile.json';
import stateOffer from './fixtures/expedition-state-offer.json';
import { statGroups, statsTeaser, type StatsInput } from './stats-view';

const profile = parseProfile(profileFixture);
const creatures = parseGameState(stateOffer).creatures;
const input: StatsInput = { profile, creatures };

describe('the stat sheet', () => {
  const groups = statGroups(input);
  const rows = groups.flatMap((g) => g.rows);

  it('groups the numbers by area, in a fixed order', () => {
    expect(groups.map((g) => g.title)).toEqual(['Expeditions', 'Dungeon', 'Collection', 'Raid']);
  });

  it('puts every account stat the rules record on the sheet exactly once', () => {
    for (const stat of ACCOUNT_STATS) {
      expect(rows.filter((r) => r.key === stat).length, stat).toBe(1);
    }
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it('words every row, with no raw ids', () => {
    for (const row of rows) {
      expect(row.label.length, row.key).toBeGreaterThan(4);
      expect(row.label, row.key).not.toContain('_');
    }
  });

  it('reads the server numbers: account stats, the dungeon record and the creatures owned', () => {
    const value = (key: string): number | undefined => rows.find((r) => r.key === key)?.value;
    expect(value('trips_finished')).toBe(3);
    expect(value('dungeon_runs')).toBe(7);
    expect(value('dungeon_clears')).toBe(3);
    expect(value('dungeon_depth')).toBe(4);
    expect(value('dungeon_streak')).toBe(2);
    expect(value('creatures_owned')).toBe(creatures.length);
  });

  it('reads a stat the server did not send as 0', () => {
    const empty = statGroups({
      profile: { stats: {}, dungeon: { runs: 0, clears: 0, depth: 1, streak: 0 } },
      creatures: [],
    }).flatMap((g) => g.rows);
    const nonZero = empty.filter((r) => r.value !== 0).map((r) => r.key);
    // The dungeon's first depth is 1, not 0.
    expect(nonZero).toEqual(['dungeon_depth']);
  });
});

describe('the Home pin teaser for the Stats', () => {
  it('says trips and dungeon clears', () => {
    expect(statsTeaser(input)).toBe('3 trips, 3 dungeon clears');
  });

  it('is singular for one', () => {
    const one = {
      profile: {
        stats: { trips_finished: 1 },
        dungeon: { runs: 1, clears: 1, depth: 2, streak: 1 },
      },
      creatures: [],
    };
    expect(statsTeaser(one)).toBe('1 trip, 1 dungeon clear');
  });
});
