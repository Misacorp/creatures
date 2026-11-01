import { combatV2 } from '@creatures/game/combat-v2';

/**
 * Lab stat overrides for combat v2 (fourth design panel, Misa 2026-10-28): the stat changes of `forms.json` (`atkBp`,
 * `critChanceBp`, `critDamageBp`). They change the lab's numbers only, not the shipped species data (`packages/game`): the
 * migration (roadmap phase 6) decides what ships. `formStats` reads this table, so every fight, search and report sees the
 * same creatures. One line per creature, each with its reason in the header of `packages/game/src/combat-v2/schema.ts`
 * (Attack within about 10% for the stage 2 Payoffs, the crit machines). A form's armour is in `armour.ts`.
 */
export interface StatOverride {
  /** The shipped Attack, scaled (basis points: 10000 is unchanged). */
  readonly atkBp?: number;
  /** Crit chance the species has of its own, in basis points over `LAB_RULES.critChanceBp`. */
  readonly critChanceBp?: number;
  /** Crit damage the species has of its own, in basis points over the base crit (`LAB_RULES.critBp`). */
  readonly critDamageBp?: number;
}

export const STAT_OVERRIDES: Readonly<Record<string, StatOverride>> = Object.fromEntries(
  Object.values(combatV2.forms)
    .filter(
      (f) => f.atkBp !== undefined || f.critChanceBp !== undefined || f.critDamageBp !== undefined,
    )
    .map((f) => [
      f.id,
      {
        ...(f.atkBp === undefined ? {} : { atkBp: f.atkBp }),
        ...(f.critChanceBp === undefined ? {} : { critChanceBp: f.critChanceBp }),
        ...(f.critDamageBp === undefined ? {} : { critDamageBp: f.critDamageBp }),
      },
    ]),
);
