/**
 * The Signpost as a canvas (`SignpostCanvas`, the rule "A place is a canvas"): the scene, the expedition map a click on the signpost opens,
 * and the drawer a click on a destination opens. Drawn in the fake DOM; a phone has no `matchMedia` here, so a panel is its own page (the
 * shell's other half is in `PlaceCanvas.test`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PopoverHost } from '../PopoverHost';
import {
  badgesIn,
  byClass,
  byName,
  createPage,
  visibleText,
  type FakeElement,
  type Page,
} from '../test-dom';
import { homeInput } from '../workbench/home-sample';
import type { ValleyVisit } from '../api';
import { SignpostCanvas, type SignpostCanvasStart } from './SignpostCanvas';
import type { SignpostActions } from './SignpostSeats';
import { sampleSeat, sampleValley } from './signpost-sample';
import { trayStates } from './tray-state';

let page: Page | null = null;
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
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

const base = homeInput('busy', true);
const free = base.creatures.map((c) => ({ ...c, busy: null, away: false }));
const [a, b] = free;
if (a === undefined || b === undefined) throw new Error('fixture');

interface Calls {
  posts: { seatId: string; creatureId?: string | null; destination?: string }[];
  kits: [string, string | null][];
  actions: string[];
}

function draw(
  visit: ValleyVisit,
  options: { acorns?: number; start?: SignpostCanvasStart; calls?: Calls } = {},
): Page {
  const calls = options.calls ?? { posts: [], kits: [], actions: [] };
  const actions: SignpostActions = {
    post: (body) => {
      calls.posts.push(body);
      return Promise.resolve(true);
    },
    buySeat: () => {
      calls.actions.push('buySeat');
      return Promise.resolve(true);
    },
    buyKit: (kit) => {
      calls.actions.push(`buyKit:${kit}`);
      return Promise.resolve(true);
    },
    setKit: (seatId, kit) => {
      calls.kits.push([seatId, kit]);
      return Promise.resolve(true);
    },
  };
  const p = createPage();
  page = p;
  p.draw(
    <PopoverHost onOpenHowTo={() => undefined}>
      <SignpostCanvas
        visit={visit}
        creatures={free}
        trayInput={{ trips: [], jobs: null, now: 0, ...trayStates(visit) }}
        acorns={options.acorns ?? 500}
        busy={false}
        actions={actions}
        onOpenPaddock={() => undefined}
        start={options.start}
      />
    </PopoverHost>,
  );
  return p;
}

/** The scene's buttons (the targets): each one a real button with a name. */
const targets = (p: Page): FakeElement[] =>
  byClass(p.root, 'cv-target').filter((el) => el.localName === 'button');
const target = (p: Page, name: RegExp): FakeElement => {
  const found = targets(p).find((el) => name.test(el.getAttribute('aria-label') ?? ''));
  if (found === undefined) throw new Error(`no target ${String(name)}`);
  return found;
};
const marker = (p: Page, id: string): FakeElement => {
  const found = p.root.querySelector(`[data-place="${id}"]`);
  if (found === null) throw new Error(`no marker ${id}`);
  return found;
};

const one = sampleValley(free, [sampleSeat('seat-1', 'tidepools', a.id, 20)]);
const two = sampleValley(free, [
  sampleSeat('seat-1', 'tidepools', a.id, 80),
  sampleSeat('seat-2', 'ember-caves', b.id, 30),
]);

describe('the Signpost canvas: the scene', () => {
  it('has the signpost, a button for each seat, one dashed outline for the next with its price as icons, and the two props, all named', () => {
    const p = draw(one);
    const names = targets(p).map((el) => el.getAttribute('aria-label') ?? '');
    expect(names.every((n) => n !== '')).toBe(true);
    expect(names.some((n) => /^The signpost/.test(n))).toBe(true);
    expect(names.filter((n) => /^Seat \d/.test(n))).toHaveLength(1);
    expect(names.filter((n) => /^A new seat/.test(n))).toHaveLength(1);
    expect(names.some((n) => /^The packs/.test(n))).toBe(true);
    const outline = target(p, /^A new seat/);
    expect(outline.getAttribute('class')).toMatch(/cv-slot/);
    expect(badgesIn(outline).length).toBeGreaterThan(0);
    expect(visibleText(outline)).not.toMatch(/Acorns/);
    // The old page of seat cards is gone, and the map is not shown until the signpost is clicked.
    expect(byClass(p.root, 'sp-seat')).toHaveLength(0);
    expect(byClass(p.root, 'world-map')).toHaveLength(0);
  });

  it('names a seat with its scout, where, and its pack; the first seat is a dashed outline until a scout is posted', () => {
    const p = draw(two);
    expect(target(p, /^Seat 1/).getAttribute('aria-label')).toMatch(/Tidepools.*Pack full/);
    expect(target(p, /^Seat 2/).getAttribute('aria-label')).toMatch(/Ember Caves/);
    const empty = draw(sampleValley(free, [sampleSeat('seat-1', 'tidepools', null, 0)]));
    expect(target(empty, /^Seat 1/).getAttribute('aria-label')).toMatch(/nobody posted/);
    expect(target(empty, /^Seat 1/).getAttribute('class')).toMatch(/cv-slot/);
  });

  it('draws no outline when the Signpost has no more seats, and keeps the creature tray under the scene', () => {
    const p = draw({ ...two, seatPrices: { ...two.seatPrices, next: null } });
    expect(targets(p).some((el) => /^A new seat/.test(el.getAttribute('aria-label') ?? ''))).toBe(
      false,
    );
    expect(byClass(p.root, 'vy-tray').length).toBeGreaterThan(0);
  });

  it('the dashed outline buys a seat: one button with the price, off with the reason when the Acorns are short', () => {
    const calls: Calls = { posts: [], kits: [], actions: [] };
    const poor = draw(one, { acorns: 10 });
    poor.click(target(poor, /^A new seat/));
    const short = byName(poor.root, 'button', /Buy the seat/)[0];
    expect(short?.getAttribute('disabled')).not.toBeNull();
    const rich = draw(one, { calls });
    rich.click(target(rich, /^A new seat/));
    rich.click(byName(rich.root, 'button', /Buy the seat/)[0] as FakeElement);
    expect(calls.actions).toEqual(['buySeat']);
  });
});

