import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Creature } from './api';
import { Collection } from './Collection';
import { SAMPLE_GEAR, SAMPLE_STATE, sampleRoster } from './creature-card-sample';
import { cardDomId } from './creature-card-view';
import { filterStorageKey } from './creature-find';
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
const stored = new Map<string, string>();

beforeEach(() => {
  stored.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => {
        stored.set(key, value);
      },
    },
  });
});

afterEach(() => {
  page?.unmount();
  page = null;
  vi.useRealTimers();
  Reflect.deleteProperty(globalThis, 'localStorage');
});

const noop = (): void => undefined;
const actions = {
  onEquip: () => Promise.resolve(true),
  onEquipBest: () => Promise.resolve(undefined),
  onRibbon: noop,
  onEvolve: noop,
  onRename: noop,
  onLounge: noop,
  onSlotTalent: noop,
};

function draw(
  creatures: Creature[],
  options: { viewerId?: string; waitingFor?: string } = {},
): { page: Page; root: FakeElement } {
  page ??= createPage();
  const pending =
    options.waitingFor === undefined
      ? []
      : SAMPLE_STATE.pending.slice(0, 1).map((card) => ({
          ...card,
          offered: {
            ...card.offered,
            teach: [options.waitingFor ?? ''],
            fuse: [options.waitingFor ?? ''],
          },
        }));
  page.draw(
    <Collection
      state={{ ...SAMPLE_STATE, creatures, pending }}
      gear={SAMPLE_GEAR}
      busy={false}
      catchActions={{ choose: noop, chooseAll: noop }}
      {...(options.viewerId === undefined ? {} : { viewerId: options.viewerId })}
      {...actions}
    />,
  );
  return { page, root: page.root };
}

const roster = sampleRoster(12);

function cards(root: FakeElement): FakeElement[] {
  return find(
    root,
    (el) =>
      el.localName === 'li' &&
      (el.getAttribute('id') ?? '').startsWith('creature-card-') &&
      !(el.getAttribute('id') ?? '').includes('-sheet'),
  );
}

function cardNames(root: FakeElement): string[] {
  return cards(root).map((c) => nameOf(find(c, (e) => e.localName === 'h3')[0] as FakeElement));
}

function field(root: FakeElement): FakeElement {
  const input = byRole(root, 'combobox')[0];
  if (input === undefined) throw new Error('no search field');
  return input;
}

function options(root: FakeElement): FakeElement[] {
  return byRole(root, 'option');
}

function chip(root: FakeElement, name: RegExp | string): FakeElement {
  const found = byName(root, 'button', name)[0];
  if (found === undefined) throw new Error(`no chip ${String(name)}`);
  return found;
}

describe('the tab', () => {
  it('draws one small card per creature, and no finder for a short roster', () => {
    const { root } = draw(roster.slice(0, 3));
    expect(cards(root)).toHaveLength(3);
    expect(byRole(root, 'combobox')).toHaveLength(0);
    expect(find(root, (e) => e.getAttribute('aria-label') === 'Find a creature')).toHaveLength(0);
  });

  it('says so when there are no creatures', () => {
    const { root } = draw([]);
    expect(visibleText(root)).toBe('No creatures yet.');
  });

  it('shows the finder from four creatures up, with the whole roster counted', () => {
    const { root } = draw(roster);
    expect(cards(root)).toHaveLength(12);
    expect(field(root)).toBeDefined();
    expect(visibleText(byClass(root, 'finder-result')[0] as FakeElement)).toBe('12 creatures');
  });
});

