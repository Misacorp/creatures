/**
 * The timing of a combat v2 playback, pure (the clocks are `use-playback-v2.ts`). A beat stays on screen as the newest for its own time;
 * the next one lands after it. A round of many creatures (a wide raid) is squeezed to fit a budget, so the live finale's round, which has a
 * fixed length, is always played out before the next one starts, and a replay of a big raid does not drag.
 */
import type { BeatV2 } from './fight-v2';

export type SpeedV2 = 1 | 2;

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
 */
export function beatDurations(
  beats: readonly BeatV2[],
  options: { speed: SpeedV2; budgetMs: number },
): number[] {
  const rounds = new Map<number, number>();
  const base = (b: BeatV2): number => BEAT_MS[b.kind] + (b.reacts ? REACTION_HOLD_MS : 0);
  for (const b of beats) rounds.set(b.round, (rounds.get(b.round) ?? 0) + base(b));
  return beats.map((b) => {
    const total = rounds.get(b.round) ?? base(b);
    const squeeze = total > options.budgetMs ? options.budgetMs / total : 1;
    const ms = Math.max(MIN_BEAT_MS, Math.round(base(b) * squeeze));
    return options.speed === 2 ? Math.max(MIN_BEAT_MS / 2, Math.round(ms / 2)) : ms;
  });
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
