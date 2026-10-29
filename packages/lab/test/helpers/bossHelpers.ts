/** Shared by the boss and foe content tests. */
import { CARDS, type BossDef } from '../../src';

export const cardIds = new Set(CARDS.map((c) => c.id));

/** The damaging moves due on one boss turn of one round (the plain attack is not a move). */
export function damagingDue(b: BossDef, round: number, turn: number): number {
  const all = [...b.moves, ...(b.escalation?.phase?.moves ?? [])];
  return all.filter(
    (m) =>
      m.powerBp > 0 && !m.silenceTurns && round % m.every === 0 && (m.turn ?? b.rows - 1) === turn,
  ).length;
}
