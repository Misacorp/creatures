import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderRequest } from '../api';
import { PopoverHost } from '../PopoverHost';
import { byClass, byName, createPage, visibleText, type Page } from '../test-dom';
import { blueprintViews } from '../gear-view';
import { SAMPLE_GEAR } from '../creature-card-sample';
import { homeInput } from '../workbench/home-sample';
import { ForgeAnvils, type ForgeActions, type OrderOpen } from './ForgeAnvils';
import { fullFloor, sampleAnvil, sampleOrder, shardWait, withAnvils } from './forge-sample';
import { OrderEditor } from './OrderEditor';
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
  vi.unstubAllGlobals();
  page?.unmount();
  page = null;
});

const base = homeInput('busy', true);
const free = base.creatures.map((c) => ({ ...c, busy: null, away: false }));
const [a, b] = free;
if (a === undefined || b === undefined) throw new Error('fixture');
const plain = sampleValley(free, []);
const BP = 'kelp-cap';

function draw(
  visit: ReturnType<typeof withAnvils>,
  acorns: number,
  calls: string[] = [],
  opened: OrderOpen[] = [],
): Page {
  const ok = (name: string) => () => {
    calls.push(name);
    return Promise.resolve(true);
  };
  const actions: ForgeActions = {
    post: ok('post'),
    buyAnvil: ok('buyAnvil'),
    buyKit: ok('buyKit'),
    setKit: ok('setKit'),
    order: ok('order'),
    exchange: ok('exchange'),
  };
  const p = createPage();
  page = p;
  p.draw(
    <PopoverHost onOpenHowTo={() => undefined}>
      <ForgeAnvils
        visit={visit}
        creatures={free}
        trayInput={{ trips: [], jobs: null, now: 0, ...trayStates(visit) }}
        acorns={acorns}
        busy={false}
        actions={actions}
        onOrder={(open) => opened.push(open)}
        onOpenPaddock={() => undefined}
      />
    </PopoverHost>,
  );
  return p;
}

