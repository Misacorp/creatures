import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { combatV2 } from '../src/combat-v2';
import {
  content,
  dungeonContent,
  dungeonEvents,
  dungeonKeepsakes,
  expeditionContent,
  gamesContent,
  gearContent,
  talentContent,
  weatherContent,
} from '../src/index';

/**
 * Sync check between shipped content and the dev-only compendium (`docs/compendium/`).
 *
 * Matching rule, one per kind:
 * - Species, destinations, raid bosses, dungeon foes and floor bosses, room modifiers, keepsakes and
 *   mystery-room events, gear bases,
 *   supplies, talents (the pools, the signatures and the held-back ones), Boons and Omens (the
 *   planned ones too) and Valley Games events: the content's display
 *   name, as a heading, a bold name, or a table cell.
 *   (The compendium uses names for all of these. Species lines are covered by their stage 1 name.)
 * - Combat v2 (in development): every Knack, Knack family, keyword, rule card (except the plain baseline) and talent,
 *   by display name, in its own section: `combat.md` for the first four (one section each), the "Combat v2 talents"
 *   section of `talents.md` for the talents. The section matters: "Seal" is both a family and a keyword, and the v1
 *   talents above the v2 section must not stand in for a v2 talent. Boss and foe moves wait for the move library.
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

/** The text of one `## ` section of a compendium file (from its heading to the next `## ` heading). */
function section(file: string, heading: string): string {
  const text = compendiumFile(file);
  const start = text.search(new RegExp(`^## ${escapeRegExp(heading)}`, 'm'));
  if (start < 0) return '';
  const rest = text.slice(start + 3);
  const next = rest.search(/^## /m);
  return next < 0 ? rest : rest.slice(0, next);
}

function missingInSection(
  file: string,
  heading: string,
  items: { id: string; name: string }[],
): string[] {
  const text = section(file, heading);
  if (text === '') return [`add the section "## ${heading}" to docs/compendium/${file}`];
  return items
    .filter((item) => !hasNamedEntry(text, item.name))
    .map(
      (item) => `add ${item.id} ("${item.name}") under "## ${heading}" in docs/compendium/${file}`,
    );
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

  it('has every dungeon foe and floor boss in dungeon.md', () => {
    expect(missingNames('dungeon.md', dungeonContent.foes)).toEqual([]);
  });

  it('has every room modifier in dungeon.md', () => {
    expect(missingNames('dungeon.md', dungeonContent.modifiers)).toEqual([]);
  });

  it('has every dungeon keepsake in dungeon.md', () => {
    expect(missingNames('dungeon.md', [...dungeonKeepsakes])).toEqual([]);
  });

  it('has every mystery-room event in dungeon.md', () => {
    expect(missingNames('dungeon.md', [...dungeonEvents])).toEqual([]);
  });

  it('has every gear base in items.md', () => {
    expect(missingNames('items.md', gearContent.bases)).toEqual([]);
  });

  it('has every supply in items.md', () => {
    expect(missingNames('items.md', expeditionContent.supplies)).toEqual([]);
  });

  it('has every talent, signature and held-back talent in talents.md', () => {
    const all = [...talentContent.byId.values(), ...talentContent.deferred];
    expect(all.length).toBeGreaterThan(100);
    expect(missingNames('talents.md', all)).toEqual([]);
  });

  it('has every Valley Games event in games.md', () => {
    expect(gamesContent.events.length).toBeGreaterThanOrEqual(8);
    expect(missingNames('games.md', [...gamesContent.events])).toEqual([]);
  });

  it('has every Boon and Omen, live and planned, in weather.md', () => {
    expect(weatherContent.length).toBeGreaterThanOrEqual(20);
    expect(missingNames('weather.md', [...weatherContent])).toEqual([]);
  });

  it('has every combat v2 Knack family in combat.md', () => {
    const families = Object.keys(combatV2.families).map((name) => ({ id: name, name }));
    expect(families.length).toBeGreaterThanOrEqual(20);
    expect(missingInSection('combat.md', 'Knack families', families)).toEqual([]);
  });

  it('has every combat v2 Knack in combat.md', () => {
    const knacks = Object.values(combatV2.knacks);
    expect(knacks.length).toBeGreaterThanOrEqual(40);
    expect(missingInSection('combat.md', 'Knacks', knacks)).toEqual([]);
  });

  it('has every combat v2 keyword in combat.md', () => {
    const keywords = Object.values(combatV2.keywords).map((k) => ({ id: k.name, name: k.name }));
    expect(keywords.length).toBeGreaterThanOrEqual(25);
    expect(missingInSection('combat.md', 'Keywords', keywords)).toEqual([]);
  });

  it('has every combat v2 rule card (except the plain baseline) in combat.md', () => {
    const cards = Object.values(combatV2.cards).filter((c) => c.id !== 'plain');
    expect(cards.length).toBeGreaterThanOrEqual(15);
    expect(missingInSection('combat.md', 'Rule cards', cards)).toEqual([]);
  });

  it('has every combat v2 talent in the combat v2 section of talents.md', () => {
    const talents = Object.values(combatV2.talents);
    expect(talents.length).toBeGreaterThanOrEqual(30);
    expect(missingInSection('talents.md', 'Combat v2 talents', talents)).toEqual([]);
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
    // A name in another section does not count (Seal is a family and a keyword).
    expect(
      missingInSection('combat.md', 'Keywords', [{ id: 'x', name: 'No Such Keyword' }]),
    ).toHaveLength(1);
    expect(missingInSection('combat.md', 'No such section', [])).toHaveLength(1);
  });
});
