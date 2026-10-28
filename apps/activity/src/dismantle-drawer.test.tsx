import { content } from '@creatures/game';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Creature } from './api';
import { SAMPLE_GEAR, sampleCreature } from './creature-card-sample';
import { sampleItem } from './creature-page/bag-sample';
import { DismantleDrawer } from './DismantleDrawer';
import type { DismantleCheck, DismantlePreview, GearItem } from './gear-types';
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
 * Dismantling the picked items (2026-10-27): a drawer from the bag with the shared wizard. A warning about worn items
 * first (when some are worn), then Who dismantles (free creatures first, busy ones greyed, no clock), then the
 * confirmation that names what goes and shows the server's numbers, with "Cannot be undone." above the gold
 * "Dismantle".
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

if (content.creatures.find((c) => c.role === 'guard') === undefined) {
  throw new Error('the content has no guard');
}

function creature(id: string, over: Partial<Creature> = {}): Creature {
  return { ...sampleCreature('growing'), id, nickname: id, gear: [], ...over };
}

const high = creature('high', { level: 12 });
const mid = creature('mid', { level: 8 });
const low = creature('low', { level: 3 });
const away = creature('away', { level: 20, away: true, busy: { kind: 'expedition', id: 'x' } });
const job = creature('job', { level: 20, busy: { kind: 'job', id: 'y' } });
const ROSTER = [low, away, mid, job, high];

/** A pile of 20 Commons and 3 Rares (23 items), as the example of the confirmation. */
function pileOf(): GearItem[] {
  return [
    ...Array.from({ length: 20 }, (_, i) =>
      sampleItem(`c${String(i)}`, 'trail-cap', 'common', 2, []),
    ),
    ...Array.from({ length: 3 }, (_, i) => sampleItem(`r${String(i)}`, 'kelp-cap', 'rare', 6, [])),
  ];
}

const preview = (
  items: readonly GearItem[],
  over: Partial<DismantlePreview> = {},
): DismantlePreview => ({
  kind: 'dismantle',
  creatureId: 'low',
  items: items.map((i) => ({
    id: i.id,
    baseId: i.baseId,
    rarity: i.rarity,
    itemLevel: i.itemLevel,
  })),
  range: {
    scrap: { min: 30, max: 44 },
    shards: { min: 3, max: 3, element: 'ember' },
    glimmer: { min: 0, max: 0 },
    essence: { min: 9, max: 24 },
  },
  xp: 30,
  learnBp: 700,
  teachers: 23,
  boosted: 0,
  tinkersLuckBp: 0,
  ...over,
});

interface Open {
  p: Page;
  items: GearItem[];
  loadPreview: ReturnType<typeof vi.fn>;
  checkLocks: ReturnType<typeof vi.fn>;
  onConfirm: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
}

function open(
  over: {
    loadPreview?: ReturnType<typeof vi.fn>;
    onConfirm?: ReturnType<typeof vi.fn>;
    error?: string | null;
    creatures?: readonly Creature[];
    previewOver?: Partial<DismantlePreview>;
    /** The pile (a pile of 23 free items by default). */
    pile?: GearItem[];
    locks?: DismantleCheck['locked'] | 'fails';
  } = {},
): Open {
  const items = over.pile ?? pileOf();
  const checkLocks = vi.fn(() =>
    over.locks === 'fails'
      ? Promise.reject(new Error('offline'))
      : Promise.resolve({ locked: over.locks ?? [] }),
  );
  const loadPreview =
    over.loadPreview ?? vi.fn(() => Promise.resolve(preview(items, over.previewOver)));
  const onConfirm = over.onConfirm ?? vi.fn(() => Promise.resolve(true));
  const onClose = vi.fn();
  page = createPage();
  page.draw(
    <DismantleDrawer
      items={items}
      gear={SAMPLE_GEAR}
      creatures={over.creatures ?? ROSTER}
      busy={false}
      error={over.error ?? null}
      loadPreview={loadPreview as never}
      checkLocks={checkLocks}
      onConfirm={onConfirm as never}
      onClose={onClose}
    />,
  );
  return { p: page, items, loadPreview, checkLocks, onConfirm, onClose };
}

