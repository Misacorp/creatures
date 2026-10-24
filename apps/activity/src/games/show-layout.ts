/**
 * How the show's crowded big fields are laid out on the scene (Valley Games polish): the engine places
 * entrants for a small field and stays as it is (stored shows keep their beats), so a field this big
 * is spread at display time, only here and only in pixels. Creatures are drawn a step smaller, the
 * Melon Run's runners are zig-zagged over more rows, the Pumpkin Push crews stand further apart and
 * the lanes' start columns further along, and the at-once team events (Crate Tower, Bucket Brigade,
 * Kite Flight) stand in ranks two or three rows deep, so no tower is a wall.
 *
 * Shifts are constant per creature or team, except the runners' sideways spread, which fades out as
 * they run; the board reads the engine's own positions (`PosKey.rx`), so its order and metres are the
 * engine's.
 */
import { HAUL_STAGGER_PX, type GamesEventResult } from '@creatures/engine';
import type { GamesKind } from '@creatures/game';

/** More solo entrants than this are drawn a step smaller. */
export const CROWDED_SOLO = 16;
/** More runners than this (a Melon Run) are spread over more rows. */
export const CROWDED_RUNNERS = 8;
/** More teams than this are spread out in the team events. */
export const CROWDED_TEAMS = 8;

/** A creature drawn small is this fraction of its size (12 of 16 px). */
export const SMALL_SCALE = 0.75;

/** Melon Run: the rows runners are spread over (a row's three runners zig-zag by `RUNNER_ZIG`). */
const RUNNER_TOP = 46;
const RUNNER_SPAN = 54;
const RUNNER_ZIG = 14;
const RUNNER_FADE_PX = 160;
/** Pumpkin Push: each lane's start column is this much further on, and the crew's rear stretches. */
const HAUL_EXTRA_STAGGER = 8;
const PUSH_FRONT = -11;
const PUSH_STRETCH = 0.4;
/**
 * The at-once team events: teams stand in ranks, each this far back of the one before (a Bucket
 * Brigade has two, because its pond is at the front; a tower or a kite three), and a crew stands this
 * wide apart.
 */
const RANK_DY = 9;
const CREW_SPREAD = 5;

export interface Point {
  x: number;
  y: number;
}

export interface ShowLayout {
  /** Draw the creatures a step smaller. */
  small: boolean;
  /** Each team's shift back (0 or negative px), by team index; empty unless the teams are ranked. */
  teamDy: number[];
  actor(a: number, x: number, y: number): Point;
  prop(name: string, x: number, y: number): Point;
  fx(a: number | undefined, x: number, y: number): Point;
}

/** The unchanged layout (a field that is not crowded, or a kind that is never crowded). */
function plain(small: boolean): ShowLayout {
  return {
    small,
    teamDy: [],
    actor: (_a, x, y) => ({ x, y }),
    prop: (_n, x, y) => ({ x, y }),
    fx: (_a, x, y) => ({ x, y }),
  };
}

/** The first `prop` beat of each `name:<i>` prop, by index. */
function firstProps(result: GamesEventResult, name: string): Map<number, Point> {
  const out = new Map<number, Point>();
  const prefix = `${name}:`;
  for (const b of result.beats) {
    if (b.k !== 'prop' || !b.p.startsWith(prefix)) continue;
    const i = Number(b.p.slice(prefix.length));
    if (Number.isInteger(i) && i >= 0 && !out.has(i)) out.set(i, { x: b.x, y: b.y });
  }
  return out;
}

/** Teams (indices in order of first appearance) of an event, as `prepareEvent` counts them. */
function teamIndexOf(result: GamesEventResult): { teamOf: number[]; count: number } {
  const ids = new Map<string, number>();
  const teamOf = result.actors.map((a) => {
    let i = ids.get(a.teamId);
    if (i === undefined) {
      i = ids.size;
      ids.set(a.teamId, i);
    }
    return i;
  });
  return { teamOf, count: ids.size };
}

/** Melon Run: the runners, in lane order (by start y), over rows of three that zig-zag. */
function chaseLayout(result: GamesEventResult): ShowLayout {
  const startY = new Map(result.actors.map((a) => [a.a, a.y]));
  const order = result.actors
    .map((a) => a.a)
    .sort((p, q) => (startY.get(p) ?? 0) - (startY.get(q) ?? 0) || p - q);
  const rows = Math.ceil(order.length / 3);
  const spot = new Map<number, { y: number; dx: number }>();
  order.forEach((a, lane) => {
    const row = Math.floor(lane / 3);
    spot.set(a, {
      y: RUNNER_TOP + Math.round((row * RUNNER_SPAN) / Math.max(1, rows - 1)),
      dx: ((lane % 3) - 1) * RUNNER_ZIG,
    });
  });
  const startX = new Map(result.actors.map((a) => [a.a, a.x]));
  // A runner keeps its lane for the whole race (the engine's y does not change in a chase). Its
  // sideways shift is full at the start and gone after `RUNNER_FADE_PX`, so the pack is spread where
  // it is thickest and the finish is the engine's.
  const shifted = (a: number | undefined, x: number, y: number): Point => {
    const s = a === undefined ? undefined : spot.get(a);
    if (a === undefined || s === undefined) return { x, y };
    const fade = Math.max(0, Math.min(1, 1 - (x - (startX.get(a) ?? x)) / RUNNER_FADE_PX));
    return { x: x + Math.round(s.dx * fade), y: y + (s.y - (startY.get(a) ?? y)) };
  };
  return { ...plain(true), actor: shifted, fx: shifted };
}

