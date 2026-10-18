import {
  loadGear,
  tagElement,
  tagRole,
  type GearBase,
  type GearLine,
  type GearSet,
  type GearSlot,
  type GearTag,
} from './gear-schema';
import basesJson from './data/gear.json';
import linesJson from './data/gear-lines.json';
import legacyJson from './data/gear-legacy.json';
import setsJson from './data/gear-sets.json';
import reactionsJson from './data/reactions.json';
import type { Element, Role } from './schema';

/** The shipped gear bases, lines and the old-gear table of the conversion, validated at module load. */
export const gearContent = loadGear(
  basesJson,
  linesJson,
  legacyJson,
  reactionsJson as { name: string; triggerElement: Element }[],
  setsJson,
);

const BASES = new Map<string, GearBase>(gearContent.bases.map((b) => [b.id, b]));
const LINES = new Map<string, GearLine>(gearContent.lines.map((l) => [l.id, l]));
const SETS = new Map<string, GearSet>(gearContent.sets.map((s) => [s.id, s]));
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

/** A gear set by id, or undefined. */
export function gearSet(id: string): GearSet | undefined {
  return SETS.get(id);
}

/** The set a base belongs to, or undefined (most bases are in none). */
export function baseSet(base: Pick<GearBase, 'set'>): GearSet | undefined {
  return base.set === undefined ? undefined : SETS.get(base.set);
}

/** The three pieces of a set, Hat first, then Scarf, then Charm. */
export function setPieces(setId: string): GearBase[] {
  const out: GearBase[] = [];
  for (const slot of ['hat', 'scarf', 'charm'] as const) {
    const piece = gearContent.bases.find((b) => b.set === setId && b.slot === slot);
    if (piece !== undefined) out.push(piece);
  }
  return out;
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

/**
 * Every base of a slot and tag (a Festival piece when `festival`), the plainest first. Gear set pieces are
 * left out unless `withSets`: they are not "the" base of their slot and tag (the conversion and the welcome
 * kit never take one), only drops and crafts choose among them. A Festival piece is always listed (it is a
 * set piece too, but only a Festival base of its tag, never a plain one).
 */
export function basesFor(
  slot: GearSlot,
  tag: GearTag,
  festival = false,
  withSets = false,
): GearBase[] {
  return gearContent.bases
    .filter(
      (b) =>
        b.slot === slot &&
        b.tag === tag &&
        (b.festival === true) === festival &&
        (withSets || b.set === undefined || b.festival === true),
    )
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

/**
 * The bases of a slot and tag an item of this level can be: those that are unlocked by it (`minItemLevel`).
 * A drop passes `withSets`: a set's piece of that slot and tag is one more base once its level is reached.
 */
export function eligibleBases(
  slot: GearSlot,
  tag: GearTag,
  itemLevel: number,
  festival = false,
  withSets = false,
): GearBase[] {
  return basesFor(slot, tag, festival, withSets).filter((b) => baseMinLevel(b) <= itemLevel);
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
