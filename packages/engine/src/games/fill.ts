/**
 * Fill (Bucket Brigade), a team event: every team fills its own barrel from the pond in a fixed time,
 * every team and every member at once, so the show is as long with 4 teams as with 16.
 *
 * - A team is one column: its barrel at the top (`barrel:<i>`, f = level in percent), the pond at the
 *   bottom, its (up to) three members shuttling between them, each on its own trip.
 * - A trip: dip at the pond (`dipTicks`, one fewer per Support teammate: they help refill), run up with
 *   a full bucket (Speed against the field, the role and size multipliers), pour, run back empty
 *   (`returnBp` faster). How much a bucket holds is `bucketBp` times the element multiplier (Tide
 *   carries more). The actor's meter is its bucket (100 full, 0 empty).
 * - A pour may slip (`slipChanceBp`) unless the member keeps it steady (a base chance and its dodge);
 *   a Sidestep line steps round it, a Stubborn one saves the bucket once. A slip puts only `keepBp` of
 *   the bucket in, and may splash `splashBp` of it into a neighbouring barrel (good for them).
 * - A `steamElement` member's pour may steam `steamBp` of a barrel off a neighbour (shared chaos).
 * - The event runs `maxTicks`, whatever happens. Score: the barrel's level in percent; ties share.
 */
import type { GamesEventOf } from '@creatures/game';
import { BP, jitter, mulBp, pickOne, roll } from './math';
import { gear, keyFactor, tickLimit, type KindInput, type KindOutcome } from './common';
import { columnOrder, columnXs, memberSpread, membersOf } from './columns';
import type { GamesEntrant } from './types';

type Def = GamesEventOf<'fill'>;

/** The barrels' feet, where a member stands to pour, and where it dips at the pond (scene px). */
export const FILL_BARREL_Y = 46;
export const FILL_POUR_Y = 63;
export const FILL_DIP_Y = 94;
const TRACK = FILL_DIP_Y - FILL_POUR_Y;
/** A full barrel (basis points). */
const FULL = BP;
/** Lines about the lead at least this many ticks apart. */
const LEAD_GAP = 10;
/** Ten seconds before the end at 400 ms a tick. */
const LAST_MS = 10_000;

type Phase = 'dip' | 'up' | 'down';

interface Member {
  a: number;
  e: GamesEntrant;
  /** Speed factor (basis points). */
  speed: number;
  /** A full bucket (basis points of a barrel). */
  carry: number;
  /** Distance from the pond (hundredths of a px). */
  pos: number;
  phase: Phase;
  wait: number;
  dx: number;
  burst: boolean;
  saved: boolean;
}

interface Team {
  members: Member[];
  x: number;
  col: number;
  level: number;
  supports: number;
  half: boolean;
  full: boolean;
}

