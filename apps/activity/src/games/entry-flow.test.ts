import { describe, expect, it, vi } from 'vitest';
import type { GamesNext, LineupEvent } from '../games-types';
import { DOES_NOT_FIT, ENTRIES_CLOSED, dropEntry, putEntry } from './entry-flow';

const solo = (id: string): LineupEvent => ({
  id,
  name: id,
  kind: 'chase',
  scene: 'melon-hill',
  team: 1,
  line: '',
  favours: [],
});
const team: LineupEvent = { ...solo('log-carry'), team: 3 };
const melon = solo('melon-run');
const pepper = solo('pepper-panic');

const day = (entries: GamesNext['entries'], open = true): GamesNext => ({
  day: '2027-01-12',
  lockAt: 1,
  showAt: 2,
  open,
  lineup: [melon, pepper, team],
  entries,
  goodFit: {},
  badges: {},
});

const answer = (next: GamesNext) => (_day: string, eventId: string, ids: readonly string[]) =>
  Promise.resolve({ ...next, entries: { ...next.entries, [eventId]: [...ids] } });

describe('putEntry', () => {
  it('sends the event’s whole list with the creature in its slot', async () => {
    const next = day({ 'log-carry': ['a'] });
    const setEntry = vi.fn(answer(next));
    const out = await putEntry(setEntry, next, team, 1, 'b');
    expect(setEntry).toHaveBeenCalledTimes(1);
    expect(setEntry).toHaveBeenCalledWith('2027-01-12', 'log-carry', ['a', 'b']);
    expect(out.entries['log-carry']).toEqual(['a', 'b']);
  });

  it('takes a creature out of the event it is in before entering it somewhere else', async () => {
    const next = day({ 'melon-run': ['a'], 'log-carry': ['b', 'c'] });
    const setEntry = vi.fn(answer(next));
    await putEntry(setEntry, next, pepper, 0, 'b');
    expect(setEntry.mock.calls).toEqual([
      ['2027-01-12', 'log-carry', ['c']],
      ['2027-01-12', 'pepper-panic', ['b']],
    ]);
  });

  it('empties a slot with null, and asks the server once for it', async () => {
    const next = day({ 'melon-run': ['a'] });
    const setEntry = vi.fn(answer(next));
    const out = await putEntry(setEntry, next, melon, 0, null);
    expect(setEntry).toHaveBeenCalledTimes(1);
    expect(out.entries['melon-run']).toEqual([]);
  });
});

describe('dropEntry: what a creature dropped on a stall does', () => {
  it('goes to the first empty slot', () => {
    expect(dropEntry(day({}), melon, 'a')).toEqual({ kind: 'enter', slot: 0 });
    expect(dropEntry(day({ 'log-carry': ['a'] }), team, 'b')).toEqual({ kind: 'enter', slot: 1 });
    expect(dropEntry(day({ 'log-carry': ['a', 'b'] }), team, 'c')).toEqual({
      kind: 'enter',
      slot: 2,
    });
  });

  it('moves a creature that is in another event', () => {
    expect(dropEntry(day({ 'melon-run': ['a'] }), pepper, 'a')).toEqual({
      kind: 'enter',
      slot: 0,
    });
  });

  it('is refused by a locked show with the closed-entries line', () => {
    expect(dropEntry(day({}, false), melon, 'a')).toEqual({
      kind: 'refuse',
      message: ENTRIES_CLOSED,
    });
    expect(ENTRIES_CLOSED).toBe('Entries are closed for this show.');
  });

  it('is refused by a stall with every slot taken, with the team line', () => {
    expect(dropEntry(day({ 'melon-run': ['a'] }), melon, 'b')).toEqual({
      kind: 'refuse',
      message: DOES_NOT_FIT,
    });
    expect(dropEntry(day({ 'log-carry': ['a', 'b', 'c'] }), team, 'd')).toEqual({
      kind: 'refuse',
      message: DOES_NOT_FIT,
    });
  });

  it('does nothing for a creature that is at the stall already', () => {
    expect(dropEntry(day({ 'log-carry': ['a', 'b'] }), team, 'b')).toEqual({ kind: 'none' });
    expect(dropEntry(day({ 'melon-run': ['a'] }), melon, 'a')).toEqual({ kind: 'none' });
  });
});
