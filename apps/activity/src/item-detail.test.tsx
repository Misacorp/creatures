import { content } from '@creatures/game';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Creature } from './api';
import { SAMPLE_GEAR, sampleCreature } from './creature-card-sample';
import { sampleItem } from './creature-page/bag-sample';
import { ItemDetail } from './ItemDetail';
import type { GearActions } from './gear-actions';
import type { DismantlePreview, GearItem } from './gear-types';
import {
  byClass,
  byName,
  byRole,
  createPage,
  visibleText,
  type FakeElement,
  type Page,
} from './test-dom';

/**
 * The Workshop item drawer's content (2026-10-18): the item card, an "Equip on" row that opens the creature
 * picker sheet (a pick equips right away, "Take off" is its first option for a worn item), Dismantle, and
 * Details. These tests draw the real `ItemDetail` over the fake DOM.
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
    dismissNotice: () => Promise.resolve(undefined),
    startJob: () => Promise.resolve(undefined),
    previewCraft: () => new Promise(() => undefined),
    previewDismantle: () => new Promise(() => undefined),
    claimJob: () => Promise.resolve(undefined),
    ...over,
  } as unknown as GearActions;
}

function draw(item: GearItem, actions: GearActions, busy = false): Page {
  page = createPage();
  page.draw(
    <ItemDetail
      item={item}
      gear={{ ...SAMPLE_GEAR, items: [item] }}
      creatures={ROSTER}
      busy={busy}
      actions={actions}
      onGone={() => undefined}
    />,
  );
  return page;
}

const trigger = (p: Page): FakeElement => first(byClass(p.root, 'equip-trigger'));
const options = (p: Page): FakeElement[] => byRole(p.root, 'option');
const optionOf = (p: Page, name: string): FakeElement =>
  first(options(p).filter((o) => visibleText(o).startsWith(name)));

describe('the item drawer content', () => {
  it('has the card, then the Equip on row, then Dismantle, then Details', () => {
    const p = draw(hat(), actionsOf());
    const text = visibleText(p.root);
    expect(text.indexOf('Trail Cap')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('Equip on')).toBeGreaterThan(text.indexOf('Trail Cap'));
    expect(text.indexOf('Dismantle')).toBeGreaterThan(text.indexOf('Equip on'));
    expect(text.indexOf('Details')).toBeGreaterThan(text.indexOf('Dismantle'));
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
    expect(trigger(p).getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger(p).getAttribute('aria-expanded')).toBe('false');
  });

  it("shows the wearer's name when the item is worn", () => {
    const p = draw(hat('mid'), actionsOf());
    expect(visibleText(trigger(p))).toBe('mid');
  });

  it('is switched off while an action is running', () => {
    const p = draw(hat(), actionsOf(), true);
    expect(trigger(p).hasAttribute('disabled')).toBe(true);
  });

  it('opens the creature picker sheet, in the pixel font, with who can wear it first and a reason for the rest', () => {
    const p = draw(hat(), actionsOf());
    p.click(trigger(p));
    expect(trigger(p).getAttribute('aria-expanded')).toBe('true');
    const sheet = first(byClass(p.root, 'roster-picker'));
    expect(sheet.getAttribute('class')).toContain('pix-panel');
    expect(visibleText(first(byClass(sheet, 'sheet-title')))).toBe('Equip on');
    expect(byClass(sheet, 'sheet-status')).toHaveLength(0);
    const names = options(p).map((o) => visibleText(o));
    expect(names.map((n) => n.split('Lv')[0])).toEqual(['high', 'mid', 'away', 'job', 'low']);
    expect(names[2]).toContain('Away on a trip');
    expect(names[3]).toContain('On a job');
    expect(names[4]).toContain('Needs level 5');
    expect(options(p).map((o) => o.getAttribute('aria-disabled'))).toEqual([
      'false',
      'false',
      'true',
      'true',
      'true',
    ]);
  });

  it('equips right away on a pick, with the item and the creature, and closes the sheet', () => {
    const actions = actionsOf();
    const p = draw(hat(), actions);
    p.click(trigger(p));
    p.click(optionOf(p, 'mid'));
    expect(actions.equip).toHaveBeenCalledWith('hat-1', 'mid');
    expect(byClass(p.root, 'roster-picker')).toHaveLength(0);
  });

  it('asks for nothing when a creature that cannot wear it is tapped, and the sheet stays', () => {
    const actions = actionsOf();
    const p = draw(hat(), actions);
    p.click(trigger(p));
    p.click(optionOf(p, 'low'));
    p.click(optionOf(p, 'away'));
    expect(actions.equip).not.toHaveBeenCalled();
    expect(byClass(p.root, 'roster-picker')).toHaveLength(1);
  });

  it('offers Take off first for a worn item, then the wearer, and Take off asks for it with no creature', () => {
    const actions = actionsOf();
    const p = draw(hat('mid'), actions);
    p.click(trigger(p));
    const names = options(p).map((o) => visibleText(o).split('Lv')[0]);
    expect(names.slice(0, 3)).toEqual(['Take off', 'mid', 'high']);
    expect(visibleText(options(p)[1] as FakeElement)).toContain('Wears it now');
    p.click(optionOf(p, 'Take off'));
    expect(actions.equip).toHaveBeenCalledWith('hat-1', null);
    expect(byClass(p.root, 'roster-picker')).toHaveLength(0);
  });

  it('picking the creature that wears it already changes nothing and just closes', () => {
    const actions = actionsOf();
    const p = draw(hat('mid'), actions);
    p.click(trigger(p));
    p.click(optionOf(p, 'mid'));
    expect(actions.equip).not.toHaveBeenCalled();
    expect(byClass(p.root, 'roster-picker')).toHaveLength(0);
  });

  it('freezes every option when the wearer is away (the server refuses to move the item)', () => {
    const p = draw(hat('away'), actionsOf());
    p.click(trigger(p));
    expect(options(p).filter((o) => o.getAttribute('aria-disabled') === 'false')).toHaveLength(1);
    expect(visibleText(optionOf(p, 'Take off'))).toContain('away is away on a trip');
  });

  it('closes on Escape without the key reaching the drawer behind it', () => {
    const behind = vi.fn();
    page = createPage();
    const item = hat();
    page.draw(
      <div onKeyDown={behind}>
        <ItemDetail
          item={item}
          gear={{ ...SAMPLE_GEAR, items: [item] }}
          creatures={ROSTER}
          busy={false}
          actions={actionsOf()}
          onGone={() => undefined}
        />
      </div>,
    );
    page.click(trigger(page));
    page.key(first(byClass(page.root, 'sheet')), 'Escape');
    expect(byClass(page.root, 'roster-picker')).toHaveLength(0);
    expect(behind).not.toHaveBeenCalled();
  });

  it('keeps Left, Right and Tab from reaching the drawer behind (it would flip the item or trap the focus twice)', () => {
    const behind = vi.fn();
    page = createPage();
    const item = hat();
    page.draw(
      <div onKeyDown={behind}>
        <ItemDetail
          item={item}
          gear={{ ...SAMPLE_GEAR, items: [item] }}
          creatures={ROSTER}
          busy={false}
          actions={actionsOf()}
          onGone={() => undefined}
        />
      </div>,
    );
    page.click(trigger(page));
    const sheet = first(byClass(page.root, 'sheet'));
    for (const key of ['ArrowLeft', 'ArrowRight', 'Tab']) page.key(sheet, key);
    expect(behind).not.toHaveBeenCalled();
  });
});

describe('the dismantle panel', () => {
  const preview = (item: GearItem): DismantlePreview => ({
    kind: 'dismantle',
    creatureId: 'high',
    items: [{ id: item.id, baseId: item.baseId, rarity: item.rarity, itemLevel: item.itemLevel }],
    range: {
      scrap: { min: 3, max: 4 },
      shards: { min: 1, max: 1, element: 'ember' },
      glimmer: { min: 0, max: 0 },
      essence: { min: 3, max: 8 },
    },
    durationMs: 51 * 60_000,
    xp: 10,
    learnBp: 700,
    teachers: 1,
  });

  function openPanel(): Page {
    const item = hat();
    const p = draw(item, actionsOf({ previewDismantle: () => Promise.resolve(preview(item)) }));
    p.click(first(byName(p.root, 'button', 'Dismantle')));
    return p;
  }

  it('is in the pixel font and, when it opens, is scrolled to its start with the focus on Keep it', () => {
    const p = openPanel();
    const panel = first(byClass(p.root, 'confirm'));
    expect(panel.getAttribute('class')).toContain('pix-panel');
    // Its start is shown (not the buttons at its end), once.
    expect(panel.scrolled).toBe(1);
    expect(first(byName(panel, 'button', /^Keep/)).focused).toBeGreaterThan(0);
  });

  it('shows what it gives as count badges with ranges, and the time as a badge, not as a sentence', async () => {
    const p = openPanel();
    await vi.waitFor(() => {
      expect(byClass(p.root, 'gives')).toHaveLength(1);
    });
    const gives = first(byClass(p.root, 'gives'));
    const badges = byClass(gives, 'part-count');
    expect(badges.map((b) => visibleText(b))).toEqual(['3–4', '1', '3–8', '51 min']);
    expect(visibleText(first(byClass(p.root, 'confirm')))).not.toMatch(/Gives|\bto 4\b/);
  });

  it('keeps the help line short and makes its quality wording a glossary tag', async () => {
    const p = openPanel();
    await vi.waitFor(() => {
      expect(byClass(p.root, 'gives')).toHaveLength(1);
    });
    const text = visibleText(first(byClass(p.root, 'confirm')));
    expect(text).toContain('7% per piece to learn its blueprint or raise its quality.');
    expect(text).not.toContain('thumbed');
  });
});
