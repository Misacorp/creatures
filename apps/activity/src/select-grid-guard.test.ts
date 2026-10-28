import { describe, expect, it } from 'vitest';

/**
 * A guard against a second, hand-built way of selecting several things (ux-patterns.md, "Bulk actions"). Every list
 * where several things can be selected uses the shared parts: `useMultiSelect` holds the selection, `useSelectGrid`
 * wires the gestures (long press, checkbox, Ctrl, Shift, right click, keys, the spoken count) and `BulkBar` shows the
 * actions. A copy of those gestures would drift (the bag's took several rounds of Misa's phone tests to get right:
 * the click after a long press, the checkbox's size, no press flash), so the markers of one may appear only in the
 * shared files. To fix a failure, draw the new list with `useSelectGrid` (its comment says how).
 */

const sources = import.meta.glob<string>(['./**/*.ts', './**/*.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const code = Object.entries(sources).filter(
  ([file]) =>
    !/\.test\.tsx?$/.test(file) && !file.includes('/workbench/') && file !== './test-dom.ts',
);

/** Who may use each marker of a multi-select list, and why. */
const MARKERS: { marker: RegExp; allowed: readonly string[]; what: string }[] = [
  {
    marker: /aria-multiselectable/,
    allowed: ['./ui/use-select-grid.tsx'],
    what: 'a multi-select list (use useSelectGrid)',
  },
  {
    marker: /\buseHold\(/,
    allowed: ['./ui/long-press.ts', './ui/use-select-grid.tsx'],
    what: 'a long press (selecting: use useSelectGrid; anything else: ask first, a long press is the selection gesture)',
  },
  {
    marker: /role="checkbox"|'select-check/,
    allowed: ['./ui/SelectCheck.tsx'],
    what: 'a hand-drawn selection checkbox (use SelectCheck)',
  },
];

describe('one way to select several things', () => {
  it('finds the source files', () => {
    expect(code.length).toBeGreaterThan(100);
  });

  for (const { marker, allowed, what } of MARKERS) {
    it(`keeps ${what} in the shared files`, () => {
      const found = code
        .filter(([file, source]) => marker.test(source) && !allowed.includes(file))
        .map(([file]) => file);
      expect(found, `${what} found outside the shared parts`).toEqual([]);
    });
  }

  it('lists only allowed files that exist', () => {
    for (const { allowed } of MARKERS) {
      for (const file of allowed) expect(Object.keys(sources)).toContain(file);
    }
  });
});
