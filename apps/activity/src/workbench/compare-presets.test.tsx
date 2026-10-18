import { afterEach, describe, expect, it } from 'vitest';
import { byClass, byName, createPage, visibleText, type FakeElement, type Page } from '../test-dom';
import { creaturePageEntries } from './entries/creature-page';

/**
 * The compare presets of the workbench (K1 to K7) each show the case they are named after: K1 to K4 with the
 * Compare switch on, K5 an empty slot (no switch), K6 the default, switched off.
 */

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

/** Draws a preset on top of whatever the page showed before (the workbench switches presets like this). */
function drawOver(id: string): Page {
  const entry = creaturePageEntries[0];
  if (entry === undefined) throw new Error('no entry');
  page ??= createPage();
  page.draw(entry.render({ ...entry.defaults, scene: id }));
  return page;
}

/** Draws a preset on a fresh page. */
function drawn(id: string): Page {
  page?.unmount();
  page = null;
  return drawOver(id);
}

const marks = (p: Page): number =>
  byClass(p.root, 'cmp-delta').length +
  byClass(p.root, 'cmp-new').length +
  byClass(p.root, 'cmp-gone').length;

const switchOf = (p: Page): FakeElement | undefined => byClass(p.root, 'switch')[0];

/** What the picker has selected. */
function selected(p: Page): { name: string; worn: boolean; equip: boolean } {
  const cell = byClass(p.root, 'item-tile').find((c) => c.getAttribute('aria-pressed') === 'true');
  if (cell === undefined) throw new Error('nothing selected');
  return {
    name: visibleText(first(byClass(p.root, 'idc-name'))),
    worn: (cell.getAttribute('class') ?? '').split(' ').includes('worn'),
    equip: byName(p.root, 'button', 'Equip').length === 1,
  };
}

describe('the compare presets', () => {
  it('select the item they name, which is never the worn one, also when drawn one after another', () => {
    const names = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6'].map((id) => {
      const picked = selected(drawOver(id));
      expect(picked.worn, id).toBe(false);
      expect(picked.equip, id).toBe(true);
      return picked.name;
    });
    expect(names).toEqual([
      "Emberkeeper's Crown, item level 15",
      'Kelp Cap, item level 2',
      'Forge-Warm Token, item level 12',
      'Felt Hat, item level 6',
      'Cinder Charm, item level 14',
      'Kelp Cap, item level 2',
    ]);
  });

  it('K1 to K4 show the inline changes with the switch on, Equip at the bottom right', () => {
    for (const id of ['K1', 'K2', 'K3', 'K4']) {
      const p = drawn(id);
      expect(marks(p), id).toBeGreaterThan(0);
      expect(switchOf(p)?.getAttribute('aria-checked'), id).toBe('true');
      const row = first(byClass(p.root, 'ip-actions'));
      expect(byName(row, 'button', 'Equip'), id).toHaveLength(1);
    }
  });

  it('K1 shows gains and K2 losses on the stat rows', () => {
    const better = byClass(drawn('K1').root, 'idc-stats')[0] as FakeElement;
    expect(
      byClass(better, 'cmp-delta').some((m) => m.getAttribute('class') === 'cmp-delta good'),
    ).toBe(true);
    const worse = byClass(drawn('K2').root, 'idc-stats')[0] as FakeElement;
    expect(
      byClass(worse, 'cmp-delta').some((m) => m.getAttribute('class') === 'cmp-delta bad'),
    ).toBe(true);
  });

  it('K3 and K4 show the lines the swap brings and takes away', () => {
    expect(byClass(drawn('K3').root, 'cmp-new').length).toBeGreaterThan(0);
    expect(byClass(drawn('K4').root, 'cmp-gone').length).toBeGreaterThan(0);
  });

  it('K5, an empty slot, has no switch and no inline changes, and Equip at the bottom right', () => {
    const p = drawn('K5');
    expect(switchOf(p)).toBeUndefined();
    expect(marks(p)).toBe(0);
    expect(byName(first(byClass(p.root, 'ip-actions')), 'button', 'Equip')).toHaveLength(1);
  });

  it('K6 has the switch off and the plain card', () => {
    const p = drawn('K6');
    expect(switchOf(p)?.getAttribute('aria-checked')).toBe('false');
    expect(marks(p)).toBe(0);
    expect(byName(first(byClass(p.root, 'ip-actions')), 'button', 'Equip')).toHaveLength(1);
  });

  it('have nothing of the old box beside Equip', () => {
    for (const id of ['K1', 'K2', 'K3', 'K4', 'K5', 'K6']) {
      const p = drawn(id);
      expect(byClass(p.root, 'ip-equip'), id).toHaveLength(0);
      expect(byClass(p.root, 'ip-compare'), id).toHaveLength(0);
    }
  });

  it('K7, a long Epic, has changed, new and lost lines inside the scrolling card and the actions outside', () => {
    const p = drawn('K7');
    const scroll = first(byClass(p.root, 'ip-detail-scroll'));
    expect(byClass(scroll, 'cmp-new').length).toBeGreaterThan(1);
    expect(byClass(scroll, 'cmp-gone').length).toBeGreaterThan(1);
    expect(byClass(scroll, 'cmp-delta').length).toBeGreaterThan(2);
    const rows = byClass(scroll, 'line');
    expect(rows.length).toBeGreaterThanOrEqual(10);
    expect(byClass(scroll, 'ip-actions')).toHaveLength(0);
    expect(byName(first(byClass(p.root, 'ip-actions')), 'button', 'Equip')).toHaveLength(1);
    expect(switchOf(p)?.getAttribute('aria-checked')).toBe('true');
  });
});
