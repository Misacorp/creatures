/**
 * Kite (Kite Flight), a team event: every team runs along the hillside and flies one kite in a fixed
 * time, every team at once, so the show is as long with 4 teams as with 16.
 *
 * - A team is one column: its members on the ground (the first holds the string, at the back), its
 *   kite in the sky above them (`kite:<i>`, x and y of the kite, f 1 while it is tumbling).
 * - Each tick the kite climbs by the team's lift (its members' Speed against the field with the
 *   element and role multipliers, the mean; Spark brings the wind) and sinks by `dragBp` of its
 *   height, so it settles where its lift holds it, at most `maxHeightPx` up.
 * - A gust may pull a kite down (`gustDropPx`) unless the anchor holds the line (`anchorBaseBp`, and
 *   `anchorBp` for each Guard or `anchorElement` member, at most two); a Stubborn line grabs it back
 *   once. Lightning now and then strikes the highest kite of a team with a `boltElement` member (an
 *   anchor halves the drop). Two neighbouring kites close together may tangle unless a member dodges
 *   (its dodge, a Sidestep line): both drop and stop climbing for `stunTicks`.
 * - The event runs `maxTicks`, whatever happens. Score: the height at the end (4 px a metre).
 */
import type { GamesEventOf } from '@creatures/game';
import { BP, jitter, mulBp, pickOne, roll, sinU } from './math';
import { gear, keyFactor, tickLimit, type KindInput, type KindOutcome } from './common';
import { columnOrder, columnXs, memberSpread, membersOf } from './columns';
import type { GamesEntrant } from './types';

type Def = GamesEventOf<'kite'>;

/** Where a kite flies at height 0 (its centre), the string holder's feet and the others' (scene px). */
export const KITE_REST_Y = 84;
export const KITE_HOLDER_Y = 98;
export const KITE_CREW_Y = 106;
export const KITE_PX_PER_METRE = 4;
/** Kite frames (`prop` f): flying, tumbling (struck, gusted or tangled). */
export const KITE_FLY = 0;
export const KITE_TUMBLE = 1;
const SHORT_BP = 1_500;
const LEAD_GAP = 10;
const LAST_MS = 10_000;
/** A kite at this share of the sky's top touches the clouds (said once a show). */
const HIGH_SHARE_BP = 9_000;

interface Team {
  members: number[];
  x: number;
  col: number;
  /** Height over the rest position (hundredths of a px). */
  h: number;
  lift: number;
  anchors: number;
  anchor: number | undefined;
  spark: number | undefined;
  stun: number;
  burst: number;
  saved: Set<number>;
}

