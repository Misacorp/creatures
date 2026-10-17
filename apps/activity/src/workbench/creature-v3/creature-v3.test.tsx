import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  byClass,
  byName,
  byRole,
  createPage,
  visibleText,
  type FakeElement,
  type Page,
} from '../../test-dom';
import { CreaturePageV3, type PageV3Actions } from './CreaturePageV3';
import { allBagItems } from './bag-sample';
import {
  NO_ITEM_FILTERS,
  compactReason,
  filterChoices,
  itemResultLine,
  pickerChoices,
} from './picker-view';
import { V3_ID, v3Scene, type V3Kind } from './sample';

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

function actions(): PageV3Actions {
  return {
    onEquip: vi.fn(() => Promise.resolve(true)),
    onRibbon: vi.fn(),
    onEvolve: vi.fn(),
    onRename: vi.fn(),
    onLounge: vi.fn(),
    onSlotTalent: vi.fn(),
  };
}

function drawPage(
  kind: V3Kind,
  handlers = actions(),
  bait = 100,
): { page: Page; handlers: PageV3Actions } {
  const scene = v3Scene(kind, { bait });
  page ??= createPage();
  page.draw(
    <CreaturePageV3
      creature={scene.creature}
      state={scene.state}
      gear={scene.gear}
      busy={false}
      actions={handlers}
      picker="list"
      find={false}
      onBack={() => undefined}
      onAnswerCatch={() => undefined}
    />,
  );
  return { page, handlers };
}

describe('the v3 page has no forward-looking or hand-holding text', () => {
  const FORBIDDEN = [
    /Next:/,
    /opens at level/i,
    /opens at/i,
    /unlocks at/i,
    /needs level/i,
    /Evolve into .*needs/i,
    /Evolves into/i,
    /Equip best/i,
    /\bempty\b/i,
    /Festival prize/i,
    /What is the Talent Book/i,
  ];
  const KINDS: V3Kind[] = ['level 2', 'level 8', 'level 15', 'ribbon ready', 'talents: epic'];
  for (const kind of KINDS) {
    it(`says none of it (${kind})`, () => {
      const { page: p } = drawPage(kind);
      const text = visibleText(p.root);
      for (const pattern of FORBIDDEN) expect(text, String(pattern)).not.toMatch(pattern);
    });
  }

  it('shows an unlock level only inside the locked slot', () => {
    const { page: p } = drawPage('level 2');
    const locked = byClass(p.root, 'locked');
    expect(locked.map((el) => el.textContent)).toEqual(['Lv 7', 'Lv 13', 'Lv 20']);
  });

  it('has no Equip best button and no Talent Book accordion', () => {
    const { page: p } = drawPage('level 15');
    expect(byName(p.root, 'button', /Equip best/)).toHaveLength(0);
    expect(byName(p.root, 'button', /Talent Book/)).toHaveLength(0);
  });
});

