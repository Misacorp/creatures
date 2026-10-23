/**
 * Haul (Log Carry, Pumpkin Push), team events: each team carries a big log on their heads (`carry`) or
 * pushes a giant pumpkin (`push`) along the hill path, every lane at once. A team is one lane: its load
 * and its (up to) three creatures in a tight group under or behind it, moving together.
 *
 * - Speed per tick: the members' key stat against the field (`keyFactor`: Speed for a carry, Attack for
 *   a push, with the element, role and size multipliers), made into one team number: a carry by its
 *   slowest member most (`minWeightBp`, the rest the mean), so a team must match; a push by the sum
 *   with diminishing returns (the strongest whole, then `secondBp`, `thirdBp`). A team short of members
 *   loses `shortBp` each (a push counts them as nothing anyway). A Setter leads (`leadBp`).
 * - Wobbles: now and then a team's load wobbles and one member must keep it steady (a base chance, its
 *   dodge, and each Guard of the team, at most two). A Sidestep line steps clear; a Stubborn one catches
 *   the falling load once. Else it drops: the log falls (the pumpkin rolls back `rollbackPx`) and the
 *   team stands still a few ticks, one fewer for each Support cheering (and a Second Wind), at least one.
 *   A drop may bump the team in the next lane (it loses `bumpTicks`).
 * - A `zapElement` member now and then jolts its team forward (`burstBp` for two ticks); so does a
 *   Momentum or Riposte line after a steady wobble.
 * - Lanes start staggered (up to four start columns, each `HAUL_STAGGER_PX` further on,
 *   their finish too), so a big field spreads out; each lane's finish is a `finish:<i>` prop.
 * - The race ends `graceTicks` after the first team crosses the line, or at the cap (`maxTicks`), so its
 *   length does not grow with the field. Ranking: finish order, then distance (8 px a metre).
 */
import type { GamesEventOf } from '@creatures/game';
import { BP, between, jitter, mulBp, pickOne, roll, shuffle } from './math';
import { gear, keyFactor, tickLimit, type KindInput, type KindOutcome } from './common';
import type { GamesEntrant } from './types';

type Def = GamesEventOf<'haul'>;

const PX_PER_METRE = 8;
/** The load's centre at the start (world px). */
const START_X = 40;
/** The lanes' feet y: from the top lane to the bottom one (one team, the middle). */
const LANE_TOP = 48;
const LANE_SPAN = 52;
const LANE_SOLO = 74;
/**
 * A staggered start, like a running track, so a field reads: the lanes start in up to `MAX_COLUMNS`
 * columns (two teams to a column while that is enough), each `HAUL_STAGGER_PX` further on, and so is
 * each lane's finish, so every lane is as long. Lane k is in column k mod columns, so the teams of one
 * column are a few lanes apart.
 */
const MAX_COLUMNS = 4;
export const HAUL_STAGGER_PX = 40;
/** Lines about the lead at least this many ticks apart. */
const LEAD_GAP = 10;
/** A second team over the line within this many ticks of the first is a photo finish. */
const CLOSE_TICKS = 2;
/** Load frames (`prop` f): carried or rolling, wobbling, dropped (on the ground, rolling back). */
export const HAUL_UP = 0;
export const HAUL_WOBBLE = 1;
export const HAUL_DOWN = 2;

/**
 * Where each member stands from the load's centre (px, front first: the direction of travel is +x):
 * under the log in a tight row, or one behind the other behind the pumpkin.
 */
export const HAUL_OFFSETS: Readonly<Record<'carry' | 'push', readonly (readonly number[])[]>> = {
  carry: [[], [0], [5, -5], [9, 0, -9]],
  push: [[], [-11], [-11, -19], [-11, -19, -27]],
};

/** Who stands at the front: a Setter leads, a Guard steadies the back. */
const ROLE_ORDER = { setter: 0, payoff: 1, support: 2, guard: 3 } as const;