describe('ForgeAnvils', () => {
  it('a card for each anvil with its orders, the piece in hand and the floor, and the next anvil to buy', () => {
    const visit = withAnvils(plain, [
      sampleAnvil('a1', a.id, [sampleOrder('o1', BP, 3), sampleOrder('o2', BP, 1)]),
      sampleAnvil('a2', null, []),
    ]);
    const p = draw({ ...visit, anvilPrices: { ...visit.anvilPrices, next: null } }, 500);
    // Two anvils, and the closing line (the Forge has no more room at the second level).
    expect(byClass(p.root, 'sp-seat').length).toBe(3);
    const text = visibleText(p.root);
    expect(text).toMatch(/Anvil 1/);
    expect(text).toMatch(/Kelp Cap/);
    expect(text).toMatch(/Floor 2 \/ 5/);
    expect(text).toMatch(/Add an order/);
    expect(text).toMatch(/Pick a smith, or drag one here/);
    expect(text).toMatch(/no more anvils/);
    // The bag's count shows once, by the Gear heading (the Workshop), not on the shelf.
    expect(text).not.toMatch(/Bag/);
  });

  it('a smith that cannot go on says Tinkering with why, and the shelf button offers the trade for that shard', () => {
    const visit = withAnvils(plain, [shardWait('a1', a.id, BP, 5)]);
    const p = draw(visit, 500);
    const text = visibleText(p.root);
    expect(text).toMatch(/Tinkering/);
    expect(text).toMatch(/Waiting for Tide shards for 5 h/);
    expect(byName(p.root, 'button', /Trade for Tide shards/).length).toBe(1);
  });

  it('a full floor is named on the card', () => {
    const p = draw(withAnvils(plain, [fullFloor('a1', a.id, BP)]), 500);
    expect(visibleText(p.root)).toMatch(/Floor full/);
  });

  it('buying an anvil is one clear button with both costs, off with the reason when something is short', () => {
    const visit = withAnvils(plain, [sampleAnvil('a1', a.id, [])]);
    const p = draw(visit, 500);
    const open = byName(p.root, 'button', /A new anvil/)[0];
    if (open === undefined) throw new Error('no buy button');
    p.click(open);
    const buy = byName(p.root, 'button', /Buy the anvil/)[0];
    expect(buy?.getAttribute('disabled')).not.toBeNull();
    expect(visibleText(p.root)).toMatch(/123 Acorns, 38 scrap/);
    expect(visibleText(p.root)).toMatch(/0 scrap/);
  });

  it('with the Acorns and scrap, the button buys', () => {
    const calls: string[] = [];
    const visit = withAnvils(plain, [sampleAnvil('a1', a.id, [])]);
    const rich = {
      ...visit,
      forge: { ...visit.forge, shelf: { ...visit.forge.shelf, scrap: 80 } },
    };
    const p = draw(rich, 500, calls);
    const open = byName(p.root, 'button', /A new anvil/)[0];
    if (open === undefined) throw new Error('no buy button');
    p.click(open);
    const buy = byName(p.root, 'button', /Buy the anvil/)[0];
    if (buy === undefined) throw new Error('no confirm');
    p.click(buy);
    expect(calls).toEqual(['buyAnvil']);
  });

  it('"Add an order" and an order row ask the Workshop for the editor', () => {
    const opened: OrderOpen[] = [];
    const visit = withAnvils(plain, [sampleAnvil('a1', a.id, [sampleOrder('o1', BP, 3)])]);
    const p = draw(visit, 500, [], opened);
    const add = byName(p.root, 'button', /Add an order/)[0];
    const row = byName(p.root, 'button', /Kelp Cap, 0 \/ 3/)[0];
    if (add === undefined || row === undefined) throw new Error('no buttons');
    p.click(add);
    p.click(row);
    expect(opened.map((o) => o.kind)).toEqual(['add', 'edit']);
  });

  it('an anvil with a full queue has no "Add an order"', () => {
    const orders = [1, 2, 3].map((n) => sampleOrder(`o${String(n)}`, BP, n));
    const p = draw(withAnvils(plain, [sampleAnvil('a1', a.id, orders)]), 500);
    expect(byName(p.root, 'button', /Add an order/).length).toBe(0);
  });

  it('the exchange shows the rate and the crit, and trades only what the shelf can pay', () => {
    const calls: string[] = [];
    const visit = withAnvils(plain, [sampleAnvil('a1', a.id, [])]);
    const stocked = {
      ...visit,
      forge: {
        ...visit.forge,
        shelf: { ...visit.forge.shelf, shards: { tide: 0, ember: 7, grove: 0, spark: 0, mire: 0 } },
      },
    };
    const p = draw(stocked, 500, calls);
    const open = byName(p.root, 'button', /Trade shards/)[0];
    if (open === undefined) throw new Error('no trade button');
    p.click(open);
    expect(visibleText(p.root)).toMatch(
      /3 shards of one kind for 1 of another\. A 10% chance to get 2\./,
    );
    const trade = byName(p.root, 'button', /^Trade \d/)[0];
    if (trade === undefined) throw new Error('no confirm');
    expect(trade.getAttribute('disabled')).toBeNull();
    p.click(trade);
    expect(calls).toEqual(['exchange']);
  });

  it('with no shards the exchange is off and says what it needs', () => {
    const visit = withAnvils(plain, [sampleAnvil('a1', a.id, [])]);
    const p = draw(visit, 500);
    const open = byName(p.root, 'button', /Trade shards/)[0];
    if (open === undefined) throw new Error('no trade button');
    p.click(open);
    expect(visibleText(p.root)).toMatch(/You need 3 shards of one other kind/);
    const trade = byName(p.root, 'button', /^Trade \d/)[0];
    expect(trade?.getAttribute('disabled')).not.toBeNull();
  });
});