const footer = (p: Page): FakeElement => first(byClass(p.root, 'send-button'));
const head = (p: Page): string => visibleText(first(byClass(p.root, 'drill-head')));
const rowsOf = (p: Page): string[] =>
  find(
    p.root,
    (e) => e.localName === 'label' && (e.getAttribute('class') ?? '').includes('roster-option'),
  ).map((e) => visibleText(e));
const radios = (p: Page): FakeElement[] =>
  find(p.root, (e) => e.localName === 'input' && e.getAttribute('type') === 'radio');
const settle = async (p: Page): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  p.update(() => undefined);
};

describe('the dismantle drawer', () => {
  it('opens as a drawer on Who dismantles, and asks the server nothing yet', () => {
    const { p, loadPreview } = open();
    expect(byRole(p.root, 'dialog')).toHaveLength(1);
    expect(head(p)).toContain('Who dismantles');
    expect(loadPreview).not.toHaveBeenCalled();
    expect(visibleText(footer(p))).toBe('Next');
  });

  it('lists who can do it first, then the busy ones greyed with their reason: no clock, no fold', () => {
    const { p } = open();
    const rows = rowsOf(p);
    expect(rows).toHaveLength(5);
    const names = rows.map((r) => /^(low|mid|high|away|job)/.exec(r)?.[1]);
    expect(names.slice(0, 3).sort()).toEqual(['high', 'low', 'mid']);
    expect(names.slice(3).sort()).toEqual(['away', 'job']);
    expect(rows[0]).not.toMatch(/\d+ ?(min|h)\b/);
    expect(rows[3]).toMatch(/On a job|Away on a trip/);
    expect(radios(p).filter((r) => r.hasAttribute('disabled'))).toHaveLength(2);
    expect(byClass(p.root, 'fold-row')).toHaveLength(0);
  });

  it('asks about every item of the pile and the first free creature on Next, and shows the numbers', async () => {
    const { p, items, loadPreview } = open();
    p.click(footer(p));
    // The question names what goes: the count, then how many of each rarity.
    expect(head(p)).toContain('Dismantle 23 items (20 Common, 3 Rare)?');
    expect(loadPreview).toHaveBeenCalledTimes(1);
    expect(loadPreview.mock.calls[0]?.[1]).toEqual(items.map((i) => i.id));
    expect(byClass(first(byClass(p.root, 'dismantle-items')), 'item-frame')).toHaveLength(23);
    expect(visibleText(p.root)).toContain('Loading...');
    expect(footer(p).hasAttribute('disabled')).toBe(true);
    await settle(p);
    const badges = byClass(first(byClass(p.root, 'gives')), 'part-count').map((b) =>
      visibleText(b),
    );
    expect(badges).toEqual(['30–44', '3', '9–24']);
    // The chosen creature, with its Crafting level and no time.
    const who = visibleText(first(byClass(p.root, 'job-ready-who')));
    expect(who).toContain('Crafting level');
    expect(who).not.toMatch(/min\b/);
    expect(visibleText(p.root)).toContain(
      '7% per piece to learn its blueprint or raise its quality.',
    );
    expect(visibleText(p.root)).toContain('Cannot be undone.');
    expect(visibleText(footer(p))).toBe('Dismantle');
    expect(footer(p).hasAttribute('disabled')).toBe(false);
  });

  it("says so when Tinker's luck or Market Day apply, and not when they do not", async () => {
    const plain = open();
    plain.p.click(footer(plain.p));
    await settle(plain.p);
    expect(visibleText(plain.p.root)).not.toContain('Market Day');
    expect(visibleText(plain.p.root)).not.toContain("Tinker's luck");
    plain.p.unmount();
    page = null;
    const lucky = open({ previewOver: { boosted: 2, tinkersLuckBp: 600 } });
    lucky.p.click(footer(lucky.p));
    await settle(lucky.p);
    expect(visibleText(lucky.p.root)).toContain('Market Day: the best 2 items roll the top');
    expect(visibleText(lucky.p.root)).toContain("Tinker's luck: 6%");
  });

  it('asks about the creature that was picked', () => {
    const { p, loadPreview } = open();
    const picked = radios(p).find((r) => r.value === 'mid');
    if (picked === undefined) throw new Error('no radio');
    p.event(picked, 'change');
    p.click(footer(p));
    expect(loadPreview.mock.calls[0]?.[0]).toBe('mid');
  });

  it('says so and keeps the button off when the preview fails', async () => {
    const { p, onConfirm } = open({ loadPreview: vi.fn(() => Promise.reject(new Error('x'))) });
    p.click(footer(p));
    await settle(p);
    expect(visibleText(p.root)).toContain('Could not load the refund');
    expect(footer(p).hasAttribute('disabled')).toBe(true);
    p.click(footer(p));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('puts the focus on Back, not the gold button, when the confirmation opens, and does nothing by itself', async () => {
    const { p, onConfirm, onClose } = open();
    p.click(footer(p));
    await settle(p);
    expect(first(byClass(p.root, 'drill-back')).focused).toBeGreaterThan(0);
    expect(footer(p).focused).toBe(0);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('dismantles with the picked creature on the tap of Dismantle', async () => {
    const { p, onConfirm } = open();
    p.click(footer(p));
    await settle(p);
    p.click(footer(p));
    await settle(p);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('low');
  });

  it("keeps the confirmation up and shows the server's error when the dismantle is refused", async () => {
    const { p, onConfirm } = open({
      onConfirm: vi.fn(() => Promise.resolve(false)),
      error: 'A creature that is away or busy still needs something it wears.',
    });
    p.click(footer(p));
    await settle(p);
    expect(byRole(p.root, 'alert')).toHaveLength(0);
    p.click(footer(p));
    await settle(p);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(head(p)).toContain('Dismantle 23 items');
    expect(visibleText(p.root)).toContain('A creature that is away or busy still needs');
  });

  it('goes Back from the confirmation to Who, and from Who closes the drawer, changing nothing', async () => {
    const { p, onConfirm, onClose } = open();
    p.click(footer(p));
    await settle(p);
    p.click(first(byName(p.root, 'button', /^‹ Back/)));
    expect(head(p)).toContain('Who dismantles');
    p.click(first(byName(p.root, 'button', /^‹ Back/)));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('goes back one step on Escape', async () => {
    const { p, onConfirm } = open();
    p.click(footer(p));
    await settle(p);
    p.key(footer(p), 'Escape');
    expect(head(p)).toContain('Who dismantles');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('says why when nobody is free, and Next stays off', () => {
    const { p } = open({ creatures: [away, job] });
    expect(visibleText(p.root)).toContain('Nobody is free to dismantle.');
    expect(footer(p).hasAttribute('disabled')).toBe(true);
  });

  it('puts the destructive action last: the reason above the gold button, in the pinned footer', async () => {
    const { p } = open();
    p.click(footer(p));
    await settle(p);
    const pinned = first(byClass(p.root, 'wizard-footer'));
    const text = visibleText(pinned);
    expect(text.indexOf('Cannot be undone.')).toBeLessThan(text.indexOf('Dismantle'));
    expect(visibleText(first(byClass(p.root, 'send-button')))).toBe('Dismantle');
  });
});

describe('the warning about worn items', () => {
  it('shows a creature that wears several of the pile once, with each item on the right', async () => {
    const two = [
      { ...sampleItem('w1', 'trail-cap', 'common', 2, []), equippedOn: 'mid' },
      { ...sampleItem('w2', 'kelp-cap', 'rare', 6, []), equippedOn: 'mid' },
    ];
    const { p } = open({ pile: two });
    await settle(p);
    const rows = byClass(first(byClass(p.root, 'worn-list')), 'roster-option');
    expect(rows).toHaveLength(1);
    expect(byClass(rows[0] as FakeElement, 'ro-worn')).toHaveLength(2);
  });

  /** Three items: two worn (by `mid` and `high`) and one free. */
  function wornPile(): GearItem[] {
    return [
      { ...sampleItem('w1', 'trail-cap', 'common', 2, []), equippedOn: 'mid' },
      { ...sampleItem('w2', 'kelp-cap', 'rare', 6, []), equippedOn: 'high' },
      sampleItem('f1', 'trail-cap', 'common', 2, []),
    ];
  }
  const text = (p: Page): string => visibleText(p.root);

  it('does not come up when nothing is worn: the drawer opens on Who', () => {
    const { p, checkLocks } = open();
    expect(head(p)).toContain('Who dismantles');
    expect(checkLocks).not.toHaveBeenCalled();
  });

  it('opens on the worn items when some are worn, listing each with who wears it, free ones left out', async () => {
    const { p, checkLocks } = open({ pile: wornPile() });
    await settle(p);
    expect(head(p)).toContain('Worn items');
    // The established creature row (the one of "Equip on"): one row per wearing creature, its item on the right.
    const rows = byClass(first(byClass(p.root, 'worn-list')), 'roster-option');
    expect(rows).toHaveLength(2);
    expect(visibleText(rows[0] as FakeElement)).toContain('mid');
    expect(visibleText(rows[1] as FakeElement)).toContain('high');
    for (const row of rows) {
      expect(byClass(row, 'ro-tags')).toHaveLength(1);
      expect(byClass(row, 'sprite').length).toBeGreaterThan(0);
    }
    const mine = byClass(rows[0] as FakeElement, 'ro-worn');
    expect(mine).toHaveLength(1);
    expect(mine[0]?.getAttribute('aria-label')).toContain('Wearing Trail Cap');
    expect(byClass(rows[1] as FakeElement, 'ro-worn')[0]?.getAttribute('aria-label')).toContain(
      'Wearing Kelp Cap',
    );
    expect(text(p)).not.toContain('f1');
    // The server is asked about the worn items only, and the words are "Dismantle anyway".
    expect(checkLocks).toHaveBeenCalledWith(['w1', 'w2']);
    expect(visibleText(footer(p))).toBe('Dismantle anyway');
    expect(footer(p).hasAttribute('disabled')).toBe(false);
  });

  it('goes on to Who on "Dismantle anyway" and asks about every item in the end, worn ones too', async () => {
    const items = wornPile();
    const { p, loadPreview, onClose } = open({ pile: items });
    await settle(p);
    p.click(footer(p));
    expect(head(p)).toContain('Who dismantles');
    p.click(footer(p));
    await settle(p);
    expect(loadPreview.mock.calls[0]?.[1]).toEqual(['w1', 'w2', 'f1']);
    // Back through the steps: the confirmation, Who, the warning, then out.
    p.click(first(byName(p.root, 'button', /^‹ Back/)));
    p.click(first(byName(p.root, 'button', /^‹ Back/)));
    expect(head(p)).toContain('Worn items');
    expect(onClose).not.toHaveBeenCalled();
    p.click(first(byName(p.root, 'button', /^‹ Back/)));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('holds back an item whose wearer is away on a trip or on a job, saying which, and keeps the button off', async () => {
    const { p } = open({
      pile: wornPile(),
      locks: [
        { itemId: 'w1', creatureId: 'mid', reason: 'trip' },
        { itemId: 'w2', creatureId: 'high', reason: 'job' },
      ],
    });
    await settle(p);
    expect(text(p)).toContain('Away on a trip');
    expect(text(p)).toContain('On a job');
    // The reason line sits in the creature's row.
    const rows = byClass(first(byClass(p.root, 'worn-list')), 'roster-option');
    expect(visibleText(rows[0] as FakeElement)).toContain('Away on a trip');
    expect(visibleText(rows[1] as FakeElement)).toContain('On a job');
    expect(footer(p).hasAttribute('disabled')).toBe(true);
    expect(text(p)).toContain('Go back and leave those out');
    p.click(footer(p));
    expect(head(p)).toContain('Worn items');
  });

  it('waits for the check before it lets the player on, and goes on when it cannot be answered', async () => {
    const waiting = open({ pile: wornPile() });
    expect(text(waiting.p)).toContain('Checking');
    expect(footer(waiting.p).hasAttribute('disabled')).toBe(true);
    waiting.p.unmount();
    page = null;
    const offline = open({ pile: wornPile(), locks: 'fails' });
    await settle(offline.p);
    expect(footer(offline.p).hasAttribute('disabled')).toBe(false);
  });
});
