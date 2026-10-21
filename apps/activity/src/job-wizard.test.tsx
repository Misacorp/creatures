import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_GEAR, sampleRoster } from './creature-card-sample';
import type { Creature } from './api';
import type { GearState } from './gear-types';
import { SupplyCrafting } from './SupplyCrafting';
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

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

type Starter = (id: string, creatureId: string, treat: boolean) => Promise<boolean>;
const started = (): Starter => vi.fn<Starter>().mockResolvedValue(true);
const failed = (): Starter => vi.fn<Starter>().mockResolvedValue(false);
const JOB = { kind: 'job', id: 'job-1' } as const;

/** Five creatures: sample-0 at Crafting level 5, sample-1 at 3 and the other three at 1. */
function setup(over: { busy?: number[]; slotsUsed?: number; levels?: number[] } = {}): {
  gear: GearState;
  creatures: Creature[];
} {
  const roster = sampleRoster(5);
  const levels = over.levels ?? [5, 3, 1, 1, 1];
  return {
    creatures: roster.map((c, i) => (over.busy?.includes(i) === true ? { ...c, busy: JOB } : c)),
    gear: {
      ...SAMPLE_GEAR,
      slots: { total: 2, used: over.slotsUsed ?? 0 },
      skills: roster.map((c, i) => ({
        creatureId: c.id,
        xp: 0,
        level: levels[i] ?? 1,
        nextLevelXp: null,
      })),
    },
  };
}

function draw(
  stock: Record<string, number>,
  handlers: { onCraft?: Starter; onConvert?: Starter } = {},
  world = setup(),
  error: string | null = null,
): FakeElement {
  page = createPage();
  page.draw(
    <SupplyCrafting
      gear={world.gear}
      creatures={world.creatures}
      stock={stock}
      busy={false}
      error={error}
      onCraft={handlers.onCraft ?? started()}
      onConvert={handlers.onConvert ?? started()}
    />,
  );
  return page.root;
}

function button(root: FakeElement, name: string | RegExp): FakeElement {
  const [found] = byName(root, 'button', name);
  if (found === undefined) throw new Error(`no ${String(name)} button`);
  return found;
}

const drawer = (root: FakeElement): FakeElement[] => byRole(root, 'dialog');
const footerButton = (root: FakeElement): FakeElement => {
  const [found] = byClass(root, 'send-button');
  if (found === undefined) throw new Error('no footer button');
  return found;
};
const radios = (root: FakeElement): FakeElement[] =>
  find(root, (e) => e.localName === 'input' && e.getAttribute('type') === 'radio');
const rows = (root: FakeElement): string[] =>
  find(
    root,
    (e) => e.localName === 'label' && (e.getAttribute('class') ?? '').includes('pick'),
  ).map((e) => visibleText(e));

/** Opens a job from the supply card and returns the root. */
function open(name: string): void {
  if (page === null) throw new Error('nothing drawn');
  page.click(button(page.root, name));
}
const choose = (root: FakeElement, id: string): void => {
  const input = radios(root).find((r) => r.value === id);
  if (input === undefined) throw new Error(`no radio ${id}`);
  page?.event(input, 'change');
};
const next = (root: FakeElement): void => {
  page?.click(footerButton(root));
};
/** Lets the start's promise chain finish, then draws what it changed. */
const settled = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  page?.update(() => undefined);
};
const stepTitle = (root: FakeElement): string =>
  visibleText(byClass(root, 'drill-head')[0] as FakeElement);

