import { content, gearContent, glossaryEntry } from '@creatures/game';
import { afterEach, describe, expect, it } from 'vitest';
import { GearTagBadge, ItemCorners } from './GearArt';
import { elementEntry, type ElementContext } from './sprites/ElementChip';
import { byClass, createPage, visibleText, type Page } from './test-dom';

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

const sources = import.meta.glob<string>(['./**/*.tsx', '!./**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('an element explains itself by whose it is', () => {
  const contexts: ElementContext[] = ['creature', 'boss', 'place', 'gear'];

  it('has an entry for every element in every context, each a different one', () => {
    for (const element of content.elements) {
      const ids = contexts.map((c) => elementEntry(element.id, c));
      expect(new Set(ids).size, element.id).toBe(contexts.length);
      for (const id of ids) expect(glossaryEntry(id), id).toBeDefined();
    }
  });

  it('says who hits an Ember boss hardest, and what an Ember place gives', () => {
    expect(glossaryEntry(elementEntry('ember', 'boss'))?.short).toBe(
      'Tide creatures deal it 50% more damage, Grove creatures 25% less.',
    );
    expect(glossaryEntry(elementEntry('ember', 'place'))?.lines).toContain(
      'Shards found here are Ember shards.',
    );
  });

  it('gives bosses, foes, places and blueprints their own context', () => {
    const uses: [string, string][] = [
      ['./BossCard.tsx', 'context="boss"'],
      ['./Stage.tsx', 'context="boss"'],
      ['./PopoverHost.tsx', 'context="boss"'],
      ['./PlaceCard.tsx', 'context="place"'],
      ['./Blueprints.tsx', 'context="gear"'],
    ];
    for (const [file, text] of uses) expect(sources[file], file).toContain(text);
  });
});

describe('item badges and corners', () => {
  it('shows a role Charm and the Compass by their tag, and nothing for a neutral base', () => {
    const role = gearContent.bases.find((b) => b.tag === 'guard');
    const compass = gearContent.bases.find((b) => b.tag === 'explorer');
    const neutral = gearContent.bases.find((b) => b.tag === 'neutral');
    if (role === undefined || compass === undefined || neutral === undefined) {
      throw new Error('the gear content lacks a guard, explorer or neutral base');
    }
    page = createPage();
    page.draw(
      <p>
        <GearTagBadge baseId={role.id} plain />
        <GearTagBadge baseId={compass.id} plain />
        <GearTagBadge baseId={neutral.id} plain />
      </p>,
    );
    expect(byClass(page.root, 'item-badge').map((b) => visibleText(b))).toEqual([
      'Guard',
      'Explorer',
    ]);
    expect(glossaryEntry('gear-tag-guard')?.short).toBe('Only a Guard can wear it.');
  });

  it('draws the slot icon with the item level, in one component used everywhere', () => {
    page = createPage();
    page.draw(
      <span>
        <ItemCorners level={4} baseId="kelp-cap" />
      </span>,
    );
    expect(byClass(page.root, 'item-slot')).toHaveLength(1);
    expect(visibleText(page.root)).toBe('Lv 4');
    const direct = Object.entries(sources)
      .filter(([file, source]) => file !== './GearArt.tsx' && /<ItemLevel\b/.test(source))
      .map(([file]) => file);
    expect(direct).toEqual([]);
  });
});