describe('the Signpost canvas: the expedition map', () => {
  it('a click on the signpost opens the map with every destination at its place, the scouts standing there and a way back', () => {
    const p = draw(two);
    p.click(target(p, /^The signpost/));
    expect(byClass(p.root, 'world-map')).toHaveLength(1);
    expect(byClass(p.root, 'world-map')[0]?.getAttribute('class')).toMatch(/fill/);
    // The scene is gone from the canvas; the map's way back names the signpost.
    expect(targets(p)).toHaveLength(0);
    expect(byName(p.root, 'button', /Back to the signpost/)).toHaveLength(1);
    const ids = p.root.querySelectorAll('[data-place]').map((el) => el.getAttribute('data-place'));
    expect(ids.sort()).toEqual(
      [
        'ember-caves',
        'festival-grounds',
        'moonlit-reef',
        'old-crossroads',
        'storm-ridge',
        'tidepools',
        'verdant-hollow',
      ].sort(),
    );
    // A scout is shown at the place it is at, and a full pack is a small flag.
    expect(marker(p, 'tidepools').getAttribute('aria-label')).toMatch(
      /1 scout there, a pack is full/,
    );
    expect(byClass(marker(p, 'tidepools'), 'wm-flag')[0]?.textContent).toBe('FULL');
    expect(byClass(marker(p, 'ember-caves'), 'wm-flag')[0]?.textContent).toBe('41%');
    expect(byClass(marker(p, 'verdant-hollow'), 'wm-faces')).toHaveLength(0);
  });

  it('a closed destination is dimmed and says what opens it', () => {
    const p = draw(two, { start: { view: 'map' } });
    const grounds = marker(p, 'festival-grounds');
    expect(grounds.getAttribute('class')).toMatch(/locked/);
    expect(grounds.getAttribute('aria-label')).toMatch(/closed, opens in Festival weeks/);
    expect(visibleText(grounds)).toMatch(/Opens in Festival weeks/);
    expect(marker(p, 'tidepools').getAttribute('class')).not.toMatch(/locked/);
  });

  it('the back button returns to the scene', () => {
    const p = draw(two, { start: { view: 'map' } });
    p.click(byName(p.root, 'button', /Back to the signpost/)[0] as FakeElement);
    expect(byClass(p.root, 'world-map')).toHaveLength(0);
    expect(targets(p).length).toBeGreaterThan(0);
  });
});

