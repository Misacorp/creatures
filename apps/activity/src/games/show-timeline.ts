/**
 * The Valley Games show as a timeline (docs/design/valley-games.md): the day's events one after another,
 * each as an intro card (the event's name, the entrants dropping into their spots), the event itself
 * (`ticks x tickMs`) and a podium card. Everything the show player draws comes from here, derived only
 * from the engine's beats (`GamesEventResult`).
 *
 * `prepareEvent` indexes an event's beats once (O(beats), plus small per-tick tables); `frameAt` then
 * answers "what is on screen at ms" in about O(actors) for every animation frame. Pure: no clock, no DOM.
 */
import type { GamesActorState, GamesEventResult, GamesFx } from '@creatures/engine';
import {
  GAMES_SHOW_TIMING,
  gamesContent,
  gamesEventDef,
  gamesEventInfo,
  gamesEventName,
  gamesSayTemplate,
  showTimeline,
  type GamesKind,
} from '@creatures/game';
import { sceneWidthFor } from './art/scenes';

/**
 * The show's pacing: the game package's (`GAMES_SHOW_TIMING`, `showTimeline`), which the server uses
 * for the show's end, so the client and the server always agree.
 */
export const SHOW_INTRO_MS = GAMES_SHOW_TIMING.introMs;
export const SHOW_PODIUM_MS = GAMES_SHOW_TIMING.podiumMs;
/** How long an effect stays on screen after its tick. */
export const FX_MS = 600;
/** How long a commentary line shows. */
export const SAY_MS = 2_500;
/** The longest a move between two position beats takes (ticks): the actor waits, then goes. */
export const MOVE_TICKS = 3;
/** When the entrants drop in during the intro: the first lands at `from`, the last at `to` (ms). */
export const DROP = { from: 500, to: 2_200, fallMs: 320, height: 128 } as const;

const VIEW_WIDTH = 192;
const PX_PER_METRE = 8;
/** The lake's track (the engine's swim geometry), for turning a position into lap progress. */
const LAKE = { cx: 96, cy: 62, rx: 72, ry: 34 } as const;
const FLOE_CENTRE = { x: 96, y: 62 } as const;
const FLOE_FLAT = 0.52;

// ---------------------------------------------------------------------------------------------
// The show: one span per event

export interface ShowSpan {
  index: number;
  eventId: string;
  /** The event's index in the played events; null for an event nobody entered (an intro only). */
  event: number | null;
  /** Show ms where the intro starts, the event starts, the podium starts and the span ends. */
  start: number;
  eventStart: number;
  podiumStart: number;
  end: number;
}

export interface ShowTimeline {
  spans: readonly ShowSpan[];
  /** The whole show's length in ms. */
  total: number;
}

/** An event's own length in ms (its ticks at its tick length). */
export function eventMs(e: Pick<GamesEventResult, 'ticks' | 'tickMs'>): number {
  return e.ticks * e.tickMs;
}

/**
 * The show's spans: intro, event and podium of each event in turn (`showTimeline`). `lineup` is the
 * day's event ids in show order, skipped ones included (absent: the played events' order); an event of
 * the lineup without a result was skipped and is its intro card only.
 */
export function buildShowTimeline(
  events: readonly Pick<GamesEventResult, 'eventId' | 'ticks' | 'tickMs'>[],
  lineup?: readonly string[],
): ShowTimeline {
  const order = lineup ?? events.map((e) => e.eventId);
  const used = new Set<number>();
  const picks = order.map((id) => {
    const i = events.findIndex((e, k) => e.eventId === id && !used.has(k));
    if (i >= 0) used.add(i);
    return i < 0 ? null : i;
  });
  const segments = showTimeline(
    order.map((eventId, k) => {
      const i = picks[k] ?? null;
      const e = i === null ? undefined : events[i];
      const tickMs = e?.tickMs ?? gamesEventInfo(eventId)?.tickMs ?? 1_000;
      return e === undefined
        ? { eventId, ticks: 0, tickMs, skipped: true }
        : { eventId, ticks: e.ticks, tickMs: e.tickMs };
    }),
  );
  const spans = segments.map((s, index) => ({
    index,
    eventId: s.eventId,
    event: picks[index] ?? null,
    start: s.introMs,
    eventStart: s.startMs,
    podiumStart: s.endMs,
    end: s.podiumEndMs,
  }));
  return { spans, total: segments.at(-1)?.podiumEndMs ?? 0 };
}

export type ShowPhase = 'intro' | 'event' | 'podium';

export interface ShowCursor {
  /** The event (span) on screen. */
  index: number;
  phase: ShowPhase;
  /** Ms into the phase. */
  ms: number;
  /** Ms into the show, clamped to it. */
  at: number;
  /** Before the show (ms < 0): the first intro, held at its start. */
  before: boolean;
  /** At or past the end: the last podium, held at its end. */
  done: boolean;
}

/** Where the show is at `ms` (show time). Null for a show with no events. */
export function cursorAt(timeline: ShowTimeline, ms: number): ShowCursor | null {
  const { spans, total } = timeline;
  const last = spans[spans.length - 1];
  if (last === undefined) return null;
  if (ms < 0) return { index: 0, phase: 'intro', ms: 0, at: 0, before: true, done: false };
  if (ms >= total) {
    return {
      index: last.index,
      phase: 'podium',
      ms: SHOW_PODIUM_MS,
      at: total,
      before: false,
      done: true,
    };
  }
  const span = spans.find((s) => ms < s.end) ?? last;
  const phase: ShowPhase =
    ms < span.eventStart ? 'intro' : ms < span.podiumStart ? 'event' : 'podium';
  const from =
    phase === 'intro' ? span.start : phase === 'event' ? span.eventStart : span.podiumStart;
  return { index: span.index, phase, ms: ms - from, at: ms, before: false, done: false };
}

/** The start of the event after the one at `ms`, or null on the last one. */
export function nextSpanStart(timeline: ShowTimeline, ms: number): number | null {
  const next = timeline.spans.find((s) => s.start > ms);
  return next === undefined ? null : next.start;
}

