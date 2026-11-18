import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_STATE } from '../creature-card-sample';
import { byClass, byName, createPage, visibleText, type FakeElement, type Page } from '../test-dom';
import { SAMPLE_NOW, sampleHouse, sampleList, sampleOwn } from './house-sample';

/**
 * The valley's House with housing on, drawn as a place's canvas (`HousePlace` with `canvas`, "A place is a canvas"): the house is the
 * scene, every room and fixture and spot wears one name plate, and every panel is a drawer (on a phone, a page over the scene). The
 * network is a stand-in; the rest is the real component. (The page layout, with no `canvas`, is `house-place.test.tsx`.)
 */

vi.mock('./housing-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./housing-api')>()),
  fetchOwnHouse: () => Promise.resolve({ house: sampleHouse(), own: sampleOwn('rich') }),
  fetchHouse: () => Promise.resolve({ house: sampleHouse() }),
  fetchHouses: () => Promise.resolve(sampleList()),
  fetchCatalogue: () => Promise.reject(new Error('not needed here')),
  markSeen: () => Promise.resolve(),
}));

const { HousePlace } = await import('./HousePlace');
const { canvasFocusScale } = await import('./RoomFocus');

let page: Page | null = null;

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
  Reflect.set(globalThis, 'window', {
    innerHeight: 800,
    innerWidth: 390,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    scrollTo: () => undefined,
  });
});

afterEach(() => {
  page?.unmount();
  page = null;
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, 'window');
});

async function settle(p: Page): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  p.update(() => undefined);
}

async function open(): Promise<Page> {
  page = createPage();
  page.draw(
    <HousePlace
      creatures={SAMPLE_STATE.creatures}
      now={SAMPLE_NOW}
      canvas={{ book: (which) => <p>The {which} page</p> }}
    />,
  );
  await settle(page);
  return page;
}

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

const plateTexts = (root: FakeElement): string[] =>
  byClass(root, 'cv-plate').map((el) => visibleText(el));

