import { RULES } from '../rules/config';
import { basesFor } from './gear';
import { GEAR_RARITIES, type GearBase, type GearRarity, type GearSlot } from './gear-schema';
import { loadPatchwork, type PatchworkBlueprint } from './patchwork-schema';
import patchworkJson from './data/patchwork.json';
import type { Element } from './schema';

/** The shipped patchwork blueprints, validated at module load. */
export const patchworkContent = loadPatchwork(patchworkJson, RULES.gear.rolledLines);

const BY_ID = new Map<string, PatchworkBlueprint>(
  patchworkContent.blueprints.map((b) => [b.id, b]),
);

/** A patchwork blueprint by id, or undefined (also for a proper gear base id). */
export function patchworkBlueprint(id: string): PatchworkBlueprint | undefined {
  return BY_ID.get(id);
}

/** The patchwork blueprints, Hat first, then Scarf, then Charm. */
export function patchworkBlueprints(): PatchworkBlueprint[] {
  const order: readonly GearSlot[] = ['hat', 'scarf', 'charm'];
  return [...patchworkContent.blueprints].sort(
    (a, b) => order.indexOf(a.slot) - order.indexOf(b.slot),
  );
}

/** The best rarity index (0 common, 1 rare, 2 epic) a patchwork piece can roll. */
export const patchworkMaxRarity = (): 0 | 1 | 2 =>
  GEAR_RARITIES.indexOf(patchworkContent.maxRarity) as 0 | 1 | 2;

/** The lines a patchwork piece of a rarity rolls (fewer than a proper piece of that rarity). */
export const patchworkRolledLines = (rarity: GearRarity): number =>
  patchworkContent.rolledLines[rarity];

/** The gear base a patchwork piece of a slot and element is: the plainest base of that slot and element (neutral for none). */
export function patchworkBase(slot: GearSlot, element: Element | null): GearBase {
  const base = basesFor(slot, element ?? 'neutral')[0];
  if (base === undefined) throw new Error(`no plain ${slot} base for ${element ?? 'neutral'}`);
  return base;
}
