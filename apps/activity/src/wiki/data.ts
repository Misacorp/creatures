/**
 * The wiki's data, read from the game's content and the combat lab's draft. This is the only wiki module
 * that imports `@creatures/game` and `@creatures/lab`, and it runs only at build time (the Vite plugin
 * loads it) and in tests: no wiki code is in the app's bundle. Everything is derived from the data, so a
 * new creature, talent or Knack shows up on the page with no change to the page's code.
 */
import {
  content,
  effectiveStats,
  gearLine,
  glossaryEntry,
  GLOSSARY_IDS,
  RARITIES,
  RoleSchema,
  talentContent,
  talentSignature,
  talentText,
} from '@creatures/game';
import {
  FAMILIES,
  FORM_KNACKS,
  KEYWORDS,
  KNACKS,
  LINE_POOLS,
  MODIFIER_CATEGORIES,
  MODIFIERS,
  OWN_KNACKS,
  TALENTS,
} from '@creatures/lab';
import { creatureSprite } from '../sprites/creature-sprites';
import { elementIcon } from '../sprites/element-icons';
import { artPath, elementArtPath, spriteSvg } from './art';
import { capital } from './html';
import type { WikiData, WikiTerm } from './types';

/** A role or rarity as the game's glossary entry says it (its title, one line and lines). */
function term(id: string, entryId: string): WikiTerm {
  const entry = glossaryEntry(entryId);
  return {
    id,
    name: entry?.title ?? capital(id),
    short: entry?.short ?? '',
    lines: [...(entry?.lines ?? [])],
    species: entry?.visual?.kind === 'species' ? entry.visual.id : null,
  };
}

/** A gear line's id in `gear-lines.json`: an element line (`tide-attunement`) is its `attunement`. */
function rawLineId(line: { id: string; element: string | null }): string {
  return line.element === null ? line.id : line.id.slice(line.element.length + 1);
}

/** The wiki's data from the shipped content and the lab's draft. */
export function loadWikiData(): WikiData {
  const abilities = new Map(content.finaleAbilities.map((a) => [a.id, a]));
  const creatures = content.creatures.map((c) => {
    const pool = talentContent.pools.get(c.line) ?? [];
    const signature = talentSignature(c.line);
    const ability = c.ability === undefined ? undefined : abilities.get(c.ability.id);
    return {
      id: c.id,
      name: c.name,
      line: c.line,
      stage: c.stage,
      element: c.element,
      rarity: c.rarity,
      role: c.role,
      levelCap: c.levelCap,
      baseStats: { ...c.baseStats },
      capStats: { ...effectiveStats(c, c.levelCap, 0) },
      growth: { ...c.growth },
      evolvesTo: [c.evolvesTo?.species, c.altEvolvesTo?.species].filter(
        (id): id is string => id !== undefined,
      ),
      festival: c.festival === true,
      flavor: c.flavor,
      ability:
        ability === undefined ? null : { name: ability.name, description: ability.description },
      talents: [...pool, ...(signature === undefined ? [] : [signature])].map((t) => t.id),
      knacks: [...(FORM_KNACKS[c.id] ?? [])],
      ownKnacks: [...(OWN_KNACKS[c.id] ?? [])],
      draftTalents: [...(LINE_POOLS[c.line] ?? [])],
    };
  });

  const currentTalents = [
    ...[...talentContent.pools.entries()].flatMap(([line, pool]) =>
      pool.map((t) => ({ def: t, signatureOf: null as string | null, line })),
    ),
    ...[...talentContent.signatures.entries()].map(([line, t]) => ({
      def: t,
      signatureOf: line,
      line,
    })),
  ].map(({ def, signatureOf }) => {
    const text = talentText(def, false);
    // The modifier it is the effect of: its gear line, by the id the library uses (an element line without its element).
    const line = 'line' in def.effect ? gearLine(def.effect.line) : undefined;
    const modifier = line === undefined ? undefined : rawLineId(line);
    return {
      ...(modifier === undefined ? {} : { modifier }),
      id: def.id,
      name: def.name,
      text: text.text,
      about: text.about,
      signature: signatureOf !== null,
    };
  });

  const categories: readonly string[] = MODIFIER_CATEGORIES;

  const art = content.creatures.flatMap((c) => {
    const sprite = creatureSprite(c.id);
    return sprite === undefined ? [] : [{ id: c.id, src: artPath(c.id), svg: spriteSvg(sprite) }];
  });

  const elementArt = content.elements.flatMap((e) => {
    const icon = elementIcon(e.id);
    return icon === undefined
      ? []
      : [{ id: e.id, src: elementArtPath(e.id), svg: spriteSvg(icon) }];
  });

  return {
    creatures,
    art,
    elementArt,
    roles: RoleSchema.options.map((id) => term(id, GLOSSARY_IDS.role(id))),
    // The game has one glossary entry for creature rarity, so each rarity says the same words.
    rarities: RARITIES.map((id) => ({ ...term(id, 'rarity'), name: capital(id), species: null })),
    currentTalents,
    knacks: Object.values(KNACKS).map((k) => ({
      id: k.id,
      name: k.name,
      family: k.family,
      text: k.text,
      intent: k.intent,
    })),
    draftTalents: Object.values(TALENTS).map((t) => ({
      id: t.id,
      name: t.name,
      text: t.text,
      intent: t.intent,
      roles: [...t.roles],
    })),
    modifiers: [...MODIFIERS]
      .sort(
        (a, b) =>
          categories.indexOf(a.category) - categories.indexOf(b.category) ||
          a.name.localeCompare(b.name, 'en'),
      )
      .map((m) => ({
        id: m.id,
        name: m.name,
        text: m.text,
        category: m.category,
        roles: [...m.roles],
        status: m.status,
        kind: m.kind,
        draftTalents: [...m.talents],
        also: [...m.also],
      })),
    draftPools: Object.entries(LINE_POOLS).map(([line, talents]) => ({
      line,
      talents: [...talents],
    })),
    keywords: Object.entries(KEYWORDS).map(([name, k]) => ({
      name,
      means: k.means,
      not: k.not,
      step: k.step,
    })),
    families: Object.entries(FAMILIES).map(([name, text]) => ({ name, text })),
    elements: content.elements.map((e) => ({ id: e.id, name: e.name })),
    elementChart: content.elementChart.map((p) => ({ ...p })),
  };
}
