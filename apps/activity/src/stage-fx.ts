/**
 * How long the stage's effects stay on screen. Pure (no DOM, no timers), so it is unit-tested;
 * `use-fx-trail.ts`, `use-live-stage.ts` and `Replay.tsx` run the clocks.
 *
 * Two clocks are kept apart on purpose:
 * - the **stagger** (`Beat.ms`, from the engine's pacing, see `stage.ts`) is how long after a beat
 *   starts the next one starts;
 * - the **visible duration** (here) is how long that beat's effects stay: a damage number floats for
 *   2.5 seconds, a crit for 3, a reaction's name for 2.5, an ability card for 2, a knockout tag for
 *   1.5 and a boss attack's label for 2. Effects of one beat overlap the next beats, which is what
 *   keeps combos and crits readable. Effects overlap freely.
 *
 * A live round is as long as its content (the engine's `roundPlaybackMs`, 6 to 22 seconds): a 1.5
 * second "Round N" intro, the beats, and 2 seconds after the last effect appears. A replay plays the
 * same pacing with a 1 second intro; at 2x the stagger, the intro and the tail are halved and the
 * visible durations are about 30% shorter.
 */
import { INTRO_LIVE_MS, INTRO_REPLAY_MS, WINDUP_MS } from '@creatures/engine';
import type { Speed } from './replay';
import type { Beat, Cue } from './stage';

export { INTRO_LIVE_MS, INTRO_REPLAY_MS };

// --- Visible durations (at 1x) ---

/** How long each kind of effect stays on screen, in milliseconds. */
export const FX_MS = {
  /** A damage number rises for this long. */
  float: 2500,
  /** A crit rises longer, with its "CRITICAL!" pop. */
  crit: 3000,
  /** A reaction's burst and its name. */
  burst: 2500,
  /** A knockout is held on the creature. */
  ko: 1500,
  /** An ability's card: the creature's name and the ability. */
  ability: 2000,
  /** The boss attack's label and the marks on its targets, and the luck banner. */
  callout: 2000,
  /** A coloured frame over a zone. */
  zone: 1200,
} as const;

/** At 2x the durations are this share of their length, in basis points (about 30% shorter). */
const FAST_FX_BP = 7_000;

/** The effects that stay on screen longer than their beat; the rest are short and only last for the beat. */
export type FxCue = Extract<
  Cue,
  { kind: 'float' | 'burst' | 'ko' | 'ability' | 'banner' | 'zone' | 'strike' | 'windup' | 'cover' }
>;

export function isFxCue(cue: Cue): cue is FxCue {
  switch (cue.kind) {
    case 'float':
    case 'burst':
    case 'ko':
    case 'ability':
    case 'banner':
    case 'zone':
    case 'strike':
    case 'windup':
    case 'cover':
      return true;
    default:
      return false;
  }
}

const scaled = (ms: number, speed: Speed): number =>
  speed === 2 ? Math.round((ms * FAST_FX_BP) / 10_000) : ms;

/** How long an effect stays visible. A wind-up lasts as long as the engine's wind-up (halved at 2x). */
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
    case 'banner':
    case 'strike':
    case 'cover':
      return scaled(FX_MS.callout, speed);
    case 'zone':
      return scaled(FX_MS.zone, speed);
    case 'windup':
      return speed === 2 ? Math.round(WINDUP_MS / 2) : WINDUP_MS;
  }
}

/** The length of the short stage animations of a beat (hop, flash, shake): never too quick to see. */
export function shortEffectMs(beatStaggerMs: number): number {
  return Math.min(600, Math.max(300, beatStaggerMs));
}

// --- The round intro ---

/** What the "Round N" overlay says. `key` makes a new round's overlay a new element. */
export interface IntroView {
  round: number;
  /** The fight's round limit ("/ 6" after the round), or null when it has none: never the fight's real length. */
  rounds: number | null;
  /** How long it stays, for its animation. */
  ms: number;
  key: number;
}

// --- The timeline of a live round ---

/** One thing that happens while a live round plays, `at` ms after the round's playback starts. */
interface TimelineStep {
  at: number;
  /**
   * `intro`: "Round N" appears; `intro-end`: it goes; `windup`: reticles on the targets of the boss
   * action; `land`: the beat's events take effect (its effects start).
   */
  kind: 'intro' | 'intro-end' | 'windup' | 'land';
  /** Index of the beat (the first beat for the intro). */
  beat: number;
}

/**
 * When everything of a live round happens, from the beats the engine planned for it: the intro, then
 * each beat starting its wind-up (if it has one) and landing 600 ms later, the next beat starting
 * after the beat's stagger. `endsAt` is when the last (state-only) beat has landed: the intro plus
 * every stagger, which is the length the server gives the round (`roundPlaybackMs`; a round shorter
 * than 6 s is simply idle for the rest). Pure, so the pacing is tested without timers.
 */
export function liveTimeline(beats: readonly Beat[]): { steps: TimelineStep[]; endsAt: number } {
  const steps: TimelineStep[] = [];
  let at = 0;
  const first = beats[0];
  if (first !== undefined && first.introMs > 0) {
    steps.push({ at, kind: 'intro', beat: 0 });
    at += first.introMs;
    steps.push({ at, kind: 'intro-end', beat: 0 });
  }
  beats.forEach((beat, k) => {
    if (beat.windupMs > 0) steps.push({ at, kind: 'windup', beat: k });
    steps.push({ at: at + beat.windupMs, kind: 'land', beat: k });
    at += beat.ms;
  });
  return { steps, endsAt: at };
}

// --- Effects on screen ---

/** An effect that is on screen now: its cue, how long it stays, the lane it floats in and when it ends. */
export interface FxItem {
  cue: FxCue;
  /** How long it stays visible, for the animation (0: shown without motion, until replaced). */
  ms: number;
  /**
   * Numbers on the boss stand side by side in lanes (0 to 3) so overlapping ones do not sit on each
   * other. Numbers on a creature always spawn at the same base and keep rising, so a newer one sits
   * below the older ones: they have lane 0.
   */
  lane: number;
  /** Local time when it goes (`Infinity` when it stays until replaced). */
  until: number;
}

const LANES = 4;

/**
 * The lane of a new number. A creature's number is always lane 0: it rises from the same spot as the
 * ones before it, which have moved up by then, so the newest sits lowest. The boss has the whole
 * width, so its numbers stand side by side: the first lane no active number uses, or else the lane
 * whose newest number has risen furthest.
 */
function freeLane(items: readonly FxItem[], target: string | null): number {
  if (target !== null) return 0;
  const newest = new Array<number>(LANES).fill(Number.NEGATIVE_INFINITY);
  for (const i of items) {
    if (i.cue.kind !== 'float' || i.cue.target !== null) continue;
    const started = Number.isFinite(i.until) ? i.until - i.ms : Number.POSITIVE_INFINITY;
    newest[i.lane] = Math.max(newest[i.lane] ?? Number.NEGATIVE_INFINITY, started);
  }
  let best = 0;
  for (let lane = 1; lane < LANES; lane++) {
    if ((newest[lane] as number) < (newest[best] as number)) best = lane;
  }
  return best;
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
    // Nothing moves, so numbers on one creature are stacked instead of rising from the same spot.
    const lane =
      cue.kind !== 'float'
        ? 0
        : cue.target === null
          ? freeLane(out, null)
          : out.filter((i) => i.cue.kind === 'float' && i.cue.target === cue.target).length % LANES;
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
