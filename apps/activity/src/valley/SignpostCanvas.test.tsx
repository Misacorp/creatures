/**
 * The Signpost as a canvas (`SignpostCanvas`, the rule "A place is a canvas"): the expedition map it opens on (no scene first), and the drawer a click on a destination opens. Drawn in the fake DOM; a phone has no `matchMedia` here, so a panel is its own page (the
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

/** The scene's targets (none: the map is the place). */
const targets = (p: Page): FakeElement[] =>
  byClass(p.root, 'cv-target').filter((el) => el.localName === 'button');
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

describe('the Signpost canvas: it opens straight on the map', () => {
  it('draws the expedition map from the first draw, with no scene, signpost button or seat targets', () => {
    const p = draw(one);
    expect(byClass(p.root, 'world-map')).toHaveLength(1);
    expect(targets(p)).toHaveLength(0);
    expect(byClass(p.root, 'sp-seat')).toHaveLength(0);
    expect(byClass(p.root, 'vy-tray').length).toBeGreaterThan(0);
  });

  it('the packs button opens the packs drawer; its seats, and a new seat to buy (with the price as icons), are rows there', () => {
    const calls: Calls = { posts: [], kits: [], actions: [] };
    const full = draw(two);
    expect(byName(full.root, 'button', /^The packs: 1 full\. Open/)).toHaveLength(1);
    full.unmount();
    page = null;
    const p = draw(one, { calls });
    p.click(byName(p.root, 'button', /^The packs/)[0] as FakeElement);
    expect(byName(p.root, 'button', /^Seat \d.*Show this seat/)).toHaveLength(1);
    const buy = byName(p.root, 'button', /^A new seat\. Buy it/)[0] as FakeElement;
    expect(badgesIn(buy).length).toBeGreaterThan(0);
    p.click(buy);
    p.click(byName(p.root, 'button', /Buy the seat/)[0] as FakeElement);
    expect(calls.actions).toEqual(['buySeat']);
  });

  it('with no seats the packs drawer still offers the first one; no row once there are no more seats to buy', () => {
    const p = draw(sampleValley(free, []));
    p.click(byName(p.root, 'button', /^The packs\. Open/)[0] as FakeElement);
    expect(byName(p.root, 'button', /^A new seat\. Buy it/)).toHaveLength(1);
    const q = draw({ ...two, seatPrices: { ...two.seatPrices, next: null } });
    q.click(byName(q.root, 'button', /^The packs/)[0] as FakeElement);
    expect(byName(q.root, 'button', /^A new seat/)).toHaveLength(0);
  });

  it('a seat row is a drop target for a creature (data-seat)', () => {
    const p = draw(two);
    p.click(byName(p.root, 'button', /^The packs/)[0] as FakeElement);
    const rows = byName(p.root, 'button', /^Seat \d.*Show this seat/);
    expect(rows.map((r) => r.getAttribute('data-seat'))).toEqual(['seat-1', 'seat-2']);
  });
});

describe('the Signpost canvas: the expedition map', () => {
  it('shows every destination at its place with the scouts standing there', () => {
    const p = draw(two);
    expect(byClass(p.root, 'world-map')).toHaveLength(1);
    expect(byClass(p.root, 'world-map')[0]?.getAttribute('class')).toMatch(/fill/);
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
    const p = draw(two, {});
    const grounds = marker(p, 'festival-grounds');
    expect(grounds.getAttribute('class')).toMatch(/locked/);
    expect(grounds.getAttribute('aria-label')).toMatch(/closed, opens in Festival weeks/);
    expect(visibleText(grounds)).toMatch(/Opens in Festival weeks/);
    expect(marker(p, 'tidepools').getAttribute('class')).not.toMatch(/locked/);
  });
});

describe('the Signpost canvas: a destination opens its drawer', () => {
  it('shows the place, who scouts there and the one gold button that sends another', () => {
    const p = draw(two, {});
    p.click(marker(p, 'tidepools'));
    expect(byClass(p.root, 'pc-page')).toHaveLength(1);
    const text = visibleText(p.root);
    expect(text).toMatch(/Tidepools/);
    expect(text).toMatch(/Tide, rich in scrap/);
    expect(byName(p.root, 'button', /Seat 1: .*Pack full/).length).toBe(1);
    expect(byName(p.root, 'button', /^Send a scout here/).length).toBe(1);
  });

  it('a closed place says what opens it and cannot be sent to', () => {
    const p = draw(two, {});
    p.click(marker(p, 'festival-grounds'));
    expect(visibleText(p.root)).toMatch(/Closed until a Festival week/);
    expect(
      byName(p.root, 'button', /^Send a scout here/)[0]?.getAttribute('disabled'),
    ).not.toBeNull();
  });

  it('send a scout: who, then (for a scout without a seat) which seat, the kit, and the confirm posts it with the destination', () => {
    const calls: Calls = { posts: [], kits: [], actions: [] };
    const p = draw(sampleValley(free, [sampleSeat('seat-1', 'tidepools', null, 0)]), {
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
    const p = draw(one, { calls });
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
    const p = draw(two, { calls });
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
      start: { place: 'ember-caves', step: 'seat-view', seatId: 'seat-2' },
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

  it('a seat row of the packs drawer opens its scout; a free seat opens on who scouts', () => {
    const seats = sampleValley(free, [
      sampleSeat('seat-1', 'tidepools', a.id, 20),
      sampleSeat('seat-2', 'ember-caves', null, 0),
    ]);
    const p = draw(seats);
    p.click(byName(p.root, 'button', /^The packs/)[0] as FakeElement);
    p.click(byName(p.root, 'button', /^Seat 1.*Show this seat/)[0] as FakeElement);
    expect(visibleText(p.root)).toMatch(/A scout here/);
    const q = draw(seats);
    q.click(byName(q.root, 'button', /^The packs/)[0] as FakeElement);
    q.click(byName(q.root, 'button', /^Seat 2.*Show this seat/)[0] as FakeElement);
    expect(visibleText(q.root)).toMatch(/Who scouts here\?/);
  });
});

describe('the Signpost canvas: the left drawer is for the collections', () => {
  it('a tap on a pack row leads to that scout, on the same map', () => {
    const p = draw(two);
    p.click(byName(p.root, 'button', /^The packs/)[0] as FakeElement);
    expect(visibleText(p.root)).toMatch(/Packs/);
    p.click(byName(p.root, 'button', /^Seat 2.*Show this seat/)[0] as FakeElement);
    expect(byClass(p.root, 'world-map')).toHaveLength(1);
    expect(visibleText(p.root)).toMatch(/A scout here/);
  });

  it('a Signpost with no commons has no project board button', () => {
    const p = draw(two);
    expect(byName(p.root, 'button', /project board/i)).toHaveLength(0);
  });
});
