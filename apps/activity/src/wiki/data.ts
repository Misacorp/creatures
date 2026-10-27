/**
 * The wiki's data, read from the game's content and the combat lab's draft. This is the only wiki module
 * that imports `@creatures/game` and `@creatures/lab`, and it runs only at build time (the Vite plugin
 * loads it) and in tests: no wiki code is in the app's bundle. Everything is derived from the data, so a
 * new creature, talent or Knack shows up on the page with no change to the page's code.
 */
import { content, talentContent, talentSignature, talentText } from '@creatures/game';
import { FAMILIES, FORM_KNACKS, KEYWORDS, KNACKS, LINE_POOLS, TALENTS } from '@creatures/lab';
import type { WikiData } from './types';

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
    return {
      id: def.id,
      name: def.name,
      text: text.text,
      about: text.about,
      signature: signatureOf !== null,
    };
  });

  return {
    creatures,
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
