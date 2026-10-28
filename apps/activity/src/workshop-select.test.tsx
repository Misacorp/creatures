import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetSelectHintSession } from './ui/select-hint';
import { GEAR_STATE, SAMPLE_GEAR } from './creature-card-sample';
import type { GearActions } from './gear-actions';
import type { DismantlePreview, GearState, JobResult } from './gear-types';
import { gearName } from './gear-view';
import {
  byClass,
  byName,
  byRole,
  createPage,
  find,
  visibleText,
  type FakeElement,
  type Page,
} from './test-dom';
import { Workshop } from './Workshop';

/**
 * Selecting several items in the bag (2026-10-27, "Bulk selection replaces marking"): a press and hold on touch, the
 * corner checkbox, Ctrl and Shift clicks and a right click's menu with a mouse, arrows, Enter, Space and Escape on a
 * keyboard; a tap toggles once something is selected; the bulk bar counts, clears and dismantles. The sample bag
 * (in the grid's order): the epic Ember crown, Thundercap (rare, level 16), the Warden's bell (rare, 13), the bark
 * shawl (rare, 12), the Crossroads compass (rare, 10), the tidepool charm (common, 6), the kelp cap (common, 2)
 * and the trail cap (common, 1). Five of them are worn: the crown, the shawl and the charm by one creature, the bell
 * and the trail cap by another; Thundercap, the compass and the kelp cap are free.
 */

