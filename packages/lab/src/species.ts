import { content } from '@creatures/game';
import { formArmour } from './armour';
import type { Role } from './types';

export interface FormStats {
  readonly id: string;
  readonly name: string;
  readonly element: string;
  readonly role: Role;
  readonly stage: number;
  readonly levelCap: number;
  readonly hp: number;
  readonly atk: number;
  readonly spd: number;
  readonly armour: number;
}

/** A form's stats at a level, from the shipped species data (levels above its cap are capped). Armour is the form's own base (`FORM_ARMOUR`), flat across levels. */
export function formStats(formId: string, level: number): FormStats {
  const s = content.creatures.find((c) => c.id === formId);
  if (!s) throw new Error(`unknown form ${formId}`);
  const L = Math.max(1, Math.min(level, s.levelCap));
  const role = s.role;
  return {
    id: s.id,
    name: s.name,
    element: s.element,
    role,
    stage: s.stage,
    levelCap: s.levelCap,
    hp: s.baseStats.hp + s.growth.hp * (L - 1),
    atk: s.baseStats.atk + s.growth.atk * (L - 1),
    spd: s.baseStats.spd + s.growth.spd * (L - 1),
    armour: formArmour(s.id),
  };
}

/** Every element id in the shipped content. */
export const ELEMENTS: readonly string[] = content.elements.map((e) => e.id);

/** True when an attacker of `attacker` cashes a mark of `mark` (the element chart's strong pairs). */
export function triggers(attacker: string, mark: string): boolean {
  return content.elementChart.some(
    (p) => p.attacker === attacker && p.defender === mark && p.bp === 15_000,
  );
}

/** The element chart multiplier (bp) of an attacker against the boss's element. */
export function matchupBp(attacker: string, defender: string): number {
  return (
    content.elementChart.find((p) => p.attacker === attacker && p.defender === defender)?.bp ??
    10_000
  );
}
