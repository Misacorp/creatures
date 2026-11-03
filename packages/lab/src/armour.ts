import { combatV2 } from '@creatures/game/combat-v2';

/**
 * Armour is a species stat (R13, Misa 2026-10-28): flat, taken off every hit, a hit at or below it is Blocked. One base
 * value per form, no growth per level for now. The role no longer decides it: lines that start as Guards lean higher, quick
 * and soft creatures lower, shells and hides higher. An evolution never lowers it, whatever the new role (a test holds
 * this). The numbers are the game's `forms.json` (`armour`), final: Ancientshell's 30 already includes the combat v2 stat
 * change (it had 48), so a Setter behind a living forest is a choice with a price (see the header of
 * `packages/game/src/combat-v2/schema.ts`).
 */
export const FORM_ARMOUR: Readonly<Record<string, number>> = Object.fromEntries(
  Object.values(combatV2.forms).map((f) => [f.id, f.armour]),
);

/** A form's base armour. Throws for a form with no entry (a test proves every form has one). */
export function formArmour(formId: string): number {
  const a = FORM_ARMOUR[formId];
  if (a === undefined) throw new Error(`no armour for form ${formId}`);
  return a;
}
