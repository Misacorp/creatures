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
import {
  VisitorPage,
  type BlueprintDone,
  type RerollDone,
  type VisitorActions,
  type VisitorStart,
} from './VisitorPage';
import {
  KNOWN_BLUEPRINT,
  NEW_BLUEPRINT,
  SAMPLE_GEAR,
  rerolled,
  sampleVisitor,
} from './visitor-sample';
import type { Purse, VisitorHere } from './visitor-view';

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

const RICH: Purse = { acorns: 900, scrap: 9000, shards: 200 };
const items = SAMPLE_GEAR.items;
const hat = items.find((i) => i.baseId === 'emberkeepers-crown');
if (hat === undefined) throw new Error('fixture');

interface Calls {
  looks: string[];
  rerolls: string[];
  buys: number;
}

/** The page, with a look that answers at once (the price and odds of the piece asked about) and spends that answer as the server would. */
function draw(
  options: {
    view?: VisitorHere;
    purse?: Purse;
    start?: VisitorStart;
    blueprint?: BlueprintDone;
    busy?: boolean;
    error?: string | null;
  } = {},
): { page: Page; calls: Calls } {
  const calls: Calls = { looks: [], rerolls: [], buys: 0 };
  const view = options.view ?? sampleVisitor();
  const actions: VisitorActions = {
    look: (id) => {
      calls.looks.push(id);
      const item = items.find((i) => i.id === id);
      return Promise.resolve(sampleVisitor({ ...(item === undefined ? {} : { item }) }));
    },
    reroll: (id): Promise<RerollDone | undefined> => {
      calls.rerolls.push(id);
      const before = items.find((i) => i.id === id);
      if (before === undefined) return Promise.resolve(undefined);
      return Promise.resolve({
        before,
        after: rerolled(before),
        paid: { acorns: 60, scrap: 400 },
        next: { acorns: 90, scrap: 600 },
      });
    },
    buy: () => {
      calls.buys += 1;
      return Promise.resolve(
        options.blueprint ?? { baseId: view.blueprint.baseId, duplicate: false },
      );
    },
  };
  const p = createPage();
  page = p;
  p.draw(
    <PopoverHost onOpenHowTo={() => undefined}>
      <VisitorPage
        view={view}
        items={items}
        blueprints={SAMPLE_GEAR.blueprints}
        purse={options.purse ?? RICH}
        busy={options.busy ?? false}
        error={options.error ?? null}
        actions={actions}
        start={options.start ?? {}}
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

/** Lets the page's promises land and redraws. */
async function settle(p: Page): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  p.update(() => undefined);
}

const action = (p: Page, name: RegExp): FakeElement => {
  const el = byClass(p.root, 'action-btn').find((b) => name.test(visibleText(b)));
  if (el === undefined) throw new Error(`no action ${String(name)}`);
  return el;
};

describe('the visitor page: the week`s blueprint (V-VIS-5)', () => {
  it('is one card: the piece, its price as icons (Acorns and shards of any kind) and Buy', () => {
    const { page: p } = draw();
    const text = visibleText(p.root);
    expect(text).toMatch(/This week.s blueprint/);
    expect(text).toMatch(/Blueprint: Thundercap/);
    const buy = action(p, /^Buy/);
    // The price is an icon and a number each, never the resource's name.
    expect(badgesIn(buy)).toEqual([
      ['Bait', '40'],
      ['Shards of any kind', '50'],
    ]);
    expect(text).not.toMatch(/\bAcorns?\b|\bscrap\b|\bshards\b/i);
    expect(text).toMatch(/A new one for you/);
  });

  it('buys with one tap, then says it is bought for the week', async () => {
    const { page: p, calls } = draw();
    p.click(action(p, /^Buy/));
    await settle(p);
    expect(calls.buys).toBe(1);
    expect(visibleText(p.root)).toMatch(/Bought this week\./);
    expect(byClass(p.root, 'action-btn').filter((b) => /^Buy/.test(visibleText(b)))).toHaveLength(
      0,
    );
  });

  it('says it is bought when the server says so (a reload later in the week)', () => {
    const { page: p } = draw({ view: sampleVisitor({ bought: true }) });
    expect(visibleText(p.root)).toMatch(/Bought this week\./);
    // Said once: the card's note goes with the Buy button.
    expect(visibleText(p.root)).not.toMatch(/A new one for you/);
  });

  it('a copy of a known blueprint says it adds a mark (as every other source does), and shows the quality it has', () => {
    const { page: p } = draw({ view: sampleVisitor({ baseId: KNOWN_BLUEPRINT }) });
    const text = visibleText(p.root);
    expect(text).toMatch(/a copy adds a mark of quality/);
    expect(text).toMatch(/Known/);
    expect(text).toMatch(/Quality \d+ \/ 10/);
  });

  it('after a copy it shows the mark it added, or that it became scrap past the most', async () => {
    const copy = draw({
      view: sampleVisitor({ baseId: KNOWN_BLUEPRINT }),
      blueprint: { baseId: KNOWN_BLUEPRINT, duplicate: true, marks: 4 },
    });
    copy.page.click(action(copy.page, /^Buy/));
    await settle(copy.page);
    expect(visibleText(copy.page.root)).toMatch(/Quality 4 \/ 10/);
    copy.page.unmount();
    const scrap = draw({
      view: sampleVisitor({ baseId: KNOWN_BLUEPRINT }),
      blueprint: { baseId: KNOWN_BLUEPRINT, duplicate: true },
    });
    scrap.page.click(action(scrap.page, /^Buy/));
    await settle(scrap.page);
    expect(visibleText(scrap.page.root)).toMatch(/It became scrap\./);
  });

  it('cannot be bought without the Acorns or the shards, and says what is short with icons', () => {
    const { page: p, calls } = draw({ purse: { acorns: 10, scrap: 0, shards: 3 } });
    const buy = action(p, /^Buy/);
    expect(buy.getAttribute('disabled')).not.toBeNull();
    const line = byClass(p.root, 'vs-short')[0] as FakeElement;
    expect(badgesIn(line)).toEqual([
      ['Bait', '10'],
      ['Shards of any kind', '3'],
      ['Bait', '40'],
      ['Shards of any kind', '50'],
    ]);
    p.click(buy);
    expect(calls.buys).toBe(0);
    expect(NEW_BLUEPRINT).toBe('thundercap');
  });
});

describe('the visitor page: the reroll (V-VIS-2, 3, 4)', () => {
  it('opens one drawer with your pieces, the worn ones first, and nothing is bought by looking', async () => {
    const { page: p, calls } = draw();
    expect(visibleText(p.root)).toMatch(/all its modifier lines are drawn again/);
    p.click(button(p, /Choose a piece/));
    const tiles = byClass(p.root, 'item-tile');
    expect(tiles).toHaveLength(items.length);
    // Worn first: the first tiles carry the Worn flag, and then the bag's pieces by item level.
    const worn = items.filter((i) => i.equippedOn !== null).length;
    expect(byClass(p.root, 'item-tile-flag')).toHaveLength(worn);
    expect(
      tiles.slice(0, worn).every((t) => /, worn/.test(t.getAttribute('aria-label') ?? '')),
    ).toBe(true);
    expect(calls.looks).toHaveLength(0);
    expect(calls.rerolls).toHaveLength(0);
    // The confirm waits for a piece.
    expect(action(p, /Choose a piece/).getAttribute('disabled')).not.toBeNull();
    await settle(p);
  });

  it('shows the piece`s card, the odds, and the price as icons on the one confirm, which rerolls it', async () => {
    const { page: p, calls } = draw();
    p.click(button(p, /Choose a piece/));
    const tile = byClass(p.root, 'item-tile').find((t) =>
      /Emberkeeper/.test(t.getAttribute('aria-label') ?? ''),
    );
    if (tile === undefined) throw new Error('no tile');
    p.click(tile);
    // Asking is free; the confirm waits until the price and odds have come.
    expect(calls.looks).toEqual([hat.id]);
    expect(action(p, /^Reroll/).getAttribute('disabled')).not.toBeNull();
    await settle(p);
    const text = visibleText(p.root);
    expect(text).toMatch(/All 3 of its lines are drawn again/);
    expect(text).toMatch(/chance of Tier 4 \/ 5, the best this piece can reach/);
    expect(text).toMatch(/The old lines are gone for good\. There is no keeping the old version\./);
    // The price is on the confirm itself (an icon and a number each), said once.
    expect(byClass(p.root, 'vs-priceline')).toHaveLength(0);
    const confirm = action(p, /^Reroll/);
    expect(confirm.getAttribute('disabled')).toBeNull();
    expect(badgesIn(confirm).map(([name]) => name)).toEqual(['Bait', 'Scrap']);
    expect(calls.rerolls).toHaveLength(0);
    p.click(confirm);
    await settle(p);
    expect(calls.rerolls).toEqual([hat.id]);
  });

  it('then shows the lines before and after, says the old ones are gone, and the next price', async () => {
    const { page: p } = draw({ start: { reroll: hat.id } });
    await settle(p);
    p.click(action(p, /^Reroll/));
    await settle(p);
    const text = visibleText(p.root);
    expect(text).toMatch(/Rerolled\. The old lines are gone\./);
    expect(text).toMatch(/Before/);
    expect(text).toMatch(/After/);
    // Two cards of the same piece, the second with the changes marked.
    expect(byClass(p.root, 'idc')).toHaveLength(2);
    expect(byClass(p.root, 'idc')[1]?.textContent ?? '').toMatch(/[+−]/);
    const next = byClass(p.root, 'vs-priceline')[0] as FakeElement;
    expect(visibleText(next)).toMatch(/Next reroll/);
    expect(badgesIn(next)).toEqual([
      ['Bait', '90'],
      ['Scrap', '600'],
    ]);
    expect(badgesIn(action(p, /Reroll again/))).toEqual([]);
    // Rerolling again goes back to the piece, with a fresh read.
    p.click(action(p, /Reroll again/));
    await settle(p);
    expect(byClass(p.root, 'item-tile').length).toBeGreaterThan(0);
  });

  it('says what is short with icons and does not roll when the purse is empty', async () => {
    const { page: p, calls } = draw({
      start: { reroll: hat.id },
      purse: { acorns: 1, scrap: 2, shards: 0 },
      error: 'Not enough Bait.',
    });
    await settle(p);
    const confirm = action(p, /^Reroll/);
    expect(confirm.getAttribute('disabled')).not.toBeNull();
    // The drawer's own line is the last (the blueprint card behind it is short too).
    const short = byClass(p.root, 'vs-short').at(-1) as FakeElement;
    expect(badgesIn(short).map(([name]) => name)).toEqual(['Bait', 'Scrap', 'Bait', 'Scrap']);
    // The shared short-of line is the one reason shown: the server's words do not repeat it.
    expect(visibleText(p.root)).not.toMatch(/Not enough/);
    p.click(confirm);
    expect(calls.rerolls).toHaveLength(0);
  });

  it('shows the server`s error in the drawer when nothing is short', async () => {
    const { page: p } = draw({ start: { reroll: hat.id }, error: 'Something went wrong.' });
    await settle(p);
    expect(visibleText(p.root)).toMatch(/Something went wrong\./);
  });

  it('holds every button while an action is under way', async () => {
    const { page: p } = draw({ busy: true, start: { reroll: hat.id } });
    await settle(p);
    expect(action(p, /^Reroll/).getAttribute('disabled')).not.toBeNull();
    expect(action(p, /^Buy/).getAttribute('disabled')).not.toBeNull();
  });
});