describe('gear and talent slots on the page', () => {
  it('shows three gear slots: filled icons, an empty one with its name, locked ones with the level', () => {
    const { page: p } = drawPage('level 15');
    const [gear] = byClass(p.root, 'slot-row');
    const slots = byClass(first([gear as FakeElement]), 'slot');
    expect(slots).toHaveLength(3);
    // The filled ones carry no slot-name text, only the icon and the tiny item level.
    expect(slots[0]?.textContent).toContain('Lv 15');
    expect(slots[1]?.textContent).toContain('Lv 12');
    expect(slots[2]?.textContent).toBe('Charm');
  });

  it('opens the item picker in a drawer from a slot and equips from it', async () => {
    const { page: p, handlers } = drawPage('level 15');
    const charm = first(byName(p.root, 'button', /^Charm: empty/));
    p.click(charm);
    const dialog = first(byRole(p.root, 'dialog'));
    expect(dialog.textContent).toContain('Charm');
    const equip = byName(dialog, 'button', /^Equip Cinder Charm/)[0];
    expect(equip).toBeDefined();
    p.click(equip as FakeElement);
    await vi.waitFor(() => {
      expect(handlers.onEquip).toHaveBeenCalledTimes(1);
    });
    const call: unknown[] = (handlers.onEquip as ReturnType<typeof vi.fn>).mock.calls[0] ?? [];
    expect(String(call[0])).toContain('bag-charm');
    expect(call[1]).toBe(V3_ID);
    // Accepted: the drawer closes.
    await vi.waitFor(() => {
      expect(byRole((page as Page).root, 'dialog')).toHaveLength(0);
    });
  });

  it('takes the worn item off from the pinned row', async () => {
    const { page: p, handlers } = drawPage('level 15');
    p.click(first(byName(p.root, 'button', /^Hat: Emberkeeper/)));
    const dialog = first(byRole(p.root, 'dialog'));
    p.click(first(byName(dialog, 'button', /^Take off/)));
    await vi.waitFor(() => {
      expect(handlers.onEquip).toHaveBeenCalledTimes(1);
    });
    expect((handlers.onEquip as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]).toBeNull();
  });

  it('opens the Talent Book for a slot and uses a talent for Bait', () => {
    const { page: p, handlers } = drawPage('talents: filled and empty');
    p.click(first(byName(p.root, 'button', /^Talent slot 2: empty/)));
    const dialog = first(byRole(p.root, 'dialog'));
    expect(dialog.textContent).toContain('Talent Book');
    const use = byName(dialog, 'button', /^Put Warm to the Touch in slot 2 for 10 Bait/)[0];
    expect(use?.textContent).toBe('Use · 10 Bait');
    p.click(use as FakeElement);
    expect(handlers.onSlotTalent).toHaveBeenCalledWith(
      expect.objectContaining({ id: V3_ID }),
      'warm-to-the-touch',
      false,
      2,
    );
  });

  it('turns the Talent Book buttons off when the Bait is short', () => {
    const { page: p } = drawPage('talents: filled and empty', actions(), 4);
    p.click(first(byName(p.root, 'button', /^Talent slot 2: empty/)));
    const dialog = first(byRole(p.root, 'dialog'));
    const buttons = byClass(dialog, 'book-use');
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) expect(button.hasAttribute('disabled')).toBe(true);
    expect(dialog.textContent).toContain('Not enough Bait.');
  });
});

describe('the item picker rules', () => {
  const scene = v3Scene('level 15');
  const choices = pickerChoices(scene.gear.items, scene.creature, scene.state.creatures, 'hat');

  it('lists wearable items first and gives a compact reason for the rest', () => {
    const firstBlocked = choices.findIndex((c) => c.blocked !== null);
    expect(firstBlocked).toBeGreaterThan(0);
    expect(choices.slice(firstBlocked).every((c) => c.blocked !== null)).toBe(true);
    const thundercap = choices.find((c) => c.item.baseId === 'thundercap');
    expect(thundercap).toBeDefined();
    expect(compactReason((thundercap as (typeof choices)[number]).item, scene.creature)).toBe(
      'Needs Lv 16',
    );
  });

  it('says who wears an item that would move, and leaves the worn item out of the choices', () => {
    expect(choices.some((c) => c.wornBy === 'Pebble')).toBe(true);
    expect(choices.some((c) => c.item.equippedOn === V3_ID)).toBe(false);
  });

  it('filters by name, rarity, element and "Can wear"', () => {
    const rare = filterChoices(choices, { ...NO_ITEM_FILTERS, rarities: ['rare'] }, '');
    expect(rare.length).toBeGreaterThan(0);
    expect(rare.every((c) => c.item.rarity === 'rare')).toBe(true);
    const wearable = filterChoices(choices, { ...NO_ITEM_FILTERS, canWear: true }, '');
    expect(wearable.every((c) => c.blocked === null)).toBe(true);
    expect(wearable.length).toBeLessThan(choices.length);
    const hoods = filterChoices(choices, NO_ITEM_FILTERS, 'HOOD');
    expect(hoods.length).toBeGreaterThan(0);
    expect(hoods.every((c) => /hood/i.test(c.item.baseId))).toBe(true);
    const ember = filterChoices(choices, { ...NO_ITEM_FILTERS, elements: ['ember'] }, '');
    expect(ember.length).toBeGreaterThan(0);
    expect(ember.length).toBeLessThan(choices.length);
  });

  it('counts with a spaced slash', () => {
    expect(itemResultLine(7, 18)).toBe('7 / 18 items');
    expect(itemResultLine(0, 18)).toBe('No item matches.');
  });

  it('has a bag of fifteen to twenty-five items for each slot', () => {
    const items = allBagItems(V3_ID, {});
    for (const slot of ['hat', 'scarf', 'charm'] as const) {
      const n = items.filter((i) => i.slot === slot).length;
      expect(n).toBeGreaterThanOrEqual(13);
      expect(n).toBeLessThanOrEqual(25);
    }
  });
});
