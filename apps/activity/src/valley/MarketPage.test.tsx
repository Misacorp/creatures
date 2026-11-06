import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PopoverHost } from '../PopoverHost';
import {
  byClass,
  byName,
  byRole,
  createPage,
  find,
  visibleText,
  type FakeElement,
  type Page,
} from '../test-dom';
import { homeInput } from '../workbench/home-sample';
import { MarketPage, type MarketActions, type MarketStart } from './MarketPage';
import { sampleCommons, withCommons } from './commons-sample';
import { presetMarket, withMarket, withMarketPlace } from './market-sample';
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

interface Calls {
  posts: { seatId: string; creatureId: string | null }[];
  toward: { seatId: string; toward: string | null }[];
  trades: { to: string; from: string | null; times: number }[];
  gifts: number;
  helpers: { place: string; creatureId: string | null }[];
}

function draw(preset: string, start: MarketStart = {}): { page: Page; calls: Calls } {
  const calls: Calls = { posts: [], toward: [], trades: [], gifts: 0, helpers: [] };
  const commons = withMarketPlace(sampleCommons(), preset);
  const market = presetMarket(preset, free);
  const plain = withCommons(sampleValley(free, []), commons);
  const stocked = {
    ...plain,
    forge: {
      ...plain.forge,
      shelf: {
        ...plain.forge.shelf,
        shards: { tide: 0, ember: 7, grove: 0, spark: 0, mire: 0 },
      },
    },
  };
  const visit = market === null ? stocked : withMarket(stocked, market);
  const actions: MarketActions = {
    post: (body) => {
      calls.posts.push(body);
      return Promise.resolve(true);
    },
    setToward: (seatId, toward) => {
      calls.toward.push({ seatId, toward });
      return Promise.resolve(true);
    },
    exchange: (request) => {
      calls.trades.push(request);
      return Promise.resolve(true);
    },
  };
  const p = createPage();
  page = p;
  p.draw(
    <PopoverHost onOpenHowTo={() => undefined}>
      <MarketPage
        visit={visit}
        creatures={free}
        trayInput={{ trips: [], jobs: null, now: 0, ...trayStates(visit) }}
        acorns={900}
        busy={false}
        actions={actions}
        commons={{
          give: () => {
            calls.gifts += 1;
            return Promise.resolve(true);
          },
          post: (place, creatureId) => {
            calls.helpers.push({ place, creatureId });
            return Promise.resolve(true);
          },
        }}
        onOpenPaddock={() => undefined}
        start={start}
      />
    </PopoverHost>,
  );
  return { page: p, calls };
}

const button = (p: Page, name: RegExp): FakeElement => {
  const el = byName(p.root, 'button', name)[0];
  if (el === undefined) throw new Error(`no button ${String(name)}`);
  return el;
};

describe('MarketPage while the Market is built', () => {
  it('is the project board and nothing else, taking shards of any kind and offering no exchange', () => {
    const { page: p } = draw('being built');
    const text = visibleText(p.root);
    expect(text).toMatch(/Market/);
    expect(text).toMatch(/Still needed: 190 Acorns, 380 scrap/);
    expect(byClass(p.root, 'sp-seats')).toHaveLength(0);
    expect(byName(p.root, 'button', /Trade shards/)).toHaveLength(0);
    expect(find(p.root, (el) => el.getAttribute('data-seat') === 'communal:market')).toHaveLength(
      1,
    );
    p.click(button(p, /^Give/));
    expect(visibleText(p.root)).toMatch(/Acorns/);
    // Shards of any kind may be given (V-COM-15): a row for each pile held, the biggest first; the exchange's rate is not here.
    expect(visibleText(p.root)).toMatch(/Ember shards/);
    expect(visibleText(p.root)).not.toMatch(/\d for 1/);
  });
});

