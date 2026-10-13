import { beforeEach, describe, expect, it } from 'vitest';
import { COACH_KEY, coachDismissed, dismissCoach, resetCoachSession } from '../coach';
import { WIPE_NOTICE_KEY } from '../wipe-notice';
import { resetLocalFlags, type FlagStorage } from './flags';

function memoryStorage(
  initial: Record<string, string>,
): FlagStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

describe('resetLocalFlags', () => {
  beforeEach(() => {
    resetCoachSession();
  });

  it('removes the coach mark and the slot-wipe notice flags and nothing unrelated', () => {
    const storage = memoryStorage({
      [COACH_KEY]: '1',
      [WIPE_NOTICE_KEY]: '["a"]',
      'creatures:future-flag': '1',
      'other-app': 'keep',
    });
    expect(resetLocalFlags(storage)).toBe(3);
    expect([...storage.data.keys()]).toEqual(['other-app']);
  });

  it('removes the known keys even when they are not there', () => {
    expect(resetLocalFlags(memoryStorage({}))).toBe(2);
  });

  it('also forgets the in-memory "dismissed" flag, so the hint shows again', () => {
    const getter = () => ({ getItem: () => '1', setItem: () => undefined });
    dismissCoach(getter);
    expect(coachDismissed(getter)).toBe(true);
    resetLocalFlags(memoryStorage({}));
    expect(coachDismissed(() => ({ getItem: () => null, setItem: () => undefined }))).toBe(false);
  });

  it('does nothing, and does not throw, where storage is missing or blocked', () => {
    expect(resetLocalFlags(null)).toBe(0);
    const blocked: FlagStorage = {
      length: 1,
      key: () => {
        throw new DOMException('Access is denied', 'SecurityError');
      },
      removeItem: () => undefined,
    };
    expect(resetLocalFlags(blocked)).toBe(0);
  });
});
