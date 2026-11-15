/**
 * The Bonfire as a canvas (`BonfireCanvas`, the rule "A place is a canvas"): what is in the scene and what a click on each thing opens.
 * Drawn in the fake DOM; a phone has no `matchMedia` here, so a panel is its own page (the shell's other half is in `PlaceCanvas.test`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { BonfireCanvas } from './BonfireCanvas';
import type { CommonsActions } from './CommonsBoard';
import { buildingPlace, openPlace, sampleCommons, withCommons } from './commons-sample';
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

const free = homeInput('busy', true).creatures.map((c) => ({ ...c, busy: null, away: false }));
const [a] = free;
if (a === undefined) throw new Error('fixture');
const resting = sampleValley(free, []);

interface Calls {
  posts: [string, string | null][];
}

function draw(visit: typeof resting, withActions: boolean, calls: Calls = { posts: [] }): Page {
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
    <BonfireCanvas
      creatures={free}
      visit={visit}
      level={1}
      acorns={100}
      {...(withActions ? { commons } : {})}
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

describe('the Bonfire canvas: the scene', () => {
  it('opens on the scene with the fire and a button for each resting creature, all named, no page under it', () => {
    const p = draw(resting, false);
    const names = labels(p);
    expect(names.every((n) => n !== '')).toBe(true);
    expect(names.some((n) => /^The hearth/.test(n))).toBe(true);
    // As many as fit with their plates are drawn; the rest are "+N more" (the left drawer's list).
    const drawn = names.filter((n) => /resting by the fire/.test(n)).length;
    const more = names.find((n) => /show everyone resting/.test(n));
    expect(drawn).toBeGreaterThan(0);
    expect(more === undefined ? drawn : drawn + Number(/^\+(\d+) more/.exec(more)?.[1])).toBe(
      free.length,
    );
    expect(byClass(p.root, 'sp-seat')).toHaveLength(0);
    expect(byClass(p.root, 'pc-page')).toHaveLength(0);
  });

  it('every clickable thing has a plate and the decoration has none', () => {
    const p = draw(withCommons(resting), true);
    const plated = byClass(p.root, 'cv-plate').length;
    expect(plated).toBe(targets(p).length);
    // A creature's plate is its level, name and gain (one `Nameplate`), not a second label.
    expect(byClass(p.root, 'nameplate-level').length).toBeGreaterThan(0);
  });

  it('draws the builders’ corner only while the hearth has a project being built, with the helper spot as a dashed outline while nobody helps', () => {
    const none = draw(resting, false);
    expect(labels(none).some((n) => /^The helper spot/.test(n))).toBe(false);
    expect(labels(none).some((n) => /^The builders' table/.test(n))).toBe(false);
    none.unmount();
    page = null;
    const open = draw(withCommons(resting), true);
    const seat = target(open, /^The helper spot/);
    expect(seat.getAttribute('class')).toMatch(/cv-slot/);
    expect(labels(open).some((n) => /^The builders' table/.test(n))).toBe(true);
    // The fire is no way into the board while the table is.
    expect(labels(open).some((n) => /^The hearth/.test(n))).toBe(false);
    open.unmount();
    page = null;
    const helped = draw(
      withCommons(resting, undefined, { place: 'bonfire', creatureId: a.id }),
      true,
    );
    expect(labels(helped).some((n) => /^The helper spot/.test(n))).toBe(false);
    expect(
      labels(helped).some((n) => /helping build the hearth at the builders' table\. Change/.test(n)),
    ).toBe(true);
  });

  it('keeps the corner while the project builds for its days, drops it at the top level and while the guided start has not come', () => {
    const top = openPlace('bonfire', 5, 900, 0.2, { cosmetic: 1 });
    const cases: [string, ReturnType<typeof sampleCommons>, boolean][] = [
      ['open', sampleCommons(), true],
      ['building', sampleCommons({ places: [buildingPlace('bonfire', 2, 2, [])] }), true],
      ['top level', sampleCommons({ places: [{ ...top, level: top.max }] }), false],
      ['not reached', sampleCommons({ places: [{ ...top, state: 'waiting', level: 1 }] }), false],
    ];
    for (const [name, commons, corner] of cases) {
      const p = draw(withCommons(resting, commons), true);
      expect(
        labels(p).some((n) => /^The builders' table/.test(n)),
        name,
      ).toBe(corner);
      expect(
        labels(p).some((n) => /^The hearth/.test(n)),
        name,
      ).toBe(!corner);
      p.unmount();
      page = null;
    }
  });

  it('a helper still posted at the top level stays in sight with its table', () => {
    const top = openPlace('bonfire', 5, 900, 0.2, { cosmetic: 1 });
    const p = draw(
      withCommons(resting, sampleCommons({ places: [{ ...top, level: top.max }] }), {
        place: 'bonfire',
        creatureId: a.id,
      }),
      true,
    );
    expect(labels(p).some((n) => /helping build the hearth at the builders' table/.test(n))).toBe(
      true,
    );
  });
});

describe('the Bonfire canvas: who does what', () => {
  it('the creatures at the fire idle like the lounge’s, and the helper hammers at the table, not at the fire', () => {
    const p = draw(
      withCommons(resting, undefined, { place: 'bonfire', creatureId: a.id }),
      true,
    );
    const idle = byClass(p.root, 'vy-bob');
    const resters = labels(p).filter((n) => /resting by the fire/.test(n)).length;
    expect(idle.length).toBe(resters);
    expect(idle.length).toBeGreaterThan(0);
    expect(byClass(p.root, 'fi-hammer')).toHaveLength(1);
    expect(byClass(p.root, 'fi-hammer')[0]?.getAttribute('class')).not.toMatch(/vy-bob/);
  });
});

describe('the Bonfire canvas: what a click opens', () => {
  it('a resting creature opens in the right drawer with its gain; Help build the hearth posts it, and it goes back to resting when it helps', () => {
    const calls: Calls = { posts: [] };
    const visit = withCommons(resting);
    const gained = {
      ...visit,
      creatures: visit.creatures.map((c) => (c.state === 'resting' ? { ...c, gained: 25 } : c)),
    };
    const p = draw(gained, true, calls);
    p.click(target(p, /resting by the fire, gained 25/));
    expect(byClass(p.root, 'pc-page')).toHaveLength(1);
    expect(visibleText(p.root)).toMatch(/\+25 XP this visit/);
    p.click(byName(p.root, 'button', /^Help build the hearth/)[0] as FakeElement);
    const [[place, who] = []] = calls.posts;
    expect(place).toBe('bonfire');
    expect(visit.creatures.find((c) => c.id === who)?.state).toBe('resting');
  });

  it('with no project the creature is only shown: no hearth button', () => {
    const p = draw(resting, false);
    p.click(target(p, /resting by the fire/));
    expect(byName(p.root, 'button', /^Help build the hearth/)).toHaveLength(0);
    expect(visibleText(p.root)).toMatch(/XP this visit|Resting/);
  });

  it('the builders’ table opens the project board in the left drawer, with the hearth line', () => {
    const p = draw(withCommons(resting, sampleCommons({ hearthBp: 10_800 })), true);
    p.click(target(p, /^The builders' table/));
    expect(visibleText(p.root)).toMatch(/Project board/);
    expect(visibleText(p.root)).toMatch(/Give/);
    expect(visibleText(p.root)).toMatch(/The hearth adds 8%/);
  });

  it('with no corner the fire opens the board', () => {
    const p = draw(resting, true);
    p.click(target(p, /^The hearth/));
    expect(visibleText(p.root)).toMatch(/Project board/);
  });

  it('the helper seat opens the picker (a list of creatures, a tap picks and posts)', () => {
    const calls: Calls = { posts: [] };
    const p = draw(withCommons(resting), true, calls);
    p.click(target(p, /^The helper spot/));
    expect(visibleText(p.root)).toMatch(/Who helps build the hearth/);
    expect(byRole(p.root, 'option').length).toBeGreaterThan(0);
  });
});
