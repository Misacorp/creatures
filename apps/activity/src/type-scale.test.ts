import { describe, expect, it } from 'vitest';

/**
 * No raw `font-size` in the stylesheets (`docs/design/ux-patterns.md`: sizes come from the type scale,
 * `--fs-title`, `--fs-heading`, `--fs-row` and `--fs-small` in `styles/base/tokens.css`). Since 2026-10-19 every
 * text size in the app is one of the four; the few files below keep the raw sizes that are display or art, not
 * rows of text, and may not add one. A file that is not listed may have none. The stage's effects
 * (`stage/fx.css`, `stage/patterns.css`) pick their sizes by hand on purpose and are not counted.
 */
const css = import.meta.glob<string>('./styles/**/*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const NOT_COUNTED = ['stage/fx.css', 'stage/patterns.css'];

/**
 * The raw `font-size` declarations each file keeps on purpose: the page's base size and the h1; the pixel
 * heading (3 rem and a fluid size); the glossary tag's mark (relative to its word); the living room's emoji and
 * speech labels (sized from the room's band); the How to play illustrations' labels; and the compact labels of
 * the 9-slot boards, the fight stage's unit names and the move track's round labels, which have to be
 * smaller than `--fs-small` to fit; and the count on a creature card's medal, sized to the medal's 10 px face.
 * (The narrowest phone's tab bar had one too, until the scale went a
 * rung smaller on 2026-10-19.)
 */
const ALLOWED: Readonly<Record<string, number>> = {
  'base/base.css': 2,
  'components/creature-honours.css': 1,
  'components/glossary-tag.css': 1,
  'components/lane-grid.css': 1,
  'components/pixel-heading.css': 2,
  'components/raid-board.css': 3,
  'components/slot-cue.css': 1,
  'components/slot-row.css': 2,
  'stage/effects.css': 2,
  'stage/move-track.css': 1,
  'stage/units.css': 2,
  'views/how-to-play.css': 6,
  'views/living-room.css': 2,
};

/** A `font-size` that is not a `var(...)`, comments left out. */
function rawSizes(source: string): number {
  const bare = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return (bare.match(/font-size\s*:\s*(?!var\()[^\s;]/g) ?? []).length;
}

describe('the type scale', () => {
  it('finds the stylesheets and reads their text (vitest returns empty CSS unless vite.config.ts lets ?raw through)', () => {
    expect(Object.keys(css).length).toBeGreaterThan(60);
    // The counter itself: a raw size is counted, a token and a comment are not.
    expect(rawSizes('a { font-size: 1rem; }')).toBe(1);
    expect(rawSizes('a { font-size:0.75rem }')).toBe(1);
    expect(rawSizes('a { font-size: var(--fs-row); }')).toBe(0);
    expect(rawSizes('a { /* font-size: 1rem; */ font-size: var(--fs-small); }')).toBe(0);
    const total = Object.values(css).reduce((sum, source) => sum + rawSizes(source), 0);
    expect(total).toBeGreaterThan(10);
  });

  it('keeps raw font-size only where it is display or art', () => {
    const over: string[] = [];
    for (const [path, source] of Object.entries(css)) {
      const file = path.replace('./styles/', '');
      if (NOT_COUNTED.includes(file)) continue;
      const found = rawSizes(source);
      const allowed = ALLOWED[file] ?? 0;
      if (found > allowed) {
        over.push(`${file}: ${String(found)} raw font-size, ${String(allowed)} allowed`);
      }
    }
    expect(over, 'use var(--fs-title | --fs-heading | --fs-row | --fs-small) instead').toEqual([]);
  });

  it('lists only files that exist', () => {
    const files = new Set(Object.keys(css).map((p) => p.replace('./styles/', '')));
    expect(Object.keys(ALLOWED).filter((f) => !files.has(f))).toEqual([]);
  });
});
