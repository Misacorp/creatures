import { describe, expect, it } from 'vitest';
import doneFixture from './fixtures/dungeon-today-done.json';
import needFixture from './fixtures/dungeon-today-need-creatures.json';
import retryFixture from './fixtures/dungeon-today-retry.json';
import todayFixture from './fixtures/dungeon-today.json';
import {
  initialScreen,
  msUntilReset,
  openRun,
  RESET_GRACE_MS,
  runScreenOf,
  screenAfterAct,
  screenAfterFight,
} from './dungeon-flow';
import {
  sampleActFight,
  sampleRoom,
  sampleState,
  sampleStateCamp,
  sampleStateEvent,
  sampleStateMid,
  sampleSummary,
  sampleToday,
} from './dungeon-path-samples';
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

describe('an open run', () => {
  it('opens the run straight away, whatever else today says (resume after a reload)', () => {
    const open = sampleToday({ active: sampleStateMid(), canRun: false, blocked: null });
    expect(initialScreen(open)).toBe('run');
    expect(openRun(open)?.id).toBe('run-sample-1');
    // Even a stale canRun or a summary of an earlier attempt does not hide it.
    expect(initialScreen({ ...open, canRun: true })).toBe('run');
    expect(initialScreen({ ...open, last: sampleSummary('defeat') })).toBe('run');
  });

  it('is not open when the state says it is done, or when there is none', () => {
    const done = sampleToday({ active: { ...sampleState(), status: 'done', outcome: 'home' } });
    expect(openRun(done)).toBeNull();
    expect(initialScreen({ ...done, canRun: false, last: sampleSummary('home') })).toBe('results');
    expect(openRun(sampleToday())).toBeNull();
    expect(initialScreen(sampleToday({ canRun: true }))).toBe('setup');
  });

  it('keeps the old rules when the server sends no open run at all', () => {
    expect(initialScreen({ canRun: true, last: null })).toBe('setup');
    expect(initialScreen({ canRun: false, last: null })).toBe('setup');
    expect(initialScreen({ canRun: false, last: sampleSummary('home') })).toBe('results');
  });
});

describe('what an open run shows', () => {
  it('shows what is pending first, else the map', () => {
    expect(runScreenOf(sampleState())).toBe('run');
    expect(runScreenOf(sampleStateMid())).toBe('run');
    expect(runScreenOf(sampleStateEvent())).toBe('event');
    expect(runScreenOf(sampleStateCamp())).toBe('camp');
  });

  it('plays the fight a move answered with, even one that ended the run', () => {
    expect(screenAfterAct(sampleActFight())).toBe('fight');
    expect(
      screenAfterAct({
        state: sampleState(),
        room: sampleRoom(),
        summary: sampleSummary('defeat'),
      }),
    ).toBe('fight');
  });

  it('goes to the results when the run ended without a fight (heading home)', () => {
    expect(screenAfterAct({ state: sampleStateCamp(), summary: sampleSummary('home') })).toBe(
      'results',
    );
  });

  it('goes on at the choice the run stands at after a move that is no fight', () => {
    expect(screenAfterAct({ state: sampleStateEvent() })).toBe('event');
    expect(screenAfterAct({ state: sampleStateCamp() })).toBe('camp');
    expect(screenAfterAct({ state: sampleStateMid() })).toBe('run');
  });

  it('returns from a fight to the run, or to the results when the fight ended it', () => {
    expect(screenAfterFight(undefined, sampleStateMid())).toBe('run');
    expect(screenAfterFight(sampleSummary('cleared'), sampleStateMid())).toBe('results');
    expect(screenAfterFight(undefined, sampleStateCamp())).toBe('camp');
  });
});
