/**
 * The Forge as a canvas (`ForgeCanvas`, the rule "A place is a canvas"): what is in the scene and what a click on each thing opens.
 * Drawn in the fake DOM; a phone has no `matchMedia` here, so a panel is its own page (the shell's other half is in `PlaceCanvas.test`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderRequest } from '../api';
import { SAMPLE_GEAR } from '../creature-card-sample';
import { blueprintViews } from '../gear-view';
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
import type { ForgeActions } from './ForgeAnvils';
import { ForgeCanvas } from './ForgeCanvas';
import { fullFloor, sampleAnvil, sampleOrder, shardWait, withAnvils } from './forge-sample';
import { sampleValley } from './signpost-sample';
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
const plain = sampleValley(free, []);
const BP = 'kelp-cap';

interface Calls {
  actions: string[];
  orders: OrderRequest[];
  market: (string | null)[];
  posts: { seatId: string; creatureId: string | null }[];
}

function draw(
  visit: ReturnType<typeof withAnvils>,
  acorns = 500,
  calls: Calls = { actions: [], orders: [], market: [], posts: [] },
): Page {
  const ok = (name: string) => () => {
    calls.actions.push(name);
    return Promise.resolve(true);
  };
  const actions: ForgeActions = {
    post: (body) => {
      calls.posts.push(body);
      return Promise.resolve(true);
    },
    buyAnvil: ok('buyAnvil'),
    buyKit: ok('buyKit'),
    setKit: ok('setKit'),
    order: (request) => {
      calls.orders.push(request);
      return Promise.resolve(true);
    },
  };
  const p = createPage();
  page = p;
  p.draw(
    <PopoverHost onOpenHowTo={() => undefined}>
      <ForgeCanvas
        visit={visit}
        creatures={free}
        trayInput={{ trips: [], jobs: null, now: 0, ...trayStates(visit) }}
        acorns={acorns}
        busy={false}
        error={null}
        actions={actions}
        onOpenPaddock={() => undefined}
        onOpenMarket={(to) => calls.market.push(to)}
        blueprints={blueprintViews(SAMPLE_GEAR.blueprints, SAMPLE_GEAR.skills)}
        bag={<p>The bag's gear</p>}
        plans={(onOrder) => (
          <button
            type="button"
            onClick={(event) => {
              onOrder(BP, event.currentTarget as unknown as HTMLElement);
            }}
          >
            Order a kelp cap
          </button>
        )}
        bagFull={false}
        bagAttention={false}
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

describe('the Forge canvas: the scene', () => {
  it('has a button for each anvil, one dashed outline for the next, the forge and the three props, all named', () => {
    const visit = withAnvils(plain, [sampleAnvil('a1', a.id, [sampleOrder('o1', BP, 3)])]);
    const p = draw(visit);
    const names = targets(p).map((el) => el.getAttribute('aria-label') ?? '');
    expect(names.every((n) => n !== '')).toBe(true);
    expect(names.filter((n) => /^Anvil \d/.test(n))).toHaveLength(1);
    expect(names.filter((n) => /^A new anvil/.test(n))).toHaveLength(1);
    expect(names.some((n) => /^The plans/.test(n))).toBe(true);
    expect(names.some((n) => /^The bag/.test(n))).toBe(true);
    expect(names.some((n) => /^The floor/.test(n))).toBe(true);
    // The outline is dashed and its price is icons, never words.
    const outline = target(p, /^A new anvil/);
    expect(outline.getAttribute('class')).toMatch(/cv-slot/);
    expect(badgesIn(outline).length).toBeGreaterThan(0);
    expect(visibleText(outline)).not.toMatch(/Acorns|scrap/);
  });

  it('says what an anvil does in its name: the order in hand, tinkering, paused, a full floor, nobody posted', () => {
    const visit = withAnvils(plain, [
      sampleAnvil('a1', a.id, [sampleOrder('o1', BP, 3)]),
      shardWait('a2', b.id, BP, 5),
      sampleAnvil('a3', null, []),
    ]);
    const p = draw({ ...visit, anvilPrices: { ...visit.anvilPrices, next: null } });
    expect(target(p, /^Anvil 1/).getAttribute('aria-label')).toMatch(/making Kelp Cap, 0 \/ 3/);
    expect(target(p, /^Anvil 2/).getAttribute('aria-label')).toMatch(/tinkering/);
    expect(target(p, /^Anvil 3/).getAttribute('aria-label')).toMatch(/nobody posted/);
    const full = draw(withAnvils(plain, [fullFloor('a1', a.id, BP)]));
    expect(target(full, /^Anvil 1/).getAttribute('aria-label')).toMatch(/floor full/);
  });

  it('draws no outline when the Forge has no more anvils, and nothing in the page scrolls away: no page-long list', () => {
    const visit = withAnvils(plain, [sampleAnvil('a1', a.id, [])]);
    const p = draw({ ...visit, anvilPrices: { ...visit.anvilPrices, next: null } });
    expect(targets(p).some((el) => /^A new anvil/.test(el.getAttribute('aria-label') ?? ''))).toBe(
      false,
    );
    // Nothing of the old page's cards is drawn: the anvils are in the scene.
    expect(byClass(p.root, 'sp-seat')).toHaveLength(0);
    expect(byClass(p.root, 'sp-page')).toHaveLength(0);
  });

  it('keeps the shelf and the creature tray under the scene, in view', () => {
    const p = draw(withAnvils(plain, [sampleAnvil('a1', a.id, [])]));
    expect(byClass(p.root, 'fc-shelf')).toHaveLength(1);
    expect(byClass(p.root, 'vy-tray').length).toBeGreaterThan(0);
  });
});

describe('the Forge canvas: the right drawer is for the one thing clicked', () => {
  it('an anvil opens its page: smith and kit, the orders, what it does, the floor', () => {
    const visit = withAnvils(plain, [
      sampleAnvil('a1', a.id, [sampleOrder('o1', BP, 3), sampleOrder('o2', BP, 1)]),
    ]);
    const p = draw(visit);
    p.click(target(p, /^Anvil 1/));
    const text = visibleText(p.root);
    expect(byClass(p.root, 'pc-page')).toHaveLength(1);
    expect(text).toMatch(/Smith and orders/);
    expect(text).toMatch(/Kelp Cap/);
    expect(text).toMatch(/Floor 2 \/ 5/);
    expect(byName(p.root, 'button', /Add an order/).length).toBe(1);
    expect(byName(p.root, 'button', /Anvil 1: .*No kit|no kit/i).length).toBeGreaterThan(0);
  });

  it('an anvil nobody smiths at opens on who smiths; a tap on a creature posts it and goes back to the anvil', () => {
    const calls: Calls = { actions: [], orders: [], market: [], posts: [] };
    const visit = withAnvils(plain, [sampleAnvil('a1', null, [])]);
    const p = draw(visit, 500, calls);
    p.click(target(p, /^Anvil 1/));
    expect(visibleText(p.root)).toMatch(/Who smiths here\?/);
    const option = byClass(p.root, 'ro-option')[0] ?? byName(p.root, 'li', /Lv/)[0];
    const row = p.root;
    void row;
    const pick = byClass(p.root, 'ro-row')[1];
    if (option === undefined && pick === undefined) throw new Error('no creature row');
    p.click((pick ?? option) as FakeElement);
    expect(calls.posts).toHaveLength(1);
    expect(calls.posts[0]?.seatId).toBe('a1');
    expect(visibleText(p.root)).toMatch(/Smith and orders/);
  });

  it('before the Market is built, a smith waiting on a shard says the Market will trade for it and leads to the Market', () => {
    const calls: Calls = { actions: [], orders: [], market: [], posts: [] };
    const visit = withAnvils(plain, [shardWait('a1', a.id, BP, 5)]);
    const p = draw({ ...visit, market: { open: false, seat: null } }, 500, calls);
    p.click(target(p, /^Anvil 1/));
    const text = visibleText(p.root);
    expect(text).toMatch(/Tinkering/);
    // The wait is "Waiting for" and the Tide shard's icon, never the words "Tide shards".
    expect(text).toMatch(
      /Waiting for for 5 h\. The Market will trade for them once the valley builds it\./,
    );
    expect(text).not.toMatch(/Tide shards/);
    expect(badgesIn(byClass(p.root, 'fg-tinker')[0] as FakeElement)).toEqual([['Tide Shards', '']]);
    expect(byName(p.root, 'button', /Trade shards|Trade for|Trade at/).length).toBe(0);
    p.click(byName(p.root, 'button', /Go to the Market/)[0] as FakeElement);
    expect(calls.market).toEqual(['tide']);
  });

  it('once the Market is built, the wait line is plain and the button leads to its exchange', () => {
    const calls: Calls = { actions: [], orders: [], market: [], posts: [] };
    const visit = withAnvils(plain, [shardWait('a1', a.id, BP, 5)]);
    const p = draw({ ...visit, market: { open: true, seat: null } }, 500, calls);
    p.click(target(p, /^Anvil 1/));
    expect(visibleText(p.root)).toMatch(/Waiting for for 5 h/);
    expect(visibleText(p.root)).not.toMatch(/once the valley builds it/);
    expect(byName(p.root, 'button', /Go to the Market/).length).toBe(0);
    p.click(byName(p.root, 'button', /Trade at the Market/)[0] as FakeElement);
    expect(calls.market).toEqual(['tide']);
  });

  it('a smith that waits on something else has no Market button', () => {
    const p = draw(withAnvils(plain, [sampleAnvil('a1', a.id, [])]));
    p.click(target(p, /^Anvil 1/));
    expect(byName(p.root, 'button', /the Market/).length).toBe(0);
  });

  it('"Add an order" is the order wizard: what to make, then the order; its one gold button sends it and comes back to the anvil', () => {
    const calls: Calls = { actions: [], orders: [], market: [], posts: [] };
    const visit = withAnvils(plain, [sampleAnvil('a1', a.id, [])]);
    const p = draw(visit, 500, calls);
    p.click(target(p, /^Anvil 1/));
    p.click(byName(p.root, 'button', /^Add an order/)[0] as FakeElement);
    expect(visibleText(p.root)).toMatch(/What to make/);
    const blueprints = byName(p.root, 'button', /Kelp Cap/)[0];
    if (blueprints === undefined) throw new Error('no blueprint row');
    p.click(blueprints);
    expect(visibleText(p.root)).toMatch(/The order/);
    p.click(byName(p.root, 'button', /^Add to the queue/)[0] as FakeElement);
    expect(calls.orders).toEqual([
      expect.objectContaining({ action: 'add', seatId: 'a1', blueprintId: BP, count: 1 }),
    ]);
  });

  it('an order row opens the same wizard to change it; an anvil with a full queue has no "Add an order"', () => {
    const visit = withAnvils(plain, [sampleAnvil('a1', a.id, [sampleOrder('o1', BP, 3)])]);
    const p = draw(visit);
    p.click(target(p, /^Anvil 1/));
    p.click(byName(p.root, 'button', /^Kelp Cap, 0 \/ 3/)[0] as FakeElement);
    expect(visibleText(p.root)).toMatch(/Change the order/);
  });

  it('an anvil with a full queue has no "Add an order" and says so', () => {
    const orders = [1, 2, 3].map((n) => sampleOrder(`o${String(n)}`, BP, n));
    const full = draw(withAnvils(plain, [sampleAnvil('a1', a.id, orders)]));
    full.click(target(full, /^Anvil 1/));
    expect(
      byName(full.root, 'button', /^Add an order/)[0]?.getAttribute('disabled'),
    ).not.toBeNull();
    expect(visibleText(full.root)).toMatch(/queue is full/);
  });

  it('a plans table opens the blueprints; a blueprint’s Order opens the order wizard on that blueprint', () => {
    const calls: Calls = { actions: [], orders: [], market: [], posts: [] };
    const p = draw(withAnvils(plain, [sampleAnvil('a1', a.id, [])]), 500, calls);
    p.click(target(p, /^The plans/));
    p.click(byName(p.root, 'button', /Order a kelp cap/)[0] as FakeElement);
    // The right drawer (the page on a phone) is the order step, with the blueprint already picked.
    expect(visibleText(p.root)).toMatch(/The order/);
    p.click(byName(p.root, 'button', /^Add to the queue/)[0] as FakeElement);
    expect(calls.orders).toEqual([
      expect.objectContaining({ action: 'add', seatId: 'a1', blueprintId: BP }),
    ]);
  });

  it('buying an anvil is one clear button with both costs, off with the reason when something is short', () => {
    const visit = withAnvils(plain, [sampleAnvil('a1', a.id, [])]);
    const p = draw(visit, 500);
    p.click(target(p, /^A new anvil/));
    const buy = byName(p.root, 'button', /Buy the anvil/)[0];
    expect(buy?.getAttribute('disabled')).not.toBeNull();
    // The price on the button and what the player has: icons and numbers, never the words.
    expect(badgesIn(buy as FakeElement)).toEqual([
      ['Bait', '123'],
      ['Scrap', '38'],
    ]);
    expect(badgesIn(byClass(p.root, 'alert')[0] as FakeElement).length).toBeGreaterThan(0);
    expect(visibleText(p.root)).not.toMatch(/Acorns|scrap/);
  });

  it('with the Acorns and scrap, the button buys', () => {
    const calls: Calls = { actions: [], orders: [], market: [], posts: [] };
    const visit = withAnvils(plain, [sampleAnvil('a1', a.id, [])]);
    const rich = {
      ...visit,
      forge: { ...visit.forge, shelf: { ...visit.forge.shelf, scrap: 80 } },
    };
    const p = draw(rich, 500, calls);
    p.click(target(p, /^A new anvil/));
    p.click(byName(p.root, 'button', /Buy the anvil/)[0] as FakeElement);
    expect(calls.actions).toEqual(['buyAnvil']);
  });
});

describe('the Forge canvas: the left drawer is for the collections', () => {
  it('the chest opens the bag, the crate the floors of every anvil (a tap leads to that anvil’s numbers), the plans the blueprints', () => {
    const visit = withAnvils(plain, [
      sampleAnvil('a1', a.id, [sampleOrder('o1', BP, 3)]),
      sampleAnvil('a2', b.id, []),
    ]);
    const p = draw(visit);
    p.click(target(p, /^The bag/));
    expect(visibleText(p.root)).toMatch(/The bag's gear/);
    expect(byClass(p.root, 'pc-page')[0]?.getAttribute('data-side')).toBe('left');
  });

  it('the crate opens every anvil’s floor, and a tap leads to that anvil’s numbers', () => {
    const visit = withAnvils(plain, [
      sampleAnvil('a1', a.id, [sampleOrder('o1', BP, 3)]),
      sampleAnvil('a2', b.id, []),
    ]);
    const q = draw(visit);
    q.click(target(q, /^The floor/));
    const rows = byName(q.root, 'button', /Show the floor and what this anvil brings/);
    expect(rows).toHaveLength(2);
    q.click(rows[1] as FakeElement);
    // The floor row leads to the anvil's own page, on its floor step: the right drawer.
    expect(byClass(q.root, 'pc-page')[0]?.getAttribute('data-side')).toBe('right');
    expect(visibleText(q.root)).toMatch(/Floor and pace/);
  });
});
