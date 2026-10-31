/**
 * The return walk's clock, as pure functions (prototype, dev only): how long each beat of a plan lasts and
 * what is on screen at any millisecond. About ten seconds in all (V-RET-6); a longer absence groups more
 * and never runs longer, because the lines are capped at three and the places at four.
 */
import { placeOf, type PlaceId } from '../valley/valley-art';
import type { WalkLine, WalkPlan } from './walk-plan';

export const MS = {
  /** The opening beat: a welcome line is read, else the walk just sets off. */
  introWelcome: 1400,
  intro: 500,
  /** Walking to the next place. */
  travel: 650,
  /** A bubble stays up this long. */
  line: 1500,
  /** A stop with no line: the walker passes by and drops its sack. */
  pass: 500,
  /** The badges tumbling into the purse. */
  tumble: 1200,
} as const;

/** The steps of the tumble (a step each ~240 ms, in whole pixel jumps). */
export const TUMBLE_STEPS = 5;

/** Where the walker starts: at the Paddock gate, the heart of the valley. */
export const START_PLACE: PlaceId = 'paddock';

export interface Frame {
  /** The walk is over: the valley, as it stays. */
  done: boolean;
  /** The welcome line is up. */
  welcome: boolean;
  /** The stop the walker is at or walking to (-1 before the first beat). */
  stop: number;
  /** The place it came from, and 0 to 1 how far it has walked to `stop` (1 when standing there). */
  from: PlaceId;
  progress: number;
  /** The line told now, if any. */
  line: WalkLine | null;
  /** The decision's bubble is up (the walk is at its last stop and the lines are told). */
  decision: boolean;
  /** The place the camera looks at. */
  camera: PlaceId;
  /** The badges' tumble step, 0 to `TUMBLE_STEPS` - 1, or -1 when they are not tumbling. */
  tumble: number;
}

/** How long a stop lasts standing still. */
export function dwellOf(plan: WalkPlan, stop: number): number {
  const lines = plan.stops[stop]?.lines.length ?? 0;
  return lines === 0 ? MS.pass : lines * MS.line;
}

/** The whole walk, in ms. */
export function totalMs(plan: WalkPlan): number {
  const intro = plan.welcome === null ? MS.intro : MS.introWelcome;
  const stops = plan.stops.reduce((sum, _, i) => sum + MS.travel + dwellOf(plan, i), 0);
  return intro + stops + MS.tumble;
}

/** What is on screen `ms` into the walk. */
export function frameAt(plan: WalkPlan, ms: number): Frame {
  const intro = plan.welcome === null ? MS.intro : MS.introWelcome;
  if (ms < intro) {
    return {
      done: false,
      welcome: plan.welcome !== null,
      stop: -1,
      from: START_PLACE,
      progress: 1,
      line: null,
      decision: false,
      camera: START_PLACE,
      tumble: -1,
    };
  }
  let at: number = intro;
  let from = START_PLACE;
  for (const [i, stop] of plan.stops.entries()) {
    const walkEnd = at + MS.travel;
    if (ms < walkEnd) {
      return {
        done: false,
        welcome: false,
        stop: i,
        from,
        progress: (ms - at) / MS.travel,
        line: null,
        decision: false,
        // The camera leads the walker: it sets off for the next place as the walker does.
        camera: stop.place,
        tumble: -1,
      };
    }
    const dwellEnd = walkEnd + dwellOf(plan, i);
    if (ms < dwellEnd) {
      const index = stop.lines.length === 0 ? -1 : Math.floor((ms - walkEnd) / MS.line);
      const last = i === plan.stops.length - 1;
      return {
        done: false,
        welcome: false,
        stop: i,
        from,
        progress: 1,
        line: stop.lines[Math.min(index, stop.lines.length - 1)] ?? null,
        decision: last && plan.decision?.place === stop.place,
        camera: stop.place,
        tumble: -1,
      };
    }
    at = dwellEnd;
    from = stop.place;
  }
  const lastStop = plan.stops.length - 1;
  const lastPlace = plan.stops[lastStop]?.place ?? START_PLACE;
  const into = ms - at;
  if (into < MS.tumble) {
    return {
      done: false,
      welcome: false,
      stop: lastStop,
      from: lastPlace,
      progress: 1,
      line: null,
      decision: plan.decision?.place === lastPlace,
      camera: lastPlace,
      tumble: Math.min(TUMBLE_STEPS - 1, Math.floor((into / MS.tumble) * TUMBLE_STEPS)),
    };
  }
  return {
    done: true,
    welcome: false,
    stop: lastStop,
    from: lastPlace,
    progress: 1,
    line: null,
    decision: plan.decision?.place === lastPlace,
    camera: lastPlace,
    tumble: -1,
  };
}

/** `&t=<ms>` in the address: the moment a screenshot holds at; null when absent. */
export function frozenAt(hash: string): number | null {
  const found = /[?&]t=(\d{1,6})(?:&|$)/.exec(hash);
  return found?.[1] === undefined ? null : Number.parseInt(found[1], 10);
}

/** The walker's place in valley pixels: between two doors, a whole pixel at a time. */
export function walkerAt(
  from: PlaceId,
  to: PlaceId,
  progress: number,
): { x: number; y: number; flip: boolean } {
  const a = placeOf(from).door;
  const b = placeOf(to).door;
  const t = Math.min(1, Math.max(0, progress));
  return {
    x: Math.round(a.x + (b.x - a.x) * t),
    y: Math.round(a.y + (b.y - a.y) * t),
    flip: b.x < a.x,
  };
}

/** The place the walker stands at in a frame (the stop it is going to once it has walked there). */
export function placeOfFrame(plan: WalkPlan, frame: Frame): PlaceId {
  return plan.stops[frame.stop]?.place ?? START_PLACE;
}
