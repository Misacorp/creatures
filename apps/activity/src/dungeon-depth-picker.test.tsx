import { dungeonRewardScalars, isLandmark } from '@creatures/game';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { teamSample } from './creature-page/team-sample';
import { withV2 } from './creature-page/v2-sample';
import {
  depthPickNote,
  depthScalarChips,
  depthScalarsText,
  depthSpoken,
  scalarText,
  xpScalarText,
} from './dungeon-depth';
import { parseDungeonPreview, parseDungeonToday } from './dungeon-parse';
import { ActionIds } from './actions';
import { resultSummary, runStatusLine } from './dungeon-text';
import type { DungeonPreview } from './dungeon-types';
import { DungeonSetup } from './DungeonSetup';
import todayFixture from './fixtures/dungeon-today-map.json';
import {
  byClass,
  byName,
  byRole,
  createPage,
  visibleText,
  type FakeElement,
  type Page,
} from './test-dom';

let page: Page | null = null;

beforeEach(() => {
  Reflect.set(globalThis, 'window', {
    innerHeight: 800,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    scrollTo: () => undefined,
  });
});

afterEach(() => {
  page?.unmount();
  page = null;
  Reflect.deleteProperty(globalThis, 'window');
});

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

function draw(options: {
  rules?: 2;
  depth: number;
  initialDepth?: number;
  preview?: (depth: number) => Promise<DungeonPreview>;
}) {
  page = createPage();
  const scene = teamSample();
  const todayAt = (depth: number) =>
    parseDungeonToday({
      ...todayFixture,
      ...(options.rules === 2 ? { rules: 2 } : {}),
      depth,
      lastTeam: scene.team.map((c) => c.id),
    });
  const today = todayAt(options.depth);
  const creatures =
    options.rules === 2
      ? scene.creatures.map((c) => withV2(c, { knack: 0, learned: [0, 1], golden: [1] }))
      : scene.creatures;
  const onEnter = vi.fn();
  const loadPreview = vi.fn(
    options.preview ??
      ((depth: number): Promise<DungeonPreview> =>
        Promise.resolve({
          depth,
          landmark: false,
          landmarkBoss: null,
          map: (today.map as NonNullable<typeof today.map>) ?? { floors: 0, nodes: [] },
        })),
  );
  const view = (now: typeof today) => (
    <DungeonSetup
      today={now}
      creatures={creatures}
      bait={40}
      busy={false}
      error={null}
      draft={null}
      onDraftChange={vi.fn()}
      onEnter={onEnter}
      loadPreview={loadPreview}
      {...(options.initialDepth === undefined ? {} : { initialDepth: options.initialDepth })}
      onSeeLast={vi.fn()}
    />
  );
  page.draw(view(today));
  /** The same card with the player's own depth moved on (the card was left open). */
  const moveOn = (depth: number): void => {
    (page as Page).draw(view(todayAt(depth)));
  };
  return { root: page.root, onEnter, loadPreview, moveOn };
}

const trigger = (root: FakeElement): FakeElement => first(byClass(root, 'depth-trigger'));
const options = (root: FakeElement): FakeElement[] => byRole(root, 'option');
const open = (root: FakeElement): void => {
  (page as Page).click(trigger(root));
};