/**
 * The intro's drop: how far above its spot actor `i` of `count` is at `ms` into the intro (scene px,
 * 0 once landed), and how long ago it landed (null: still falling or not yet dropped).
 */
export function dropAt(
  i: number,
  count: number,
  ms: number,
): { lift: number; landedMs: number | null } {
  const lands = count <= 1 ? DROP.from : DROP.from + ((DROP.to - DROP.from) * i) / (count - 1);
  const starts = lands - DROP.fallMs;
  if (ms <= starts) return { lift: DROP.height, landedMs: null };
  if (ms >= lands) return { lift: 0, landedMs: ms - lands };
  const u = (ms - starts) / DROP.fallMs;
  return { lift: DROP.height * (1 - u * u), landedMs: null };
}

// ---------------------------------------------------------------------------------------------
// One event, indexed

/** Index of the last time `<= tick` for every whole tick 0..ticks (-1: none yet). */
function lastAtOrBefore(times: readonly number[], ticks: number): Int32Array {
  const out = new Int32Array(ticks + 1).fill(-1);
  let i = -1;
  for (let tick = 0; tick <= ticks; tick++) {
    while (i + 1 < times.length && (times[i + 1] as number) <= tick) i++;
    out[tick] = i;
  }
  return out;
}

/** Index of the first time `>= tick` for every whole tick 0..ticks+1 (times.length: none). */
function firstAtOrAfter(times: readonly number[], ticks: number): Int32Array {
  const out = new Int32Array(ticks + 2).fill(times.length);
  let i = 0;
  for (let tick = 0; tick <= ticks + 1; tick++) {
    while (i < times.length && (times[i] as number) < tick) i++;
    out[tick] = i;
  }
  return out;
}

/** A value that changes at ticks (state, meter, score). */
class Steps<T> {
  readonly times: number[] = [];
  readonly values: T[] = [];
  private index: Int32Array = new Int32Array(0);
  constructor(private readonly initial: T) {}
  push(t: number, v: T): void {
    this.times.push(t);
    this.values.push(v);
  }
  seal(ticks: number): void {
    this.index = lastAtOrBefore(this.times, ticks);
  }
  at(tick: number): T {
    const i = this.index[clampTick(tick, this.index.length - 1)] ?? -1;
    return i < 0 ? this.initial : (this.values[i] as T);
  }
}

function clampTick(tick: number, max: number): number {
  return Math.max(0, Math.min(max, Math.floor(tick)));
}

/** A position key: the actor is at (x, y) at tick t, having moved there from tick `from`. */
interface PosKey {
  t: number;
  from: number;
  x: number;
  y: number;
  /** Lap progress at this key (swim only; hundredths of a lap). */
  lap: number;
}

/** A moving prop's keys (the melon, a shark, the floe, the heat). */
interface PropKey {
  t: number;
  x: number;
  y: number;
  f: number;
}

class Moving {
  readonly keys: PropKey[] = [];
  private index: Int32Array = new Int32Array(0);
  push(k: PropKey): void {
    this.keys.push(k);
  }
  seal(ticks: number): void {
    this.index = lastAtOrBefore(
      this.keys.map((k) => k.t),
      ticks,
    );
  }
  /** The last key at or before the tick (no blending); null before the first key. */
  keyAt(tick: number): PropKey | null {
    const i = this.index[clampTick(tick, this.index.length - 1)] ?? -1;
    return this.keys[i] ?? null;
  }
  /** Interpolated between the key before and the next one; null before the first key. */
  at(tick: number): (PropKey & { dx: number }) | null {
    const i = this.index[clampTick(tick, this.index.length - 1)] ?? -1;
    const k = this.keys[i];
    if (k === undefined) return null;
    const n = this.keys[i + 1];
    if (n === undefined || n.t <= k.t) return { ...k, dx: 0 };
    const u = Math.max(0, Math.min(1, (tick - k.t) / (n.t - k.t)));
    return {
      t: tick,
      x: k.x + (n.x - k.x) * u,
      y: k.y + (n.y - k.y) * u,
      f: k.f + (n.f - k.f) * u,
      dx: n.x - k.x,
    };
  }
}

interface FxBeat {
  t: number;
  fx: GamesFx | 'out';
  a?: number | undefined;
  x?: number | undefined;
  y?: number | undefined;
  /** A notable beat (the crowd roars). */
  big: boolean;
}

interface SayBeat {
  t: number;
  line: string;
  a?: number | undefined;
  b?: number | undefined;
  n?: number | undefined;
}

interface PreparedActor {
  pos: PosKey[];
  posIndex: Int32Array;
  state: Steps<GamesActorState>;
  meter: Steps<number | undefined>;
  score: Steps<number>;
  outT: number | null;
  cause: string | null;
  /** Swim: the tick it finished (null: never). */
  finishT: number | null;
  /** Feast: the peppers it got, by tick and heat tier. */
  peppers: { t: number; tier: number }[];
  pepperIndex: Int32Array;
}

/** The effects that make the crowd roar. */
const BIG_FX: ReadonlySet<string> = new Set([
  'steam',
  'splash',
  'flame',
  'squash',
  'gulp',
  'zap',
  'bonk',
  'star',
  'duck',
  'burp',
  'out',
]);

