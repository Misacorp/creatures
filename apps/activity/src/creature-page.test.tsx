import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Creature, GameState } from './api';
import { CreaturePage, startingDrawer, type CardActions } from './CreaturePage';
import { SAMPLE_STATE } from './creature-card-sample';
import { cardDomId, type PageFocus } from './creature-card-view';
import { pageScene, type SceneKind } from './creature-page/sample';
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

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

function actionsWith(overrides: Partial<CardActions> = {}): CardActions {
  return {
    onEquip: vi.fn(() => Promise.resolve(true)),
    onRibbon: vi.fn(),
    onEvolve: vi.fn(),
    onRename: vi.fn(),
    onLounge: vi.fn(),
    onSlotTalent: vi.fn(),
    ...overrides,
  };
}

interface Drawn {
  page: Page;
  root: FakeElement;
  actions: CardActions;
  creature: Creature;
  onBack: ReturnType<typeof vi.fn>;
  onAnswerCatch: ReturnType<typeof vi.fn>;
}

/** Draws one sample creature's page (the real component, wired as the Creatures tab wires it). */
function draw(
  kind: SceneKind,
  options: {
    focus?: PageFocus;
    bait?: number;
    loungerId?: string | null;
    busy?: boolean;
    gearLoaded?: boolean;
    pending?: boolean;
    change?: (creature: Creature) => Creature;
    actions?: Partial<CardActions>;
  } = {},
): Drawn {
  page = createPage();
  const scene = pageScene(kind, { bait: options.bait ?? 100 });
  const creature = options.change === undefined ? scene.creature : options.change(scene.creature);
  const actions = actionsWith(options.actions);
  const onBack = vi.fn();
  const onAnswerCatch = vi.fn();
  const pendingCard = SAMPLE_STATE.pending[0];
  const base: GameState = {
    ...scene.state,
    creatures: [creature, ...scene.state.creatures.slice(1)],
    loungerId: options.loungerId ?? null,
  };
  const state: GameState = {
    ...base,
    pending:
      options.pending === true && pendingCard !== undefined
        ? [
            {
              ...pendingCard,
              offered: { ...pendingCard.offered, teach: [creature.id], fuse: [creature.id] },
            },
          ]
        : base.pending,
  };
  page.draw(
    <CreaturePage
      creature={creature}
      state={state}
      gear={options.gearLoaded === false ? null : scene.gear}
      busy={options.busy ?? false}
      actions={actions}
      focus={options.focus ?? null}
      onBack={onBack}
      onAnswerCatch={onAnswerCatch}
    />,
  );
  const root = find(
    page.root,
    (el) => el.getAttribute('id') === `${cardDomId(creature.id)}-page`,
  )[0];
  if (root === undefined) throw new Error('the page was not drawn');
  return { page, root, actions, creature, onBack, onAnswerCatch };
}

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

function slotButton(root: FakeElement, name: RegExp): FakeElement {
  return first(find(root, (e) => e.localName === 'button' && name.test(nameOf(e))));
}

function headings(root: FakeElement): string[] {
  return byClass(root, 'cp-title').map((h) => visibleText(h));
}