let page: Page | null = null;
beforeEach(() => {
  resetSelectHintSession();
});
afterEach(() => {
  page?.unmount();
  page = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

const item = (baseId: string) => {
  const found = SAMPLE_GEAR.items.find((i) => i.baseId === baseId);
  if (found === undefined) throw new Error(`no ${baseId} in the sample bag`);
  return found;
};
const compass = item('crossroads-compass');
const kelp = item('kelp-cap');
const crown = item('emberkeepers-crown'); // worn
const IN_ORDER = [
  'emberkeepers-crown',
  'thundercap',
  'wardens-bell',
  'bark-shawl',
  'crossroads-compass',
  'tidepool-charm',
  'kelp-cap',
  'trail-cap',
];

const result = {
  kind: 'dismantle',
  items: [],
  parts: {},
  essence: 0,
  learned: [],
  marked: [],
  xp: 6,
  skillXp: 6,
  skillLevel: 1,
  leveledUp: false,
} as JobResult;

const previewed: DismantlePreview = {
  kind: 'dismantle',
  creatureId: 'x',
  items: [],
  range: {
    scrap: { min: 1, max: 2 },
    shards: { min: 0, max: 0, element: null },
    glimmer: { min: 0, max: 0 },
    essence: { min: 0, max: 0 },
  },
  xp: 6,
  learnBp: null,
  teachers: 0,
  boosted: 0,
  tinkersLuckBp: 0,
};

function actionsOf(over: Partial<GearActions> = {}): GearActions {
  return {
    equip: () => Promise.resolve(undefined),
    equipBest: () => Promise.resolve(undefined),
    checkDismantle: vi.fn(() => Promise.resolve({ locked: [] })),
    dismantlePile: vi.fn(() => Promise.resolve(result)),
    dismissNotice: () => Promise.resolve(undefined),
    startJob: () => Promise.resolve(undefined),
    previewCraft: () => new Promise(() => undefined),
    previewDismantle: vi.fn(() => Promise.resolve(previewed)),
    claimJob: () => Promise.resolve(undefined),
    ...over,
  } as unknown as GearActions;
}

function draw(
  actions: GearActions = actionsOf(),
  gear: GearState = SAMPLE_GEAR,
  onClaimed: (r: JobResult) => void = () => undefined,
): Page {
  page = createPage();
  page.draw(
    <Workshop
      state={GEAR_STATE}
      gear={gear}
      failed={false}
      offset={0}
      busy={false}
      reveal={null}
      actions={actions}
      onRetry={() => undefined}
      onClaimed={onClaimed}
      onDismissReveal={() => undefined}
    />,
  );
  return page;
}

/** The tile of an item (the option button named after it, not its checkbox). */
function tile(p: Page, baseId: string): FakeElement {
  return first(
    find(
      p.root,
      (e) =>
        e.localName === 'button' &&
        e.getAttribute('role') === 'option' &&
        (e.getAttribute('aria-label') ?? '').startsWith(gearName(baseId)),
    ),
  );
}
const tiles = (p: Page): FakeElement[] =>
  find(p.root, (e) => e.localName === 'button' && e.getAttribute('role') === 'option');
const boxOf = (p: Page, baseId: string): FakeElement =>
  first(byClass(tile(p, baseId).parentNode as FakeElement, 'select-check'));
const chosen = (p: Page): string[] =>
  IN_ORDER.filter((id) => tile(p, id).getAttribute('aria-selected') === 'true');
const bar = (p: Page): FakeElement => first(byClass(p.root, 'bulk-bar'));
const barText = (p: Page): string => visibleText(bar(p));
const hasBar = (p: Page): boolean => byClass(p.root, 'bulk-bar').length > 0;
const dialogs = (p: Page): FakeElement[] => byRole(p.root, 'dialog');
const settle = async (p: Page): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  p.update(() => undefined);
};
const grid = (p: Page): FakeElement => first(byRole(p.root, 'listbox'));

/** A finger (or the mouse) held on a tile for `ms`, then lifted. */
function press(p: Page, el: FakeElement, ms: number, kind = 'touch'): void {
  p.pointer(el, 'pointerdown', { x: 10, y: 10, kind });
  p.update(() => {
    vi.advanceTimersByTime(ms);
  });
  p.pointer(el, 'pointerup', { x: 10, y: 10, kind });
}

describe('the bag without a selection', () => {
  it('has no mode button, no presets and no bar above or below the grid', () => {
    const p = draw();
    for (const name of ['Dismantle items', 'Done', 'All Common', 'Clear']) {
      expect(byName(p.root, 'button', name), name).toHaveLength(0);
    }
    expect(byName(p.root, 'button', /^Below level/)).toHaveLength(0);
    expect(hasBar(p)).toBe(false);
  });

  it('is a multi-select listbox of options, none selected, with one tab stop', () => {
    const p = draw();
    const list = grid(p);
    expect(list.getAttribute('aria-multiselectable')).toBe('true');
    expect(tiles(p)).toHaveLength(8);
    expect(chosen(p)).toEqual([]);
    expect(tiles(p).filter((t) => t.getAttribute('tabindex') === '0')).toHaveLength(1);
    expect(tiles(p)[0]?.getAttribute('tabindex')).toBe('0');
  });

  it('opens the item card on a plain tap, with no mark and no selection', () => {
    const p = draw();
    p.click(tile(p, 'kelp-cap'));
    const dialog = first(dialogs(p));
    expect(visibleText(dialog)).toContain('Kelp Cap');
    expect(hasBar(p)).toBe(false);
    expect(chosen(p)).toEqual([]);
  });

  it("says in each tile's label what it is and who wears it, and nothing about marks", () => {
    const p = draw();
    const label = tile(p, 'emberkeepers-crown').getAttribute('aria-label') ?? '';
    expect(label).toContain('worn by');
    expect(label).not.toContain('marked');
    expect(tile(p, 'kelp-cap').getAttribute('aria-label')).not.toContain('worn by');
  });
});

describe('a press and hold', () => {
  it('shows its cue while held, then selects the item, buzzes, and starts selecting', () => {
    vi.useFakeTimers();
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });
    const p = draw();
    const t = tile(p, 'kelp-cap');
    p.pointer(t, 'pointerdown', { x: 10, y: 10, kind: 'touch' });
    expect(tile(p, 'kelp-cap').getAttribute('class')).toContain('holding');
    p.update(() => {
      vi.advanceTimersByTime(449);
    });
    expect(chosen(p)).toEqual([]);
    p.update(() => {
      vi.advanceTimersByTime(1);
    });
    expect(chosen(p)).toEqual(['kelp-cap']);
    expect(tile(p, 'kelp-cap').getAttribute('class')).not.toContain('holding');
    expect(tile(p, 'kelp-cap').getAttribute('class')).toContain('chosen');
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(barText(p)).toContain('1 selected');
    expect(first(byRole(p.root, 'listbox')).getAttribute('class')).toContain('selecting');
  });

  it('swallows the click that follows the release: it neither opens the card nor toggles', () => {
    vi.useFakeTimers();
    const p = draw();
    const t = tile(p, 'kelp-cap');
    press(p, t, 450);
    p.click(t);
    expect(chosen(p)).toEqual(['kelp-cap']);
    expect(dialogs(p)).toHaveLength(0);
    // The next tap is a real one again: on the tile's body it opens the card (the selection stays).
    p.click(t);
    expect(dialogs(p)).toHaveLength(1);
    expect(chosen(p)).toEqual(['kelp-cap']);
  });

  it('works for a mouse too (the same pointer code)', () => {
    vi.useFakeTimers();
    const p = draw();
    press(p, tile(p, 'thundercap'), 450, 'mouse');
    expect(chosen(p)).toEqual(['thundercap']);
  });

  it('is cancelled by a move of more than 8 px, but not by a small drift', () => {
    vi.useFakeTimers();
    const p = draw();
    const t = tile(p, 'kelp-cap');
    p.pointer(t, 'pointerdown', { x: 10, y: 10 });
    p.pointer(t, 'pointermove', { x: 14, y: 14 });
    expect(tile(p, 'kelp-cap').getAttribute('class')).toContain('holding');
    p.pointer(t, 'pointermove', { x: 10, y: 19 });
    expect(tile(p, 'kelp-cap').getAttribute('class')).not.toContain('holding');
    p.update(() => {
      vi.advanceTimersByTime(600);
    });
    expect(chosen(p)).toEqual([]);
    // A small drift only: the hold still completes.
    p.pointer(t, 'pointerdown', { x: 10, y: 10 });
    p.pointer(t, 'pointermove', { x: 13, y: 12 });
    p.update(() => {
      vi.advanceTimersByTime(450);
    });
    expect(chosen(p)).toEqual(['kelp-cap']);
  });

  it('is cancelled by a release or a pointer cancel (a scroll starting) before the time is up', () => {
    vi.useFakeTimers();
    const p = draw();
    const t = tile(p, 'kelp-cap');
    press(p, t, 300);
    p.update(() => {
      vi.advanceTimersByTime(300);
    });
    expect(chosen(p)).toEqual([]);
    p.pointer(t, 'pointerdown', { x: 10, y: 10 });
    p.pointer(t, 'pointercancel', { x: 10, y: 10 });
    p.update(() => {
      vi.advanceTimersByTime(600);
    });
    expect(chosen(p)).toEqual([]);
    expect(tile(p, 'kelp-cap').getAttribute('class')).not.toContain('holding');
    // The click after a short press is a plain tap: it opens the card.
    p.click(t);
    expect(dialogs(p)).toHaveLength(1);
  });

  it('ignores a second finger and a right mouse button', () => {
    vi.useFakeTimers();
    const p = draw();
    const t = tile(p, 'kelp-cap');
    p.pointer(t, 'pointerdown', { x: 10, y: 10, primary: false });
    p.pointer(t, 'pointerdown', { x: 10, y: 10, kind: 'mouse', button: 2 });
    p.update(() => {
      vi.advanceTimersByTime(600);
    });
    expect(chosen(p)).toEqual([]);
  });

  it("keeps the context menu away from a finger but stops the browser's own", () => {
    const p = draw();
    const t = tile(p, 'kelp-cap');
    p.pointer(t, 'pointerdown', { x: 10, y: 10, kind: 'touch' });
    p.pointer(t, 'pointerup', { x: 10, y: 10, kind: 'touch' });
    const event = p.event(t, 'contextmenu', { x: 10, y: 10 });
    expect(event.defaultPrevented).toBe(true);
    expect(byRole(p.root, 'menu')).toHaveLength(0);
  });
});

