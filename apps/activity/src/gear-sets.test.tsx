import { gearContent } from '@creatures/game';
import { afterEach, describe, expect, it } from 'vitest';
import { GearSlots } from './creature-page/PageSlots';
import { allBagItems } from './creature-page/bag-sample';
import { PAGE_SAMPLE_ID, pageScene } from './creature-page/sample';
import type { GearItem } from './gear-types';
import { activeSetLine, itemSet, setBonusRows, setCountText, setPiecesWith } from './gear-view';
import { ItemCard } from './ItemCard';
import { byClass, createPage, find, visibleText, type FakeElement, type Page } from './test-dom';

/**
 * Gear sets on the item card and the creature page: the set's name as a badge, the two and three piece
 * bonuses with how many pieces the wearer has ("2 / 3") and the active ones marked, one compact line of the
 * active bonuses on the creature page.
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

const bag = allBagItems(PAGE_SAMPLE_ID, {});
const bonnet = bag.find((i) => i.baseId === 'forge-warm-bonnet') as GearItem;
const sash = bag.find((i) => i.baseId === 'forge-warm-sash') as GearItem;
const token = bag.find((i) => i.baseId === 'forge-warm-token') as GearItem;
const plainHat = bag.find((i) => i.baseId === 'emberkeepers-crown') as GearItem;

describe('the set helpers', () => {
  it('finds the set of a piece and none for a plain base', () => {
    expect(itemSet('forge-warm-bonnet')?.name).toBe('Forge-Warm Kit');
    expect(itemSet('festival-lantern-cap')?.name).toBe('Lantern Night');
    expect(itemSet('trail-cap')).toBeUndefined();
    expect(itemSet('does-not-exist')).toBeUndefined();
  });

  it('writes a count with a spaced slash, never "of"', () => {
    expect(setCountText(2)).toBe('2 / 3');
    expect(setCountText(0)).toBe('0 / 3');
  });

  it('marks the bonuses the pieces worn reach', () => {
    const set = itemSet('forge-warm-bonnet');
    if (set === undefined) throw new Error('no set');
    expect(setBonusRows(set, 1).map((r) => r.active)).toEqual([false, false]);
    expect(setBonusRows(set, 2).map((r) => r.active)).toEqual([true, false]);
    expect(setBonusRows(set, 3).map((r) => r.active)).toEqual([true, true]);
    expect(setBonusRows(set, 3).map((r) => r.pieces)).toEqual([2, 3]);
    expect(setBonusRows(set, 2)[0]?.text).toBe('Wildfire bonus +8%');
  });

  it('counts the pieces a creature would wear with an item on: the other slots plus the item', () => {
    expect(setPiecesWith(bonnet, [])).toBe(1);
    expect(setPiecesWith(bonnet, [sash])).toBe(2);
    expect(setPiecesWith(bonnet, [sash, token])).toBe(3);
    // The piece it replaces in the same slot does not count, and another set's piece is not this set's.
    const otherHat = { baseId: 'tidepool-cowl', slot: 'hat' as const };
    expect(setPiecesWith(sash, [otherHat, bonnet])).toBe(2);
    expect(setPiecesWith(bonnet, [{ baseId: 'forge-warm-bonnet', slot: 'hat' }, token])).toBe(2);
    expect(setPiecesWith(plainHat, [sash, token])).toBe(0);
  });

  it('writes the active bonuses of a creature as one compact line', () => {
    expect(activeSetLine([])).toBe('');
    expect(activeSetLine([bonnet])).toBe('');
    expect(activeSetLine([bonnet, sash])).toBe('Forge-Warm Kit 2 / 3: Wildfire bonus +8%');
    expect(activeSetLine([bonnet, sash, token])).toBe(
      'Forge-Warm Kit 3 / 3: Wildfire bonus +8%. Crits after a Wildfire deal +20 pt crit damage for a round.',
    );
    // Two sets at once are kept on one line, separated by a dot.
    const both = [
      { baseId: 'tidepool-cowl', slot: 'hat' as const },
      { baseId: 'tidepool-stole', slot: 'scarf' as const },
      { baseId: 'forge-warm-bonnet', slot: 'hat' as const },
      { baseId: 'forge-warm-sash', slot: 'scarf' as const },
    ];
    expect(activeSetLine(both)).toBe(
      'Tidepool Finery 2 / 3: Steam bonus +8% · Forge-Warm Kit 2 / 3: Wildfire bonus +8%',
    );
  });

  it('has text for every set that fits a compact card (no line breaks, kept short)', () => {
    for (const set of gearContent.sets) {
      for (const text of [set.two.text, set.three.text]) {
        expect(text.length, set.id).toBeLessThanOrEqual(80);
        expect(text, set.id).not.toMatch(/\n/);
      }
    }
  });
});

describe('the item card of a set piece', () => {
  it('shows the set as a badge and its bonuses with the pieces the wearer has', () => {
    page = createPage();
    page.draw(<ItemCard item={bonnet} wornInSet={2} />);
    const badges = byClass(page.root, 'idc-badge');
    expect(badges).toHaveLength(1);
    expect(visibleText(first(byClass(first(badges), 'set-tag')))).toBe('Forge-Warm Kit');
    const section = first(byClass(page.root, 'idc-set'));
    expect(visibleText(first(byClass(section, 'idc-set-count')))).toBe('2 / 3');
    const rows = find(section, (e) => e.localName === 'li');
    expect(rows.map((r) => r.getAttribute('class'))).toEqual(['on', 'off']);
    expect(visibleText(first(rows))).toContain('2 pieces');
    expect(visibleText(first(rows))).toContain('Wildfire bonus +8%');
    expect(visibleText(rows[1] as FakeElement)).toContain('3 pieces');
    // Active is said in words too, so the colour is never the only cue.
    expect(visibleText(first(rows))).toContain('(active)');
    expect(visibleText(rows[1] as FakeElement)).not.toContain('(active)');
  });

  it('marks both bonuses with three pieces and none with one', () => {
    page = createPage();
    page.draw(<ItemCard item={bonnet} wornInSet={3} />);
    expect(
      find(first(byClass(page.root, 'idc-set')), (e) => e.localName === 'li').map((r) =>
        r.getAttribute('class'),
      ),
    ).toEqual(['on', 'on']);
    page.unmount();
    page = createPage();
    page.draw(<ItemCard item={bonnet} wornInSet={0} />);
    const section = first(byClass(page.root, 'idc-set'));
    expect(visibleText(first(byClass(section, 'idc-set-count')))).toBe('0 / 3');
    expect(find(section, (e) => e.localName === 'li').map((r) => r.getAttribute('class'))).toEqual([
      'off',
      'off',
    ]);
  });

  it('has no set block and no set badge on an ordinary item', () => {
    page = createPage();
    page.draw(<ItemCard item={plainHat} />);
    expect(byClass(page.root, 'idc-set')).toHaveLength(0);
    expect(byClass(page.root, 'set-tag')).toHaveLength(0);
  });

  it('shows a role set Charm and a Festival piece with their set', () => {
    page = createPage();
    page.draw(<ItemCard item={{ ...token, baseId: 'watchmans-whistle' }} wornInSet={1} />);
    expect(visibleText(first(byClass(page.root, 'set-tag')))).toBe("Warden's Watch");
    page.unmount();
    page = createPage();
    page.draw(<ItemCard item={{ ...plainHat, baseId: 'festival-lantern-cap' }} wornInSet={3} />);
    expect(visibleText(first(byClass(page.root, 'set-tag')))).toBe('Lantern Night');
    expect(byClass(page.root, 'festival-tag')).toHaveLength(1);
  });

  it('draws set text as text only: no inline style and no markup elements in the set block', () => {
    page = createPage();
    page.draw(<ItemCard item={bonnet} wornInSet={3} />);
    const everything = find(first(byClass(page.root, 'idc-set')), () => true);
    expect(everything.length).toBeGreaterThan(3);
    for (const el of everything) {
      expect(el.getAttribute('style'), el.localName).toBeNull();
      expect(['script', 'iframe', 'img']).not.toContain(el.localName);
    }
  });
});

describe('the creature page gear section', () => {
  const draw = (kind: 'set: two pieces' | 'set: three pieces' | 'level 15') => {
    const scene = pageScene(kind);
    page = createPage();
    page.draw(
      <GearSlots
        creature={scene.creature}
        gear={scene.gear}
        openSlot={null}
        onOpen={() => undefined}
      />,
    );
    return page.root;
  };

  it('says one compact line of the active set bonuses under the slots', () => {
    const two = byClass(draw('set: two pieces'), 'cp-sets');
    expect(two).toHaveLength(1);
    expect(visibleText(first(two))).toBe('Forge-Warm Kit 2 / 3: Wildfire bonus +8%');
    page?.unmount();
    const three = byClass(draw('set: three pieces'), 'cp-sets');
    expect(visibleText(first(three))).toContain('Forge-Warm Kit 3 / 3');
    expect(visibleText(first(three))).toContain('Crits after a Wildfire');
  });

  it('says nothing when no set has two pieces worn', () => {
    expect(byClass(draw('level 15'), 'cp-sets')).toHaveLength(0);
  });
});
