/**
 * Endure (Sauna Showdown, Frost Bath), solo events: everyone sits on two benches while the heat rises.
 * A creature's meter fills by the heat over its tolerance (HP against the field, element, role); at a
 * full meter it walks out. Guards shelter their bench neighbours, Supports fan them, a ladle of water
 * now and then is Steam for everyone, an Ember creature stokes. Last one in wins; score = ticks lasted.
 */
import { int, type GamesEventOf } from '@creatures/game';
import { BP, between, jitter, mulBp, pickOne, roll, shuffle } from './math';
import {
  decided,
  gear,
  keyFactor,
  seatRows,
  teamsAlive,
  ExitGate,
  tickLimit,
  type KindInput,
  type KindOutcome,
} from './common';

type Def = GamesEventOf<'endure'>;

const BENCHES = [60, 84] as const;
const DOOR = { x: 186, y: 100 } as const;
const THERMO = { x: 12, y: 24 } as const;
const FULL = BP;

export function runEndure(input: KindInput<Def>): KindOutcome {
  const { def, entrants, rng, show, teamOf, teams } = input;
  const p = def.params;
  const n = entrants.length;
  // Everyone side by side on the two benches, in a shuffled order.
  const order = shuffle(
    rng,
    entrants.map((_, a) => a),
  );
  const seats = seatRows(order.length, BENCHES, 40, 17, 136);
  type Seat = { x: number; y: number; row: number; col: number };
  const seatOf: Seat[] = new Array<Seat>(n);
  order.forEach((a, i) => {
    seatOf[a] = seats[i] as Seat;
  });
  const at: (number | undefined)[][] = BENCHES.map(() => []);
  for (let a = 0; a < n; a++) {
    const s = seatOf[a] as Seat;
    (at[s.row] as (number | undefined)[])[s.col] = a;
  }
  /** Who sits within `reach` of it along its bench. */
  const beside = (a: number, reach: number): number[] => {
    const s = seatOf[a] as Seat;
    const out: number[] = [];
    for (let d = -reach; d <= reach; d++) {
      if (d === 0) continue;
      const b = at[s.row]?.[s.col + d];
      if (b !== undefined) out.push(b);
    }
    return out;
  };

  const tol = keyFactor(def, entrants, 'hp');
  const meter = new Array<number>(n).fill(0);
  const alive = new Array<boolean>(n).fill(true);
  const outAt: (number | null)[] = new Array<number | null>(n).fill(null);
  const scores = new Array<number>(n).fill(0);
  const saved = new Array<boolean>(n).fill(false);
  const hot = new Array<boolean>(n).fill(false);
  const starts = seatOf.map((s) => ({ x: s.x, y: s.y }));
  starts.forEach((s, a) => {
    show.place(a, s.x, s.y);
    show.state(0, a, 'idle');
  });
  let heat = p.heatStartBp;
  let extra = 0;
  show.prop(0, 'heat', THERMO.x, THERMO.y, Math.floor(heat / 100));
  show.say(0, 'endure.start');

  const add = (a: number, bp: number): void => {
    if (!alive[a]) return;
    meter[a] = Math.max(0, (meter[a] as number) + Math.floor((bp * BP) / (tol[a] as number)));
  };
  const shelterOf = (a: number): number => {
    const guards = beside(a, 1).filter((b) => alive[b] && entrants[b]?.role === 'guard').length;
    return Math.min(p.shelterMaxBp, guards * p.shelterBp);
  };
  const avoids = (a: number): boolean => {
    const e = entrants[a];
    if (e === undefined) return false;
    return roll(rng, gear(e, 'sidestepBp') + mulBp(e.dodgeBp, p.dodgeShareBp));
  };

  let nextLadle = between(rng, p.ladleMinTicks, p.ladleMaxTicks);
  const gate = new ExitGate(n, def.tickMs);
  let halfSaid = false;
  let duelSaid = false;
  let end = 0;
  for (let t = 1; t <= tickLimit(def, n); t++) {
    end = t;
    hot.fill(false);
    heat = Math.min(FULL, p.heatStartBp + p.heatRiseBp * t + extra);
    const living = (): number[] => alive.flatMap((on, a) => (on ? [a] : []));

    // A ladle of water on the stones.
    if (t >= nextLadle) {
      nextLadle = t + between(rng, p.ladleMinTicks, p.ladleMaxTicks);
      const ladler = pickOne(rng, living());
      const le = entrants[ladler];
      if (le !== undefined && le.element === p.spikeElement) {
        show.fx(t, 'steam', { a: ladler }, true);
        show.say(t, 'endure.steam', { a: ladler });
        let sheltered = false;
        for (const a of living()) {
          if (avoids(a)) {
            show.fx(t, 'duck', { a }, true);
            continue;
          }
          const cut = shelterOf(a);
          if (cut > 0) sheltered = true;
          add(a, mulBp(p.steamBp, BP - cut));
          hot[a] = true;
        }
        if (sheltered) {
          for (const g of living()) {
            if (entrants[g]?.role === 'guard' && beside(g, 1).some((b) => alive[b])) {
              show.fx(t, 'shield', { a: g });
            }
          }
          const g = living().find((a) => entrants[a]?.role === 'guard');
          if (g !== undefined) show.say(t, 'endure.shelter', { a: g });
        }
        // Overload: a zapper beside the splash crackles and its neighbours feel it.
        for (const z of beside(ladler, 1)) {
          if (!alive[z] || entrants[z]?.element !== p.zapElement || p.zapBp <= 0) continue;
          show.fx(t, 'zap', { a: z }, true);
          show.say(t, 'endure.overload', { a: ladler, b: z });
          for (const b of [z, ...beside(z, 1)]) {
            add(b, p.zapBp);
            hot[b] = true;
          }
        }
      } else {
        extra += p.splashHeatBp;
        show.fx(t, 'splash', { a: ladler }, true);
        show.say(t, 'endure.splash', { a: ladler });
      }
    }

    // A stoke of the stove (or, with a negative number, a warm glow for the neighbours).
    const stokers = living().filter((a) => entrants[a]?.element === p.stokeElement);
    if (stokers.length > 0 && p.stokeBp !== 0 && roll(rng, p.stokeChanceBp)) {
      const s = pickOne(rng, stokers);
      show.fx(t, p.stokeBp > 0 ? 'flame' : 'heal', { a: s }, true);
      show.say(t, 'endure.stoke', { a: s });
      for (const b of beside(s, 2)) {
        if (!alive[b]) continue;
        add(b, p.stokeBp);
        if (p.stokeBp > 0) hot[b] = true;
        if (p.stokeBp > 0 && p.wildfireBp > 0 && entrants[b]?.element === p.wildfireElement) {
          show.fx(t, 'flame', { a: b }, true);
          show.say(t, 'endure.wildfire', { a: s, b });
          for (const c of beside(b, 1)) {
            add(c, p.wildfireBp);
            hot[c] = true;
          }
        }
      }
    }

    show.prop(t, 'heat', THERMO.x, THERMO.y, Math.floor(heat / 100));
    for (const a of living()) {
      const e = entrants[a];
      if (e === undefined) continue;
      // The heat itself, sheltered by the Guards beside it.
      const base = mulBp(mulBp(heat, p.intakeBp), jitter(rng, p.jitterBp));
      add(a, mulBp(base, BP - shelterOf(a)));
      // A Support fans a neighbour.
      if (e.role === 'support' && roll(rng, p.fanChanceBp)) {
        const near = beside(a, 1).filter((b) => alive[b] && (meter[b] as number) > 0);
        if (near.length > 0) {
          const b = near[int(rng, near.length)] as number;
          meter[b] = Math.max(0, (meter[b] as number) - p.fanBp);
          show.fx(t, 'heal', { a: b }, true);
          show.say(t, 'endure.fan', { a, b });
        }
      }
      // Second Wind: a breath of cool air every few ticks.
      if (t % 4 === 0 && roll(rng, gear(e, 'secondWindBp'))) {
        meter[a] = Math.max(0, (meter[a] as number) - p.secondWindBp);
        show.fx(t, 'heal', { a }, true);
      }
    }

    // Who has had enough.
    for (const a of living()) {
      if ((meter[a] as number) < FULL) continue;
      const e = entrants[a];
      if (e !== undefined && gear(e, 'stubborn') > 0 && !saved[a]) {
        saved[a] = true;
        meter[a] = p.stubbornBackBp;
        show.fx(t, 'star', { a }, true);
        show.say(t, 'endure.stubborn', { a });
        continue;
      }
      if (!gate.allow(t, alive.filter((on) => on).length)) {
        meter[a] = FULL - 1;
        continue;
      }
      gate.record(t);
      alive[a] = false;
      outAt[a] = t;
      scores[a] = t - 1;
      show.meter(t, a, FULL);
      show.out(t, a, 'heat');
      show.state(t, a, hot[a] ? 'flame' : 'sweat');
      show.say(t, 'endure.out', { a });
      const s = seatOf[a] as { x: number; y: number };
      show.pos(t + 2, a, s.x, DOOR.y);
      show.pos(t + 5, a, DOOR.x, DOOR.y);
      show.state(t + 5, a, 'out');
    }
    for (const a of living()) {
      show.meter(t, a, meter[a] as number);
      if ((meter[a] as number) >= 6_000) show.state(t, a, 'sweat');
      else if ((meter[a] as number) < 4_000) show.state(t, a, 'idle');
    }

    const left = living();
    if (!halfSaid && n >= 4 && left.length * 2 <= n && left.length > 2) {
      halfSaid = true;
      show.say(t, 'endure.half', { n: left.length });
    }
    if (!duelSaid && n > 2 && left.length === 2 && teamsAlive(alive, teamOf) === 2) {
      duelSaid = true;
      show.say(t, 'endure.duel', { a: left[0] as number, b: left[1] as number });
    }
    if (decided(alive, teamOf, teams)) break;
  }

  const keys: number[][] = [];
  for (let a = 0; a < n; a++) {
    if (alive[a]) {
      scores[a] = end;
      keys.push([end, FULL - (meter[a] as number)]);
    } else {
      keys.push([scores[a] as number, 0]);
    }
    show.score(end + 1, a, scores[a] as number);
  }
  return { starts, scores, outAt, keys, end };
}
