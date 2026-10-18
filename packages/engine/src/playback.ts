/**
 * How long a fight takes to play, shared by the server and the client so that they cannot disagree.
 * Pure: it only looks at the event log.
 *
 * The live finale is paced by its content: a round lasts as long as its events take to show, so a
 * round with few creatures acting is short and a crowded one is long (but never more than
 * `MAX_ROUND_MS`, so 12 rounds stay under the 5 minute cap). The server schedules every round start
 * from this (`roundPlaybackMs` of the round before), and the client plays the same beats with the
 * same staggers, so what players see and the clock agree. That is sound because of the engine's
 * prefix property: a round's events are fixed once the round has started.
 *
 * Two clocks are kept apart (see `docs/design/m5-finale.md`, "Playback"):
 * - the **stagger** (`PlannedBeat.ms`): how long after a beat starts the next one starts;
 * - the **visible duration** of an effect (client only): how long it stays on screen.
 *
 * A round's playback is: the intro ("Round N"), the staggers of every beat but the last visible one,
 * the wind-up of the last visible beat (boss actions telegraph 600 ms before they hit), and a tail
 * of 2 seconds after the last effect appears. It is clamped to 6..22 seconds.
 */
import type { FightEvent } from './types';

/** "Round N" on the stage at the start of a live round. */
export const INTRO_LIVE_MS = 1_500;
/** The same in a replay at normal speed. */
export const INTRO_REPLAY_MS = 1_000;
/** Ongoing effects get this long after the last effect appears, before the next round starts. */
export const TAIL_MS = 2_000;
/** A boss action shows red reticles on its targets this long before the hit lands. */
export const WINDUP_MS = 600;
/** A round never plays shorter or longer than this. 12 rounds of 22 s are 4:24, under 5 minutes. */
export const MIN_ROUND_MS = 6_000;
export const MAX_ROUND_MS = 22_000;

/** The stagger of a beat is `BASE_BEAT_MS` plus a little for moments worth a second look, at most `MAX_BEAT_MS`. */
export const BASE_BEAT_MS = 500;
export const MAX_BEAT_MS = 700;
/** Beats never get squeezed below this (plus their wind-up). */
export const MIN_BEAT_MS = 250;
const WEIGHT_MS = 100;

export type Speed = 1 | 2;

export interface PlaybackOptions {
  /** The intro's length at normal speed. Default: the live intro (`INTRO_LIVE_MS`). */
  introMs?: number;
  /** A replay at 2x plays everything in half the time. Default 1. */
  speed?: Speed;
}

// --- Beats ---

/** True when this event starts a new playback beat (a creature's turn, the boss acting, a round edge). */
function startsBeat(e: FightEvent): boolean {
  switch (e.t) {
    case 'round_start':
    case 'turn':
    case 'skip':
    case 'gimmick':
    case 'round_end':
      return true;
    case 'boss_hit':
      return e.source === 'attack';
    default:
      return false;
  }
}

/**
 * Playback beats. Each beat is a run of events that belong together (one creature's turn with its
 * hit, mark and reaction; one boss attack; one boss gimmick). Returns the event index each beat ends
 * at, so beat `n` leaves `ends[n - 1]` events applied.
 */
export function beatEnds(events: readonly FightEvent[]): number[] {
  const ends: number[] = [];
  // The enraged boss's hits on every creature are one boss action (there is no gimmick event to
  // start it): the first of a volley starts a beat and the rest belong to it.
  let inVolley = false;
  for (let i = 1; i < events.length; i++) {
    const e = events[i] as FightEvent;
    if (e.t === 'boss_hit' && e.source === 'enrage') {
      if (!inVolley) ends.push(i);
      inVolley = true;
    } else if (startsBeat(e)) {
      ends.push(i);
      inVolley = false;
    }
  }
  if (events.length > 0) ends.push(events.length);
  return ends;
}

/** True for the events that give a beat something to show (the stage draws nothing for the others). */
function isVisibleEvent(e: FightEvent): boolean {
  switch (e.t) {
    case 'round_start':
      return e.luck !== undefined;
    case 'support_buff':
    case 'ability':
    case 'turn':
    case 'skip':
    case 'hit':
    case 'mark':
    case 'reaction':
    case 'gimmick':
    case 'boss_hit':
    case 'knockout':
    case 'silence':
    case 'heal':
    case 'sky_heal':
    case 'cleanse':
    case 'charge':
    case 'retreat':
    case 'enrage':
      return true;
    default:
      return false;
  }
}

