/**
 * Combat v2 content as data (`@creatures/game/combat-v2`): the rules numbers, the Knacks and their families, the forms'
 * armour, own Knacks and stat changes, the talents with their line pools, the move library, the boss rule cards, the raid bosses, the raid track, the dungeon
 * foes and the keywords, schema-checked at import
 * (docs/design/combat/content-as-data.md). A separate entry point on purpose: nothing in the shipped game imports it until
 * phase 4, so the worker's bundle and start-up do not grow before then.
 */
import { content } from '../content';
import { dungeonContent } from '../content/dungeon';
import { gearContent } from '../content/gear';
import cards from './data/cards.json';
import foes from './data/foes.json';
import forms from './data/forms.json';
import keywords from './data/keywords.json';
import knacks from './data/knacks.json';
import moves from './data/moves.json';
import raidBosses from './data/raid-bosses.json';
import raidTrack from './data/raid-track.json';
import rules from './data/rules.json';
import talents from './data/talents.json';
import { knownKnacksOf } from './known-knacks';
import { loadCombatV2, type CombatV2Pack } from './load';
import { rollV2Talent, talentWorksFor, v2PoolOf, type V2Roll } from './talent-book';

export * from './boss-schema';
export * from './fx-schema';
export * from './known-knacks';
export * from './load';
export * from './moves';
export * from './rules-schema';
export * from './schema';
export * from './talent-book';
export * from './track-schema';

/** The shipped combat v2 content, checked against the shipped species. */
export const combatV2: CombatV2Pack = loadCombatV2(
  { rules, moves, knacks, forms, talents, cards, raidBosses, raidTrack, foes, keywords },
  content.creatures,
  { bosses: content.bosses, foes: dungeonContent.foes, gearLines: gearContent.lines },
);

/**
 * The Knack ids a creature of this form knows (R11): the own Knacks of every form on its path from the line's base
 * form, cut at the last role change. Never stored; the saved Knack is checked against it.
 */
export const knownKnacks = (formId: string): string[] =>
  knownKnacksOf(combatV2.forms, content.creatures, formId);

/** A line's v2 talent pool, bound to the shipped pack. */
export const v2Pool = (line: string): readonly string[] => v2PoolOf(combatV2, line);

/** Whether a v2 talent works for a role, bound to the shipped pack. */
export const v2TalentWorksFor = (
  talentId: string,
  role: Parameters<typeof talentWorksFor>[2],
): boolean => talentWorksFor(combatV2, talentId, role);

/** Rolls a v2 talent from the shipped pool of a line (see `rollV2Talent`). */
export const rollShippedV2Talent = (
  rng: Parameters<typeof rollV2Talent>[1],
  line: string,
  options?: Parameters<typeof rollV2Talent>[3],
): V2Roll | null => rollV2Talent(combatV2, rng, line, options);
