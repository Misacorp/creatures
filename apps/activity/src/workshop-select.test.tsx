import { afterEach, describe, expect, it, vi } from 'vitest';
import { GEAR_STATE, SAMPLE_GEAR } from './creature-card-sample';
import type { GearActions } from './gear-actions';
import type { DismantlePreview, GearState, JobResult } from './gear-types';
import { gearName } from './gear-view';
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
import { Workshop } from './Workshop';

/**
 * The bag's selection mode (2026-10-27): "Dismantle items" starts it, a tap toggles an item's mark (its card is
 * one small "i" away), the presets mark what matches, the bar counts and goes on to who and the confirmation.
 * The sample bag: three worn Commons-and-Rares, a Rare level 10 and a Common level 2 that are free, and a Rare
 * level 16 the server already shows as marked.
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

const item = (baseId: string) => {
  const found = SAMPLE_GEAR.items.find((i) => i.baseId === baseId);
  if (found === undefined) throw new Error(`no ${baseId} in the sample bag`);
  return found;
};
const thundercap = item('thundercap'); // Rare, level 16, marked by the server
const compass = item('crossroads-compass'); // Rare, level 10, free
const kelp = item('kelp-cap'); // Common, level 2, free
const worn = item('trail-cap'); // Common, level 1, worn

const result = {
  kind: 'dismantle',
  items: [],
  parts: {},
  essence: 0,
  learned: [],
  marked: [],
  xp: 6,
  skillXp: 6,
  skillLevel: 1,
  leveledUp: false,
} as JobResult;

function actionsOf(over: Partial<GearActions> = {}): GearActions {
  return {
    equip: () => Promise.resolve(undefined),
    equipBest: () => Promise.resolve(undefined),
    mark: vi.fn(() => new Promise(() => undefined)),
    dismantlePile: vi.fn(() => Promise.resolve(result)),
    dismissNotice: () => Promise.resolve(undefined),
    startJob: () => Promise.resolve(undefined),
    previewCraft: () => new Promise(() => undefined),
    previewDismantle: vi.fn(() => new Promise(() => undefined)),
    claimJob: () => Promise.resolve(undefined),
    ...over,
  } as unknown as GearActions;
}

function draw(
  actions: GearActions,
  gear: GearState = SAMPLE_GEAR,
  onClaimed: (r: JobResult) => void = () => undefined,
): Page {
  page = createPage();
  page.draw(
    <Workshop
      state={GEAR_STATE}
      gear={gear}
      failed={false}
      offset={0}
      busy={false}
      reveal={null}
      actions={actions}
      onRetry={() => undefined}
      onClaimed={onClaimed}
      onDismissReveal={() => undefined}
    />,
  );
  return page;
}

/** The tile of an item (the button named after it, not its info button). */
function tile(p: Page, baseId: string): FakeElement {
  return first(
    find(
      p.root,
      (e) =>
        e.localName === 'button' &&
        (e.getAttribute('class') ?? '').includes('item-tile') &&
        !(e.getAttribute('class') ?? '').includes('item-tile-info') &&
        (e.getAttribute('aria-label') ?? '').startsWith(gearName(baseId)),
    ),
  );
}
const infoOf = (p: Page, baseId: string): FakeElement =>
  first(byName(p.root, 'button', new RegExp(`^Details of ${gearName(baseId)}`)));
const start = (p: Page): void => {
  p.click(first(byName(p.root, 'button', 'Dismantle items')));
};
const bar = (p: Page): FakeElement => first(byClass(p.root, 'select-bar'));
const settle = async (p: Page): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  p.update(() => undefined);
};

describe('marked items in the bag', () => {
  it('shows a red corner and says in its label that an item the server marked is marked', () => {
    const p = draw(actionsOf());
    const t = tile(p, 'thundercap');
    expect(byClass(t, 'item-tile-mark')).toHaveLength(1);
    expect(t.getAttribute('aria-label')).toContain('marked for dismantling');
    expect(t.getAttribute('class')).toContain('marked');
    // Another item has none.
    expect(byClass(tile(p, 'kelp-cap'), 'item-tile-mark')).toHaveLength(0);
    expect(tile(p, 'kelp-cap').getAttribute('aria-label')).not.toContain('marked');
  });

  it('has a "Dismantle items" button, and no selection tools or bar until it is tapped', () => {
    const p = draw(actionsOf());
    expect(byName(p.root, 'button', 'Dismantle items')).toHaveLength(1);
    expect(byClass(p.root, 'select-bar')).toHaveLength(0);
    expect(byName(p.root, 'button', 'All Common')).toHaveLength(0);
    // Outside the mode a tap opens the card, which has the mark action.
    p.click(tile(p, 'kelp-cap'));
    expect(byName(first(byRole(p.root, 'dialog')), 'button', 'Mark for dismantling')).toHaveLength(
      1,
    );
  });

  it('has no selection button for an empty bag', () => {
    const p = draw(actionsOf(), { ...SAMPLE_GEAR, items: [] });
    expect(byName(p.root, 'button', 'Dismantle items')).toHaveLength(0);
  });
});

