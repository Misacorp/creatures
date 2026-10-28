/**
 * Armour is a species stat (R13, Misa 2026-10-28): flat, taken off every hit, a hit at or below it is
 * Blocked. One base value per form, no growth per level for now. The role no longer decides it:
 * lines that start as Guards lean higher, quick and soft creatures lower, shells and hides higher.
 * An evolution never lowers it, whatever the new role (a test holds this). Ancientshell has the
 * most on purpose: a Setter behind a living forest, a choice to build around.
 */
export const FORM_ARMOUR: Readonly<Record<string, number>> = {
  // Splashet line (Tide): playful and wet; the Payoff pup is sturdier.
  splashet: 7,
  tidewing: 7,
  geyserpup: 9,
  // Cindle line (Ember): quick kittens.
  cindle: 6,
  pyrelynx: 6,
  wickat: 6,
  // Sproutle line (Grove): starts as a Guard, so it leans high; the blossoming Support keeps it.
  sproutle: 28,
  thornbuck: 34,
  sunfawn: 28,
  // Zipmouse line (Spark): fast and fizzy; the puffed-up Guard digs in.
  zipmouse: 5,
  voltaro: 5,
  ohmouse: 14,
  // Mistnewt line (Tide): starts as a Guard, fog and mist.
  mistnewt: 26,
  fogwyrm: 30,
  drizzlewt: 26,
  // Ashmole line (Ember): diggers; the clay-domed Guard is the hard one.
  ashmole: 8,
  magmole: 10,
  kilnmole: 22,
  // Stormray line (Spark): rays ride the wind, light.
  stormray: 5,
  tempestray: 5,
  halcyray: 6,
  // Mossback line (Grove): a turtle. Ancientshell's living-forest shell is the most armour in the game.
  mossback: 14,
  ancientshell: 48,
  bloomback: 14,
  // Single-stage creatures.
  coralynx: 7,
  solmane: 10,
  gaiadrake: 24,
  aurorix: 4,
  lanternfin: 5,
  hearthshell: 40,
  // Mire lines: the bog Guard line is thick, the frogs soft.
  mudlump: 32,
  bogwarden: 38,
  squelch: 6,
  croakmire: 8,
};

/** A form's base armour. Throws for a form with no entry (a test proves every form has one). */
export function formArmour(formId: string): number {
  const a = FORM_ARMOUR[formId];
  if (a === undefined) throw new Error(`no armour for form ${formId}`);
  return a;
}
