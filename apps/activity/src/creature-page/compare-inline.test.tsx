import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  byClass,
  byName,
  nameOf,
  createPage,
  find,
  visibleText,
  type FakeElement,
  type Page,
} from '../test-dom';
import { ItemPickerDrawer } from './ItemPicker';
import { COMPARE_KEY } from './compare-pref';
import { pageScene, type SceneKind } from './sample';

/**
 * The picker's inline compare: the selected item's card shows its difference to the worn item (stat rows,
 * lines), with a Compare switch that is remembered, hidden when there is nothing to compare, and harmless
 * when storage is blocked.
 */

const MINUS = '−';
const stored = new Map<string, string>();
let page: Page | null = null;

beforeEach(() => {
  // The viewer has switched the compare on, unless a test says otherwise.
  stored.clear();
  stored.set(COMPARE_KEY, '1');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => {
        stored.set(key, value);
      },
    },
  });
});

afterEach(() => {
  page?.unmount();
  page = null;
  Reflect.deleteProperty(globalThis, 'localStorage');
});

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

/** Draws the picker of a slot for a sample creature, with one item picked. */
function draw(kind: SceneKind, slot: 'hat' | 'scarf' | 'charm', picked?: string): Page {
  const { creature, state, gear } = pageScene(kind);
  page = createPage();
  page.draw(
    <ItemPickerDrawer
      open
      onClose={() => undefined}
      slot={slot}
      creature={creature}
      creatures={state.creatures}
      items={gear.items}
      onEquip={() => undefined}
      onTakeOff={() => undefined}
      {...(picked === undefined ? {} : { initialPicked: picked })}
    />,
  );
  return page;
}

const KELP = 'bag-hat-14';
const WORN_CROWN = 'bag-hat-01';

function detail(p: Page): FakeElement {
  return first(byClass(p.root, 'ip-detail'));
}

function sw(p: Page): FakeElement | undefined {
  return find(p.root, (e) => e.getAttribute('role') === 'switch')[0];
}

describe('the inline compare on the picker card', () => {
  it('shows each base stat difference after the value, and a stat the worn item has as a red row', () => {
    const p = draw('level 15', 'hat', KELP);
    const stats = first(byClass(detail(p), 'idc-stats'));
    const rows = find(stats, (e) => e.localName === 'li');
    const marks = byClass(stats, 'cmp-delta');
    expect(marks.length).toBe(2);
    for (const mark of marks) {
      expect(mark.getAttribute('class')).toBe('cmp-delta bad');
      // The sign is in the words that show (a real minus) and a spoken copy says it again in words.
      expect(
        visibleText(first(find(mark, (e) => e.getAttribute('aria-hidden') === 'true'))),
      ).toMatch(/^\(\u25BC\d+\)$/);
      expect(visibleText(first(byClass(mark, 'visually-hidden')))).toMatch(/minus \d+, worse/);
    }
    const gone = byClass(stats, 'cmp-gone');
    expect(gone).toHaveLength(1);
    expect(visibleText(gone[0] as FakeElement)).toContain(`Crit damage ${MINUS}20 pt`);
    expect(visibleText(gone[0] as FakeElement)).toContain('Lost: Crit damage minus 20 pt');
    expect(rows.at(-1)).toBe(gone[0]);
  });

  it('marks a new line with a plus and "New", and lists a lost line at the end, struck through', () => {
    const p = draw('level 15', 'hat', KELP);
    const lines = first(byClass(detail(p), 'line-list'));
    const fresh = byClass(lines, 'cmp-new');
    expect(fresh.length).toBeGreaterThan(0);
    expect(visibleText(first(byClass(fresh[0] as FakeElement, 'cmp-marker')))).toBe('+');
    expect(visibleText(first(byClass(fresh[0] as FakeElement, 'visually-hidden')))).toBe('New:');
    const items = find(lines, (e) => e.localName === 'li');
    const gone = byClass(lines, 'cmp-gone');
    expect(gone.length).toBeGreaterThan(0);
    // The lost lines come last.
    expect(items.slice(-gone.length)).toEqual(gone);
    expect(visibleText(first(byClass(gone[0] as FakeElement, 'cmp-marker')))).toBe(MINUS);
    expect(visibleText(first(byClass(gone[0] as FakeElement, 'visually-hidden')))).toBe('Lost:');
    // The tier pips of the lines the item keeps stay as they were.
    expect(byClass(lines, 'pips').length).toBeGreaterThan(0);
  });

  it('shows a green delta for a better item, in the line stat rows too', () => {
    const p = draw('compare: plain gear', 'hat', WORN_CROWN);
    const marks = byClass(first(byClass(detail(p), 'idc-stats')), 'cmp-delta');
    expect(marks.length).toBeGreaterThan(1);
    expect(marks.every((m) => m.getAttribute('class') === 'cmp-delta good')).toBe(true);
  });
});

