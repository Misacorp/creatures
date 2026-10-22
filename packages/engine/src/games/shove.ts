/**
 * Shove (Floe Sumo): everyone stands on an elliptical ice floe that shrinks (faster with Ember creatures
 * on it). Each tick a few creatures shove a near neighbour (one of the two nearest): push (Attack against the field, a little
 * luck) against grip (HP against the field, element, size): the loser slides. A dodge sidesteps and the
 * shover skids instead. Off the edge is a splash, unless a Stubborn creature teeters back (once). Last
 * one on wins; score = ticks on the floe.
 */
import { int, type GamesEventOf } from '@creatures/game';
import { BP, TURN, cosU, isqrt, jitter, mulBp, roll, shuffle, sinU } from './math';
import { decided, gear, keyFactor, teamsAlive, type KindInput, type KindOutcome } from './common';

type Def = GamesEventOf<'shove'>;

const CX = 96;
const CY = 62;
/** The floe's y-radius is this share of its x-radius. */
const FLAT_BP = 5_200;

export function runShove(input: KindInput<Def>): KindOutcome {
  const { def, entrants, rng, show, teamOf, teams } = input;
  const p = def.params;
  const n = entrants.length;
  let rx = p.floeStartPx * 100;
  const ry = (): number => mulBp(rx, FLAT_BP);
  // A fair start: everyone the same way from the middle, on a ring at 60% of the floe, in a random order
  // (one creature alone stands in the middle).
  const order = shuffle(
    rng,
    entrants.map((_, a) => a),
  );
  const xc = new Array<number>(n).fill(0);
  const yc = new Array<number>(n).fill(0);
  order.forEach((a, i) => {
    const r = n === 1 ? 0 : 6_000;
    const ang = Math.floor((i * TURN) / n);
    xc[a] = CX * 100 + Math.trunc((mulBp(rx, r) * cosU(ang)) / BP);
    yc[a] = CY * 100 + Math.trunc((mulBp(ry(), r) * sinU(ang)) / BP);
  });
  const px = (a: number): { x: number; y: number } => ({
    x: Math.round((xc[a] as number) / 100),
    y: Math.round((yc[a] as number) / 100),
  });
  const starts = entrants.map((_, a) => px(a));
  starts.forEach((s, a) => {
    show.place(a, s.x, s.y);
    show.state(0, a, 'idle');
  });
  show.prop(0, 'floe', CX, CY, Math.floor(rx / 100));
  show.say(0, 'shove.start');

  // Push: Attack and role; grip: HP, element and size.
  const pushOf = keyFactor(def, entrants, 'atk', { element: false, small: false });
  const gripOf = keyFactor(def, entrants, 'hp', { role: false });
  const alive = new Array<boolean>(n).fill(true);
  const outAt: (number | null)[] = new Array<number | null>(n).fill(null);
  const saved = new Array<boolean>(n).fill(false);

  /** Moves `a` by `dist` hundredths of a px along the direction from (fx, fy) to it. */
  const slide = (a: number, fx: number, fy: number, dist: number): void => {
    let dx = (xc[a] as number) - fx;
    let dy = (yc[a] as number) - fy;
    if (dx === 0 && dy === 0) {
      const ang = int(rng, TURN);
      dx = cosU(ang);
      dy = sinU(ang);
    }
    const len = Math.max(1, isqrt(dx * dx + dy * dy));
    xc[a] = (xc[a] as number) + Math.trunc((dx * dist) / len);
    yc[a] = (yc[a] as number) + Math.trunc((dy * dist) / len);
  };
  /** How far out it stands: 10000 is on the edge. */
  const edge = (a: number): number => {
    const dx = (xc[a] as number) - CX * 100;
    const dy = (yc[a] as number) - CY * 100;
    const r2x = rx * rx;
    const r2y = ry() * ry();
    return Math.floor((dx * dx * BP) / r2x + (dy * dy * BP) / r2y);
  };

  let end = 0;
  let duelSaid = false;
  let meltSaid = false;
  for (let t = 1; t <= def.maxTicks; t++) {
    end = t;
    const living = (): number[] => order.filter((a) => alive[a]);
    const melters = living().filter((a) => entrants[a]?.element === p.meltElement);
    rx = Math.max(p.floeMinPx * 100, rx - p.shrinkCpx - p.meltCpx * melters.length);
    show.prop(t, 'floe', CX, CY, Math.floor(rx / 100));
    if (!meltSaid && melters.length > 0 && t > 15 && p.meltCpx > 0) {
      meltSaid = show.say(t, 'shove.melt', { a: melters[0] as number });
      if (meltSaid) show.fx(t, 'steam', { a: melters[0] as number });
    }
    if (t % 40 === 0) show.say(t, 'shove.shrink');

    // Everyone waddles back towards the middle a little: the same share of the way from anywhere on
    // the floe (so where it starts on the ring does not matter).
    const frac = Math.floor((p.driftCpx * BP) / Math.max(1, rx));
    for (const a of living()) {
      xc[a] = (xc[a] as number) + mulBp(CX * 100 - (xc[a] as number), frac);
      yc[a] = (yc[a] as number) + mulBp(CY * 100 - (yc[a] as number), frac);
    }

    // A crowd jostles: two creatures closer than `spacePx` push each other apart.
    if (p.spacePx > 0) {
      const space = p.spacePx * 100;
      const here = living();
      const moves = here.map(() => ({ x: 0, y: 0 }));
      for (let i = 0; i < here.length; i++) {
        for (let j = i + 1; j < here.length; j++) {
          const a = here[i] as number;
          const b = here[j] as number;
          const dx = (xc[b] as number) - (xc[a] as number);
          const dy = (yc[b] as number) - (yc[a] as number);
          const d = isqrt(dx * dx + dy * dy);
          if (d >= space) continue;
          // The grippier one holds its ground: each moves by the other's share of the grip.
          // (Squared, so a real difference in grip shows.)
          const ga = Math.floor(((gripOf[a] as number) * (gripOf[a] as number)) / BP);
          const gb = Math.floor(((gripOf[b] as number) * (gripOf[b] as number)) / BP);
          const both = Math.max(1, ga + gb);
          const pushA = Math.floor(((space - d) * gb) / (2 * both));
          const pushB = Math.floor(((space - d) * ga) / (2 * both));
          const ux = d === 0 ? (a < b ? -BP : BP) : Math.trunc((dx * BP) / d);
          const uy = d === 0 ? 0 : Math.trunc((dy * BP) / d);
          const mi = moves[i] as { x: number; y: number };
          const mj = moves[j] as { x: number; y: number };
          mi.x -= mulBp(ux, pushA);
          mi.y -= mulBp(uy, pushA);
          mj.x += mulBp(ux, pushB);
          mj.y += mulBp(uy, pushB);
        }
      }
      here.forEach((a, i) => {
        const m = moves[i] as { x: number; y: number };
        xc[a] = (xc[a] as number) + m.x;
        yc[a] = (yc[a] as number) + m.y;
      });
    }

    // The shoves.
    const now = living();
    const count =
      p.shoveRateBp > 0 ? Math.max(1, Math.floor((now.length * p.shoveRateBp) / BP)) : 0;
    const shovers = shuffle(rng, now).slice(0, count);
    for (const s of shovers) {
      if (!alive[s]) continue;
      const others = living().filter((b) => b !== s);
      if (others.length === 0) break;
      const near = others
        .map((b) => {
          const dx = (xc[b] as number) - (xc[s] as number);
          const dy = (yc[b] as number) - (yc[s] as number);
          return { b, d: dx * dx + dy * dy };
        })
        .sort((u, w) => u.d - w.d || u.b - w.b)
        .slice(0, 2);
      const target = (near[int(rng, near.length)] as { b: number }).b;
      const te = entrants[target];
      if (te === undefined) continue;
      if (roll(rng, mulBp(te.dodgeBp, p.dodgeShareBp) + gear(te, 'sidestepBp'))) {
        show.fx(t, 'hop', { a: target }, true);
        show.fx(t, 'stumble', { a: s });
        show.say(t, 'shove.dodge', { a: s, b: target });
        slide(s, xc[target] as number, yc[target] as number, -p.slidePx * 100);
        if (roll(rng, gear(te, 'momentumBp') + gear(te, 'riposteBp'))) {
          show.fx(t, 'star', { a: target }, true);
          slide(s, xc[target] as number, yc[target] as number, p.slidePx * 100);
        }
        continue;
      }
      const force = mulBp(pushOf[s] as number, jitter(rng, p.jitterBp));
      const grip = mulBp(gripOf[target] as number, jitter(rng, p.jitterBp));
      if (force > grip) {
        const dist = Math.min(p.maxSlidePx * 100, Math.floor((p.slidePx * 100 * force) / grip));
        slide(target, xc[s] as number, yc[s] as number, dist);
        show.fx(t, 'shove', { a: target });
        show.say(t, 'shove.shove', { a: s, b: target });
      } else {
        slide(s, xc[target] as number, yc[target] as number, Math.floor((p.slidePx * 100) / 2));
        show.fx(t, 'bonk', { a: s });
        show.say(t, 'shove.bounce', { a: s, b: target });
      }
    }

    // Off the edge?
    for (const a of living()) {
      if (edge(a) <= BP) continue;
      const e = entrants[a];
      if (e !== undefined && gear(e, 'stubborn') > 0 && !saved[a]) {
        saved[a] = true;
        // Back to 85% of the way out, along the same line.
        const k = isqrt(Math.floor((7_225 * BP * BP) / Math.max(1, edge(a))));
        xc[a] = CX * 100 + mulBp((xc[a] as number) - CX * 100, k);
        yc[a] = CY * 100 + mulBp((yc[a] as number) - CY * 100, k);
        show.fx(t, 'star', { a }, true);
        show.say(t, 'shove.teeter', { a });
        continue;
      }
      alive[a] = false;
      outAt[a] = t;
      slide(a, CX * 100, CY * 100, 600);
      const s = px(a);
      show.pos(t, a, s.x, s.y);
      show.fx(t, 'splash', { a }, true);
      show.out(t, a, 'splash');
      show.state(t, a, 'out');
      show.say(t, 'shove.splash', { a });
    }
    for (const a of living()) {
      const s = px(a);
      show.pos(t, a, s.x, s.y);
      show.state(t, a, edge(a) > 7_000 ? 'sweat' : 'idle');
    }
    const left = living();
    if (!duelSaid && n > 2 && left.length === 2 && teamsAlive(alive, teamOf) === 2) {
      duelSaid = show.say(t, 'shove.duel', { a: left[0] as number, b: left[1] as number });
    }
    if (decided(alive, teamOf, teams)) break;
  }

  const scores = entrants.map((_, a) => {
    const o = outAt[a];
    return o === null || o === undefined ? end : o - 1;
  });
  const keys = entrants.map((_, a) =>
    alive[a] ? [end + 1, BP * 4 - edge(a)] : [scores[a] as number, 0],
  );
  for (let a = 0; a < n; a++) show.score(end + 1, a, scores[a] as number);
  return { starts, scores, outAt, keys, end };
}
