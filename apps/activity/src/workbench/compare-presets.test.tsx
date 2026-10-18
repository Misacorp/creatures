import { afterEach, describe, expect, it } from 'vitest';
import { byClass, byName, createPage, visibleText, type FakeElement, type Page } from '../test-dom';
import { creaturePageEntries } from './entries/creature-page';

/**
 * The compare presets of the workbench (K1 to K5) each show the case they are named after. (The text includes the spoken copy of each line.)
 */

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

function compareText(id: string): string {
  const entry = creaturePageEntries[0];
  if (entry === undefined) throw new Error('no entry');
  page = createPage();
  page.draw(entry.render({ ...entry.defaults, scene: id }));
  const row = byClass(page.root, 'ip-equip')[0];
  if (row === undefined) throw new Error(`${id}: no compare row`);
  return visibleText(row);
}

/** What the picker has selected after drawing a preset on top of whatever the page showed before. */
function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

function selected(id: string): { name: string; worn: boolean; equip: boolean } {
  const entry = creaturePageEntries[0];
  if (entry === undefined) throw new Error('no entry');
  page ??= createPage();
  page.draw(entry.render({ ...entry.defaults, scene: id }));
  const cell = byClass(page.root, 'ip-cell').find((c) => c.getAttribute('aria-pressed') === 'true');
  if (cell === undefined) throw new Error(`${id}: nothing selected`);
  return {
    name: visibleText(byClass(page.root, 'idc-name')[0] as FakeElement),
    worn: (cell.getAttribute('class') ?? '').split(' ').includes('worn'),
    equip: byName(page.root, 'button', 'Equip').length === 1,
  };
}

describe('the compare presets', () => {
  it('select the item they name, which is never the worn one, also when drawn one after another', () => {
    const names = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6'].map((id) => {
      const picked = selected(id);
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

  it('K3 shows the set line after a preset that left another item picked', () => {
    selected('K1');
    selected('K2');
    selected('K3');
    expect(visibleText(byClass(page?.root as FakeElement, 'ip-equip')[0] as FakeElement)).toContain(
      'Forge-Warm Kit 3 / 3: both bonuses',
    );
  });

  it('K1 shows gains for a better item', () => {
    expect(compareText('K1')).toMatch(/^HP \+\d+HP plus \d+Attack \+\d+Attack plus \d+/);
  });

  it('K2 shows losses for a worse item', () => {
    expect(compareText('K2')).toMatch(/^HP \u2212\d+HP minus \d+Attack \u2212\d+Attack minus \d+/);
  });

  it('K3 completes a set', () => {
    expect(compareText('K3')).toContain('Forge-Warm Kit 3 / 3: both bonuses');
  });

  it('K4 breaks a set', () => {
    expect(compareText('K4')).toContain('Loses Forge-Warm Kit 2 / 3');
  });

  it('K5 gains a Charm into an empty slot', () => {
    expect(compareText('K5')).toMatch(/\+\d+/);
  });
});

/** The picker drawn for a preset, fresh. */
function drawn(id: string): Page {
  const entry = creaturePageEntries[0];
  if (entry === undefined) throw new Error('no entry');
  page?.unmount();
  page = createPage();
  page.draw(entry.render({ ...entry.defaults, scene: id }));
  return page;
}

describe('the compare presets: inline', () => {
  const marks = (id: string): number =>
    byClass(drawn(id).root, 'cmp-delta').length +
    byClass(page?.root as FakeElement, 'cmp-new').length +
    byClass(page?.root as FakeElement, 'cmp-gone').length;
  const switchOf = (p: Page): FakeElement | undefined => byClass(p.root, 'ip-switch')[0];

  it('K1 to K4 show the inline changes with the switch on', () => {
    for (const id of ['K1', 'K2', 'K3', 'K4']) {
      expect(marks(id), id).toBeGreaterThan(0);
      expect(switchOf(page as Page)?.getAttribute('aria-checked'), id).toBe('true');
    }
  });

  it('K3 shows the Charm lines against the worn Charm and the set line beside Equip', () => {
    const p = drawn('K3');
    expect(byClass(p.root, 'cmp-new').length).toBeGreaterThan(0);
    expect(visibleText(first(byClass(p.root, 'ip-equip')))).toContain(
      'Forge-Warm Kit 3 / 3: both bonuses',
    );
  });

  it('K5, an empty slot, has no switch and no inline changes', () => {
    const p = drawn('K5');
    expect(switchOf(p)).toBeUndefined();
    expect(byClass(p.root, 'cmp-delta')).toHaveLength(0);
    expect(byClass(p.root, 'ip-compare')).toHaveLength(1);
  });

  it('K6 has the switch off and the plain card', () => {
    const p = drawn('K6');
    expect(switchOf(p)?.getAttribute('aria-checked')).toBe('false');
    expect(
      byClass(p.root, 'cmp-delta').length +
        byClass(p.root, 'cmp-new').length +
        byClass(p.root, 'cmp-gone').length,
    ).toBe(0);
    expect(byClass(p.root, 'ip-compare')).toHaveLength(0);
    // No row of its own: Equip is in the card's corner, as before the compare.
    expect(byClass(p.root, 'ip-equip')).toHaveLength(0);
    expect(byName(first(byClass(p.root, 'idc-aside')), 'button', 'Equip')).toHaveLength(1);
  });
});
