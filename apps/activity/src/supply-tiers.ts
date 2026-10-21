/** The tiers of a supply, as the rows of the Workshop's supply picker, with the rarity each is drawn in. */
export const SUPPLY_TIERS = [
  { tier: 'basic', label: 'Basic', rarity: 'common' },
  { tier: 'good', label: 'Good', rarity: 'rare' },
  { tier: 'great', label: 'Great', rarity: 'epic' },
] as const;

export type SupplyTier = (typeof SUPPLY_TIERS)[number]['tier'];

/** The rarity class of a tier (`rarity-common`, `rarity-rare`, `rarity-epic`). */
export function tierRarityClass(tier: string): string {
  const found = SUPPLY_TIERS.find((t) => t.tier === tier);
  return `rarity-${found?.rarity ?? 'common'}`;
}
