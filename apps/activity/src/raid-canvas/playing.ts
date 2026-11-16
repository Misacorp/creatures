/**
 * A stage that plays out as it happens (docs/design/combat/raid-screen.md, sections 4 and 6.1). The server resolves a stage at its time
 * but plays it over `rounds x roundMs`; while that window is open the raid view carries `playing`, and until `endsAt` the client holds
 * back every outcome signal (the HUD's Essence, "Out this weekend", result text). Pure: the clock is passed in.
 *
 * The fields are read defensively (`playingOf`): the server part lands beside this one, and a view without `playing` is simply idle.
 */
import type { RaidView } from '../raid-api';

export interface Playing {
  /** The stage that plays (1 to 3). */
  stage: number;
  startsAt: number;
  roundMs: number;
  /** When the next round is due (null once the last has played). */
  nextRoundAt: number | null;
  endsAt: number;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The playing window of a view, read from `view.v2.playing` (or `view.playing`); null when no stage plays. */
export function playingOf(view: Pick<RaidView, 'v2'>): Playing | null {
  const holder: unknown = view;
  const own = (holder as { playing?: unknown }).playing;
  const v2 = (view.v2 as { playing?: unknown } | undefined)?.playing;
  const raw = v2 ?? own;
  if (typeof raw !== 'object' || raw === null) return null;
  const p = raw as Record<string, unknown>;
  const { stage, startsAt, roundMs, endsAt, nextRoundAt } = p;
  if (!isNum(stage) || !isNum(startsAt) || !isNum(roundMs) || !isNum(endsAt)) return null;
  return {
    stage,
    startsAt,
    roundMs,
    nextRoundAt: isNum(nextRoundAt) ? nextRoundAt : null,
    endsAt,
  };
}

/** The raid phase name of a playing stage (the results list uses `phase1`, `phase2`, `finale`). */
export const phaseOfStage = (stage: number): 'phase1' | 'phase2' | 'finale' =>
  stage <= 1 ? 'phase1' : stage === 2 ? 'phase2' : 'finale';

/** The replay route's name of a stage. */
export const replayPhaseOfStage = (stage: number): 'stage1' | 'stage2' | 'finale' =>
  stage <= 1 ? 'stage1' : stage === 2 ? 'stage2' : 'finale';

/** Whether the outcome signals of the stage are still held back at `now` (until `endsAt`). */
export const isHeld = (playing: Playing | null, now: number): boolean =>
  playing !== null && now < playing.endsAt;

/** The round the clock is in, from 1 (the first round starts at `startsAt`); 0 before it begins; capped at `rounds`. */
export function roundAt(playing: Playing, now: number, rounds: number): number {
  if (now < playing.startsAt) return 0;
  return Math.min(rounds, Math.floor((now - playing.startsAt) / playing.roundMs) + 1);
}

/** Milliseconds until the replay should be fetched again (one fetch per round, never a poll); null when nothing more is due. */
export function nextFetchIn(playing: Playing, now: number, graceMs = 300): number | null {
  if (playing.nextRoundAt === null) {
    return now < playing.endsAt ? playing.endsAt - now + graceMs : null;
  }
  return Math.max(graceMs, playing.nextRoundAt - now + graceMs);
}
