/**
 * The duplicate choice (docs/design/gear-and-creatures-v2.md section 8.2). A duplicate catch arrives as a
 * card with its rolled talent and four buttons: **Teach** its talent to your creature of that line,
 * **Fuse** it (one fusion step, up to 5), **Release** it for parts (never Bait), or **Keep** it as a second
 * creature of a line that has a branch you do not own yet. Pure functions: what is offered and what
 * Recommended is. The server decides, checks and applies every choice (`apps/worker/src/catch-choices.ts`).
 */
import { lineBranches, content, talentDef, type Element, type Rarity, type Role } from '../content';
import { RULES } from './config';
import { shardOf, type PartsBundle } from './gear';
import { fuseOnce } from './fusion';
import { foldTalent, slotsOpen, talentScore, type TalentRoll } from './talents';

export type DuplicateChoice = 'teach' | 'fuse' | 'release' | 'keep';
export const DUPLICATE_CHOICES: readonly DuplicateChoice[] = ['teach', 'fuse', 'release', 'keep'];

/** A creature of the duplicate's line that the player owns, as the choice sees it. */
export interface LineCreature {
  id: string;
  speciesId: string;
  level: number;
  fusionCount: number;
  rarity: Rarity;
  role: Role;
  element: Element;
  /** Effective stats (level, fusion). */
  stats: { atk: number; hp: number };
  /** The talent in each open slot, in slot order (null: an open slot with nothing in it). */
  slots: readonly (TalentRoll | null)[];
  /** Every talent the creature has held (the Talent Book), slotted or not. */
  book: readonly TalentRoll[];
}

/**
 * True if the book already holds this talent at the same quality or better. A normal talent is held
 * once it is in the book at all; a golden one is held only by a golden of the same talent.
 */
export function bookHolds(book: readonly TalentRoll[], roll: TalentRoll): boolean {
  return book.some((b) => b.talentId === roll.talentId && (b.golden || !roll.golden));
}

/** True if this creature can learn the rolled talent now: it has an open slot and the book lacks it. */
export function canTeach(creature: LineCreature, roll: TalentRoll): boolean {
  return creature.slots.length > 0 && !bookHolds(creature.book, roll);
}

/** True if any creature of the line can be taught the talent (Teach is offered). */
export function teachOffered(creatures: readonly LineCreature[], roll: TalentRoll): boolean {
  return creatures.some((c) => canTeach(c, roll));
}

/** True if any creature of the line can still take a fusion step (Fuse is offered). */
export function fuseOffered(creatures: readonly LineCreature[]): boolean {
  return creatures.some((c) => fuseOnce(c.fusionCount) !== null);
}

/**
 * True if Keep is offered: the line has two branches, the player owns fewer than
 * `RULES.talents.maxPerLine` creatures of it and there is a branch none of them is. `owned` are the
 * species the player owns of the line. A line with one evolution (or none) never offers Keep.
 */
export function keepOffered(branches: readonly string[], owned: readonly string[]): boolean {
  if (branches.length < 2) return false;
  if (owned.length >= RULES.talents.maxPerLine) return false;
  return branches.some((b) => !owned.includes(b));
}

/** Keep for a line of the content, from the species the player owns of it. */
export function keepOfferedFor(line: string, owned: readonly string[]): boolean {
  return keepOffered(lineBranches(content, line), owned);
}

/** What Recommended is: the choice, and for Teach and Fuse the creature (and for Teach the slot). */
export interface Recommendation {
  choice: DuplicateChoice;
  creatureId?: string;
  /** Teach only: the slot (1-based) the talent goes to. */
  slot?: number;
}

/** The best slot of a creature for a talent: the one that gains most (an empty slot gains all of it). */
function bestSlot(creature: LineCreature, roll: TalentRoll): { slot: number; gain: number } | null {
  const def = talentDef(roll.talentId);
  if (def === undefined || !canTeach(creature, roll)) return null;
  const wearer = { role: creature.role, element: creature.element, stats: creature.stats };
  const fresh = talentScore(foldTalent(def, roll.golden), wearer);
  let best: { slot: number; gain: number } | null = null;
  creature.slots.forEach((held, i) => {
    let occupied = 0;
    if (held !== null) {
      const heldDef = talentDef(held.talentId);
      occupied = heldDef === undefined ? 0 : talentScore(foldTalent(heldDef, held.golden), wearer);
    }
    const gain = fresh - occupied;
    if (best === null || gain > best.gain) best = { slot: i + 1, gain };
  });
  return best;
}

/**
 * The choice the card marks Recommended (and what a pending duplicate falls back to when the queue
 * is full): **Teach** when the talent is new to the book (or golden) and better than what an open slot
 * holds, else **Keep** when a branch is missing, else **Fuse** until the creature has all its fusions,
 * else **Release**. Pure and deterministic: the best gain wins, ties go to the earlier creature and slot.
 */
export function recommend(
  talent: TalentRoll,
  creatures: readonly LineCreature[],
  keep: boolean,
): Recommendation {
  let best: { creatureId: string; slot: number; gain: number } | null = null;
  for (const creature of creatures) {
    const found = bestSlot(creature, talent);
    if (found !== null && (best === null || found.gain > best.gain)) {
      best = { creatureId: creature.id, slot: found.slot, gain: found.gain };
    }
  }
  if (best !== null && best.gain > 0) {
    return { choice: 'teach', creatureId: best.creatureId, slot: best.slot };
  }
  if (keep) return { choice: 'keep' };
  const fuser = creatures.find((c) => fuseOnce(c.fusionCount) !== null);
  if (fuser !== undefined) return { choice: 'fuse', creatureId: fuser.id };
  return { choice: 'release' };
}

/** What releasing a duplicate pays: parts of its rarity, a shard of its element, never Bait. */
export function releaseParts(rarity: Rarity, element: Element): PartsBundle {
  const r = RULES.talents.release[rarity];
  const parts: PartsBundle = {};
  if (r.scrap > 0) parts.scrap = r.scrap;
  if (r.shard > 0) parts[shardOf(element)] = r.shard;
  if (r.glimmer > 0) parts.glimmer = r.glimmer;
  return parts;
}

/** The talent slots of a creature at a level, as `LineCreature.slots` needs them from its slotted talents. */
export function slotsOf(
  rarity: Rarity,
  level: number,
  held: readonly { talentId: string; golden: boolean; slot: number | null }[],
): (TalentRoll | null)[] {
  const open = slotsOpen(rarity, level);
  const out: (TalentRoll | null)[] = [];
  for (let slot = 1; slot <= open; slot++) {
    const h = held.find((x) => x.slot === slot);
    out.push(h === undefined ? null : { talentId: h.talentId, golden: h.golden });
  }
  return out;
}