/**
 * True when the event is a boss action that gets a wind-up (the reflect gimmick only arms a trap).
 * A `charge` counts: its marks appear and the stage holds a moment before the round goes on. The
 * enraged boss's hits are one action with no gimmick event, so they count themselves.
 */
export function isBossAction(e: FightEvent): boolean {
  switch (e.t) {
    case 'gimmick':
      return e.op !== 'reflect_first_reaction';
    case 'charge':
      return true;
    case 'boss_hit':
      return e.source === 'attack' || e.source === 'reflect' || e.source === 'enrage';
    default:
      return false;
  }
}

export interface BeatTiming {
  /** The stagger at normal speed: wind-up included. */
  ms: number;
  /** How long the beat's targets are telegraphed before the hit (0 for beats without a boss action). */
  windupMs: number;
  /** The beat shows something. */
  visible: boolean;
}

/**
 * The timing of the beat that covers events [from, to): 500 ms for a plain turn, up to 700 ms for a
 * crit, reaction, ability, knockout, boss gimmick, charge, enrage, retreat or luck banner, plus the
 * 600 ms wind-up of a boss action (a charge's announcement included). A beat with nothing to show takes the minimum.
 */
export function beatTiming(events: readonly FightEvent[], from: number, to: number): BeatTiming {
  let visible = false;
  let crit = false;
  let burst = false;
  let ability = false;
  let ko = false;
  let gimmick = false;
  let banner = false;
  let windup = false;
  const end = Math.min(to, events.length);
  for (let i = Math.max(0, from); i < end; i++) {
    const e = events[i] as FightEvent;
    if (!isVisibleEvent(e)) continue;
    visible = true;
    if ((e.t === 'hit' || e.t === 'boss_hit') && e.crit === true) crit = true;
    else if (e.t === 'reaction') burst = true;
    else if (e.t === 'ability') ability = true;
    else if (e.t === 'knockout') ko = true;
    else if (e.t === 'gimmick' || e.t === 'charge') gimmick = true;
    else if (e.t === 'boss_hit' && e.source === 'enrage') gimmick = true;
    else if (e.t === 'round_start' || e.t === 'enrage' || e.t === 'retreat') banner = true;
    if (isBossAction(e)) windup = true;
  }
  const windupMs = windup ? WINDUP_MS : 0;
  if (!visible) return { ms: MIN_BEAT_MS, windupMs, visible };
  const weights = [crit, burst, ability, ko, gimmick, banner].filter(Boolean).length;
  const ms = Math.min(MAX_BEAT_MS, BASE_BEAT_MS + weights * WEIGHT_MS) + windupMs;
  return { ms, windupMs, visible };
}

// --- Plans ---

export interface PlannedBeat {
  /** The events [from, to) of the log. */
  from: number;
  to: number;
  /** How long after this beat starts the next one starts (wind-up included), at the plan's speed. */
  ms: number;
  /** The wind-up before the hit lands, at the plan's speed; 0 for beats without a boss action. */
  windupMs: number;
  visible: boolean;
}

export interface RoundPlan {
  /** The round number, or 0 for events before the first round (the adaptation notice). */
  round: number;
  /** The events [from, to) of the log. */
  from: number;
  to: number;
  /** The "Round N" intro before the first beat (0 for round 0), at the plan's speed. */
  introMs: number;
  beats: PlannedBeat[];
  /** How long the round plays, from the start of its intro to the start of the next round's. */
  totalMs: number;
}

const halve = (ms: number, speed: Speed): number => (speed === 2 ? Math.round(ms / 2) : ms);

/**
 * Plans one round from its events (which start with the round's `round_start`; `offset` is where the
 * slice starts in the whole log, so beats carry log indices). Staggers are kept as they are unless
 * the round would pass `MAX_ROUND_MS`, in which case they are squeezed in proportion, keeping at
 * least 250 ms (plus the wind-up) each where that fits. The total is the intro, the staggers of every beat before the last
 * visible one, that beat's wind-up and a 2 second tail, clamped to 6..22 seconds. The last visible
 * beat's `ms` is its wind-up plus the tail; beats after it (the round's end) are state-only and start
 * when the tail is over.
 */
