import { content } from '@creatures/game';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Creature } from './api';
import { SAMPLE_GEAR, sampleCreature } from './creature-card-sample';
import { sampleItem } from './creature-page/bag-sample';
import { ItemDetail } from './ItemDetail';
import type { GearActions } from './gear-actions';
import type { DismantlePreview, GearItem, JobResult } from './gear-types';
import {
  byClass,
  byName,
  byRole,
  createPage,
  find,
  nameOf,
  visibleText,
  type FakeElement,
  type Page,
} from './test-dom';

/**
 * The Workshop item drawer's content (2026-10-18): the item card, an "Equip on" row that opens the creature
 * picker sheet (a pick equips right away, "Take off" is its first option for a worn item), Details, and last
 * the red "Dismantle" (2026-10-27: the same flow as dismantling from the bag, for this one item, inside the card).
 * These tests draw the real `ItemDetail` over the fake DOM.
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

const guard = content.creatures.find((c) => c.role === 'guard');
if (guard === undefined) throw new Error('the content has no guard');

function creature(id: string, over: Partial<Creature> = {}): Creature {
  return { ...sampleCreature('growing'), id, nickname: id, gear: [], ...over };
}

const high = creature('high', { level: 12 });
const mid = creature('mid', { level: 8 });
const low = creature('low', { level: 3 });
const away = creature('away', { level: 20, away: true, busy: { kind: 'expedition', id: 'x' } });
const job = creature('job', { level: 20, busy: { kind: 'job', id: 'y' } });
const ROSTER = [low, away, mid, job, high];

/** A Hat of item level 5 (anyone of level 5 and up can wear it). */
function hat(equippedOn: string | null = null): GearItem {
  return { ...sampleItem('hat-1', 'trail-cap', 'common', 5, []), equippedOn };
}

function actionsOf(over: Partial<GearActions> = {}): GearActions {
  return {
    equip: vi.fn(() => Promise.resolve(undefined)),
    equipBest: () => Promise.resolve(undefined),
    checkDismantle: () => Promise.resolve({ locked: [] }),
    dismantlePile: () => Promise.resolve(undefined),
    dismissNotice: () => Promise.resolve(undefined),
    startJob: () => Promise.resolve(undefined),
    previewCraft: () => new Promise(() => undefined),
    previewDismantle: () => new Promise(() => undefined),
    claimJob: () => Promise.resolve(undefined),
    ...over,
  } as unknown as GearActions;
}

function draw(
  item: GearItem,
  actions: GearActions,
  busy = false,
  creatures: readonly Creature[] = ROSTER,
  dismantle: { onDone: (result: JobResult) => void } | null = null,
): Page {
  page = createPage();
  page.draw(
    <ItemDetail
      item={item}
      creatures={creatures}
      busy={busy}
      actions={actions}
      {...(dismantle === null
        ? {}
        : { dismantle: { gear: SAMPLE_GEAR, error: null, onDone: dismantle.onDone } })}
    />,
  );
  return page;
}

const trigger = (p: Page): FakeElement => first(byClass(p.root, 'equip-trigger'));
const options = (p: Page): FakeElement[] => byRole(p.root, 'option');
const optionOf = (p: Page, name: string): FakeElement =>
  first(options(p).filter((o) => visibleText(o).startsWith(name)));

