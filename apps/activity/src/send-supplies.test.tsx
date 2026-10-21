import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseGameState } from './api';
import { parseDestinations } from './expedition-parse';
import type { SupplyPick } from './expedition-types';
import destinationsFixture from './fixtures/expedition-destinations.json';
import stateOffer from './fixtures/expedition-state-offer.json';
import { PopoverHost } from './PopoverHost';
import { SendTrip } from './SendTrip';
import { TripSummary } from './TripSummary';
import { SupplyPicker } from './SupplyPicker';
import { FakeElement, byClass, byName, createPage, visibleText, type Page } from './test-dom';

let page: Page | null = null;
const originalRect: unknown = Reflect.get(FakeElement.prototype, 'getBoundingClientRect');
afterEach(() => {
  page?.unmount();
  page = null;
  Reflect.set(FakeElement.prototype, 'getBoundingClientRect', originalRect);
  vi.unstubAllGlobals();
});

const STOCK = {
  'lure-basic': 2,
  'lure-good': 1,
  'map-scrap-basic': 1,
  'satchel-basic': 3,
};

function Kit({ stock, seen }: { stock: Record<string, number>; seen: SupplyPick[][] }) {
  const [picks, setPicks] = useState<SupplyPick[]>([]);
  return (
    <SupplyPicker
      picks={picks}
      stock={stock}
      onChange={(next) => {
        seen.push(next);
        setPicks(next);
      }}
    />
  );
}

function draw(stock: Record<string, number> = STOCK) {
  page = createPage();
  const seen: SupplyPick[][] = [];
  page.draw(<Kit stock={stock} seen={seen} />);
  return { root: page.root, seen };
}

function cell(root: FakeElement, name: string): FakeElement {
  const found = byClass(root, 'supply-cell').find((c) =>
    (c.getAttribute('aria-label') ?? '').includes(name),
  );
  if (found === undefined) throw new Error(`no cell ${name}`);
  return found;
}

const pressed = (el: FakeElement) => el.getAttribute('aria-pressed') === 'true';
const ids = (picks: SupplyPick[] | undefined) => (picks ?? []).map((p) => p.id);

describe('the send screen supply grid', () => {
  it('draws the 12-cell grid and starts with an empty kit', () => {
    const { root } = draw();
    expect(byClass(root, 'supply-cell')).toHaveLength(12);
    expect(byClass(root, 'supply-card')).toHaveLength(0);
    expect(visibleText(root)).not.toContain('Packed:');
  });

  it('toggles a supply in and out of the kit', () => {
    const { root, seen } = draw();
    page?.click(cell(root, 'Plain Lure'));
    expect(ids(seen.at(-1))).toEqual(['lure-basic']);
    expect(pressed(cell(root, 'Plain Lure'))).toBe(true);
    expect(visibleText(root)).not.toContain('Packed:');
    expect(byClass(root, 'supply-card')).toHaveLength(1);
    expect(byClass(cell(root, 'Plain Lure'), 'supply-packed')).toHaveLength(1);
    page?.click(cell(root, 'Plain Lure'));
    expect(ids(seen.at(-1))).toEqual([]);
    expect(pressed(cell(root, 'Plain Lure'))).toBe(false);
  });

  it('deselecting hides the card and clears the selection ring and the tick', () => {
    const { root } = draw();
    page?.click(cell(root, 'Plain Lure'));
    expect(cell(root, 'Plain Lure').getAttribute('class')).toContain('selected');
    page?.click(cell(root, 'Plain Lure'));
    expect(byClass(root, 'supply-card')).toHaveLength(0);
    expect(cell(root, 'Plain Lure').getAttribute('class')).not.toContain('selected');
    expect(byClass(cell(root, 'Plain Lure'), 'supply-packed')).toHaveLength(0);
  });

  it('swaps another tier of the same kind in, one per kind', () => {
    const { root, seen } = draw();
    page?.click(cell(root, 'Plain Lure'));
    page?.click(cell(root, 'Sweet Lure'));
    expect(ids(seen.at(-1))).toEqual(['lure-good']);
    expect(pressed(cell(root, 'Plain Lure'))).toBe(false);
  });

  it('carries at most two kinds and mutes the other kinds once full, still showing stock', () => {
    const { root, seen } = draw();
    page?.click(cell(root, 'Plain Lure'));
    page?.click(cell(root, 'Small Satchel'));
    expect(seen.at(-1)).toHaveLength(2);
    const map = cell(root, 'Map Scrap');
    expect(map.hasAttribute('disabled')).toBe(true);
    expect(map.getAttribute('aria-label')).toContain('your kit is full');
    expect(map.getAttribute('aria-label')).toContain('1 in stock');
    expect(byClass(map, 'supply-count')).toHaveLength(1);
    const before = seen.length;
    page?.click(map);
    expect(seen).toHaveLength(before);
    // A kind in the kit still swaps tiers, and a chosen supply can be taken out.
    page?.click(cell(root, 'Sweet Lure'));
    expect(ids(seen.at(-1))).toEqual(['satchel-basic', 'lure-good']);
    page?.click(cell(root, 'Sweet Lure'));
    expect(seen.at(-1)).toHaveLength(1);
    expect(cell(root, 'Map Scrap').hasAttribute('disabled')).toBe(false);
  });

  it('cannot pick a supply that is out of stock, and says why', () => {
    const { root, seen } = draw();
    const none = cell(root, 'Golden Lure');
    expect(none.hasAttribute('disabled')).toBe(true);
    expect(none.getAttribute('aria-label')).toContain('none in stock');
    expect(none.getAttribute('class')).toContain('blocked');
    page?.click(none);
    expect(seen).toHaveLength(0);
  });

  it('with nothing in stock, points to the Workshop in one line', () => {
    const { root, seen } = draw({});
    expect(visibleText(root)).toContain('You have no supplies. Craft them in the Workshop.');
    for (const c of byClass(root, 'supply-cell')) page?.click(c);
    expect(seen).toHaveLength(0);
  });
});

