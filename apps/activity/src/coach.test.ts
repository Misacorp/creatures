import { beforeEach, describe, expect, it } from 'vitest';
import {
  COACH_KEY,
  COACH_TEXT,
  coachDismissed,
  dismissCoach,
  resetCoachSession,
  type StorageGetter,
} from './coach';

function memoryStorage(): { getter: StorageGetter; data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getter: () => ({
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
      },
    }),
  };
}

const blocked: StorageGetter = () => {
  throw new DOMException('Access is denied', 'SecurityError');
};

const full: StorageGetter = () => ({
  getItem: () => null,
  setItem: () => {
    throw new DOMException('The quota has been exceeded', 'QuotaExceededError');
  },
});

describe('the coach mark', () => {
  beforeEach(() => {
    resetCoachSession();
  });

  it('says what the issue asked for', () => {
    expect(COACH_TEXT).toBe('Tap any tag to learn what it means');
  });

  it('shows on the first visit and never again once dismissed', () => {
    const { getter, data } = memoryStorage();
    expect(coachDismissed(getter)).toBe(false);
    dismissCoach(getter);
    expect(data.get(COACH_KEY)).toBe('1');
    resetCoachSession(); // a new session: only the stored flag is left
    expect(coachDismissed(getter)).toBe(true);
  });

  it('only counts the exact flag value as dismissed', () => {
    const { getter, data } = memoryStorage();
    data.set(COACH_KEY, 'yes');
    expect(coachDismissed(getter)).toBe(false);
  });

  it('still renders (shows) when reading the storage throws', () => {
    expect(() => coachDismissed(blocked)).not.toThrow();
    expect(coachDismissed(blocked)).toBe(false);
  });

  it('does not throw when writing throws, and stays hidden for the rest of the session', () => {
    expect(() => {
      dismissCoach(blocked);
    }).not.toThrow();
    expect(coachDismissed(blocked)).toBe(true);
    resetCoachSession();
    expect(() => {
      dismissCoach(full);
    }).not.toThrow();
    expect(coachDismissed(full)).toBe(true);
  });
});