export interface PreparedEvent {
  result: GamesEventResult;
  kind: GamesKind;
  ticks: number;
  tickMs: number;
  /** Laps of a swim (1 otherwise). */
  laps: number;
  /** Team events: how a team's score is made. */
  teamScore: 'best' | 'sum';
  actors: PreparedActor[];
  fx: FxBeat[];
  fxIndex: Int32Array;
  says: SayBeat[];
  sayIndex: Int32Array;
  melon: Moving | null;
  sharks: Moving[];
  floe: Moving | null;
  heat: Moving | null;
  /** Haul: each team's load (`log:<i>`, `pumpkin:<i>`) by team index, and its lane's finish mark. */
  loads: { i: number; kind: 'log' | 'pumpkin'; m: Moving }[];
  finishes: { i: number; x: number; y: number }[];
  /** Haul: the tick each actor's team crossed the line (null: never). */
  finishT: (number | null)[];
  /**
   * The at-once team events: each team's object by team index (`barrel:<i>` f = level in percent,
   * `tower:<i>` f = crates, `kite:<i>` the kite's centre, f 1 tumbling).
   */
  objects: { i: number; kind: TeamObjectKind; m: Moving }[];
  /** Each actor's team index (teams in order of first appearance). */
  teamOfActor: number[];
  /** Chase and haul: the camera's left edge at each whole tick; the world's width. */
  camera: Float64Array | null;
  worldWidth: number;
  /** Teams in order of first appearance, with their actors. */
  teams: { teamId: string; playerId: string; actors: number[] }[];
}

/** The objects of the at-once team events, one per team. */
export type TeamObjectKind = 'barrel' | 'tower' | 'kite';
const TEAM_OBJECTS: readonly TeamObjectKind[] = ['barrel', 'tower', 'kite'];

/** Lap progress (hundredths) of a point on the lake, in [0, 100): 0 at the start (the bottom). */
function lapFraction(x: number, y: number): number {
  const angle = Math.atan2((y - LAKE.cy) / LAKE.ry, (x - LAKE.cx) / LAKE.rx);
  // The engine's angle runs from the bottom (90 degrees) towards the left (180), so does this.
  const turns = (angle - Math.PI / 2) / (2 * Math.PI);
  return (((turns % 1) + 1) % 1) * 100;
}

/**
 * Indexes an event once for playback: per actor its position keys (each with the tick its move starts),
 * states, meters, scores and when it went out; the effects, the commentary and the props by tick; and,
 * for a chase, the camera at every tick (following the leader and the melon) and the world's width.
 */
export function prepareEvent(result: GamesEventResult): PreparedEvent {
  const { ticks, tickMs, kind } = result;
  const def = gamesEventDef(result.eventId);
  // A retired event (a stored day) has no def any more; its info keeps what a replay reads.
  const info = gamesEventInfo(result.eventId);
  const laps = def?.kind === 'swim' ? def.params.laps : (info?.laps ?? 1);
  const teamScore = def?.teamScore ?? info?.teamScore ?? 'best';
  const actors: PreparedActor[] = result.actors.map((a) => ({
    pos: [{ t: 0, from: 0, x: a.x, y: a.y, lap: 0 }],
    posIndex: new Int32Array(0),
    state: new Steps<GamesActorState>('idle'),
    meter: new Steps<number | undefined>(undefined),
    score: new Steps<number>(0),
    outT: result.outAt[a.a] ?? null,
    cause: null,
    finishT: null,
    peppers: [],
    pepperIndex: new Int32Array(0),
  }));
  const fx: FxBeat[] = [];
  const says: SayBeat[] = [];
  const sharks = new Map<number, Moving>();
  let melon: Moving | null = null;
  let floe: Moving | null = null;
  let heat: Moving | null = null;
  const loads = new Map<number, { i: number; kind: 'log' | 'pumpkin'; m: Moving }>();
  const finishes: { i: number; x: number; y: number }[] = [];
  const objects = new Map<number, { i: number; kind: TeamObjectKind; m: Moving }>();
  let maxX = 0;

  for (const b of result.beats) {
    switch (b.k) {
      case 'pos': {
        const actor = actors[b.a];
        if (actor === undefined) break;
        const prev = actor.pos[actor.pos.length - 1] as PosKey;
        let from = Math.max(prev.t, b.t - MOVE_TICKS);
        // A creature that went out since its last key waits for the out before it moves.
        if (actor.outT !== null && prev.t < actor.outT && actor.outT < b.t) {
          from = Math.max(from, actor.outT);
        }
        let lap = prev.lap;
        if (kind === 'swim' && (actor.outT === null || b.t <= actor.outT)) {
          const was = lapFraction(prev.x, prev.y);
          const now = lapFraction(b.x, b.y);
          lap = prev.lap + ((now - was + 100) % 100);
        }
        actor.pos.push({ t: b.t, from, x: b.x, y: b.y, lap });
        maxX = Math.max(maxX, b.x);
        break;
      }
      case 'state':
        actors[b.a]?.state.push(b.t, b.s);
        break;
      case 'meter':
        actors[b.a]?.meter.push(b.t, b.v);
        break;
      case 'score': {
        const actor = actors[b.a];
        if (actor === undefined) break;
        actor.score.push(b.t, b.v);
        if (kind === 'swim' && b.v >= laps && actor.finishT === null) {
          actor.finishT = b.t;
        }
        break;
      }
      case 'out': {
        const actor = actors[b.a];
        if (actor !== undefined) {
          actor.outT = b.t;
          actor.cause = b.cause;
        }
        fx.push({ t: b.t, fx: 'out', a: b.a, big: true });
        break;
      }
      case 'fx':
        fx.push({ t: b.t, fx: b.fx, a: b.a, x: b.x, y: b.y, big: BIG_FX.has(b.fx) });
        break;
      case 'say':
        says.push({ t: b.t, line: b.line, a: b.a, b: b.b, n: b.n });
        break;
      case 'prop': {
        const key = { t: b.t, x: b.x, y: b.y, f: b.f ?? 0 };
        if (b.p === 'melon') {
          melon ??= new Moving();
          melon.push(key);
          maxX = Math.max(maxX, b.x);
        } else if (b.p === 'floe') {
          floe ??= new Moving();
          floe.push(key);
        } else if (b.p === 'heat') {
          heat ??= new Moving();
          heat.push(key);
        } else if (b.p.startsWith('shark:')) {
          const i = Number(b.p.slice(6));
          if (!Number.isInteger(i)) break;
          let s = sharks.get(i);
          if (s === undefined) {
            s = new Moving();
            sharks.set(i, s);
          }
          s.push(key);
        } else if (b.p.startsWith('finish:')) {
          const i = Number(b.p.slice(7));
          if (Number.isInteger(i) && i >= 0) finishes.push({ i, x: b.x, y: b.y });
          maxX = Math.max(maxX, b.x);
        } else if (b.p.startsWith('log:') || b.p.startsWith('pumpkin:')) {
          const [name, index] = b.p.split(':');
          const i = Number(index);
          if (!Number.isInteger(i) || i < 0) break;
          let load = loads.get(i);
          if (load === undefined) {
            load = { i, kind: name === 'log' ? 'log' : 'pumpkin', m: new Moving() };
            loads.set(i, load);
          }
          load.m.push(key);
          maxX = Math.max(maxX, b.x);
        } else if (TEAM_OBJECTS.some((o) => b.p.startsWith(`${o}:`))) {
          const [name, index] = b.p.split(':');
          const i = Number(index);
          const kind = TEAM_OBJECTS.find((o) => o === name);
          if (!Number.isInteger(i) || i < 0 || kind === undefined) break;
          let obj = objects.get(i);
          if (obj === undefined) {
            obj = { i, kind, m: new Moving() };
            objects.set(i, obj);
          }
          obj.m.push(key);
        } else if (b.p.startsWith('pepper:')) {
          actors[Number(b.p.slice(7))]?.peppers.push({ t: b.t, tier: b.f ?? 0 });
        }
        break;
      }
    }
  }

  for (const actor of actors) {
    actor.posIndex = lastAtOrBefore(
      actor.pos.map((p) => p.t),
      ticks,
    );
    actor.state.seal(ticks);
    actor.meter.seal(ticks);
    actor.score.seal(ticks);
    actor.pepperIndex = lastAtOrBefore(
      actor.peppers.map((p) => p.t),
      ticks,
    );
  }
  for (const m of [
    melon,
    floe,
    heat,
    ...sharks.values(),
    ...[...loads.values()].map((l) => l.m),
    ...[...objects.values()].map((o) => o.m),
  ])
    m?.seal(ticks);

  const teamMap = new Map<string, { teamId: string; playerId: string; actors: number[] }>();
  for (const a of result.actors) {
    let team = teamMap.get(a.teamId);
    if (team === undefined) {
      team = { teamId: a.teamId, playerId: a.playerId, actors: [] };
      teamMap.set(a.teamId, team);
    }
    team.actors.push(a.a);
  }
  const teamList = [...teamMap.values()];
  const teamOfActor = new Array<number>(result.actors.length).fill(0);
  teamList.forEach((team, i) => {
    for (const a of team.actors) teamOfActor[a] = i;
  });

  const prepared: PreparedEvent = {
    result,
    kind,
    ticks,
    tickMs,
    laps,
    teamScore,
    actors,
    fx,
    fxIndex: firstAtOrAfter(
      fx.map((f) => f.t),
      ticks,
    ),
    says,
    sayIndex: lastAtOrBefore(
      says.map((s) => s.t),
      ticks,
    ),
    melon,
    sharks: [...sharks.entries()].sort((p, q) => p[0] - q[0]).map(([, m]) => m),
    floe,
    heat,
    loads: [...loads.values()].sort((p, q) => p.i - q.i),
    finishes: finishes.sort((p, q) => p.i - q.i),
    finishT: new Array<number | null>(result.actors.length).fill(null),
    objects: [...objects.values()].sort((p, q) => p.i - q.i),
    teamOfActor,
    camera: null,
    worldWidth: VIEW_WIDTH,
    teams: teamList,
  };
  if (kind === 'chase') {
    prepared.worldWidth = sceneWidthFor(maxX + 48);
    prepared.camera = chaseCamera(prepared);
  }
  if (kind === 'haul') {
    prepared.worldWidth = sceneWidthFor(maxX + 48);
    prepared.finishT = haulFinishes(prepared);
    prepared.camera = haulCamera(prepared);
  }
  return prepared;
}

