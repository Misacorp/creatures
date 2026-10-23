/**
 * Stack (Crate Tower), a team event: every team stacks crates as high as it can at its own spot in a
 * fixed time, every team at once, so the show is as long with 4 teams as with 16.
 *
 * - A team is one column: its tower (`tower:<i>`, f = crates), its climber standing on top, its holder
 *   at the base and its fetcher bringing crates from the pile.
 * - Jobs (what the show draws): the climber is the member that climbs best (Speed against the
 *   field, and a small creature climbs faster: `smallBp`), the holder the steadiest (HP against the
 *   field with the element and role multipliers: a Guard holds best), the fetcher whoever is left.
 *   Everyone takes a turn: the team's tempo is its members' mean climb and its steadiness their mean
 *   hold. A crate takes `placeCt` plus `perCrateCt` per crate already up (hundredths of a tick at x1).
 * - After each crate the tower may wobble: `wobbleBaseBp`, plus `wobblePerCrateBp` for each crate over
 *   its safe height (`safeCrates` times the team's steadiness), cut by `rootBp` for each `rootElement`
 *   member (Grove roots it). A wobble holds by `steadyBaseBp` times the steadiness; a Sidestep line
 *   hops clear, a Stubborn one catches the crate once. Else the top crates topple (`toppleMin` to
 *   `toppleMax`) and may knock a neighbour's top crate off.
 * - The event runs `maxTicks`, whatever happens. Score: the height at the end (crates); at the same
 *   height the tower that got there first ranks first.
 */
import type { GamesEventOf } from '@creatures/game';
import { BP, between, isqrt, jitter, mulBp, pickOne, roll } from './math';
import { gear, keyFactor, tickLimit, type KindInput, type KindOutcome } from './common';
import { columnOrder, columnXs, memberSpread, membersOf } from './columns';
import type { GamesEntrant } from './types';

type Def = GamesEventOf<'stack'>;

/** The towers' base (the bottom crate's feet), a crate's height in the stack, the crowd at the foot. */
export const STACK_BASE_Y = 94;
export const STACK_CRATE_STEP = 5;
export const STACK_FOOT_Y = 104;
/** The fetcher's pile, below the foot. */
const PILE_Y = 110;
/** Tempo lost for each missing member (a team of fewer than three). */
const SHORT_BP = 1_500;
/** Ticks the team stands after a topple. */
const TOPPLE_TICKS = 2;
const LEAD_GAP = 10;
const LAST_MS = 10_000;
/** Towers this tall or taller get a "{n} crates high" line (once each height). */
const HIGH_FROM = 6;

interface Team {
  members: number[];
  climber: number;
  holder: number | undefined;
  fetcher: number | undefined;
  x: number;
  col: number;
  height: number;
  /** The tick the tower got to its height (an earlier one ranks first at the same height). */
  reachedAt: number;
  /** Progress to the next crate (hundredths of a tick at x1). */
  progress: number;
  tempo: number;
  steady: number;
  roots: number;
  stun: number;
  burst: boolean;
  saved: Set<number>;
}

