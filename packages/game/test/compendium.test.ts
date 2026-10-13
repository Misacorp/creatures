import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { content, dungeonContent, expeditionContent, gearContent } from '../src/index';

/**
 * Sync check between shipped content and the dev-only compendium (`docs/compendium/`).
 *
 * Matching rule, one per kind:
 * - Species, destinations, raid bosses, dungeon foes and room bosses, room modifiers, gear bases,
 *   enchants and supplies: the content's display name, as a heading, a bold name, or a table cell.
 *   (The compendium uses names for all of these. Species lines are covered by their stage 1 name.)
 * - Journal entries: the entry id in backticks (the journal key is keyed by id).
 *
 * To fix a failure, add the entry to the named compendium file (see its README, "How to add an entry").
 */

function compendiumFile(file: string): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, '../../../docs/compendium', file), 'utf8');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when `name` is defined in `text` as a heading, a bold name or a table cell. */
function hasNamedEntry(text: string, name: string): boolean {
  const n = escapeRegExp(name);
  return [
    new RegExp(`^#{1,6} ${n}(?![\\w])`, 'm'),
    new RegExp(`\\*\\*${n}\\*\\*`),
    new RegExp(`\\|\\s*${n}\\s*\\|`),
  ].some((re) => re.test(text));
}

function missingNames(file: string, items: { id: string; name: string }[]): string[] {
  const text = compendiumFile(file);
  return items
    .filter((item) => !hasNamedEntry(text, item.name))
    .map((item) => `add ${item.id} ("${item.name}") to docs/compendium/${file}`);
}

describe('compendium is in sync with shipped content', () => {
  it('has every species in creatures.md', () => {
    expect(missingNames('creatures.md', content.creatures)).toEqual([]);
  });

  it('has every destination in places.md', () => {
    expect(missingNames('places.md', expeditionContent.destinations)).toEqual([]);
  });

  it('has every raid boss in bosses.md', () => {
    expect(missingNames('bosses.md', content.bosses)).toEqual([]);
  });

  it('has every dungeon foe and room boss in dungeon.md', () => {
    expect(missingNames('dungeon.md', dungeonContent.foes)).toEqual([]);
  });

  it('has every room modifier in dungeon.md', () => {
    expect(missingNames('dungeon.md', dungeonContent.modifiers)).toEqual([]);
  });

  it('has every gear base in items.md', () => {
    expect(missingNames('items.md', gearContent.bases)).toEqual([]);
  });

  it('has every enchant in items.md', () => {
    expect(missingNames('items.md', gearContent.enchants)).toEqual([]);
  });

  it('has every supply in items.md', () => {
    expect(missingNames('items.md', expeditionContent.supplies)).toEqual([]);
  });

  it('has every journal entry id in journal.md', () => {
    const text = compendiumFile('journal.md');
    const missing = expeditionContent.journal.entries
      .filter((entry) => !text.includes(`\`${entry.id}\``))
      .map((entry) => `add ${entry.id} to docs/compendium/journal.md`);
    expect(missing).toEqual([]);
  });

  it('notices a missing entry (the check can fail)', () => {
    expect(hasNamedEntry('### Splashet (stage 1)', 'Splashet')).toBe(true);
    expect(hasNamedEntry('### Splashetter (stage 1)', 'Splashet')).toBe(false);
    expect(hasNamedEntry('Splashet is mentioned only in prose.', 'Splashet')).toBe(false);
  });
});