interface Team {
  /** Members, front first. */
  members: number[];
  y: number;
  lane: number;
  /** The load's centre, in hundredths of a px, and where it started and finishes (its lane's stagger). */
  xc: number;
  start: number;
  finish: number;
  speed: number;
  stun: number;
  burst: number;
  /** The finish order (1 is first; 0: not over the line). */
  done: number;
  guards: number;
  supports: number;
}

/** The team's speed factor from its members' factors (basis points). */
function teamSpeed(def: Def, factors: readonly number[], members: readonly GamesEntrant[]): number {
  const p = def.params;
  const missing = Math.max(0, 3 - factors.length);
  let f: number;
  if (p.mode === 'carry') {
    const min = Math.min(...factors);
    const mean = Math.floor(factors.reduce((s, x) => s + x, 0) / factors.length);
    f = mulBp(min, p.minWeightBp) + mulBp(mean, BP - p.minWeightBp);
    f = mulBp(f, Math.max(0, BP - missing * p.shortBp));
  } else {
    const sorted = [...factors].sort((x, y) => y - x);
    const shares = [BP, p.secondBp, p.thirdBp];
    const total = shares.reduce((s, x) => s + x, 0);
    const sum = sorted.reduce((s, x, i) => s + x * (shares[i] ?? 0), 0);
    f = Math.floor(sum / total);
  }
  if (members.some((e) => e.role === 'setter')) f = mulBp(f, p.leadBp);
  return Math.max(1, f);
}