describe('the depth picker on the pre-run card', () => {
  it('shows a dropdown trigger with the depth, its scalars as chips and the own mark, on combat v2', () => {
    const { root } = draw({ rules: 2, depth: 23 });
    const picker = first(byClass(root, 'depth-pick'));
    const text = visibleText(picker);
    expect(text).toContain('Depth to play');
    expect(text).toContain('Depth 23');
    expect(text).toContain('Your depth');
    expect(text).toContain(depthScalarChips(23).xp);
    expect(text).toContain(depthScalarChips(23).loot);
    expect(text).toContain('A clear unlocks depth 24.');
    expect(text).not.toContain('Your depth.');
    expect(trigger(root).getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger(root).getAttribute('aria-expanded')).toBe('false');
    expect(trigger(root).getAttribute('aria-label')).toBe(`Depth to play: ${depthSpoken(23, 23)}`);
    expect(byClass(picker, 'equip-chevron')).toHaveLength(1);
    expect(byRole(root, 'listbox')).toHaveLength(0);
  });

  it('shows another depth below the own one: its scalars, the line that it does not advance, a preview', () => {
    const { root, loadPreview } = draw({ rules: 2, depth: 23, initialDepth: 16 });
    const text = visibleText(first(byClass(root, 'depth-pick')));
    expect(text).toContain('Depth 16');
    expect(text).toContain(depthScalarChips(16).xp);
    expect(text).toContain(depthScalarChips(16).loot);
    expect(text).toContain('Only depth 23 goes deeper (2.1x loot).');
    expect(loadPreview).toHaveBeenCalledWith(16);
    expect(byClass(root, 'depth-pick-note')).toHaveLength(1);
  });

  it('opens a list of every depth from the own one down to 1, deepest first, with the scalars on every row', () => {
    const { root } = draw({ rules: 2, depth: 23, initialDepth: 16 });
    open(root);
    const rows = options(root);
    expect(rows).toHaveLength(23);
    expect(rows.map((r) => first(byClass(r, 'depth-name')).textContent)).toEqual(
      Array.from({ length: 23 }, (_, i) => `Depth ${String(23 - i)}`),
    );
    rows.forEach((row, i) => {
      const depth = 23 - i;
      expect(visibleText(row)).toContain(depthScalarChips(depth).xp);
      expect(visibleText(row)).toContain(depthScalarChips(depth).loot);
      expect(row.getAttribute('aria-label')).toBe(depthSpoken(depth, 23));
      expect(visibleText(row).includes('Your depth')).toBe(depth === 23);
      // A landmark is marked at the own depth only: the one place its extras pay.
      expect(visibleText(row).includes('Landmark')).toBe(depth === 23 && isLandmark(depth));
    });
    // The picked depth is the selected row and the one Tab stop.
    const selected = rows.filter((r) => r.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(first(byClass(first(selected), 'depth-name')).textContent).toBe('Depth 16');
    expect(first(selected).getAttribute('tabindex')).toBe('0');
    // A dropdown panel, not a sheet: no dialog, no title, no Close.
    expect(byRole(root, 'dialog')).toHaveLength(0);
    expect(byClass(root, 'drop-panel')).toHaveLength(1);
    expect(byClass(root, 'sheet')).toHaveLength(0);
    expect(byName(root, 'button', 'Close')).toHaveLength(0);
    expect(visibleText(first(byClass(root, 'drop-panel')))).not.toContain('Depth to play');
  });

  it('picks a row: it closes the list, sets the depth and says it does not take you deeper', () => {
    const { root, loadPreview } = draw({ rules: 2, depth: 23 });
    open(root);
    const row = first(
      options(root).filter((r) => r.getAttribute('aria-label')?.startsWith('Depth 9,') === true),
    );
    (page as Page).click(row);
    expect(byRole(root, 'listbox')).toHaveLength(0);
    const text = visibleText(first(byClass(root, 'depth-pick')));
    expect(text).toContain('Depth 9');
    expect(text).toContain('Only depth 23 goes deeper');
    expect(loadPreview).toHaveBeenCalledWith(9);
  });

  it('moves with the keys, picks with Enter and closes with Escape without a change', () => {
    const { root } = draw({ rules: 2, depth: 5 });
    const p = page as Page;
    open(root);
    const list = (): FakeElement => first(byRole(root, 'listbox'));
    const stop = (): string =>
      first(
        byClass(
          first(options(root).filter((r) => r.getAttribute('tabindex') === '0')),
          'depth-name',
        ),
      ).textContent;
    expect(stop()).toBe('Depth 5');
    p.key(list(), 'ArrowDown');
    p.key(list(), 'ArrowDown');
    expect(stop()).toBe('Depth 3');
    p.key(list(), 'End');
    expect(stop()).toBe('Depth 1');
    p.key(list(), 'ArrowDown');
    expect(stop()).toBe('Depth 1');
    p.key(list(), 'Home');
    expect(stop()).toBe('Depth 5');
    p.key(list(), 'ArrowUp');
    expect(stop()).toBe('Depth 5');
    p.key(list(), 'ArrowDown');
    p.key(list(), 'Enter');
    expect(byRole(root, 'listbox')).toHaveLength(0);
    expect(visibleText(first(byClass(root, 'depth-pick')))).toContain('Depth 4');
    // Escape leaves the pick as it was.
    open(root);
    p.key(list(), 'Escape');
    expect(byRole(root, 'listbox')).toHaveLength(0);
    expect(visibleText(first(byClass(root, 'depth-pick')))).toContain('Depth 4');
  });

  it('enters at the picked depth', () => {
    const { root, onEnter } = draw({ rules: 2, depth: 3 });
    const p = page as Page;
    open(root);
    const row = first(
      options(root).filter((r) => r.getAttribute('aria-label')?.startsWith('Depth 1,') === true),
    );
    p.click(row);
    p.click(first(byName(root, 'button', 'Enter the dungeon')));
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onEnter.mock.calls[0]?.[2]).toBe(1);
  });

  it('shows no picker on combat v1, and Enter sends no depth', () => {
    const { root, onEnter, loadPreview } = draw({ depth: 23 });
    expect(byClass(root, 'depth-pick')).toHaveLength(0);
    expect(loadPreview).not.toHaveBeenCalled();
    (page as Page).click(first(byName(root, 'button', 'Enter the dungeon')));
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onEnter.mock.calls[0]).toHaveLength(2);
  });

  it('shows no picker at depth 1 (nothing to pick)', () => {
    const { root } = draw({ rules: 2, depth: 1 });
    expect(byClass(root, 'depth-pick')).toHaveLength(0);
  });
});