describe('the Signpost canvas: a destination opens its drawer', () => {
  it('shows the place, who scouts there and the one gold button that sends another', () => {
    const p = draw(two, { start: { view: 'map' } });
    p.click(marker(p, 'tidepools'));
    expect(byClass(p.root, 'pc-page')).toHaveLength(1);
    const text = visibleText(p.root);
    expect(text).toMatch(/Tidepools/);
    expect(text).toMatch(/Tide, rich in scrap/);
    expect(byName(p.root, 'button', /Seat 1: .*Pack full/).length).toBe(1);
    expect(byName(p.root, 'button', /^Send a scout here/).length).toBe(1);
  });

  it('a closed place says what opens it and cannot be sent to', () => {
    const p = draw(two, { start: { view: 'map' } });
    p.click(marker(p, 'festival-grounds'));
    expect(visibleText(p.root)).toMatch(/Closed until a Festival week/);
    expect(
      byName(p.root, 'button', /^Send a scout here/)[0]?.getAttribute('disabled'),
    ).not.toBeNull();
  });

  it('send a scout: who, then (for a scout without a seat) which seat, the kit, and the confirm posts it with the destination', () => {
    const calls: Calls = { posts: [], kits: [], actions: [] };
    const p = draw(sampleValley(free, [sampleSeat('seat-1', 'tidepools', null, 0)]), {
      start: { view: 'map' },
      calls,
    });
    p.click(marker(p, 'ember-caves'));
    p.click(byName(p.root, 'button', /^Send a scout here/)[0] as FakeElement);
    expect(visibleText(p.root)).toMatch(/Who scouts here\?/);
    const row = byClass(p.root, 'roster-option')[0];
    if (row === undefined) throw new Error('no creature row');
    p.click(row);
    expect(visibleText(p.root)).toMatch(/Which seat\?/);
    p.click(byName(p.root, 'button', /^Seat 1/)[0] as FakeElement);
    expect(visibleText(p.root)).toMatch(/Kit/);
    p.click(byName(p.root, 'button', /^No kit/)[0] as FakeElement);
    // The confirm reads the choice back; nothing is sent before its button.
    expect(visibleText(p.root)).toMatch(/Ember Caves/);
    expect(calls.posts).toHaveLength(0);
    p.click(byName(p.root, 'button', /^Send .* to Ember Caves/)[0] as FakeElement);
    expect(calls.posts).toHaveLength(1);
    expect(calls.posts[0]).toMatchObject({ seatId: 'seat-1', destination: 'ember-caves' });
    expect(typeof calls.posts[0]?.creatureId).toBe('string');
  });

  it('a scout that already has a seat skips the seat step: its seat moves here', () => {
    const calls: Calls = { posts: [], kits: [], actions: [] };
    const p = draw(one, { start: { view: 'map' }, calls });
    p.click(marker(p, 'ember-caves'));
    p.click(byName(p.root, 'button', /^Send a scout here/)[0] as FakeElement);
    // The scout of seat 1 is Sproutle's neighbour in the fixture: pick the one posted (it says it moves here).
    const rows = byClass(p.root, 'roster-option');
    const posted = rows.find((r) => /moves here/i.test(visibleText(r)));
    if (posted === undefined) throw new Error('no posted creature row');
    p.click(posted);
    expect(visibleText(p.root)).toMatch(/Kit/);
    expect(visibleText(p.root)).not.toMatch(/Which seat\?/);
  });

  it('a scout there opens its own step: the pack and pace, the kit, move and back to resting', () => {
    const calls: Calls = { posts: [], kits: [], actions: [] };
    const p = draw(two, { start: { view: 'map' }, calls });
    p.click(marker(p, 'ember-caves'));
    p.click(byName(p.root, 'button', /^Seat 2: .*Show this scout/)[0] as FakeElement);
    const text = visibleText(p.root);
    expect(text).toMatch(/A scout here/);
    expect(text).toMatch(/In the pack/);
    expect(text).toMatch(/A day brings/);
    p.click(byName(p.root, 'button', /^Back to resting/)[0] as FakeElement);
    expect(calls.posts).toEqual([{ seatId: 'seat-2', creatureId: null }]);
  });

  it('moving a scout lists the open places and points the seat at the pick', () => {
    const calls: Calls = { posts: [], kits: [], actions: [] };
    const p = draw(two, {
      start: { view: 'map', place: 'ember-caves', step: 'seat-view', seatId: 'seat-2' },
      calls,
    });
    p.click(byName(p.root, 'button', /^Move to another place/)[0] as FakeElement);
    // The map stays mounted under the page: its markers have the same names, so look inside the page.
    const open = byClass(p.root, 'pc-page')[0] as FakeElement;
    p.click(byName(open, 'button', /^Verdant Hollow/)[0] as FakeElement);
    expect(calls.posts).toEqual([{ seatId: 'seat-2', destination: 'verdant-hollow' }]);
    // The closed place cannot be picked.
    const closed = byName(open, 'button', /^Festival Grounds/)[0];
    expect(closed?.getAttribute('disabled')).not.toBeNull();
  });

  it('a seat clicked in the scene opens its scout; a free seat opens on who scouts', () => {
    const p = draw(
      sampleValley(free, [
        sampleSeat('seat-1', 'tidepools', a.id, 20),
        sampleSeat('seat-2', 'ember-caves', null, 0),
      ]),
    );
    p.click(target(p, /^Seat 1/));
    expect(visibleText(p.root)).toMatch(/A scout here/);
    const q = draw(
      sampleValley(free, [
        sampleSeat('seat-1', 'tidepools', a.id, 20),
        sampleSeat('seat-2', 'ember-caves', null, 0),
      ]),
    );
    q.click(target(q, /^Seat 2/));
    expect(visibleText(q.root)).toMatch(/Who scouts here\?/);
  });
});

describe('the Signpost canvas: the left drawer is for the collections', () => {
  it('the crate opens the packs of every seat; a tap leads to that scout on the map', () => {
    const p = draw(two);
    p.click(target(p, /^The packs/));
    expect(visibleText(p.root)).toMatch(/Packs/);
    const rows = byName(p.root, 'button', /^Seat \d.*Show this seat/);
    expect(rows).toHaveLength(2);
    p.click(rows[1] as FakeElement);
    expect(byClass(p.root, 'world-map')).toHaveLength(1);
    expect(visibleText(p.root)).toMatch(/A scout here/);
  });

  it('a Signpost with no commons has no board prop', () => {
    const p = draw(two);
    expect(targets(p).some((el) => /project board/.test(el.getAttribute('aria-label') ?? ''))).toBe(
      false,
    );
  });
});