describe('OrderEditor', () => {
  const blueprints = blueprintViews(SAMPLE_GEAR.blueprints, SAMPLE_GEAR.skills);
  const first = blueprints[0];
  if (first === undefined) throw new Error('fixture has no blueprint');

  function editor(
    open: Parameters<typeof OrderEditor>[0]['open'],
    visit: ReturnType<typeof withAnvils>,
    sent: OrderRequest[],
  ): Page {
    const p = createPage();
    page = p;
    p.draw(
      <PopoverHost onOpenHowTo={() => undefined}>
        <OrderEditor
          open={open}
          visit={visit}
          blueprints={blueprints}
          busy={false}
          error={null}
          onOrder={(request) => {
            sent.push(request);
            return Promise.resolve(true);
          }}
          onClose={() => undefined}
        />
      </PopoverHost>,
    );
    return p;
  }

  it('a new order with a blueprint picked sends the blueprint, the count and the Reach', () => {
    const sent: OrderRequest[] = [];
    const visit = withAnvils(plain, [sampleAnvil('a1', a.id, [])]);
    const p = editor(
      { kind: 'add', anvilId: 'a1', opener: null, baseId: first.baseId },
      visit,
      sent,
    );
    const more = byName(p.root, 'button', /One more piece/)[0];
    if (more === undefined) throw new Error('no stepper');
    p.click(more);
    const reach = byName(p.root, 'button', /Reach for Rare/)[0];
    if (reach === undefined) throw new Error('no reach');
    p.click(reach);
    const add = byName(p.root, 'button', /Add to the queue/)[0];
    if (add === undefined) throw new Error('no add');
    p.click(add);
    expect(sent).toEqual([
      { action: 'add', seatId: 'a1', blueprintId: first.baseId, count: 2, reach: 'rare' },
    ]);
  });

  it('with nothing picked the button is off and says to choose', () => {
    const visit = withAnvils(plain, [sampleAnvil('a1', a.id, [])]);
    const p = editor({ kind: 'add', anvilId: 'a1', opener: null }, visit, []);
    const add = byName(p.root, 'button', /Add to the queue/)[0];
    expect(add?.getAttribute('disabled')).not.toBeNull();
    expect(visibleText(p.root)).toMatch(/Choose what to make/);
  });

  it('a full queue says so', () => {
    const orders = [1, 2, 3].map((n) => sampleOrder(`o${String(n)}`, BP, n));
    const visit = withAnvils(plain, [sampleAnvil('a1', a.id, orders)]);
    const p = editor({ kind: 'add', anvilId: 'a1', opener: null, baseId: first.baseId }, visit, []);
    expect(visibleText(p.root)).toMatch(/queue is full/);
  });

  it('editing saves a new count, and an order can be taken off', () => {
    const sent: OrderRequest[] = [];
    const visit = withAnvils(plain, [
      sampleAnvil('a1', a.id, [sampleOrder('o1', BP, 3, { made: 1 })]),
    ]);
    const p = editor({ kind: 'edit', orderId: 'o1', opener: null }, visit, sent);
    const save = byName(p.root, 'button', /^Save/)[0];
    expect(save?.getAttribute('disabled')).not.toBeNull();
    const more = byName(p.root, 'button', /One more piece/)[0];
    if (more === undefined) throw new Error('no stepper');
    p.click(more);
    p.click(byName(p.root, 'button', /^Save/)[0] ?? more);
    const off = byName(p.root, 'button', /Take it off the queue/)[0];
    if (off === undefined) throw new Error('no remove');
    p.click(off);
    expect(sent).toEqual([
      { action: 'edit', orderId: 'o1', count: 4, reach: 'none' },
      { action: 'remove', orderId: 'o1' },
    ]);
  });

  it('a count never goes below what is already made', () => {
    const visit = withAnvils(plain, [
      sampleAnvil('a1', a.id, [sampleOrder('o1', BP, 3, { made: 3 })]),
    ]);
    const p = editor({ kind: 'edit', orderId: 'o1', opener: null }, visit, []);
    const fewer = byName(p.root, 'button', /One fewer piece/)[0];
    expect(fewer?.getAttribute('disabled')).not.toBeNull();
  });

  it('"for my team" sends no blueprint and no count', () => {
    const sent: OrderRequest[] = [];
    const visit = withAnvils(plain, [sampleAnvil('a1', b.id, [])]);
    const p = editor({ kind: 'add', anvilId: 'a1', opener: null }, visit, sent);
    const choose = byName(p.root, 'button', /What to make: nothing chosen/)[0];
    if (choose === undefined) throw new Error('no chooser');
    p.click(choose);
    const team = byName(p.root, 'button', /For my team/)[0];
    if (team === undefined) throw new Error('no team row');
    p.click(team);
    p.click(byName(p.root, 'button', /Add to the queue/)[0] ?? team);
    expect(sent).toEqual([{ action: 'add', seatId: 'a1', forTeam: true, reach: 'none' }]);
  });
});
