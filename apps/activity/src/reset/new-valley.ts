/**
 * The words of the "A new valley" card, shown once on the first open after the reset (docs/design/reset.md,
 * section 5; Misa's accepted draft, 2026-11-06). The same words in every look; only the picture differs.
 * Inert: nothing in the game shows it yet.
 */
export const NEW_VALLEY_TITLE = 'A new valley';
export const NEW_VALLEY_TEXT =
  'The old valley has gone quiet. The first settlers are remembered, and their creatures with them. Pick a starter and find your way.';

/** The three looks the card is judged in. */
export const NEW_VALLEY_LOOKS = ['notice', 'scene', 'welcome'] as const;
export type NewValleyLook = (typeof NEW_VALLEY_LOOKS)[number];