export function runHaul(input: KindInput<Def>): KindOutcome {
  const { def, entrants, rng, show, teamOf, teams: teamCount } = input;
  const p = def.params;
  const n = entrants.length;
  const prop = p.mode === 'carry' ? 'log' : 'pumpkin';
  const factor = keyFactor(def, entrants, p.mode === 'carry' ? 'spd' : 'atk');
  const startX = p.mode === 'carry' ? START_X : START_X + 10;
  const lanes = shuffle(
    rng,
    Array.from({ length: teamCount }, (_, i) => i),
  );
  const columns = Math.max(1, Math.min(MAX_COLUMNS, Math.ceil(teamCount / 2)));
  const stagger = (lane: number): number => (lane % columns) * HAUL_STAGGER_PX * 100;
  const teams: Team[] = Array.from({ length: teamCount }, (_, ti) => {
    const members = teamOf
      .flatMap((t, a) => (t === ti ? [a] : []))
      .sort(
        (x, y) =>
          ROLE_ORDER[(entrants[x] as GamesEntrant).role] -
            ROLE_ORDER[(entrants[y] as GamesEntrant).role] || x - y,
      );
    const es = members.map((a) => entrants[a] as GamesEntrant);
    const lane = lanes[ti] as number;
    return {
      members,
      lane,
      y: teamCount === 1 ? LANE_SOLO : LANE_TOP + Math.floor((lane * LANE_SPAN) / (teamCount - 1)),
      xc: startX * 100 + stagger(lane),
      start: startX * 100 + stagger(lane),
      finish: p.finishPx * 100 + stagger(lane),
      speed: teamSpeed(
        def,
        members.map((a) => factor[a] as number),
        es,
      ),
      stun: 0,
      burst: 0,
      done: 0,
      guards: Math.min(2, es.filter((e) => e.role === 'guard').length),
      supports: es.filter((e) => e.role === 'support').length,
    };
  });
  const byLane = [...teams].sort((x, y) => x.lane - y.lane);
  const offsets = (t: Team): readonly number[] =>
    HAUL_OFFSETS[p.mode][t.members.length] ?? [0, 0, 0];
  const starts: { x: number; y: number }[] = new Array<{ x: number; y: number }>(n);
  const front = (t: Team): number => t.members[0] as number;
  const place = (tick: number, t: Team, f: number, first = false): void => {
    const x = Math.floor(t.xc / 100);
    offsets(t).forEach((dx, k) => {
      const a = t.members[k] as number;
      if (first) {
        starts[a] = { x: x + dx, y: t.y };
        show.place(a, x + dx, t.y);
      } else {
        show.pos(tick, a, x + dx, t.y);
      }
    });
    show.prop(tick, `${prop}:${String(teams.indexOf(t))}`, x, t.y, f);
  };
  const stateAll = (tick: number, t: Team, s: 'run' | 'idle' | 'dizzy' | 'cheer'): void => {
    for (const a of t.members) show.state(tick, a, s);
  };
  teams.forEach((t, i) => {
    place(0, t, HAUL_UP, true);
    stateAll(0, t, 'run');
    // The lane's finish mark.
    show.prop(0, `finish:${String(i)}`, Math.floor(t.finish / 100), t.y);
  });
  show.say(0, 'haul.start');

  const saved = new Array<boolean>(n).fill(false);
  let finished = 0;
  let firstAt = 0;
  let firstTeam: Team | undefined;
  let leader: Team | undefined;
  let leadSaidAt = Number.NEGATIVE_INFINITY;
  let end = 0;
  const cap = tickLimit(def, n);
  for (let t = 1; t <= cap; t++) {
    end = t;
    for (const team of teams) {
      if (team.done !== 0) continue;
      if (team.stun > 0) {
        team.stun -= 1;
        if (team.stun === 0) {
          place(t, team, HAUL_UP);
          stateAll(t, team, 'run');
        }
        continue;
      }
      // A wobble: one member must keep the load steady.
      if (roll(rng, p.wobbleChanceBp)) {
        const m = pickOne(rng, team.members);
        const e = entrants[m] as GamesEntrant;
        const steady =
          p.steadyBaseBp + mulBp(e.dodgeBp, p.dodgeShareBp) + team.guards * p.guardSteadyBp;
        if (roll(rng, steady)) {
          const guard = team.members.find((a) => entrants[a]?.role === 'guard');
          show.prop(
            t,
            `${prop}:${String(teams.indexOf(team))}`,
            Math.floor(team.xc / 100),
            team.y,
            HAUL_WOBBLE,
          );
          if (guard !== undefined) {
            show.fx(t, 'shield', { a: guard }, true);
            show.say(t, 'haul.steady', { a: guard });
          } else {
            show.fx(t, 'hop', { a: m }, true);
          }
          if (roll(rng, gear(e, 'momentumBp') + gear(e, 'riposteBp'))) {
            team.burst = 2;
            show.fx(t, 'star', { a: m }, true);
          }
        } else if (roll(rng, gear(e, 'sidestepBp'))) {
          show.fx(t, 'hop', { a: m }, true);
          show.say(t, 'haul.dodge', { a: m });
        } else if (gear(e, 'stubborn') > 0 && !saved[m]) {
          saved[m] = true;
          show.fx(t, 'star', { a: m }, true);
          show.say(t, 'haul.catch', { a: m });
        } else {
          drop(t, team, m);
          continue;
        }
      }
      // A zap jolts the team forward.
      const zapper = team.members.find((a) => entrants[a]?.element === p.zapElement);
      if (zapper !== undefined && roll(rng, p.zapChanceBp)) {
        team.burst = 2;
        show.fx(t, 'zap', { a: zapper }, true);
        show.say(t, 'haul.zap', { a: zapper });
      }
      let mult = jitter(rng, p.jitterBp);
      if (team.burst > 0) {
        team.burst -= 1;
        mult = mulBp(mult, p.burstBp);
      }
      team.xc += mulBp(mulBp(p.runCpx, team.speed), mult);
      if (team.xc >= team.finish) {
        finished += 1;
        team.done = finished;
        team.xc = team.finish;
        place(t, team, HAUL_UP);
        stateAll(t, team, 'cheer');
        show.fx(t, 'star', { a: front(team) }, true);
        if (finished === 1) {
          firstAt = t;
          firstTeam = team;
          show.sayNext(t, 'haul.finish', { a: front(team) });
        } else if (finished === 2 && firstTeam !== undefined && t - firstAt <= CLOSE_TICKS) {
          show.sayNext(t, 'haul.close', { a: front(firstTeam), b: front(team) });
        } else {
          show.say(t, 'haul.finish', { a: front(team) });
        }
      }
    }

    const racing = teams.filter((team) => team.done === 0);
    for (const team of racing) {
      // Every other tick is enough for the client to move a team smoothly.
      if (team.stun === 0 && t % 2 === 0) place(t, team, HAUL_UP);
    }
    if (finished === 0 && racing.length > 1) {
      const lead = racing.reduce(
        (b, x) => (x.xc - x.start > b.xc - b.start ? x : b),
        racing[0] as Team,
      );
      if (lead !== leader) {
        if (leader !== undefined && t > 8 && t - leadSaidAt >= LEAD_GAP) {
          leadSaidAt = t;
          show.say(t, 'haul.lead', { a: front(lead) });
        }
        leader = lead;
      }
    }
    if (firstAt > 0 && t >= firstAt + p.graceTicks) break;
    if (racing.length === 0) break;
  }

  function drop(t: number, team: Team, m: number): void {
    let stun = between(rng, p.dropMinTicks, p.dropMaxTicks);
    const cheer = team.members.find((a) => entrants[a]?.role === 'support');
    const wind = team.members.find((a) =>
      roll(rng, gear(entrants[a] as GamesEntrant, 'secondWindBp')),
    );
    stun = Math.max(1, stun - team.supports - (wind === undefined ? 0 : 1));
    team.stun = stun;
    team.burst = 0;
    if (p.mode === 'push') team.xc = Math.max(team.start, team.xc - p.rollbackPx * 100);
    const x = Math.floor(team.xc / 100);
    place(t, team, HAUL_DOWN);
    stateAll(t, team, 'idle');
    show.state(t, m, 'dizzy');
    show.fx(t, 'stumble', { a: m }, true);
    show.fx(t, 'bonk', { x, y: team.y - (p.mode === 'carry' ? 4 : 8) }, true);
    show.say(t, 'haul.drop', { a: m });
    const helper = cheer ?? wind;
    if (helper !== undefined) {
      const at = t + Math.max(1, stun - 1);
      show.fx(at, 'heal', { a: helper }, true);
      if (cheer !== undefined) show.say(at, 'haul.cheer', { a: cheer });
    }
    // The falling load bumps the team in the next lane.
    if (!roll(rng, p.bumpChanceBp)) return;
    // The nearest lanes: either side, and the next ones in its own start column.
    const lanesNear = [team.lane - 1, team.lane + 1, team.lane - columns, team.lane + columns];
    const near = [...new Set(lanesNear)]
      .map((l) => byLane[l])
      .filter(
        (o): o is Team =>
          o !== undefined &&
          o.done === 0 &&
          o.stun === 0 &&
          Math.abs(o.xc - team.xc) <= p.bumpRangePx * 100,
      );
    if (near.length === 0) return;
    const o = pickOne(rng, near);
    o.stun = p.bumpTicks;
    o.burst = 0;
    const b = front(o);
    place(t, o, HAUL_WOBBLE);
    stateAll(t, o, 'dizzy');
    show.fx(t, 'bonk', { a: b }, true);
    show.say(t, 'haul.bump', { a: m, b });
  }

  // A finisher scores the distance to the line and a bonus by finish order; it ranks by that order.
  const metres = (team: Team): number =>
    Math.max(0, Math.floor((team.xc - team.start) / (100 * PX_PER_METRE)));
  const scores = new Array<number>(n).fill(0);
  const keys: number[][] = new Array<number[]>(n);
  for (const team of teams) {
    const score =
      team.done === 0 ? metres(team) : metres(team) + Math.max(1, p.finishBonusM - (team.done - 1));
    const key = team.done === 0 ? [1, team.xc - team.start] : [2, -team.done];
    if (team.done === 0) {
      place(end, team, team.stun > 0 ? HAUL_DOWN : HAUL_UP);
      stateAll(end, team, 'idle');
    }
    for (const a of team.members) {
      scores[a] = score;
      keys[a] = key;
      show.score(end, a, score);
    }
  }
  const outAt: (number | null)[] = new Array<number | null>(n).fill(null);
  return { starts, scores, outAt, keys, end };
}