describe('the selection mode', () => {
  it('starts with Done, the presets and the bar counting what the server marked', () => {
    const p = draw(actionsOf());
    start(p);
    expect(byName(p.root, 'button', 'Done')).toHaveLength(1);
    expect(byName(p.root, 'button', 'All Common')).toHaveLength(1);
    expect(byName(p.root, 'button', 'Below level 10')).toHaveLength(1);
    expect(byName(p.root, 'button', 'Clear')).toHaveLength(1);
    expect(visibleText(bar(p))).toContain('1 marked');
    expect(byName(bar(p), 'button', 'Dismantle')).toHaveLength(1);
  });

  it('toggles a mark on a tap, at once, and opens no card', () => {
    const actions = actionsOf();
    const p = draw(actions);
    start(p);
    p.click(tile(p, 'kelp-cap'));
    expect(actions.mark).toHaveBeenCalledWith([kelp.id], true);
    expect(byRole(p.root, 'dialog')).toHaveLength(0);
    // Shown before the server answers.
    expect(byClass(tile(p, 'kelp-cap'), 'item-tile-mark')).toHaveLength(1);
    expect(tile(p, 'kelp-cap').getAttribute('aria-pressed')).toBe('true');
    expect(visibleText(bar(p))).toContain('2 marked');
    // And a tap on a marked one unmarks it.
    p.click(tile(p, 'thundercap'));
    expect(actions.mark).toHaveBeenCalledTimes(1);
    expect(byClass(tile(p, 'thundercap'), 'item-tile-mark')).toHaveLength(0);
    expect(visibleText(bar(p))).toContain('1 marked');
  });

  it('opens the card from the small info button, and stays in the mode', () => {
    const p = draw(actionsOf());
    start(p);
    p.click(infoOf(p, 'crossroads-compass'));
    const dialog = first(byRole(p.root, 'dialog'));
    expect(byClass(dialog, 'idc')).toHaveLength(1);
    expect(visibleText(dialog)).toContain('Crossroads Compass');
    expect(byName(dialog, 'button', 'Mark for dismantling')).toHaveLength(1);
    expect(byName(p.root, 'button', 'Done')).toHaveLength(1);
    // Nothing was marked by looking.
    expect(visibleText(bar(p))).toContain('1 marked');
  });

  it('marks what a preset matches, in one request, and leaves worn and marked items out', () => {
    const actions = actionsOf();
    const p = draw(actions);
    start(p);
    p.click(first(byName(p.root, 'button', 'All Common')));
    // The only free Common; the worn Commons are not eligible.
    expect(actions.mark).toHaveBeenCalledWith([kelp.id], true);
    expect(visibleText(bar(p))).toContain('2 marked');
    // "All Common" has nothing left to mark: greyed.
    expect(first(byName(p.root, 'button', 'All Common')).hasAttribute('disabled')).toBe(true);
  });

  it('"Below level 10" marks the free items under that item level, and "Clear" unmarks every marked one', () => {
    const actions = actionsOf();
    const p = draw(actions);
    start(p);
    p.click(first(byName(p.root, 'button', 'Below level 10')));
    expect(actions.mark).toHaveBeenCalledWith([kelp.id], true);
    expect(visibleText(bar(p))).toContain('2 marked');
    p.click(first(byName(p.root, 'button', 'Clear')));
    expect(visibleText(bar(p))).toContain('0 marked');
    expect(byClass(tile(p, 'thundercap'), 'item-tile-mark')).toHaveLength(0);
    expect(byName(bar(p), 'button', 'Dismantle')[0]?.hasAttribute('disabled')).toBe(true);
  });

  it('says why a worn item cannot be marked, asks the server nothing and keeps it dimmed', () => {
    const actions = actionsOf();
    const p = draw(actions);
    start(p);
    const t = tile(p, worn.baseId);
    expect(t.getAttribute('class')).toContain('blocked');
    p.click(t);
    expect(actions.mark).not.toHaveBeenCalled();
    expect(visibleText(bar(p))).toContain('Worn items cannot be marked');
    expect(visibleText(bar(p))).toContain('1 marked');
  });

  it('shows the server marks again when a request ends (a refused mark leaves the item as it was)', async () => {
    const actions = actionsOf({ mark: vi.fn(() => Promise.resolve(undefined)) });
    const p = draw(actions);
    start(p);
    p.click(tile(p, 'crossroads-compass'));
    await settle(p);
    expect(byClass(tile(p, 'crossroads-compass'), 'item-tile-mark')).toHaveLength(0);
    expect(visibleText(bar(p))).toContain('1 marked');
  });

  it('leaves the mode on Done, keeping the marks and showing their corners', () => {
    const p = draw(actionsOf());
    start(p);
    p.click(first(byName(p.root, 'button', 'Done')));
    expect(byClass(p.root, 'select-bar')).toHaveLength(0);
    expect(byName(p.root, 'button', 'Dismantle items')).toHaveLength(1);
    expect(byClass(tile(p, 'thundercap'), 'item-tile-mark')).toHaveLength(1);
  });
});

