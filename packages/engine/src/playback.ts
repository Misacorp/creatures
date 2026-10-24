/**
 * How long a fight takes to play, shared by the server and the client so that they cannot disagree.
 * Pure: it only looks at the event log.
 *
 * The live finale is paced by its content: a round lasts as long as its events take to show, so a
 * round with few creatures acting is short and a crowded one is long (but never more than the pace's
 * longest round). The server schedules every round start
 * from this (`roundPlaybackMs` of the round before), and the client plays the same beats with the
 * same staggers, so what players see and the clock agree. That is sound because of the engine's
 * prefix property: a round's events are fixed once the round has started.
 *
 * Two clocks are kept apart (see `docs/design/m5-finale.md`, "Playback"):
 * - the **stagger** (`PlannedBeat.ms`): how long after a beat starts the next one starts;
 * - the **visible duration** of an effect (client only): how long it stays on screen.
 *
 * A round's playback is: the intro ("Round N"), the staggers of every beat but the last visible one,
 * the wind-up of the last visible beat (boss actions telegraph before they hit), and a tail after the
 * last effect appears, clamped to the pace's shortest and longest round.
 *
 * Two paces exist (`Pace`): `CLASSIC_PACE` (replays, the dungeon, and live finales stored before
 * 2026-10-22: 6 to 22 seconds a round) and `SLOW_PACE` (live finales from 2026-10-22, about three
 * times slower, so players can follow the fight and react: a typical 12-round finale lasts about
 * 8 minutes). A stored fight keeps the pace it was stored with.
 */
import type { FightEvent } from './types';

/** "Round N" on the stage at the start of a live round (classic pace). */
export const INTRO_LIVE_MS = 1_500;
/** The same in a replay at normal speed. */
export const INTRO_REPLAY_MS = 1_000;
/** Ongoing effects get this long after the last effect appears, before the next round starts (classic pace). */
export const TAIL_MS = 2_000;
/** A boss action shows red reticles on its targets this long before the hit lands (classic pace). */
export const WINDUP_MS = 600;
/** A round never plays shorter or longer than this (classic pace). 12 rounds of 22 s are 4:24. */
export const MIN_ROUND_MS = 6_000;
export const MAX_ROUND_MS = 22_000;

/** The stagger of a beat is `BASE_BEAT_MS` plus a little for moments worth a second look, at most `MAX_BEAT_MS` (classic pace). */
export const BASE_BEAT_MS = 500;
export const MAX_BEAT_MS = 700;
/** Beats never get squeezed below this (plus their wind-up) (classic pace). */
export const MIN_BEAT_MS = 250;

/** Every duration of a round's playback. A fight is played with one pace from start to end. */
export interface Pace {
  /** "Round N" before the first beat. */
  introMs: number;
  /** After the last effect appears, before the next round. */
  tailMs: number;
  /** Red reticles on a boss action's targets before the hit lands. */
  windupMs: number;
  /** A plain beat's stagger; each moment worth a second look adds `weightMs`, up to `maxBeatMs`. */
  baseBeatMs: number;
  maxBeatMs: number;
  weightMs: number;
  /** The least a squeezed beat keeps (plus its wind-up). */
  minBeatMs: number;
  /** A round never plays shorter or longer than this. */
  minRoundMs: number;
  maxRoundMs: number;
  /**
   * How long effects stay on screen, against the stage's own durations (basis points, client only):
   * a slower fight keeps its numbers and labels up longer.
   */
  fxBp: number;
}

/** Replays, the dungeon, and live finales stored before 2026-10-22. */
export const CLASSIC_PACE: Readonly<Pace> = {
  introMs: INTRO_LIVE_MS,
  tailMs: TAIL_MS,
  windupMs: WINDUP_MS,
  baseBeatMs: BASE_BEAT_MS,
  maxBeatMs: MAX_BEAT_MS,
  weightMs: 100,
  minBeatMs: MIN_BEAT_MS,
  minRoundMs: MIN_ROUND_MS,
  maxRoundMs: MAX_ROUND_MS,
  fxBp: 10_000,
};

/**
 * The live finale from 2026-10-22 (Misa: "run much slower so people actually have time to react and
 * see what's going on"; about 8 minutes for a 12-round finale). A beat is four times as long, a boss
 * action is telegraphed for 1.5 seconds, and effects stay up 50% longer. On the simulator's finales a
 * round lasts 28 to 45 seconds (median 40) and a 12-round finale 6 to 8.5 minutes (median 7.3); the
 * enrage rounds can add up to 3 more rounds.
 */