describe('the job wizard drawer', () => {
  it('opens from Refine with the recipe once at the top and the creatures that can do it', () => {
    const root = draw({ 'lure-basic': 3 });
    expect(drawer(root)).toHaveLength(0);
    open('Refine');
    expect(drawer(root)).toHaveLength(1);
    expect(visibleText(drawer(root)[0] as FakeElement)).toContain('Refine Plain Lure');
    // One recipe card, in the drawer's own toolbar; no "Refine ?" heading and no empty Cost label.
    expect(byClass(root, 'recipe-card')).toHaveLength(1);
    expect(byClass(root, 'job-starter')).toHaveLength(0);
    expect(byClass(root, 'label').filter((e) => visibleText(e) === 'Cost')).toHaveLength(0);
    expect(stepTitle(root)).toContain('Who crafts');
    // Level 5 and level 3 can refine; both are listed, best first, each with its time.
    const list = rows(root);
    expect(list).toHaveLength(2);
    expect(list[0]).toContain('Crafting level 5');
    expect(list[1]).toContain('Crafting level 3');
    expect(visibleText(footerButton(root))).toBe('Next');
    expect(footerButton(root).hasAttribute('disabled')).toBe(false);
  });

  it('picks the first creature that can do it and sends the same request as before', () => {
    const onConvert = started();
    const root = draw({ 'lure-basic': 3 }, { onConvert });
    open('Refine');
    next(root);
    expect(stepTitle(root)).toContain('Ready');
    expect(onConvert).not.toHaveBeenCalled();
    expect(visibleText(footerButton(root))).toBe('Start refine');
    // The ready step names the worker and has the treat; no cost list again.
    expect(visibleText(byClass(root, 'job-ready')[0] as FakeElement)).toContain('Crafting level 5');
    expect(byClass(root, 'cost-list')).toHaveLength(1); // only the supply card's own
    expect(byRole(root, 'switch')).toHaveLength(1);
    next(root);
    expect(onConvert).toHaveBeenCalledWith('refine-lure-basic', 'sample-0', false);
  });

  it('closes the drawer after a start that went through', async () => {
    const root = draw({ 'lure-basic': 3 });
    open('Refine');
    next(root);
    next(root);
    await settled();
    expect(drawer(root)).toHaveLength(0);
  });

  it('keeps the pick the player made', () => {
    const onConvert = started();
    const root = draw({ 'lure-basic': 3 }, { onConvert });
    open('Refine');
    choose(root, 'sample-1');
    next(root);
    next(root);
    expect(onConvert).toHaveBeenCalledWith('refine-lure-basic', 'sample-1', false);
  });

  it('recycles through the same drawer', () => {
    const onConvert = started();
    const root = draw({ 'lure-good': 1 }, { onConvert });
    page?.click(
      byClass(root, 'supply-cell').find((c) =>
        (c.getAttribute('aria-label') ?? '').includes('1 in stock'),
      ) as FakeElement,
    );
    open('Recycle');
    expect(visibleText(drawer(root)[0] as FakeElement)).toContain('Recycle Sweet Lure');
    next(root);
    expect(visibleText(footerButton(root))).toBe('Start recycle');
    next(root);
    expect(onConvert).toHaveBeenCalledWith('recycle-lure-good', 'sample-0', false);
  });

  it('crafts a supply with the recipe of its parts, and the same request as before', () => {
    const onCraft = started();
    const root = draw({}, { onCraft });
    open('Craft');
    expect(visibleText(drawer(root)[0] as FakeElement)).toContain('Craft Plain Lure');
    expect(byClass(root, 'recipe-card')).toHaveLength(1);
    next(root);
    expect(visibleText(footerButton(root))).toBe('Craft');
    next(root);
    expect(onCraft).toHaveBeenCalledWith('lure-basic', 'sample-0', false);
  });
});

describe('the folded row of creatures under the level', () => {
  it('folds them into one greyed summary row, collapsed by default', () => {
    const root = draw({ 'lure-basic': 3 });
    open('Refine');
    const fold = button(root, /need Crafting level 3/);
    expect(visibleText(fold)).toBe('3 more need Crafting level 3');
    expect(fold.getAttribute('aria-expanded')).toBe('false');
    // Only the two creatures that can refine are rows; the other three are not listed one by one.
    expect(radios(root)).toHaveLength(2);
  });

  it('lists them greyed with their reason when tapped, and folds again on a second tap', () => {
    const root = draw({ 'lure-basic': 3 });
    open('Refine');
    page?.click(button(root, /need Crafting level 3/));
    expect(button(root, /need Crafting level 3/).getAttribute('aria-expanded')).toBe('true');
    const all = radios(root);
    expect(all).toHaveLength(5);
    const folded = all.filter((r) => r.hasAttribute('disabled'));
    expect(folded).toHaveLength(3);
    expect(rows(root).filter((r) => r.includes('Needs level 3'))).toHaveLength(3);
    page?.click(button(root, /need Crafting level 3/));
    expect(radios(root)).toHaveLength(2);
  });

  it('has no folded row when everybody has the level', () => {
    const root = draw({ 'lure-basic': 3 }, {}, setup({ levels: [5, 5, 5, 5, 5] }));
    open('Refine');
    expect(byName(root, 'button', /need Crafting level/)).toHaveLength(0);
    expect(radios(root)).toHaveLength(5);
  });

  it('lists a busy creature at the level greyed with its reason, not folded', () => {
    const root = draw({ 'lure-basic': 3 }, {}, setup({ busy: [1] }));
    open('Refine');
    const list = rows(root);
    expect(list).toHaveLength(2);
    expect(list[1]).toContain('On a job');
    expect(radios(root)[1]?.hasAttribute('disabled')).toBe(true);
    // The pick is still the free one at the level.
    next(root);
    expect(visibleText(byClass(root, 'job-ready')[0] as FakeElement)).toContain('Crafting level 5');
  });
});