describe('selecting with a mouse', () => {
  it('puts a square checkbox in every tile, and a click on it selects the item and starts selecting', () => {
    const p = draw();
    expect(
      find(p.root, (e) => (e.getAttribute('class') ?? '').includes('select-check')),
    ).toHaveLength(8);
    p.click(boxOf(p, 'kelp-cap'));
    expect(chosen(p)).toEqual(['kelp-cap']);
    expect(barText(p)).toContain('1 selected');
    // The click on the checkbox never opens the card.
    expect(dialogs(p)).toHaveLength(0);
    // A second checkbox adds, and a click on a chosen one's checkbox removes.
    p.click(boxOf(p, 'thundercap'));
    expect(chosen(p)).toEqual(['thundercap', 'kelp-cap']);
    p.click(boxOf(p, 'kelp-cap'));
    expect(chosen(p)).toEqual(['thundercap']);
  });

  it('shows the pixel check in a chosen box and an empty one on the rest, announced as selecting the item', () => {
    const p = draw();
    p.click(boxOf(p, 'kelp-cap'));
    expect(boxOf(p, 'kelp-cap').getAttribute('class')).toContain('on');
    expect(byClass(boxOf(p, 'kelp-cap'), 'sprite')).toHaveLength(1);
    expect(boxOf(p, 'thundercap').getAttribute('class')).not.toContain('on');
    expect(byClass(boxOf(p, 'thundercap'), 'sprite')).toHaveLength(0);
    // A checkbox of its own, named for the item and out of the tab order (Space on the tile selects).
    expect(boxOf(p, 'kelp-cap').getAttribute('role')).toBe('checkbox');
    expect(boxOf(p, 'kelp-cap').getAttribute('aria-checked')).toBe('true');
    expect(boxOf(p, 'thundercap').getAttribute('aria-checked')).toBe('false');
    expect(boxOf(p, 'kelp-cap').getAttribute('aria-label')).toContain('Select Kelp Cap');
    expect(boxOf(p, 'kelp-cap').getAttribute('tabindex')).toBe('-1');
  });

  it('has no "i" button on any tile', () => {
    const p = draw();
    expect(byName(p.root, 'button', /^Details of/)).toHaveLength(0);
    p.click(boxOf(p, 'thundercap'));
    expect(byName(p.root, 'button', /^Details of/)).toHaveLength(0);
    expect(byClass(p.root, 'item-tile-info')).toHaveLength(0);
  });

  it('puts the slot icon where the checkbox is not: the box is the first thing after the tile, the icon is in the tile', () => {
    const p = draw();
    expect(byClass(tile(p, 'kelp-cap'), 'item-slot')).toHaveLength(1);
    expect(byClass(boxOf(p, 'kelp-cap'), 'item-slot')).toHaveLength(0);
  });

  it('starts selecting with a Ctrl or Command click, and toggles with it afterwards', () => {
    const p = draw();
    p.click(tile(p, 'kelp-cap'), { ctrlKey: true });
    expect(chosen(p)).toEqual(['kelp-cap']);
    expect(dialogs(p)).toHaveLength(0);
    p.click(tile(p, 'thundercap'), { metaKey: true });
    expect(chosen(p)).toEqual(['thundercap', 'kelp-cap']);
    p.click(tile(p, 'kelp-cap'), { ctrlKey: true });
    expect(chosen(p)).toEqual(['thundercap']);
  });

  it("adds the range from the last toggled item with a Shift click, in the grid's order", () => {
    const p = draw();
    p.click(tile(p, 'thundercap'), { ctrlKey: true });
    p.click(tile(p, 'crossroads-compass'), { shiftKey: true });
    expect(chosen(p)).toEqual(['thundercap', 'wardens-bell', 'bark-shawl', 'crossroads-compass']);
    // The range goes the other way too, and keeps the anchor: from Thundercap up to the crown.
    p.click(tile(p, 'emberkeepers-crown'), { shiftKey: true });
    expect(chosen(p)).toEqual([
      'emberkeepers-crown',
      'thundercap',
      'wardens-bell',
      'bark-shawl',
      'crossroads-compass',
    ]);
  });

  it('starts from the clicked item on a Shift click when nothing was toggled before', () => {
    const p = draw();
    p.click(tile(p, 'bark-shawl'), { shiftKey: true });
    expect(chosen(p)).toEqual(['bark-shawl']);
  });

  it('opens a menu on a right click with Inspect and Select, at the pointer', () => {
    const p = draw();
    p.event(tile(p, 'kelp-cap'), 'contextmenu', { x: 120, y: 80 });
    const menu = first(byRole(p.root, 'menu'));
    expect(byRole(menu, 'menuitem').map((m) => visibleText(m))).toEqual(['Inspect', 'Select']);
    expect(menu.getAttribute('aria-label')).toContain('Kelp Cap');
    expect(menu.style.getPropertyValue('--menu-x')).toBe('120px');
    expect(menu.style.getPropertyValue('--menu-y')).toBe('80px');
  });

  it('Select in the menu starts selecting that item; the menu closes', () => {
    const p = draw();
    p.event(tile(p, 'kelp-cap'), 'contextmenu', { x: 120, y: 80 });
    p.click(first(byName(p.root, 'button', 'Select')));
    expect(chosen(p)).toEqual(['kelp-cap']);
    expect(byRole(p.root, 'menu')).toHaveLength(0);
    expect(barText(p)).toContain('1 selected');
    // On a chosen item the entry says Deselect, and takes it out again.
    p.event(tile(p, 'kelp-cap'), 'contextmenu', { x: 120, y: 80 });
    p.click(first(byName(p.root, 'button', 'Deselect')));
    expect(chosen(p)).toEqual([]);
  });

  it('Inspect in the menu opens the card without selecting anything', () => {
    const p = draw();
    p.event(tile(p, 'kelp-cap'), 'contextmenu', { x: 120, y: 80 });
    p.click(first(byName(p.root, 'button', 'Inspect')));
    expect(byRole(p.root, 'menu')).toHaveLength(0);
    expect(visibleText(first(dialogs(p)))).toContain('Kelp Cap');
    expect(hasBar(p)).toBe(false);
  });

  it('closes the menu on Escape (the focus goes back to the tile) and on a click outside, changing nothing', () => {
    const p = draw();
    p.event(tile(p, 'kelp-cap'), 'contextmenu', { x: 120, y: 80 });
    p.key(first(byRole(p.root, 'menu')), 'Escape');
    expect(byRole(p.root, 'menu')).toHaveLength(0);
    expect(tile(p, 'kelp-cap').focused).toBeGreaterThan(0);
    p.event(tile(p, 'kelp-cap'), 'contextmenu', { x: 120, y: 80 });
    p.pointer(first(byClass(p.root, 'select-menu-backdrop')), 'pointerdown', {
      x: 5,
      y: 5,
      kind: 'mouse',
    });
    expect(byRole(p.root, 'menu')).toHaveLength(0);
    expect(chosen(p)).toEqual([]);
    expect(dialogs(p)).toHaveLength(0);
  });

  it('moves between the two entries with the arrow keys', () => {
    const p = draw();
    p.event(tile(p, 'kelp-cap'), 'contextmenu', { x: 120, y: 80 });
    const menu = first(byRole(p.root, 'menu'));
    expect(byRole(menu, 'menuitem')[0]?.focused).toBeGreaterThan(0);
  });
});