describe('the item drawer content', () => {
  it('has the card, then the Equip on row, then Details, then the Dismantle action last', () => {
    const p = draw(hat(), actionsOf(), false, ROSTER, { onDone: () => undefined });
    const text = visibleText(p.root);
    expect(text.indexOf('Trail Cap')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('Equip on')).toBeGreaterThan(text.indexOf('Trail Cap'));
    expect(text.indexOf('Details')).toBeGreaterThan(text.indexOf('Equip on'));
    expect(text.indexOf('Dismantle')).toBeGreaterThan(text.indexOf('Details'));
    // The action is the last block of the section, in a row of its own (centred apart by the stylesheet), and red.
    const section = first(byClass(p.root, 'item-detail'));
    const last = section.childNodes[section.childNodes.length - 1] as FakeElement;
    expect(last.getAttribute('class')).toBe('item-actions');
    const button = first(byName(last, 'button', 'Dismantle'));
    expect(button.getAttribute('class')).toContain('danger');
    // No marks any more: nothing says "Mark" or "Marked" on the card.
    expect(text).not.toContain('Mark for dismantling');
    expect(text).not.toContain('Marked');
  });

  it('has no "Needs level" line, and none of the old Equip, Take off or Give to another buttons', () => {
    const p = draw(hat('mid'), actionsOf());
    expect(visibleText(p.root)).not.toContain('Needs level');
    for (const name of ['Equip', 'Take off', 'Give to another', 'Cancel']) {
      expect(byName(p.root, 'button', name), name).toHaveLength(0);
    }
    expect(visibleText(p.root)).not.toContain('Worn by');
  });

  it('sets the pixel font once, on the section (and the long Details text opts out)', () => {
    const p = draw(hat(), actionsOf());
    const section = first(byClass(p.root, 'item-detail'));
    expect(section.getAttribute('class')).toContain('pix-panel');
    expect(first(byClass(p.root, 'idc')).getAttribute('class')).toContain('pix-panel');
    expect(first(byClass(p.root, 'item-details')).getAttribute('class')).toContain('prose');
  });
});

