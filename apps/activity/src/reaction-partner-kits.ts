/**
 * The kits of the creatures a screen has in hand, for `reaction-partners.ts`: one of the player's own creatures (`GET /api/state`: its
 * species, saved Knack, slotted talents and worn gear) and a creature on the raid board (`/api/raid`'s `v2.creatures[]`: role, Knack,
 * talents and worn gear, with its species from the seat). Nothing new is asked of the server.
 */
import type { Creature } from './api';
import { getSpecies } from './game';
import type { PartnerKit } from './reaction-partners';
import type { BoardCreatureV2 } from './raid-v2-api';

/** The kit of one of the player's own creatures; null for a species the content does not know. */
export function kitOfOwned(c: Creature): PartnerKit | null {
  const species = getSpecies(c.species);
  if (species === undefined) return null;
  return {
    id: c.id,
    role: species.role,
    element: species.element,
    knack: c.knack ?? null,
    talents: (c.talentsV2?.slots ?? []).flatMap((s) => (s.talent === null ? [] : [s.talent.id])),
    gear: c.gear,
  };
}

/** The kit of a creature on the raid board (any player's); `species` is the id the seat shows. Null for a species the content does not know. */
export function kitOfBoard(entry: BoardCreatureV2, species: string): PartnerKit | null {
  const found = getSpecies(species);
  if (found === undefined) return null;
  return {
    id: entry.creatureId,
    role: entry.role,
    element: found.element,
    knack: entry.knack,
    talents: entry.talents.map((t) => t.id),
    gear: entry.gear,
  };
}

/** Every creature of a list as a kit (the ones the content does not know are left out). */
export function kitsOf(
  owned: readonly Creature[],
  board: readonly { entry: BoardCreatureV2; species: string }[],
): PartnerKit[] {
  const seen = new Set<string>();
  const out: PartnerKit[] = [];
  // The board first: it is the creature as the fight will have it (its role, as the server says).
  for (const b of board) {
    const kit = kitOfBoard(b.entry, b.species);
    if (kit !== null && !seen.has(kit.id)) {
      seen.add(kit.id);
      out.push(kit);
    }
  }
  for (const c of owned) {
    const kit = kitOfOwned(c);
    if (kit !== null && !seen.has(kit.id)) {
      seen.add(kit.id);
      out.push(kit);
    }
  }
  return out;
}
