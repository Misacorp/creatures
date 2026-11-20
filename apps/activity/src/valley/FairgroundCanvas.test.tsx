/**
 * The Fairground as a canvas (`FairgroundCanvas`, the rule "A place is a canvas"): what is in the scene in each state of a show day and
 * what a click on each thing opens. Drawn in the fake DOM from the real captured answers; a phone has no `matchMedia` here, so a panel
 * is its own page (the shell's other half is in `PlaceCanvas.test`). Dragging is proved where its rules live (`entry-flow.test`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PopoverHost } from '../PopoverHost';
import type { GamesView } from '../games-types';
import {
  byClass,
  byName,
  byRole,
  createPage,
  visibleText,
  type FakeElement,
  type Page,
} from '../test-dom';
import {
  GAMES_SELF_ID,
  gamesRoster,
  gamesView,
  type GamesViewName,
} from '../workbench/games-tab-sample';
import { FairgroundCanvas, rosettesOf, type FairgroundStart } from './FairgroundCanvas';

let page: Page | null = null;
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterEach(() => {
  // The scene listens for Escape on the document and lets go of it on unmount; the fake DOM has none.
  vi.stubGlobal('document', {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  page?.unmount();
  vi.unstubAllGlobals();
  page = null;
});

const roster = gamesRoster();

function draw(name: GamesViewName, start: FairgroundStart = {}, over: Partial<GamesView> = {}) {
  const { view, offset } = gamesView(name);
  const api = { setEntry: vi.fn(), buy: vi.fn() };
  const onView = vi.fn();
  const p = createPage();
  page = p;
  p.draw(
    <PopoverHost onOpenHowTo={() => undefined}>
      <FairgroundCanvas
        view={{ ...view, ...over }}
        failed={false}
        creatures={roster}
        selfId={GAMES_SELF_ID}
        offset={offset}
        onView={onView}
        onReload={() => undefined}
        onPurchased={() => undefined}
        trayInput={{ trips: [], jobs: null, now: 0 }}
        onOpenPaddock={() => undefined}
        api={api}
        start={start}
      />
    </PopoverHost>,
  );
  return { page: p, api, onView, view };
}

const targets = (p: Page): FakeElement[] =>
  byClass(p.root, 'cv-target').filter((el) => el.localName === 'button');
const labels = (p: Page): string[] => targets(p).map((el) => el.getAttribute('aria-label') ?? '');
const target = (p: Page, name: RegExp): FakeElement => {
  const found = targets(p).find((el) => name.test(el.getAttribute('aria-label') ?? ''));
  if (found === undefined) throw new Error(`no target ${String(name)}`);
  return found;
};
const button = (p: Page, name: RegExp): FakeElement => {
  const el = byName(p.root, 'button', name)[0];
  if (el === undefined) throw new Error(`no button ${String(name)}`);
  return el;
};
const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
};

describe('the Fairground canvas with entries open', () => {
  it('has a stall for each event of the day, the tent, the Prize Stall and the Rules board, each with a plate', () => {
    const { page: p, view } = draw('entries: one entered');
    const names = labels(p);
    expect(names.every((n) => n !== '')).toBe(true);
    for (const event of view.next.lineup)
      expect(names.some((n) => n.startsWith(event.name))).toBe(true);
    expect(names.some((n) => /^The show tent/.test(n))).toBe(true);
    expect(names.some((n) => /^The Prize Stall/.test(n))).toBe(true);
    expect(names.some((n) => /^The rules/.test(n))).toBe(true);
    // One plate for each thing that can be tapped, and none for the decoration.
    for (const t of targets(p)) expect(byClass(t, 'cv-plate')).toHaveLength(1);
    expect(byClass(p.root, 'vy-tray').length).toBeGreaterThan(0);
  });

  it('keeps the old Games page out of the canvas: no event cards until a stall is tapped', () => {
    const { page: p } = draw('entries: one entered');
    expect(byClass(p.root, 'ge-card')).toHaveLength(0);
    expect(byClass(p.root, 'gt-head')).toHaveLength(0);
    expect(byClass(p.root, 'pc-page')).toHaveLength(0);
  });

  it('gives each stall a drop id, so a creature dragged from the tray finds it', () => {
    const { page: p, view } = draw('entries: one entered');
    const seats = targets(p).map((el) => el.getAttribute('data-seat'));
    for (const event of view.next.lineup) expect(seats).toContain(`stall:${event.id}`);
  });

  it('stands the entered creature at its stall and nowhere else', () => {
    const { page: p, view } = draw('entries: one entered');
    const first = view.next.lineup[0];
    if (first === undefined) throw new Error('no lineup');
    const stalls = byClass(p.root, 'fg-stall');
    expect(stalls).toHaveLength(view.next.lineup.length);
    const at = (id: string): number =>
      byClass(stalls.find((s) => s.getAttribute('data-event') === id) as FakeElement, 'vy-creature')
        .length;
    expect(at(first.id)).toBe(1);
    for (const event of view.next.lineup.slice(1)) expect(at(event.id)).toBe(0);
  });

  it('a stall opens its event in the drawer: story, favours and a slot; a slot is a step with Back', () => {
    const { page: p, view } = draw('entries: none entered');
    const first = view.next.lineup[0];
    if (first === undefined) throw new Error('no lineup');
    p.click(target(p, new RegExp(`^${first.name}`)));
    expect(visibleText(p.root)).toContain(first.line);
    expect(byClass(p.root, 'ge-favours')).toHaveLength(1);
    const slot = byClass(p.root, 'ge-slot').find((el) => el.localName === 'button');
    if (slot === undefined) throw new Error('no slot');
    p.click(slot);
    expect(byRole(p.root, 'option').length).toBeGreaterThan(0);
    expect(byClass(p.root, 'drill-back').length).toBeGreaterThan(0);
    // On a phone the page has its own Back to the fair; the step's is the last.
    p.click(byClass(p.root, 'drill-back').at(-1) as FakeElement);
    expect(byClass(p.root, 'ge-slot').length).toBeGreaterThan(0);
  });

  it('a pick sends the entry by the same action as the Games page, and the answer goes on screen', async () => {
    const { page: p, api, onView, view } = draw('entries: none entered');
    const first = view.next.lineup[0];
    if (first === undefined) throw new Error('no lineup');
    api.setEntry.mockResolvedValue({
      ...view.next,
      entries: { [first.id]: [roster[0]?.id ?? ''] },
    });
    p.click(target(p, new RegExp(`^${first.name}`)));
    p.click(byClass(p.root, 'ge-slot').find((el) => el.localName === 'button') as FakeElement);
    const [option] = byRole(p.root, 'option');
    if (option === undefined) throw new Error('no creature');
    p.click(option);
    await flush();
    expect(api.setEntry).toHaveBeenCalledTimes(1);
    const [day, eventId, ids] = api.setEntry.mock.calls[0] as [string, string, string[]];
    expect(day).toBe(view.next.day);
    expect(eventId).toBe(first.id);
    expect(ids).toHaveLength(1);
    expect(onView).toHaveBeenCalledTimes(1);
  });

  it('the Rules board shows the Games’ words in the drawer', () => {
    const { page: p } = draw('entries: none entered');
    p.click(target(p, /^The rules/));
    const text = visibleText(p.root);
    expect(text).toContain('Valley Games');
    expect(text).toContain('Good fit');
    expect(text).toContain('Medal points');
  });

  it('the tent opens the schedule', () => {
    const { page: p, view } = draw('entries: none entered');
    p.click(target(p, /^The show tent/));
    const text = visibleText(p.root);
    expect(text).toContain('Entries close');
    for (const event of view.next.lineup) expect(text).toContain(event.name);
  });

  it('a start request opens the drawer it names (the workbench and the tests)', () => {
    const { page: p } = draw('entries: none entered', { right: 'stall' });
    expect(byClass(p.root, 'ge-slot').length).toBeGreaterThan(0);
  });
});

describe('the Fairground canvas, the Prize Stall', () => {
  it('is shuttered off Wednesday: its plate says when it opens and the drawer has no Buy', () => {
    const { page: p } = draw('after: results and the next lineup');
    const stall = target(p, /^The Prize Stall is shuttered/);
    expect(visibleText(stall.parentElement ?? stall)).toMatch(/^Opens /);
    p.click(stall);
    expect(visibleText(p.root)).toMatch(/Opens /);
    expect(byName(p.root, 'button', /^Buy/)).toHaveLength(0);
  });

  it('is open on Wednesday: its offers are in the drawer with Buy', () => {
    const { page: p } = draw('after: stall open');
    const stall = target(p, /^The Prize Stall is open/);
    expect(visibleText(stall.parentElement ?? stall)).toContain('Prize Stall');
    p.click(stall);
    expect(byName(p.root, 'button', /Buy/).length).toBeGreaterThan(0);
  });
});

describe('the Fairground canvas, after a show and while it is locked', () => {
  it('hangs the medals of the last show on the tent as rosettes, and the corner buttons open the left drawer', () => {
    const { page: p, view } = draw('after: results and the next lineup');
    expect(rosettesOf(view).length).toBeGreaterThan(0);
    p.click(button(p, /^Last show/));
    expect(byClass(p.root, 'gr-row')).toHaveLength(2);
    expect(visibleText(p.root)).toContain('Watch the show');
  });

  it('the Medals button opens the cabinet with the server standings', () => {
    const { page: p } = draw('after: results and the next lineup');
    p.click(button(p, /^Medals/));
    expect(byClass(p.root, 'gm-cabinet')).toHaveLength(1);
    expect(byClass(p.root, 'mine')).toHaveLength(1);
  });

  it('Last show says so when there is none', () => {
    const { page: p } = draw('entries: none entered', { left: 'last' });
    expect(visibleText(p.root)).toContain('no show to look back on');
  });

  it('Watch the show puts the replay on the stage in place of the scene, with the standings in the drawer', () => {
    const { page: p } = draw('after: results and the next lineup', { left: 'last' });
    p.click(button(p, /Watch the show/));
    expect(byClass(p.root, 'games-show')).toHaveLength(1);
    expect(byClass(p.root, 'fg-stage')).toHaveLength(1);
    expect(byClass(p.root, 'vy-in-fairground')).toHaveLength(0);
    // No board in the stage itself.
    expect(byClass(byClass(p.root, 'games-show')[0] as FakeElement, 'gs-board')).toHaveLength(0);
  });

  it('closes the stalls and fills the stands once entries are locked, and still opens a stall without slots to tap', () => {
    const { page: p, view } = draw('locked: the stands');
    expect(view.next.open).toBe(false);
    expect(byClass(p.root, 'games-show')).toHaveLength(0);
    expect(visibleText(p.root)).toMatch(/Show in/);
    const first = view.next.lineup[0];
    if (first === undefined) throw new Error('no lineup');
    p.click(target(p, new RegExp(`^${first.name}`)));
    expect(byClass(p.root, 'ge-slot').filter((el) => el.localName === 'button')).toHaveLength(0);
    expect(visibleText(p.root)).toContain('Entries are closed for this show.');
  });

  it('puts the live show on the stage in place of the scene while it runs', () => {
    const { page: p } = draw('show: live');
    expect(byClass(p.root, 'games-show')).toHaveLength(1);
    expect(byClass(p.root, 'vy-in-fairground')).toHaveLength(0);
    expect(byClass(byClass(p.root, 'games-show')[0] as FakeElement, 'gs-board')).toHaveLength(0);
    // The corner button is Standings, not Last show.
    expect(byName(p.root, 'button', /^Standings/).length).toBeGreaterThan(0);
    expect(byName(p.root, 'button', /^Last show/)).toHaveLength(0);
  });
});

describe('the Fairground canvas, the live standings', () => {
  it('are drawn in the left drawer (a page on a phone) when Standings opens, not in the stage', async () => {
    const { page: p } = draw('show: live');
    p.click(button(p, /^Standings/));
    await flush();
    const host = byClass(p.root, 'fg-standings');
    expect(host).toHaveLength(1);
    expect(byClass(host[0] as FakeElement, 'gs-board').length).toBe(1);
    expect(byClass(byClass(p.root, 'games-show')[0] as FakeElement, 'gs-board')).toHaveLength(0);
    // Closing the drawer takes the board with it.
    p.click(byClass(p.root, 'drill-back')[0] as FakeElement);
    await flush();
    expect(byClass(p.root, 'gs-board')).toHaveLength(0);
  });
});

describe('the Fairground canvas before its answer', () => {
  it('says it is loading, and offers Try again when it failed', () => {
    const p = createPage();
    page = p;
    const props = {
      failed: false,
      creatures: roster,
      selfId: GAMES_SELF_ID,
      offset: 0,
      onView: () => undefined,
      onReload: () => undefined,
      onPurchased: () => undefined,
      trayInput: { trips: [], jobs: null, now: 0 },
      onOpenPaddock: () => undefined,
    };
    p.draw(<FairgroundCanvas view={null} {...props} />);
    expect(visibleText(p.root)).toContain('Loading');
    p.unmount();
    const q = createPage();
    page = q;
    q.draw(<FairgroundCanvas view={null} {...props} failed />);
    expect(visibleText(q.root)).toContain('The Games did not load.');
    expect(byName(q.root, 'button', /Try again/)).toHaveLength(1);
  });
});
