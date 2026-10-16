import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRAFT_SAVE_DELAY_MS, createDraftSaver } from './dungeon-draft';
import type { Slots } from './dungeon-team';

const A: Slots = ['a', null, null];
const B: Slots = ['a', 'b', null];
const C: Slots = ['b', 'a', 'c'];

describe('saving the dungeon team draft', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function saver(result: () => Promise<unknown> = () => Promise.resolve()) {
    const save = vi.fn<(team: Slots) => Promise<unknown>>(() => result());
    return { save, saver: createDraftSaver(save) };
  }

  it('waits about 800 ms after a change, then saves once', () => {
    expect(DRAFT_SAVE_DELAY_MS).toBe(800);
    const { save, saver: s } = saver();
    s.change(A);
    vi.advanceTimersByTime(799);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(A);
    vi.advanceTimersByTime(10_000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('sends only the last row of a burst, and restarts the wait with each change', () => {
    const { save, saver: s } = saver();
    s.change(A);
    vi.advanceTimersByTime(500);
    s.change(B);
    vi.advanceTimersByTime(500);
    expect(save).not.toHaveBeenCalled();
    s.change(C);
    vi.advanceTimersByTime(799);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save.mock.calls).toEqual([[C]]);
  });

  it('saves nothing when nothing changed', () => {
    const { save, saver: s } = saver();
    vi.advanceTimersByTime(10_000);
    s.flush();
    expect(save).not.toHaveBeenCalled();
    expect(s.pending()).toBe(false);
  });

  it('flushes a waiting row at once, only once', () => {
    const { save, saver: s } = saver();
    s.change(B);
    expect(s.pending()).toBe(true);
    s.flush();
    expect(save.mock.calls).toEqual([[B]]);
    expect(s.pending()).toBe(false);
    s.flush();
    vi.advanceTimersByTime(10_000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('forgets a cancelled row', () => {
    const { save, saver: s } = saver();
    s.change(B);
    s.cancel();
    s.flush();
    vi.advanceTimersByTime(10_000);
    expect(save).not.toHaveBeenCalled();
    expect(s.pending()).toBe(false);
  });

  it('saves a later change after an earlier save', () => {
    const { save, saver: s } = saver();
    s.change(A);
    vi.advanceTimersByTime(800);
    s.change(B);
    vi.advanceTimersByTime(800);
    expect(save.mock.calls).toEqual([[A], [B]]);
  });

  it('stays silent when a save fails, however it fails', () => {
    // A rejection must be handled by the saver (an unhandled one would be an error on the page).
    const failed = Promise.reject(new Error('offline'));
    const handled = vi.spyOn(failed, 'catch');
    const rejecting = createDraftSaver(() => failed);
    rejecting.change(A);
    vi.advanceTimersByTime(800);
    expect(handled).toHaveBeenCalledTimes(1);
    const throwing = createDraftSaver(() => {
      throw new Error('boom');
    });
    throwing.change(B);
    expect(() => {
      vi.advanceTimersByTime(800);
    }).not.toThrow();
    expect(throwing.pending()).toBe(false);
  });
});
