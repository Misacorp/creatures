/** What every Games kind shares: input checks, team bookkeeping, the stat factors and the standings. */
import { ELEMENTS, RULES, type GamesEventDef, type Rng } from '@creatures/game';
import { BP, fieldCurve, mulBp } from './math';
import type { Show } from './show';
import type { GamesEntrant, GamesStanding } from './types';

/** What a kind gets. */
export interface KindInput<D extends GamesEventDef> {
  def: D;
  entrants: readonly GamesEntrant[];
  rng: Rng;
  show: Show;
  /** The team index (0-based, in order of first appearance) of each actor, and the number of teams. */
  teamOf: readonly number[];
  teams: number;
}

/** What a kind gives back; `keys` rank the actors (compared element by element, higher is better). */
export interface KindOutcome {
  starts: { x: number; y: number }[];
  scores: number[];
  outAt: (number | null)[];
  keys: number[][];
  /** The last tick the kind simulated. */
  end: number;
}

const ID = /^[A-Za-z0-9:_./-]{1,64}$/;

function whole(n: unknown, lo: number, hi: number): boolean {
  return typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;
}

/**
 * Throws a RangeError naming the first problem with an event's entrants: 1 to `RULES.games.maxEntrants`
 * (`maxTeamEntrants` in a team event),
 * unique ids, whole non-negative stats, one creature per player in a solo event, at most
 * `RULES.games.teamSize` per team (and one player per team) in a team event.
 */
export function checkEntrants(def: GamesEventDef, entrants: readonly GamesEntrant[]): void {
  const max = def.team === 3 ? RULES.games.maxTeamEntrants : RULES.games.maxEntrants;
  if (entrants.length < 1 || entrants.length > max) {
    throw new RangeError(
      `an event needs 1 to ${String(max)} entrants, got ${String(entrants.length)}`,
    );
  }
  const ids = new Set<string>();
  const perTeam = new Map<string, number>();
  const teamPlayer = new Map<string, string>();
  for (const e of entrants) {
    if (!ID.test(e.id) || !ID.test(e.playerId) || !ID.test(e.teamId)) {
      throw new RangeError(`entrant "${String(e.id)}": ids must be 1 to 64 plain characters`);
    }
    if (ids.has(e.id)) throw new RangeError(`duplicate entrant "${e.id}"`);
    ids.add(e.id);
    if (typeof e.name !== 'string' || e.name.length < 1 || e.name.length > 64) {
      throw new RangeError(`entrant "${e.id}": name must be 1 to 64 characters`);
    }
    if (!ELEMENTS.includes(e.element)) throw new RangeError(`entrant "${e.id}": unknown element`);
    if (!['setter', 'payoff', 'support', 'guard'].includes(e.role)) {
      throw new RangeError(`entrant "${e.id}": unknown role`);
    }
    if (e.stage !== 1 && e.stage !== 2)
      throw new RangeError(`entrant "${e.id}": stage must be 1 or 2`);
    const stats: [string, unknown, number][] = [
      ['hp', e.hp, 10_000_000],
      ['atk', e.atk, 10_000_000],
      ['spd', e.spd, 10_000_000],
      ['dodgeBp', e.dodgeBp, BP],
      ['critBp', e.critBp, BP],
      ['critDmgBp', e.critDmgBp, 100_000],
    ];
    for (const [name, value, hi] of stats) {
      if (!whole(value, 0, hi))
        throw new RangeError(
          `entrant "${e.id}": ${name} must be a whole number from 0 to ${String(hi)}`,
        );
    }
    for (const [name, value] of Object.entries(e.mods ?? {})) {
      if (!whole(value, 0, BP))
        throw new RangeError(`entrant "${e.id}": mods.${name} must be 0 to 10000`);
    }
    const n = (perTeam.get(e.teamId) ?? 0) + 1;
    perTeam.set(e.teamId, n);
    const owner = teamPlayer.get(e.teamId);
    if (owner !== undefined && owner !== e.playerId) {
      throw new RangeError(`team "${e.teamId}" has creatures of two players`);
    }
    teamPlayer.set(e.teamId, e.playerId);
    if (def.team === 1 && n > 1)
      throw new RangeError(`"${e.teamId}" entered two creatures in a solo event`);
    if (def.team === 3 && n > RULES.games.teamSize) {
      throw new RangeError(
        `team "${e.teamId}" has more than ${String(RULES.games.teamSize)} creatures`,
      );
    }
  }
}

/** Team indices in order of first appearance. */
export function teamIndex(entrants: readonly GamesEntrant[]): { teamOf: number[]; teams: number } {
  const map = new Map<string, number>();
  const teamOf = entrants.map((e) => {
    let i = map.get(e.teamId);
    if (i === undefined) {
      i = map.size;
      map.set(e.teamId, i);
    }
    return i;
  });
  return { teamOf, teams: map.size };
}

/** How many teams still have someone in. */
export function teamsAlive(alive: readonly boolean[], teamOf: readonly number[]): number {
  const s = new Set<number>();
  alive.forEach((on, i) => {
    if (on) s.add(teamOf[i] as number);
  });
  return s.size;
}

/** Whether the event is over: one team left of several, or nobody left of one. */
export function decided(
  alive: readonly boolean[],
  teamOf: readonly number[],
  teams: number,
): boolean {
  const left = teamsAlive(alive, teamOf);
  return teams > 1 ? left <= 1 : left === 0;
}

