import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Creature, GameState } from './api';
import { creatureV2 } from './combat-v2-view';
import { CreatureConfigurator } from './CreatureConfigurator';
import { CreaturePage, statRows, type CardActions } from './CreaturePage';
import { cardDomId } from './creature-card-view';
import { creatureNeeds } from './creature-needs';
import { talentKit } from './creature-card-view';
import { pageScene, type SceneKind } from './creature-page/sample';
import { teamSample } from './creature-page/team-sample';
import { withV2 } from './creature-page/v2-sample';
import {
  badgesIn,
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
 * Combat v2 on the creature page and the raid configurator (integration.md, section 9): the Knack section and its
 * picker, Armour and crit in the stats, the line's Talent Book, gear effect lines marked. A creature without the
 * server's v2 fields (the flag off) is drawn as it always was.
 */
let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

function actionsWith(overrides: Partial<CardActions> = {}): CardActions {
  return {
    onEquip: vi.fn(() => Promise.resolve(true)),
    onRibbon: vi.fn(),
    onEvolve: vi.fn(),
    onRename: vi.fn(),
    onNote: vi.fn(),
    onLounge: vi.fn(),
    onSlotTalent: vi.fn(),
    onKnack: vi.fn(() => Promise.resolve('saved' as const)),
    onLearnTalentV2: vi.fn(),
    onSlotTalentV2: vi.fn(),
    ...overrides,
  };
}

function draw(
  kind: SceneKind,
  options: { bait?: number; actions?: Partial<CardActions> } = {},
): { root: FakeElement; actions: CardActions; creature: Creature; page: Page } {
  page = createPage();
  const scene = pageScene(kind, { bait: options.bait ?? 100 });
  const actions = actionsWith(options.actions);
  page.draw(
    <CreaturePage
      creature={scene.creature}
      state={scene.state}
      gear={scene.gear}
      busy={false}
      actions={actions}
      focus={null}
      onBack={() => undefined}
      onAnswerCatch={() => undefined}
    />,
  );
  const root = first(
    find(page.root, (el) => el.getAttribute('id') === `${cardDomId(scene.creature.id)}-page`),
  );
  return { root, actions, creature: scene.creature, page };
}

const headings = (root: FakeElement): string[] =>
  byClass(root, 'cp-title').map((h) => visibleText(h));

const slotButton = (root: FakeElement, name: RegExp): FakeElement =>
  first(find(root, (e) => e.localName === 'button' && name.test(nameOf(e))));

describe('the creature page without combat v2', () => {
  it('has no Knack section and keeps its Stats and Talent Book', () => {
    const { root, creature } = draw('level 15');
    expect(creatureV2(creature)).toBeNull();
    expect(headings(root)).not.toContain('Knack');
    expect(visibleText(root)).not.toContain('Armour');
    expect(visibleText(root)).not.toContain('Not in the new rules yet');
  });
});

describe('the Knack section of the creature page', () => {
  it('shows the saved Knack with its name and text, in place of the finale ability', () => {
    const { root, creature } = draw('v2: Knack saved');
    const v2 = creatureV2(creature);
    const saved = v2?.knownKnacks.find((k) => k.id === v2.knack);
    if (saved === undefined) throw new Error('the scene saves a Knack');
    expect(headings(root)).toContain('Knack');
    expect(headings(root)).not.toContain('Finale ability');
    const section = first(byClass(root, 'creature-knack'));
    expect(visibleText(section)).toContain(saved.name);
    // The text is as the server sent it, with the braces gone (a keyword is a chip).
    expect(visibleText(section)).not.toContain('{');
  });

  it('shows "None" when no Knack is saved', () => {
    const { root } = draw('v2: no Knack');
    const section = first(byClass(root, 'creature-knack'));
    expect(visibleText(section)).toContain('None');
    expect(nameOf(slotButton(section, /^Knack: none/))).toBe('Knack: none. Choose one');
  });

  it('opens the picker: each known Knack with its text, the saved one pressed, None last', () => {
    const { root, page: p, creature } = draw('v2: Knack saved');
    const v2 = creatureV2(creature);
    if (v2 === null) throw new Error('v2');
    p.click(slotButton(root, /^Knack: /));
    const dialog = first(byRole(root, 'dialog'));
    expect(dialog.textContent).toContain('Knack');
    const choices = byClass(dialog, 'choice');
    expect(
      choices.map((c) => visibleText(first(find(c, (e) => e.localName === 'strong')))),
    ).toEqual(
      [...v2.knownKnacks.map((k) => k.name), 'None'].map((name, i) =>
        i === 0 ? `${name} ✓` : name,
      ),
    );
    expect(choices.map((c) => c.getAttribute('aria-pressed'))).toEqual(
      choices.map((_, i) => (i === 0 ? 'true' : 'false')),
    );
    // Keywords are chips, never braces.
    expect(visibleText(dialog)).not.toContain('{');
  });

  it('saves a pick right away and closes the picker once it is saved', async () => {
    const { root, page: p, actions, creature } = draw('v2: Knack saved');
    const v2 = creatureV2(creature);
    if (v2 === null) throw new Error('v2');
    p.click(slotButton(root, /^Knack: /));
    const dialog = first(byRole(root, 'dialog'));
    const other = v2.knownKnacks[1];
    if (other === undefined) throw new Error('the creature knows two Knacks');
    p.click(first(byName(dialog, 'button', new RegExp(other.name))));
    expect(actions.onKnack).toHaveBeenCalledWith(creature, other.id, 'page');
    await flush();
    expect(byRole(root, 'dialog')).toHaveLength(0);
  });

  it('saves "None" as null', async () => {
    const { root, page: p, actions, creature } = draw('v2: Knack saved');
    p.click(slotButton(root, /^Knack: /));
    const dialog = first(byRole(root, 'dialog'));
    p.click(first(byName(dialog, 'button', /^None/)));
    expect(actions.onKnack).toHaveBeenCalledWith(creature, null, 'page');
    await flush();
  });

  it('says the creature has fought this weekend on a locked answer, and stays open', async () => {
    const { root, page: p } = draw('v2: Knack saved', {
      actions: { onKnack: vi.fn(() => Promise.resolve('locked' as const)) },
    });
    p.click(slotButton(root, /^Knack: /));
    const dialog = first(byRole(root, 'dialog'));
    p.click(first(byClass(dialog, 'choice')));
    await flush();
    const open = first(byRole(root, 'dialog'));
    expect(visibleText(open)).toContain('has fought this weekend');
    expect(byClass(open, 'choice').length).toBeGreaterThan(1);
  });

  it('says so, and stays open, when the save failed', async () => {
    const { root, page: p } = draw('v2: Knack saved', {
      actions: { onKnack: vi.fn(() => Promise.resolve('failed' as const)) },
    });
    p.click(slotButton(root, /^Knack: /));
    p.click(first(byClass(first(byRole(root, 'dialog')), 'choice')));
    await flush();
    expect(visibleText(first(byRole(root, 'dialog')))).toContain('did not save');
  });

  it('is read only without a way to save: the box is not a button', () => {
    const { root } = draw('v2: Knack saved', { actions: { onKnack: undefined as never } });
    const section = first(byClass(root, 'creature-knack'));
    expect(find(section, (e) => e.localName === 'button')).toHaveLength(0);
  });
});

describe('the stats of the creature page under combat v2', () => {
  it('has Armour and Crit (chance and multiplier) from the v2 numbers, gear and talents in', () => {
    const { creature } = draw('v2: Knack saved');
    const v2 = creatureV2(creature);
    if (v2 === null) throw new Error('v2');
    const rows = statRows(creature);
    expect(rows.map((r) => r.label)).toEqual(['HP', 'Attack', 'Speed', 'Armour', 'Crit']);
    expect(rows.find((r) => r.label === 'HP')?.value).toBe(v2.statsV2.hp);
    expect(rows.find((r) => r.label === 'Armour')?.value).toBe(v2.statsV2.armour);
    expect(rows.find((r) => r.label === 'Crit')?.value).toMatch(/^\d+(\.\d+)?% · \d+(\.\d+)?x$/);
  });

  it('shows them in the page', () => {
    const { root } = draw('v2: Knack saved');
    expect(visibleText(root)).toMatch(/Armour/);
    expect(visibleText(root)).toMatch(/Crit\d+(\.\d+)?% · \d+(\.\d+)?x/);
  });
});

describe('gear under combat v2', () => {
  it('notes the effect lines "not in the new rules yet" and keeps the stat lines as they were', () => {
    const { root } = draw('v2: Knack saved');
    const gear = first(byClass(root, 'gear-list'));
    const notes = byClass(gear, 'gear-list-off');
    expect(notes.length).toBeGreaterThan(0);
    for (const note of notes) {
      expect(visibleText(note)).toMatch(/^Not in the new rules yet: /);
    }
    // The stat lines (Attack, HP) are still listed in the ordinary line.
    expect(byClass(gear, 'gear-list-lines').length).toBeGreaterThan(notes.length - 1);
  });
});

describe('the Talent Book under combat v2', () => {
  it('shows slots by level, with the learned talents in them', () => {
    const { root, creature } = draw('v2: Knack saved');
    const v2 = creatureV2(creature);
    if (v2 === null) throw new Error('v2');
    const filled = v2.talentsV2.slots.filter((s) => s.talent !== null);
    expect(filled.length).toBeGreaterThan(0);
    const talents = first(
      find(root, (e) => e.localName === 'ul' && e.getAttribute('aria-label') === 'Talents'),
    );
    for (const slot of filled) {
      expect(visibleText(talents)).toContain(slot.talent?.name ?? '');
    }
  });

  it('lists the line book in pool order groups: in use, learned, to learn; golden marked', () => {
    const { root, page: p } = draw('v2: the book');
    p.click(slotButton(root, /^Talent slot 2: /));
    const dialog = first(byRole(root, 'dialog'));
    const rows = byClass(dialog, 'book-entry');
    // Slot 2 holds its talent first; then the learned one that is in no slot; then in slot 1; then the rest to learn.
    expect(rows.length).toBeGreaterThanOrEqual(7);
    expect(rows[0]?.getAttribute('class')).toContain('in-use');
    expect(visibleText(first(byClass(rows[0] as FakeElement, 'book-slot-mark')))).toBe(
      'In use, ✓ Slot 2',
    );
    expect(byClass(dialog, 'golden').length).toBeGreaterThan(0);
    // A golden entry also says it in words and a star, not only in colour.
    expect(byClass(dialog, 'golden-mark').length).toBeGreaterThan(0);
    expect(visibleText(dialog)).not.toContain('{');
  });

  it('learns for Bait, uses a learned talent for free, moves one from another slot and takes one out', () => {
    const { root, page: p, actions, creature } = draw('v2: the book');
    p.click(slotButton(root, /^Talent slot 2: /));
    const dialog = first(byRole(root, 'dialog'));
    const learn = first(byName(dialog, 'button', /^Learn .* for 10 Bait$/));
    expect(visibleText(learn)).toBe('Learn · 10');
    expect(badgesIn(learn)).toEqual([['Bait', '10']]);
    p.click(learn);
    expect(actions.onLearnTalentV2).toHaveBeenCalledTimes(1);
    expect(actions.onLearnTalentV2).toHaveBeenCalledWith(creature, expect.any(String));
    const use = first(byName(dialog, 'button', /^Put .* in slot 2$/));
    expect(visibleText(use)).toBe('Use');
    p.click(use);
    expect(actions.onSlotTalentV2).toHaveBeenCalledWith(creature, expect.any(String), 2);
    // Using one closes the drawer, as the old book did.
    expect(byRole(root, 'dialog')).toHaveLength(0);
  });

  it('shows the valley price (the price times the slot, step 9a) on the Learn button as an icon and a number, never as a word', () => {
    // The server sends the price of the slot the learning fills (`learnBait`); with the valley's systems on it is `school.price` times the slot.
    const scene = pageScene('v2: the book', { bait: 100 });
    const v2 = creatureV2(scene.creature);
    if (v2 === null) throw new Error('v2');
    const creature: Creature = {
      ...scene.creature,
      talentsV2: { ...v2.talentsV2, learnBait: 24 },
    };
    page = createPage();
    page.draw(
      <CreaturePage
        creature={creature}
        state={scene.state}
        gear={scene.gear}
        busy={false}
        actions={actionsWith()}
        focus={null}
        onBack={() => undefined}
        onAnswerCatch={() => undefined}
      />,
    );
    page.click(slotButton(page.root, /^Talent slot 2: /));
    const dialog = first(byRole(page.root, 'dialog'));
    const learn = first(byName(dialog, 'button', /^Learn /));
    expect(badgesIn(learn)).toEqual([['Bait', '24']]);
    expect(visibleText(learn)).toBe('Learn · 24');
    expect(visibleText(learn)).not.toMatch(/Acorn|Bait/);
  });

  it('offers Move here for a talent in another slot and Take out for the one in this slot', () => {
    const { root, page: p, actions, creature } = draw('v2: the book');
    p.click(slotButton(root, /^Talent slot 2: /));
    const dialog = first(byRole(root, 'dialog'));
    const move = first(byName(dialog, 'button', /^Move .* to slot 2$/));
    expect(visibleText(move)).toBe('Move here');
    const out = first(byName(dialog, 'button', /^Take .* out of slot 2$/));
    p.click(out);
    expect(actions.onSlotTalentV2).toHaveBeenCalledWith(creature, expect.any(String), null);
    // Taking one out leaves the book open to put another in.
    expect(byRole(root, 'dialog')).toHaveLength(1);
    p.click(move);
    expect(actions.onSlotTalentV2).toHaveBeenLastCalledWith(creature, expect.any(String), 2);
  });

  it('turns the Learn buttons off and says so when the Bait is short; free swaps stay on', () => {
    const { root, page: p } = draw('v2: Knack saved', { bait: 4 });
    p.click(slotButton(root, /^Talent slot 2: /));
    const dialog = first(byRole(root, 'dialog'));
    const learns = byName(dialog, 'button', /^Learn /);
    expect(learns.length).toBeGreaterThan(0);
    for (const button of learns) expect(button.hasAttribute('disabled')).toBe(true);
    expect(visibleText(dialog)).toContain('Not enough .');
    expect(badgesIn(first(byClass(dialog, 'book-short')))).toEqual([['Bait', '']]);
    for (const button of byName(dialog, 'button', /^Put /)) {
      expect(button.hasAttribute('disabled')).toBe(false);
    }
  });
});

describe('the cards and needs under combat v2', () => {
  it('shows the v2 slots on the card and has no old Talent Book need', () => {
    const scene = pageScene('v2: Knack saved');
    const kit = talentKit(scene.creature);
    const v2 = creatureV2(scene.creature);
    const filled = v2?.talentsV2.slots.filter((s) => s.talent !== null) ?? [];
    expect(kit.chips.filter((c) => c.kind === 'talent').map((c) => c.name)).toEqual(
      filled.map((s) => s.talent?.name),
    );
    // Open v1 slots with a book would ask to be filled; under v2 that button does not apply.
    const emptyV1: GameState = scene.state;
    expect(creatureNeeds(scene.creature, emptyV1).filter((n) => n.kind === 'talent')).toHaveLength(
      0,
    );
  });
});

describe('the Knack part of the raid configurator', () => {
  function drawConfigurator(parts: Parameters<typeof CreatureConfigurator>[0]['parts']) {
    page = createPage();
    const scene = teamSample();
    const plain = scene.team[0] as Creature;
    const creature = withV2(plain, { knack: 0, learned: [0, 1] });
    const actions = actionsWith();
    page.draw(
      <CreatureConfigurator
        creature={creature}
        state={scene.state}
        gear={scene.gear}
        busy={false}
        parts={parts}
        actions={actions}
      />,
    );
    return { root: page.root, page, actions, creature };
  }

  it('draws the Knack in the ability’s place and saves a pick as "raid"', async () => {
    const {
      root,
      page: p,
      actions,
      creature,
    } = drawConfigurator({
      stats: true,
      knack: true,
      ability: true,
    });
    const titles = byClass(root, 'cp-title').map((h) => visibleText(h));
    expect(titles).toEqual(['Stats', 'Knack']);
    p.click(slotButton(root, /^Knack: /));
    const dialog = first(byRole(root, 'dialog'));
    const v2 = creatureV2(creature);
    const other = v2?.knownKnacks[1];
    if (other === undefined) throw new Error('two Knacks');
    p.click(first(byName(dialog, 'button', new RegExp(other.name))));
    expect(actions.onKnack).toHaveBeenCalledWith(creature, other.id, 'raid');
    await flush();
  });

  it('shows the Knack and nothing to tap when it is locked', () => {
    const { root } = drawConfigurator({ knack: true, knackLocked: true });
    const section = first(byClass(root, 'creature-knack'));
    expect(find(section, (e) => e.localName === 'button')).toHaveLength(0);
    expect(visibleText(section)).not.toContain('None');
  });

  it('draws no Knack part for a creature the server sent without v2 fields', () => {
    page = createPage();
    const scene = teamSample();
    page.draw(
      <CreatureConfigurator
        creature={scene.team[0] as Creature}
        state={scene.state}
        gear={scene.gear}
        busy={false}
        parts={{ stats: true, knack: true }}
        actions={actionsWith()}
      />,
    );
    expect(byClass(page.root, 'cp-title').map((h) => visibleText(h))).toEqual(['Stats']);
  });
});
