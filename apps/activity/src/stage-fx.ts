/**
 * How long the stage's effects stay on screen, and when each round's pieces start. Pure (no DOM, no
 * timers), so it is unit-tested; `use-fx-trail.ts`, `use-live-stage.ts` and `Replay.tsx` run the clocks.
 *
 * Two clocks are kept apart on purpose:
 * - the **stagger** (`Beat.ms`, from `stage.ts`) is how long after a beat starts the next one starts;
 * - the **visible duration** (here) is how long that beat's effects stay: a damage number floats for
 *   over a second, a crit for two, a reaction's name for a second and a half, and so on. Effects of
 *   one beat overlap the next beats, which is what keeps combos and crits readable.
 *
 * A live round is 15 seconds: a 3 second "Round N" intro, then the beats, and the last beat's
 * effects are over about 1.5 seconds before the next round's intro. A replay plays the same intro
 * (1.5 seconds) and the same visible durations; at 2x the stagger is halved and the durations and
 * the intro are about 30% and 40% shorter.
 */
import type { FightEvent } from '@creatures/engine';
import type { Speed } from './replay';
import { fitBeats, type Beat, type Cue } from './stage';

// --- Visible durations (at 1x) ---

/** How long each kind of effect stays on screen, in milliseconds. */
export const FX_MS = {
  /** A damage number floats up for this long. */
  float: 1300,
  /** A crit floats longer, with its "CRITICAL!" pop. */
  crit: 2000,
  /** A reaction's burst and its name. */
  burst: 1500,
  /** A knockout is held on the creature. */
  ko: 1000,
  /** An ability's card: the creature's name and the ability. */
  ability: 1500,
  /** The boss move or luck banner. */
  callout: 1500,
  /** A coloured frame over a zone. */
  zone: 1000,
} as const;

/** At 2x the durations are this share of their length, in basis points (about 30% shorter). */
export const FAST_FX_BP = 7_000;

/** The effects that stay on screen longer than their beat; the rest are short and only last for the beat. */
export type FxCue = Extract<
  Cue,
  { kind: 'float' | 'burst' | 'ko' | 'ability' | 'gimmick' | 'banner' | 'zone' }
>;

export function isFxCue(cue: Cue): cue is FxCue {
  switch (cue.kind) {
    case 'float':
    case 'burst':
    case 'ko':
    case 'ability':
    case 'gimmick':
    case 'banner':
    case 'zone':
      return true;
    default:
      return false;
  }
}

const scaled = (ms: number, speed: Speed): number =>
  speed === 2 ? Math.round((ms * FAST_FX_BP) / 10_000) : ms;

/** How long an effect stays visible. */
export function cueMs(cue: FxCue, speed: Speed = 1): number {
  switch (cue.kind) {
    case 'float':
      return scaled(cue.crit ? FX_MS.crit : FX_MS.float, speed);
    case 'burst':
      return scaled(FX_MS.burst, speed);
    case 'ko':
      return scaled(FX_MS.ko, speed);
    case 'ability':
      return scaled(FX_MS.ability, speed);
    case 'gimmick':
    case 'banner':
      return scaled(FX_MS.callout, speed);
    case 'zone':
      return scaled(FX_MS.zone, speed);
  }
}

/** How long the longest-lived effect of a beat stays visible (0 when it has none). */
export function beatHoldMs(cues: readonly Cue[], speed: Speed = 1): number {
  let hold = 0;
  for (const cue of cues) if (isFxCue(cue)) hold = Math.max(hold, cueMs(cue, speed));
  return hold;
}

/** The stagger at the replay's speed: 2x halves it. */
export function staggerMs(ms: number, speed: Speed = 1): number {
  return speed === 2 ? Math.round(ms / 2) : ms;
}

/** The length of the short stage animations of a beat (hop, flash, shake): never too quick to see. */
export function shortEffectMs(beatStaggerMs: number): number {
  return Math.min(600, Math.max(300, beatStaggerMs));
}

// --- The round intro ---

/** A live round opens with "Round N" for this long, then its beats play. */
export const INTRO_LIVE_MS = 3_000;
/** A replay's intro at 1x. */
export const INTRO_REPLAY_MS = 1_500;
/** The last beat's effects are over this long before the next round starts. */
export const LIVE_TAIL_MS = 1_500;

/** The intro of a replay round: 1.5 seconds, 0.9 at 2x. */
export function replayIntroMs(speed: Speed = 1): number {
  return speed === 2 ? 900 : INTRO_REPLAY_MS;
}

/** What the "Round N" overlay says. `key` makes a new round's overlay a new element. */
export interface IntroView {
  round: number;
  rounds: number;
  /** How long it stays, for its animation. */
  ms: number;
  key: number;
}

/**
 * The time a live round's beats may use, from the first beat's start to the end of the last beat's
 * effects: the round length less the intro and the tail (10.5 s for a 15 s round), at least 2 s.
 */