describe('the Compare switch', () => {
  it('is a real switch labelled Compare, off by default', () => {
    stored.clear();
    const p = draw('level 15', 'hat', KELP);
    const toggle = sw(p);
    expect(toggle?.localName).toBe('button');
    expect(toggle?.getAttribute('aria-checked')).toBe('false');
    expect(visibleText(first(byClass(toggle as FakeElement, 'switch-label')))).toBe('Compare');
    // Off is the plain card.
    expect(byClass(detail(p), 'cmp-delta')).toHaveLength(0);
    expect(byClass(detail(p), 'cmp-new')).toHaveLength(0);
    expect(byClass(detail(p), 'cmp-gone')).toHaveLength(0);
  });

  it('switched on shows the inline changes and remembers it; switched off goes back and remembers that', () => {
    stored.clear();
    const p = draw('level 15', 'hat', KELP);
    p.click(sw(p) as FakeElement);
    expect(sw(p)?.getAttribute('aria-checked')).toBe('true');
    expect(byClass(detail(p), 'cmp-delta').length).toBeGreaterThan(0);
    expect(stored.get(COMPARE_KEY)).toBe('1');
    p.click(sw(p) as FakeElement);
    expect(sw(p)?.getAttribute('aria-checked')).toBe('false');
    expect(byClass(detail(p), 'cmp-delta')).toHaveLength(0);
    expect(stored.get(COMPARE_KEY)).toBe('0');
  });

  it('starts on for a viewer who switched it on before', () => {
    const p = draw('level 15', 'hat', KELP);
    expect(sw(p)?.getAttribute('aria-checked')).toBe('true');
    expect(byClass(detail(p), 'cmp-delta').length).toBeGreaterThan(0);
  });

  it('is hidden for the worn item, which has Take off at the bottom right', () => {
    const p = draw('level 15', 'hat', WORN_CROWN);
    expect(sw(p)).toBeUndefined();
    const row = first(byClass(detail(p), 'ip-actions'));
    expect(byName(row, 'button', 'Take off')).toHaveLength(1);
    expect(byClass(detail(p), 'cmp-delta')).toHaveLength(0);
  });

  it('is hidden when the slot is empty, and Equip stays at the bottom right', () => {
    const p = draw('level 8', 'hat', 'bag-hat-11');
    expect(sw(p)).toBeUndefined();
    expect(byClass(detail(p), 'cmp-delta')).toHaveLength(0);
    expect(byName(first(byClass(detail(p), 'ip-actions')), 'button', 'Equip')).toHaveLength(1);
  });

  it('still works when storage is blocked: off at first, and it toggles for the session', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('blocked');
      },
    });
    const p = draw('level 15', 'hat', KELP);
    expect(sw(p)?.getAttribute('aria-checked')).toBe('false');
    p.click(sw(p) as FakeElement);
    expect(sw(p)?.getAttribute('aria-checked')).toBe('true');
    expect(byClass(detail(p), 'cmp-delta').length).toBeGreaterThan(0);
  });

  it('still works when reading or writing the setting throws', () => {
    const blocked = vi.fn(() => {
      throw new Error('blocked');
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: blocked, setItem: blocked },
    });
    const p = draw('level 15', 'hat', KELP);
    expect(sw(p)?.getAttribute('aria-checked')).toBe('false');
    p.click(sw(p) as FakeElement);
    expect(sw(p)?.getAttribute('aria-checked')).toBe('true');
  });
});

describe('the bottom row of the detail panel', () => {
  it('has the switch at the left and Equip at the right, in that order, for a wearable item', () => {
    const p = draw('level 15', 'hat', KELP);
    const row = first(byClass(detail(p), 'ip-actions'));
    const kids = (row.childNodes as FakeElement[]).map(
      (k) => k.getAttribute('role') ?? k.getAttribute('class') ?? k.localName,
    );
    expect(kids).toEqual(['switch', 'ip-act primary']);
    // Nothing of the old box beside Equip, and no Equip in the corner of the card.
    expect(byClass(detail(p), 'ip-equip')).toHaveLength(0);
    expect(byClass(detail(p), 'ip-compare')).toHaveLength(0);
    // The card's top right holds only the close button of the details (never Equip).
    const aside = first(byClass(detail(p), 'idc-aside'));
    expect((aside.childNodes as FakeElement[]).map((k) => nameOf(k))).toEqual(['Close details']);
  });

  it('keeps Equip in the same place with the switch off', () => {
    stored.set(COMPARE_KEY, '0');
    const p = draw('level 15', 'hat', KELP);
    const row = first(byClass(detail(p), 'ip-actions'));
    expect(byName(row, 'button', 'Equip')).toHaveLength(1);
    expect(sw(p)?.getAttribute('aria-checked')).toBe('false');
  });

  it('shows the reason an item cannot be worn instead of Equip, with the switch still there', () => {
    const p = draw('level 15', 'hat', 'bag-hat-16');
    const row = first(byClass(detail(p), 'ip-actions'));
    expect(byName(row, 'button', 'Equip')).toHaveLength(0);
    expect(visibleText(first(byClass(row, 'ip-reason')))).toBe('Needs Lv 16');
    expect(sw(p)).toBeDefined();
  });
});

