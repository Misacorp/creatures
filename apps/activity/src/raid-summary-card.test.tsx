import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PopoverHost } from './PopoverHost';
import { RaidSummaryCard, type SummaryMode } from './RaidSummaryCard';
import type { SummaryInput } from './raid-summary-view';
import { SUMMARY_CASES } from './workbench/raid-summary-data';
import {
  byClass,
  byName,
  byRole,
  createPage,
  find,
  visibleText,
  FakeElement,
  type Page,
} from './test-dom';

/**
 * The raid summary (2026-10-20: the scoreboard first, with the boss on top; every player in the table with
 * headings; the rewards as count badges only; the boss's order and moves as icons; the title level with its
 * badge). These tests draw the real `RaidSummaryCard` with the workbench's sample servers.
 */

let page: Page | null = null;
beforeEach(() => {
  // The little the fake DOM leaves out that a popover asks a browser for (its place on the page).
  vi.stubGlobal('window', {
    innerHeight: 800,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  Reflect.set(FakeElement.prototype, 'getBoundingClientRect', () => ({
    top: 0,
    left: 0,
    width: 10,
    height: 10,
  }));
});
afterEach(() => {
  page?.unmount();
  page = null;
  vi.unstubAllGlobals();
  Reflect.deleteProperty(FakeElement.prototype, 'getBoundingClientRect');
});

const [clear11, fail11, clear3, wiped3, phase2] = SUMMARY_CASES.map((c) => c.input);
if (!clear11 || !fail11 || !clear3 || !wiped3 || !phase2) throw new Error('missing samples');

function draw(
  input: SummaryInput,
  mode: SummaryMode = 'reveal',
  handlers: { dismiss?: boolean; replay?: boolean; open?: boolean } = {},
): Page {
  page = createPage();
  page.draw(
    <PopoverHost onOpenHowTo={() => undefined}>
      <RaidSummaryCard
        input={input}
        mode={mode}
        id="t-summary"
        onReplay={handlers.replay === false ? undefined : () => undefined}
        onDismiss={handlers.dismiss === false ? undefined : () => undefined}
        detailsOpen={handlers.open === true}
      />
    </PopoverHost>,
  );
  return page;
}

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

const text = (p: Page): string => visibleText(p.root);
const scoreboard = (p: Page): FakeElement =>
  first(
    find(
      p.root,
      (el) => el.localName === 'table' && el.getAttribute('aria-label') === 'Scoreboard',
    ),
  );

describe('the scoreboard', () => {
  it('lists every player with column headings, and no fold for "all players"', () => {
    const p = draw(clear11);
    const table = scoreboard(p);
    const headings = find(
      table,
      (el) => el.localName === 'th' && el.getAttribute('scope') === 'col',
    );
    expect(headings.map(visibleText)).toEqual(['Player', 'Damage', '%']);
    const body = find(table, (el) => el.localName === 'tbody')[0] as FakeElement;
    const rows = byClass(body, 'data-row');
    // Eleven players and the raid's total.
    expect(rows).toHaveLength(12);
    expect(text(p)).not.toContain('All 11 players');
    // Each row's name is its row header, so a value is read with its player.
    expect(
      find(body, (el) => el.localName === 'th' && el.getAttribute('scope') === 'row'),
    ).toHaveLength(12);
  });

  it('marks only the caller row, and puts the total last', () => {
    const p = draw(clear11);
    const rows = byClass(scoreboard(p), 'data-row');
    const mine = rows.filter((r) => (r.getAttribute('class') ?? '').includes('mine'));
    expect(mine).toHaveLength(1);
    expect(visibleText(first(mine))).toContain('You');
    const last = rows[rows.length - 1] as FakeElement;
    expect(last.getAttribute('class')).toContain('total');
    expect(visibleText(last)).toContain('Raid total');
  });

  it('shows all players of a small server too', () => {
    const p = draw(wiped3);
    expect(byClass(scoreboard(p), 'data-row')).toHaveLength(4);
  });
});

describe('the title and badge', () => {
  it('sit in one heading: the stage, then Cleared or Not cleared, then Close one!', () => {
    const p = draw(clear11);
    const heading = first(byName(p.root, 'h3', /Finale result/));
    expect(visibleText(heading)).toBe('Finale result Cleared');
    page?.unmount();
    const q = draw(fail11);
    expect(visibleText(first(byName(q.root, 'h3', /Finale result/)))).toBe(
      'Finale result Not cleared Close one!',
    );
  });

  it('is named by that heading, and is an h4 inside a Results list item', () => {
    const p = draw(phase2, 'result', { dismiss: false });
    const section = first(find(p.root, (el) => el.getAttribute('aria-labelledby') === 't-summary'));
    expect(section.localName).toBe('section');
    const heading = first(find(p.root, (el) => el.getAttribute('id') === 't-summary'));
    expect(heading.localName).toBe('h4');
    expect(visibleText(heading)).toBe('Phase 2 result Cleared');
  });
});

describe('the rewards', () => {
  it('are count badges per resource with no pile picture', () => {
    const p = draw(clear11);
    expect(byClass(p.root, 'reward-pile')).toHaveLength(0);
    const row = first(byClass(p.root, 'reward-row'));
    expect(row.getAttribute('class')).toContain('no-pile');
    const badges = first(byClass(row, 'reward-badges'));
    expect(visibleText(badges)).toContain('46');
    // The finale's parts are counts too (Scrap 4, Glimmer 1), and the gear is listed under its name.
    expect(text(p)).toContain('Finale reward');
    expect(byClass(p.root, 'loot')).toHaveLength(1);
  });

  it('name the Festival gear apart from the finale reward, and keep the Festival creature', () => {
    const p = draw(clear3);
    expect(text(p)).toContain('Finale reward');
    expect(text(p)).toContain('Festival gear');
    expect(text(p)).toContain('First on server');
  });

  it('keep the server rank and the season pips', () => {
    const p = draw(clear11);
    expect(text(p)).toContain('The server climbs to Rank 5.');
    expect(text(p)).toContain('Week 3 / 5 this season');
    expect(byClass(p.root, 'finale-progress')).toHaveLength(1);
  });
});

describe('the boss and its moves', () => {
  it('shows the headline, how it ended and its HP', () => {
    const p = draw(clear11);
    expect(text(p)).toContain('Tidal Colossus falls!');
    expect(text(p)).toContain('Down after 9 / 12 rounds.');
    expect(text(p)).toContain('Place 4 / 11');
  });

  it('has one icon for the turn order and one for each move, each a button', () => {
    const p = draw(clear11);
    const icons = byClass(p.root, 'boss-icon');
    const boss = clear11.boss;
    if (boss === null) throw new Error('no boss');
    expect(icons).toHaveLength(1 + boss.gimmicks.length);
    expect(icons.every((i) => i.localName === 'button')).toBe(true);
    expect(first(icons).getAttribute('aria-label')).toMatch(/^Turn order/);
    const list = first(byClass(p.root, 'boss-icons'));
    expect(list.getAttribute('aria-label')).toBe('How the boss fights');
  });

  it('opens a popover that explains the move when an icon is tapped', () => {
    const p = draw(clear11);
    const icons = byClass(p.root, 'boss-icon');
    const move = icons[1] as FakeElement;
    p.click(move);
    const dialog = first(byRole(p.root.parentNode ?? p.root, 'dialog'));
    expect(dialog.getAttribute('aria-label')).toBe(
      visibleText(first(byClass(move, 'boss-icon-caption'))),
    );
    expect(visibleText(dialog).length).toBeGreaterThan(20);
  });

  it('shows no move icons when the boss is not known, and says "The boss"', () => {
    const p = draw({ ...clear11, boss: null });
    expect(byClass(p.root, 'boss-icon')).toHaveLength(0);
    expect(text(p)).toContain('The boss falls!');
  });
});

describe('the buttons and the folded numbers', () => {
  it('has Watch replay and Got it on the finale card, and only Watch replay in the Results list', () => {
    const p = draw(clear11);
    expect(byName(p.root, 'button', 'Watch replay')).toHaveLength(1);
    expect(byName(p.root, 'button', 'Got it')).toHaveLength(1);
    page?.unmount();
    const q = draw(clear11, 'result', { dismiss: false });
    expect(byName(q.root, 'button', 'Watch replay')).toHaveLength(1);
    expect(byName(q.root, 'button', 'Got it')).toHaveLength(0);
  });

  it('keeps the other lists under More numbers', () => {
    const p = draw(clear11, 'reveal', { open: true });
    for (const title of ['More numbers', 'The fight', 'Top creatures', 'Reactions', 'Knockouts']) {
      expect(text(p), title).toContain(title);
    }
  });
});