export function planRound(
  events: readonly FightEvent[],
  options: PlaybackOptions = {},
  offset = 0,
): RoundPlan {
  const speed = options.speed ?? 1;
  const intro = events[0]?.t === 'round_start' ? (options.introMs ?? INTRO_LIVE_MS) : 0;
  const first = events[0];
  const round = first === undefined ? 0 : first.t === 'round_start' ? first.round : 0;
  const raw: { from: number; to: number; timing: BeatTiming }[] = [];
  let start = 0;
  for (const end of beatEnds(events)) {
    raw.push({ from: start, to: end, timing: beatTiming(events, start, end) });
    start = end;
  }
  let lastVisible = -1;
  raw.forEach((b, k) => {
    if (b.timing.visible) lastVisible = k;
  });

  // Squeeze when the round is too long: scale the staggers before the last visible beat.
  const lead = raw.slice(0, Math.max(0, lastVisible));
  const lastWindup =
    lastVisible < 0 ? 0 : (raw[lastVisible] as (typeof raw)[number]).timing.windupMs;
  const natural = lead.reduce((sum, b) => sum + b.timing.ms, 0);
  const budget = Math.max(0, MAX_ROUND_MS - intro - lastWindup - TAIL_MS);
  const scale = natural > budget && natural > 0 ? budget / natural : 1;
  // Squeezed beats keep their wind-up and at least 250 ms after it; only when even that does not fit
  // (a round with dozens of beats) do they go below that, so the round never runs past its cap.
  const withFloors = lead.map((b) =>
    scale === 1
      ? b.timing.ms
      : Math.max(MIN_BEAT_MS + b.timing.windupMs, Math.floor(b.timing.ms * scale)),
  );
  const staggers =
    withFloors.reduce((sum, ms) => sum + ms, 0) <= budget || scale === 1
      ? withFloors
      : lead.map((b) => Math.floor(b.timing.ms * scale));
  const squeezed = staggers.reduce((sum, ms) => sum + ms, 0);

  const beats: PlannedBeat[] = raw.map((b, k) => {
    let ms: number;
    if (k < lastVisible) ms = staggers[k] as number;
    else if (k === lastVisible) ms = b.timing.windupMs + TAIL_MS;
    else ms = 0;
    return {
      from: b.from + offset,
      to: b.to + offset,
      ms: halve(ms, speed),
      windupMs: halve(b.timing.windupMs, speed),
      visible: b.timing.visible,
    };
  });
  const content = lastVisible < 0 ? 0 : squeezed + lastWindup + TAIL_MS;
  const total1x = Math.min(MAX_ROUND_MS, Math.max(MIN_ROUND_MS, intro + content));
  return {
    round,
    from: offset,
    to: offset + events.length,
    introMs: halve(intro, speed),
    beats,
    totalMs: halve(total1x, speed),
  };
}

/**
 * How long one round plays, in milliseconds, from its events (`round_start` first): the intro, the
 * beats and the tail, clamped to 6..22 seconds. The live server starts round r+1 this long after
 * round r; the client plays the round in exactly this time.
 */
export function roundPlaybackMs(
  roundEvents: readonly FightEvent[],
  options: PlaybackOptions = {},
): number {
  return planRound(roundEvents, options).totalMs;
}

/**
 * Plans every round of a log (a replay, or the rounds a live client has so far). Events before the
 * first `round_start` (the adaptation notice) form a round 0 that plays instantly.
 */
export function planRounds(
  events: readonly FightEvent[],
  options: PlaybackOptions = {},
): RoundPlan[] {
  const starts: number[] = [];
  events.forEach((e, i) => {
    if (e.t === 'round_start') starts.push(i);
  });
  const plans: RoundPlan[] = [];
  const firstStart = starts[0] ?? events.length;
  if (firstStart > 0) {
    const lead = planRound(events.slice(0, firstStart), options, 0);
    plans.push({ ...lead, round: 0, introMs: 0, totalMs: 0 });
  }
  starts.forEach((from, k) => {
    const to = starts[k + 1] ?? events.length;
    plans.push(planRound(events.slice(from, to), options, from));
  });
  return plans;
}
