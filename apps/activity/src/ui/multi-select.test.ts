import { describe, expect, it } from 'vitest';
import { NO_SELECTION, pruned, rangeTo, toggled, withItem } from './multi-select';

/** A list's selection (2026-10-27): toggling, ranges in the shown order, pruning. */

const ORDER = ['a', 'b', 'c', 'd', 'e'];
const ids = (s: { ids: ReadonlySet<string> }): string[] => [...s.ids].sort();

describe('the selection', () => {
  it('starts empty, with no anchor', () => {
    expect(NO_SELECTION.ids.size).toBe(0);
    expect(NO_SELECTION.anchor).toBeNull();
  });

  it('toggles an item and makes it the anchor', () => {
    const one = toggled(NO_SELECTION, 'b');
    expect(ids(one)).toEqual(['b']);
    expect(one.anchor).toBe('b');
    const two = toggled(one, 'd');
    expect(ids(two)).toEqual(['b', 'd']);
    expect(two.anchor).toBe('d');
    const off = toggled(two, 'b');
    expect(ids(off)).toEqual(['d']);
    expect(off.anchor).toBe('b');
  });

  it('never changes the selection it was given', () => {
    const one = toggled(NO_SELECTION, 'a');
    toggled(one, 'b');
    withItem(one, 'c');
    expect(ids(one)).toEqual(['a']);
    expect(NO_SELECTION.ids.size).toBe(0);
  });

  it('selects an item without flipping it', () => {
    const one = withItem(NO_SELECTION, 'a');
    expect(ids(withItem(one, 'a'))).toEqual(['a']);
    expect(withItem(one, 'c').anchor).toBe('c');
  });

  it('adds the range from the anchor to an item, both ends included, either way round', () => {
    const from = toggled(NO_SELECTION, 'b');
    expect(ids(rangeTo(from, 'd', ORDER))).toEqual(['b', 'c', 'd']);
    expect(ids(rangeTo(from, 'a', ORDER))).toEqual(['a', 'b']);
    // The anchor stays, so the next range starts from the same place.
    expect(rangeTo(from, 'd', ORDER).anchor).toBe('b');
    expect(ids(rangeTo(rangeTo(from, 'e', ORDER), 'a', ORDER))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('keeps what was already selected when it adds a range', () => {
    const base = toggled(toggled(NO_SELECTION, 'e'), 'a');
    expect(ids(rangeTo(base, 'c', ORDER))).toEqual(['a', 'b', 'c', 'e']);
  });

  it('is just the item without an anchor, or when the anchor has left the list', () => {
    expect(ids(rangeTo(NO_SELECTION, 'c', ORDER))).toEqual(['c']);
    const gone = toggled(NO_SELECTION, 'x');
    expect(ids(rangeTo(gone, 'c', ORDER))).toEqual(['c', 'x']);
    // An item that is not in the list changes nothing.
    expect(rangeTo(gone, 'zzz', ORDER)).toBe(gone);
  });

  it('drops ids that are not in the bag any more, and an anchor that left', () => {
    const picked = toggled(toggled(toggled(NO_SELECTION, 'a'), 'b'), 'c');
    expect(pruned(picked, new Set(ORDER))).toBe(picked);
    const after = pruned(picked, new Set(['a', 'b']));
    expect(ids(after)).toEqual(['a', 'b']);
    expect(after.anchor).toBeNull();
    const kept = pruned(toggled(toggled(NO_SELECTION, 'a'), 'b'), new Set(['b']));
    expect(ids(kept)).toEqual(['b']);
    expect(kept.anchor).toBe('b');
    expect(pruned(NO_SELECTION, new Set()).ids.size).toBe(0);
  });
});
