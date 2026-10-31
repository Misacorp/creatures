import { content } from '@creatures/game';
import { formArmour } from './armour';
import { STAT_OVERRIDES } from './stats';
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
  /** The species' own crit chance (bp over the base) and crit damage (bp over the base crit): 0 for most (`stats.ts`). */
  readonly critChanceBp: number;
  readonly critDamageBp: number;
}

/** A form's stats at a level, from the shipped species data (levels above its cap are capped), then the lab's overrides (`stats.ts`). Armour is the form's own base (`FORM_ARMOUR`, final), flat across levels. */
export function formStats(formId: string, level: number): FormStats {
  const s = content.creatures.find((c) => c.id === formId);
  if (!s) throw new Error(`unknown form ${formId}`);
  const L = Math.max(1, Math.min(level, s.levelCap));
  const role = s.role;
  const over = STAT_OVERRIDES[s.id];
  const atk = s.baseStats.atk + s.growth.atk * (L - 1);
  return {
    id: s.id,
    name: s.name,
    element: s.element,
    role,
    stage: s.stage,
    levelCap: s.levelCap,
    hp: s.baseStats.hp + s.growth.hp * (L - 1),
    atk: over?.atkBp === undefined ? atk : Math.floor((atk * over.atkBp) / 10_000),
    spd: s.baseStats.spd + s.growth.spd * (L - 1),
    armour: formArmour(s.id),
    critChanceBp: over?.critChanceBp ?? 0,
    critDamageBp: over?.critDamageBp ?? 0,
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
