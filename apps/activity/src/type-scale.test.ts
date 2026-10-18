import { describe, expect, it } from 'vitest';

/**
 * No new raw `font-size` in the stylesheets (`docs/design/ux-patterns.md`: sizes come from the type scale,
 * `--fs-title`, `--fs-heading`, `--fs-row` and `--fs-small` in `styles/base/tokens.css`). Each file may keep the
 * raw sizes it has today (counted below) but not add one; a file that is not listed may have none. When you
 * switch a raw size to a token, lower its file's count here. The stage's effects (`stage/fx.css`,
 * `stage/patterns.css`) pick their sizes by hand on purpose and are not counted.
 */
const css = import.meta.glob<string>('./styles/**/*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const NOT_COUNTED = ['stage/fx.css', 'stage/patterns.css'];

/** The raw `font-size` declarations each file has today. */
const ALLOWED: Readonly<Record<string, number>> = {
  'base/base.css': 8,
  'base/controls.css': 2,
  'components/accordion.css': 4,
  'components/bars.css': 1,
  'components/cards.css': 3,
  'components/count-badge.css': 1,
  'components/creature-card.css': 2,
  'components/creature-finder.css': 5,
  'components/creature-focus.css': 13,
  'components/creature-page.css': 9,
  'components/currency-pile.css': 1,
  'components/drawer.css': 2,
  'components/element-chip.css': 1,
  'components/evolve.css': 7,
  'components/flip.css': 1,
  'components/glossary-tag.css': 2,
  'components/item-frame.css': 2,
  'components/item-tile.css': 1,
  'components/lane-grid.css': 2,
  'components/loot.css': 1,
  'components/picker.css': 4,
  'components/pixel-heading.css': 2,
  'components/pixel.css': 1,
  'components/popover.css': 7,
  'components/progress-track.css': 2,
  'components/raid-board.css': 4,
  'components/reveal.css': 2,
  'components/roster-picker.css': 6,
  'components/slot-cue.css': 3,
  'components/slot-row.css': 5,
  'components/slot.css': 7,
  'components/switch.css': 1,
  'components/tabs.css': 4,
  'components/talents.css': 8,
  'components/title-plate.css': 2,
  'components/turn-strip.css': 1,
  'components/xp-bar.css': 2,
  'components/xp-gain.css': 2,
  'stage/abilities.css': 2,
  'stage/ability-auto.css': 2,
  'stage/ability-popover.css': 5,
  'stage/countdown.css': 1,
  'stage/single-row.css': 2,
  'stage/stage.css': 8,
  'stage/unit-hp.css': 1,
  'stage/units.css': 3,
  'views/after-action.css': 3,
  'views/app.css': 1,
  'views/dungeon-banner.css': 7,
  'views/dungeon-map.css': 5,
  'views/dungeon-results.css': 10,
  'views/dungeon-run.css': 10,
  'views/dungeon.css': 2,
  'views/expeditions/catalogue.css': 6,
  'views/expeditions/claim.css': 4,
  'views/expeditions/nav.css': 1,
  'views/expeditions/profile.css': 2,
  'views/expeditions/send.css': 11,
  'views/expeditions/trips.css': 6,
  'views/gear-slot.css': 1,
  'views/how-to-play.css': 10,
  'views/item-detail.css': 11,
  'views/job-reveal.css': 1,
  'views/live.css': 2,
  'views/living-room.css': 6,
  'views/raid-boss-card.css': 3,
  'views/raid-placement.css': 1,
  'views/raid-timeline.css': 6,
  'views/raid.css': 2,
  'views/replay.css': 1,
  'views/weather.css': 6,
  'views/workshop.css': 3,
};

/** A `font-size` that is not a `var(...)`, comments left out. */
function rawSizes(source: string): number {
  const bare = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return (bare.match(/font-size\s*:\s*(?!var\()/g) ?? []).length;
}

describe('the type scale', () => {
  it('finds the stylesheets and reads their text (vitest returns empty CSS unless vite.config.ts lets ?raw through)', () => {
    expect(Object.keys(css).length).toBeGreaterThan(60);
    const total = Object.values(css).reduce((sum, source) => sum + rawSizes(source), 0);
    expect(total).toBeGreaterThan(100);
  });

  it('adds no raw font-size outside the files that already have them', () => {
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