describe('the dropdown panel of the depth picker', () => {
  /** Records the document's listeners (the fake document never calls them) so a test can send a tap outside. */
  function spyDocument(p: Page): Map<string, ((event: unknown) => void)[]> {
    const handlers = new Map<string, ((event: unknown) => void)[]>();
    Reflect.set(p.document, 'addEventListener', (type: string, fn: (event: unknown) => void) => {
      handlers.set(type, [...(handlers.get(type) ?? []), fn]);
    });
    Reflect.set(p.document, 'removeEventListener', (type: string, fn: unknown) => {
      handlers.set(
        type,
        (handlers.get(type) ?? []).filter((h) => h !== fn),
      );
    });
    return handlers;
  }
  const panel = (root: FakeElement): FakeElement => first(byClass(root, 'drop-panel'));

  it('toggles aria-expanded, and the trigger closes it again', () => {
    const { root } = draw({ rules: 2, depth: 9 });
    open(root);
    expect(trigger(root).getAttribute('aria-expanded')).toBe('true');
    expect(byClass(root, 'drop-panel')).toHaveLength(1);
    open(root);
    expect(trigger(root).getAttribute('aria-expanded')).toBe('false');
    expect(byClass(root, 'drop-panel')).toHaveLength(0);
  });

  it('sits under the trigger at its width, inset from the window edge', () => {
    const { root } = draw({ rules: 2, depth: 9 });
    const rect = { left: 12, top: 300, width: 366, height: 44 };
    trigger(root).getBoundingClientRect = () => rect;
    Reflect.set(globalThis.window, 'innerWidth', 390);
    open(root);
    const el = panel(root);
    expect(el.dataset['placement']).toBe('below');
    expect(el.style.getPropertyValue('--drop-x')).toBe('12px');
    expect(el.style.getPropertyValue('--drop-y')).toBe('348px');
    expect(el.style.getPropertyValue('--drop-w')).toBe('366px');
    expect(el.style.getPropertyValue('--drop-max')).toBe('400px');
  });

  it('opens above the trigger when there is no room below', () => {
    const { root } = draw({ rules: 2, depth: 20 });
    trigger(root).getBoundingClientRect = () => ({ left: 12, top: 770, width: 366, height: 36 });
    Reflect.set(globalThis.window, 'innerWidth', 390);
    open(root);
    expect(panel(root).dataset['placement']).toBe('above');
  });

  it('closes on a tap outside, not on a tap inside it or on the trigger', () => {
    const { root } = draw({ rules: 2, depth: 9 });
    const p = page as Page;
    const handlers = spyDocument(p);
    open(root);
    const down = (target: FakeElement): void => {
      for (const fn of handlers.get('pointerdown') ?? []) fn({ target });
    };
    down(panel(root));
    down(trigger(root));
    expect(byClass(root, 'drop-panel')).toHaveLength(1);
    p.update(() => {
      down(root);
    });
    expect(byClass(root, 'drop-panel')).toHaveLength(0);
  });

  it('closes on Escape from anywhere, and focus returns to the trigger', () => {
    const { root } = draw({ rules: 2, depth: 9 });
    const p = page as Page;
    const handlers = spyDocument(p);
    open(root);
    p.update(() => {
      for (const fn of handlers.get('keydown') ?? []) fn({ key: 'Escape' });
    });
    expect(byClass(root, 'drop-panel')).toHaveLength(0);
    expect(p.document.activeElement).toBe(trigger(root));
  });

  it('closes on a pick and gives the focus back to the trigger', () => {
    const { root } = draw({ rules: 2, depth: 9 });
    const p = page as Page;
    open(root);
    p.click(first(options(root)));
    expect(byClass(root, 'drop-panel')).toHaveLength(0);
    expect(p.document.activeElement).toBe(trigger(root));
  });

  it('scrolls the picked row into view when it opens', () => {
    const { root } = draw({ rules: 2, depth: 23, initialDepth: 16 });
    open(root);
    const row = first(options(root).filter((r) => r.getAttribute('aria-selected') === 'true'));
    expect(row.scrolled).toBeGreaterThan(0);
  });
});

