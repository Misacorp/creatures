/**
 * Which creature is the player's starter, for the pin in the Home board's corner (decisions.md 2026-10-24).
 * The state carries no starter field (and `starterOptions` is empty once a starter is chosen), so it is worked
 * out from what is already loaded: the oldest creature still owned (`caughtAt`, the id breaking a tie) whose
 * evolution line is one of the starter species' lines in the content. The line, not the species, because the
 * starter may have evolved. If that creature was released, the next oldest of a starter line stands in, and
 * with none at all (nothing owned yet) the pin shows Sproutle. Pure; nothing is asked of the server.
 */
import { content } from '@creatures/game';
import type { Creature } from '../api';

/** The species drawn when no owned creature can be the starter. */
export const FALLBACK_STARTER = 'sproutle';

const STARTER_LINES: ReadonlySet<string> = new Set(
  content.creatures.filter((c) => c.starter).map((c) => c.line),
);

/** The starter creature (as best the loaded data says), or null when there is none to point at. */
export function starterCreature(creatures: readonly Creature[]): Creature | null {
  let best: Creature | null = null;
  for (const creature of creatures) {
    if (!STARTER_LINES.has(creature.line)) continue;
    if (
      best === null ||
      creature.caughtAt < best.caughtAt ||
      (creature.caughtAt === best.caughtAt && creature.id < best.id)
    ) {
      best = creature;
    }
  }
  return best;
}

/** What the corner pin draws: the starter's species and whether it is shiny (Sproutle, plain, with none). */
export function starterLook(creatures: readonly Creature[]): { species: string; shiny: boolean } {
  const starter = starterCreature(creatures);
  return starter === null
    ? { species: FALLBACK_STARTER, shiny: false }
    : { species: starter.species, shiny: starter.shiny };
}
