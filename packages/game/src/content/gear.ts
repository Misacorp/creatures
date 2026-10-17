import {
  loadGear,
  tagElement,
  tagRole,
  type GearBase,
  type GearLine,
  type GearSlot,
  type GearTag,
} from './gear-schema';
import basesJson from './data/gear.json';
import linesJson from './data/gear-lines.json';
import legacyJson from './data/gear-legacy.json';
import reactionsJson from './data/reactions.json';
import type { Element, Role } from './schema';

/** The shipped gear bases, lines and the old-gear table of the conversion, validated at module load. */
export const gearContent = loadGear(
  basesJson,
  linesJson,
  legacyJson,
  reactionsJson as { name: string; triggerElement: Element }[],
);

const BASES = new Map<string, GearBase>(gearContent.bases.map((b) => [b.id, b]));
const LINES = new Map<string, GearLine>(gearContent.lines.map((l) => [l.id, l]));
const LEGACY_BASES = new Map(gearContent.legacy.bases.map((b) => [b.id, b]));
const LEGACY_ENCHANTS = new Map(gearContent.legacy.enchants.map((e) => [e.id, e]));

/** A gear base by id, or undefined. */
export function gearBase(id: string): GearBase | undefined {
  return BASES.get(id);
}

/** A gear line by id (`attack`, `tide-attunement`), or undefined. */
export function gearLine(id: string): GearLine | undefined {
  return LINES.get(id);
}

/** An old (pre-v2) base, for the conversion only. */
export function legacyBase(
  id: string,
):
  { id: string; slot: GearSlot; tint: Element | null; festival?: boolean | undefined } | undefined {
  return LEGACY_BASES.get(id);
}

/** An old enchant's shard element, for the conversion only. */
export function legacyEnchant(id: string): { id: string; shard: Element } | undefined {
  return LEGACY_ENCHANTS.get(id);
}

/** The lowest item level a base can drop or be crafted at (1 for the plain ones). */
export function baseMinLevel(base: Pick<GearBase, 'minItemLevel'>): number {
  return base.minItemLevel ?? 1;
}

/** Every base of a slot and tag (a Festival piece when `festival`), the plainest first. */
export function basesFor(slot: GearSlot, tag: GearTag, festival = false): GearBase[] {
  return gearContent.bases
    .filter((b) => b.slot === slot && b.tag === tag && (b.festival === true) === festival)
    .sort((a, b) => baseMinLevel(a) - baseMinLevel(b));
}

/**
 * The first base of a slot and tag (the one there from item level 1; a Festival piece when `festival`),
 * or undefined. Where something has no item level yet (a blueprint of an old base, the welcome kit) it
 * is the base to use.
 */
export function baseFor(slot: GearSlot, tag: GearTag, festival = false): GearBase | undefined {
  return basesFor(slot, tag, festival)[0];
}

/** The bases of a slot and tag an item of this level can be: those that are unlocked by it (`minItemLevel`). */
export function eligibleBases(
  slot: GearSlot,
  tag: GearTag,
  itemLevel: number,
  festival = false,
): GearBase[] {
  return basesFor(slot, tag, festival).filter((b) => baseMinLevel(b) <= itemLevel);
}

/** The base of a slot and element tint (neutral: null): where a converted blueprint goes (the first base). */
export function baseForTint(slot: GearSlot, tint: Element | null, festival = false): GearBase {
  const base = baseFor(slot, tint ?? 'neutral', festival);
  if (base === undefined) throw new Error(`no gear base for ${slot} ${tint ?? 'neutral'}`);
  return base;
}

/** The best base of a slot and element tint an item of this level can be (the highest unlocked): where a converted item goes. */
export function bestBaseForTint(
  slot: GearSlot,
  tint: Element | null,
  itemLevel: number,
  festival = false,
): GearBase {
  const list = eligibleBases(slot, tint ?? 'neutral', itemLevel, festival);
  const base = list[list.length - 1] ?? baseForTint(slot, tint, festival);
  return base;
}

/** The element a base is tied to, or null (neutral, explorer, role-locked). */
export function baseElement(base: Pick<GearBase, 'tag'>): Element | null {
  return tagElement(base.tag);
}

/** The role a role-locked base is for, or null. */
export function baseRole(base: Pick<GearBase, 'tag'>): Role | null {
  return tagRole(base.tag);
}
