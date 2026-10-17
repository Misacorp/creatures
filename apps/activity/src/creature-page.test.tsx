import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Creature } from './api';
import { CreaturePage, type CardActions } from './CreaturePage';
import {
  SAMPLE_GEAR,
  SAMPLE_STATE,
  sampleCreature,
  talentView,
  type SampleKind,
} from './creature-card-sample';
import { cardDomId, type PageFocus } from './creature-card-view';
import {
  byClass,
  byName,
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
    onEquipBest: vi.fn(() => Promise.resolve(undefined)),
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
  onBack: ReturnType<typeof vi.fn>;
  onAnswerCatch: ReturnType<typeof vi.fn>;
}

/** Draws one creature's page and returns the page and its handlers. */
function draw(
  creature: Creature,
  options: {
    focus?: PageFocus;
    pending?: boolean;
    bait?: number;
    loungerId?: string | null;
    busy?: boolean;
    actions?: Partial<CardActions>;
  } = {},
): Drawn {
  page = createPage();
  const actions = actionsWith(options.actions);
  const onBack = vi.fn();
  const onAnswerCatch = vi.fn();
  const pendingCard = SAMPLE_STATE.pending[0];
  const state = {
    ...SAMPLE_STATE,
    creatures: [creature],
    pending:
      options.pending === true && pendingCard !== undefined
        ? [
            {
              ...pendingCard,
              offered: { ...pendingCard.offered, teach: [creature.id], fuse: [creature.id] },
            },
          ]
        : [],
    balances: { ...SAMPLE_STATE.balances, bait: options.bait ?? 100 },
    loungerId: options.loungerId ?? null,
  };
  page.draw(
    <CreaturePage
      creature={creature}
      state={state}
      gear={SAMPLE_GEAR}
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
  return { page, root, actions, onBack, onAnswerCatch };
}

const kind = (name: SampleKind): Creature => sampleCreature(name);

describe('the creature page: back', () => {
  it('has a back button at the top left that says where it goes', () => {
    const { root, page: p, onBack } = draw(kind('growing'));
    const top = byClass(root, 'cp-top')[0] as FakeElement;
    expect(root.childNodes[0]).toBe(top);
    const back = byName(top, 'button', '‹ Creatures')[0] as FakeElement;
    expect(back).toBeDefined();
    expect(back.getAttribute('type')).toBe('button');
    p.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('goes back on Escape, but not from a text field or after the gear picker took it', () => {
    const { root, page: p, onBack } = draw(kind('ribbon ready'));
    p.key(root, 'Enter');
    expect(onBack).not.toHaveBeenCalled();
    p.key(root, 'Escape');
    expect(onBack).toHaveBeenCalledTimes(1);

    // Escape in the Rename field belongs to the field.
    const input = find(root, (e) => e.localName === 'input')[0] as FakeElement;
    p.key(input, 'Escape');
    expect(onBack).toHaveBeenCalledTimes(1);

    // Escape inside the open gear picker closes the picker only.
    p.click(
      find(root, (e) => e.localName === 'button' && /^Hat slot:/.test(nameOf(e)))[0] as FakeElement,
    );
    const picker = byClass(root, 'gear-picker')[0] as FakeElement;
    p.key(picker, 'Escape');
    expect(byClass(root, 'gear-picker')).toHaveLength(0);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('is named by the creature and takes the focus when it opens at the top', () => {
    const { root } = draw(kind('growing'));
    expect(root.getAttribute('aria-labelledby')).toBe(`${root.getAttribute('id') ?? ''}-name`);
    expect(nameOf(find(root, (e) => e.localName === 'h2')[0] as FakeElement)).toBe('Cindle');
    expect(root.focused).toBe(1);
  });
});

describe('the creature page: what it holds', () => {
  it('holds everything the card used to keep under "More"', () => {
    const { root } = draw(kind('ribbon ready'));
    const text = visibleText(root);
    // Who it is
    expect(text).toContain('Ember');
    expect(text).toContain('Common');
    expect(text).toContain('Lv 10');
    // The ribbon button with its cost, and the way to earn it
    expect(byName(root, 'button', /Bronze Ribbon \(6 scrap and 2 Ember shards\)/)).toHaveLength(1);
    // Gear is a list, one row per slot; the closed Charm is a short muted row.
    expect(text).toContain('Charm opens at level 13');
    // Stats with the gear's share
    expect(text).toContain('HP');
    expect(text).toContain('Attack');
    expect(text).toContain('Speed');
    // Gear: the three slots and Equip best
    expect(text).toContain('Equip best');
    expect(
      find(root, (e) => e.localName === 'button' && /^Hat slot:/.test(nameOf(e))),
    ).toHaveLength(1);
    // Talents: the slots and the book
    expect(text).toContain('Talents');
    expect(byName(root, 'button', /^Talent Book/)).toHaveLength(1);
    // Ability, About, fusion, ribbons, explorer
    expect(text).toContain('Flare Strike');
    expect(text).toContain('Evolves into');
    expect(text).toContain('Fusion');
    expect(text).toContain('0 / 5');
    expect(text).toContain('Ribbons');
    expect(text).toContain('Explorer rank');
    expect(text).toContain('Trips');
    // Lounge and Rename
    expect(byName(root, 'button', 'Lounge')).toHaveLength(1);
    const rename = byName(root, 'button', 'Rename')[0] as FakeElement;
    expect(rename.getAttribute('aria-expanded')).toBe('false');
    // The form stays in the page while closed, so a half-typed nickname survives.
    expect(find(root, (e) => e.localName === 'input')).toHaveLength(1);
    // About is an accordion too, open to begin with.
    expect(byName(root, 'button', 'About')[0]?.getAttribute('aria-expanded')).toBe('true');
  });

  it('has the ribbon, evolve and waiting-catch buttons itself, not only on the card', () => {
    const ready = draw(kind('ribbon ready'));
    const ribbon = byName(ready.root, 'button', /^Bronze Ribbon \(/)[0] as FakeElement;
    expect(ribbon.hasAttribute('disabled')).toBe(false);
    ready.page.click(ribbon);
    expect(ready.actions.onRibbon).toHaveBeenCalledTimes(1);
    page?.unmount();

    const evolve = draw(kind('evolve ready'));
    const button = byName(evolve.root, 'button', 'Evolve into Pyrelynx (20 Essence)')[0];
    evolve.page.click(button as FakeElement);
    expect(evolve.actions.onEvolve).toHaveBeenCalledTimes(1);
    page?.unmount();

    const waiting = draw(
      { ...kind('ribbon ready'), ribbon: null, waiting: false },
      { pending: true },
    );
    waiting.page.click(byName(waiting.root, 'button', 'Answer a waiting catch')[0] as FakeElement);
    expect(waiting.onAnswerCatch).toHaveBeenCalledTimes(1);
    page?.unmount();

    // No catch waiting for this creature: no such button.
    const none = draw(kind('growing'));
    expect(byName(none.root, 'button', /Answer/)).toHaveLength(0);
  });

  it('shows a ribbon that is not ready as a disabled button with what is missing', () => {
    const { root } = draw(kind('ribbon short'));
    const disabled = byName(root, 'button', /Bronze Ribbon \(6 scrap and 2 Ember shards\)/)[0];
    expect(disabled?.hasAttribute('disabled')).toBe(true);
    expect(visibleText(byClass(root, 'ribbon-line')[0] as FakeElement)).toContain('Short of parts');
  });

  it('says what evolution needs while it is locked, without a button', () => {
    const { root } = draw({
      ...kind('evolve ready'),
      evolution: { toSpecies: 'pyrelynx', level: 15, essence: 20, available: false },
      level: 12,
    });
    expect(visibleText(root)).toContain('Evolve into Pyrelynx: needs level 15');
    expect(byName(root, 'button', /^Evolve into/)).toHaveLength(0);
  });

  it('does not repeat the experience numbers the bar and the next line already say', () => {
    const { root } = draw(kind('growing'));
    expect(visibleText(root)).not.toContain('experience');
    expect(visibleText(byClass(root, 'cc-next')[0] as FakeElement)).toBe('Next: Scarf at 7');
  });

  it('lists the gear one row per slot, with the picker under the row that is open', () => {
    const { root, page: p } = draw(kind('ribbon ready'));
    const rows = byClass(root, 'gear-row');
    expect(rows).toHaveLength(3);
    // Hat and Scarf: the name with its item level on one line, the item's lines below.
    const hat = rows[0] as FakeElement;
    expect(visibleText(byClass(hat, 'gear-title')[0] as FakeElement)).toBe(
      "Emberkeeper's Crown item level 15",
    );
    expect(visibleText(byClass(hat, 'gear-main')[0] as FakeElement)).toContain('(this item)');
    // The closed Charm is a muted row without a button.
    const charm = rows[2] as FakeElement;
    expect(visibleText(charm)).toBe('Charm opens at level 13');
    expect(find(charm, (e) => e.localName === 'button')).toHaveLength(0);
    // The picker opens inside the row of its slot.
    p.click(find(rows[1] as FakeElement, (e) => e.localName === 'button')[0] as FakeElement);
    expect(byClass(rows[1] as FakeElement, 'gear-picker')).toHaveLength(1);
    expect(byClass(rows[0] as FakeElement, 'gear-picker')).toHaveLength(0);
  });

  it('wears and takes off gear, and can use Equip best', async () => {
    const creature = kind('ribbon ready');
    const hat = creature.gear.find((g) => g.slot === 'hat');
    const equipBest = vi.fn(() => Promise.resolve(undefined));
    const equip = vi.fn(() => Promise.resolve(true));
    const { root, page: p } = draw(creature, {
      actions: { onEquipBest: equipBest, onEquip: equip },
    });
    p.click(byName(root, 'button', 'Equip best')[0] as FakeElement);
    expect(equipBest).toHaveBeenCalledWith(creature.id);
    // Tapping the Hat slot opens its picker with "Take off".
    p.click(
      find(root, (e) => e.localName === 'button' && /^Hat slot:/.test(nameOf(e)))[0] as FakeElement,
    );
    const takeOff = byName(root, 'button', /^Take off/)[0] as FakeElement;
    expect(takeOff).toBeDefined();
    p.click(takeOff);
    await Promise.resolve();
    expect(equip).toHaveBeenCalledWith(hat?.id, null);
  });

  it('slots a talent from the Talent Book', () => {
    const slot = vi.fn();
    const creature = kind('talent to fill');
    const { root, page: p } = draw(creature, { actions: { onSlotTalent: slot } });
    // The book is an accordion, closed until asked for.
    expect(byName(root, 'button', /^Put Playful in slot 2/)).toHaveLength(0);
    p.click(byName(root, 'button', /^Talent Book/)[0] as FakeElement);
    const button = byName(root, 'button', /^Put Playful in slot 2/)[0] as FakeElement;
    expect(button).toBeDefined();
    expect(visibleText(button)).toBe('Slot 2 \u00b7 10 Bait');
    p.click(button);
    expect(slot).toHaveBeenCalledWith(creature, 'playful', false, 2);
  });

  it('shows the Talent Book by state: in use first and lit, then available, with no state words', () => {
    const creature = kind('talent to fill');
    const { root, page: p } = draw(creature);
    p.click(byName(root, 'button', /^Talent Book/)[0] as FakeElement);
    const rows = byClass(root, 'book-entry');
    expect(rows.map((r) => r.getAttribute('class'))).toEqual([
      'book-entry in-use',
      'book-entry available',
    ]);
    const used = rows[0] as FakeElement;
    expect(visibleText(byClass(used, 'book-slot-mark')[0] as FakeElement)).toBe(
      'In use, \u2713 Slot 1',
    );
    expect(byName(used, 'button', /./)).toHaveLength(1);
    const text = visibleText(root);
    expect(text).not.toContain('Book only');
    expect(text).not.toContain('In slot');
    expect(text).not.toContain('In the book only');
  });

  it('uses one plain "Use" button when only one slot is open, and says when Bait is short', () => {
    const creature = kind('growing');
    const withSpare = {
      ...creature,
      talents: {
        ...creature.talents,
        book: [...creature.talents.book, { ...talentView('playful', true), slot: null }],
      },
    };
    const { root, page: p } = draw(withSpare, { bait: 3 });
    p.click(byName(root, 'button', /^Talent Book/)[0] as FakeElement);
    const button = byName(root, 'button', /^Put Playful/)[0] as FakeElement;
    expect(visibleText(button)).toBe('Use \u00b7 10 Bait');
    expect(button.getAttribute('disabled')).not.toBeNull();
    expect(visibleText(root)).toContain('Not enough Bait: each swap costs 10.');
  });

  it('renames: a nickname goes to the server, empty clears it', () => {
    const rename = vi.fn();
    const creature = kind('growing');
    const { root, page: p } = draw(creature, { actions: { onRename: rename } });
    const input = find(root, (e) => e.localName === 'input')[0] as FakeElement;
    p.type(input, 'Sparky');
    const form = find(root, (e) => e.localName === 'form')[0] as FakeElement;
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

  it('lounges, unless it is already the lounger or is busy', () => {
    const lounge = vi.fn();
    const creature = kind('growing');
    const { root, page: p } = draw(creature, { actions: { onLounge: lounge } });
    p.click(byName(root, 'button', 'Lounge')[0] as FakeElement);
    expect(lounge).toHaveBeenCalledWith(creature);
    page?.unmount();
    const already = draw(creature, { loungerId: creature.id });
    expect(byName(already.root, 'button', 'Lounge')).toHaveLength(0);
    page?.unmount();
    const busy = draw({ ...creature, busy: { kind: 'job', id: 'job-1' } });
    expect(byName(busy.root, 'button', 'Lounge')).toHaveLength(0);
  });

  it('draws names as text, never as markup', () => {
    const creature = { ...kind('growing'), nickname: '<img src=x onerror=alert(1)>' };
    const { root } = draw(creature);
    expect(find(root, (e) => e.localName === 'img')).toHaveLength(0);
    expect(visibleText(root)).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('the creature page: where it opens', () => {
  it('opens on the gear picker of the slot whose icon was tapped', () => {
    const { root, page: p } = draw(kind('ribbon ready'), {
      focus: { part: 'gear', slot: 'scarf' },
    });
    expect(
      find(root, (e) => e.getAttribute('role') === 'group' && /Choose a scarf/.test(nameOf(e))),
    ).toHaveLength(1);
    const heading = p.document.getElementById(`${root.getAttribute('id') ?? ''}-gear`);
    expect(heading?.focused).toBe(1);
    expect(heading?.scrolled).toBe(1);
  });

  it('opens on the talents when the chips were tapped', () => {
    const { root, page: p } = draw(kind('talent to fill'), { focus: { part: 'talents' } });
    const heading = p.document.getElementById(`${root.getAttribute('id') ?? ''}-talents`);
    expect(heading?.focused).toBe(1);
    expect(heading?.scrolled).toBe(1);
    expect(root.focused).toBe(0);
  });
});