describe('while selecting', () => {
  function selecting(): Page {
    const p = draw();
    p.click(boxOf(p, 'thundercap'));
    return p;
  }

  it('opens the card on a tap on the tile and toggles on the checkbox', () => {
    const p = selecting();
    p.click(boxOf(p, 'kelp-cap'));
    expect(chosen(p)).toEqual(['thundercap', 'kelp-cap']);
    expect(dialogs(p)).toHaveLength(0);
    expect(barText(p)).toContain('2 selected');
    p.click(boxOf(p, 'kelp-cap'));
    expect(chosen(p)).toEqual(['thundercap']);
    // A tap anywhere else on the tile opens the card on top of the selection, and changes nothing.
    p.click(tile(p, 'crossroads-compass'));
    expect(visibleText(first(dialogs(p)))).toContain('Crossroads Compass');
    expect(chosen(p)).toEqual(['thundercap']);
    expect(barText(p)).toContain('1 selected');
  });

  it('draws a ring on chosen tiles and an empty box on the others', () => {
    const p = selecting();
    expect(tile(p, 'thundercap').getAttribute('class')).toContain('chosen');
    expect(tile(p, 'kelp-cap').getAttribute('class')).not.toContain('chosen');
    expect(grid(p).getAttribute('class')).toContain('selecting');
    expect(boxOf(p, 'thundercap').getAttribute('class')).toContain('on');
    expect(boxOf(p, 'kelp-cap').getAttribute('class')).not.toContain('on');
  });

  it("lets worn items be selected, and they keep the wearer's portrait", () => {
    const p = selecting();
    const t = tile(p, 'emberkeepers-crown');
    expect(byClass(t, 'item-tile-wearer')).toHaveLength(1);
    expect(t.getAttribute('class')).not.toContain('blocked');
    p.click(boxOf(p, 'emberkeepers-crown'));
    expect(chosen(p)).toEqual(['emberkeepers-crown', 'thundercap']);
    expect(byClass(tile(p, 'emberkeepers-crown'), 'item-tile-wearer')).toHaveLength(1);
  });

  it('keeps worn tiles as options of the listbox with aria-selected, and says how many in a live region', () => {
    const p = selecting();
    p.click(boxOf(p, 'kelp-cap'));
    const live = find(
      p.root,
      (e) => e.getAttribute('role') === 'status' && e.hasAttribute('aria-live'),
    );
    expect(live.map((e) => visibleText(e))).toContain('2 selected');
  });
});