describe('sending with a kit', () => {
  it('sends the packed supplies as owned', () => {
    page = createPage();
    const view = parseDestinations(destinationsFixture);
    const creatures = parseGameState(stateOffer).creatures.map((c) => ({
      ...c,
      away: false,
      busy: null,
    }));
    const onSend = vi.fn().mockResolvedValue(true);
    page.draw(
      <SendTrip
        creatures={creatures}
        slots={{ total: 2, used: 0, rankSum: 2, tripsFinished: 3, next: null }}
        stock={STOCK}
        bait={0}
        busy={false}
        view={view}
        viewFailed={false}
        timezone="Europe/Helsinki"
        onRetry={() => undefined}
        onSend={onSend}
      />,
    );
    page.click(cell(page.root, 'Plain Lure'));
    page.click(cell(page.root, 'Small Satchel'));
    const [send] = byClass(page.root, 'send-button');
    if (send === undefined) throw new Error('no send button');
    page.click(send);
    expect(onSend).toHaveBeenCalledTimes(1);
    const request = onSend.mock.calls[0]?.[0] as { supplies: SupplyPick[] };
    expect(request.supplies).toEqual([
      { id: 'lure-basic', source: 'owned' },
      { id: 'satchel-basic', source: 'owned' },
    ]);
  });
});

function drawSend(options: { onOpenWorkshop?: () => void } = {}) {
  page = createPage();
  const view = parseDestinations(destinationsFixture);
  const creatures = parseGameState(stateOffer).creatures.map((c) => ({
    ...c,
    away: false,
    busy: null,
  }));
  page.draw(
    <PopoverHost onOpenHowTo={() => undefined}>
      <SendTrip
        creatures={creatures}
        slots={{ total: 2, used: 0, rankSum: 2, tripsFinished: 3, next: null }}
        stock={STOCK}
        bait={0}
        busy={false}
        view={view}
        viewFailed={false}
        timezone="Europe/Helsinki"
        onRetry={() => undefined}
        onSend={() => Promise.resolve(true)}
        {...options}
      />
    </PopoverHost>,
  );
  return page.root;
}

describe('the supplies step of the send screen', () => {
  it('has a help tag in the title row and no explanatory paragraph', () => {
    const root = drawSend();
    const [row] = byClass(root, 'step-row');
    if (row === undefined) throw new Error('no title row');
    expect(visibleText(row)).toContain('Supplies');
    expect(byName(row, 'button', 'What is Supplies?')).toHaveLength(1);
    expect(visibleText(root)).not.toContain('Optional: trips are always free');
    expect(visibleText(root)).not.toContain('What are supplies?');
  });

  it('has a Craft button that opens the Workshop', () => {
    let opened = 0;
    const root = drawSend({
      onOpenWorkshop: () => {
        opened += 1;
      },
    });
    const [craft] = byName(root, 'button', 'Craft supplies in the Workshop');
    if (craft === undefined) throw new Error('no Craft button');
    expect(visibleText(craft)).toBe('Craft');
    page?.click(craft);
    expect(opened).toBe(1);
  });

  it('sums the trip up with a button per supply that opens its card', () => {
    // The little the fake DOM leaves out that the popover asks a browser for (its place on the page).
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
    const root = drawSend();
    Reflect.set(page?.document ?? {}, 'addEventListener', () => undefined);
    Reflect.set(page?.document ?? {}, 'removeEventListener', () => undefined);
    page?.click(cell(root, 'Plain Lure'));
    page?.click(cell(root, 'Small Satchel'));
    const [summary] = byClass(root, 'trip-summary');
    if (summary === undefined) throw new Error('no summary');
    const text = visibleText(summary);
    expect(text).toMatch(/^12 h trip to .+ with .+, carrying Plain Lure and Small Satchel\. Back /);
    expect(text).toMatch(/\d\d:\d\d\.$/);
    expect(visibleText(root)).not.toContain('A 12 h trip with');
    const before = byClass(root, 'supply-card').length;
    const [lure] = byName(summary, 'button', 'Plain Lure');
    if (lure === undefined) throw new Error('no supply button');
    page?.click(lure);
    expect(byClass(root, 'supply-card').length).toBe(before + 1);
  });
});

describe('the trip summary notes', () => {
  const entry = (name: string, trips: string[]) => ({
    id: name,
    name,
    flavor: '',
    bubbles: [],
    fight: [],
    trips,
  });

  it('lists the Boon and Omen only when they touch trips, and the weekly twist', () => {
    page = createPage();
    page.draw(
      <TripSummary
        duration="2 h"
        place="Mossy Burrow"
        explorer="Gobbo"
        supplies={[]}
        treat={false}
        now={0}
        endsAt={null}
        timezone={null}
        boon={entry('Calm', [])}
        omen={entry('Gloom', ['Trips are slower.'])}
        twist={{ name: 'Gold Rush', description: 'More coins.' }}
      />,
    );
    const text = visibleText(page.root);
    expect(text).not.toContain('Boon');
    expect(text).toContain('Omen: Gloom');
    expect(text).toContain('Weekly twist: Gold Rush');
  });
});