/**
 * Haul: the tick each actor's team crossed the line, from its load's keys (the engine stops a load
 * on the line). Teams are in order of first appearance, as the engine's `log:<i>` indices.
 */
function haulFinishes(p: PreparedEvent): (number | null)[] {
  const out = new Array<number | null>(p.result.actors.length).fill(null);
  p.teams.forEach((team, i) => {
    const finish = p.finishes.find((f) => f.i === i)?.x;
    const load = p.loads.find((l) => l.i === i);
    if (finish === undefined) return;
    const key = load?.m.keys.find((k) => k.x >= finish);
    if (key === undefined) return;
    for (const a of team.actors) out[a] = key.t;
  });
  return out;
}

/**
 * The haul camera at every whole tick: the middle of the whole field (its lanes start staggered), the
 * leading load always in view with room for it.
 */
function haulCamera(p: PreparedEvent): Float64Array {
  const cam = new Float64Array(p.ticks + 1);
  const maxCam = p.worldWidth - VIEW_WIDTH;
  let smooth = 0;
  for (let t = 0; t <= p.ticks; t++) {
    const xs = p.loads.map((l) => l.m.at(t)?.x).filter((x): x is number => x !== undefined);
    const lead = xs.length === 0 ? 0 : Math.max(...xs);
    const last = xs.length === 0 ? 0 : Math.min(...xs);
    // From the rearmost pusher behind the last load to the front of the leading one.
    let target = (last - 30 + lead + 16) / 2 - VIEW_WIDTH / 2;
    target = Math.max(lead + 20 - VIEW_WIDTH, target);
    target = Math.max(0, Math.min(maxCam, target));
    smooth = t === 0 ? target : smooth + (target - smooth) * 0.35;
    cam[t] = smooth;
  }
  return cam;
}

