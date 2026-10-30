/**
 * Lab stat overrides for combat v2 (fourth design panel, Misa 2026-10-28). They change the lab's numbers only, not the
 * shipped species data (`packages/game`): the migration (roadmap phase 6) decides what ships. `formStats` reads this
 * table, so every fight, search and report sees the same creatures. Keep it small: one line per creature, each with
 * the reason.
 *
 * - **Stage 2 Payoffs within about 10% of each other in Attack.** Bloomback and Tempestray had 190, Gaiadrake 152,
 *   Pyrelynx and Geyserpup 128, so a raid roster always took the top two and the rest were filler. `atkBp` scales the
 *   shipped Attack (at every level) to a lab Attack of about 165 for the top two, 155 and 150 for the others.
 * - **Crit machines** (Misa, 2026-10-30: luck is a build): Cindle, Pyrelynx and Coralynx hit about 14% softer and crit 10 points
 *   more often for 50 points more crit damage (a crit then deals x2.5, not x2). That is about the same average damage as their
 *   siblings (`1 + 15% x 1.5` against `1 + 5% x 1`, so 1.17 times), with far more swing, and the more crit chance and crit
 *   damage a talent, Knack or item adds, the more they gain: the crit build starts from a species. The shipped species data has a
 *   small crit bonus on Cindle, Pyrelynx, Stormray and Tempestray; the lab does not read it, only this table.
 * - **Ancientshell: the armour or the HP, not both.** It had the most armour (48) and the top Setter HP and Attack.
 *   Its armour is now below the best Guard's (30; Hearthshell has 40), so a Setter behind a living forest is a choice
 *   with a price.
 */
export interface StatOverride {
  /** The shipped Attack, scaled (basis points: 10000 is unchanged). */
  readonly atkBp?: number;
  /** Replaces the form's armour from `armour.ts`. */
  readonly armour?: number;
  /** Crit chance the species has of its own, in basis points over `LAB_RULES.critChanceBp`. */
  readonly critChanceBp?: number;
  /** Crit damage the species has of its own, in basis points over the base crit (`LAB_RULES.critBp`). */
  readonly critDamageBp?: number;
}

/** A crit machine's own crit stats (see above). */
const CRIT_MACHINE = { critChanceBp: 1_000, critDamageBp: 5_000 } as const;

export const STAT_OVERRIDES: Readonly<Record<string, StatOverride>> = {
  // Attack 190 -> about 165.
  bloomback: { atkBp: 8_700 },
  tempestray: { atkBp: 8_700 },
  // Attack 152 -> about 155.
  gaiadrake: { atkBp: 10_200 },
  // Attack 128 -> about 150 (Geyserpup). Pyrelynx stays at 128: its crits make up the rest.
  pyrelynx: { atkBp: 10_000, ...CRIT_MACHINE },
  geyserpup: { atkBp: 11_700 },
  // Crit machines: Attack x0.86, crit chance +10 points, crit damage +50 points.
  cindle: { atkBp: 8_600, ...CRIT_MACHINE },
  coralynx: { atkBp: 8_600, ...CRIT_MACHINE },
  // Armour 48 -> 30.
  ancientshell: { armour: 30 },
};