describe('ending the selection', () => {
  it('clears and leaves the mode on the X of the bar', () => {
    const p = draw();
    p.click(boxOf(p, 'thundercap'));
    p.click(boxOf(p, 'kelp-cap'));
    p.click(first(byName(bar(p), 'button', 'Clear the selection')));
    expect(hasBar(p)).toBe(false);
    expect(chosen(p)).toEqual([]);
    expect(grid(p).getAttribute('class')).not.toContain('selecting');
    // Back to the plain grid: a tap opens the card.
    p.click(tile(p, 'kelp-cap'));
    expect(dialogs(p)).toHaveLength(1);
  });

  it('clears and leaves the mode on Escape in the grid, and in the bar', () => {
    const p = draw();
    p.click(boxOf(p, 'thundercap'));
    const event = p.key(tile(p, 'thundercap'), 'Escape');
    expect(event.defaultPrevented).toBe(true);
    expect(hasBar(p)).toBe(false);
    p.click(boxOf(p, 'thundercap'));
    p.key(first(byName(bar(p), 'button', 'Dismantle')), 'Escape');
    expect(hasBar(p)).toBe(false);
  });

  it('leaves the mode when the last item is deselected', () => {
    const p = draw();
    p.click(boxOf(p, 'thundercap'));
    p.click(boxOf(p, 'thundercap'));
    expect(hasBar(p)).toBe(false);
    expect(chosen(p)).toEqual([]);
  });

  it('does not clear on Escape when nothing is selected', () => {
    const behind = vi.fn();
    page = createPage();
    page.draw(
      <div onKeyDown={behind}>
        <Workshop
          state={GEAR_STATE}
          gear={SAMPLE_GEAR}
          failed={false}
          offset={0}
          busy={false}
          reveal={null}
          actions={actionsOf()}
          onRetry={() => undefined}
          onClaimed={() => undefined}
          onDismissReveal={() => undefined}
        />
      </div>,
    );
    page.key(tile(page, 'kelp-cap'), 'Escape');
    expect(behind).toHaveBeenCalledTimes(1);
  });

  it('drops an item that is no longer in the bag from the selection', () => {
    const p = draw();
    p.click(boxOf(p, 'thundercap'));
    p.click(boxOf(p, 'kelp-cap'));
    expect(barText(p)).toContain('2 selected');
    // The server's bag now has no kelp cap (dismantled elsewhere).
    p.draw(
      <Workshop
        state={GEAR_STATE}
        gear={{ ...SAMPLE_GEAR, items: SAMPLE_GEAR.items.filter((i) => i.id !== kelp.id) }}
        failed={false}
        offset={0}
        busy={false}
        reveal={null}
        actions={actionsOf()}
        onRetry={() => undefined}
        onClaimed={() => undefined}
        onDismissReveal={() => undefined}
      />,
    );
    expect(barText(p)).toContain('1 selected');
  });
});

