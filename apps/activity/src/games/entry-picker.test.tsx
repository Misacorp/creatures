import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Creature } from '../api';
import type { LineupEvent } from '../games-types';
import { byClass, byRole, createPage, nameOf, visibleText, type Page } from '../test-dom';
import { GAMES_FIXTURES, gamesRoster } from '../workbench/games-tab-sample';
import { EntryPicker } from './EntryPicker';

/**
 * The entry picker's size mark: when an event favours small or big creatures, each creature of that
 * size shows the favour's glyph beside its fit pips (the size rule is `gamesIsSmall`); otherwise none.
 */
let page: Page | null = null;

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});

afterEach(() => {
  page?.unmount();
  page = null;
  vi.unstubAllGlobals();
});

/** The sample roster (all young, small) plus an evolved creature and a single-stage line (both big). */
function mixedRoster(): Creature[] {
  const roster = gamesRoster();
  const first = roster[0];
  if (first === undefined) throw new Error('no roster');
  return [
    ...roster,
    { ...first, id: 'c-evolved', species: 'tidewing', nickname: 'Grown' },
    { ...first, id: 'c-single', species: 'lanternfin', nickname: 'Lamp' },
  ];
}

function draw(favours: LineupEvent['favours']): Page {
  const base = GAMES_FIXTURES.entries.next.lineup[0];
  if (base === undefined) throw new Error('no lineup');
  page = createPage();
  page.draw(
    <EntryPicker
      event={{ ...base, favours }}
      slot={0}
      next={{ ...GAMES_FIXTURES.entries.next, entries: {} }}
      creatures={mixedRoster()}
      busy={false}
      onPick={() => undefined}
      onClear={() => undefined}
      onClose={() => undefined}
    />,
  );
  return page;
}

function marked(p: Page): string[] {
  return byRole(p.root, 'option')
    .filter((o) => byClass(o, 'ge-size').length > 0)
    .map((o) => visibleText(o));
}

describe('EntryPicker', () => {
  it('marks the creatures that can still evolve when the event favours small', () => {
    const p = draw(['hp', 'small']);
    const rows = marked(p);
    // The six young creatures of the sample, not the evolved one or the single-stage line.
    expect(rows).toHaveLength(6);
    expect(rows.some((t) => t.includes('Grown') || t.includes('Lamp'))).toBe(false);
    const [mark] = byClass(p.root, 'ge-size');
    expect(mark?.classList.contains('is-small')).toBe(true);
    expect(nameOf(mark ?? p.root)).toBe('Small creature');
  });

  it('marks evolved creatures and single-stage lines when the event favours big', () => {
    const p = draw(['big']);
    const rows = marked(p);
    expect(rows).toHaveLength(2);
    expect(rows.some((t) => t.includes('Grown'))).toBe(true);
    expect(rows.some((t) => t.includes('Lamp'))).toBe(true);
    expect(byClass(p.root, 'ge-size').every((m) => m.classList.contains('is-big'))).toBe(true);
  });

  it('shows no size mark when the event favours no size', () => {
    const p = draw(['hp', 'ember']);
    expect(byClass(p.root, 'ge-size')).toHaveLength(0);
  });
});