describe('dismantling from the bar', () => {
  it('opens who dismantles for exactly the marked items, and asks the question with the count', () => {
    const marked: GearState = {
      ...SAMPLE_GEAR,
      items: SAMPLE_GEAR.items.map((i) =>
        i.id === kelp.id || i.id === compass.id ? { ...i, markedForDismantle: true } : i,
      ),
    };
    const actions = actionsOf();
    const p = draw(actions, marked);
    start(p);
    expect(visibleText(bar(p))).toContain('3 marked');
    p.click(first(byName(bar(p), 'button', 'Dismantle')));
    const dialog = first(byRole(p.root, 'dialog'));
    expect(visibleText(dialog)).toContain('Who dismantles');
    // Next: the confirmation names what goes.
    p.click(first(byClass(dialog, 'send-button')));
    expect(visibleText(first(byClass(p.root, 'drill-head')))).toContain(
      'Dismantle 3 items (1 Common, 2 Rare)?',
    );
    const ids = vi.mocked(actions.previewDismantle).mock.calls[0]?.[1] as string[];
    expect([...ids].sort()).toEqual([kelp.id, compass.id, thundercap.id].sort());
  });

  it('dismantles on the confirmation, shows the one results screen and leaves the mode', async () => {
    const previewed: DismantlePreview = {
      kind: 'dismantle',
      creatureId: 'x',
      items: [],
      range: {
        scrap: { min: 1, max: 2 },
        shards: { min: 0, max: 0, element: null },
        glimmer: { min: 0, max: 0 },
        essence: { min: 0, max: 0 },
      },
      xp: 6,
      learnBp: null,
      teachers: 0,
      boosted: 0,
      tinkersLuckBp: 0,
    };
    const actions = actionsOf({ previewDismantle: vi.fn(() => Promise.resolve(previewed)) });
    const claimed = vi.fn();
    const p = draw(actions, SAMPLE_GEAR, claimed);
    start(p);
    p.click(first(byName(bar(p), 'button', 'Dismantle')));
    p.click(first(byClass(first(byRole(p.root, 'dialog')), 'send-button')));
    await settle(p);
    p.click(first(byClass(first(byRole(p.root, 'dialog')), 'send-button')));
    await settle(p);
    expect(actions.dismantlePile).toHaveBeenCalledTimes(1);
    const call = vi.mocked(actions.dismantlePile).mock.calls[0];
    expect(call?.[1]).toEqual([thundercap.id]);
    expect(claimed).toHaveBeenCalledWith(result);
    expect(byRole(p.root, 'dialog')).toHaveLength(0);
    expect(byClass(p.root, 'select-bar')).toHaveLength(0);
  });

  it('keeps the button off while no item is marked', () => {
    const p = draw(actionsOf());
    start(p);
    p.click(first(byName(p.root, 'button', 'Clear')));
    const button = first(byName(bar(p), 'button', 'Dismantle'));
    expect(button.hasAttribute('disabled')).toBe(true);
    p.click(button);
    expect(byRole(p.root, 'dialog')).toHaveLength(0);
  });
});