/** The event's role multiplier (x1 for a role it does not name). */
export function roleMult(def: GamesEventDef, e: GamesEntrant): number {
  return def.roleBp?.[e.role] ?? BP;
}

/** The size multiplier: `smallBp` for a stage-1 creature, else x1. */
export function smallMult(def: GamesEventDef, e: GamesEntrant): number {
  return e.stage === 1 ? (def.smallBp ?? BP) : BP;
}

/**
 * A stat's curve against the field times the element, role and size multipliers (each can be left
 * out), in basis points, at least 1.
 */
export function keyFactor(
  def: GamesEventDef,
  entrants: readonly GamesEntrant[],
  stat: 'hp' | 'atk' | 'spd',
  use: { element?: boolean; role?: boolean; small?: boolean } = {},
): number[] {
  const curve = fieldCurve(
    entrants.map((e) => e[stat]),
    def.params.statBp,
  );
  return entrants.map((e, i) => {
    let f = curve[i] as number;
    if (use.element !== false) f = mulBp(f, def.elementBp[e.element]);
    if (use.role !== false) f = mulBp(f, roleMult(def, e));
    if (use.small !== false) f = mulBp(f, smallMult(def, e));
    return Math.max(1, f);
  });
}

/** The gear chance of a line, 0 when the creature has none. */
export function gear(e: GamesEntrant, line: keyof NonNullable<GamesEntrant['mods']>): number {
  return e.mods?.[line] ?? 0;
}

export function compareKeys(a: readonly number[], b: readonly number[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = (b[i] ?? 0) - (a[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * The standings from the actors' keys and scores: a solo event ranks actors; a team event ranks teams
 * by their best member's key (`teamScore` `best`) or by the sum of the scores, then the best key (`sum`).
 * Equal keys share a place (1, 1, 3).
 */
export function standingsOf(
  def: GamesEventDef,
  entrants: readonly GamesEntrant[],
  teamOf: readonly number[],
  keys: readonly number[][],
  scores: readonly number[],
): GamesStanding[] {
  const groups = new Map<number, number[]>();
  teamOf.forEach((t, a) => {
    const g = groups.get(t) ?? [];
    g.push(a);
    groups.set(t, g);
  });
  const sum = def.team === 3 && def.teamScore === 'sum';
  const rows = [...groups.values()].map((actors) => {
    const best = [...actors].sort((p, q) => compareKeys(keys[p] as number[], keys[q] as number[]));
    const top = best[0] as number;
    const total = actors.reduce((n, a) => n + (scores[a] as number), 0);
    return {
      teamId: (entrants[top] as GamesEntrant).teamId,
      actors,
      score: sum ? total : (scores[top] as number),
      key: sum ? [total, ...(keys[top] as number[])] : (keys[top] as number[]),
    };
  });
  rows.sort(
    (p, q) => compareKeys(p.key, q.key) || (p.actors[0] as number) - (q.actors[0] as number),
  );
  const out: GamesStanding[] = [];
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    const place =
      prev !== undefined && compareKeys(prev.key, r.key) === 0
        ? (out[i - 1] as GamesStanding).place
        : i + 1;
    out.push({ teamId: r.teamId, place, score: r.score, actors: r.actors });
  });
  return out;
}

/** Seat positions in rows: `rows` y values, `perRow` seats each from `x0` with step `step`, squeezed into `width` when more. */
export function seatRows(
  count: number,
  rows: readonly number[],
  x0: number,
  step: number,
  width: number,
): { x: number; y: number; row: number; col: number }[] {
  const perRow = Math.max(1, Math.ceil(count / rows.length));
  const s = perRow <= 1 ? step : Math.min(step, Math.floor(width / (perRow - 1)));
  const out: { x: number; y: number; row: number; col: number }[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    out.push({ x: x0 + col * s, y: rows[row] as number, row, col });
  }
  return out;
}

/**
 * Paces the eliminations so a crowd never leaves all at once: at most a quarter of the field (at least
 * one) within any 2 s, and in a field of 12 or fewer (or once four or fewer are left) at least 1.5 s
 * between two exits, so the commentary can name everyone who leaves. A creature
 * the gate holds back stays in at the very edge (a full meter less a sliver, a step ahead of the melon,
 * the last of its stamina, the rim of the floe) and goes as soon as the gate allows.
 */
export class ExitGate {
  private readonly outs: number[] = [];
  private readonly window: number;
  private readonly spacing: number;
  private readonly cap: number;
  private readonly small: boolean;

  constructor(entrants: number, tickMs: number) {
    this.small = entrants <= 12;
    this.window = Math.ceil(2_000 / tickMs);
    this.spacing = Math.ceil(1_500 / tickMs);
    this.cap = Math.max(1, Math.floor(entrants / 4));
  }

  /** Whether one more may leave at `t`, with `left` creatures still in (it among them). */
  allow(t: number, left: number): boolean {
    const recent = this.outs.filter((x) => t - x < this.window).length;
    if (recent >= this.cap) return false;
    const last = this.outs[this.outs.length - 1];
    if ((left <= 4 || this.small) && last !== undefined && t - last < this.spacing) return false;
    return true;
  }

  /** Records an exit at `t`. */
  record(t: number): void {
    this.outs.push(t);
  }
}

/** The last tick an event may run: `maxTicks`, or about 25 s with one or two entrants (a short show). */
export function tickLimit(def: GamesEventDef, entrants: number): number {
  return entrants <= 2 ? Math.min(def.maxTicks, Math.ceil(25_000 / def.tickMs)) : def.maxTicks;
}