/** The chase camera at every whole tick: between the melon and the leader, the leader always in view. */
function chaseCamera(p: PreparedEvent): Float64Array {
  const cam = new Float64Array(p.ticks + 1);
  const maxCam = p.worldWidth - VIEW_WIDTH;
  let smooth = 0;
  for (let t = 0; t <= p.ticks; t++) {
    let lead = Number.NEGATIVE_INFINITY;
    let any = Number.NEGATIVE_INFINITY;
    p.actors.forEach((actor, a) => {
      const { x } = actorPos(p, a, t);
      any = Math.max(any, x);
      if (actor.outT === null || actor.outT > t) lead = Math.max(lead, x);
    });
    if (lead === Number.NEGATIVE_INFINITY) lead = any;
    const melon = p.melon?.at(t)?.x ?? lead;
    let target = (lead + melon) / 2 - VIEW_WIDTH / 2;
    // The leader stays on screen, with room for its sprite.
    target = Math.max(lead + 20 - VIEW_WIDTH, Math.min(lead - 20, target));
    target = Math.max(0, Math.min(maxCam, target));
    smooth = t === 0 ? target : smooth + (target - smooth) * 0.35;
    cam[t] = smooth;
  }
  return cam;
}

/** Where actor `a` is at a (fractional) tick, and its lap progress (swim). */
function actorPos(
  p: PreparedEvent,
  a: number,
  tick: number,
): { x: number; y: number; lap: number } {
  const actor = p.actors[a];
  if (actor === undefined) return { x: 0, y: 0, lap: 0 };
  const i = actor.posIndex[clampTick(tick, p.ticks)] ?? 0;
  const k = actor.pos[Math.max(0, i)] as PosKey;
  const n = actor.pos[i + 1];
  if (n === undefined || tick <= n.from || n.t <= n.from) return { x: k.x, y: k.y, lap: k.lap };
  const u = Math.min(1, (tick - n.from) / (n.t - n.from));
  return {
    x: k.x + (n.x - k.x) * u,
    y: k.y + (n.y - k.y) * u,
    lap: k.lap + (n.lap - k.lap) * u,
  };
}

// ---------------------------------------------------------------------------------------------
// A frame

export interface ActorFrame {
  a: number;
  x: number;
  y: number;
  state: GamesActorState;
  /** 0 to 100, or undefined when the kind shows no meter. */
  meter: number | undefined;
  score: number;
  out: boolean;
  /** Ms since it went out (null: still in). */
  outMs: number | null;
  cause: string | null;
  /** Lifted off the ground (scene px): a tossed swimmer's arc. */
  lift: number;
}

export interface FxFrame {
  /** Stable while the effect lives (for keys). */
  id: number;
  fx: GamesFx | 'out';
  a?: number | undefined;
  x: number;
  y: number;
  /** Ms since its tick. */
  age: number;
  big: boolean;
}

export interface SayFrame {
  id: number;
  line: string;
  a?: number | undefined;
  b?: number | undefined;
  n?: number | undefined;
  age: number;
}

export interface PepperFrame {
  a: number;
  tier: number;
}

export interface PropsFrame {
  /** The melon's centre and its diameter; `roll` grows with the distance it rolled. */
  melon: { x: number; y: number; size: number; roll: number } | null;
  sharks: { i: number; x: number; y: number; flip: boolean }[];
  /** The floe's x-radius (scene px). */
  floe: number | null;
  /** The heat, 0 to 100. */
  heat: number | null;
  /** The pepper on each eater's plate. */
  peppers: PepperFrame[];
  /** Haul: each team's load (its centre, the lane's feet y and its frame: up, wobbling or down). */
  loads: { i: number; kind: 'log' | 'pumpkin'; x: number; y: number; f: number; roll: number }[];
  /**
   * The at-once team events: each team's object now (`x`, `y` and `f` of its last key, a kite's
   * position blended), the `f` before its last change (`was`) and the ticks since that change.
   */
  objects: TeamObjectFrame[];
}

export interface TeamObjectFrame {
  i: number;
  kind: TeamObjectKind;
  x: number;
  y: number;
  f: number;
  was: number;
  since: number;
}

export interface EventFrame {
  /** Fractional tick. */
  tick: number;
  ms: number;
  actors: ActorFrame[];
  fx: FxFrame[];
  say: SayFrame | null;
  props: PropsFrame;
  cameraX: number;
}