describe('the creature page: top row and back', () => {
  it('has back at the top left and Lounge at the top right of the same row', () => {
    const { root, page: p, onBack, actions, creature } = draw('level 15');
    const top = first(byClass(root, 'cp-top'));
    expect(root.childNodes[0]).toBe(top);
    const buttons = find(top, (e) => e.localName === 'button');
    expect(buttons.map((b) => visibleText(b))).toEqual(['‹ Creatures', 'Lounge']);
    p.click(first(buttons));
    expect(onBack).toHaveBeenCalledTimes(1);
    p.click(buttons[1] as FakeElement);
    expect(actions.onLounge).toHaveBeenCalledWith(creature);
  });

  it('has no Lounge button for the lounger or a creature that is busy', () => {
    const creature = pageScene('level 15').creature;
    const already = draw('level 15', { loungerId: creature.id });
    expect(byName(already.root, 'button', 'Lounge')).toHaveLength(0);
    page?.unmount();
    const busy = draw('level 15', {
      change: (c) => ({ ...c, busy: { kind: 'job', id: 'job-1' } }),
    });
    expect(byName(busy.root, 'button', 'Lounge')).toHaveLength(0);
  });

  it('goes back on Escape, but not from a text field or after a drawer took it', () => {
    const { root, page: p, onBack } = draw('level 15');
    p.key(root, 'Enter');
    expect(onBack).not.toHaveBeenCalled();
    p.key(root, 'Escape');
    expect(onBack).toHaveBeenCalledTimes(1);

    // Escape in the Rename field belongs to the field.
    p.key(first(find(root, (e) => e.localName === 'input')), 'Escape');
    expect(onBack).toHaveBeenCalledTimes(1);

    // Escape inside an open drawer closes the drawer only.
    p.click(slotButton(root, /^Hat: /));
    const dialog = first(byRole(root, 'dialog'));
    p.key(dialog, 'Escape');
    expect(byRole(root, 'dialog')).toHaveLength(0);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('is named by the creature and takes the focus when it opens at the top', () => {
    const { root } = draw('level 15');
    expect(root.getAttribute('aria-labelledby')).toBe(`${root.getAttribute('id') ?? ''}-name`);
    expect(nameOf(first(find(root, (e) => e.localName === 'h2')))).toBe('Cindle, common');
    expect(root.focused).toBe(1);
  });
});

describe('the creature page: the head and tags', () => {
  it('shows the species name as a tag only when a nickname differs from it', () => {
    const plain = draw('level 15');
    const tags = first(byClass(plain.root, 'cc-tags'));
    expect(visibleText(tags)).not.toContain('Cindle');
    page?.unmount();

    const named = draw('nickname');
    expect(visibleText(first(find(named.root, (e) => e.localName === 'h2')))).toBe(
      'Sparky, common',
    );
    expect(visibleText(first(byClass(named.root, 'cc-tags')))).toContain('Cindle');
    // The head holds the name and the tags, not the level (the level is on the bar under it).
    expect(visibleText(first(byClass(named.root, 'cc-head')))).not.toContain('Lv');
    page?.unmount();

    // A nickname equal to the species name (any case) adds no tag.
    const same = draw('level 15', { change: (c) => ({ ...c, nickname: 'cindle' }) });
    expect(byClass(first(byClass(same.root, 'cc-tags')), 'tag')).toHaveLength(0);
  });

  it('has no rarity tag and no portrait border; the name is in the rarity colour and the rarity is spoken', () => {
    const { root } = draw('level 15');
    const tags = visibleText(first(byClass(root, 'cc-tags')));
    expect(tags).not.toMatch(/Common|Rare|Epic/);
    const portrait = first(byClass(root, 'portrait'));
    expect(portrait.getAttribute('class')).not.toContain('rarity-');
    const sprite = first(find(portrait, (e) => e.localName === 'canvas'));
    expect(sprite.getAttribute('aria-label') ?? sprite.getAttribute('alt')).toBe('Cindle');
    const name = first(find(root, (e) => e.localName === 'h2'));
    const classes = (name.getAttribute('class') ?? '').split(' ');
    expect(classes).toContain('rarity-name');
    expect(classes).toContain('rarity-common');
    // The word is in the page for screen readers, drawn off screen.
    const word = first(byClass(name, 'visually-hidden'));
    expect(word.textContent).toBe(', common');
  });

  it('puts an armchair before the Lounge button words', () => {
    const { root } = draw('level 15');
    const button = first(byClass(root, 'lounge-button'));
    expect(visibleText(button)).toBe('Lounge');
    expect(byClass(button, 'armchair-icon')).toHaveLength(1);
    expect(first(byClass(button, 'armchair-icon')).getAttribute('aria-hidden')).toBe('true');
  });

  it('draws the level tag on the experience row, in the pixel font with no "?" mark, as the card does', () => {
    const { root } = draw('level 15');
    const [track] = byClass(root, 'xp-static');
    expect(track).toBeDefined();
    const [level, bar] = (track as FakeElement).childNodes as FakeElement[];
    const classes = (level?.getAttribute('class') ?? '').split(' ');
    expect(classes).toContain('xp-lv');
    expect(classes).toContain('pix');
    expect(visibleText(level as FakeElement)).toBe('Lv 15');
    expect(bar?.getAttribute('role')).toBe('progressbar');
    expect(bar?.getAttribute('aria-label')).toBe('Experience: 310 / 825 towards level 16');
    // The page's old thick bar and its own level badge are gone.
    expect(byClass(root, 'xpbar')).toHaveLength(0);
    expect(byClass(root, 'v3-level')).toHaveLength(0);
  });

  it('reads like the card: the portrait, the name, the tags, then the level and bar, then the buttons', () => {
    const { root } = draw('evolve ready');
    const head = first(byClass(root, 'cp-head'));
    const parts = head.childNodes as FakeElement[];
    expect(parts.map((p) => p.getAttribute('class')?.split(' ')[0])).toEqual([
      'cc-head',
      'xp-static',
    ]);
    const top = first(byClass(head, 'cc-head'));
    expect(byClass(top, 'portrait')).toHaveLength(1);
    expect(byClass(top, 'cc-name')).toHaveLength(1);
    expect(byClass(top, 'cc-tags')).toHaveLength(1);
    // The buttons for what is ready follow the head, in the same block.
    const block = head.parentNode as FakeElement;
    expect(byClass(block, 'cp-actions')).toHaveLength(1);
  });

  it('draws names as text, never as markup', () => {
    const { root } = draw('level 15', {
      change: (c) => ({ ...c, nickname: '<img src=x onerror=alert(1)>' }),
    });
    expect(find(root, (e) => e.localName === 'img')).toHaveLength(0);
    expect(visibleText(root)).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('the creature page: order and what it leaves out', () => {
  it('puts the finale ability right under Stats, before Gear and Talents', () => {
    const { root } = draw('level 15');
    expect(headings(root)).toEqual(['Stats', 'Finale ability', 'Gear', 'Talents']);
    expect(visibleText(root)).toContain('Flare Strike');
  });

  it('leaves out the finale ability until it is unlocked', () => {
    const { root } = draw('level 2');
    expect(headings(root)).toEqual(['Stats', 'Gear', 'Talents']);
  });

  const FORBIDDEN = [
    /Next:/,
    /opens at/i,
    /unlocks at/i,
    /needs level/i,
    /Evolves into/i,
    /Equip best/i,
    /\bempty\b/i,
    /Festival prize/i,
    /What is the Talent Book/i,
  ];
  const KINDS: SceneKind[] = ['level 2', 'level 8', 'level 15', 'ribbon ready', 'talents: epic'];
  for (const kind of KINDS) {
    it(`says nothing forward-looking or hand-holding (${kind})`, () => {
      const { root } = draw(kind);
      const text = visibleText(root);
      for (const pattern of FORBIDDEN) expect(text, String(pattern)).not.toMatch(pattern);
    });
  }

  it('has no Equip best button and no Talent Book accordion', () => {
    const { root } = draw('level 15');
    expect(byName(root, 'button', /Equip best/)).toHaveLength(0);
    expect(byName(root, 'button', /Talent Book/)).toHaveLength(0);
  });

  it('says what evolution needs nowhere while it is locked', () => {
    const { root } = draw('level 15', {
      change: (c) => ({
        ...c,
        evolution: { toSpecies: 'pyrelynx', level: 20, essence: 20, available: false },
      }),
    });
    expect(visibleText(root)).not.toContain('Evolve into');
    expect(byName(root, 'button', /^Evolve into/)).toHaveLength(0);
  });
});

describe('the creature page: the buttons for what is ready', () => {
  it('shows the ribbon only when the creature waits for one, with its cost and what is missing', () => {
    // Not at a ribbon level: no ribbon element at all.
    const none = draw('level 15');
    expect(byName(none.root, 'button', /Ribbon/)).toHaveLength(0);
    expect(byClass(none.root, 'ribbon-line')).toHaveLength(0);
    page?.unmount();

    // At the level, short of parts: the cost and what is missing, the button off.
    const short = draw('ribbon waiting');
    const off = first(
      byName(short.root, 'button', 'Earn Bronze Ribbon 6 scrap and 2 Ember shards'),
    );
    expect(off.hasAttribute('disabled')).toBe(true);
    expect(visibleText(first(byClass(short.root, 'ribbon-line')))).toContain('Short of parts');
    page?.unmount();

    // At the level with the parts: a gold button that earns it.
    const ready = draw('ribbon ready');
    const on = first(byName(ready.root, 'button', /^Earn Bronze Ribbon /));
    expect(on.hasAttribute('disabled')).toBe(false);
    expect(on.getAttribute('class')).toContain('primary');
    ready.page.click(on);
    expect(ready.actions.onRibbon).toHaveBeenCalledTimes(1);
  });

  it('has a gold evolve button when evolution is ready, and answers a waiting catch', () => {
    const evolve = draw('evolve ready');
    const button = first(byName(evolve.root, 'button', 'Evolve 20 Essence'));
    expect(button.getAttribute('class')).toContain('primary');
    // The main button of the page: the full width of the page, and the big size.
    expect(button.getAttribute('class')).toContain('wide');
    expect(button.getAttribute('class')).toContain('large');
    evolve.page.click(button);
    expect(evolve.actions.onEvolve).toHaveBeenCalledTimes(1);
    page?.unmount();

    const waiting = draw('level 15', { pending: true });
    waiting.page.click(first(byName(waiting.root, 'button', /^Answer a waiting catch/)));
    expect(waiting.onAnswerCatch).toHaveBeenCalledTimes(1);
    page?.unmount();

    const none = draw('level 15');
    expect(byName(none.root, 'button', /Answer/)).toHaveLength(0);
  });
});

describe('the creature page: evolving a busy creature', () => {
  it('disables the evolve button and says why while the creature is on a job', () => {
    const {
      root,
      page: p,
      actions,
    } = draw('evolve ready', {
      change: (c) => ({ ...c, busy: { kind: 'job', id: 'job-1' } }),
    });
    const button = first(byName(root, 'button', /^Evolve /));
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(visibleText(root)).toContain('On a job');
    p.click(button);
    expect(actions.onEvolve).not.toHaveBeenCalled();
  });
});

describe('the creature page: the gear list', () => {
  /** The list's rows, Hat, Scarf and Charm. */
  const rows = (root: FakeElement): FakeElement[] =>
    byClass(first(byClass(root, 'gear-list')), 'find-row');

  it('shows a slot not open yet as a padlock, the slot and the level it opens at, not a button', () => {
    const { root } = draw('level 2');
    const [, scarf, charm] = rows(root);
    expect(visibleText(scarf as FakeElement)).toBe('ScarfLv 7');
    expect(visibleText(charm as FakeElement)).toBe('CharmLv 13');
    for (const row of [scarf, charm]) {
      expect(find(row as FakeElement, (e) => e.localName === 'button')).toHaveLength(0);
      expect(byClass(row as FakeElement, 'locked')).toHaveLength(1);
      expect(byClass(row as FakeElement, 'lock-icon')).toHaveLength(1);
    }
  });

  it('shows an empty open slot as its name and Empty, and a tap asks for its picker', () => {
    const { root } = draw('level 8');
    const [hat, scarf, charm] = rows(root);
    expect(visibleText(hat as FakeElement)).toBe('HatEmpty');
    expect(visibleText(scarf as FakeElement)).toBe('ScarfEmpty');
    expect(byClass(charm as FakeElement, 'locked')).toHaveLength(1);
    expect(nameOf(first(find(scarf as FakeElement, (e) => e.localName === 'button')))).toBe(
      'Scarf: empty. Choose one',
    );
  });

  it('shows a worn item as its picture, name, rarity and slot badges and its lines', () => {
    const { root } = draw('level 15');
    const [hat, scarf] = rows(root);
    expect(visibleText(first(byClass(hat as FakeElement, 'item-lv')))).toBe('Lv 15');
    expect(visibleText(first(byClass(scarf as FakeElement, 'item-lv')))).toBe('Lv 12');
    expect(visibleText(first(byClass(hat as FakeElement, 'find-row-name')))).toBe(
      "Emberkeeper's Crown, item level 15",
    );
    // The row is the slot: no slot badge (finds have one).
    expect(byClass(hat as FakeElement, 'slot-tag')).toHaveLength(0);
    expect(visibleText(first(byClass(hat as FakeElement, 'gear-list-lines')))).not.toBe('');
    expect(nameOf(first(find(hat as FakeElement, (e) => e.localName === 'button')))).toBe(
      "Hat: Emberkeeper's Crown, item level 15, Epic. Change",
    );
  });

  it('uses the one rarity colour tokens, grey, blue and pink, everywhere', () => {
    const { root } = draw('rarities');
    const frames = rows(root).map((r) => first(byClass(r, 'item-frame')).getAttribute('class'));
    expect(frames[0]).toContain('rarity-common');
    expect(frames[1]).toContain('rarity-rare');
    expect(frames[2]).toContain('rarity-epic');
  });
});

describe('the creature page: the item picker drawer', () => {
  it('opens from a slot as a dialog with an icon grid and no list or find bar', () => {
    const { root, page: p } = draw('level 15');
    p.click(slotButton(root, /^Hat: /));
    const dialog = first(byRole(root, 'dialog'));
    expect(dialog.textContent).toContain('Hat');
    expect(byClass(dialog, 'item-grid')).toHaveLength(1);
    expect(byClass(dialog, 'item-tile').length).toBeGreaterThan(10);
    expect(byClass(dialog, 'item-find')).toHaveLength(0);
    expect(byClass(dialog, 'ip-row')).toHaveLength(0);
    // No framed box round an item inside the grid: one outline per cell, with the level in its corner.
    expect(byClass(first(byClass(dialog, 'item-grid')), 'item-frame')).toHaveLength(0);
    const cell = first(byClass(dialog, 'item-tile'));
    expect(visibleText(first(byClass(cell, 'item-lv')))).toMatch(/^Lv \d+$/);
  });

  it('opens with nothing selected: the grid has the whole drawer until an item is tapped', () => {
    const { root, page: p } = draw('level 15');
    p.click(slotButton(root, /^Hat: /));
    const dialog = first(byRole(root, 'dialog'));
    const cells = byClass(dialog, 'item-tile');
    expect(cells.length).toBeGreaterThan(10);
    expect(cells.some((c) => c.getAttribute('aria-pressed') === 'true')).toBe(false);
    expect(cells.some((c) => (c.getAttribute('class') ?? '').includes('selected'))).toBe(false);
    expect(byClass(dialog, 'ip-detail')).toHaveLength(0);
    expect(byName(dialog, 'button', /^(Equip|Take off)$/)).toHaveLength(0);
    // The count is there, and a tap shows the item.
    expect(visibleText(first(byClass(dialog, 'drawer-head')))).toMatch(/\d+ in the bag/);
    p.click(cells[3] as FakeElement);
    expect(cells[3]?.getAttribute('aria-pressed')).toBe('true');
    expect(byClass(dialog, 'ip-detail')).toHaveLength(1);
  });

  it('puts the worn item first; tapping it shows Take off, and that takes it off', async () => {
    const { root, page: p, actions } = draw('level 15');
    p.click(slotButton(root, /^Hat: /));
    const dialog = first(byRole(root, 'dialog'));
    const cells = byClass(dialog, 'item-tile');
    expect(visibleText(first(byClass(cells[0] as FakeElement, 'item-tile-flag')))).toBe('Worn');
    p.click(cells[0] as FakeElement);
    expect(cells[0]?.getAttribute('aria-pressed')).toBe('true');
    p.click(first(byName(dialog, 'button', 'Take off')));
    await vi.waitFor(() => {
      expect(actions.onEquip).toHaveBeenCalledTimes(1);
    });
    const call: unknown[] = (actions.onEquip as ReturnType<typeof vi.fn>).mock.calls[0] ?? [];
    expect(call[1]).toBeNull();
    // Accepted: the drawer closes.
    await vi.waitFor(() => {
      expect(byRole(root, 'dialog')).toHaveLength(0);
    });
  });

  it('selects another item and equips it', async () => {
    const { root, page: p, actions, creature } = draw('level 15');
    p.click(slotButton(root, /^Charm: /));
    const dialog = first(byRole(root, 'dialog'));
    const cell = first(byName(dialog, 'button', /^Cinder Charm, item level 14/));
    p.click(cell);
    expect(cell.getAttribute('aria-pressed')).toBe('true');
    // The Charm slot is empty: Compare is still there, beside Equip (it compares against nothing).
    expect(byRole(dialog, 'switch')).toHaveLength(1);
    p.click(first(byName(dialog, 'button', 'Equip')));
    await vi.waitFor(() => {
      expect(actions.onEquip).toHaveBeenCalledTimes(1);
    });
    const call: unknown[] = (actions.onEquip as ReturnType<typeof vi.fn>).mock.calls[0] ?? [];
    expect(String(call[0])).toContain('bag-charm');
    expect(call[1]).toBe(creature.id);
  });

  it('keeps the drawer open when the server refuses', async () => {
    const equip = vi.fn(() => Promise.resolve(false));
    const { root, page: p } = draw('level 15', { actions: { onEquip: equip } });
    p.click(slotButton(root, /^Hat: /));
    p.click(first(byClass(first(byRole(root, 'dialog')), 'item-tile')));
    p.click(first(byName(first(byRole(root, 'dialog')), 'button', 'Take off')));
    await vi.waitFor(() => {
      expect(equip).toHaveBeenCalledTimes(1);
    });
    await Promise.resolve();
    expect(byRole(root, 'dialog')).toHaveLength(1);
  });

  it("greys out an item another creature wears, with that creature's picture, and moves it only with Take from", async () => {
    const { root, page: p, actions, creature } = draw('level 15');
    p.click(slotButton(root, /^Hat: /));
    const dialog = first(byRole(root, 'dialog'));
    const cell = first(
      byName(dialog, 'button', /^Bark Hood, item level 13, Rare, worn by Pebble$/),
    );
    expect(cell.getAttribute('class')).toContain('blocked');
    expect(byClass(cell, 'item-tile-wearer')).toHaveLength(1);
    // After every free item it can wear, before the ones it cannot.
    const cells = byClass(dialog, 'item-tile');
    const at = cells.indexOf(cell);
    expect(
      cells.slice(1, at).every((c) => !(c.getAttribute('class') ?? '').includes('blocked')),
    ).toBe(true);
    p.click(cell);
    // No plain Equip: the one button says whose item it is.
    expect(byName(dialog, 'button', 'Equip')).toHaveLength(0);
    const take = first(byName(dialog, 'button', 'Take from Pebble'));
    expect(take.getAttribute('class')).not.toContain('primary');
    p.click(take);
    await vi.waitFor(() => {
      expect(actions.onEquip).toHaveBeenCalledTimes(1);
    });
    const call: unknown[] = (actions.onEquip as ReturnType<typeof vi.fn>).mock.calls[0] ?? [];
    expect(call[1]).toBe(creature.id);
  });

  it('shows the reason an item cannot be worn instead of an Equip button', () => {
    const { root, page: p } = draw('level 15');
    p.click(slotButton(root, /^Hat: /));
    const dialog = first(byRole(root, 'dialog'));
    p.click(first(byName(dialog, 'button', /^Thundercap, item level 16/)));
    expect(byName(dialog, 'button', 'Equip')).toHaveLength(0);
    expect(visibleText(first(byClass(dialog, 'ip-reason')))).toBe('Needs Lv 16');
  });

  it('says Loading... while the gear loads, and offers nothing to pick', () => {
    const { root, page: p } = draw('level 15', { gearLoaded: false });
    p.click(slotButton(root, /^Hat: /));
    const dialog = first(byRole(root, 'dialog'));
    expect(visibleText(dialog)).toContain('Loading...');
    expect(byClass(dialog, 'item-tile')).toHaveLength(0);
    expect(byClass(dialog, 'ip-detail')).toHaveLength(0);
  });

  it('opens with the page on the slot whose icon was tapped on the card, if that slot is open', () => {
    const open = draw('level 15', { focus: { part: 'gear', slot: 'scarf' } });
    expect(first(byRole(open.root, 'dialog')).textContent).toContain('Scarf');
    page?.unmount();
    // A locked slot opens nothing.
    const locked = draw('level 2', { focus: { part: 'gear', slot: 'charm' } });
    expect(byRole(locked.root, 'dialog')).toHaveLength(0);
    expect(locked.root.focused).toBe(1);
    expect(startingDrawer(null, { level: 15 }, { hat: 1, scarf: 7, charm: 13 })).toBeNull();
    expect(
      startingDrawer({ part: 'talents' }, { level: 15 }, { hat: 1, scarf: 7, charm: 13 }),
    ).toBeNull();
  });
});

describe('the creature page: the item detail panel', () => {
  it('is the item card: image with its level, name, badge and stats, then a divider and the modifiers', () => {
    const { root, page: p } = draw('level 15');
    p.click(slotButton(root, /^Hat: /));
    p.click(first(byClass(first(byRole(root, 'dialog')), 'item-tile')));
    const detail = first(byClass(first(byRole(root, 'dialog')), 'ip-detail'));
    const card = first(byClass(detail, 'idc'));
    expect(card.getAttribute('class')).toContain('pix');
    const kids = find(card, (e) =>
      ['idc-head', 'idc-divider', 'line-list'].some((c) =>
        (e.getAttribute('class') ?? '').split(' ').includes(c),
      ),
    ).map((e) => (e.getAttribute('class') ?? '').split(' ')[0]);
    expect(kids).toEqual(['idc-head', 'idc-divider', 'line-list']);
    // The image is first in the head and carries the item level in its corner; no pips, no level text beside it.
    const head = first(byClass(card, 'idc-head'));
    expect(first(head.childNodes as FakeElement[]).getAttribute('class')).toContain('item-frame');
    expect(visibleText(first(byClass(head, 'item-lv')))).toBe('Lv 15');
    expect(byClass(card, 'rarity-mark')).toHaveLength(0);
    expect(byClass(first(byClass(head, 'idc-info')), 'item-lv')).toHaveLength(0);
    // The name (the level is only spoken) and a plain (not tappable) rarity badge are in the info column.
    expect(visibleText(first(byClass(head, 'idc-name')))).toBe(
      "Emberkeeper's Crown, item level 15",
    );
    expect(byClass(first(byClass(head, 'idc-name')), 'visually-hidden')).toHaveLength(1);
    expect(visibleText(first(byClass(head, 'rarity-tag')))).toBe('Epic');
    // One row per stat: the base value and its local bonus after it.
    const rows = find(first(byClass(card, 'idc-stats')), (e) => e.localName === 'li').map((r) =>
      visibleText(r),
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatch(/^Attack \d+ \+\d+$/);
    expect(rows[1]).toMatch(/^HP \d+$/);
    expect(rows[2]).toMatch(/^Crit damage \d+ pt$/);
    // The modifiers keep their values and tier pips.
    expect(visibleText(card)).toContain('(this item)');
    expect(byClass(card, 'tier-pips').length).toBeGreaterThan(0);
    // The bonus is a distinct element, so a stat with none shows the base alone.
    expect(byClass(card, 'idc-stat-bonus')).toHaveLength(1);
  });

  it('has no stat rows for a Charm: name, badge, divider, modifiers', () => {
    const { root, page: p } = draw('level 15');
    p.click(slotButton(root, /^Charm: /));
    p.click(first(byClass(first(byRole(root, 'dialog')), 'item-tile')));
    const detail = first(byClass(first(byRole(root, 'dialog')), 'ip-detail'));
    expect(byClass(detail, 'idc-stats')).toHaveLength(0);
    expect(byClass(detail, 'idc-divider')).toHaveLength(1);
    expect(byClass(detail, 'line-list')).toHaveLength(1);
  });
});

describe('the creature page: talent slots and the Talent Book', () => {
  it('opens the book for the slot that was tapped and slots a free talent for Bait', () => {
    const { root, page: p, actions, creature } = draw('talents: filled and empty');
    p.click(slotButton(root, /^Talent slot 2: empty/));
    const dialog = first(byRole(root, 'dialog'));
    expect(dialog.textContent).toContain('Talent Book');
    const use = first(byName(dialog, 'button', /^Put Warm to the Touch in slot 2 for 10 Bait/));
    expect(visibleText(use)).toBe('Use · 10 Bait');
    p.click(use);
    expect(actions.onSlotTalent).toHaveBeenCalledWith(creature, 'warm-to-the-touch', false, 2);
    // The drawer closes once it is asked.
    expect(byRole(root, 'dialog')).toHaveLength(0);
  });

  it('greys out a talent that is already in another slot, with its slot mark and no button', () => {
    const { root, page: p } = draw('talents: filled and empty');
    p.click(slotButton(root, /^Talent slot 2: empty/));
    const dialog = first(byRole(root, 'dialog'));
    const rows = byClass(dialog, 'book-entry');
    const elsewhere = byClass(dialog, 'elsewhere');
    expect(elsewhere).toHaveLength(1);
    const row = first(elsewhere);
    expect(visibleText(first(byClass(row, 'book-slot-mark')))).toBe('Already in Slot 1');
    // No "move to slot" option: slots are equivalent.
    expect(find(row, (e) => e.localName === 'button')).toHaveLength(0);
    expect(visibleText(dialog)).not.toContain('To slot');
    // It comes last, after the talents that can be used.
    expect(rows[rows.length - 1]).toBe(row);
    expect(rows.slice(0, -1).every((r) => byName(r, 'button', /Bait/).length === 1)).toBe(true);
  });

  it('lights the talent that is in the tapped slot, with no button', () => {
    const { root, page: p } = draw('talents: filled and empty');
    p.click(slotButton(root, /^Talent slot 1: /));
    const dialog = first(byRole(root, 'dialog'));
    const here = first(byClass(dialog, 'in-use'));
    expect(visibleText(first(byClass(here, 'book-slot-mark')))).toBe('In use, ✓ Slot 1');
    expect(find(here, (e) => e.localName === 'button')).toHaveLength(0);
    expect(byClass(dialog, 'book-entry')[0]).toBe(here);
  });

  it('turns the buttons off and says so when the Bait is short', () => {
    const { root, page: p } = draw('talents: filled and empty', { bait: 4 });
    p.click(slotButton(root, /^Talent slot 2: empty/));
    const dialog = first(byRole(root, 'dialog'));
    const buttons = byClass(dialog, 'book-use');
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) expect(button.hasAttribute('disabled')).toBe(true);
    expect(visibleText(dialog)).toContain('Not enough Bait.');
  });

  it('shows locked talent slots like locked gear slots, and the signature talent without a button', () => {
    const { root } = draw('talents: epic');
    const slots = byClass(
      first(find(root, (e) => e.localName === 'ul' && e.getAttribute('aria-label') === 'Talents')),
      'slot',
    );
    expect(slots).toHaveLength(4);
    expect(visibleText(slots[0] as FakeElement)).toContain('Signature');
    expect(slots[0]?.localName).toBe('div');
    const locked = first(byClass(root, 'locked'));
    expect(visibleText(locked)).toBe('TalentLv 25');
  });

  it('opens on the talents when the chips were tapped', () => {
    const { root, page: p } = draw('talents: filled and empty', { focus: { part: 'talents' } });
    const heading = p.document.getElementById(`${root.getAttribute('id') ?? ''}-talents`);
    expect(heading?.focused).toBe(1);
    expect(heading?.scrolled).toBe(1);
    expect(root.focused).toBe(0);
    expect(byRole(root, 'dialog')).toHaveLength(0);
  });
});

describe('the creature page: About and Rename', () => {
  it('holds the facts the card used to keep under "More"', () => {
    const { root } = draw('level 15');
    const text = visibleText(root);
    for (const word of [
      'Fusion',
      '0 / 5',
      'Ribbons',
      'Explorer rank',
      'Trips',
      'HP',
      'Attack',
      'Speed',
    ]) {
      expect(text).toContain(word);
    }
    expect(byName(root, 'button', 'About')[0]?.getAttribute('aria-expanded')).toBe('true');
    const rename = first(byName(root, 'button', 'Rename'));
    expect(rename.getAttribute('aria-expanded')).toBe('false');
    // The form stays in the page while closed, so a half-typed nickname survives.
    expect(find(root, (e) => e.localName === 'input')).toHaveLength(1);
  });

  it('renames: a nickname goes to the server, empty clears it', () => {
    const rename = vi.fn();
    const { root, page: p, creature } = draw('level 15', { actions: { onRename: rename } });
    p.type(first(find(root, (e) => e.localName === 'input')), 'Sparky');
    const form = first(find(root, (e) => e.localName === 'form'));
    p.update(() => {
      for (const l of form.listeners.get('submit') ?? []) {
        l.call(form, {
          type: 'submit',
          target: form,
          currentTarget: form,
          defaultPrevented: false,
          preventDefault: () => undefined,
          stopPropagation: () => undefined,
        });
      }
    });
    expect(rename).toHaveBeenCalledWith(creature, 'Sparky');
  });
});