describe('the words of the depth picker', () => {
  it('words a multiple to one decimal as the game words every multiplier', () => {
    expect(scalarText(1)).toBe('1x');
    expect(scalarText(1.44)).toBe('1.4x');
    expect(scalarText(2.46)).toBe('2.5x');
    expect(scalarText(3)).toBe('3x');
  });

  it('is the scalars of the game package: depth 1 is 1x and 1x', () => {
    expect(dungeonRewardScalars(1)).toEqual({ xp: 1, loot: 1 });
    expect(depthScalarsText(1)).toBe('1x XP · 1x loot');
    expect(depthScalarsText(30)).toMatch(/^\d+(\.\d+)?x XP · \d+(\.\d)?x loot$/);
  });

  it('words XP with two decimals under 2x so the landmark steps show, loot with one', () => {
    expect(xpScalarText(1)).toBe('1x');
    expect(xpScalarText(1.05)).toBe('1.05x');
    expect(xpScalarText(1.14)).toBe('1.14x');
    expect(xpScalarText(1.1)).toBe('1.1x');
    expect(xpScalarText(2.46)).toBe('2.5x');
    const xps = [1, 7, 14, 21, 28].map((d) => depthScalarChips(d).xp);
    expect(new Set(xps).size).toBeGreaterThan(2);
    expect(depthSpoken(23, 23)).toContain(depthScalarChips(23).xp);
  });

  it('says which depth is the own one and that a lower pick does not advance', () => {
    expect(depthPickNote(23, 23)).toBe('A clear unlocks depth 24.');
    expect(depthPickNote(23, 16)).toBe(
      `Only depth 23 goes deeper (${scalarText(dungeonRewardScalars(23).loot)} loot).`,
    );
  });

  it('words a clear below the own depth without a new depth', () => {
    const run = {
      outcome: 'cleared' as const,
      cleared: true,
      roomsCleared: 5,
      rooms: [],
      depth: 16,
      newDepth: 23,
      lower: true as const,
    };
    const own = {
      outcome: run.outcome,
      cleared: true,
      roomsCleared: 5,
      rooms: [],
      depth: 16,
      newDepth: 23,
    };
    expect(resultSummary(run)).toContain(
      'You defeated the floor boss at depth 16. You stay at depth 23.',
    );
    expect(resultSummary(run)).not.toContain('advanced');
    expect(resultSummary({ ...own })).toContain('advanced to depth 23');
  });

  it('shows the run’s own depth on the strip at a lower descent', () => {
    const base = {
      at: null,
      map: { floors: 1, nodes: [] },
      depth: 16,
    };
    const descend = {
      kind: 'descend' as const,
      level: 1,
      floors: 3,
      depthBonus: 5,
      catchBreathBp: 2000,
      reviveBp: 1000,
      newDepth: 17,
      banked: { gear: [], supplies: [], parts: {} },
    };
    expect(runStatusLine({ ...base, pending: { ...descend, lower: true } })).toContain('Depth 16');
    expect(runStatusLine({ ...base, pending: descend })).toContain('Depth 17');
  });
});

