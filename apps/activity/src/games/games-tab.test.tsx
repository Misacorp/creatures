import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionIds } from '../actions';
import type { GamesView } from '../games-types';
import { byClass, byName, byRole, createPage, visibleText, type Page } from '../test-dom';
import {
  GAMES_FIXTURES,
  GAMES_SELF_ID,
  gamesRoster,
  gamesView,
} from '../workbench/games-tab-sample';
import { GamesTab } from './GamesTab';

/**
 * The Games tab drawn from the real captured answers: each phase shows what it should, a slot opens
 * the picker and a pick sends the entry and shows the answer, a creature in another event leaves it
 * first, and a stall purchase carries its key and shows the prize.
 */
let page: Page | null = null;
const roster = gamesRoster();

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

function fakeApi() {
  return { setEntry: vi.fn(), buy: vi.fn() };
}

function draw(view: GamesView, offset: number, api = fakeApi(), onView = vi.fn()) {
  page = createPage();
  const props = {
    view,
    failed: false,
    creatures: roster,
    selfId: GAMES_SELF_ID,
    offset,
    onView,
    onReload: vi.fn(),
    onPurchased: vi.fn(),
    api,
  };
  page.draw(<GamesTab {...props} />);
  return { page, api, onView, props };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('the Games tab', () => {
  it('shows the title and the three events with slots while entries are open, and no auto-entry', () => {
    const { view, offset } = gamesView('entries: one entered');
    const { page: p } = draw(view, offset);
    const text = visibleText(p.root);
    expect(text).toContain('Valley Games');
    for (const e of view.next.lineup) expect(text).toContain(e.name);
    // Two solo slots and the team's three seats; Melon Run holds the fixture's Splashet, a good fit.
    expect(byClass(p.root, 'ge-slot')).toHaveLength(5);
    expect(byName(p.root, 'button', 'Melon Run: Splashet, good fit')).toHaveLength(1);
    expect(byClass(p.root, 'ge-goodfit')).toHaveLength(1);
    expect(byRole(p.root, 'switch')).toHaveLength(0);
    expect(text).not.toContain('Auto-entry');
    expect(text).toContain('Opens');
  });

  it('shows the last show (medals, experience, replay) over the next lineup after a show', () => {
    const { view, offset } = gamesView('after: results and the next lineup');
    const { page: p } = draw(view, offset);
    // The player entered a solo event and the team event: two results.
    expect(byClass(p.root, 'gr-row')).toHaveLength(2);
    expect(byName(p.root, 'button', 'Replay Melon Run')).toHaveLength(1);
    // One row per creature that ran: the solo entrant and a team of two.
    expect(byClass(p.root, 'xp-row')).toHaveLength(3);
    // The next day is a Wednesday: three events and the bonus event, which wears the ribbon.
    expect(byClass(p.root, 'ge-card')).toHaveLength(4);
    const ribbons = byClass(p.root, 'ge-bonus');
    expect(ribbons).toHaveLength(1);
    expect(visibleText(ribbons[0] ?? p.root)).toBe('Bonus');
    // No bonus event in the last show (a Tuesday): no "2x" on its results.
    expect(byClass(p.root, 'gr-bonus')).toHaveLength(0);
    // The medal table marks you.
    expect(byClass(p.root, 'mine')).toHaveLength(1);
  });

  it('marks the bonus event of the last show with a "2x" by its medal', () => {
    const { view, offset } = gamesView('after: results and the next lineup');
    const last = view.you.lastResults;
    if (last === undefined) throw new Error('no results');
    const results = last.results.map((r, i) => (i === 0 ? { ...r, bonus: true as const } : r));
    const { page: p } = draw(
      { ...view, you: { ...view.you, lastResults: { ...last, results } } },
      offset,
    );
    const marks = byClass(p.root, 'gr-bonus');
    expect(marks).toHaveLength(1);
    expect(visibleText(marks[0] ?? p.root)).toBe('2x');
  });

  it('plays the replay from an event, with Back to the tab', () => {
    const { view, offset } = gamesView('after: results and the next lineup');
    const { page: p } = draw(view, offset);
    const [replay] = byName(p.root, 'button', 'Replay Log Carry');
    if (replay === undefined) throw new Error('no replay');
    p.click(replay);
    expect(byClass(p.root, 'games-show')).toHaveLength(1);
    expect(visibleText(p.root)).toContain('Log Carry');
    const [back] = byClass(p.root, 'drill-back');
    if (back === undefined) throw new Error('no back');
    p.click(back);
    expect(byClass(p.root, 'games-show')).toHaveLength(0);
  });

  it('shows the stands after the lock, your entrants locked under them', () => {
    const { view, offset } = gamesView('locked: the stands');
    const { page: p } = draw(view, offset);
    expect(byClass(p.root, 'games-show')).toHaveLength(1);
    expect(byClass(p.root, 'gt-head')).toHaveLength(0);
    expect(byRole(p.root, 'switch')).toHaveLength(0);
    expect(byClass(p.root, 'is-locked').length).toBeGreaterThan(0);
  });

  it('plays the show live while it is on', () => {
    const { view, offset } = gamesView('show: live');
    const { page: p } = draw(view, offset);
    expect(byClass(p.root, 'gs-live')).toHaveLength(1);
  });

  it('opens the picker from a slot and sends the pick, then shows the answer', async () => {
    const { view, offset } = gamesView('entries: none entered');
    const api = fakeApi();
    const zip = roster.find((c) => c.species === 'splashet');
    if (zip === undefined) throw new Error('no creature');
    const answer = { ...view.next, entries: { 'melon-run': [zip.id] } };
    api.setEntry.mockResolvedValue(answer);
    const { page: p, onView } = draw(view, offset, api);
    const [slot] = byName(p.root, 'button', 'Melon Run: empty');
    if (slot === undefined) throw new Error('no slot');
    p.click(slot);
    const options = byRole(p.root, 'option');
    expect(options).toHaveLength(roster.length);
    // The good fits first (Splashet and Zipmouse in the capture), by name; no scores.
    expect(visibleText(options[0] ?? p.root)).toContain('Splashet');
    expect(visibleText(options[0] ?? p.root)).toContain('Good fit');
    expect(visibleText(options[1] ?? p.root)).toContain('Zipmouse');
    expect(visibleText(options[2] ?? p.root)).not.toContain('Good fit');
    p.click(options[0] ?? p.root);
    await flush();
    expect(api.setEntry).toHaveBeenCalledWith(view.next.day, 'melon-run', [zip.id]);
    expect(onView).toHaveBeenCalledWith({ ...view, next: answer });
    expect(byRole(p.root, 'option')).toHaveLength(0);
  });

  it('moves a creature from another event: it leaves that event first', async () => {
    const { view, offset } = gamesView('entries: one entered');
    const api = fakeApi();
    const splashet = roster[0];
    if (splashet === undefined) throw new Error('no creature');
    api.setEntry
      .mockResolvedValueOnce({ ...view.next, entries: {} })
      .mockResolvedValueOnce({ ...view.next, entries: { 'pepper-panic': [splashet.id] } });
    const { page: p } = draw(view, offset, api);
    const [slot] = byName(p.root, 'button', 'Pepper Panic: empty');
    if (slot === undefined) throw new Error('no slot');
    p.click(slot);
    const option = byRole(p.root, 'option').find((o) => visibleText(o).includes('In Melon Run'));
    if (option === undefined) throw new Error('no option');
    p.click(option);
    await flush();
    expect(api.setEntry.mock.calls).toEqual([
      [view.next.day, 'melon-run', []],
      [view.next.day, 'pepper-panic', [splashet.id]],
    ]);
  });

  it('clears a slot', async () => {
    const { view, offset } = gamesView('entries: one entered');
    const api = fakeApi();
    api.setEntry.mockResolvedValue({ ...view.next, entries: {} });
    const { page: p } = draw(view, offset, api);
    const [slot] = byName(p.root, 'button', /^Melon Run: Splashet/);
    if (slot === undefined) throw new Error('no slot');
    p.click(slot);
    const [clear] = byName(p.root, 'button', 'Clear');
    if (clear === undefined) throw new Error('no clear');
    p.click(clear);
    await flush();
    expect(api.setEntry).toHaveBeenCalledWith(view.next.day, 'melon-run', []);
  });

  it('buys at the open stall with an idempotency key and shows the prize', async () => {
    const { view, offset } = gamesView('after: stall open');
    const api = fakeApi();
    api.buy.mockResolvedValue(GAMES_FIXTURES.stallBuy);
    const { page: p, onView, props } = draw(view, offset, api);
    const buttons = byName(p.root, 'button', /^Buy/);
    expect(buttons.length).toBe(view.stall.offers.length);
    // The prize box costs 9, the pocket holds 7: it says so and cannot be bought.
    expect(buttons[0]?.hasAttribute('disabled')).toBe(true);
    expect(visibleText(buttons[0] ?? p.root)).toContain('Not enough');
    const bait = buttons[2];
    if (bait === undefined) throw new Error('no offer');
    p.click(bait);
    await flush();
    expect(api.buy).toHaveBeenCalledTimes(1);
    const [offerId, key] = api.buy.mock.calls[0] as [string, string];
    expect(offerId).toBe('bait-sack');
    expect(key.length).toBeGreaterThan(8);
    expect(onView).toHaveBeenCalledWith({
      ...view,
      you: GAMES_FIXTURES.stallBuy.you,
      stall: GAMES_FIXTURES.stallBuy.stall,
    });
    expect(props.onPurchased).toHaveBeenCalledTimes(1);
    expect(byClass(p.root, 'gs-reveal')).toHaveLength(1);
    expect(ActionIds.gamesBuy('2027-01-13', 'bait-sack', 2)).toBe(
      'games-buy:2027-01-13:bait-sack:2',
    );
  });

  it('shows a shuttered stall with when it opens on other days', () => {
    const { view, offset } = gamesView('entries: none entered');
    const { page: p } = draw(view, offset);
    expect(byClass(p.root, 'gs-shutter')).toHaveLength(1);
    expect(byName(p.root, 'button', /^Buy/)).toHaveLength(0);
  });
});