describe('dismantling the selection', () => {
  const dismantle = (p: Page): FakeElement => first(byName(bar(p), 'button', 'Dismantle'));
  const next = (p: Page): FakeElement => first(byClass(first(dialogs(p)), 'send-button'));

  it('has Dismantle as the only action of the bar, with the count and the X', () => {
    const p = draw();
    p.click(boxOf(p, 'thundercap'));
    expect(byName(bar(p), 'button', /./)).toHaveLength(2);
    expect(barText(p)).toContain('1 selected');
    expect(byName(bar(p), 'button', 'Clear the selection')).toHaveLength(1);
    expect(dismantle(p).getAttribute('class')).toContain('primary');
  });

  it('goes straight to Who for free items, then the confirmation naming the count', () => {
    const actions = actionsOf();
    const p = draw(actions);
    p.click(boxOf(p, 'kelp-cap'));
    p.click(boxOf(p, 'crossroads-compass'));
    p.click(dismantle(p));
    expect(visibleText(first(dialogs(p)))).toContain('Who dismantles');
    expect(actions.checkDismantle).not.toHaveBeenCalled();
    p.click(next(p));
    expect(visibleText(first(byClass(p.root, 'drill-head')))).toContain(
      'Dismantle 2 items (1 Common, 1 Rare)?',
    );
    const ids = vi.mocked(actions.previewDismantle).mock.calls[0]?.[1] as string[];
    expect([...ids].sort()).toEqual([kelp.id, compass.id].sort());
  });

  it('warns about worn items first: who wears each, then Dismantle anyway goes on', async () => {
    const actions = actionsOf();
    const p = draw(actions);
    p.click(boxOf(p, 'kelp-cap'));
    p.click(boxOf(p, 'emberkeepers-crown'));
    p.click(dismantle(p));
    await settle(p);
    const dialog = first(dialogs(p));
    expect(visibleText(first(byClass(dialog, 'drill-head')))).toContain('Worn items');
    const rows = byClass(dialog, 'roster-option');
    expect(rows).toHaveLength(1);
    expect(visibleText(rows[0] as FakeElement)).toContain('Ember');
    expect(actions.checkDismantle).toHaveBeenCalledWith([crown.id]);
    expect(visibleText(next(p))).toBe('Dismantle anyway');
    p.click(next(p));
    expect(visibleText(first(byClass(dialog, 'drill-head')))).toContain('Who dismantles');
    // Back to the warning, and out to the bag with the selection kept.
    p.click(first(byName(p.root, 'button', /^‹ Back/)));
    p.click(first(byName(p.root, 'button', /^‹ Back/)));
    expect(dialogs(p)).toHaveLength(0);
    expect(chosen(p)).toEqual(['emberkeepers-crown', 'kelp-cap']);
  });

  it('dismantles worn items too, shows the results and ends the selection', async () => {
    const claimed = vi.fn();
    const actions = actionsOf();
    const p = draw(actions, SAMPLE_GEAR, claimed);
    p.click(boxOf(p, 'kelp-cap'));
    p.click(boxOf(p, 'emberkeepers-crown'));
    p.click(dismantle(p));
    await settle(p);
    p.click(next(p));
    p.click(next(p));
    await settle(p);
    p.click(next(p));
    await settle(p);
    expect(actions.dismantlePile).toHaveBeenCalledTimes(1);
    const call = vi.mocked(actions.dismantlePile).mock.calls[0];
    expect([...(call?.[1] as string[])].sort()).toEqual([crown.id, kelp.id].sort());
    expect(claimed).toHaveBeenCalledWith(result);
    expect(dialogs(p)).toHaveLength(0);
    expect(hasBar(p)).toBe(false);
  });

  it('keeps the selection and the bar when the dismantle is refused', async () => {
    const actions = actionsOf({ dismantlePile: vi.fn(() => Promise.resolve(undefined)) });
    const p = draw(actions);
    p.click(boxOf(p, 'kelp-cap'));
    p.click(dismantle(p));
    p.click(next(p));
    await settle(p);
    p.click(next(p));
    await settle(p);
    expect(actions.dismantlePile).toHaveBeenCalledTimes(1);
    expect(dialogs(p)).toHaveLength(1);
    p.click(first(byName(p.root, 'button', /^‹ Back/)));
    p.click(first(byName(p.root, 'button', /^‹ Back/)));
    expect(chosen(p)).toEqual(['kelp-cap']);
  });
});

