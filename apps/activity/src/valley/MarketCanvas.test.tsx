/**
 * The Market as a canvas (`MarketCanvas`, the rule "A place is a canvas"): what is in the scene and what a click on each thing opens.
 * Drawn in the fake DOM; a phone has no `matchMedia` here, so a panel is its own page (the shell's other half is in `PlaceCanvas.test`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PopoverHost } from '../PopoverHost';
import {
  badgesIn,
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
import { MarketCanvas, type MarketActions, type MarketStart } from './MarketCanvas';
import { sampleCommons, withCommons } from './commons-sample';
import { presetMarket, withMarket, withMarketPlace } from './market-sample';
import { sampleValley } from './signpost-sample';

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
const [a] = free;
if (a === undefined) throw new Error('fixture');

interface Calls {
  posts: { seatId: string; creatureId: string | null }[];
  toward: { seatId: string; toward: string | null }[];
  trades: { to: string; from: string | null; times: number }[];
  gifts: number;
  helpers: { place: string; creatureId: string | null }[];
}

function draw(
  preset: string,
  start: MarketStart = {},
  helper?: { place: string; creatureId: string },
): { page: Page; calls: Calls } {
  const calls: Calls = { posts: [], toward: [], trades: [], gifts: 0, helpers: [] };
  const commons = withMarketPlace(sampleCommons(), preset);
  const market = presetMarket(preset, free);
  const plain = withCommons(sampleValley(free, []), commons, helper);
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
      <MarketCanvas
        visit={visit}
        creatures={free}
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
        start={start}
      />
    </PopoverHost>,
  );
  return { page: p, calls };
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

describe('the Market canvas while the Market is being built', () => {
  it('is a building site: the stall has no exchange, the builders’ corner has the table and the helper spot, no page under it', () => {
    const { page: p } = draw('being built');
    const names = labels(p);
    expect(names.every((n) => n !== '')).toBe(true);
    expect(names.some((n) => /^The builders' table/.test(n))).toBe(true);
    expect(target(p, /^The helper spot/).getAttribute('class')).toMatch(/cv-slot/);
    // No stall to use and no broker seat before it is built.
    expect(names.some((n) => /^The shard stall/.test(n))).toBe(false);
    expect(names.some((n) => /broker/i.test(n))).toBe(false);
    expect(byClass(p.root, 'sp-seat')).toHaveLength(0);
    expect(byClass(p.root, 'pc-page')).toHaveLength(0);
    expect(visibleText(p.root)).not.toMatch(/Trade shards/);
  });

  it('every clickable thing has a plate and the decoration has none', () => {
    const { page: p } = draw('being built');
    expect(byClass(p.root, 'cv-plate').length).toBe(targets(p).length);
  });

  it('the table opens the project board in the left drawer, taking Acorns, scrap and shards of any kind', () => {
    const { page: p } = draw('being built');
    p.click(target(p, /^The builders' table/));
    const text = visibleText(p.root);
    expect(text).toMatch(/Project board/);
    expect(text).toMatch(/Still needed:/);
    expect(badgesIn(byClass(p.root, 'cm-need')[0] as FakeElement)).toEqual([
      ['Bait', '190'],
      ['Scrap', '380'],
    ]);
    expect(find(p.root, (el) => el.getAttribute('data-seat') === 'communal:market')).toHaveLength(
      0,
    );
    p.click(button(p, /^Give/));
    const rows = byClass(p.root, 'choice').map((c) => badgesIn(c)[0]?.[0] ?? '');
    expect(rows).toContain('Bait');
    // Shards of any kind may be given (V-COM-15): a row for each pile held; the exchange's rate is not here.
    expect(rows).toContain('Ember Shards');
    expect(visibleText(p.root)).not.toMatch(/\d for 1/);
  });

  it('the helper spot opens a list of creatures and a tap posts the helper to the Market', () => {
    const { page: p, calls } = draw('being built');
    p.click(target(p, /^The helper spot/));
    expect(visibleText(p.root)).toMatch(/Who helps build the Market/);
    const pick = byRole(p.root, 'option')[1];
    if (pick === undefined) throw new Error('no creature row');
    p.click(pick);
    expect(calls.helpers).toHaveLength(1);
    expect(calls.helpers[0]?.place).toBe('market');
    expect(typeof calls.helpers[0]?.creatureId).toBe('string');
  });

  it('a helper posted stands at the table and hammers, and the spot is no empty outline', () => {
    const { page: p } = draw('being built', {}, { place: 'market', creatureId: a.id });
    expect(
      labels(p).some((n) => /helping build the Market at the builders' table\. Change/.test(n)),
    ).toBe(true);
    expect(labels(p).some((n) => /^The helper spot/.test(n))).toBe(false);
    expect(byClass(p.root, 'fi-hammer')).toHaveLength(1);
  });
});

describe('the Market canvas once it is built', () => {
  it('shows the stall and the broker seat as a dashed outline while it is free, and no corner', () => {
    const { page: p } = draw('open, free seat');
    expect(labels(p).some((n) => /^The shard stall/.test(n))).toBe(true);
    const seat = target(p, /^The broker seat/);
    expect(seat.getAttribute('class')).toMatch(/cv-slot/);
    expect(labels(p).some((n) => /builders' table|helper spot/.test(n))).toBe(false);
    expect(byClass(p.root, 'cv-plate').length).toBe(targets(p).length);
    expect(visibleText(p.root)).not.toMatch(/Still needed/);
  });

  it('posts a creature through the seat’s list, and empties the seat from it', () => {
    const { page: p, calls } = draw('open, free seat');
    p.click(target(p, /^The broker seat/));
    expect(visibleText(p.root)).toMatch(/Who trades at the Market/);
    // Nobody is posted, so "Back to resting" is not offered as a choice.
    const row = byName(p.root, 'button', /Back to resting/)[0];
    expect(row?.getAttribute('disabled')).not.toBeNull();
    const pick = byRole(p.root, 'option')[1];
    if (pick === undefined) throw new Error('no creature row');
    p.click(pick);
    expect(calls.posts).toHaveLength(1);
    expect(calls.posts[0]?.seatId).toBe('broker-1');
    expect(typeof calls.posts[0]?.creatureId).toBe('string');
  });

  it('draws the broker idling at its seat, named and levelled, and a tap opens it', () => {
    const { page: p } = draw('open with a broker');
    expect(byClass(p.root, 'vy-bob')).toHaveLength(1);
    const broker = target(p, /the broker\./);
    expect(broker.getAttribute('class')).not.toMatch(/cv-slot/);
    p.click(broker);
    const text = visibleText(p.root);
    expect(text).toMatch(/Trades toward/);
    expect(text).toMatch(/Rate/);
  });

  it("says the broker's rate and bonus, and a stuck anvil's wait, with its rates and next step in the same step", () => {
    const { page: p } = draw('broker stuck', { detail: true });
    const line = byClass(p.root, 'sp-note').find((n) => /Swaps/.test(visibleText(n)));
    if (line === undefined) throw new Error('no line');
    // The rate is any-shard icons with numbers (12 for 5), never "shards".
    expect(badgesIn(line).slice(0, 2)).toEqual([
      ['Shards of any kind', '12'],
      ['Shards of any kind', '5'],
    ]);
    expect(visibleText(line)).toMatch(/Swaps 12 for 5, with a 15% chance of one extra/);
    expect(visibleText(line)).not.toMatch(/shards/i);
    const text = visibleText(p.root);
    expect(text).toMatch(/Rate/);
    expect(text).toMatch(/Next step/);
    // The next step's rate: 2 for 1.
    expect(
      badgesIn(
        byClass(p.root, 'data-row').find((r) => /Next step/.test(visibleText(r))) as FakeElement,
      ),
    ).toEqual([
      ['Shards of any kind', '2'],
      ['Shards of any kind', '1'],
    ]);
  });

  it('sets what it trades toward in a step of the broker’s panel: an element, or back to the orders', () => {
    const { page: p, calls } = draw('open with a broker', { detail: true });
    p.click(button(p, /Trades toward: What the orders need/));
    expect(visibleText(p.root)).toMatch(/It never trades the few shards you keep/);
    const grove = byClass(p.root, 'choice').find((c) =>
      /^Grove Shard/.test(badgesIn(c)[0]?.[0] ?? ''),
    );
    if (grove === undefined) throw new Error('no Grove row');
    p.click(grove);
    expect(calls.toward).toEqual([{ seatId: 'broker-1', toward: 'grove' }]);
    // Back on the broker's first step.
    expect(visibleText(p.root)).toMatch(/Rate/);
    // The orders' own row is already the chosen one: choosing it again sends nothing.
    p.click(button(p, /Trades toward: What the orders need/));
    p.click(button(p, /^What the orders need/));
    expect(calls.toward).toHaveLength(1);
  });

  it('changes the broker in a step of the same panel, and the list is no sheet over a drawer', () => {
    const { page: p, calls } = draw('open with a broker', { detail: true });
    p.click(button(p, /^Broker: .*Change/));
    expect(visibleText(p.root)).toMatch(/Who trades at the Market/);
    expect(byClass(p.root, 'pc-page')).toHaveLength(1);
    const pick = byRole(p.root, 'option')[2];
    if (pick === undefined) throw new Error('no creature row');
    p.click(pick);
    expect(calls.posts).toHaveLength(1);
    expect(calls.posts[0]?.seatId).toBe('broker-1');
  });

  it('the stall opens the exchange: it shows the rate and the crit, and trades only what the shelf can pay', () => {
    const { page: p, calls } = draw('open with a broker');
    p.click(target(p, /^The shard stall/));
    const rate = byClass(p.root, 'sp-note').find((n) => /chance/.test(visibleText(n)));
    expect(badgesIn(rate as FakeElement)).toEqual([
      ['Shards of any kind', '3'],
      ['Shards of any kind', '1'],
      ['Shards of any kind', '2'],
    ]);
    expect(visibleText(rate as FakeElement)).toMatch(
      /of one kind for 1 of another\. A 10% chance to get/,
    );
    const trade = byClass(p.root, 'action-btn').find((b) => /^Trade/.test(visibleText(b)));
    if (trade === undefined) throw new Error('no confirm');
    expect(trade.getAttribute('disabled')).toBeNull();
    p.click(trade);
    expect(calls.trades).toHaveLength(1);
    expect(calls.trades[0]?.times).toBe(1);
  });

  it('the exchange’s choice of shard is a step of its panel, back on the trade after a pick', () => {
    const { page: p } = draw('open with a broker', { exchange: true });
    p.click(button(p, /^Trade for .*Change/));
    expect(visibleText(p.root)).toMatch(/Trade for/);
    const grove = byClass(p.root, 'choice').find((c) =>
      /^Grove Shard/.test(badgesIn(c)[0]?.[0] ?? ''),
    );
    if (grove === undefined) throw new Error('no Grove row');
    p.click(grove);
    const trade = byClass(p.root, 'action-btn').find((b) => /^Trade/.test(visibleText(b)));
    expect(badgesIn(trade as FakeElement)).toEqual([['Grove Shards', '']]);
  });

  it('opens its exchange on the shard an anvil waits for when sent from the Forge', () => {
    const { page: p } = draw('open with a broker', { exchange: 'grove' });
    const trade = byClass(p.root, 'action-btn').find((b) => /^Trade/.test(visibleText(b)));
    // "Trade", the Grove shard's icon and "× 1".
    expect(badgesIn(trade as FakeElement)).toEqual([['Grove Shards', '']]);
    expect(visibleText(trade as FakeElement)).toMatch(/× 1/);
  });

  it('starts with a panel open when asked (the workbench shots)', () => {
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
