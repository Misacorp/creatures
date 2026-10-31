/**
 * A form's stats at a level (combat v2): the shipped species' base plus growth by level (capped at the form's level cap), then the
 * pack's stat changes for the form (Attack scale, crit chance, crit damage) and its armour.
 */
import type { CombatV2Pack } from '@creatures/game/combat-v2';
import type { Role } from '../types';
import type { Shipped } from './types';

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
  /** The species' own crit chance (bp over the base) and crit damage (bp over the base crit): 0 for most. */
  readonly critChanceBp: number;
  readonly critDamageBp: number;
}

/**
 * A form's stats at a level, from the shipped species data (levels above its cap are capped, below 1 are 1), then the pack's changes
 * for the form. Armour is the form's own base (the pack's, final), flat across levels. Throws for an unknown form or one with no entry
 * in the pack.
 */
export function formStats(
  pack: Pick<CombatV2Pack, 'forms'>,
  shipped: Pick<Shipped, 'creatures'>,
  formId: string,
  level: number,
): FormStats {
  const s = shipped.creatures.find((c) => c.id === formId);
  if (!s) throw new Error(`unknown form ${formId}`);
  const form = Object.hasOwn(pack.forms, formId) ? pack.forms[formId] : undefined;
  if (!form) throw new Error(`no armour for form ${formId}`);
  const L = Math.max(1, Math.min(level, s.levelCap));
  const atk = s.baseStats.atk + s.growth.atk * (L - 1);
  return {
    id: s.id,
    name: s.name,
    element: s.element,
    role: s.role,
    stage: s.stage,
    levelCap: s.levelCap,
    hp: s.baseStats.hp + s.growth.hp * (L - 1),
    atk: form.atkBp === undefined ? atk : Math.floor((atk * form.atkBp) / 10_000),
    spd: s.baseStats.spd + s.growth.spd * (L - 1),
    armour: form.armour,
    critChanceBp: form.critChanceBp ?? 0,
    critDamageBp: form.critDamageBp ?? 0,
  };
}