describe('the delta marks', () => {
  it('are written as an arrow in brackets, apart from the number and the card own bonus', () => {
    const better = draw('compare: plain gear', 'hat', WORN_CROWN);
    const stats = first(byClass(detail(better), 'idc-stats'));
    const texts = byClass(stats, 'cmp-delta').map((m) =>
      visibleText(first(find(m, (e) => e.getAttribute('aria-hidden') === 'true'))),
    );
    expect(texts.length).toBeGreaterThan(1);
    expect(texts.every((t) => /^\(▲\d+(\.\d+)?( pt)?\)$/.test(t))).toBe(true);
    // The card's own local bonus ("+16") is still its own element, with no brackets.
    expect(byClass(stats, 'idc-stat-bonus').every((b) => !visibleText(b).includes('('))).toBe(true);
  });

  it('say the sign in words for a screen reader', () => {
    const p = draw('compare: plain gear', 'hat', WORN_CROWN);
    const spoken = byClass(first(byClass(detail(p), 'idc-stats')), 'cmp-delta').map((m) =>
      visibleText(first(byClass(m, 'visually-hidden'))),
    );
    expect(spoken.every((t) => /^plus [\d.]+( pt)?, better$/.test(t))).toBe(true);
  });
});

describe('the detail panel scrolls inside itself', () => {
  it('has a scroll container for the card, with the action row outside it', () => {
    const p = draw('level 15', 'hat', KELP);
    const panel = detail(p);
    const scroll = first(byClass(panel, 'ip-detail-scroll'));
    // The card (with its lines and lost lines) is inside the scrolling box; the actions are not.
    expect(byClass(scroll, 'idc')).toHaveLength(1);
    expect(byClass(scroll, 'ip-actions')).toHaveLength(0);
    expect(byName(scroll, 'button', 'Equip')).toHaveLength(0);
    expect(find(scroll, (e) => e.getAttribute('role') === 'switch')).toHaveLength(0);
    const row = first(byClass(panel, 'ip-actions'));
    expect(row.parentNode).toBe(panel);
    // The scroll box sits in the hint's wrapper (which draws the fade), which sits in the panel.
    expect(scroll.getAttribute('class')).toContain('scroll-hint-body');
    expect(scroll.parentNode?.getAttribute('class')).toContain('scroll-hint');
    expect(scroll.parentNode?.parentNode).toBe(panel);
    // Keyboard users can reach it to scroll.
    expect(scroll.getAttribute('tabindex')).toBe('0');
  });

  it('keeps the actions outside the scroll for the worn item and an unwearable one too', () => {
    for (const picked of [WORN_CROWN, 'bag-hat-16']) {
      const p = draw('level 15', 'hat', picked);
      const scroll = first(byClass(detail(p), 'ip-detail-scroll'));
      expect(byClass(scroll, 'ip-reason')).toHaveLength(0);
      expect(byName(scroll, 'button', 'Take off')).toHaveLength(0);
      expect(byClass(detail(p), 'ip-actions')).toHaveLength(1);
    }
  });
});

describe('closing the details with a second tap', () => {
  it('closes the details when the item shown is tapped again, and opens them on the next tap', () => {
    const p = draw('compare: plain gear', 'hat', KELP);
    expect(byClass(p.root, 'ip-detail')).toHaveLength(1);
    const pressed = first(
      byClass(p.root, 'item-tile').filter((c) => c.getAttribute('aria-pressed') === 'true'),
    );
    p.click(pressed);
    expect(byClass(p.root, 'ip-detail')).toHaveLength(0);
    expect(
      byClass(p.root, 'item-tile').filter((c) => c.getAttribute('aria-pressed') === 'true'),
    ).toHaveLength(0);
    // No item shown: no arrows either.
    expect(byClass(p.root, 'flip-nav')).toHaveLength(0);
    p.click(pressed);
    expect(byClass(p.root, 'ip-detail')).toHaveLength(1);
  });

  it('keeps the item that was shown marked after its details close', () => {
    const p = draw('compare: plain gear', 'hat', KELP);
    const pressed = first(
      byClass(p.root, 'item-tile').filter((c) => c.getAttribute('aria-pressed') === 'true'),
    );
    p.click(pressed);
    const marked = byClass(p.root, 'item-tile').filter((c) =>
      byClass(p.root, 'selected').includes(c),
    );
    expect(marked).toEqual([pressed]);
  });
});
