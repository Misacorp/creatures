import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Creature } from '../api';
import type { LineupEvent } from '../games-types';
import { byClass, byRole, createPage, nameOf, visibleText, type Page } from '../test-dom';
import { GAMES_FIXTURES, gamesRoster } from '../workbench/games-tab-sample';
import { EntryPicker } from './EntryPicker';

/**
 * The entry picker: the "Good fit" badge on the server's good fits (first in the list, no scores), the
 * creature's badge for this event beside its name, and the size mark: when an event favours small or
 * big creatures, each creature of that size shows the favour's glyph (the size rule is
 * `gamesIsSmall`); otherwise none.
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

function draw(
  favours: LineupEvent['favours'],
  extra: Partial<typeof GAMES_FIXTURES.entries.next> = {},
): Page {
  const base = GAMES_FIXTURES.entries.next.lineup[0];
  if (base === undefined) throw new Error('no lineup');
  page = createPage();
  page.draw(
    <EntryPicker
      event={{ ...base, favours }}
      slot={0}
      next={{ ...GAMES_FIXTURES.entries.next, entries: {}, ...extra }}
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

  it("does not show the creatures' levels (level does not matter in the Games)", () => {
    const p = draw(['hp']);
    expect(byRole(p.root, 'option').length).toBeGreaterThan(0);
    expect(byClass(p.root, 'ro-level')).toHaveLength(0);
    expect(visibleText(p.root)).not.toMatch(/Lv \d/);
  });

  it('shows no size mark when the event favours no size', () => {
    const p = draw(['hp', 'ember']);
    expect(byClass(p.root, 'ge-size')).toHaveLength(0);
  });

  it('lists the good fits first with the "Good fit" badge, and no pips or scores', () => {
    const eventId = GAMES_FIXTURES.entries.next.lineup[0]?.id ?? '';
    const p = draw(['hp'], { goodFit: { [eventId]: ['c-single', 'c-evolved'] } });
    const options = byRole(p.root, 'option');
    const marked = options.filter((o) => byClass(o, 'ge-goodfit').length > 0);
    expect(marked.map((o) => visibleText(o))).toEqual([
      expect.stringContaining('Grown'),
      expect.stringContaining('Lamp'),
    ]);
    expect(options.slice(0, 2)).toEqual(marked);
    expect(visibleText(marked[0] ?? p.root)).toContain('Good fit');
    expect(byClass(p.root, 'pips')).toHaveLength(0);
    expect(visibleText(p.root)).not.toMatch(/\d \/ 5/);
  });

  it("shows a creature's badge for this event, with its wins, beside its name", () => {
    const eventId = GAMES_FIXTURES.entries.next.lineup[0]?.id ?? '';
    const p = draw(['hp'], { badges: { [eventId]: { 'c-single': 3 }, other: { 'c-evolved': 2 } } });
    const badges = byClass(p.root, 'ge-badge');
    expect(badges).toHaveLength(1);
    expect(visibleText(badges[0] ?? p.root)).toBe('×3');
    const row = byRole(p.root, 'option').find((o) => byClass(o, 'ge-badge').length > 0);
    expect(visibleText(row ?? p.root)).toContain('Lamp');
    expect(nameOf(badges[0] ?? p.root)).toMatch(/badge, won 3 times$/);
  });
});
