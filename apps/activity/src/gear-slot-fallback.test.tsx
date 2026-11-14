import { RULES } from '@creatures/game';
import { afterEach, describe, expect, it } from 'vitest';
import { GearList } from './GearList';
import { fallbackSlotOpens, setValleySystemsOn } from './live-flags';
import { byClass, createPage, visibleText, type Page } from './test-dom';

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
  setValleySystemsOn(false);
});

function rowsText(p: Page): string {
  return byClass(p.root, 'find-row')
    .map((r) => visibleText(r))
    .join(' ');
}

describe('the gear slots before the gear view has loaded', () => {
  it('uses the rules own unlock levels with the valley systems off', () => {
    setValleySystemsOn(false);
    expect(fallbackSlotOpens()).toEqual(RULES.gear.slotUnlockLevel);
    page = createPage();
    page.draw(<GearList level={1} worn={[]} />);
    expect(rowsText(page)).toContain('Lv 7');
    expect(rowsText(page)).toContain('Lv 13');
  });

  it('opens every slot from level 1 with the valley systems on: no "Lv 7" flash', () => {
    setValleySystemsOn(true);
    expect(fallbackSlotOpens()).toEqual({ hat: 1, scarf: 1, charm: 1 });
    page = createPage();
    page.draw(<GearList level={1} worn={[]} />);
    expect(rowsText(page)).not.toContain('Lv 7');
    expect(rowsText(page)).not.toContain('Lv 13');
  });
});