describe('the Equip on row', () => {
  it('says "Choose a creature" when nobody wears the item, and acts like a dropdown', () => {
    const p = draw(hat(), actionsOf());
    expect(visibleText(trigger(p))).toBe('Choose a creature');
    expect(trigger(p).localName).toBe('button');
  });

  it("shows the wearer's name when the item is worn", () => {
    const p = draw(hat('mid'), actionsOf());
    expect(visibleText(trigger(p))).toBe('mid');
  });

  it('is switched off while an action is running', () => {
    const p = draw(hat(), actionsOf(), true);
    expect(trigger(p).hasAttribute('disabled')).toBe(true);
  });

  it("opens the creature list in the drawer itself, in the item's place, never as a sheet over it", () => {
    const p = draw(hat(), actionsOf());
    p.click(trigger(p));
    const view = first(byClass(p.root, 'equip-view'));
    expect(view.getAttribute('class')).toContain('pix-panel');
    expect(byClass(p.root, 'sheet-layer')).toHaveLength(0);
    expect(byRole(p.root, 'dialog')).toHaveLength(0);
    // The item card and its buttons are gone from view; Back is at the top left, then the list.
    expect(byClass(p.root, 'idc')).toHaveLength(0);
    expect(byClass(p.root, 'equip-trigger')).toHaveLength(0);
    const head = first(byClass(view, 'drill-head'));
    expect(visibleText(head)).toContain('‹ Back');
    expect(visibleText(head)).toContain('Equip on');
    expect(head.childNodes[0] && (head.childNodes[0] as FakeElement).localName).toBe('button');
    expect(first(byRole(view, 'listbox')).getAttribute('aria-label')).toBe('Your creatures');
  });

  it('lists who can wear it first (highest level first), then who cannot, each with a reason', () => {
    const p = draw(hat(), actionsOf());
    p.click(trigger(p));
    const names = options(p).map((o) => visibleText(o));
    expect(names.map((n) => n.split('Lv')[0]?.replace(/, \w+$/, ''))).toEqual([
      'high',
      'mid',
      'away',
      'job',
      'low',
    ]);
    expect(names[2]).toContain('Away on a trip');
    expect(names[3]).toContain('On a job');
    // Busy reasons are the card's status badges; no Recommended tag in this list.
    const opts = options(p);
    expect(byClass(opts[2] as FakeElement, 'badge').map((b) => b.getAttribute('class'))).toEqual([
      expect.stringContaining('away'),
    ]);
    expect(byClass(opts[3] as FakeElement, 'badge').map((b) => b.getAttribute('class'))).toEqual([
      expect.stringContaining('busy'),
    ]);
    expect(byClass(opts[4] as FakeElement, 'badge')).toHaveLength(0);
    expect(byClass(p.root, 'ro-recommended')).toHaveLength(0);
    expect(names[4]).toContain('Needs level 5');
    expect(options(p).map((o) => o.getAttribute('aria-disabled'))).toEqual([
      'false',
      'false',
      'true',
      'true',
      'true',
    ]);
  });

  it('shows what a creature already wears in the slot as a tile at the right of its row, and nothing for an empty slot', () => {
    const worn = (
      id: string,
      slot: 'hat' | 'scarf',
      baseId: string,
      rarity: 'common' | 'rare',
    ) => ({
      id,
      baseId,
      slot,
      rarity,
      itemLevel: 9,
    });
    const wearing = [
      {
        ...high,
        gear: [worn('w1', 'hat', 'trail-cap', 'rare'), worn('w2', 'scarf', 'trail-cap', 'common')],
      },
      { ...mid, gear: [worn('w3', 'scarf', 'trail-cap', 'common')] },
      low,
      away,
      job,
    ];
    const p = draw(hat(), actionsOf(), false, wearing);
    p.click(trigger(p));
    const tiles = (o: FakeElement): FakeElement[] => byClass(o, 'ro-worn');
    // High wears a Hat: one tile, last in the row, spoken as "Wearing ...". Its Scarf is a different slot.
    const highRow = optionOf(p, 'high');
    const [tile] = tiles(highRow);
    expect(tiles(highRow)).toHaveLength(1);
    expect(tile?.getAttribute('aria-label')).toBe('Wearing Trail Cap, item level 9, Rare');
    expect((highRow.childNodes as FakeElement[]).at(-1)).toBe(tile);
    // Mid wears only a Scarf, so its Hat slot is empty: nothing is drawn.
    expect(tiles(optionOf(p, 'mid'))).toHaveLength(0);
    expect(tiles(optionOf(p, 'low'))).toHaveLength(0);
  });

  it('keeps the reason beside the tile for a creature that cannot take the item', () => {
    const busyWearer = {
      ...away,
      gear: [
        {
          id: 'w9',
          baseId: 'trail-cap',
          slot: 'hat' as const,
          rarity: 'common' as const,
          itemLevel: 4,
        },
      ],
    };
    const p = draw(hat(), actionsOf(), false, [high, busyWearer]);
    p.click(trigger(p));
    const row = optionOf(p, 'away');
    expect(visibleText(row)).toContain('Away on a trip');
    expect(byClass(row, 'ro-worn')).toHaveLength(1);
  });

  it('shows the item itself on the creature that wears it now, next to "Wears it now"', () => {
    const wearer = {
      ...mid,
      gear: [
        {
          id: 'hat-1',
          baseId: 'trail-cap',
          slot: 'hat' as const,
          rarity: 'common' as const,
          itemLevel: 5,
        },
      ],
    };
    const p = draw(hat('mid'), actionsOf(), false, [high, wearer]);
    p.click(trigger(p));
    const row = optionOf(p, 'mid');
    expect(visibleText(row)).toContain('Wears it now');
    expect(first(byClass(row, 'ro-worn')).getAttribute('aria-label')).toContain(
      'Wearing Trail Cap',
    );
  });

  it('equips right away on a pick, with the item and the creature, and returns to the item', () => {
    const actions = actionsOf();
    const p = draw(hat(), actions);
    p.click(trigger(p));
    p.click(optionOf(p, 'mid'));
    expect(actions.equip).toHaveBeenCalledWith('hat-1', 'mid');
    expect(byClass(p.root, 'equip-view')).toHaveLength(0);
    expect(byClass(p.root, 'idc')).toHaveLength(1);
  });

  it('asks for nothing when a creature that cannot wear it is tapped, and the list stays', () => {
    const actions = actionsOf();
    const p = draw(hat(), actions);
    p.click(trigger(p));
    p.click(optionOf(p, 'low'));
    p.click(optionOf(p, 'away'));
    expect(actions.equip).not.toHaveBeenCalled();
    expect(byClass(p.root, 'equip-view')).toHaveLength(1);
  });

  it('offers Take off first for a worn item, then the wearer, and Take off asks for it with no creature', () => {
    const actions = actionsOf();
    const p = draw(hat('mid'), actions);
    p.click(trigger(p));
    const names = options(p).map((o) =>
      visibleText(o)
        .split('Lv')[0]
        ?.replace(/, \w+$/, ''),
    );
    expect(names.slice(0, 3)).toEqual(['Take off', 'mid', 'high']);
    expect(visibleText(options(p)[1] as FakeElement)).toContain('Wears it now');
    p.click(optionOf(p, 'Take off'));
    expect(actions.equip).toHaveBeenCalledWith('hat-1', null);
    expect(byClass(p.root, 'equip-view')).toHaveLength(0);
  });

  it('picking the creature that wears it already changes nothing and returns', () => {
    const actions = actionsOf();
    const p = draw(hat('mid'), actions);
    p.click(trigger(p));
    p.click(optionOf(p, 'mid'));
    expect(actions.equip).not.toHaveBeenCalled();
    expect(byClass(p.root, 'equip-view')).toHaveLength(0);
  });

  it('freezes every option when the wearer is away (the server refuses to move the item)', () => {
    const p = draw(hat('away'), actionsOf());
    p.click(trigger(p));
    expect(options(p).filter((o) => o.getAttribute('aria-disabled') === 'false')).toHaveLength(1);
    expect(visibleText(optionOf(p, 'Take off'))).toContain('away is away on a trip');
  });

  it('goes back to the item with the Back button, changing nothing', () => {
    const actions = actionsOf();
    const p = draw(hat(), actions);
    p.click(trigger(p));
    p.click(first(byName(p.root, 'button', /^‹ Back/)));
    expect(byClass(p.root, 'equip-view')).toHaveLength(0);
    expect(byClass(p.root, 'idc')).toHaveLength(1);
    expect(actions.equip).not.toHaveBeenCalled();
    // The focus is back on the row that opened it.
    expect(trigger(p).focused).toBeGreaterThan(0);
  });

  it('goes back on Escape, and the key does not reach the drawer behind it (it would close)', () => {
    const behind = vi.fn();
    page = createPage();
    const item = hat();
    page.draw(
      <div onKeyDown={behind}>
        <ItemDetail item={item} creatures={ROSTER} busy={false} actions={actionsOf()} />
      </div>,
    );
    page.click(trigger(page));
    page.key(first(byClass(page.root, 'equip-view')), 'Escape');
    expect(byClass(page.root, 'equip-view')).toHaveLength(0);
    expect(byClass(page.root, 'idc')).toHaveLength(1);
    expect(behind).not.toHaveBeenCalled();
  });

  it('keeps Left and Right from reaching the drawer behind it (they would flip the item) and is no swipe area', () => {
    const behind = vi.fn();
    page = createPage();
    const item = hat();
    page.draw(
      <div onKeyDown={behind}>
        <ItemDetail item={item} creatures={ROSTER} busy={false} actions={actionsOf()} />
      </div>,
    );
    page.click(trigger(page));
    const view = first(byClass(page.root, 'equip-view'));
    for (const key of ['ArrowLeft', 'ArrowRight']) page.key(view, key);
    expect(behind).not.toHaveBeenCalled();
    expect(view.getAttribute('data-no-flip')).toBe('');
  });

  it('tells the drawer while the list is shown, and when it is gone', () => {
    const told: boolean[] = [];
    page = createPage();
    const item = hat();
    page.draw(
      <ItemDetail
        item={item}
        creatures={ROSTER}
        busy={false}
        actions={actionsOf()}
        onDrill={(open) => told.push(open)}
      />,
    );
    page.click(trigger(page));
    page.click(first(byName(page.root, 'button', /^‹ Back/)));
    expect(told).toEqual([false, true, false]);
  });
});