describe('MarketPage once it is built', () => {
  it('shows the broker seat with a free slot and no board', () => {
    const { page: p } = draw('open, free seat');
    expect(byClass(p.root, 'sp-seat')).toHaveLength(1);
    expect(find(p.root, (el) => el.getAttribute('data-seat') === 'broker-1')).toHaveLength(1);
    expect(visibleText(p.root)).toMatch(/Post a broker/);
    expect(visibleText(p.root)).toMatch(/Pick a creature, or drag one here/);
    expect(visibleText(p.root)).not.toMatch(/Still needed/);
  });

  it('posts a creature through the shared picker, and empties the seat from it', () => {
    const { page: p, calls } = draw('open, free seat');
    p.click(button(p, /Broker: nobody posted/));
    expect(visibleText(p.root)).toMatch(/Who trades at the Market/);
    const row = byName(p.root, 'button', /Back to resting/)[0];
    expect(row?.getAttribute('disabled')).not.toBeNull();
    const pick = byRole(p.root, 'option')[1];
    if (pick === undefined) throw new Error('no creature row');
    p.click(pick);
    expect(calls.posts).toHaveLength(1);
    expect(calls.posts[0]?.seatId).toBe('broker-1');
    expect(typeof calls.posts[0]?.creatureId).toBe('string');
  });

  it("says the broker's rate and bonus, and a stuck anvil's wait; its rates open in a drawer", () => {
    const { page: p } = draw('broker stuck');
    expect(visibleText(p.root)).toMatch(
      /Swaps spare shards 12 for 5, with a 15% chance of one extra/,
    );
    expect(visibleText(p.root)).toMatch(/Waiting for spare shards to trade for Tide/);
    p.click(button(p, /Show the rates/));
    const text = visibleText(p.root);
    expect(text).toMatch(/Rate/);
    expect(text).toMatch(/Next step/);
    expect(text).toMatch(/2 for 1/);
  });

  it('sets what it trades toward in a drawer of choices: an element, or back to the orders', () => {
    const { page: p, calls } = draw('open with a broker');
    p.click(button(p, /Trades toward: What the orders need/));
    expect(visibleText(p.root)).toMatch(/It never trades the few shards you keep/);
    p.click(button(p, /^Grove shards/));
    expect(calls.toward).toEqual([{ seatId: 'broker-1', toward: 'grove' }]);
    // The orders' own row is already the chosen one: choosing it again sends nothing.
    p.click(button(p, /Trades toward: What the orders need/));
    p.click(button(p, /^What the orders need/));
    expect(calls.toward).toHaveLength(1);
  });

  it('has the exchange beside the broker: it shows the rate and the crit, and trades only what the shelf can pay', () => {
    const { page: p, calls } = draw('open with a broker');
    p.click(button(p, /Trade shards/));
    expect(visibleText(p.root)).toMatch(
      /3 shards of one kind for 1 of another\. A 10% chance to get 2\./,
    );
    const trade = byName(p.root, 'button', /^Trade \d/)[0];
    if (trade === undefined) throw new Error('no confirm');
    expect(trade.getAttribute('disabled')).toBeNull();
    p.click(trade);
    expect(calls.trades).toHaveLength(1);
    expect(calls.trades[0]?.times).toBe(1);
  });

  it('opens its exchange on the shard an anvil waits for when sent from the Forge', () => {
    const { page: p } = draw('open with a broker', { exchange: 'grove' });
    expect(visibleText(p.root)).toMatch(/Trade 1 for Grove/);
  });

  it('starts with a drawer open when asked (the workbench shots)', () => {
    expect(visibleText(draw('master broker', { toward: true }).page.root)).toMatch(
      /Also keeps a small stock/,
    );
    expect(visibleText(draw('open with a broker', { detail: true }).page.root)).toMatch(
      /Bonus shard/,
    );
    expect(visibleText(draw('open with a broker', { picker: true }).page.root)).toMatch(
      /Who trades at the Market/,
    );
  });
});