/** Everything on screen `ms` into an event (clamped to the event). */
export function frameAt(p: PreparedEvent, msIn: number): EventFrame {
  const ms = Math.max(0, Math.min(msIn, eventMs(p.result)));
  const tick = ms / p.tickMs;
  const whole = clampTick(tick, p.ticks);
  const actors = p.actors.map((actor, a): ActorFrame => {
    const pos = actorPos(p, a, tick);
    const out = actor.outT !== null && actor.outT <= tick;
    let lift = 0;
    // A swimmer the sharks got is tossed onto the shore in an arc.
    if (p.kind === 'swim' && out && actor.outT !== null) {
      const u = (tick - actor.outT) / 2;
      if (u > 0 && u < 1) lift = 28 * Math.sin(Math.PI * u);
    }
    return {
      a,
      x: pos.x,
      y: pos.y,
      state: actor.state.at(tick),
      meter: actor.meter.at(tick),
      score: actor.score.at(tick),
      out,
      outMs: out && actor.outT !== null ? ms - actor.outT * p.tickMs : null,
      cause: actor.cause,
      lift,
    };
  });

  const fx: FxFrame[] = [];
  const lo = Math.max(0, Math.ceil((ms - FX_MS) / p.tickMs));
  for (let i = p.fxIndex[Math.min(lo, p.ticks + 1)] ?? p.fx.length; i < p.fx.length; i++) {
    const f = p.fx[i] as FxBeat;
    if (f.t > whole) break;
    const age = ms - f.t * p.tickMs;
    if (age < 0 || age >= FX_MS) continue;
    const at = f.a === undefined ? undefined : actors[f.a];
    fx.push({
      id: i,
      fx: f.fx,
      a: f.a,
      x: f.x ?? at?.x ?? 0,
      y: f.y ?? at?.y ?? 0,
      age,
      big: f.big,
    });
  }

  let say: SayFrame | null = null;
  const si = p.sayIndex[whole] ?? -1;
  const s = p.says[si];
  if (s !== undefined && ms - s.t * p.tickMs < SAY_MS) {
    say = { id: si, line: s.line, a: s.a, b: s.b, n: s.n, age: ms - s.t * p.tickMs };
  }

  const m = p.melon?.at(tick) ?? null;
  const peppers: PepperFrame[] = [];
  if (p.kind === 'feast') {
    p.actors.forEach((actor, a) => {
      if (actor.outT !== null && actor.outT <= tick) return;
      // The next pepper sits on the plate from a moment after the last one was eaten until it is.
      const i = actor.pepperIndex[whole] ?? -1;
      const last = actor.peppers[i];
      const eating = last !== undefined && tick - last.t < 0.4 ? last : undefined;
      const next = eating ?? actor.peppers[i + 1];
      if (next === undefined) return;
      const since = last === undefined || eating !== undefined ? 1 : tick - last.t;
      if (since >= 0.75) peppers.push({ a, tier: next.tier });
    });
  }
  const props: PropsFrame = {
    melon: m === null ? null : { x: m.x, y: m.y, size: m.f, roll: m.x },
    sharks: p.sharks.flatMap((shark, i) => {
      const at = shark.at(tick);
      return at === null ? [] : [{ i, x: at.x, y: at.y, flip: at.dx < 0 }];
    }),
    floe: p.floe?.at(tick)?.f ?? null,
    heat: p.heat?.at(tick)?.f ?? null,
    peppers,
    loads: p.loads.flatMap((l) => {
      const at = l.m.at(tick);
      // The frame is the key's own (never a blend of two).
      const f = l.m.keyAt(tick)?.f ?? 0;
      return at === null ? [] : [{ i: l.i, kind: l.kind, x: at.x, y: at.y, f, roll: at.x }];
    }),
    objects: p.objects.flatMap((o) => objectAt(o, tick)),
  };

  let cameraX = 0;
  if (p.camera !== null) {
    const c0 = p.camera[whole] ?? 0;
    const c1 = p.camera[Math.min(p.ticks, whole + 1)] ?? c0;
    cameraX = c0 + (c1 - c0) * (tick - whole);
  }
  return { tick, ms, actors, fx, say, props, cameraX };
}

/** A team object at a tick: a kite glides between its keys, a barrel or a tower steps. */
function objectAt(
  o: { i: number; kind: TeamObjectKind; m: Moving },
  tick: number,
): TeamObjectFrame[] {
  const key = o.m.keyAt(tick);
  if (key === null) return [];
  const index = o.m.keys.indexOf(key);
  let wasIndex = index - 1;
  while (wasIndex >= 0 && o.m.keys[wasIndex]?.f === key.f) wasIndex--;
  const was = o.m.keys[wasIndex]?.f ?? key.f;
  // When f last changed: the first key of the run of keys with this f.
  let from = index;
  while (from > 0 && o.m.keys[from - 1]?.f === key.f) from--;
  const since = tick - (o.m.keys[from]?.t ?? key.t);
  const at = o.kind === 'kite' ? (o.m.at(tick) ?? key) : key;
  return [{ i: o.i, kind: o.kind, x: at.x, y: at.y, f: key.f, was, since }];
}

// ---------------------------------------------------------------------------------------------
// The leaderboard

export interface BoardRow {
  teamId: string;
  playerId: string;
  /** The member shown (the team's best). */
  actor: number;
  /** 1 is best; ties share a place on the final board. */
  place: number;
  /** What the row shows: "12s", "18m", "7", "1.4" (empty: nothing, or the bar). */
  text: string;
  /** A sitter still in the sauna: its heat meter (0 to 100) instead of a number. */
  bar?: number | undefined;
  /** Every member is out. */
  out: boolean;
}

/** A kind's score as the board shows it (`score` as the engine keeps it). */
export function scoreText(kind: GamesKind, score: number, tickMs: number): string {
  switch (kind) {
    case 'endure':
    case 'shove':
      return `${String(Math.round((score * tickMs) / 1000))}s`;
    case 'chase':
    case 'haul':
    case 'kite':
      return `${String(score)}m`;
    case 'fill':
      return `${String(score)}%`;
    case 'feast':
    case 'stack':
      return String(score);
    case 'swim':
      return (score / 100).toFixed(1);
  }
}

/** One actor's live ranking key (higher is better) and the score it shows now. */
function liveKey(p: PreparedEvent, f: EventFrame, a: number): { key: number; score: number } {
  const actor = p.actors[a] as PreparedActor;
  const af = f.actors[a] as ActorFrame;
  const start = p.result.actors[a];
  const ticksIn = af.out && actor.outT !== null ? actor.outT - 1 : Math.floor(f.tick);
  switch (p.kind) {
    case 'endure':
      return { key: ticksIn * 1000 + (af.out ? 0 : 100 - (af.meter ?? 0)), score: ticksIn };
    case 'shove': {
      let close = 0;
      if (!af.out && f.props.floe !== null && f.props.floe > 0) {
        const dx = (af.x - FLOE_CENTRE.x) / f.props.floe;
        const dy = (af.y - FLOE_CENTRE.y) / (f.props.floe * FLOE_FLAT);
        close = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy));
      }
      return { key: ticksIn * 1000 + close * 999, score: ticksIn };
    }
    case 'chase': {
      const run = af.x - (start?.x ?? 0);
      return { key: run, score: Math.max(0, Math.floor(run / PX_PER_METRE)) };
    }
    case 'feast':
      return { key: af.score * 1000 + (af.out ? (actor.outT ?? 0) : 999), score: af.score };
    case 'swim': {
      const lap = actorPos(p, a, f.tick).lap;
      const done = actor.finishT !== null && actor.finishT <= f.tick;
      const score = done ? p.laps * 100 : Math.min(p.laps * 100 - 1, Math.floor(lap));
      if (done) return { key: 2e6 - (actor.finishT ?? 0), score };
      if (af.out) return { key: actor.outT ?? 0, score };
      return { key: 1e6 + lap, score };
    }
    case 'haul': {
      const run = af.x - (start?.x ?? 0);
      const score = Math.max(0, Math.floor(run / PX_PER_METRE));
      const done = p.finishT[a] ?? null;
      if (done !== null && done <= f.tick) return { key: 2e6 - done, score };
      return { key: run, score };
    }
    case 'fill':
      return { key: af.score, score: af.score };
    case 'stack': {
      // At the same height, the tower that got there first.
      const tower = f.props.objects.find((o) => o.i === p.teamOfActor[a]);
      return {
        key: af.score * 1e4 - (tower === undefined ? 0 : f.tick - tower.since),
        score: af.score,
      };
    }
    case 'kite': {
      // The kite's height (its y counts down from the rest position).
      const kite = f.props.objects.find((o) => o.i === p.teamOfActor[a]);
      return { key: kite === undefined ? af.score : -kite.y, score: af.score };
    }
  }
}