describe('dismantling one item from its card', () => {
  const cardButton = (p: Page): FakeElement =>
    first(
      find(
        first(dialogs(p)),
        (e) =>
          e.localName === 'button' &&
          (e.getAttribute('class') ?? '').includes('danger') &&
          visibleText(e) === 'Dismantle',
      ),
    );

  it('has the red Dismantle on the card outside the selection mode, and no Mark button', () => {
    const p = draw();
    p.click(tile(p, 'kelp-cap'));
    expect(cardButton(p)).toBeDefined();
    const text = visibleText(first(dialogs(p)));
    expect(text).not.toContain('Mark for dismantling');
    expect(text).not.toContain('Marked for dismantling');
  });

  it('runs the flow for that item inside the drawer, and closes it with the results', async () => {
    const claimed = vi.fn();
    const actions = actionsOf();
    const p = draw(actions, SAMPLE_GEAR, claimed);
    p.click(tile(p, 'kelp-cap'));
    p.click(cardButton(p));
    // Still one drawer at a time: the card's drawer is replaced by the flow's (the same frame as the bag's).
    expect(dialogs(p)).toHaveLength(1);
    const send = (): FakeElement => first(byClass(first(dialogs(p)), 'send-button'));
    p.click(send());
    await settle(p);
    p.click(send());
    await settle(p);
    expect(actions.dismantlePile).toHaveBeenCalledTimes(1);
    expect(vi.mocked(actions.dismantlePile).mock.calls[0]?.[1]).toEqual([kelp.id]);
    expect(claimed).toHaveBeenCalledWith(result);
    expect(dialogs(p)).toHaveLength(0);
  });

  it('warns first when the item is worn', async () => {
    const actions = actionsOf();
    const p = draw(actions);
    p.click(tile(p, 'emberkeepers-crown'));
    p.click(cardButton(p));
    await settle(p);
    expect(visibleText(first(byClass(p.root, 'drill-head')))).toContain('Worn items');
    expect(actions.checkDismantle).toHaveBeenCalledWith([crown.id]);
  });

  it('goes back to the card from the first step, and leaves everything on a tap outside', () => {
    const p = draw();
    p.click(tile(p, 'kelp-cap'));
    p.click(cardButton(p));
    expect(visibleText(first(byClass(p.root, 'drill-head')))).toContain('Who dismantles');
    p.click(first(byName(p.root, 'button', /^‹ Back/)));
    expect(dialogs(p)).toHaveLength(1);
    expect(byClass(first(dialogs(p)), 'idc')).toHaveLength(1);
    expect(visibleText(first(dialogs(p)))).toContain('Kelp Cap');
    p.click(cardButton(p));
    p.click(first(byClass(p.root, 'drawer-backdrop')));
    expect(dialogs(p)).toHaveLength(0);
  });

  it('works on top of a selection (the card opened from the tile) and ends the selection afterwards', async () => {
    const actions = actionsOf();
    const p = draw(actions);
    p.click(boxOf(p, 'thundercap'));
    p.click(boxOf(p, 'kelp-cap'));
    p.click(tile(p, 'kelp-cap'));
    p.click(cardButton(p));
    const send = (): FakeElement => first(byClass(first(dialogs(p)), 'send-button'));
    p.click(send());
    await settle(p);
    p.click(send());
    await settle(p);
    // The whole selection ended with the action.
    expect(hasBar(p)).toBe(false);
  });
});