describe('when nobody can do it', () => {
  it('says why in the footer when everyone at the level is busy but a lower one is free', () => {
    const onConvert = started();
    const root = draw({ 'lure-basic': 3 }, { onConvert }, setup({ busy: [0, 1] }));
    open('Refine');
    expect(visibleText(footerButton(root))).toContain('Next');
    expect(footerButton(root).hasAttribute('disabled')).toBe(true);
    expect(visibleText(byClass(root, 'wizard-footer')[0] as FakeElement)).toContain(
      'Nobody free has Crafting level 3.',
    );
    page?.click(footerButton(root));
    expect(stepTitle(root)).toContain('Who crafts');
    expect(onConvert).not.toHaveBeenCalled();
    // Both at the level are listed greyed; nobody is picked.
    expect(radios(root).filter((r) => r.hasAttribute('checked'))).toHaveLength(0);
  });

  it('says the job slots are busy when they are', () => {
    const root = draw({ 'lure-basic': 3 }, {}, setup({ slotsUsed: 2 }));
    open('Refine');
    expect(visibleText(byClass(root, 'wizard-footer')[0] as FakeElement)).toContain(
      'All 2 slots are busy.',
    );
    expect(footerButton(root).hasAttribute('disabled')).toBe(true);
  });
});

describe('Back, Escape and a failed start', () => {
  it('closes the drawer with Back on Who, and goes one step back from Ready', () => {
    const root = draw({ 'lure-basic': 3 });
    open('Refine');
    next(root);
    page?.click(button(root, /Back/));
    expect(stepTitle(root)).toContain('Who crafts');
    expect(drawer(root)).toHaveLength(1);
    page?.click(button(root, /Back/));
    expect(drawer(root)).toHaveLength(0);
  });

  it('goes one step back on Escape, then closes on Escape from Who', () => {
    const root = draw({ 'lure-basic': 3 });
    open('Refine');
    next(root);
    page?.key(button(root, /Back/), 'Escape');
    expect(stepTitle(root)).toContain('Who crafts');
    expect(drawer(root)).toHaveLength(1);
    page?.key(button(root, /Back/), 'Escape');
    expect(drawer(root)).toHaveLength(0);
  });

  it('shows the server error in the footer and keeps the drawer when the start failed', async () => {
    const onConvert = failed();
    const root = draw({ 'lure-basic': 3 }, { onConvert }, setup(), 'Not enough Bait.');
    open('Refine');
    next(root);
    expect(byClass(root, 'alert')).toHaveLength(0);
    next(root);
    await settled();
    expect(drawer(root)).toHaveLength(1);
    expect(visibleText(byClass(root, 'wizard-footer')[0] as FakeElement)).toContain(
      'Not enough Bait.',
    );
  });

  it('puts a packed treat on the start and its Bait on the button', () => {
    const onConvert = started();
    const root = draw({ 'lure-basic': 3 }, { onConvert });
    open('Refine');
    next(root);
    expect(byName(footerButton(root), 'span', /Bait/)).toHaveLength(0);
    const [treat] = byRole(root, 'switch');
    if (treat === undefined) throw new Error('no treat switch');
    page?.click(treat);
    expect(byName(footerButton(root), 'span', /Bait/).length).toBeGreaterThan(0);
    next(root);
    expect(onConvert).toHaveBeenCalledWith('refine-lure-basic', 'sample-0', true);
  });
});
