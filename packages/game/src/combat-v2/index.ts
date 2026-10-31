/**
 * Combat v2 content as data (`@creatures/game/combat-v2`): the rules numbers, the Knacks and their families, the forms'
 * armour, own Knacks and stat changes, and the talents with their line pools, schema-checked at import
 * (docs/design/combat/content-as-data.md). A separate entry point on purpose: nothing in the shipped game imports it until
 * phase 4, so the worker's bundle and start-up do not grow before then.
 */
import { content } from '../content';
import forms from './data/forms.json';
import knacks from './data/knacks.json';
import rules from './data/rules.json';
import talents from './data/talents.json';
import { loadCombatV2, type CombatV2Pack } from './load';

export * from './fx-schema';
export * from './load';
export * from './rules-schema';
export * from './schema';

/** The shipped combat v2 content, checked against the shipped species. */
export const combatV2: CombatV2Pack = loadCombatV2(
  { rules, knacks, forms, talents },
  content.creatures,
);