export function runKite(input: KindInput<Def>): KindOutcome {
  const { def, entrants, rng, show, teamOf, teams: teamCount } = input;
  const p = def.params;
  const n = entrants.length;
  const factor = keyFactor(def, entrants, 'spd');
  const xs = columnXs(teamCount);
  const cols = columnOrder(rng, teamCount);
  const spread = memberSpread(teamCount);
  const isAnchor = (e: GamesEntrant): boolean =>
    e.role === 'guard' || e.element === p.anchorElement;
  const teams: Team[] = membersOf(teamOf, teamCount).map((as, ti) => {
    const col = cols[ti] as number;
    const es = as.map((a) => entrants[a] as GamesEntrant);
    const mean = Math.floor(as.reduce((s, a) => s + (factor[a] as number), 0) / as.length);
    return {
      members: as,
      x: xs[col] as number,
      col,
      h: 0,
      lift: mulBp(mean, Math.max(0, BP - (3 - as.length) * SHORT_BP)),
      anchors: Math.min(2, es.filter(isAnchor).length),
      anchor: as.find((a) => isAnchor(entrants[a] as GamesEntrant)),
      spark: as.find((a) => entrants[a]?.element === p.boltElement),
      stun: 0,
      burst: 0,
      saved: new Set<number>(),
    };
  });
  const byCol = [...teams].sort((u, v) => u.col - v.col);
  const holder = (t: Team): number => t.members[0] as number;
  const metres = (t: Team): number => Math.floor(t.h / (100 * KITE_PX_PER_METRE));
  const kiteAt = (tick: number, t: Team): { x: number; y: number } => ({
    x: t.x + Math.trunc((sinU(tick * 90 + t.col * 1_300) * 2) / BP),
    y: KITE_REST_Y - Math.floor(t.h / 100),
  });
  const kite = (tick: number, t: Team): void => {
    const at = kiteAt(tick, t);
    show.prop(
      tick,
      `kite:${String(teams.indexOf(t))}`,
      at.x,
      at.y,
      t.stun > 0 ? KITE_TUMBLE : KITE_FLY,
    );
  };
  const scoreAll = (tick: number, t: Team): void => {
    for (const a of t.members) show.score(tick, a, metres(t));
  };
  const starts: { x: number; y: number }[] = new Array<{ x: number; y: number }>(n);
  for (const t of teams) {
    t.members.forEach((a, k) => {
      const x = k === 0 ? t.x : t.x + (k === 1 ? -spread : spread);
      const y = k === 0 ? KITE_HOLDER_Y : KITE_CREW_Y;
      starts[a] = { x, y };
      show.place(a, x, y);
      show.state(0, a, 'run');
    });
    kite(0, t);
  }
  show.say(0, 'kite.start');

  const drop = (tick: number, t: Team, px: number): void => {
    t.h = Math.max(0, t.h - px * 100);
    t.stun = Math.max(t.stun, p.stunTicks);
    t.burst = 0;
    kite(tick, t);
    scoreAll(tick, t);
  };
  /** A Stubborn member grabs the line back once instead of a drop; whether one did. */
  const grab = (tick: number, t: Team): boolean => {
    const g = t.members.find(
      (a) => gear(entrants[a] as GamesEntrant, 'stubborn') > 0 && !t.saved.has(a),
    );
    if (g === undefined) return false;
    t.saved.add(g);
    show.fx(tick, 'star', { a: g }, true);
    show.say(tick, 'kite.catch', { a: g });
    return true;
  };

  const top = p.maxHeightPx * 100;
  const cap = tickLimit(def, n);
  const lastAt = cap - Math.ceil(LAST_MS / def.tickMs);
  let highSaid = false;
  let leader: Team | undefined;
  let leadSaidAt = Number.NEGATIVE_INFINITY;
  for (let tick = 1; tick <= cap; tick++) {
    for (const t of teams) {
      if (t.stun > 0) {
        t.stun -= 1;
      } else {
        let climb = mulBp(mulBp(p.liftCpx, t.lift), jitter(rng, p.jitterBp));
        if (t.burst > 0) {
          t.burst -= 1;
          climb = mulBp(climb, p.burstBp);
        }
        t.h += climb;
      }
      t.h = Math.max(0, Math.min(top, t.h - mulBp(t.h, p.dragBp)));
      // A gust: the anchor holds the line, or the kite dips.
      if (t.h > 0 && roll(rng, p.gustChanceBp)) {
        const at = kiteAt(tick, t);
        show.fx(tick, 'shove', { x: at.x, y: at.y }, true);
        if (roll(rng, p.anchorBaseBp + t.anchors * p.anchorBp)) {
          const a = t.anchor ?? holder(t);
          show.fx(tick, 'shield', { a }, true);
          show.say(tick, 'kite.hold', { a });
          const e = entrants[a] as GamesEntrant;
          if (roll(rng, gear(e, 'momentumBp') + gear(e, 'riposteBp'))) {
            t.burst = 2;
            show.fx(tick, 'star', { a }, true);
          }
        } else if (!grab(tick, t)) {
          show.say(tick, 'kite.gust', { a: holder(t) });
          drop(tick, t, p.gustDropPx);
        }
      }
    }
    // Lightning finds the highest kite flown by a Spark crew.
    if (roll(rng, p.boltChanceBp)) {
      const sparks = teams.filter((t) => t.spark !== undefined && t.h > 0 && t.stun === 0);
      const hit = sparks.reduce<Team | undefined>(
        (b, t) => (b === undefined || t.h > b.h ? t : b),
        undefined,
      );
      if (hit !== undefined) {
        const at = kiteAt(tick, hit);
        show.fx(tick, 'zap', { x: at.x, y: at.y }, true);
        show.fx(tick, 'zap', { a: hit.spark as number });
        show.say(tick, 'kite.zap', { a: hit.spark as number });
        const held = roll(rng, p.anchorBaseBp + hit.anchors * p.anchorBp);
        drop(tick, hit, held ? Math.floor(p.boltDropPx / 2) : p.boltDropPx);
      }
    }
    // Neighbouring kites close together may tangle.
    for (let c = 0; c + 1 < byCol.length; c++) {
      const u = byCol[c] as Team;
      const w = byCol[c + 1] as Team;
      if (u.stun > 0 || w.stun > 0 || u.h === 0 || w.h === 0) continue;
      if (Math.abs(u.h - w.h) > p.tangleRangePx * 100) continue;
      if (!roll(rng, p.tangleChanceBp)) continue;
      const m = pickOne(rng, [...u.members, ...w.members]);
      const e = entrants[m] as GamesEntrant;
      if (roll(rng, mulBp(e.dodgeBp, p.dodgeShareBp) + gear(e, 'sidestepBp'))) {
        show.fx(tick, 'hop', { a: m }, true);
        show.say(tick, 'kite.dodge', { a: m });
        continue;
      }
      const ua = kiteAt(tick, u);
      const wa = kiteAt(tick, w);
      show.fx(
        tick,
        'bonk',
        { x: Math.floor((ua.x + wa.x) / 2), y: Math.floor((ua.y + wa.y) / 2) },
        true,
      );
      show.say(tick, 'kite.tangle', { a: holder(u), b: holder(w) });
      drop(tick, u, p.tangleDropPx);
      drop(tick, w, p.tangleDropPx);
    }
    for (const t of teams) {
      if (tick % 2 === 0) kite(tick, t);
      scoreAll(tick, t);
      if (!highSaid && t.h >= mulBp(top, HIGH_SHARE_BP)) {
        highSaid = true;
        show.say(tick, 'kite.high', { a: holder(t) });
      }
    }
    if (teams.length > 1 && tick > 8) {
      const lead = teams.reduce((b, x) => (x.h > b.h ? x : b), teams[0] as Team);
      if (lead !== leader) {
        if (leader !== undefined && tick - leadSaidAt >= LEAD_GAP) {
          leadSaidAt = tick;
          show.say(tick, 'kite.lead', { a: holder(lead) });
        }
        leader = lead;
      }
    }
    if (tick === lastAt && lastAt > 10) show.say(tick, 'kite.last');
  }

  const scores = new Array<number>(n).fill(0);
  const keys: number[][] = new Array<number[]>(n);
  for (const t of teams) {
    kite(cap, t);
    for (const a of t.members) {
      show.state(cap, a, 'idle');
      scores[a] = metres(t);
      keys[a] = [t.h];
      show.score(cap, a, metres(t));
    }
  }
  const outAt: (number | null)[] = new Array<number | null>(n).fill(null);
  return { starts, scores, outAt, keys, end: cap };
}

/** How well a creature fits a kite (before size): Speed, the wind, a dodge, an anchor. */
export function kiteAptitude(
  def: Def,
  e: GamesEntrant,
  s: { hp: number; atk: number; spd: number },
): number {
  const p = def.params;
  const m = e.mods ?? {};
  let f = mulBp(mulBp(s.spd, def.elementBp[e.element]), def.roleBp?.[e.role] ?? BP);
  f = mulBp(
    f,
    BP +
      mulBp(mulBp(e.dodgeBp, p.dodgeShareBp), mulBp(p.tangleChanceBp, 20_000)) +
      Math.floor((m.sidestepBp ?? 0) / 10) +
      (m.stubborn === 1 ? 300 : 0),
  );
  if (e.role === 'guard' || e.element === p.anchorElement) f = mulBp(f, 10_300);
  return f;
}
