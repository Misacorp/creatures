import { describe, expect, it } from 'vitest';
import after from './fixtures/games-after.json';
import entries from './fixtures/games-entries.json';
import { parseGamesView } from './games-parse';
import type { GamesView } from './games-types';
import { newAwards } from './use-games';

const view = (raw: unknown): GamesView => parseGamesView(raw);

describe('newAwards', () => {
  const before = view(entries);
  const awarded = view(after);

  it('is true when a load brings a show the last view had no awards for', () => {
    expect(awarded.you.lastResults).toBeDefined();
    expect(newAwards(before, awarded)).toBe(true);
  });

  it('is false for the first load (the state was loaded with it) and for the same awards again', () => {
    expect(newAwards(null, awarded)).toBe(false);
    expect(newAwards(awarded, awarded)).toBe(false);
  });

  it('is false while no show has been awarded', () => {
    expect(newAwards(before, before)).toBe(false);
  });
});
