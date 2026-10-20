import { gearContent } from '@creatures/game';
import { afterEach, describe, expect, it } from 'vitest';
import { PopoverHost } from '../PopoverHost';
import { byClass, createPage, find, visibleText, type FakeElement, type Page } from '../test-dom';
import { CountBadgeList } from './CountBadge';
import { FindBlueprint } from './FindBlueprint';
import { FindCreature } from './FindCreature';
import { FindItem, FindItems } from './FindItem';
import { FindList } from './FindRow';

/**
 * The shared "find" components (2026-10-20): anything gained or found is drawn with them, so a player
 * learns to recognise it. Gear is a `FindItem`, a blueprint a `FindBlueprint` (the same box, no rarity), a
 * creature a `FindCreature`; they sit in a `FindList`; resources are count badges with no "?" mark.
 */

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

function draw(vnode: preact.ComponentChild): Page {
  page = createPage();
  page.draw(<PopoverHost onOpenHowTo={() => undefined}>{vnode}</PopoverHost>);
  return page;
}

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

const classes = (el: FakeElement): string => el.getAttribute('class') ?? '';
const nameOf = (row: FakeElement): string => visibleText(first(byClass(row, 'find-row-name')));
const tagTexts = (row: FakeElement): string[] =>
  byClass(first(byClass(row, 'find-row-tags')), 'item-badge').map(visibleText);

const base = (test: (b: (typeof gearContent.bases)[number]) => boolean) => {
  const found = gearContent.bases.find(test);
  if (found === undefined) throw new Error('the content lacks the base this test needs');
  return found;
};
const ember = base((b) => b.tag === 'ember' && b.set === undefined);
const neutral = base((b) => b.tag === 'neutral');

describe('a found item', () => {
  it('is a box with its name, the item level only for a screen reader, and a rarity badge', () => {
    const p = draw(
      <FindList label="Found">
        <FindItem baseId={ember.id} rarity="rare" level={6} />
      </FindList>,
    );
    const row = first(byClass(p.root, 'find-row'));
    expect(row.localName).toBe('li');
    expect(nameOf(row)).toBe(`${ember.name}, item level 6`);
    expect(visibleText(first(byClass(row, 'rarity-tag')))).toBe('Rare');
    expect(classes(first(byClass(row, 'find-row-name')))).toContain('rarity-rare');
  });

  it('lists several pieces in one named list', () => {
    const p = draw(
      <FindItems
        label="Gear"
        pieces={[
          { id: 'a', baseId: ember.id, rarity: 'common', itemLevel: 3 },
          { id: 'b', baseId: neutral.id, rarity: 'epic', itemLevel: 5 },
        ]}
      />,
    );
    const list = first(byClass(p.root, 'find-list'));
    expect(list.getAttribute('aria-label')).toBe('Gear');
    expect(byClass(list, 'find-row')).toHaveLength(2);
  });
});

describe('a found blueprint', () => {
  it('is the same box as an item, named "Blueprint: Name", with a help tag and the crafted item tags, never a rarity', () => {
    const p = draw(
      <FindList label="Found">
        <FindBlueprint baseId={ember.id} />
      </FindList>,
    );
    const row = first(byClass(p.root, 'find-row'));
    expect(nameOf(row)).toBe(`Blueprint: ${ember.name}`);
    // The first image is a plain frame (no level, no rarity badge).
    expect(classes(first(row.childNodes as FakeElement[]))).toContain('item-frame');
    expect(byClass(row, 'item-lv')).toHaveLength(0);
    expect(byClass(row, 'rarity-tag')).toHaveLength(0);
    const tags = tagTexts(row);
    expect(tags).toContain('Blueprint');
    expect(tags).toContain('New!');
    expect(tags.some((t) => t.includes('Ember'))).toBe(true);
    // The "Blueprint" tag is a button that opens the blueprint help.
    const help = first(
      find(row, (e) => e.localName === 'button' && visibleText(e).includes('Blueprint')),
    );
    expect(classes(help)).toContain('gtag');
  });

  it('has no element tag when the item has none', () => {
    const p = draw(
      <FindList label="Found">
        <FindBlueprint baseId={neutral.id} />
      </FindList>,
    );
    const tags = tagTexts(first(byClass(p.root, 'find-row')));
    expect(tags.some((t) => t.includes('Ember') || t.includes('Tide'))).toBe(false);
    expect(tags).toContain('Blueprint');
  });

  it('says a repeat find is known, and what it added', () => {
    const p = draw(
      <FindList label="Found">
        <FindBlueprint baseId={ember.id} duplicate marks={3} />
        <FindBlueprint baseId={neutral.id} duplicate />
      </FindList>,
    );
    const [one, two] = byClass(p.root, 'find-row');
    expect(visibleText(one as FakeElement)).toContain('Known');
    expect(visibleText(one as FakeElement)).toContain('Quality 3 / 10');
    expect(visibleText(two as FakeElement)).toContain('It became scrap.');
  });
});

describe('a found creature', () => {
  const creature = {
    species: 'splashet',
    shiny: true,
    talent: null,
    talentNew: false,
    badges: [
      { text: 'New!', entry: null },
      { text: 'First on server!', entry: 'first-on-server' },
    ],
  };

  it('is a card with its name, its badges and Shiny!, and no talent box without a talent', () => {
    const p = draw(
      <FindList label="Found">
        <FindCreature creature={creature} />
      </FindList>,
    );
    const card = first(byClass(p.root, 'find-card'));
    expect(visibleText(first(byClass(card, 'find-name')))).toContain('Splashet');
    const tags = visibleText(first(byClass(card, 'find-tags')));
    expect(tags).toContain('New!');
    expect(tags).toContain('First on server!');
    expect(tags).toContain('Shiny!');
    expect(byClass(card, 'find-talent')).toHaveLength(0);
  });

  it('holds what the screen puts under it (a duplicate choice) and marks it as a duplicate', () => {
    const p = draw(
      <FindList label="Found">
        <FindCreature creature={creature} duplicate>
          <p class="under">Pick one</p>
        </FindCreature>
      </FindList>,
    );
    const card = first(byClass(p.root, 'find-card'));
    expect(classes(card)).toContain('dup');
    expect(visibleText(first(byClass(card, 'under')))).toBe('Pick one');
  });
});

describe('resources of a find', () => {
  it('are count badges that open their help with no "?" marker', () => {
    const p = draw(
      <CountBadgeList
        label="Rewards"
        bare
        items={[
          {
            key: 'essence',
            icon: { kind: 'glyph', id: 'gem' },
            amount: 4,
            label: 'Essence',
            entry: 'essence',
          },
        ]}
      />,
    );
    const tag = first(find(p.root, (e) => e.localName === 'button'));
    expect(classes(tag)).toContain('gtag-chip');
    expect(classes(tag)).toContain('gtag-bare');
  });

  it('keep the "?" where they are not a find (a cost, a price) unless asked', () => {
    const p = draw(
      <CountBadgeList
        label="Cost"
        items={[
          {
            key: 'essence',
            icon: { kind: 'glyph', id: 'gem' },
            amount: 4,
            label: 'Essence',
            entry: 'essence',
          },
        ]}
      />,
    );
    const tag = first(find(p.root, (e) => e.localName === 'button'));
    expect(classes(tag)).not.toContain('gtag-bare');
  });
});
