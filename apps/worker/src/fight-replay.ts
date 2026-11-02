/**
 * The dispatcher of stored fights (docs/design/combat/integration.md, section 5): a stored input says which rules it was played under.
 * A `version: 2` input replays on the combat v2 engine, an input without a version on the shipped one. The live finale's replay and the
 * readers of stored rows (the after-action stats and the replay route) go through here, so a week from either rules version stays
 * readable.
 */
import { createSeededRng } from '@creatures/game';
import { simulateFight, type FightInput, type FightResult } from '@creatures/engine';
import {
  stageV2,
  type FinaleAction,
  type StageCarry,
  type StageInputV2,
  type StageOutput,
} from '@creatures/engine/v2';

/** A stored fight input of either rules version. */
export type StoredFightInput = FightInput | StageInputV2;

/** True for a combat v2 input (it carries `version: 2`; a v1 input has no version). */
export const isV2Input = (input: StoredFightInput): input is StageInputV2 =>
  (input as { version?: unknown }).version === 2;

/** The rules version a stored input was played under. */
export const rulesOfInput = (input: StoredFightInput): 1 | 2 => (isV2Input(input) ? 2 : 1);

/** What a v2 replay may change: the live finale's inputs so far, and how many rounds to play (the finale shows the rounds so far). */
export interface V2ReplayOptions {
  /** The carry the stage started from (the weekend before it). */
  carry: StageCarry;
  actions?: readonly FinaleAction[];
  /**
   * Play only the first `upToRound` rounds. The engine draws its dice in play order and a round reads nothing from a later one, so these
   * rounds are exactly the first rounds of the whole fight (a test holds the worker to it).
   */
  upToRound?: number;
}

/** Replays a v1 input with its seed. */
export function replayFight(input: FightInput, seed: string): { rules: 1; result: FightResult };
/** Replays a v2 input with its seed, from the carry of the earlier stages. */
export function replayFight(
  input: StageInputV2,
  seed: string,
  options: V2ReplayOptions,
): { rules: 2; output: StageOutput };
export function replayFight(
  input: StoredFightInput,
  seed: string,
  options?: V2ReplayOptions,
): { rules: 1; result: FightResult } | { rules: 2; output: StageOutput } {
  if (!isV2Input(input)) return { rules: 1, result: simulateFight(input, createSeededRng(seed)) };
  if (options === undefined) throw new Error('a v2 replay needs the stage carry');
  const { carry, actions, upToRound } = options;
  const played: StageInputV2 = {
    ...input,
    ...(actions === undefined ? {} : { actions }),
    ...(upToRound === undefined || upToRound >= input.boss.rounds
      ? {}
      : { boss: { ...input.boss, rounds: Math.max(0, upToRound) } }),
  };
  return { rules: 2, output: stageV2(played, carry, createSeededRng(seed)) };
}
