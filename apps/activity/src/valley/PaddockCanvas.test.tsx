/**
 * The Paddock as a canvas (`PaddockCanvas`, the rule "A place is a canvas"): what is in the yard and what a click on each thing opens.
 * Drawn in the fake DOM; a phone has no `matchMedia` here, so a panel is its own page (the shell's other half is in `PlaceCanvas.test`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_GEAR, SAMPLE_STATE } from '../creature-card-sample';
import {
  byClass,
  byName,
  byRole,
  createPage,
  visibleText,
  type FakeElement,
  type Page,
} from '../test-dom';
import { homeInput } from '../workbench/home-sample';
import type { CommonsActions } from './CommonsBoard';
import { buildingPlace, openPlace, sampleCommons, withCommons } from './commons-sample';
import { PaddockCanvas, type PaddockStart } from './PaddockCanvas';
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
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => null, setItem: () => undefined },
  });
});
afterEach(() => {
  // The scene listens for Escape on the document and lets go of it on unmount; the fake DOM has none.
  vi.stubGlobal('document', {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  page?.unmount();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, 'localStorage');
  page = null;
});

const free = homeInput('busy', true).creatures.map((c) => ({ ...c, busy: null, away: false }));
const [a] = free;
if (a === undefined) throw new Error('fixture');
const home = sampleValley(free, []);
const noop = (): void => undefined;

interface Calls {
  posts: [string, string | null][];
}

function draw(
  visit: typeof home,
  options: {
    withActions?: boolean;
    waiting?: number;
    calls?: Calls;
    start?: PaddockStart;
  } = {},
): Page {
  const calls = options.calls ?? { posts: [] };
  const commons: CommonsActions = {
    give: () => Promise.resolve(true),
    post: (place, creatureId) => {
      calls.posts.push([place, creatureId]);
      return Promise.resolve(true);
    },
  };
  const p = createPage();
  page = p;
  p.draw(
    <PaddockCanvas
      visit={visit}
      acorns={100}
      {...(options.withActions === true ? { commons } : {})}
      {...(options.start === undefined ? {} : { start: options.start })}
      collection={{
        state: {
          ...SAMPLE_STATE,
          creatures: free,
          pending: SAMPLE_STATE.pending.slice(0, options.waiting ?? 0),
        },
        gear: SAMPLE_GEAR,
        busy: false,
        catchActions: { chooseMany: () => Promise.resolve(true) },
        onEquip: () => Promise.resolve(true),
        onRibbon: noop,
        onEvolve: noop,
        onRename: noop,
        onNote: noop,
        onLounge: noop,
        onSlotTalent: noop,
      }}
    />,
  );
  return p;
}

const targets = (p: Page): FakeElement[] =>
  byClass(p.root, 'cv-target').filter((el) => el.localName === 'button');
const labels = (p: Page): string[] => targets(p).map((el) => el.getAttribute('aria-label') ?? '');
const target = (p: Page, name: RegExp): FakeElement => {
  const found = targets(p).find((el) => name.test(el.getAttribute('aria-label') ?? ''));
  if (found === undefined) throw new Error(`no target ${String(name)}`);
  return found;
};

describe('the Paddock canvas: the scene', () => {
  it('opens on the yard: a named tap for each creature at home and the Creatures button, no page under it', () => {
    const p = draw(home);
    const names = labels(p);
    expect(names.every((n) => n !== '')).toBe(true);
    const drawn = names.filter((n) => /at home in the Paddock/.test(n)).length;
    const more = names.find((n) => /show all your creatures/.test(n));
    expect(drawn).toBeGreaterThan(0);
    expect(more === undefined ? drawn : drawn + Number(/^\+(\d+) more/.exec(more)?.[1])).toBe(
      free.length,
    );
    expect(names.some((n) => /^Creatures:|show all your creatures/.test(n))).toBe(true);
    expect(byClass(p.root, 'pc-page')).toHaveLength(0);
    expect(byClass(p.root, 'pc-side')).toHaveLength(0);
  });

  it('every clickable thing has a plate, and each roaming creature can be picked up by a hand', () => {
    const p = draw(withCommons(home), { withActions: true, waiting: 1 });
    expect(byClass(p.root, 'cv-plate').length).toBe(targets(p).length);
    expect(byClass(p.root, 'nameplate-level').length).toBeGreaterThan(0);
    const roaming = labels(p).filter((n) => /at home in the Paddock/.test(n)).length;
    expect(byClass(p.root, 'vy-drag')).toHaveLength(roaming);
  });

  it('the gate is a tap only while newcomers wait, and stands them at it', () => {
    const none = draw(home);
    expect(labels(none).some((n) => /^The gate/.test(n))).toBe(false);
    none.unmount();
    page = null;
    const one = draw(home, { waiting: 1 });
    expect(labels(one).some((n) => /^The gate, 1 newcomer waits/.test(n))).toBe(true);
  });

  it('draws the builders’ corner only while the Paddock has a project being built, with the helper spot as a dashed outline while nobody helps', () => {
    const none = draw(home);
    expect(labels(none).some((n) => /^The helper spot/.test(n))).toBe(false);
    expect(labels(none).some((n) => /^The builders' table/.test(n))).toBe(false);
    none.unmount();
    page = null;
    const open = draw(withCommons(home), { withActions: true });
    expect(target(open, /^The helper spot/).getAttribute('class')).toMatch(/cv-slot/);
    expect(labels(open).some((n) => /^The builders' table/.test(n))).toBe(true);
    open.unmount();
    page = null;
    const helped = draw(withCommons(home, undefined, { place: 'paddock', creatureId: a.id }), {
      withActions: true,
    });
    expect(labels(helped).some((n) => /^The helper spot/.test(n))).toBe(false);
    expect(
      labels(helped).some((n) =>
        /helping build the Paddock at the builders' table\. Change/.test(n),
      ),
    ).toBe(true);
    // A helper is not in the meadow as well.
    expect(byClass(helped.root, 'fi-hammer')).toHaveLength(1);
    expect(labels(helped).filter((n) => /at home in the Paddock/.test(n))).toHaveLength(
      free.length - 1,
    );
  });

  it('keeps the corner while the project builds for its days, drops it at the top level', () => {
    const top = openPlace('paddock', 5, 900, 0.2, { cosmetic: 1 });
    const cases: [string, ReturnType<typeof sampleCommons>, boolean][] = [
      ['open', sampleCommons(), true],
      ['building', sampleCommons({ places: [buildingPlace('paddock', 2, 2, [])] }), true],
      ['top level', sampleCommons({ places: [{ ...top, level: top.max }] }), false],
    ];
    for (const [name, commons, corner] of cases) {
      const p = draw(withCommons(home, commons), { withActions: true });
      expect(
        labels(p).some((n) => /^The builders' table/.test(n)),
        name,
      ).toBe(corner);
      p.unmount();
      page = null;
    }
  });

  it('says so, quietly, when nobody is home', () => {
    const p = draw({
      ...home,
      creatures: home.creatures.map((c) => ({ ...c, state: 'scouting' as const })),
    });
    expect(labels(p).some((n) => /at home in the Paddock/.test(n))).toBe(false);
    expect(byRole(p.root, 'status')).toHaveLength(1);
  });
});

describe('the Paddock canvas: what a click opens', () => {
  it('a creature opens in the right drawer with where it is; Help build the Paddock posts it', () => {
    const calls: Calls = { posts: [] };
    const p = draw(withCommons(home), { withActions: true, calls });
    p.click(target(p, /at home in the Paddock/));
    expect(byClass(p.root, 'pc-page')).toHaveLength(1);
    expect(visibleText(p.root)).toMatch(/At home in the Paddock/);
    expect(byName(p.root, 'button', /^Open its page/)).toHaveLength(1);
    p.click(byName(p.root, 'button', /^Help build the Paddock/)[0] as FakeElement);
    const [[place, who] = []] = calls.posts;
    expect(place).toBe('paddock');
    expect(free.some((c) => c.id === who)).toBe(true);
  });

  it('with no project the creature is only shown: no help button', () => {
    const p = draw(home);
    p.click(target(p, /at home in the Paddock/));
    expect(byName(p.root, 'button', /^Help build the Paddock/)).toHaveLength(0);
    expect(byName(p.root, 'button', /^Open its page/)).toHaveLength(1);
  });

  it('"Open its page" is the creature’s own page, a step of the same panel with a Back to the creature', () => {
    const p = draw(home);
    p.click(target(p, /at home in the Paddock/));
    p.click(byName(p.root, 'button', /^Open its page/)[0] as FakeElement);
    expect(
      byClass(p.root, 'creature-page').length + byClass(p.root, 'cp-back').length,
    ).toBeGreaterThan(0);
    expect(byName(p.root, 'button', /^Open its page/)).toHaveLength(0);
    p.click(byClass(p.root, 'cp-back')[0] as FakeElement);
    expect(byName(p.root, 'button', /^Open its page/)).toHaveLength(1);
  });

  it('the gate opens the waiting catches, with one Confirm', () => {
    const p = draw(home, { waiting: 1 });
    p.click(target(p, /^The gate/));
    expect(visibleText(p.root)).toMatch(/Waiting catches/);
    expect(byName(p.root, 'button', /^Confirm/)).toHaveLength(1);
  });

  it('the Creatures button opens the Creatures page in the left drawer, and the gate’s catches are not repeated there', () => {
    const p = draw(home, { waiting: 1 });
    p.click(target(p, /^Creatures:|show all your creatures/));
    expect(byClass(p.root, 'creature-cards').length).toBeGreaterThan(0);
    expect(visibleText(p.root)).not.toMatch(/Waiting catches/);
  });

  it('the builders’ table opens the project board in the left drawer', () => {
    const p = draw(withCommons(home), { withActions: true });
    p.click(target(p, /^The builders' table/));
    expect(visibleText(p.root)).toMatch(/Project board/);
    expect(visibleText(p.root)).toMatch(/Give/);
  });

  it('the helper seat opens the picker (a list of creatures, a tap picks and posts)', () => {
    const p = draw(withCommons(home), { withActions: true });
    p.click(target(p, /^The helper spot/));
    expect(visibleText(p.root)).toMatch(/Who helps build the Paddock/);
    expect(byRole(p.root, 'option').length).toBeGreaterThan(0);
  });

  it('can start with a creature’s page open (the popover’s "View")', () => {
    const p = draw(home, { start: { creature: a.id, page: true } });
    expect(byName(p.root, 'button', /^Open its page/)).toHaveLength(0);
    expect(byClass(p.root, 'cp-back').length).toBeGreaterThan(0);
  });
});