describe('the House place as a canvas', () => {
  it('is the house itself: the cutaway fills the view, no rows, no outside picture, no Back of its own', async () => {
    const p = await open();
    expect(byClass(p.root, 'pc-root')).toHaveLength(1);
    expect(byClass(p.root, 'house-scene')).toHaveLength(1);
    expect(first(byClass(p.root, 'house-scene')).getAttribute('data-canvas')).toBe('yes');
    expect(byClass(p.root, 'vy-row')).toHaveLength(0);
    expect(byClass(p.root, 'house-postcard-band')).toHaveLength(0);
    expect(byName(p.root, 'button', /Back/)).toHaveLength(0);
  });

  it('puts one name plate on every room, the mailbox and the workbench, and one on each collection button', async () => {
    const p = await open();
    const plates = plateTexts(p.root);
    for (const name of ['Hearth', 'Loft', 'Mailbox', 'Workbench']) {
      expect(
        plates.filter((t) => t === name),
        name,
      ).toHaveLength(1);
    }
    for (const name of ['Build', 'Catalogue', 'Visit', 'Journal', 'Stats']) {
      expect(
        plates.filter((t) => t === name),
        name,
      ).toHaveLength(1);
    }
    // One plate per clickable thing: every room button and every fixture holds exactly one.
    for (const el of [...byClass(p.root, 'house-room'), ...byClass(p.root, 'house-fixture')]) {
      expect(byClass(el, 'cv-plate'), el.getAttribute('aria-label') ?? '').toHaveLength(1);
    }
  });

  it('opens Build in a panel (a page on a phone), a part as a step with Back to the parts, then closes it to the scene', async () => {
    const p = await open();
    p.click(first(byName(p.root, 'button', /^Build, /)));
    await settle(p);
    expect(byClass(p.root, 'pc-page')).toHaveLength(1);
    expect(byName(p.root, 'button', 'Pay in')).toHaveLength(0);
    p.click(first(byName(p.root, 'button', /^Cellar, /)));
    await settle(p);
    expect(byName(p.root, 'button', 'Pay in')).toHaveLength(1);
    p.click(first(byClass(p.root, 'drill-back')));
    await settle(p);
    expect(byName(p.root, 'button', 'Pay in')).toHaveLength(0);
    expect(byClass(p.root, 'pc-page')).toHaveLength(1);
    p.click(first(byClass(p.root, 'drill-back')));
    await settle(p);
    expect(byClass(p.root, 'pc-page')).toHaveLength(0);
    expect(byClass(p.root, 'house-room').length).toBeGreaterThan(0);
  });

  it('opens the mailbox from the yard and the Journal from its button, each as the panel of its side', async () => {
    const p = await open();
    p.click(first(byName(p.root, 'button', /^Mailbox/)));
    await settle(p);
    const page1 = first(byClass(p.root, 'pc-page'));
    expect(page1.getAttribute('data-side')).toBe('right');
    expect(page1.getAttribute('aria-label')).toBe('Mailbox');
    p.click(first(byClass(p.root, 'drill-back')));
    await settle(p);
    p.click(first(byName(p.root, 'button', /^Journal, /)));
    await settle(p);
    const page2 = first(byClass(p.root, 'pc-page'));
    expect(page2.getAttribute('data-side')).toBe('left');
    expect(visibleText(page2)).toContain('The journal page');
  });

  it('focuses a room with a plate on each spot, and a spot opens its choices in the right panel', async () => {
    const p = await open();
    p.click(first(byName(p.root, 'button', /^Hearth/)));
    await settle(p);
    expect(byClass(p.root, 'house-scene')).toHaveLength(0);
    const spots = byClass(p.root, 'house-spot');
    expect(spots.length).toBeGreaterThanOrEqual(8);
    for (const el of spots) {
      expect(byClass(el, 'cv-plate'), el.getAttribute('aria-label') ?? '').toHaveLength(1);
    }
    p.click(first(byName(p.root, 'button', /^Small floor: Cosy Chair/)));
    await settle(p);
    expect(first(byClass(p.root, 'pc-page')).getAttribute('data-side')).toBe('right');
    expect(byName(p.root, 'button', /^Empty/).length).toBeGreaterThan(0);
  });

  it('opens a look (the roof) as the right panel, from the strip under the scene', async () => {
    const p = await open();
    p.click(first(byName(p.root, 'button', /^Roof look: /)));
    await settle(p);
    expect(first(byClass(p.root, 'pc-page')).getAttribute('data-side')).toBe('right');
  });

  it('lists the houses in the left panel and walks into one as a canvas of its own', async () => {
    const p = await open();
    p.click(first(byName(p.root, 'button', /^Visit, /)));
    await settle(p);
    expect(byClass(p.root, 'pc-page')).toHaveLength(1);
    p.click(first(byName(p.root, 'button', /^Mika/)));
    await settle(p);
    expect(byClass(p.root, 'house-visit')).toHaveLength(1);
    expect(byClass(p.root, 'pc-root')).toHaveLength(1);
    expect(byName(p.root, 'button', /^The guestbook/)).toHaveLength(1);
  });

  it('puts the collection buttons in the canvas’s own overlay, outside the scene, marked as panning nothing', async () => {
    const p = await open();
    const overlay = first(byClass(p.root, 'pc-overlay'));
    const tools = byClass(overlay, 'hc-tool');
    expect(tools.length).toBeGreaterThanOrEqual(5);
    expect(first(byClass(overlay, 'hc-tools')).getAttribute('data-no-pan')).toBe('yes');
    expect(byClass(first(byClass(p.root, 'pc-main')), 'hc-tool')).toHaveLength(0);
  });

  it('keeps every spot reachable by name; its plate is there for the style to show while looked at', async () => {
    const p = await open();
    p.click(first(byName(p.root, 'button', /^Hearth/)));
    await settle(p);
    for (const el of byClass(p.root, 'house-spot')) {
      expect(el.getAttribute('aria-label') ?? '').toMatch(/\S/);
    }
    // The room fills the stage (a canvas), and its look chips are the strip under it, not inside the stage.
    expect(first(byClass(p.root, 'house-focus')).getAttribute('data-canvas')).toBe('yes');
    expect(byClass(first(byClass(p.root, 'hc-stage')), 'house-chips')).toHaveLength(0);
    expect(byClass(first(byClass(p.root, 'pc-below')), 'house-chips').length).toBeGreaterThan(0);
  });

  it('Escape with a drawer open closes only the drawer: the room stays', async () => {
    const p = await open();
    p.click(first(byName(p.root, 'button', /^Hearth/)));
    await settle(p);
    p.click(first(byName(p.root, 'button', /^Small floor: Cosy Chair/)));
    await settle(p);
    expect(byClass(p.root, 'pc-page')).toHaveLength(1);
    p.key(first(byClass(p.root, 'pc-page')), 'Escape');
    await settle(p);
    expect(byClass(p.root, 'pc-page')).toHaveLength(0);
    expect(byClass(p.root, 'house-focus')).toHaveLength(1);
    expect(byClass(p.root, 'house-scene')).toHaveLength(0);
  });

  it('Back from a room closes the drawer that belonged to it, so a spot’s choices never stay over the cutaway', async () => {
    const p = await open();
    p.click(first(byName(p.root, 'button', /^Hearth/)));
    await settle(p);
    p.click(first(byName(p.root, 'button', /^Small floor: Cosy Chair/)));
    await settle(p);
    expect(byClass(p.root, 'pc-page')).toHaveLength(1);
    // The room's own Back (in the stage, hidden behind a phone's page) takes the room and its drawer away together.
    p.click(first(byClass(first(byClass(p.root, 'hc-stage')), 'drill-back')));
    await settle(p);
    expect(byClass(p.root, 'pc-page')).toHaveLength(0);
    expect(byClass(p.root, 'house-scene')).toHaveLength(1);
  });
});

describe('a room in a canvas', () => {
  it('is drawn at the largest whole scale that fits the stage both ways (never under 2, at most 10)', () => {
    // A one-cell room (112 x 64) on a phone stage 390 x 560: width allows 3, height allows 8.
    expect(canvasFocusScale(390, 560, 112, 64)).toBe(3);
    // The same room on a wide stage 1100 x 650: width allows 9, height 10: the width is the limit.
    expect(canvasFocusScale(1100, 650, 112, 64)).toBe(9);
    expect(canvasFocusScale(3000, 3000, 112, 64)).toBe(10);
    // A tall stage is not the limit; a short one is.
    expect(canvasFocusScale(1100, 200, 112, 64)).toBe(3);
    // Too wide for the phone at 2: it stays 2 and pans.
    expect(canvasFocusScale(390, 560, 336, 64)).toBe(2);
  });
});