export function runFill(input: KindInput<Def>): KindOutcome {
  const { def, entrants, rng, show, teamOf, teams: teamCount } = input;
  const p = def.params;
  const n = entrants.length;
  const speed = keyFactor(def, entrants, 'spd', { element: false });
  const xs = columnXs(teamCount);
  const cols = columnOrder(rng, teamCount);
  const spread = memberSpread(teamCount);
  const teams: Team[] = membersOf(teamOf, teamCount).map((as, ti) => {
    const col = cols[ti] as number;
    const x = xs[col] as number;
    const es = as.map((a) => entrants[a] as GamesEntrant);
    return {
      x,
      col,
      level: 0,
      supports: es.filter((e) => e.role === 'support').length,
      half: false,
      full: false,
      members: as.map((a, k) => {
        const e = entrants[a] as GamesEntrant;
        return {
          a,
          e,
          speed: speed[a] as number,
          carry: Math.max(1, mulBp(p.bucketBp, def.elementBp[e.element])),
          pos: 0,
          phase: 'dip',
          // Staggered starts, so a team does not move as one.
          wait: 1 + 2 * k,
          dx: Math.round((k - (as.length - 1) / 2) * spread),
          burst: false,
          saved: false,
        };
      }),
    };
  });
  const byCol = [...teams].sort((u, v) => u.col - v.col);
  const front = (t: Team): number => (t.members[0] as Member).a;
  const pct = (t: Team): number => Math.floor((t.level * 100) / FULL);
  const starts: { x: number; y: number }[] = new Array<{ x: number; y: number }>(n);
  const yOf = (m: Member): number => FILL_DIP_Y - Math.floor(m.pos / 100);
  const barrel = (tick: number, t: Team): void => {
    show.prop(tick, `barrel:${String(teams.indexOf(t))}`, t.x, FILL_BARREL_Y, pct(t));
  };
  const scoreAll = (tick: number, t: Team): void => {
    for (const m of t.members) show.score(tick, m.a, pct(t));
  };
  const addTo = (tick: number, t: Team, bp: number): void => {
    t.level = Math.max(0, Math.min(FULL, t.level + bp));
    barrel(tick, t);
    scoreAll(tick, t);
    if (!t.half && t.level >= FULL / 2) {
      t.half = true;
      show.say(tick, 'fill.half', { a: front(t) });
    }
    if (!t.full && t.level >= FULL) {
      t.full = true;
      show.fx(tick, 'star', { a: front(t) }, true);
      show.sayNext(tick, 'fill.full', { a: front(t) });
    }
  };
  for (const t of teams) {
    for (const m of t.members) {
      starts[m.a] = { x: t.x + m.dx, y: FILL_DIP_Y };
      show.place(m.a, t.x + m.dx, FILL_DIP_Y);
      show.state(0, m.a, 'swim');
      show.meter(0, m.a, 0);
    }
    barrel(0, t);
  }
  show.say(0, 'fill.start');

  const neighbour = (t: Team): Team | undefined => {
    const near = [byCol[t.col - 1], byCol[t.col + 1]].filter((o): o is Team => o !== undefined);
    return near.length === 0 ? undefined : pickOne(rng, near);
  };

  const pour = (tick: number, t: Team, m: Member): void => {
    const e = m.e;
    let amount = m.carry;
    const bx = t.x;
    const by = FILL_BARREL_Y - 8;
    if (roll(rng, p.slipChanceBp)) {
      const steady = p.steadyBaseBp + mulBp(e.dodgeBp, p.dodgeShareBp);
      if (roll(rng, steady)) {
        if (roll(rng, gear(e, 'momentumBp') + gear(e, 'riposteBp'))) {
          m.burst = true;
          show.fx(tick, 'star', { a: m.a }, true);
        }
      } else if (roll(rng, gear(e, 'sidestepBp'))) {
        show.fx(tick, 'hop', { a: m.a }, true);
        show.say(tick, 'fill.dodge', { a: m.a });
      } else if (gear(e, 'stubborn') > 0 && !m.saved) {
        m.saved = true;
        show.fx(tick, 'star', { a: m.a }, true);
        show.say(tick, 'fill.catch', { a: m.a });
      } else {
        // A slip: most of the bucket goes on the ground, and some may land next door.
        const spilt = amount - mulBp(amount, p.keepBp);
        amount -= spilt;
        show.fx(tick, 'stumble', { a: m.a }, true);
        show.fx(tick, 'splash', { x: m.dx + bx, y: FILL_POUR_Y }, true);
        const o = roll(rng, p.splashChanceBp) ? neighbour(t) : undefined;
        if (o !== undefined) {
          show.fx(tick, 'splash', { x: o.x, y: by }, true);
          show.say(tick, 'fill.splash', { a: m.a, b: front(o) });
          addTo(tick, o, mulBp(spilt, p.splashBp));
        } else {
          show.say(tick, 'fill.spill', { a: m.a });
        }
      }
    }
    if (amount > 0) {
      show.fx(tick, 'splash', { x: bx, y: by }, amount === m.carry);
      if (amount === m.carry) show.say(tick, 'fill.pour', { a: m.a });
      addTo(tick, t, amount);
    }
    // An Ember member by the barrels heats the next one: a little of its water steams away.
    if (e.element === p.steamElement && roll(rng, p.steamChanceBp)) {
      const o = neighbour(t);
      if (o !== undefined && o.level > 0) {
        show.fx(tick, 'steam', { x: o.x, y: by }, true);
        show.say(tick, 'fill.steam', { a: m.a, b: front(o) });
        addTo(tick, o, -p.steamBp);
      }
    }
  };

  const cap = tickLimit(def, n);
  const lastAt = cap - Math.ceil(LAST_MS / def.tickMs);
  let leader: Team | undefined;
  let leadSaidAt = Number.NEGATIVE_INFINITY;
  for (let t = 1; t <= cap; t++) {
    for (const team of teams) {
      for (const m of team.members) {
        const run = (): number => mulBp(mulBp(p.runCpx, m.speed), jitter(rng, p.jitterBp));
        if (m.phase === 'dip') {
          m.wait -= 1;
          if (m.wait > 0) continue;
          m.phase = 'up';
          show.meter(t, m.a, BP);
          show.state(t, m.a, 'run');
        } else if (m.phase === 'up') {
          m.pos += m.burst ? mulBp(run(), p.burstBp) : run();
          if (m.pos >= TRACK * 100) {
            m.pos = TRACK * 100;
            m.burst = false;
            show.pos(t, m.a, team.x + m.dx, FILL_POUR_Y);
            pour(t, team, m);
            m.phase = 'down';
            show.meter(t, m.a, 0);
          }
        } else {
          m.pos -= mulBp(run(), p.returnBp);
          if (m.pos <= 0) {
            m.pos = 0;
            m.phase = 'dip';
            show.pos(t, m.a, team.x + m.dx, FILL_DIP_Y);
            show.state(t, m.a, 'swim');
            const helpers = team.supports - (m.e.role === 'support' ? 1 : 0);
            const wind = roll(rng, gear(m.e, 'secondWindBp')) ? 1 : 0;
            m.wait = Math.max(1, p.dipTicks - helpers * p.helpTicks - wind);
            if (helpers > 0 && p.helpTicks > 0) {
              const helper = team.members.find((o) => o !== m && o.e.role === 'support');
              if (helper !== undefined && roll(rng, 2_500)) {
                show.fx(t, 'heal', { a: m.a });
                show.say(t, 'fill.help', { a: helper.a });
              }
            }
          }
        }
        if (t % 2 === 0 && m.phase !== 'dip') show.pos(t, m.a, team.x + m.dx, yOf(m));
      }
    }
    if (teams.length > 1 && t > 8) {
      const lead = teams.reduce((b, x) => (x.level > b.level ? x : b), teams[0] as Team);
      if (lead !== leader && lead.level > (leader?.level ?? -1)) {
        if (leader !== undefined && t - leadSaidAt >= LEAD_GAP) {
          leadSaidAt = t;
          show.say(t, 'fill.lead', { a: front(lead) });
        }
        leader = lead;
      }
    }
    if (t === lastAt && lastAt > 10) show.say(t, 'fill.last');
  }

  const scores = new Array<number>(n).fill(0);
  const keys: number[][] = new Array<number[]>(n);
  for (const team of teams) {
    for (const m of team.members) {
      show.pos(cap, m.a, team.x + m.dx, yOf(m));
      show.state(cap, m.a, 'idle');
      scores[m.a] = pct(team);
      keys[m.a] = [pct(team)];
      show.score(cap, m.a, pct(team));
    }
  }
  const outAt: (number | null)[] = new Array<number | null>(n).fill(null);
  return { starts, scores, outAt, keys, end: cap };
}

/** How well a creature fits a fill (before size): Speed, how much it carries, a steady pour, a helper. */
export function fillAptitude(
  def: Def,
  e: GamesEntrant,
  s: { hp: number; atk: number; spd: number },
): number {
  const p = def.params;
  const m = e.mods ?? {};
  let f = mulBp(mulBp(s.spd, def.roleBp?.[e.role] ?? BP), def.elementBp[e.element]);
  f = mulBp(
    f,
    BP +
      mulBp(mulBp(e.dodgeBp, p.dodgeShareBp), mulBp(p.slipChanceBp, 20_000)) +
      Math.floor((m.sidestepBp ?? 0) / 8) +
      (m.stubborn === 1 ? 300 : 0),
  );
  if (e.role === 'support' && p.helpTicks > 0) f = mulBp(f, 10_400);
  if (e.element === p.steamElement) f = mulBp(f, 10_200);
  return f;
}
