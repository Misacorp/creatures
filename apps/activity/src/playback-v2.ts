/**
 * The timing of a combat v2 playback, pure (the clocks are `use-playback-v2.ts`). A beat stays on screen as the newest for its own time;
 * the next one lands after it. A round of many creatures (a wide raid) is squeezed to fit a budget, so the live finale's round, which has a
 * fixed length, is always played out before the next one starts, and a replay of a big raid does not drag.
 */
import { RULES } from '@creatures/game';
import type { BeatV2 } from './fight-v2';

export type SpeedV2 = 1 | 2;

/**
 * The pace of every stage the player watches, in one place: a round of the live finale lasts this long (the server's clock), and a
 * replay of stage 1, stage 2 or the finale plays its rounds at the same length, so a replay feels like the finale (Misa, 2026-11-13: "slow
 * down the replay speed of all phases to be similar to the finale. It's easier to track that way"). Change this one number to change both.
 */
export const STAGE_ROUND_MS: number = RULES.raid.v2.liveRoundMs;

/** What of a round the live finale keeps free after its beats for the last effects, so a round ends before the next one starts. */
export const ROUND_TAIL_MS = 3000;

/** What the beats of a round (and its "Round N" intro) may take together at 1x in a round of `roundMs`, for `introMs` of intro. */
export const roundBudgetMs = (roundMs: number, introMs: number): number =>
  Math.max(2000, roundMs - ROUND_TAIL_MS - introMs);

/** How long each kind of beat stays at 1x, in milliseconds, before a round's budget squeezes it. */
export const BEAT_MS = { round: 500, creature: 650, boss: 1300, end: 1800 } as const;

/** A beat in which a reaction goes off stays this much longer (at 1x, before a round's budget squeezes it), so the callout lands. */
export const REACTION_HOLD_MS = 450;

/** No beat is quicker than this: a hit has to be seen. */
const MIN_BEAT_MS = 140;

/** "Round N" shows this long before the round's first beat lands, at 1x (the replay's; a live round is shorter). */
export const INTRO_REPLAY_MS = 1000;
export const INTRO_LIVE_MS = 700;

/**
 * The time each beat stays, one number per beat. The beats of a round share `budgetMs` (at 1x) when their base times add up to more;
 * 2x halves everything. A fight with no round budget (`Infinity`) plays at the base times.
 *
 * With `roundMs` (a replay) every round but the last is held to the live finale's round: its last beat stays long enough that the round,
 * its `introMs` included, takes `roundMs` at 1x, as the live finale's clock makes it. A round that already takes longer is left as it is.
 */
export function beatDurations(
  beats: readonly BeatV2[],
  options: { speed: SpeedV2; budgetMs: number; roundMs?: number; introMs?: number },
): number[] {
  const rounds = new Map<number, number>();
  const base = (b: BeatV2): number => BEAT_MS[b.kind] + (b.reacts ? REACTION_HOLD_MS : 0);
  for (const b of beats) rounds.set(b.round, (rounds.get(b.round) ?? 0) + base(b));
  const squeezed = beats.map((b) => {
    const total = rounds.get(b.round) ?? base(b);
    const squeeze = total > options.budgetMs ? options.budgetMs / total : 1;
    return Math.max(MIN_BEAT_MS, Math.round(base(b) * squeeze));
  });
  if (options.roundMs !== undefined) {
    // The last beat of a round that another round follows holds the rest of the round's time.
    const spent = new Map<number, number>();
    beats.forEach((b, k) =>
      spent.set(b.round, (spent.get(b.round) ?? 0) + (squeezed[k] as number)),
    );
    beats.forEach((b, k) => {
      const next = beats[k + 1];
      if (b.round === 0 || next === undefined || next.round === b.round) return;
      const rest = options.roundMs! - (options.introMs ?? 0) - (spent.get(b.round) ?? 0);
      if (rest > 0) squeezed[k] = (squeezed[k] as number) + rest;
    });
  }
  return squeezed.map((ms) =>
    options.speed === 2 ? Math.max(MIN_BEAT_MS / 2, Math.round(ms / 2)) : ms,
  );
}

/**
 * Where a live stage that has fallen behind should resume: if more than `keep` beats are waiting, the start of the last round that has
 * begun (rounds that went by unseen are skipped, as the v1 finale does); otherwise where it is.
 */
export function resumeAt(beats: readonly BeatV2[], shown: number, keep: number): number {
  if (beats.length - shown <= keep) return shown;
  for (let k = beats.length - 1; k >= 0; k--) {
    if (beats[k]?.kind === 'round' && (beats[k]?.round ?? 0) > 0) return Math.max(shown, k);
  }
  return shown;
}