describe('with the keyboard', () => {
  it('moves one tab stop around the grid with the arrow keys, Home and End', () => {
    const p = draw();
    const all = tiles(p);
    p.key(all[0] as FakeElement, 'ArrowRight');
    expect(all[1]?.focused).toBeGreaterThan(0);
    p.event(all[1] as FakeElement, 'focusin');
    p.key(all[1] as FakeElement, 'End');
    expect(all[7]?.focused).toBeGreaterThan(0);
    p.key(all[7] as FakeElement, 'Home');
    expect(all[0]?.focused).toBe(1);
    p.key(all[0] as FakeElement, 'ArrowLeft');
    // Nothing before the first one: the focus stays.
    expect(all[0]?.focused).toBe(1);
    expect(all[7]?.focused).toBe(1);
  });

  it('keeps one tab stop on the focused tile', () => {
    const p = draw();
    p.event(tile(p, 'bark-shawl'), 'focus');
    expect(tiles(p).filter((t) => t.getAttribute('tabindex') === '0')).toHaveLength(1);
    expect(tile(p, 'bark-shawl').getAttribute('tabindex')).toBe('0');
  });

  it('opens the card on Enter, even while selecting, and does not toggle', () => {
    const p = draw();
    const t = tile(p, 'kelp-cap');
    const event = p.key(t, 'Enter');
    expect(event.defaultPrevented).toBe(true);
    expect(visibleText(first(dialogs(p)))).toContain('Kelp Cap');
    expect(chosen(p)).toEqual([]);
  });

  it('toggles with Space, starting the selection, and says how many are selected', () => {
    const p = draw();
    p.key(tile(p, 'kelp-cap'), ' ');
    expect(chosen(p)).toEqual(['kelp-cap']);
    expect(dialogs(p)).toHaveLength(0);
    p.key(tile(p, 'thundercap'), ' ');
    expect(chosen(p)).toEqual(['thundercap', 'kelp-cap']);
    p.key(tile(p, 'kelp-cap'), ' ');
    expect(chosen(p)).toEqual(['thundercap']);
    // The key that released Space does not click the button too.
    expect(p.event(tile(p, 'kelp-cap'), 'keyup', { key: ' ' }).defaultPrevented).toBe(true);
  });

  it('opens the menu on the context menu key', () => {
    const p = draw();
    p.key(tile(p, 'kelp-cap'), 'ContextMenu');
    expect(byRole(p.root, 'menu')).toHaveLength(1);
  });
});

describe('the one-time hint', () => {
  const hint = (p: Page): FakeElement[] => byClass(p.root, 'bag-hint');
  const touchText = 'Press and hold an item to select several';
  const mouseText = 'Click the box on an item to select several';

  function storage(throws = false) {
    const saved = new Map<string, string>();
    const local = {
      getItem: (k: string) => {
        if (throws) throw new Error('blocked');
        return saved.get(k) ?? null;
      },
      setItem: (k: string, v: string) => {
        if (throws) throw new Error('blocked');
        saved.set(k, v);
      },
    };
    vi.stubGlobal('window', {
      localStorage: local,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    return saved;
  }

  it('shows the press and hold wording on a touch device the first time the bag opens', () => {
    const p = draw();
    expect(hint(p)).toHaveLength(1);
    expect(visibleText(hint(p)[0] as FakeElement)).toContain(touchText);
  });

  it('shows the box wording where there is a mouse', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(hover: hover) and (pointer: fine)',
    }));
    const p = draw();
    expect(visibleText(hint(p)[0] as FakeElement)).toContain(mouseText);
  });

  it('is not shown for an empty bag', () => {
    const p = draw(actionsOf(), { ...SAMPLE_GEAR, items: [] });
    expect(hint(p)).toHaveLength(0);
  });

  it('is gone for good once dismissed, on this device', () => {
    vi.useFakeTimers();
    const saved = storage();
    const p = draw();
    p.click(first(byName(hint(p)[0] as FakeElement, 'button', /Dismiss/)));
    p.update(() => {
      vi.advanceTimersByTime(400);
    });
    expect(hint(p)).toHaveLength(0);
    expect([...saved.values()]).toEqual(['1']);
    // A new visit to the bag (a fresh page, the same storage): no hint.
    p.unmount();
    page = null;
    const again = draw();
    expect(hint(again)).toHaveLength(0);
  });

  it('is gone once the player selects anything, without being dismissed', () => {
    const saved = storage();
    const p = draw();
    expect(hint(p)).toHaveLength(1);
    p.click(boxOf(p, 'kelp-cap'));
    expect(hint(p)).toHaveLength(0);
    expect([...saved.values()]).toEqual(['1']);
    p.click(first(byName(bar(p), 'button', 'Clear the selection')));
    expect(hint(p)).toHaveLength(0);
  });

  it('still shows, and hides for the session once dismissed, when storage throws', () => {
    vi.useFakeTimers();
    storage(true);
    const p = draw();
    expect(hint(p)).toHaveLength(1);
    p.click(first(byName(hint(p)[0] as FakeElement, 'button', /Dismiss/)));
    p.update(() => {
      vi.advanceTimersByTime(400);
    });
    expect(hint(p)).toHaveLength(0);
    p.unmount();
    page = null;
    expect(hint(draw())).toHaveLength(0);
  });
});
