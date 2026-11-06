import { describe, expect, it } from 'vitest';

/**
 * Every map or scene that pans sideways (a box wired to `useDragScroll` or `useRoomScroll`) shows the one shared
 * cue, `ui/PanHint` (Misa, 2026-11-06). A scrolling map that lacks it fails here; fix it by drawing
 * `<PanHint target={ref} id="..." />` next to the scrolling box, never a hint of its own.
 */
const sources = import.meta.glob<string>(['../**/*.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('pan hint guard', () => {
  const panning = Object.entries(sources).filter(([, src]) =>
    /\buse(?:DragScroll|RoomScroll)\(/.test(src),
  );

  it('finds the scrolling maps it guards', () => {
    expect(panning.length).toBeGreaterThanOrEqual(4);
  });

  it.each(panning.map(([file]) => file))('%s draws a PanHint', (file) => {
    expect(sources[file]).toMatch(/<PanHint\b/);
  });

  it('no screen draws a pan hint of its own', () => {
    const own = Object.entries(sources).filter(
      ([file, src]) => !file.includes('PanHint.tsx') && /pan-hint-(?:edge|left|right)/.test(src),
    );
    expect(own.map(([file]) => file)).toEqual([]);
  });
});
