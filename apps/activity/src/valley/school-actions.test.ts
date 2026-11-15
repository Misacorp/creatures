import { describe, expect, it, vi } from 'vitest';
import { createKeyStore } from '../actions';
import { createActionRunner } from '../action-runner';
import { ApiError, type SchoolState } from '../api';
import { errorText } from '../game';
import { createSchoolActions, isSchoolRefusal, refreshSchool } from './school-actions';
import { sampleSchool } from './school-sample';

/** The real runner (as `Game` uses it) and a screen that remembers what it was told. */
function setup() {
  const errors: (string | null)[] = [];
  const runner = createActionRunner(() => ({
    keys: createKeyStore(() => 'key'),
    errorText,
    isStale: () => false,
    setBusy: () => undefined,
    setError: (text) => errors.push(text),
    setNotice: () => undefined,
    isMounted: () => true,
  }));
  const screen = { school: null as SchoolState | null, valley: 0 };
  const server = { seatAtSchool: vi.fn(), fetchSchool: vi.fn() };
  const actions = createSchoolActions({
    run: runner.run,
    takeValley: (answer) => {
      if (answer === undefined) return false;
      screen.valley += 1;
      return true;
    },
    setSchool: (view) => {
      screen.school = view;
    },
    server,
  });
  return { actions, server, screen, errors };
}

describe('seating a student', () => {
  it('seats the creature, takes the valley in, and reads the School again (the seat shows what the server says)', async () => {
    const { actions, server, screen } = setup();
    const after = sampleSchool({ seated: ['c1', null], wouldLearn: ['c1'] });
    server.seatAtSchool.mockResolvedValue({
      valley: {},
      state: {},
      seat: { index: 0, creatureId: 'c1' },
    });
    server.fetchSchool.mockResolvedValue(after);
    expect(await actions.seat(0, 'c1')).toBe(true);
    expect(server.seatAtSchool).toHaveBeenCalledWith({ index: 0, creatureId: 'c1' });
    expect(screen.valley).toBe(1);
    expect(screen.school).toEqual(after);
  });

  it('takes a student off with null', async () => {
    const { actions, server } = setup();
    server.seatAtSchool.mockResolvedValue({
      valley: {},
      state: {},
      seat: { index: 1, creatureId: null },
    });
    server.fetchSchool.mockResolvedValue(sampleSchool());
    await actions.seat(1, null);
    expect(server.seatAtSchool).toHaveBeenCalledWith({ index: 1, creatureId: null });
  });

  it('shows a refusal as the shared alert text and takes nothing in', async () => {
    for (const [code, words] of [
      ['no_teacher', 'No teacher is at the School right now.'],
      ['would_not_learn', 'That creature would not learn this lesson.'],
      ['line_seated', 'A creature of the same kind already sits at the School.'],
    ] as const) {
      const { actions, server, screen, errors } = setup();
      server.seatAtSchool.mockRejectedValue(new ApiError(409, code));
      expect(await actions.seat(0, 'c1')).toBe(false);
      expect(screen.valley).toBe(0);
      expect(errors.at(-1)).toBe(words);
    }
  });

  it('keeps what the screen has when the read after a seating fails', async () => {
    const { actions, server, screen } = setup();
    server.seatAtSchool.mockResolvedValue({
      valley: {},
      state: {},
      seat: { index: 0, creatureId: 'c1' },
    });
    server.fetchSchool.mockRejectedValue(new Error('offline'));
    expect(await actions.seat(0, 'c1')).toBe(true);
    expect(screen.school).toBeNull();
  });
});

describe('the refusals that say the School is not as the screen thought', () => {
  it('are the three 409 codes, nothing else', () => {
    expect(isSchoolRefusal(new ApiError(409, 'no_teacher'))).toBe(true);
    expect(isSchoolRefusal(new ApiError(409, 'would_not_learn'))).toBe(true);
    expect(isSchoolRefusal(new ApiError(409, 'line_seated'))).toBe(true);
    expect(isSchoolRefusal(new ApiError(404, 'not_found'))).toBe(false);
    expect(isSchoolRefusal(new ApiError(409, 'visitor_away'))).toBe(false);
    expect(isSchoolRefusal(new Error('x'))).toBe(false);
  });

  it('read again: the screen follows the server, and a failed read changes nothing', async () => {
    let held: SchoolState | null = null;
    await refreshSchool(
      (view) => {
        held = view;
      },
      () => Promise.resolve(sampleSchool({ phase: 'away' })),
    );
    expect(held).toEqual(sampleSchool({ phase: 'away' }));
    await refreshSchool(
      () => {
        throw new Error('not reached');
      },
      () => Promise.reject(new Error('offline')),
    );
  });
});
