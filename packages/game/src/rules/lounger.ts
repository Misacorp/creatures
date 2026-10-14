import { int, type Rng } from '../rng';

/**
 * Picks the creature that lounges in the living room: one of the player's idle creatures, uniformly
 * at random, or null when there is none (every creature is busy, or the player has none). The
 * caller decides which creatures are idle; the pick draws from the injected RNG exactly once when
 * there is a choice, and not at all when there is none or only one.
 */
export function pickLounger(idleIds: readonly string[], rng: Rng): string | null {
  const first = idleIds[0];
  if (first === undefined) return null;
  if (idleIds.length === 1) return first;
  return idleIds[int(rng, idleIds.length)] ?? null;
}