export function liveBudgetMs(roundMs: number): number {
  return Math.max(2_000, roundMs - INTRO_LIVE_MS - LIVE_TAIL_MS);
}

/**
 * Plans a live round: whether it opens with the intro (when the first new event is the round's
 * start), and the beats with their staggers squeezed so that the last beat's effects end within the
 * budget. Beats that continue a round (a stage that joined in the middle) get no intro and the
 * whole round length less the tail.
 */
export function planLiveRound(
  beats: readonly Beat[],
  events: readonly FightEvent[],
  roundMs: number,
): { introRound: number | null; introMs: number; beats: Beat[] } {
  const first = beats[0];
  const opening = first === undefined ? undefined : events[first.from];
  const introRound = opening?.t === 'round_start' ? opening.round : null;
  const introMs = introRound === null ? 0 : INTRO_LIVE_MS;
  const budget =
    introRound === null ? Math.max(2_000, roundMs - LIVE_TAIL_MS) : liveBudgetMs(roundMs);
  const last = beats.at(-1);
  const hold = last === undefined ? 0 : beatHoldMs(last.cues);
  return {
    introRound,
    introMs,
    beats: fitBeats(beats, Math.max(0, budget - hold)),
  };
}

/**
 * What a replay does before it shows beat `next`: how long to wait after the previous one, and
 * whether the beat opens a round (then the intro shows for `introMs` first). Before a round's intro
 * the previous round's effects are given time to finish.
 */
export function replayLead(
  beats: readonly Beat[],
  events: readonly FightEvent[],
  next: number,
  speed: Speed = 1,
): { waitMs: number; introMs: number; round: number | null } {
  const beat = beats[next];
  const opening = beat === undefined ? undefined : events[beat.from];
  const round = opening?.t === 'round_start' ? opening.round : null;
  const previous = next > 0 ? beats[next - 1] : undefined;
  const stagger = previous === undefined ? 0 : staggerMs(previous.ms, speed);
  if (round === null) return { waitMs: stagger, introMs: 0, round: null };
  const hold = previous === undefined ? 0 : beatHoldMs(previous.cues, speed);
  return { waitMs: Math.max(stagger, hold), introMs: replayIntroMs(speed), round };
}

// --- Effects on screen ---

/** An effect that is on screen now: its cue, how long it stays, the lane it floats in and when it ends. */
export interface FxItem {
  cue: FxCue;
  /** How long it stays visible, for the animation (0: shown without motion, until replaced). */
  ms: number;
  /** Floating numbers on one target stack in lanes (0 to 3) so overlapping ones do not sit on each other. */
  lane: number;
  /** Local time when it goes (`Infinity` when it stays until replaced). */
  until: number;
}

const LANES = 4;

/** The smallest lane that no other number on the same target uses, or the least crowded one. */
function freeLane(items: readonly FxItem[], target: string | null): number {
  const used = items
    .filter((i) => i.cue.kind === 'float' && i.cue.target === target)
    .map((i) => i.lane);
  for (let lane = 0; lane < LANES; lane++) if (!used.includes(lane)) return lane;
  return used.length % LANES;
}

/** Effects that are still on screen at `now`. */
export function activeFx(items: readonly FxItem[], now: number): FxItem[] {
  return items.filter((i) => i.until > now);
}

/**
 * Adds the effects of a beat that starts at `now`. Effects that have ended are dropped first. Cues
 * that are only for the beat (hops, flashes) are not kept.
 */
export function addFx(
  items: readonly FxItem[],
  cues: readonly Cue[],
  now: number,
  speed: Speed = 1,
): FxItem[] {
  const out = activeFx(items, now);
  for (const cue of cues) {
    if (!isFxCue(cue)) continue;
    const ms = cueMs(cue, speed);
    const lane = cue.kind === 'float' ? freeLane(out, cue.target) : 0;
    out.push({ cue, ms, lane, until: now + ms });
  }
  return out;
}

/** Effects shown without motion (reduced motion): kept until the next beat replaces them. */
export function staticFx(cues: readonly Cue[]): FxItem[] {
  const out: FxItem[] = [];
  for (const cue of cues) {
    if (!isFxCue(cue)) continue;
    const lane = cue.kind === 'float' ? freeLane(out, cue.target) : 0;
    out.push({ cue, ms: 0, lane, until: Number.POSITIVE_INFINITY });
  }
  return out;
}

/** Milliseconds until the next effect ends (at least 1), or null when none will. */
export function nextFxEnd(items: readonly FxItem[], now: number): number | null {
  let soonest: number | null = null;
  for (const i of items) {
    if (!Number.isFinite(i.until)) continue;
    const wait = Math.max(1, i.until - now);
    if (soonest === null || wait < soonest) soonest = wait;
  }
  return soonest;
}