/** The board as the event runs, best first (places by order: the race is not over). */
export function liveBoard(p: PreparedEvent, f: EventFrame): BoardRow[] {
  const rows = p.teams.map((team) => {
    let best = team.actors[0] ?? 0;
    let bestKey = Number.NEGATIVE_INFINITY;
    let sum = 0;
    let shown = 0;
    for (const a of team.actors) {
      const k = liveKey(p, f, a);
      sum += k.score;
      if (k.key > bestKey) {
        bestKey = k.key;
        best = a;
        shown = k.score;
      }
    }
    const useSum = p.result.team === 3 && p.teamScore === 'sum';
    return {
      teamId: team.teamId,
      playerId: team.playerId,
      actor: best,
      key: useSum ? sum : bestKey,
      score: useSum ? sum : shown,
      out: team.actors.every((a) => f.actors[a]?.out === true),
    };
  });
  rows.sort((x, y) => y.key - x.key || x.actor - y.actor);
  return rows.map((r, i): BoardRow => {
    const row: BoardRow = {
      teamId: r.teamId,
      playerId: r.playerId,
      actor: r.actor,
      place: i + 1,
      text: scoreText(p.kind, r.score, p.tickMs),
      out: r.out,
    };
    // Everyone still in has lasted as long: the sauna shows the heat taken, the floe nothing.
    if (!r.out && p.kind === 'endure') {
      row.text = '';
      row.bar = f.actors[r.actor]?.meter ?? 0;
    } else if (!r.out && p.kind === 'shove') {
      row.text = '';
    }
    return row;
  });
}

/** Creatures still in, of all (kinds where creatures go out; null for a race to the finish). */
export function stillIn(p: PreparedEvent, f: EventFrame): { in: number; of: number } | null {
  if (p.kind !== 'endure' && p.kind !== 'chase' && p.kind !== 'feast' && p.kind !== 'shove')
    return null;
  return { in: f.actors.filter((a) => !a.out).length, of: f.actors.length };
}

/** The final board from the engine's standings (the podium and after). */
export function finalBoard(p: PreparedEvent): BoardRow[] {
  return p.result.standings.map((s) => {
    const best =
      s.actors.reduce<number | undefined>(
        (b, a) =>
          b === undefined || (p.result.scores[a] ?? 0) > (p.result.scores[b] ?? 0) ? a : b,
        undefined,
      ) ?? 0;
    return {
      teamId: s.teamId,
      playerId: p.result.actors[best]?.playerId ?? s.teamId,
      actor: best,
      place: s.place,
      text: scoreText(p.kind, s.score, p.tickMs),
      out: s.actors.every((a) => p.result.outAt[a] !== null),
    };
  });
}

/** How many rows the show's board lists before the viewer's own (Misa, 2026-10-23: a short list). */
export const BOARD_TOP = 5;

/** One row of the listed board, and whether rows were left out just above it. */
export interface ShownRow {
  row: BoardRow;
  /** Rows between this one and the one listed before it were left out (a "…" gap). */
  gap: boolean;
}

/**
 * The board as the show lists it: the first `top` rows, then the viewer's rows further down, in place
 * order, each marked when rows were left out above it.
 */
export function boardShown(
  rows: readonly BoardRow[],
  youId: string | undefined,
  top = BOARD_TOP,
): ShownRow[] {
  const out: ShownRow[] = [];
  let last = -1;
  rows.forEach((row, i) => {
    if (i >= top && (youId === undefined || row.playerId !== youId)) return;
    out.push({ row, gap: i > last + 1 });
    last = i;
  });
  return out;
}

/** The podium: the first three standings (places 1 to 3; a tie shares a step) and how many more tied. */
export function podiumOf(p: PreparedEvent): { rows: BoardRow[]; more: number } {
  const medalled = finalBoard(p).filter((r) => r.place <= 3);
  return { rows: medalled.slice(0, 3), more: Math.max(0, medalled.length - 3) };
}

// ---------------------------------------------------------------------------------------------
// Team colours

/** A stable small hash of a string (FNV-1a), for picking a player's colour. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------------------------
// What a screen reader hears

export interface Announcement {
  /** Show ms. */
  at: number;
  text: string;
}

const MEDAL_WORDS = ['Gold', 'Silver', 'Bronze'] as const;

/**
 * The show's spoken moments, in order: each event's start, each of your creatures going out, and each
 * podium. `names` gives player names by id; every creature is said with its owner, as in the
 * commentary ("Pip (you) is out.", "Gold: Toasty (Aino)").
 */
