/**
 * Lab stat overrides for combat v2 (fourth design panel, Misa 2026-10-28). They change the lab's numbers only, not the
 * shipped species data (`packages/game`): the migration (roadmap phase 6) decides what ships. `formStats` reads this
 * table, so every fight, search and report sees the same creatures. Keep it small: one line per creature, each with
 * the reason.
 *
 * - **Stage 2 Payoffs within about 10% of each other in Attack.** Bloomback and Tempestray had 190, Gaiadrake 152,
 *   Pyrelynx and Geyserpup 128, so a raid roster always took the top two and the rest were filler. `atkBp` scales the
 *   shipped Attack (at every level) to a lab Attack of about 165 for the top two, 155 and 150 for the others.
 * - **Ancientshell: the armour or the HP, not both.** It had the most armour (48) and the top Setter HP and Attack.
 *   Its armour is now below the best Guard's (30; Hearthshell has 40), so a Setter behind a living forest is a choice
 *   with a price.
 */
export interface StatOverride {
  /** The shipped Attack, scaled (basis points: 10000 is unchanged). */
  readonly atkBp?: number;
  /** Replaces the form's armour from `armour.ts`. */
  readonly armour?: number;
}

export const STAT_OVERRIDES: Readonly<Record<string, StatOverride>> = {
  // Attack 190 -> about 165.
  bloomback: { atkBp: 8_700 },
  tempestray: { atkBp: 8_700 },
  // Attack 152 -> about 155.
  gaiadrake: { atkBp: 10_200 },
  // Attack 128 -> about 150.
  pyrelynx: { atkBp: 11_700 },
  geyserpup: { atkBp: 11_700 },
  // Armour 48 -> 30.
  ancientshell: { armour: 30 },
};