/** Haul: lanes start further apart, and a push crew stands further apart behind its pumpkin. */
function haulLayout(result: GamesEventResult, teamOf: number[]): ShowLayout {
  const pumpkins = firstProps(result, 'pumpkin');
  const loads = pumpkins.size > 0 ? pumpkins : firstProps(result, 'log');
  const xs = [...loads.values()].map((p) => p.x);
  const left = xs.length === 0 ? 0 : Math.min(...xs);
  const colOf = (i: number | undefined): number => {
    const at = i === undefined ? undefined : loads.get(i);
    return at === undefined ? 0 : Math.round((at.x - left) / HAUL_STAGGER_PX);
  };
  // A pusher behind the pumpkin's first place stands a little further back.
  const crew = new Map<number, number>();
  if (pumpkins.size > 0) {
    for (const a of result.actors) {
      const load = pumpkins.get(teamOf[a.a] ?? -1);
      const behind = load === undefined ? 0 : a.x - load.x - PUSH_FRONT;
      if (behind < 0) crew.set(a.a, Math.round(behind * PUSH_STRETCH));
    }
  }
  const stagger = (i: number | undefined): number => colOf(i) * HAUL_EXTRA_STAGGER;
  return {
    ...plain(true),
    actor: (a, x, y) => ({ x: x + stagger(teamOf[a]) + (crew.get(a) ?? 0), y }),
    prop: (name, x, y) => {
      const [kind, index] = name.split(':');
      if (kind !== 'pumpkin' && kind !== 'log' && kind !== 'finish') return { x, y };
      return { x: x + stagger(Number(index)), y };
    },
    fx: (a, x, y) => (a === undefined ? { x, y } : { x: x + stagger(teamOf[a]), y }),
  };
}

/** The at-once team events: each column stands a rank further back than the one before; a crew stands wider. */
function columnsLayout(
  result: GamesEventResult,
  teamOf: number[],
  teams: number,
  kind: 'fill' | 'stack' | 'kite',
): ShowLayout {
  const objects = firstProps(
    result,
    kind === 'fill' ? 'barrel' : kind === 'stack' ? 'tower' : 'kite',
  );
  const colX = Array.from({ length: teams }, (_, i) => objects.get(i)?.x ?? 0);
  const order = colX.map((_, i) => i).sort((p, q) => (colX[p] ?? 0) - (colX[q] ?? 0) || p - q);
  const ranks = kind === 'fill' ? 2 : 3;
  const dy = new Array<number>(teams).fill(0);
  order.forEach((team, col) => {
    dy[team] = -(col % ranks) * RANK_DY;
  });
  const wide = (team: number, x: number): number => {
    const centre = colX[team] ?? x;
    const d = x - centre;
    return d !== 0 && Math.abs(d) < CREW_SPREAD ? centre + Math.sign(d) * CREW_SPREAD : x;
  };
  const nearest = (x: number): number => {
    let best = 0;
    colX.forEach((c, i) => {
      if (Math.abs(c - x) < Math.abs((colX[best] ?? 0) - x)) best = i;
    });
    return best;
  };
  return {
    small: true,
    teamDy: dy,
    actor: (a, x, y) => {
      const t = teamOf[a] ?? 0;
      return { x: wide(t, x), y: y + (dy[t] ?? 0) };
    },
    prop: (name, x, y) => {
      const [k, index] = name.split(':');
      if (k !== 'barrel' && k !== 'tower' && k !== 'kite') return { x, y };
      return { x, y: y + (dy[Number(index)] ?? 0) };
    },
    fx: (a, x, y) => {
      const t = a === undefined ? nearest(x) : (teamOf[a] ?? 0);
      return { x: a === undefined ? x : wide(t, x), y: y + (dy[t] ?? 0) };
    },
  };
}

/** The layout of an event's field (the unchanged one while it is small). */
export function layoutFor(kind: GamesKind, result: GamesEventResult): ShowLayout {
  const { teamOf, count } = teamIndexOf(result);
  if (result.team === 3) {
    if (count <= CROWDED_TEAMS) return plain(false);
    if (kind === 'haul') return haulLayout(result, teamOf);
    if (kind === 'fill' || kind === 'stack' || kind === 'kite') {
      return columnsLayout(result, teamOf, count, kind);
    }
    return plain(true);
  }
  const n = result.actors.length;
  if (kind === 'chase') return n > CROWDED_RUNNERS ? chaseLayout(result) : plain(false);
  return plain(n > CROWDED_SOLO);
}