describe('the preview answer and the start key', () => {
  const today = parseDungeonToday(todayFixture);
  it('reads a preview and refuses a malformed one', () => {
    const ok = parseDungeonPreview({
      depth: 14,
      landmark: true,
      landmarkBoss: { depth: 14, foeId: 'drowned-warden' },
      map: today.map,
    });
    expect(ok.depth).toBe(14);
    expect(ok.landmarkBoss?.foeId).toBe('drowned-warden');
    expect(() => parseDungeonPreview({ depth: 'x', landmark: true, map: today.map })).toThrow();
    expect(() => parseDungeonPreview(null)).toThrow();
    expect(() =>
      parseDungeonPreview({ depth: 3, landmark: false, landmarkBoss: null, map: null }),
    ).toThrow();
  });

  it('gives a start at another depth its own key, and leaves the old key as it was', () => {
    const team: [string, string, string] = ['a', 'b', 'c'];
    expect(ActionIds.dungeonStart(team)).toBe(ActionIds.dungeonStart(team, []));
    expect(ActionIds.dungeonStart(team, [], 5)).not.toBe(ActionIds.dungeonStart(team, [], 6));
    expect(ActionIds.dungeonStart(team, [], 5)).not.toBe(ActionIds.dungeonStart(team));
  });
});

describe('the picker on a card that moves on, and its preview', () => {
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
  const landmarkOwn = (() => {
    for (let d = 2; d < 200; d += 1) if (isLandmark(d)) return d;
    return 21;
  })();

  it('marks a landmark at the own depth only', () => {
    const own = landmarkOwn * 2;
    const { root } = draw({ rules: 2, depth: own });
    expect(visibleText(first(byClass(root, 'depth-pick')))).toContain('Landmark');
    open(root);
    const marked = options(root).filter((r) => visibleText(r).includes('Landmark'));
    expect(marked).toHaveLength(1);
    expect(first(marked).getAttribute('aria-label')).toContain('landmark');
    // The landmark further down has no mark.
    const lower = options(root).filter(
      (r) => r.getAttribute('aria-label')?.startsWith(`Depth ${String(landmarkOwn)},`) === true,
    );
    expect(lower).toHaveLength(1);
    expect(visibleText(first(lower))).not.toContain('Landmark');
  });

  it('holds the pick as "my own depth": a card left open asks for no depth once the depth moves on', () => {
    const { root, onEnter, moveOn } = draw({ rules: 2, depth: 3 });
    moveOn(4);
    expect(visibleText(first(byClass(root, 'depth-pick')))).toContain('Depth 4');
    (page as Page).click(first(byName(root, 'button', 'Enter the dungeon')));
    expect(onEnter).toHaveBeenCalledTimes(1);
    // The own depth is the server's say: no depth in the request.
    expect(onEnter.mock.calls[0]).toHaveLength(2);
  });

  it('keeps a lower pick when the own depth moves on, and asks for it', () => {
    const { root, onEnter, moveOn } = draw({ rules: 2, depth: 5, initialDepth: 2 });
    moveOn(6);
    expect(visibleText(first(byClass(root, 'depth-pick')))).toContain('Depth 2');
    (page as Page).click(first(byName(root, 'button', 'Enter the dungeon')));
    expect(onEnter.mock.calls[0]?.[2]).toBe(2);
  });

  it('picking the own depth again sends no depth', () => {
    const { root, onEnter } = draw({ rules: 2, depth: 3, initialDepth: 1 });
    open(root);
    const row = first(
      options(root).filter((r) => r.getAttribute('aria-label')?.startsWith('Depth 3,') === true),
    );
    (page as Page).click(row);
    (page as Page).click(first(byName(root, 'button', 'Enter the dungeon')));
    expect(onEnter.mock.calls[0]).toHaveLength(2);
  });

  it('says it is loading while a lower depth’s map is on its way, and draws no map meanwhile', () => {
    const { root } = draw({
      rules: 2,
      depth: 23,
      initialDepth: 16,
      preview: () => new Promise<DungeonPreview>(() => undefined),
    });
    expect(visibleText(root)).toContain('Loading that depth');
    expect(byClass(root, 'dungeon-preview')).toHaveLength(0);
  });

  it('says it failed, with how to retry, when the lower depth’s map does not come', async () => {
    const { root } = draw({
      rules: 2,
      depth: 23,
      initialDepth: 16,
      preview: () => Promise.reject(new Error('down')),
    });
    await settle();
    (page as Page).update(() => undefined);
    expect(visibleText(root)).toContain('Could not load that depth');
    expect(visibleText(root)).toContain('Pick again to retry');
    expect(byClass(root, 'dungeon-preview')).toHaveLength(0);
  });

  it('shows the map once the lower depth’s preview is in', async () => {
    const { root } = draw({ rules: 2, depth: 23, initialDepth: 16 });
    await settle();
    (page as Page).update(() => undefined);
    expect(byClass(root, 'dungeon-preview')).toHaveLength(1);
    expect(visibleText(root)).not.toContain('Loading that depth');
  });
});
