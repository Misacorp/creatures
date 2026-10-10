import type { CreatureSpecies, Stats } from '../content/schema';
import { fusionBonusBp } from './fusion';

/**
 * Stats at a level: (base + growth x (level - 1)) x (1 + fusionBonus), floored. Integers only.
 * Pass the creature's current species (the evolved form once it has evolved).
 */
export function effectiveStats(
  species: Pick<CreatureSpecies, 'baseStats' | 'growth' | 'levelCap'>,
  level: number,
  fusionCount: number,
): Stats {
  if (!Number.isInteger(level) || level < 1 || level > species.levelCap) {
    throw new RangeError(`level must be an integer in [1, ${species.levelCap}], got ${level}`);
  }
  const factor = 10_000 + fusionBonusBp(fusionCount);
  const scale = (base: number, growth: number): number =>
    Math.floor(((base + growth * (level - 1)) * factor) / 10_000);
  return {
    hp: scale(species.baseStats.hp, species.growth.hp),
    atk: scale(species.baseStats.atk, species.growth.atk),
    spd: scale(species.baseStats.spd, species.growth.spd),
  };
}
