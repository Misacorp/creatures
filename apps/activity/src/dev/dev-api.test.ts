import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api';
import {
  clockRows,
  describeResult,
  errorCode,
  errorSentence,
  eventLine,
  formatGameTime,
  formatOffset,
  describeBench,
  parseDevEvents,
  parseDevState,
  parseWatch,
  replayPhaseOf,
  runTool,
} from './dev-api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runTool', () => {
  it('refuses to run without a session (nothing is sent)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    // `apiFetch` rejects before any request while the player is not signed in.
    expect(await runTool('finish-jobs', {})).toEqual({ ok: false, error: 'network_error' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('errorCode', () => {
  it('uses the server error code, the status, or a network note', () => {
    expect(errorCode(new ApiError(400, 'invalid_body'))).toBe('invalid_body');
    expect(errorCode(new ApiError(404, null))).toBe('http_404');
    expect(errorCode(new Error('offline'))).toBe('network_error');
  });
});

describe('errorSentence', () => {
  it('tells what to do about a raid week on the old rules, keeping the code out of the text', () => {
    const text = errorSentence('not_v2');
    expect(text).toContain('Press Clear the board');
    expect(text).not.toContain('not_v2');
  });

  it('says in plain words why a bench step refused', () => {
    expect(errorSentence('play_stage1_first')).toBe('Play stage 1 first.');
    expect(errorSentence('play_stage2_first')).toBe('Play stage 2 first.');
    expect(errorSentence('boss_fell')).toBe('The boss already fell.');
    expect(errorSentence('fought')).toBe('This week has been fought. Clear the board first.');
    for (const code of [
      'already_played',
      'finale_running',
      'nobody_placed',
      'nobody_left',
      'clear_first',
      'festival',
    ]) {
      const text = errorSentence(code);
      expect(text, code).not.toBe(code);
      expect(text, code).toMatch(/\.$/);
    }
  });

  it('shows any other code as it is, even one named like an object property', () => {
    expect(errorSentence('invalid_body')).toBe('invalid_body');
    expect(errorSentence('http_404')).toBe('http_404');
    expect(errorSentence('toString')).toBe('toString');
    expect(errorSentence('__proto__')).toBe('__proto__');
  });
});

describe('parsing the server answers', () => {
  it('reads the dev state', () => {
    const state = {
      enabled: true,
      clock: {
        offsetMs: 3_600_000,
        now: 1_700_000_000_000,
        realNow: 1,
        timezone: 'Europe/Helsinki',
        gameDay: '2026-10-13',
      },
      raid: { weekId: '2026-W42', status: 'prep', bossId: null },
      guests: 3,
    };
    expect(parseDevState(state)).toEqual({
      offsetMs: 3_600_000,
      now: 1_700_000_000_000,
      timezone: 'Europe/Helsinki',
      gameDay: '2026-10-13',
      raid: { weekId: '2026-W42', status: 'prep', bossId: null },
      guests: 3,
      raidSeats: null,
    });
    expect(parseDevState({ ...state, raidSeats: 6 })?.raidSeats).toBe(6);
    expect(parseDevState({ ...state, raid: null })?.raid).toBeNull();
    expect(parseDevState({ clock: {} })).toBeNull();
    expect(parseDevState(null)).toBeNull();
  });

  it('reads the events and shows them as text', () => {
    const events = parseDevEvents({
      events: [
        { at: Date.UTC(2026, 9, 13, 8, 5, 9), kind: 'dev_action', props: { tool: 'clock' } },
      ],
    });
    expect(events).toHaveLength(1);
    expect(eventLine(events?.[0] ?? { at: 0, kind: '', props: null })).toBe(
      '10-13 08:05:09 dev_action {"tool":"clock"}',
    );
    expect(parseDevEvents({ events: [{ at: 'x' }] })).toBeNull();
    expect(parseDevEvents({})).toBeNull();
  });
});

describe('text helpers', () => {
  it('cuts long results and names empty ones', () => {
    expect(describeResult(undefined)).toBe('done');
    expect(describeResult({ a: 1 })).toBe('{"a":1}');
    expect(describeResult('x'.repeat(400)).length).toBeLessThan(310);
  });

  it('formats the clock offset', () => {
    expect(formatOffset(0)).toBe('none');
    expect(formatOffset(3_600_000)).toBe('+1h 0m');
    expect(formatOffset(86_400_000 + 6 * 3_600_000 + 5 * 60_000)).toBe('+1d 6h 5m');
  });
});

describe('clockRows', () => {
  const view = {
    offsetMs: 90_000_000,
    now: Date.UTC(2026, 9, 19, 8, 53, 20),
    timezone: 'Europe/Helsinki',
    gameDay: 'Mon',
    raid: { weekId: '2026-W43', status: 'open', bossId: 'bog-king' },
    guests: 3,
    raidSeats: null,
  };

  it('gives every fact its own short row', () => {
    expect(clockRows(view)).toEqual([
      { label: 'Game time', value: formatGameTime(view.now, view.timezone) },
      { label: 'Game day', value: 'Mon' },
      { label: 'Shifted by', value: '+1d 1h 0m' },
      { label: 'Raid week', value: '2026-W43' },
      { label: 'Raid status', value: 'open' },
      { label: 'Raid boss', value: 'bog-king' },
      { label: 'Creatures per player', value: 'default' },
      { label: 'Simulated players', value: '3' },
    ]);
  });

  it('shows the creatures-per-player override when one is set', () => {
    expect(clockRows({ ...view, raidSeats: 6 })).toContainEqual({
      label: 'Creatures per player',
      value: '6',
    });
  });

  it('says none without a raid week and leaves out the players when there are none', () => {
    const rows = clockRows({ ...view, raid: null, guests: 0 });
    expect(rows.map((r) => r.label)).toEqual(['Game time', 'Game day', 'Shifted by', 'Raid week']);
    expect(rows[3]?.value).toBe('none');
  });

  it('shows a dash for a raid without a boss yet', () => {
    const rows = clockRows({ ...view, raid: { weekId: '2026-W43', status: 'prep', bossId: null } });
    expect(rows.find((r) => r.label === 'Raid boss')?.value).toBe('-');
  });
});

describe('the creatures-per-player answer', () => {
  it("says the number, or that the boss's own piece is back", () => {
    expect(describeBench('raid-seats', { seats: 6 })).toBe('Creatures per player: 6.');
    expect(describeBench('raid-seats', { seats: null })).toBe(
      "Creatures per player: the boss's own piece again.",
    );
    expect(describeBench('raid-seats', {})).toBeNull();
  });
});

describe('the raid bench answers', () => {
  it('reads the fight to open from a play answer, and nothing from anything else', () => {
    expect(
      parseWatch({ stage: 1, watch: { week: '2027-W02', party: 2, phase: 'stage1' } }),
    ).toEqual({ week: '2027-W02', party: 2, phase: 'stage1' });
    expect(parseWatch({ stage: 3, watch: null })).toBeNull();
    expect(parseWatch({ watch: { week: '2027-W02', party: 2, phase: 'stage9' } })).toBeNull();
    expect(parseWatch({ watch: { week: 5, party: 2, phase: 'stage1' } })).toBeNull();
    expect(parseWatch({ watch: { week: 'w', party: 1.5, phase: 'stage1' } })).toBeNull();
    expect(parseWatch('nope')).toBeNull();
  });

  it('names a stage the way the replay screen does', () => {
    expect(replayPhaseOf('stage1')).toBe('phase1');
    expect(replayPhaseOf('stage2')).toBe('phase2');
    expect(replayPhaseOf('finale')).toBe('finale');
  });

  it('says what each step did in one sentence', () => {
    expect(describeBench('raid-clear', { rank: 8, clockMovedBack: true })).toBe(
      'The board is clear, Boss Rank 8. The clock went back into the preparation.',
    );
    expect(describeBench('raid-clear', { rank: 1, clockMovedBack: false })).toBe(
      'The board is clear, Boss Rank 1.',
    );
    expect(describeBench('raid-fill', { added: 1, boardFull: false })).toBe(
      '1 simulated player added.',
    );
    expect(describeBench('raid-fill', { added: 4, boardFull: true })).toBe(
      '4 simulated players added. The board is full.',
    );
    expect(describeBench('raid-rank', { rank: 8 })).toBe('Boss Rank 8 set.');
    expect(describeBench('raid-play', { stage: 1, live: false, bossFell: false })).toBe(
      'Stage 1 played.',
    );
    expect(describeBench('raid-play', { stage: 3, live: false, bossFell: true })).toBe(
      'The finale played. The boss fell.',
    );
    expect(describeBench('raid-play', { stage: 3, live: true })).toBe('The finale started live.');
    expect(describeBench('raid-play', {})).toBeNull();
    expect(describeBench('finish-jobs', { rank: 1 })).toBeNull();
  });
});
