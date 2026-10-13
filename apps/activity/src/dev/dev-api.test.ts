import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api';
import {
  describeResult,
  errorCode,
  eventLine,
  formatOffset,
  parseDevEvents,
  parseDevState,
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
    });
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