export function announcements(
  prepared: readonly PreparedEvent[],
  timeline: ShowTimeline,
  youId: string | undefined,
  names: Readonly<Record<string, string>> = {},
): Announcement[] {
  const out: Announcement[] = [];
  const count = timeline.spans.length;
  for (const span of timeline.spans) {
    const title = gamesEventName(span.eventId);
    const head = `Event ${String(span.index + 1)} / ${String(count)}: ${title}`;
    const p = span.event === null ? undefined : prepared[span.event];
    if (p === undefined) {
      out.push({ at: span.start, text: `${head}. Nobody entered.` });
      continue;
    }
    out.push({ at: span.start, text: `${head}.` });
    if (youId !== undefined) {
      p.result.actors.forEach((actor, a) => {
        const t = p.actors[a]?.outT ?? null;
        if (actor.playerId !== youId || t === null) return;
        out.push({ at: span.eventStart + t * p.tickMs, text: `${actor.name} (you) is out.` });
      });
    }
    const podium = podiumOf(p).rows.map((r) => {
      const name = p.result.actors[r.actor]?.name ?? '';
      const who = ownerOf(p, r.actor, { youId, names });
      return `${MEDAL_WORDS[r.place - 1] ?? ''}: ${name}${who === null ? '' : ` (${who})`}`;
    });
    if (podium.length > 0) out.push({ at: span.podiumStart, text: `${podium.join(', ')}.` });
  }
  return out.sort((x, y) => x.at - y.at);
}

/** The latest announcement at show ms `at` (null before the first). */
export function announcementAt(list: readonly Announcement[], at: number): Announcement | null {
  let found: Announcement | null = null;
  for (const a of list) {
    if (a.at > at) break;
    found = a;
  }
  return found;
}

// ---------------------------------------------------------------------------------------------
// Commentary

export type SayPart =
  | { k: 'text'; text: string }
  /** An actor's name (the view colours it by team). */
  | { k: 'name'; a: number; text: string }
  /** Whose an actor is, after its name: " (Misa)", " (you)" (the view dims it). */
  | { k: 'owner'; a: number; text: string }
  | { k: 'num'; text: string };

/** Whose the creatures are: the viewer and every player's name (bots under their bot names). */
export interface SayOwners {
  youId: string | undefined;
  names: Readonly<Record<string, string>>;
  /** Owners shortened (`shortOwner`), for a line that would not fit on one line. */
  short?: boolean | undefined;
}

/** A shortened owner's longest length, in code points ("…" included). */
export const OWNER_SHORT_MAX = 10;

/**
 * An owner's name shortened: a name of up to `OWNER_SHORT_MAX` code points stays whole (a bot keeps
 * "Bot 12"); a longer one becomes its first word, cut to that length with "…".
 */
export function shortOwner(name: string): string {
  const whole = name.trim();
  if ([...whole].length <= OWNER_SHORT_MAX) return whole;
  const word = whole.split(/\s+/u)[0] ?? '';
  const points = [...word];
  return points.length <= OWNER_SHORT_MAX
    ? word
    : `${points.slice(0, OWNER_SHORT_MAX - 1).join('')}…`;
}

/** Whose an actor is, as said after its name: "you" for the viewer, else the player's name (or null). */
export function ownerOf(p: PreparedEvent, a: number, owners: SayOwners): string | null {
  const actor = p.result.actors[a];
  if (actor === undefined) return null;
  if (owners.youId !== undefined && actor.playerId === owners.youId) return 'you';
  const name = owners.names[actor.playerId]?.trim() ?? '';
  if (name === '') return null;
  return owners.short === true ? shortOwner(name) : name;
}

const PLACEHOLDER = /\{([abn])\}/g;
/** A possessive right after a name ("{b}'s paws"): the owner goes after it ("Toasty's (Aino) paws"). */
const POSSESSIVE = /^['’]s\b/u;

/**
 * A commentary line as parts: plain text, actor names and the number, from the event's template (its
 * own words, else the kind's). Names are the actors' names as plain text; an unknown key gives nothing.
 * Given `owners`, every name is followed by its owner in parentheses ("Pepperwick (Misa)", "(you)").
 */
export function sayParts(
  p: PreparedEvent,
  say: Pick<SayFrame, 'line' | 'a' | 'b' | 'n'>,
  owners?: SayOwners,
): SayPart[] {
  const def = gamesEventDef(p.result.eventId);
  const template =
    def === undefined ? gamesContent.say[say.line] : gamesSayTemplate(gamesContent, def, say.line);
  if (template === undefined) return [];
  const parts: SayPart[] = [];
  let last = 0;
  /** An owner still to be said, after the possessive that follows its name. */
  let pending: SayPart | null = null;
  const text = (t: string): void => {
    let rest = t;
    if (pending !== null) {
      const cut = POSSESSIVE.exec(t)?.[0].length ?? 0;
      if (cut > 0) parts.push({ k: 'text', text: t.slice(0, cut) });
      parts.push(pending);
      pending = null;
      rest = t.slice(cut);
    }
    if (rest !== '') parts.push({ k: 'text', text: rest });
  };
  const flush = (): void => {
    if (pending !== null) parts.push(pending);
    pending = null;
  };
  for (const m of template.matchAll(PLACEHOLDER)) {
    const at = m.index;
    if (at > last) text(template.slice(last, at));
    else flush();
    const which = m[1];
    const a = which === 'a' ? say.a : which === 'b' ? say.b : undefined;
    if (which === 'n') {
      parts.push(
        say.n === undefined ? { k: 'text', text: m[0] } : { k: 'num', text: String(say.n) },
      );
    } else if (a !== undefined && p.result.actors[a] !== undefined) {
      parts.push({ k: 'name', a, text: p.result.actors[a].name });
      const owner = owners === undefined ? null : ownerOf(p, a, owners);
      if (owner !== null) pending = { k: 'owner', a, text: ` (${owner})` };
    } else {
      parts.push({ k: 'text', text: m[0] });
    }
    last = at + m[0].length;
  }
  if (last < template.length) text(template.slice(last));
  else flush();
  return parts;
}

/** A line's parts as plain text (the screen reader's words and the tests'). */
export function sayText(parts: readonly SayPart[]): string {
  return parts.map((part) => part.text).join('');
}
