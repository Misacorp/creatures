/**
 * Knacks of the combat v2 draft: the catalogue is data in `@creatures/game/combat-v2` (`knacks.json`, `forms.json`: a small
 * grammar of effects plus the text a player reads and the design intent for contributors, docs/design/combat-v2.md,
 * "Knacks"). The lab reads it through these exports and keeps the functions that work out what a form can equip.
 *
 * Naming rule (principle 8): the same effect keeps the same name wherever it appears (another species, a gear piece). A
 * different effect gets a different name.
 */
import { content } from '@creatures/game';
import { combatV2, type KnackDef } from '@creatures/game/combat-v2';
import type { KnackFx } from '@creatures/engine/v2';

// The effect vocabulary is the engine's (`@creatures/engine/v2`); the game's schema for it is checked equal by a type test.
export type { KnackDef, KnackFx };

/** Knack families: one rule with different numbers or elements (grammar.md). A new family needs a reason (P-09). */
export const FAMILIES: Readonly<Record<string, string>> = combatV2.families;

export const KNACKS: Readonly<Record<string, KnackDef>> = combatV2.knacks;

/** The Knacks that reshape or replace a Support's base verb (family "Support shape"). */
export const SUPPORT_SHAPE_KNACKS: ReadonlySet<string> = new Set(
  Object.values(KNACKS)
    .filter((k) => k.family === 'Support shape')
    .map((k) => k.id),
);

/**
 * The Knacks each form brings of its own (R11, Misa 2026-10-27), from `forms.json`. A creature knows them from the
 * moment it is caught; evolving adds the new form's own Knacks to the ones it knew, if the role stays
 * (a role change keeps only the new form's, since the old role's Knacks would do nothing).
 */
export const OWN_KNACKS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  Object.values(combatV2.forms).map((f) => [f.id, f.ownKnacks]),
);

/** The form a stage 2 form evolves from (its line's stage 1 form), if any. */
export function evolvesFrom(form: string): string | undefined {
  const c = content.creatures.find((x) => x.id === form);
  if (!c || c.stage < 2) return undefined;
  return content.creatures.find((x) => x.line === c.line && x.stage === c.stage - 1)?.id;
}

/** Every Knack a form knows: what it knew before evolving (if the role stayed), then its own (R11). */
export function knacksOf(form: string): string[] {
  const own = OWN_KNACKS[form] ?? [];
  const parent = evolvesFrom(form);
  const role = content.creatures.find((x) => x.id === form)?.role;
  const kept =
    parent !== undefined && content.creatures.find((x) => x.id === parent)?.role === role
      ? knacksOf(parent)
      : [];
  return [...new Set([...kept, ...own])];
}

/** The Knacks each form can equip (R11): worked out from `OWN_KNACKS` and the evolution line. */
export const FORM_KNACKS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  Object.keys(OWN_KNACKS).map((f) => [f, knacksOf(f)]),
);

export function knack(id: string | undefined): KnackDef | undefined {
  return id === undefined ? undefined : KNACKS[id];
}