describe('the search field', () => {
  it('is a combobox that names its list', () => {
    const { root } = draw(roster);
    const input = field(root);
    const list = byRole(root, 'listbox')[0] as FakeElement;
    expect(input.getAttribute('aria-controls')).toBe(list.getAttribute('id'));
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(list.hasAttribute('hidden')).toBe(true);
    expect(input.getAttribute('maxlength')).toBe('40');
  });

  it('suggests creatures as you type, and says how many', () => {
    const { page: p, root } = draw(roster);
    const input = field(root);
    p.type(input, 'zip');
    expect(options(root).map((o) => visibleText(o))).toEqual(['ZipmouseLv 9']);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.getAttribute('aria-activedescendant')).toBe(options(root)[0]?.getAttribute('id'));
    expect(options(root)[0]?.getAttribute('aria-selected')).toBe('true');
    const status = find(
      root,
      (e) => e.getAttribute('role') === 'status' && e.getAttribute('class') === 'visually-hidden',
    )[0];
    expect(visibleText(status as FakeElement)).toBe('1 suggestion');
  });

  it('finds by nickname and shows the species under it', () => {
    const { page: p, root } = draw(roster);
    p.type(field(root), 'buddy 5');
    const [option] = options(root);
    expect(visibleText(option as FakeElement)).toContain('Buddy 5');
    expect(visibleText(option as FakeElement)).toContain('Thornbuck');
  });

  it('says there is no match, with the list closed', () => {
    const { page: p, root } = draw(roster);
    p.type(field(root), 'zzz');
    expect(options(root)).toHaveLength(0);
    expect(field(root).getAttribute('aria-expanded')).toBe('false');
    const status = find(root, (e) => e.getAttribute('class') === 'visually-hidden')[0];
    expect(visibleText(status as FakeElement)).toBe('No match');
  });

  it('moves through the suggestions with the arrow keys, wrapping round', () => {
    const { page: p, root } = draw(roster);
    const input = field(root);
    p.type(input, 'e');
    const count = options(root).length;
    expect(count).toBeGreaterThan(2);
    const selected = (): number =>
      options(root).findIndex((o) => o.getAttribute('aria-selected') === 'true');
    expect(selected()).toBe(0);
    p.key(input, 'ArrowDown');
    expect(selected()).toBe(1);
    expect(input.getAttribute('aria-activedescendant')).toBe(options(root)[1]?.getAttribute('id'));
    p.key(input, 'ArrowUp');
    p.key(input, 'ArrowUp');
    expect(selected()).toBe(count - 1);
    p.key(input, 'ArrowDown');
    expect(selected()).toBe(0);
  });

  it('closes the list with Escape, then clears the field with a second Escape', () => {
    const { page: p, root } = draw(roster);
    const input = field(root);
    p.type(input, 'zip');
    p.key(input, 'Escape');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.value).toBe('zip');
    p.key(input, 'Escape');
    expect(input.value).toBe('');
  });

  it('clears with the clear button', () => {
    const { page: p, root } = draw(roster);
    const input = field(root);
    p.type(input, 'zip');
    p.click(byName(root, 'button', 'Clear the search')[0] as FakeElement);
    expect(input.value).toBe('');
    expect(options(root)).toHaveLength(0);
  });
});

