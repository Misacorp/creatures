import { describe, expect, it } from 'vitest';
import type { LeetSyncStatus } from './api';
import {
  SYNC_POLL_INTERVAL_MS,
  SYNC_POLL_MAX_ATTEMPTS,
  isSyncing,
  leetErrorPhrase,
  leetStatusLine,
  relativeTime,
  shouldRefetchLeet,
} from './leet-status';

const NOW = 1_800_000_000_000;
const MIN = 60_000;

const base: LeetSyncStatus = {
  source: 'http',
  lastAttemptAt: NOW - MIN,
  lastSyncedAt: NOW - 5 * MIN,
  lastError: null,
  lastDays: 3,
};

describe('leetErrorPhrase', () => {
  it.each([
    ['unauthorized', "the game's key for the leet bot was rejected"],
    ['not_found', "the leet bot doesn't know this server"],
    ['timeout', "the leet bot didn't answer"],
    ['network', "the leet bot didn't answer"],
    ['upstream', "the leet bot didn't answer"],
    ['invalid_response', "the leet bot sent data the game didn't understand"],
    ['disabled', 'leet points are switched off'],
    ['rate_limited', 'unknown error'],
    ['invalid_request', 'unknown error'],
    ['internal', 'unknown error'],
    ['something-new', 'unknown error'],
    ['constructor', 'unknown error'],
  ])('%s -> %s', (kind, phrase) => {
    expect(leetErrorPhrase(kind)).toBe(phrase);
  });
});

describe('relativeTime', () => {
  it.each([
    [0, 'just now'],
    [-5 * MIN, 'just now'],
    [59_000, 'just now'],
    [MIN, '1 minute ago'],
    [5 * MIN, '5 minutes ago'],
    [60 * MIN, '1 hour ago'],
    [3 * 60 * MIN, '3 hours ago'],
    [24 * 60 * MIN, '1 day ago'],
    [50 * 60 * MIN, '2 days ago'],
  ])('%i ms ago -> %s', (ago, text) => {
    expect(relativeTime(NOW - ago, NOW)).toBe(text);
  });
});

describe('leetStatusLine', () => {
  it('describes a healthy sync', () => {
    expect(leetStatusLine(base, NOW)).toEqual({
      tone: 'info',
      text: 'Leet points synced 5 minutes ago (3 days)',
    });
    expect(leetStatusLine({ ...base, lastDays: 1 }, NOW).text).toBe(
      'Leet points synced 5 minutes ago (1 day)',
    );
    expect(leetStatusLine({ ...base, lastDays: 0 }, NOW).text).toBe(
      'Leet points synced 5 minutes ago (0 days)',
    );
  });

  it('says so when nothing has been tried yet', () => {
    expect(
      leetStatusLine({ ...base, lastAttemptAt: null, lastSyncedAt: null, lastDays: null }, NOW),
    ).toEqual({ tone: 'info', text: 'Leet points: not synced yet' });
  });

  it('says a first sync is still running', () => {
    expect(leetStatusLine({ ...base, lastSyncedAt: null, lastDays: null }, NOW).text).toBe(
      'Leet points: syncing',
    );
  });

  it('warns with the kind and a plain reason', () => {
    expect(leetStatusLine({ ...base, lastError: 'unauthorized' }, NOW)).toEqual({
      tone: 'warning',
      text: "Leet points couldn't be loaded (unauthorized): the game's key for the leet bot was rejected. Tell the game admin.",
    });
    expect(leetStatusLine({ ...base, lastError: 'rate_limited' }, NOW).text).toContain(
      'unknown error',
    );
  });
});

describe('shouldRefetchLeet', () => {
  const syncing: LeetSyncStatus = { ...base, lastSyncedAt: null, lastDays: null };

  it('polls every 3 seconds, 5 times at most', () => {
    expect(SYNC_POLL_INTERVAL_MS).toBe(3000);
    expect(SYNC_POLL_MAX_ATTEMPTS).toBe(5);
  });

  it('refetches while the first sync is running, up to the attempt limit', () => {
    expect(isSyncing(syncing)).toBe(true);
    for (let done = 0; done < 5; done++) expect(shouldRefetchLeet(syncing, done)).toBe(true);
    expect(shouldRefetchLeet(syncing, 5)).toBe(false);
    expect(shouldRefetchLeet(syncing, 6)).toBe(false);
  });

  it('does not refetch when synced, failed, never attempted or unknown', () => {
    expect(shouldRefetchLeet(base, 0)).toBe(false);
    expect(shouldRefetchLeet({ ...syncing, lastError: 'timeout' }, 0)).toBe(false);
    expect(shouldRefetchLeet({ ...syncing, lastAttemptAt: null }, 0)).toBe(false);
    expect(shouldRefetchLeet(null, 0)).toBe(false);
  });
});
