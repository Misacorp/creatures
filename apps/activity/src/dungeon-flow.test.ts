import { describe, expect, it } from 'vitest';
import doneFixture from './fixtures/dungeon-today-done.json';
import needFixture from './fixtures/dungeon-today-need-creatures.json';
import retryFixture from './fixtures/dungeon-today-retry.json';
import todayFixture from './fixtures/dungeon-today.json';
import { initialScreen, msUntilReset, RESET_GRACE_MS } from './dungeon-flow';
import type { DungeonToday } from './dungeon-types';

describe('which dungeon screen opens first', () => {
  it('opens the pre-run screen when a run can start, the first-day retry included', () => {
    expect(initialScreen(todayFixture as unknown as DungeonToday)).toBe('setup');
    expect(initialScreen(retryFixture as unknown as DungeonToday)).toBe('setup');
  });

  it("opens the summary of today's run when it is used up", () => {
    expect(initialScreen(doneFixture as unknown as DungeonToday)).toBe('results');
  });

  it('opens the pre-run screen, with its reason, when there are too few creatures', () => {
    expect(initialScreen(needFixture as unknown as DungeonToday)).toBe('setup');
  });
});

describe('the reset of the day', () => {
  const today = todayFixture as unknown as DungeonToday;

  it('counts down by the server clock, never below 0', () => {
    expect(msUntilReset(today, 1_000, today.serverNow - 1_000)).toBe(
      today.resetsAt - today.serverNow,
    );
    expect(msUntilReset(today, today.resetsAt, 0)).toBe(0);
    expect(msUntilReset(today, today.resetsAt + 5_000, 0)).toBe(0);
  });

  it('asks again a moment after the reset', () => {
    expect(RESET_GRACE_MS).toBeGreaterThan(0);
  });
});
