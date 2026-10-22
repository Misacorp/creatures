import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Creature } from './api';
import { Blueprints } from './Blueprints';
import { samplePreview } from './craft-sample';
import { SAMPLE_GEAR, sampleRoster } from './creature-card-sample';
import type { CraftPreview, GearState, ReachId } from './gear-types';
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

/**
 * Gear crafting in the job drawer: the blueprint card's Craft opens the same wizard as the supply jobs, with
 * a Reach step between Who and Ready. Every number on it is the server's preview for the picked creature.
 */

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

type Crafter = (
  baseId: string,
  creatureId: string,
  reach: ReachId,
  treat: boolean,
) => Promise<boolean>;
type Loader = (creatureId: string, blueprintId: string) => Promise<CraftPreview>;

/** Previews that follow the creature's Crafting level, as the server's do. */
function loader(levels: number[]): Loader {
  const roster = sampleRoster(5);
  return vi.fn<Loader>((creatureId, blueprintId) => {
    const at = roster.findIndex((c) => c.id === creatureId);
    return Promise.resolve(samplePreview(blueprintId, creatureId, levels[at] ?? 1));
  });
}

function world(
  over: { levels?: number[]; essence?: number; bagFull?: boolean; slotsUsed?: number } = {},
): { gear: GearState; creatures: Creature[] } {
  const roster = sampleRoster(5);
  const levels = over.levels ?? [6, 3, 1, 1, 1];
  return {
    creatures: roster,
    gear: {
      ...SAMPLE_GEAR,
      balances: { ...SAMPLE_GEAR.balances, essence: over.essence ?? 100 },
      inventory: over.bagFull === true ? { cap: 10, used: 10, reserved: 0 } : SAMPLE_GEAR.inventory,
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
  handlers: { onCraft?: Crafter; load?: Loader; error?: string | null } = {},
  w = world(),
): { root: FakeElement; onCraft: Crafter } {
  const onCraft = handlers.onCraft ?? vi.fn<Crafter>().mockResolvedValue(true);
  page = createPage();
  page.draw(
    <Blueprints
      gear={w.gear}
      creatures={w.creatures}
      busy={false}
      error={handlers.error ?? null}
      loadPreview={handlers.load ?? loader([6, 3, 1, 1, 1])}
      onCraft={onCraft}
    />,
  );
  return { root: page.root, onCraft };
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
const footerText = (root: FakeElement): string =>
  visibleText(byClass(root, 'wizard-footer')[0] as FakeElement);
const radios = (root: FakeElement): FakeElement[] =>
  find(root, (e) => e.localName === 'input' && e.getAttribute('type') === 'radio');
const stepTitle = (root: FakeElement): string =>
  visibleText(byClass(root, 'drill-head')[0] as FakeElement);
const settled = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  page?.update(() => undefined);
};
const next = (root: FakeElement): void => {
  page?.click(footerButton(root));
};

/** Opens the drawer of the blueprint called `name` (the card's own Craft button). */
function open(root: FakeElement, name: string): void {
  const card = byClass(root, 'blueprint').find((c) => visibleText(c).includes(name));
  if (card === undefined) throw new Error(`no blueprint ${name}`);
  page?.click(button(card, 'Craft'));
}
const chooseReach = (root: FakeElement, reach: string): void => {
  const input = radios(root).find((r) => r.value === reach);
  if (input === undefined) throw new Error(`no reach ${reach}`);
  page?.event(input, 'change');
};

/** Open Kelp Cap, go to the Reach step and wait for the odds. */
async function toReach(root: FakeElement): Promise<void> {
  open(root, 'Kelp Cap');
  next(root);
  await settled();
}

describe('gear crafting in the job drawer', () => {
  it('opens from the blueprint card with the recipe on top and the creatures that can craft it', () => {
    const { root } = draw();
    open(root, 'Kelp Cap');
    expect(drawer(root)).toHaveLength(1);
    expect(visibleText(drawer(root)[0] as FakeElement)).toContain('Craft Kelp Cap');
    expect(byClass(root, 'recipe-card')).toHaveLength(1);
    expect(stepTitle(root)).toContain('Who crafts');
    expect(radios(root)).toHaveLength(5);
    expect(visibleText(footerButton(root))).toBe('Next');
  });

  it('folds the creatures under the blueprint own Crafting level', () => {
    const { root } = draw();
    open(root, 'Brine Hood');
    // The Hood needs Crafting level 3: two creatures can, three are folded.
    expect(radios(root)).toHaveLength(2);
    expect(visibleText(button(root, /need Crafting level 3/))).toBe(
      '3 more creatures need Crafting level 3',
    );
  });

  it('sends exactly the old request for a plain craft', async () => {
    const { root, onCraft } = draw();
    await toReach(root);
    expect(stepTitle(root)).toContain('How hard do you reach?');
    next(root);
    expect(stepTitle(root)).toContain('Ready');
    expect(visibleText(footerButton(root))).toBe('Craft');
    next(root);
    expect(onCraft).toHaveBeenCalledWith('kelp-cap', 'sample-0', 'none', false);
  });

  it.each(['rare', 'epic'] as const)('sends the %s reach the player chose', async (reach) => {
    const { root, onCraft } = draw();
    await toReach(root);
    chooseReach(root, reach);
    next(root);
    expect(visibleText(byClass(root, 'job-ready')[0] as FakeElement)).toContain(
      reach === 'rare' ? 'Reach for Rare' : 'Reach for Epic',
    );
    next(root);
    expect(onCraft).toHaveBeenCalledWith('kelp-cap', 'sample-0', reach, false);
  });

  it('sends the treat with the craft and puts its Bait on the button', async () => {
    const { root, onCraft } = draw();
    await toReach(root);
    next(root);
    const [treat] = byRole(root, 'switch');
    if (treat === undefined) throw new Error('no treat switch');
    page?.click(treat);
    expect(byName(footerButton(root), 'span', /Bait/).length).toBeGreaterThan(0);
    next(root);
    expect(onCraft).toHaveBeenCalledWith('kelp-cap', 'sample-0', 'none', true);
  });

  it('shows the odds, time and cost of each reach from the server preview of the picked creature', async () => {
    const load = loader([6, 3, 1, 1, 1]);
    const { root } = draw({ load });
    await toReach(root);
    expect(load).toHaveBeenCalledWith('sample-0', 'kelp-cap');
    const text = visibleText(byClass(root, 'reach-options')[0] as FakeElement);
    expect(text).toContain('Plain craft');
    expect(text).toContain('Common 100%');
    expect(text).toContain('Reach for Rare');
    expect(text).toContain('Rare 60%');
    expect(text).toContain('25 Essence');
    expect(text).toContain('Epic 30%');
    expect(radios(root).every((r) => !r.hasAttribute('disabled'))).toBe(true);
  });

  it('locks a reach the picked creature is too low for, with its level', async () => {
    const { root } = draw({ load: loader([2, 1, 1, 1, 1]) }, world({ levels: [2, 1, 1, 1, 1] }));
    await toReach(root);
    expect(radios(root).filter((r) => r.hasAttribute('disabled'))).toHaveLength(2);
    expect(visibleText(byClass(root, 'reach-options')[0] as FakeElement)).toContain(
      'Needs Crafting level 3',
    );
  });

  it('waits for the odds: the step says loading and the button is off with the reason', () => {
    const load: Loader = () => new Promise(() => undefined);
    const { root } = draw({ load });
    open(root, 'Kelp Cap');
    next(root);
    expect(stepTitle(root)).toContain('How hard do you reach?');
    expect(visibleText(drawer(root)[0] as FakeElement)).toContain('Loading the odds...');
    expect(footerButton(root).hasAttribute('disabled')).toBe(true);
    expect(footerText(root)).toContain('Loading the odds...');
  });

  it('says so when the odds could not be loaded, and the button stays off', async () => {
    const load: Loader = () => Promise.reject(new Error('no'));
    const { root } = draw({ load });
    open(root, 'Kelp Cap');
    next(root);
    await settled();
    expect(visibleText(drawer(root)[0] as FakeElement)).toContain('Could not load the odds');
    expect(footerButton(root).hasAttribute('disabled')).toBe(true);
    expect(footerText(root)).toContain('The odds did not load.');
  });

  it('blocks a reach that costs more Essence than the player has, with the reason in the footer', async () => {
    const { root, onCraft } = draw({}, world({ essence: 10 }));
    await toReach(root);
    expect(footerButton(root).hasAttribute('disabled')).toBe(false);
    chooseReach(root, 'rare');
    expect(footerButton(root).hasAttribute('disabled')).toBe(true);
    expect(footerText(root)).toContain('Needs 15 more Essence.');
    // Going back to a plain craft frees it again.
    chooseReach(root, 'none');
    expect(footerButton(root).hasAttribute('disabled')).toBe(false);
    expect(onCraft).not.toHaveBeenCalled();
  });

  it('stops at the full bag from the first step with its reason (no gear note: a craft needs the room)', () => {
    const { root } = draw({}, world({ bagFull: true }));
    open(root, 'Kelp Cap');
    expect(footerText(root)).toContain('The bag is full.');
    expect(footerButton(root).hasAttribute('disabled')).toBe(true);
    expect(byClass(root, 'bag-full-note')).toHaveLength(0);
  });

  it('goes back through the steps with Back and Escape and closes from Who', async () => {
    const { root } = draw();
    await toReach(root);
    next(root);
    expect(stepTitle(root)).toContain('Ready');
    page?.click(button(root, /Back/));
    expect(stepTitle(root)).toContain('How hard do you reach?');
    page?.key(button(root, /Back/), 'Escape');
    expect(stepTitle(root)).toContain('Who crafts');
    expect(drawer(root)).toHaveLength(1);
    page?.key(button(root, /Back/), 'Escape');
    expect(drawer(root)).toHaveLength(0);
  });

  it('closes the drawer after a start that went through', async () => {
    const { root } = draw();
    await toReach(root);
    next(root);
    next(root);
    await settled();
    expect(drawer(root)).toHaveLength(0);
  });

  it('keeps the drawer and shows the server error after a refused start', async () => {
    const onCraft = vi.fn<Crafter>().mockResolvedValue(false);
    const { root } = draw({ onCraft, error: 'The bag is full.' });
    await toReach(root);
    next(root);
    next(root);
    await settled();
    expect(drawer(root)).toHaveLength(1);
    expect(footerText(root)).toContain('The bag is full.');
  });
});
