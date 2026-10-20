import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_GEAR, sampleRoster } from './creature-card-sample';
import type { GearState } from './gear-types';
import { SupplyCrafting } from './SupplyCrafting';
import { byClass, byName, createPage, visibleText, type FakeElement, type Page } from './test-dom';

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

type Starter = (id: string, creatureId: string, treat: boolean) => Promise<boolean>;
const roster = sampleRoster(3);
const started = (): Starter => vi.fn<Starter>().mockResolvedValue(true);

/** The sample gear with the first creature at this Crafting level (the others stay at level 1). */
function gearAt(level: number): GearState {
  const id = roster[0]?.id ?? 'sample-0';
  return { ...SAMPLE_GEAR, skills: [{ creatureId: id, xp: 0, level, nextLevelXp: null }] };
}

function draw(
  stock: Record<string, number>,
  level = 1,
  handlers: { onCraft?: Starter; onConvert?: Starter } = {},
): FakeElement {
  page = createPage();
  page.draw(
    <SupplyCrafting
      gear={gearAt(level)}
      creatures={roster}
      stock={stock}
      busy={false}
      onCraft={handlers.onCraft ?? started()}
      onConvert={handlers.onConvert ?? started()}
    />,
  );
  return page.root;
}

function cellBy(root: FakeElement, test: (label: string) => boolean): FakeElement {
  const found = byClass(root, 'supply-cell').find((c) => test(c.getAttribute('aria-label') ?? ''));
  if (found === undefined) throw new Error('no such cell');
  return found;
}

function button(root: FakeElement, name: string): FakeElement {
  const [found] = byName(root, 'button', name);
  if (found === undefined) throw new Error(`no ${name} button`);
  return found;
}

describe('the compact supply picker', () => {
  it('draws 12 picture cells, four to a rarity, and keeps the id the trip screen scrolls to', () => {
    const root = draw({});
    const cells = byClass(root, 'supply-cell');
    expect(cells).toHaveLength(12);
    for (const rarity of ['common', 'rare', 'epic']) {
      const withRarity = cells.filter((c) =>
        (c.getAttribute('class') ?? '').split(/\s+/).includes(`rarity-${rarity}`),
      );
      expect(withRarity).toHaveLength(4);
    }
    expect(page?.document.getElementById('ws-supplies')).not.toBeNull();
  });

  it('shows the stock in the corner only when there is some', () => {
    const root = draw({ 'lure-basic': 2 });
    expect(byClass(root, 'supply-count')).toHaveLength(1);
    const owned = cellBy(root, (l) => l.includes('2 in stock'));
    expect(owned.getAttribute('aria-label')).not.toContain('no creature');
  });

  it('mutes the supplies no creature can craft yet, and still lets them be selected', () => {
    const root = draw({}, 1);
    const muted = byClass(root, 'supply-cell').filter((c) =>
      (c.getAttribute('class') ?? '').split(/\s+/).includes('blocked'),
    );
    expect(muted.length).toBeGreaterThan(0);
    expect(muted.length).toBeLessThan(12);
    const [first] = muted;
    if (first === undefined) throw new Error('no muted cell');
    expect(first.getAttribute('aria-label')).toContain('no creature can craft it yet');
    const open = cellBy(root, (l) => !l.includes('no creature'));
    page?.click(first);
    expect(first.getAttribute('aria-pressed')).toBe('true');
    expect(open.getAttribute('aria-pressed')).toBe('false');
  });

  it('starts on the first craftable supply and shows one card for the selected one', () => {
    const root = draw({});
    const cards = byClass(root, 'supply-card');
    expect(cards).toHaveLength(1);
    const firstName = byClass(root, 'bp-name')[0]?.textContent ?? '';
    expect(firstName).toBe('Plain Lure');
    const other = byClass(root, 'supply-cell')[3];
    if (other === undefined) throw new Error('no cell');
    page?.click(other);
    expect(byClass(root, 'supply-card')).toHaveLength(1);
    expect(other.getAttribute('aria-pressed')).toBe('true');
    expect(byClass(root, 'bp-name')[0]?.textContent).not.toBe(firstName);
  });

  it('gives Craft a reason when no creature has the level, and nothing starts', () => {
    const onCraft = started();
    const root = draw({}, 1, { onCraft });
    page?.click(cellBy(root, (l) => l.includes('no creature')));
    expect(button(root, 'Craft').hasAttribute('disabled')).toBe(true);
    expect(visibleText(root)).toMatch(/Needs Crafting level \d/);
    page?.click(button(root, 'Craft'));
    expect(byClass(root, 'job-starter')).toHaveLength(0);
    expect(onCraft).not.toHaveBeenCalled();
  });

  it('crafts through the creature picker', () => {
    const onCraft = started();
    const root = draw({}, 1, { onCraft });
    page?.click(button(root, 'Craft'));
    expect(byClass(root, 'job-starter')).toHaveLength(1);
    expect(onCraft).not.toHaveBeenCalled();
    page?.click(button(root, 'Start crafting'));
    expect(onCraft).toHaveBeenCalledWith('lure-basic', expect.any(String), false);
  });

  it('explains Refine and Recycle when they cannot run', () => {
    const root = draw({}, 5);
    // The default supply is basic: nothing to recycle, and three are needed to refine.
    expect(button(root, 'Recycle').hasAttribute('disabled')).toBe(true);
    expect(button(root, 'Refine').hasAttribute('disabled')).toBe(true);
    expect(visibleText(root)).toContain('Basic supplies cannot be recycled.');
    expect(visibleText(root)).toContain('Needs 3 more Plain Lure.');
  });

  it('keeps Refine off for the best tier', () => {
    const root = draw({ 'lure-great': 1 }, 5);
    page?.click(cellBy(root, (l) => l.includes('1 in stock')));
    expect(button(root, 'Refine').hasAttribute('disabled')).toBe(true);
    expect(visibleText(root)).toContain('Already the best tier.');
    expect(button(root, 'Recycle').hasAttribute('disabled')).toBe(false);
  });

  it('refines three into one through the creature picker', () => {
    const onConvert = started();
    const root = draw({ 'lure-basic': 3 }, 5, { onConvert });
    expect(button(root, 'Refine').hasAttribute('disabled')).toBe(false);
    page?.click(button(root, 'Refine'));
    expect(byClass(root, 'recipe-card')).toHaveLength(1);
    expect(byClass(root, 'job-starter')).toHaveLength(1);
    expect(onConvert).not.toHaveBeenCalled();
    page?.click(button(root, 'Start refine'));
    expect(onConvert).toHaveBeenCalledWith('refine-lure-basic', expect.any(String), false);
  });

  it('recycles a better supply back into parts', () => {
    const onConvert = started();
    const root = draw({ 'lure-good': 1 }, 5, { onConvert });
    page?.click(cellBy(root, (l) => l.includes('1 in stock')));
    page?.click(button(root, 'Recycle'));
    page?.click(button(root, 'Start recycle'));
    expect(onConvert).toHaveBeenCalledWith('recycle-lure-good', expect.any(String), false);
  });
});
