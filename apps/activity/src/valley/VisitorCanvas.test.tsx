/**
 * The visitor's stall as a canvas (`VisitorCanvas`, the rule "A place is a canvas"): what is in the scene, what a click on each thing
 * opens, and the reroll and the blueprint inside their drawers. Drawn in the fake DOM; a phone has no `matchMedia` here, so a panel is its
 * own page (the shell's other half is in `PlaceCanvas.test`); the wide look is stubbed where a test needs it.
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
import { VisitorCanvas } from './VisitorCanvas';
import type { BlueprintDone, RerollDone, VisitorActions, VisitorStart } from './VisitorPanels';
import {
  KNOWN_BLUEPRINT,
  NEW_BLUEPRINT,
  SAMPLE_AWAY,
  SAMPLE_GEAR,
  rerolled,
  sampleVisitor,
} from './visitor-sample';
import { AWAY_LINE, type Purse } from './visitor-view';
import type { VisitorState } from '../api';

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

const RICH: Purse = { acorns: 900, scrap: 9000, shards: 200 };
const items = SAMPLE_GEAR.items;
const hat = items.find((i) => i.baseId === 'emberkeepers-crown');
if (hat === undefined) throw new Error('fixture');
const creatures = homeInput('busy', true).creatures.map((c) => ({ ...c, busy: null, away: false }));

interface Calls {
  looks: string[];
  rerolls: string[];
  buys: number;
}

/** The stall, with a look that answers at once (the price and odds of the piece asked about) and spends that answer as the server would. */
function draw(
  options: {
    view?: VisitorState;
    purse?: Purse;
    start?: VisitorStart;
    blueprint?: BlueprintDone;
    busy?: boolean;
    error?: string | null;
    wide?: boolean;
    items?: typeof items | null;
    paddock?: () => void;
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
        options.blueprint ?? {
          baseId: view.here ? view.blueprint.baseId : NEW_BLUEPRINT,
          duplicate: false,
        },
      );
    },
  };
  if (options.wide === true) {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  }
  const p = createPage();
  page = p;
  p.draw(
    <PopoverHost onOpenHowTo={() => undefined}>
      <VisitorCanvas
        view={view}
        creatures={creatures}
        trayInput={{ trips: [], jobs: null, now: 0 }}
        items={options.items === undefined ? items : options.items}
        blueprints={SAMPLE_GEAR.blueprints}
        purse={options.purse ?? RICH}
        busy={options.busy ?? false}
        error={options.error ?? null}
        actions={actions}
        start={options.start ?? {}}
        onOpenPaddock={options.paddock ?? (() => undefined)}
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

const openReroll = (p: Page): void => {
  p.click(target(p, /^The visitor/));
};

const tile = (p: Page, name: RegExp): FakeElement => {
  const found = byClass(p.root, 'item-tile').find((t) =>
    name.test(t.getAttribute('aria-label') ?? ''),
  );
  if (found === undefined) throw new Error('no tile');
  return found;
};

describe('the visitor canvas: the scene', () => {
  it('here: the visitor and the week`s blueprint are the two things to click, each with a plate; nothing else, no page', () => {
    const { page: p } = draw();
    expect(labels(p)).toHaveLength(2);
    expect(target(p, /^The visitor/)).toBeDefined();
    expect(target(p, /^This week's blueprint on the counter, .*for sale/)).toBeDefined();
    expect(byClass(p.root, 'cv-plate').map((el) => el.textContent.trim())).toEqual([
      'Visitor',
      'Blueprint',
    ]);
    expect(byClass(p.root, 'pc-page')).toHaveLength(0);
    expect(byClass(p.root, 'sp-seat')).toHaveLength(0);
    // No timer and no "until" line while he is here; no builders' corner (he has no project).
    expect(visibleText(p.root)).not.toMatch(/until|back thursday|\d+ ?h\b/i);
    expect(labels(p).some((n) => /builders|helper|project/i.test(n))).toBe(false);
  });

  it('the creature tray stays under the scene, and a creature opens the Paddock', () => {
    let opened = 0;
    const { page: p } = draw({
      paddock: () => {
        opened += 1;
      },
    });
    const below = byClass(p.root, 'pc-below')[0] as FakeElement;
    const mons = byClass(below, 'vy-mon');
    expect(mons).toHaveLength(creatures.length);
    p.click(mons[0] as FakeElement);
    expect(opened).toBe(1);
  });

  it('away: the shuttered stall, and the sign is the one thing to click: it says he is back Thursday, no timer', () => {
    const { page: p } = draw({ view: SAMPLE_AWAY });
    expect(labels(p)).toHaveLength(1);
    const sign = target(p, /^The sign/);
    expect(sign.getAttribute('aria-label')).toContain(AWAY_LINE);
    expect(byClass(p.root, 'cv-plate')[0]?.textContent).toMatch(/Back Thursday/);
    expect(byName(p.root, 'button', /Reroll|blueprint/i)).toHaveLength(0);
    p.click(sign);
    expect(byClass(p.root, 'pc-page')).toHaveLength(1);
    expect(visibleText(p.root)).toContain(AWAY_LINE);
    expect(visibleText(p.root)).not.toMatch(/until|\d+ ?h\b/i);
  });
});

describe('the visitor canvas: the week`s blueprint (V-VIS-5)', () => {
  const openBlueprint = (p: Page): void => {
    p.click(target(p, /^This week's blueprint/));
  };

  it('opens in the right drawer: the piece, its price as icons (Acorns and shards of any kind) and Buy', () => {
    const { page: p } = draw();
    openBlueprint(p);
    expect(byClass(p.root, 'pc-page')).toHaveLength(1);
    const text = visibleText(p.root);
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

  it('buys with one tap, then says it is bought for the week, also on the counter`s label', async () => {
    const { page: p, calls } = draw();
    openBlueprint(p);
    p.click(action(p, /^Buy/));
    await settle(p);
    expect(calls.buys).toBe(1);
    expect(visibleText(p.root)).toMatch(/Bought this week\./);
    expect(byClass(p.root, 'action-btn').filter((b) => /^Buy/.test(visibleText(b)))).toHaveLength(
      0,
    );
    expect(target(p, /^This week's blueprint/).getAttribute('aria-label')).toMatch(
      /bought this week/,
    );
  });

  it('says it is bought when the server says so (a reload later in the week)', () => {
    const { page: p } = draw({ view: sampleVisitor({ bought: true }) });
    openBlueprint(p);
    expect(visibleText(p.root)).toMatch(/Bought this week\./);
    // Said once: the card's note goes with the Buy button.
    expect(visibleText(p.root)).not.toMatch(/A new one for you/);
  });

  it('a copy of a known blueprint says it adds a mark (as every other source does), and shows the quality it has', () => {
    const { page: p } = draw({ view: sampleVisitor({ baseId: KNOWN_BLUEPRINT }) });
    openBlueprint(p);
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
    openBlueprint(copy.page);
    copy.page.click(action(copy.page, /^Buy/));
    await settle(copy.page);
    expect(visibleText(copy.page.root)).toMatch(/Quality 4 \/ 10/);
    copy.page.unmount();
    page = null;
    const scrap = draw({
      view: sampleVisitor({ baseId: KNOWN_BLUEPRINT }),
      blueprint: { baseId: KNOWN_BLUEPRINT, duplicate: true },
    });
    openBlueprint(scrap.page);
    scrap.page.click(action(scrap.page, /^Buy/));
    await settle(scrap.page);
    expect(visibleText(scrap.page.root)).toMatch(/It became scrap\./);
  });

  it('cannot be bought without the Acorns or the shards, and says what is short with icons', () => {
    const { page: p, calls } = draw({ purse: { acorns: 10, scrap: 0, shards: 3 } });
    openBlueprint(p);
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
  });

  it('starts open when asked (the workbench)', () => {
    const { page: p } = draw({ start: { blueprint: true } });
    expect(byClass(p.root, 'pc-page')).toHaveLength(1);
    expect(visibleText(p.root)).toMatch(/Blueprint: Thundercap/);
  });
});

describe('the visitor canvas: the reroll (V-VIS-2, 3, 4)', () => {
  it('opens in the right drawer on your pieces, the worn ones first, and nothing is bought by looking', async () => {
    const { page: p, calls } = draw();
    openReroll(p);
    expect(byClass(p.root, 'pc-page')).toHaveLength(1);
    const tiles = byClass(p.root, 'item-tile');
    expect(tiles).toHaveLength(items.length);
    // Worn first: the first tiles carry the Worn flag, and then the bag's pieces by item level.
    const worn = items.filter((i) => i.equippedOn !== null).length;
    expect(byClass(p.root, 'item-tile-flag')).toHaveLength(worn);
    expect(
      tiles.slice(0, worn).every((t) => /, worn/.test(t.getAttribute('aria-label') ?? '')),
    ).toBe(true);
    expect(visibleText(p.root)).toMatch(/all its modifier lines are drawn again/);
    // The first step is the picker: nothing to confirm yet.
    expect(byClass(p.root, 'action-btn')).toHaveLength(0);
    await settle(p);
    expect(calls.looks).toHaveLength(0);
    expect(calls.rerolls).toHaveLength(0);
  });

  it('a piece opens its step: the card, the odds, the price as icons on the one confirm, which rerolls it', async () => {
    const { page: p, calls } = draw();
    openReroll(p);
    p.click(tile(p, /Emberkeeper/));
    // Asking is free; the confirm waits until the price and odds have come.
    expect(calls.looks).toEqual([hat.id]);
    expect(byClass(p.root, 'item-tile')).toHaveLength(0);
    expect(byClass(p.root, 'idc')).toHaveLength(1);
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

  it('Back from the piece goes to the pieces', async () => {
    const { page: p } = draw();
    openReroll(p);
    p.click(tile(p, /Emberkeeper/));
    await settle(p);
    expect(byClass(p.root, 'item-tile')).toHaveLength(0);
    p.click(byClass(p.root, 'drill-back')[0] as FakeElement);
    expect(byClass(p.root, 'item-tile')).toHaveLength(items.length);
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
    // Rerolling again goes back to the pieces.
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
  });

  it('while the gear view loads the picker says so, not a broken step', () => {
    const { page: p } = draw({ items: null, start: { reroll: true } });
    expect(visibleText(p.root)).toMatch(/Loading/);
  });
});

describe('the visitor canvas: the item card and the other drawer', () => {
  it('on a wide window the card opens in the left drawer, the odds and the confirm stay on the right', async () => {
    const { page: p } = draw({ wide: true, start: { reroll: hat.id } });
    await settle(p);
    await settle(p);
    const sides = byClass(p.root, 'pc-side');
    expect(sides.map((s) => s.getAttribute('data-side')).sort()).toEqual(['left', 'right']);
    const left = byClass(p.root, 'pc-left')[0] as FakeElement;
    const right = byClass(p.root, 'pc-right')[0] as FakeElement;
    expect(byClass(left, 'idc')).toHaveLength(1);
    expect(byClass(right, 'idc')).toHaveLength(0);
    expect(visibleText(right)).toMatch(/lines are drawn again/);
    expect(action(p, /^Reroll/)).toBeDefined();
  });

  it('on a phone one page holds the card', async () => {
    const { page: p } = draw({ start: { reroll: hat.id } });
    await settle(p);
    expect(byClass(p.root, 'pc-page')).toHaveLength(1);
    expect(byClass(p.root, 'idc')).toHaveLength(1);
  });
});
