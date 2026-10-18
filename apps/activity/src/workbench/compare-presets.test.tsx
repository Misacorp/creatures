import { afterEach, describe, expect, it } from 'vitest';
import { byClass, createPage, visibleText, type Page } from '../test-dom';
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

describe('the compare presets', () => {
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
