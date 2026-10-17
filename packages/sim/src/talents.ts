import {
  RULES,
  foldTalent,
  fuseOnce,
  recommend,
  releaseParts,
  rollTalent,
  slotsOf,
  slotsOpen,
  talentDef,
  talentScore,
  type CreatureSpecies,
  type LineCreature,
  type Rng,
  type TalentRoll,
} from '@creatures/game';
import { creatureStats, speciesOf, wearerOfCreature, type OwnedCreature } from './data';
import { creditParts } from './gear';
import type { SimPlayer } from './state';

/**
 * Talents and the duplicate choice in the simulator (docs/design/gear-and-creatures-v2.md section 8).
 * Every rule is the game's own (`@creatures/game`: the pools, the golden roll, the slots, what
 * Recommended is, what a release pays); this file only holds what a player does with them:
 *
 * - Every creature the player gets (the starter, a new species from a trip, a Festival win) rolls its
 *   first talent into slot 1, with the sim's own talent stream (separate from the catch stream, so a
 *   talent never moves a catch).
 * - A duplicate is answered with Recommended, straight away (the sim player never lets a card wait):
 *   Teach when the talent is new to the book and better than what the slot holds, else Fuse until the
 *   creature is fully fused, else Release for parts. Keep needs a line with a second branch and the
 *   content has none yet, so the sim never keeps.
 * - When a creature has an open slot with nothing in it and its Talent Book holds a talent, the best one
 *   (by `talentScore`) goes in, for `RULES.talents.bookSlotBait` Bait, if the player has that much.
 */

/** A creature as the duplicate choice sees it. */
export function lineView(c: OwnedCreature): LineCreature {
  const species = speciesOf(c.speciesId);
  const book = c.talents?.book ?? [];
  const stats = creatureStats(c);
  return {
    id: c.id,
    speciesId: c.speciesId,
    level: c.level,
    fusionCount: c.fusionCount,
    rarity: species.rarity,
    role: species.role,
    element: species.element,
    stats: { atk: stats.atk, hp: stats.hp },
    slots: slotsOf(species.rarity, c.level, book),
    book: book.map(({ talentId, golden }) => ({ talentId, golden })),
  };
}

/** Puts a talent in a creature's book, in `slot` (the talent that sat there goes back to the book only). */
export function holdTalent(c: OwnedCreature, roll: TalentRoll, slot: number | null): void {
  const talents = (c.talents ??= { book: [] });
  if (slot !== null) {
    for (const held of talents.book) if (held.slot === slot) held.slot = null;
  }
  const same = talents.book.find((b) => b.talentId === roll.talentId && b.golden === roll.golden);
  if (same !== undefined) same.slot = slot;
  else talents.book.push({ talentId: roll.talentId, golden: roll.golden, slot });
}

/** A new creature of a species at level 1 with its first talent (slot 1), rolled with `rng`. */
export function newCreature(player: SimPlayer, species: CreatureSpecies, rng: Rng): OwnedCreature {
  const creature: OwnedCreature = {
    id: `${player.id}/${species.line}`,
    line: species.line,
    speciesId: species.id,
    level: 1,
    exp: 0,
    ribbons: 0,
    fusionCount: 0,
  };
  const roll = rollTalent(rng, species.line);
  holdTalent(creature, roll, 1);
  if (roll.golden) player.stats.golden_talents += 1;
  return creature;
}

export type CollectedAs = 'new' | 'duplicate';

/**
 * A creature of `species` arrives (a trip's catch or a Festival win). A new line becomes a creature with
 * its first talent. A duplicate rolls its talent and is answered with Recommended. `parts`: whether the
 * simulation tracks parts (a release pays them only then). Returns what became of it.
 */
export function collect(
  player: SimPlayer,
  species: CreatureSpecies,
  rng: Rng,
  parts: boolean,
): CollectedAs {
  const existing = player.creatures.find((c) => c.line === species.line);
  player.stats.catches += 1;
  if (existing === undefined) {
    player.creatures.push(newCreature(player, species, rng));
    return 'new';
  }
  player.stats.dupes += 1;
  const roll = rollTalent(rng, species.line);
  if (roll.golden) player.stats.golden_talents += 1;
  const rec = recommend(roll, [lineView(existing)], false);
  const kept = speciesOf(existing.speciesId);
  if (rec.choice === 'teach' && rec.slot !== undefined) {
    holdTalent(existing, roll, rec.slot);
    player.stats.dupes_taught += 1;
  } else if (rec.choice === 'fuse') {
    const next = fuseOnce(existing.fusionCount);
    if (next !== null) existing.fusionCount = next;
    player.stats.dupes_fused += 1;
  } else {
    if (parts) creditParts(player, releaseParts(kept.rarity, kept.element));
    player.stats.dupes_released += 1;
  }
  return 'duplicate';
}

/**
 * Fills every open, empty talent slot from the creature's Talent Book with the best talent it holds that
 * is not in a slot, for `RULES.talents.bookSlotBait` Bait each, while the player can pay. Strongest
 * creatures first (the ones that fight), so a short purse goes where it counts.
 */
export function fillSlots(player: SimPlayer, order: readonly OwnedCreature[]): void {
  for (const c of order) {
    const book = c.talents?.book;
    if (book === undefined) continue;
    const species = speciesOf(c.speciesId);
    const open = slotsOpen(species.rarity, c.level);
    const wearer = { ...wearerOfCreature(c), stats: creatureStats(c) };
    for (let slot = 1; slot <= open; slot++) {
      if (book.some((b) => b.slot === slot)) continue;
      if (player.bait < RULES.talents.bookSlotBait) return;
      let best: { entry: (typeof book)[number]; score: number } | null = null;
      for (const entry of book) {
        if (entry.slot !== null) continue;
        const def = talentDef(entry.talentId);
        if (def === undefined) continue;
        const score = talentScore(foldTalent(def, entry.golden), wearer);
        if (best === null || score > best.score) best = { entry, score };
      }
      if (best === null || best.score <= 0) continue;
      best.entry.slot = slot;
      player.bait -= RULES.talents.bookSlotBait;
      player.week.baitSlots += RULES.talents.bookSlotBait;
      player.stats.talent_slots += 1;
    }
  }
}