export function runStack(input: KindInput<Def>): KindOutcome {
  const { def, entrants, rng, show, teamOf, teams: teamCount } = input;
  const p = def.params;
  const n = entrants.length;
  const climb = keyFactor(def, entrants, 'spd', { element: false, role: false });
  const steadiness = keyFactor(def, entrants, 'hp', { small: false });
  const xs = columnXs(teamCount);
  const cols = columnOrder(rng, teamCount);
  const spread = memberSpread(teamCount);
  const teams: Team[] = membersOf(teamOf, teamCount).map((as, ti) => {
    const col = cols[ti] as number;
    const best = (pool: readonly number[], f: readonly number[]): number | undefined =>
      pool.reduce<number | undefined>(
        (b, a) => (b === undefined || (f[a] as number) > (f[b] as number) ? a : b),
        undefined,
      );
    const climber = best(as, climb) as number;
    const holder = best(
      as.filter((a) => a !== climber),
      steadiness,
    );
    const fetcher = as.find((a) => a !== climber && a !== holder);
    // Everyone climbs a turn and everyone leans on the base: the team's means.
    const mean = (f: readonly number[]): number =>
      Math.floor(as.reduce((sum, a) => sum + (f[a] as number), 0) / as.length);
    return {
      members: as,
      climber,
      holder,
      fetcher,
      x: xs[col] as number,
      col,
      height: 0,
      reachedAt: 0,
      progress: 0,
      tempo: mulBp(mean(climb), Math.max(0, BP - (3 - as.length) * SHORT_BP)),
      steady: mean(steadiness),
      roots: Math.min(2, as.filter((a) => entrants[a]?.element === p.rootElement).length),
      stun: 0,
      burst: false,
      saved: new Set<number>(),
    };
  });
  const byCol = [...teams].sort((u, v) => u.col - v.col);
  const starts: { x: number; y: number }[] = new Array<{ x: number; y: number }>(n);
  const topY = (t: Team): number => STACK_BASE_Y - t.height * STACK_CRATE_STEP;
  const holderX = (t: Team): number => t.x - spread;
  const fetcherX = (t: Team): number => t.x + spread;
  const tower = (tick: number, t: Team): void => {
    show.prop(tick, `tower:${String(teams.indexOf(t))}`, t.x, STACK_BASE_Y, t.height);
  };
  const scoreAll = (tick: number, t: Team): void => {
    for (const a of t.members) show.score(tick, a, t.height);
  };
  for (const t of teams) {
    starts[t.climber] = { x: t.x, y: STACK_FOOT_Y };
    show.place(t.climber, t.x, STACK_FOOT_Y);
    if (t.holder !== undefined) {
      starts[t.holder] = { x: holderX(t), y: STACK_FOOT_Y };
      show.place(t.holder, holderX(t), STACK_FOOT_Y);
    }
    if (t.fetcher !== undefined) {
      starts[t.fetcher] = { x: fetcherX(t), y: STACK_FOOT_Y };
      show.place(t.fetcher, fetcherX(t), STACK_FOOT_Y);
    }
    for (const a of t.members) show.state(0, a, 'idle');
    tower(0, t);
  }
  show.say(0, 'stack.start');

  const highSaid = new Set<number>();
  const topple = (tick: number, t: Team): void => {
    const k = Math.min(t.height, between(rng, p.toppleMin, p.toppleMax));
    show.fx(tick, 'bonk', { x: t.x, y: topY(t) - 4 }, true);
    t.height -= k;
    t.reachedAt = tick;
    t.progress = 0;
    t.stun = TOPPLE_TICKS;
    t.burst = false;
    tower(tick, t);
    scoreAll(tick, t);
    // The climber tumbles down onto what is left.
    show.pos(tick, t.climber, t.x, topY(t));
    show.state(tick, t.climber, 'dizzy');
    show.say(tick, 'stack.topple', { a: t.climber });
    if (!roll(rng, p.knockChanceBp)) return;
    const near = [byCol[t.col - 1], byCol[t.col + 1]].filter(
      (o): o is Team => o !== undefined && o.height > 0,
    );
    if (near.length === 0) return;
    const o = pickOne(rng, near);
    show.fx(tick, 'bonk', { x: o.x, y: topY(o) - 4 }, true);
    o.height -= 1;
    o.reachedAt = tick;
    o.progress = 0;
    tower(tick, o);
    scoreAll(tick, o);
    show.pos(tick, o.climber, o.x, topY(o));
    show.say(tick, 'stack.knock', { a: t.climber, b: o.climber });
  };

  const wobble = (tick: number, t: Team): void => {
    // Safe up to the base's height (more with a steadier base), then each crate wobbles it more.
    const safe = Math.floor((p.safeCrates * t.steady) / BP);
    let chance = p.wobbleBaseBp + Math.max(0, t.height - safe) * p.wobblePerCrateBp;
    chance = mulBp(chance, Math.max(0, BP - t.roots * p.rootBp));
    if (!roll(rng, chance)) {
      // A rooted tower that would have wobbled: the Grove member gets the credit, now and then.
      if (t.roots > 0 && t.height >= 4 && roll(rng, 1_500)) {
        const g = t.members.find((a) => entrants[a]?.element === p.rootElement);
        if (g !== undefined) {
          show.fx(tick, 'heal', { a: g }, true);
          show.say(tick, 'stack.root', { a: g });
        }
      }
      return;
    }
    const holder = t.holder ?? t.climber;
    const e = entrants[t.climber] as GamesEntrant;
    if (roll(rng, mulBp(p.steadyBaseBp, t.steady))) {
      show.fx(tick, 'shield', { a: holder }, true);
      show.say(tick, 'stack.steady', { a: holder });
      if (roll(rng, gear(e, 'momentumBp') + gear(e, 'riposteBp'))) {
        t.burst = true;
        show.fx(tick, 'star', { a: t.climber }, true);
      }
      return;
    }
    if (roll(rng, gear(e, 'sidestepBp'))) {
      show.fx(tick, 'hop', { a: t.climber }, true);
      show.say(tick, 'stack.dodge', { a: t.climber });
      return;
    }
    const catcher = t.members.find(
      (a) => gear(entrants[a] as GamesEntrant, 'stubborn') > 0 && !t.saved.has(a),
    );
    if (catcher !== undefined) {
      t.saved.add(catcher);
      show.fx(tick, 'star', { a: catcher }, true);
      show.say(tick, 'stack.catch', { a: catcher });
      return;
    }
    topple(tick, t);
  };

  const cap = tickLimit(def, n);
  const lastAt = cap - Math.ceil(LAST_MS / def.tickMs);
  let leader: Team | undefined;
  let leadSaidAt = Number.NEGATIVE_INFINITY;
  for (let tick = 1; tick <= cap; tick++) {
    for (const t of teams) {
      if (t.stun > 0) {
        t.stun -= 1;
        if (t.stun === 0) show.state(tick, t.climber, 'idle');
        continue;
      }
      const need = p.placeCt + t.height * p.perCrateCt;
      let step = mulBp(mulBp(100, t.tempo), jitter(rng, p.jitterBp));
      if (t.burst) step = mulBp(step, p.burstBp);
      t.progress += step;
      // The fetcher brings the crate up from the pile as the climber gets ready.
      if (t.fetcher !== undefined && tick % 2 === 0) {
        const half = t.progress * 2 < need;
        show.pos(tick, t.fetcher, fetcherX(t), half ? PILE_Y : STACK_FOOT_Y);
        show.state(tick, t.fetcher, 'run');
      }
      if (t.progress < need) continue;
      t.progress = 0;
      t.burst = false;
      if (t.height >= p.maxCrates) continue;
      t.height += 1;
      t.reachedAt = tick;
      tower(tick, t);
      scoreAll(tick, t);
      show.pos(tick, t.climber, t.x, topY(t));
      show.state(tick, t.climber, 'run');
      show.fx(tick, 'hop', { a: t.climber }, true);
      if (t.height >= HIGH_FROM && !highSaid.has(t.height)) {
        highSaid.add(t.height);
        show.say(tick, 'stack.high', { a: t.climber, n: t.height });
      } else {
        show.say(tick, 'stack.place', { a: t.climber });
      }
      wobble(tick, t);
    }
    if (teams.length > 1 && tick > 8) {
      const lead = teams.reduce((b, x) => (x.height > b.height ? x : b), teams[0] as Team);
      if (lead !== leader && lead.height > (leader?.height ?? -1)) {
        if (leader !== undefined && tick - leadSaidAt >= LEAD_GAP) {
          leadSaidAt = tick;
          show.say(tick, 'stack.lead', { a: lead.climber });
        }
        leader = lead;
      }
    }
    if (tick === lastAt && lastAt > 10) show.say(tick, 'stack.last');
  }

  const scores = new Array<number>(n).fill(0);
  const keys: number[][] = new Array<number[]>(n);
  for (const t of teams) {
    if (t.fetcher !== undefined) show.pos(cap, t.fetcher, fetcherX(t), STACK_FOOT_Y);
    for (const a of t.members) {
      show.state(cap, a, 'idle');
      scores[a] = t.height;
      keys[a] = [t.height, -t.reachedAt];
      show.score(cap, a, t.height);
    }
  }
  const outAt: (number | null)[] = new Array<number | null>(n).fill(null);
  return { starts, scores, outAt, keys, end: cap };
}

/** How well a creature fits a stack (before size): climbing (Speed) and holding (HP, element, role). */
export function stackAptitude(
  def: Def,
  e: GamesEntrant,
  s: { hp: number; atk: number; spd: number },
): number {
  const p = def.params;
  const m = e.mods ?? {};
  const hold = mulBp(mulBp(s.hp, def.elementBp[e.element]), def.roleBp?.[e.role] ?? BP);
  // The hold counts most (it sets how high a tower stays up), the climb a quarter: spd^0.25 x hold^0.75.
  let f = isqrt(isqrt(s.spd * hold) * hold);
  if (e.element === p.rootElement) f = mulBp(f, BP + Math.floor(p.rootBp / 4));
  f = mulBp(
    f,
    BP +
      Math.floor(((m.sidestepBp ?? 0) + (m.momentumBp ?? 0)) / 10) +
      (m.stubborn === 1 ? 600 : 0),
  );
  return f;
}