describe('dismantling one item from its card', () => {
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

  const previewOf = (id: string): DismantlePreview => ({
    kind: 'dismantle',
    creatureId: 'low',
    items: [{ id, baseId: 'trail-cap', rarity: 'common', itemLevel: 5 }],
    range: {
      scrap: { min: 2, max: 4 },
      shards: { min: 0, max: 0, element: null },
      glimmer: { min: 0, max: 0 },
      essence: { min: 0, max: 0 },
    },
    xp: 6,
    learnBp: 700,
    teachers: 1,
    boosted: 0,
    tinkersLuckBp: 0,
  });

  function flowActions(over: Partial<GearActions> = {}): GearActions {
    return actionsOf({
      previewDismantle: vi.fn((_c: string, ids: readonly string[]) =>
        Promise.resolve(previewOf(ids[0] ?? '')),
      ),
      dismantlePile: vi.fn(() => Promise.resolve(result)),
      ...over,
    } as Partial<GearActions>);
  }

  const settle = async (p: Page): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    p.update(() => undefined);
  };
  const dismantleButton = (p: Page): FakeElement =>
    first(
      find(
        p.root,
        (e) =>
          e.localName === 'button' &&
          nameOf(e) === 'Dismantle' &&
          (e.getAttribute('class') ?? '').includes('danger'),
      ),
    );
  const footer = (p: Page): FakeElement => first(byClass(p.root, 'send-button'));
  const head = (p: Page): string => visibleText(first(byClass(p.root, 'drill-head')));

  it('has no button on a plain card (the workbench), and nothing is marked or unmarked', () => {
    const p = draw(hat(), actionsOf());
    expect(byName(p.root, 'button', 'Dismantle')).toHaveLength(0);
    expect(byClass(p.root, 'item-actions')).toHaveLength(0);
  });

  it('is switched off while an action is running, and on for a worn item too', () => {
    const busy = draw(hat(), actionsOf(), true, ROSTER, { onDone: () => undefined });
    expect(dismantleButton(busy).hasAttribute('disabled')).toBe(true);
    busy.unmount();
    page = null;
    const worn = draw(hat('mid'), actionsOf(), false, ROSTER, { onDone: () => undefined });
    expect(dismantleButton(worn).hasAttribute('disabled')).toBe(false);
  });

  it('opens the flow inside the card on Who dismantles for a free item, and Back returns to the card', () => {
    const p = draw(hat(), flowActions(), false, ROSTER, { onDone: () => undefined });
    p.click(dismantleButton(p));
    // A view of the same drawer: no second drawer, and the card is not drawn behind it.
    expect(byRole(p.root, 'dialog')).toHaveLength(0);
    expect(byClass(p.root, 'dismantle-inline')).toHaveLength(1);
    expect(byClass(p.root, 'idc')).toHaveLength(0);
    expect(head(p)).toContain('Who dismantles');
    p.click(first(byName(p.root, 'button', /^‹ Back/)));
    expect(byClass(p.root, 'dismantle-inline')).toHaveLength(0);
    expect(byClass(p.root, 'idc')).toHaveLength(1);
    // The focus is back on the Dismantle button.
    expect(dismantleButton(p).focused).toBeGreaterThan(0);
  });

  it('asks the worn item first: who wears it, then Dismantle anyway goes on to Who', async () => {
    const checkDismantle = vi.fn(() => Promise.resolve({ locked: [] }));
    const p = draw(hat('mid'), flowActions({ checkDismantle }), false, ROSTER, {
      onDone: () => undefined,
    });
    p.click(dismantleButton(p));
    await settle(p);
    expect(head(p)).toContain('Worn items');
    expect(visibleText(p.root)).toContain('mid');
    expect(visibleText(footer(p))).toBe('Dismantle anyway');
    expect(checkDismantle).toHaveBeenCalledWith(['hat-1']);
    p.click(footer(p));
    expect(head(p)).toContain('Who dismantles');
    // Back from Who returns to the warning, and from the warning to the card.
    p.click(first(byName(p.root, 'button', /^‹ Back/)));
    expect(head(p)).toContain('Worn items');
    p.click(first(byName(p.root, 'button', /^‹ Back/)));
    expect(byClass(p.root, 'idc')).toHaveLength(1);
  });

  it('holds a worn item back when its wearer is away and needs it, and says so', async () => {
    const checkDismantle = vi.fn(() =>
      Promise.resolve({
        locked: [{ itemId: 'hat-1', creatureId: 'away', reason: 'trip' as const }],
      }),
    );
    const p = draw(hat('away'), flowActions({ checkDismantle }), false, ROSTER, {
      onDone: () => undefined,
    });
    p.click(dismantleButton(p));
    await settle(p);
    expect(visibleText(p.root)).toContain('Away on a trip');
    expect(footer(p).hasAttribute('disabled')).toBe(true);
    p.click(footer(p));
    expect(head(p)).toContain('Worn items');
  });

  it('lets a worn item through when the check cannot be answered (the server decides again)', async () => {
    const checkDismantle = vi.fn(() => Promise.reject(new Error('offline')));
    const p = draw(hat('mid'), flowActions({ checkDismantle }), false, ROSTER, {
      onDone: () => undefined,
    });
    p.click(dismantleButton(p));
    await settle(p);
    expect(footer(p).hasAttribute('disabled')).toBe(false);
  });

  it('runs the whole flow for one item: who, the confirmation, the dismantle, then the results', async () => {
    const onDone = vi.fn();
    const actions = flowActions();
    const p = draw(hat(), actions, false, ROSTER, { onDone });
    p.click(dismantleButton(p));
    p.click(footer(p));
    await settle(p);
    expect(head(p)).toContain('Dismantle Trail Cap?');
    expect(actions.previewDismantle).toHaveBeenCalledWith('low', ['hat-1']);
    expect(visibleText(p.root)).toContain('Cannot be undone.');
    p.click(footer(p));
    await settle(p);
    expect(actions.dismantlePile).toHaveBeenCalledWith('low', ['hat-1']);
    expect(onDone).toHaveBeenCalledWith(result);
  });

  it('goes back one step on Escape without the key reaching the drawer behind, and keeps Left and Right from flipping', async () => {
    const behind = vi.fn();
    page = createPage();
    page.draw(
      <div onKeyDown={behind}>
        <ItemDetail
          item={hat()}
          creatures={ROSTER}
          busy={false}
          actions={flowActions()}
          dismantle={{ gear: SAMPLE_GEAR, error: null, onDone: () => undefined }}
        />
      </div>,
    );
    page.click(dismantleButton(page));
    page.click(footer(page));
    await settle(page);
    const view = first(byClass(page.root, 'dismantle-inline'));
    expect(view.getAttribute('data-no-flip')).toBe('');
    for (const key of ['ArrowLeft', 'ArrowRight']) page.key(view, key);
    page.key(footer(page), 'Escape');
    expect(head(page)).toContain('Who dismantles');
    expect(behind).not.toHaveBeenCalled();
  });

  it('tells the drawer while the flow is shown, so it stops flipping, and when it is gone', () => {
    const told: boolean[] = [];
    page = createPage();
    page.draw(
      <ItemDetail
        item={hat()}
        creatures={ROSTER}
        busy={false}
        actions={flowActions()}
        onDrill={(open) => told.push(open)}
        dismantle={{ gear: SAMPLE_GEAR, error: null, onDone: () => undefined }}
      />,
    );
    page.click(dismantleButton(page));
    page.click(first(byName(page.root, 'button', /^‹ Back/)));
    expect(told).toEqual([false, true, false]);
  });
});
