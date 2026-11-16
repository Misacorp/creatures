/**
 * The boss's next move, worked out from what the player already sees: the boss card (each move's "every N rounds" and the boss turn it
 * lands on) and the round now. Nothing here reads an event, a roll or the outcome. A boss turn takes the moves due on it
 * (`round % every === 0` on its turn, as the engine's `bossTurn` does), then the plain attack.
 */
import type { BossCardV2, BossMoveV2 } from './raid-v2-api';

/** Where the fight stands, as the board shows it. */
export interface NextMoveInput {
  card: Pick<BossCardV2, 'moves'>;
  /** The boss's rows: it takes one turn after each row, every round. */
  rows: number;
  /** The round on show (0 before the first). */
  round: number;
  /** The round's step now: null at its start. */
  step: { kind: 'row' | 'boss'; row: number } | null;
  /** The boss's change of pattern has begun (its later moves are in play). Null: this boss has none. */
  phase: boolean | null;
}

/**
 * What the boss does on its next turn: the moves due (in the card's order), an empty list for the plain attack alone, or `null` when
 * the card cannot say (a later move of the change of pattern is due then, and the change has not begun, so it may or may not apply).
 */
export function nextBossMoves(i: NextMoveInput): BossMoveV2[] | null {
  const rows = Math.max(1, i.rows);
  // The last boss turn taken this round: after a boss step, that row's; after a row step, the one before.
  const done = i.step === null ? -1 : i.step.kind === 'boss' ? i.step.row : i.step.row - 1;
  // Round 0 is before the fight: the next turn is round 1's first.
  const round = i.round <= 0 ? 1 : i.round;
  const turn = i.round <= 0 ? 0 : done + 1;
  // The turn after the last of a round is the next round's first.
  const at = turn >= rows ? { round: round + 1, turn: 0 } : { round, turn };
  const due = i.card.moves.filter(
    (m) => at.round % Math.max(1, m.every) === 0 && Math.min(m.turn, rows - 1) === at.turn,
  );
  if (i.phase !== true && due.some((m) => m.later)) return null;
  return due.filter((m) => i.phase === true || !m.later);
}