export const SLOW_PACE: Readonly<Pace> = {
  // The "Round N" intro plays at its own speed, not slowed (Misa, 2026-10-23).
  introMs: 1_500,
  tailMs: 4_000,
  windupMs: 1_500,
  baseBeatMs: 2_000,
  maxBeatMs: 2_600,
  weightMs: 300,
  minBeatMs: 600,
  minRoundMs: 20_000,
  maxRoundMs: 45_000,
  fxBp: 15_000,
};

export type Speed = 1 | 2;

export interface PlaybackOptions {
  /** The durations. Default: `CLASSIC_PACE`. */
  pace?: Readonly<Pace>;
  /** The intro's length at normal speed. Default: the pace's intro. */
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
    case 'proc':
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
export function beatTiming(
  events: readonly FightEvent[],
  from: number,
  to: number,
  pace: Readonly<Pace> = CLASSIC_PACE,
): BeatTiming {
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
  const windupMs = windup ? pace.windupMs : 0;
  if (!visible) return { ms: pace.minBeatMs, windupMs, visible };
  const weights = [crit, burst, ability, ko, gimmick, banner].filter(Boolean).length;
  const ms = Math.min(pace.maxBeatMs, pace.baseBeatMs + weights * pace.weightMs) + windupMs;
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
 * the round would pass the pace's longest round, in which case they are squeezed in proportion, keeping
 * at least the pace's shortest beat (plus the wind-up) each where that fits. The total is the intro, the
 * staggers of every beat before the last visible one, that beat's wind-up and the tail, clamped to the
 * pace's shortest and longest round (6..22 seconds at the classic pace). The last visible
 * beat's `ms` is its wind-up plus the tail; beats after it (the round's end) are state-only and start
 * when the tail is over.
 */
export function planRound(
  events: readonly FightEvent[],
  options: PlaybackOptions = {},
  offset = 0,
): RoundPlan {
  const speed = options.speed ?? 1;
  const pace = options.pace ?? CLASSIC_PACE;
  const intro = events[0]?.t === 'round_start' ? (options.introMs ?? pace.introMs) : 0;
  const first = events[0];
  const round = first === undefined ? 0 : first.t === 'round_start' ? first.round : 0;
  const raw: { from: number; to: number; timing: BeatTiming }[] = [];
  let start = 0;
  for (const end of beatEnds(events)) {
    raw.push({ from: start, to: end, timing: beatTiming(events, start, end, pace) });
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
  const budget = Math.max(0, pace.maxRoundMs - intro - lastWindup - pace.tailMs);
  const scale = natural > budget && natural > 0 ? budget / natural : 1;
  // Squeezed beats keep their wind-up and at least 250 ms after it; only when even that does not fit
  // (a round with dozens of beats) do they go below that, so the round never runs past its cap.
  const withFloors = lead.map((b) =>
    scale === 1
      ? b.timing.ms
      : Math.max(pace.minBeatMs + b.timing.windupMs, Math.floor(b.timing.ms * scale)),
  );
  const staggers =
    withFloors.reduce((sum, ms) => sum + ms, 0) <= budget || scale === 1
      ? withFloors
      : lead.map((b) => Math.floor(b.timing.ms * scale));
  const squeezed = staggers.reduce((sum, ms) => sum + ms, 0);

  const beats: PlannedBeat[] = raw.map((b, k) => {
    let ms: number;
    if (k < lastVisible) ms = staggers[k] as number;
    else if (k === lastVisible) ms = b.timing.windupMs + pace.tailMs;
    else ms = 0;
    return {
      from: b.from + offset,
      to: b.to + offset,
      ms: halve(ms, speed),
      windupMs: halve(b.timing.windupMs, speed),
      visible: b.timing.visible,
    };
  });
  const content = lastVisible < 0 ? 0 : squeezed + lastWindup + pace.tailMs;
  const total1x = Math.min(pace.maxRoundMs, Math.max(pace.minRoundMs, intro + content));
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
 * beats and the tail, clamped to the pace's round limits. The live server starts round r+1 this long after
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

/**
 * The pace of a stored live finale by its `pacing` version (`raid_live.pacing`): 0 (fixed rounds) and
 * 1 (content pacing, before 2026-10-22) play at the classic pace; 2 and later at the slow pace.
 */
export const PACING_SLOW = 2;

export function paceOfPacing(pacing: number): Readonly<Pace> {
  return pacing >= PACING_SLOW ? SLOW_PACE : CLASSIC_PACE;
}
