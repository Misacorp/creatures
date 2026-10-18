import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  byClass,
  byName,
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
  stored.clear();
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
      ).toMatch(new RegExp(`^${MINUS}\\d+$`));
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
  it('is a real switch, on by default, labelled Compare', () => {
    const p = draw('level 15', 'hat', KELP);
    const toggle = sw(p);
    expect(toggle?.localName).toBe('button');
    expect(toggle?.getAttribute('aria-checked')).toBe('true');
    expect(visibleText(first(byClass(toggle as FakeElement, 'ip-switch-label')))).toBe('Compare');
  });

  it('switched off gives the plain card and no compare row, and remembers it', () => {
    const p = draw('level 15', 'hat', KELP);
    p.click(sw(p) as FakeElement);
    expect(sw(p)?.getAttribute('aria-checked')).toBe('false');
    expect(byClass(detail(p), 'cmp-delta')).toHaveLength(0);
    expect(byClass(detail(p), 'cmp-new')).toHaveLength(0);
    expect(byClass(detail(p), 'cmp-gone')).toHaveLength(0);
    expect(byClass(detail(p), 'ip-compare')).toHaveLength(0);
    // Equip stays.
    expect(byName(detail(p), 'button', 'Equip')).toHaveLength(1);
    expect(stored.get(COMPARE_KEY)).toBe('0');
    p.click(sw(p) as FakeElement);
    expect(sw(p)?.getAttribute('aria-checked')).toBe('true');
    expect(byClass(detail(p), 'cmp-delta').length).toBeGreaterThan(0);
    expect(stored.get(COMPARE_KEY)).toBe('1');
  });

  it('starts off when the viewer switched it off before', () => {
    stored.set(COMPARE_KEY, '0');
    const p = draw('level 15', 'hat', KELP);
    expect(sw(p)?.getAttribute('aria-checked')).toBe('false');
    expect(byClass(detail(p), 'cmp-delta')).toHaveLength(0);
  });

  it('is hidden for the worn item', () => {
    const p = draw('level 15', 'hat');
    expect(byName(detail(p), 'button', 'Take off')).toHaveLength(1);
    expect(sw(p)).toBeUndefined();
    expect(byClass(detail(p), 'cmp-delta')).toHaveLength(0);
  });

  it('is hidden when the slot is empty, where the stats gained still show beside Equip', () => {
    const p = draw('level 8', 'hat', 'bag-hat-11');
    expect(sw(p)).toBeUndefined();
    expect(byClass(detail(p), 'cmp-delta')).toHaveLength(0);
    expect(byClass(detail(p), 'ip-compare')).toHaveLength(1);
  });

  it('keeps the creature row beside Equip only while it is on', () => {
    const p = draw('level 15', 'hat', KELP);
    expect(byClass(detail(p), 'ip-compare')).toHaveLength(1);
    p.click(sw(p) as FakeElement);
    expect(byClass(detail(p), 'ip-compare')).toHaveLength(0);
  });

  it('still works when storage is blocked: on at first, and it toggles for the session', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('blocked');
      },
    });
    const p = draw('level 15', 'hat', KELP);
    expect(sw(p)?.getAttribute('aria-checked')).toBe('true');
    p.click(sw(p) as FakeElement);
    expect(sw(p)?.getAttribute('aria-checked')).toBe('false');
    expect(byClass(detail(p), 'cmp-delta')).toHaveLength(0);
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
    expect(sw(p)?.getAttribute('aria-checked')).toBe('true');
    p.click(sw(p) as FakeElement);
    expect(sw(p)?.getAttribute('aria-checked')).toBe('false');
  });
});
