import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  byClass,
  byName,
  createPage,
  find,
  visibleText,
  type FakeElement,
  type Page,
} from '../test-dom';
import { GAMES_FIXTURES } from '../workbench/games-tab-sample';
import { PopoverHost } from '../PopoverHost';
import { CreatureGamesRow } from './CreatureGamesRow';
import { TrophyBoard } from './RoomTrophy';

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

const flush = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

describe("a creature's Games block", () => {
  it('loads its medals and records and shows them', async () => {
    const load = vi.fn().mockResolvedValue(GAMES_FIXTURES.creature);
    page = createPage();
    page.draw(<CreatureGamesRow creatureId="c1" load={load} />);
    await flush();
    page.update(() => undefined);
    expect(load).toHaveBeenCalledWith('c1');
    const text = visibleText(page.root);
    expect(text).toContain('Valley Games');
    expect(text).toContain('Melon Run');
    const best = GAMES_FIXTURES.creature.records[0]?.best ?? 0;
    expect(text).toContain(`${String(best)} m`);
    // Only the kinds it has: one silver.
    expect(byClass(page.root, 'gm-kind')).toHaveLength(1);
  });

  it('shows a badge per event won, with its count, most wins first; events never won are not shown', async () => {
    const games = {
      medals: { gold: 4, silver: 0, bronze: 0, pins: 0 },
      badges: [
        { eventId: 'melon-run', wins: 1 },
        { eventId: 'pepper-panic', wins: 3 },
      ],
      records: [],
    };
    page = createPage();
    page.draw(
      <PopoverHost onOpenHowTo={() => undefined}>
        <CreatureGamesRow creatureId="c1" load={() => Promise.resolve(games)} />
      </PopoverHost>,
    );
    await flush();
    page.update(() => undefined);
    const badges = byClass(page.root, 'ge-badge');
    expect(badges.map((b) => visibleText(b))).toEqual(['Pepper Panic×3', 'Melon Run×1']);
    // Each is a tag for the glossary, named for assistive technology.
    expect(byName(page.root, 'button', 'Pepper Panic badge, won 3 times')).toHaveLength(1);
    expect(byName(page.root, 'button', 'Melon Run badge, won once')).toHaveLength(1);
    expect(visibleText(page.root)).not.toContain('Log Carry');
  });

  it('shows nothing for a creature with no medals and no records, or when the load fails', async () => {
    page = createPage();
    const empty = {
      medals: { gold: 0, silver: 0, bronze: 0, pins: 0 },
      badges: [],
      records: [],
    };
    page.draw(<CreatureGamesRow creatureId="c1" load={() => Promise.resolve(empty)} />);
    await flush();
    expect(visibleText(page.root)).toBe('');
    page.draw(<CreatureGamesRow creatureId="c2" load={() => Promise.reject(new Error('x'))} />);
    await flush();
    expect(visibleText(page.root)).toBe('');
  });
});

describe("the trophy shelf's popover", () => {
  it('lists the top three, you marked, and opens the Games tab', () => {
    const onOpen = vi.fn();
    const board = ['a', 'b', 'me', 'd'].map((id, i) => ({
      userId: id,
      name: `P${id}`,
      gold: 4 - i,
      silver: 0,
      bronze: 0,
    }));
    page = createPage();
    page.draw(<TrophyBoard board={board} selfId="me" onOpen={onOpen} />);
    expect(visibleText(page.root)).not.toContain('Pd');
    // The shared medal table: a column per medal, the viewer's row marked.
    const [table] = byClass(page.root, 'gm-board');
    if (table === undefined) throw new Error('no medal table');
    expect(table.localName).toBe('table');
    expect(table.getAttribute('aria-label')).toBe('Medal table');
    expect(byClass(table, 'data-row')).toHaveLength(3);
    const mine = byClass(table, 'mine');
    expect(mine).toHaveLength(1);
    expect(visibleText(mine[0] as FakeElement)).toContain('Pme');
    const headings = find(table, (e) => e.getAttribute('scope') === 'col').map(visibleText);
    expect(headings).toEqual(['Player', 'Gold', 'Silver', 'Bronze']);
    const [games] = byName(page.root, 'button', 'Games');
    if (games === undefined) throw new Error('no button');
    page.click(games);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