describe('choosing a suggestion', () => {
  it('scrolls to the card, focuses it and marks it (Enter)', () => {
    const { page: p, root } = draw(roster);
    const input = field(root);
    p.type(input, 'zip');
    p.key(input, 'Enter');
    const target = roster.find((c) => c.species === 'zipmouse') as Creature;
    const card = p.document.getElementById(cardDomId(target.id)) as FakeElement;
    expect(card.scrolled).toBe(1);
    expect(card.focused).toBe(1);
    expect(card.getAttribute('class')).toContain('found');
    expect(input.value).toBe('');
    // Only that card is marked.
    expect(
      cards(root).filter((c) => (c.getAttribute('class') ?? '').includes('found')),
    ).toHaveLength(1);
  });

  it('does the same with a tap on the suggestion', () => {
    const { page: p, root } = draw(roster);
    p.type(field(root), 'sprout');
    p.click(options(root)[0] as FakeElement);
    const target = roster.find((c) => c.species === 'sproutle') as Creature;
    expect(p.document.getElementById(cardDomId(target.id))?.scrolled).toBe(1);
  });

  it('takes the arrow-chosen suggestion, not the first', () => {
    const { page: p, root } = draw(roster);
    const input = field(root);
    p.type(input, 'mole');
    p.key(input, 'ArrowDown');
    p.key(input, 'Enter');
    // "mole" suggests Magmole (level 14) then Ashmole (level 13): the arrow chose the second.
    const ashmole = roster.find((c) => c.species === 'ashmole') as Creature;
    expect(p.document.getElementById(cardDomId(ashmole.id))?.scrolled).toBe(1);
  });

  it('forgets the mark after a few seconds', () => {
    vi.useFakeTimers();
    const { page: p, root } = draw(roster);
    p.type(field(root), 'zip');
    p.key(field(root), 'Enter');
    expect(cards(root).some((c) => (c.getAttribute('class') ?? '').includes('found'))).toBe(true);
    p.update(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(cards(root).some((c) => (c.getAttribute('class') ?? '').includes('found'))).toBe(false);
  });

  it('shows a creature the chips hide, by clearing them', () => {
    const { page: p, root } = draw(roster);
    p.click(chip(root, /^Ember/));
    expect(cardNames(root)).not.toContain('Zipmouse');
    p.type(field(root), 'zip');
    p.key(field(root), 'Enter');
    expect(cardNames(root)).toContain('Zipmouse');
    expect(cards(root)).toHaveLength(12);
    expect(chip(root, /^Ember/).getAttribute('aria-pressed')).toBe('false');
    const target = roster.find((c) => c.species === 'zipmouse') as Creature;
    expect(p.document.getElementById(cardDomId(target.id))?.scrolled).toBe(1);
  });
});

describe('the filter chips', () => {
  it('"Needs you" shows the creatures that need the player and says how many', () => {
    const { page: p, root } = draw(roster);
    const needs = chip(root, /^Needs you/);
    expect(visibleText(needs)).toBe('Needs you 2');
    expect(needs.getAttribute('aria-pressed')).toBe('false');
    p.click(needs);
    expect(needs.getAttribute('aria-pressed')).toBe('true');
    expect(cardNames(root)).toEqual(['Splashet', 'Cindle']);
    expect(visibleText(byClass(root, 'finder-result')[0] as FakeElement)).toContain(
      'Showing 2 of 12',
    );
  });

  it('an element chip and a role chip combine', () => {
    const { page: p, root } = draw(roster);
    p.click(chip(root, /^Ember/));
    expect(cardNames(root)).toEqual(['Cindle', 'Pyrelynx', 'Ashmole', 'Magmole']);
    p.click(chip(root, 'Payoff'));
    expect(cardNames(root)).toEqual(['Cindle', 'Pyrelynx']);
  });

  it('two elements mean either', () => {
    const { page: p, root } = draw(roster);
    p.click(chip(root, /^Ember/));
    p.click(chip(root, /^Grove/));
    expect(cardNames(root)).toHaveLength(6);
  });

  it('say so when nothing matches, and the way out clears them all', () => {
    const { page: p, root } = draw(roster);
    p.click(chip(root, /^Spark/));
    p.click(chip(root, 'Guard'));
    expect(cards(root)).toHaveLength(0);
    expect(visibleText(byClass(root, 'finder-result')[0] as FakeElement)).toContain(
      'No creature matches these filters.',
    );
    p.click(byName(root, 'button', 'Clear filters')[0] as FakeElement);
    expect(cards(root)).toHaveLength(12);
    expect(byName(root, 'button', 'Clear filters')).toHaveLength(0);
  });

  it('"Needs you" with nothing to do says so', () => {
    const calm: Creature[] = roster.map((c) => {
      const { evolution, ...rest } = c;
      void evolution;
      return { ...rest, ribbon: null, waiting: false };
    });
    const { page: p, root } = draw(calm);
    p.click(chip(root, /^Needs you 0/));
    expect(visibleText(byClass(root, 'finder-result')[0] as FakeElement)).toContain(
      'Nothing needs you right now.',
    );
  });

  it('every chip is a toggle button', () => {
    const { root } = draw(roster);
    const group = find(
      root,
      (e) => e.getAttribute('role') === 'group' && e.getAttribute('aria-label') === 'Filters',
    )[0] as FakeElement;
    const buttons = find(group, (e) => e.localName === 'button');
    expect(buttons).toHaveLength(1 + 4 + 4);
    expect(buttons.every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
  });
});

describe('the last chips', () => {
  it('are remembered per viewer, without "Needs you"', () => {
    const first = draw(roster, { viewerId: 'u1' });
    first.page.click(chip(first.root, /^Ember/));
    first.page.click(chip(first.root, /^Needs you/));
    expect(JSON.parse(stored.get(filterStorageKey('u1')) ?? 'null')).toEqual({
      elements: ['ember'],
      roles: [],
    });
    first.page.unmount();
    page = null;

    const again = draw(roster, { viewerId: 'u1' });
    expect(chip(again.root, /^Ember/).getAttribute('aria-pressed')).toBe('true');
    expect(chip(again.root, /^Needs you/).getAttribute('aria-pressed')).toBe('false');
    expect(cards(again.root)).toHaveLength(4);
    again.page.unmount();
    page = null;

    const other = draw(roster, { viewerId: 'u2' });
    expect(cards(other.root)).toHaveLength(12);
  });

  it('are not kept without a viewer', () => {
    const { page: p, root } = draw(roster);
    p.click(chip(root, /^Ember/));
    expect(stored.size).toBe(0);
  });
});

describe('a waiting catch', () => {
  it('shows at the top and its creature has a gold button that takes the player there', () => {
    const { page: p, root } = draw(roster, { waitingFor: 'sample-1' });
    const section = p.document.getElementById('pending-catches') as FakeElement;
    expect(section).toBeDefined();
    expect(section.getAttribute('tabindex')).toBe('-1');
    const card = p.document.getElementById(cardDomId('sample-1')) as FakeElement;
    const gold = byName(card, 'button', /^Answer a waiting catch/)[0] as FakeElement;
    expect(gold).toBeDefined();
    p.click(gold);
    expect(section.focused).toBe(1);
    expect(section.scrolled).toBe(1);
    // The finder counts it under "Needs you" with the ribbon and the evolution.
    expect(visibleText(chip(root, /^Needs you/))).toBe('Needs you 3');
  });
});
