import { loadGear, type EnchantDef, type GearBase } from './gear-schema';
import basesJson from './data/gear.json';
import enchantsJson from './data/enchants.json';

/** The shipped gear bases and enchants, validated at module load. */
export const gearContent = loadGear(basesJson, enchantsJson);

const BASES = new Map<string, GearBase>(gearContent.bases.map((b) => [b.id, b]));
const ENCHANTS = new Map<string, EnchantDef>(gearContent.enchants.map((e) => [e.id, e]));

/** A gear base by id, or undefined. */
export function gearBase(id: string): GearBase | undefined {
  return BASES.get(id);
}

/** An enchant by id, or undefined. */
export function enchantDef(id: string): EnchantDef | undefined {
  return ENCHANTS.get(id);
}
