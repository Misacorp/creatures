/**
 * Swim (Shark Derby): laps of an elliptical lake. Swimmers go by Speed against the field (element,
 * role, luck); sharks join over time, swim the other way and bite the nearest swimmer every few ticks:
 * a dodge slips away (and Momentum or Riposte kicks off), else the bite takes stamina over the swimmer's
 * tolerance (HP against the field). No stamina: tossed onto the shore. A Spark swimmer zaps the water
 * and stuns everyone near it. The race ends when `finishers` have finished.
 *
 * Score: hundredths of a lap (a finisher has laps x 100); finishers rank by finish tick, swimmers by
 * distance, the ones out by when they went out.
 */
import { int, type GamesEventOf } from '@creatures/game';
import { BP, TURN, cosU, fieldCurve, jitter, mulBp, roll, sinU } from './math';
import { gear, keyFactor, type KindInput, type KindOutcome } from './common';

type Def = GamesEventOf<'swim'>;

const CX = 96;
const CY = 62;
const RX = 72;
const RY = 34;
const START = 900; // the bottom of the lake, in tenths of a degree
const SHORE_Y = 104;
const SHARK_LANE = -10;

function at(angle: number, lane: number): { x: number; y: number } {
  const rx = RX + lane;
  const ry = RY + Math.trunc((lane * RY) / RX);
  return {
    x: CX + Math.trunc((rx * cosU(angle)) / BP),
    y: CY + Math.trunc((ry * sinU(angle)) / BP),
  };
}

function gap(a: number, b: number): number {
  const d = (((a - b) % TURN) + TURN) % TURN;
  return Math.min(d, TURN - d);
}

export function runSwim(input: KindInput<Def>): KindOutcome {
  const { def, entrants, rng, show } = input;
  const p = def.params;
  const n = entrants.length;
  const goal = p.laps * TURN;
  const laneOf = entrants.map((_, a) => (n === 1 ? 0 : -8 + Math.floor((a * 16) / (n - 1))));
  const speed = keyFactor(def, entrants, 'spd');
  const tol = fieldCurve(
    entrants.map((e) => e.hp),
    p.statBp,
  ).map((v) => Math.max(1, v));
  const progress = new Array<number>(n).fill(0);
  const stamina = new Array<number>(n).fill(BP);
  const alive = new Array<boolean>(n).fill(true);
  const finishedAt: (number | null)[] = new Array<number | null>(n).fill(null);
  const outAt: (number | null)[] = new Array<number | null>(n).fill(null);
  const stunned = new Array<number>(n).fill(0);
  const burst = new Array<number>(n).fill(0);
  const saved = new Array<boolean>(n).fill(false);
  const bittenAt = new Array<number>(n).fill(-99);
  const starts = entrants.map((_, a) => at(START, laneOf[a] as number));
  starts.forEach((s, a) => {
    show.place(a, s.x, s.y);
    show.state(0, a, 'swim');
    show.meter(0, a, BP);
  });
  const sharks: number[] = [];
  const addShark = (t: number): void => {
    // Never right on top of the pack at the start line.
    const angle = START + 900 + int(rng, 1_800);
    sharks.push(angle);
    const s = at(angle, SHARK_LANE);
    show.prop(t, `shark:${String(sharks.length - 1)}`, s.x, s.y);
  };
  for (let i = 0; i < p.sharkStart; i++) addShark(0);
  show.say(0, 'swim.start');
  const swimming = (a: number): boolean => alive[a] === true && finishedAt[a] === null;
  const angleOf = (a: number): number => START + (progress[a] as number);

  let end = 0;
  let finished = 0;
  let leader = -1;
  let lapsSaid = 0;
  for (let t = 1; t <= def.maxTicks; t++) {
    end = t;
    if (t % p.sharkEveryTicks === 0 && sharks.length < p.sharkMax) {
      addShark(t);
      show.say(t, 'swim.shark');
    }
    sharks.forEach((angle, i) => {
      const next = angle - p.sharkUnits;
      sharks[i] = next;
      const s = at(next, SHARK_LANE);
      show.prop(t, `shark:${String(i)}`, s.x, s.y);
    });

    // Swim.
    for (let a = 0; a < n; a++) {
      if (!swimming(a)) continue;
      const e = entrants[a];
      if (e === undefined) continue;
      if ((stunned[a] as number) > 0) {
        stunned[a] = (stunned[a] as number) - 1;
        if (stunned[a] === 0) show.state(t, a, 'swim');
        continue;
      }
      let mult = jitter(rng, p.jitterBp);
      if ((burst[a] as number) > 0) {
        burst[a] = (burst[a] as number) - 1;
        mult = mulBp(mult, p.burstBp);
      }
      const before = Math.floor((progress[a] as number) / TURN);
      progress[a] = Math.min(
        goal,
        (progress[a] as number) + mulBp(mulBp(p.swimUnits, speed[a] as number), mult),
      );
      const lap = Math.floor((progress[a] as number) / TURN);
      if ((progress[a] as number) >= goal) {
        finishedAt[a] = t;
        finished += 1;
        show.score(t, a, p.laps);
        show.state(t, a, 'cheer');
        show.fx(t, 'cheer', { a }, true);
        show.say(t, 'swim.finish', { a });
      } else if (lap > before) {
        show.score(t, a, lap);
        // The first one into a new lap gets a line.
        if (lap > lapsSaid) {
          lapsSaid = lap;
          show.say(t, 'swim.lap', { a, n: lap + 1 });
        }
      }
      if (t % 4 === 0 && roll(rng, gear(e, 'secondWindBp'))) {
        stamina[a] = Math.min(BP, (stamina[a] as number) + p.secondWindBp);
        show.fx(t, 'heal', { a }, true);
      }
    }

    // Zaps.
    for (let a = 0; a < n; a++) {
      if (!swimming(a) || entrants[a]?.element !== p.zapElement || !roll(rng, p.zapChanceBp))
        continue;
      const pa = at(angleOf(a), laneOf[a] as number);
      let hit = 0;
      for (let b = 0; b < n; b++) {
        if (b === a || !swimming(b)) continue;
        const pb = at(angleOf(b), laneOf[b] as number);
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        if (dx * dx + dy * dy > p.zapRangePx * p.zapRangePx) continue;
        stunned[b] = p.stunTicks;
        show.state(t, b, 'dizzy');
        hit += 1;
      }
      show.fx(t, 'zap', { a }, hit > 0);
      if (hit > 0) show.say(t, 'swim.zap', { a });
    }

    // Bites.
    if (t % p.biteEveryTicks === 0) {
      for (const angle of sharks) {
        let target = -1;
        let best = p.biteRangeUnits + 1;
        for (let a = 0; a < n; a++) {
          // A swimmer just bitten gets a moment's peace.
          if (!swimming(a) || t - (bittenAt[a] as number) < 2 * p.biteEveryTicks) continue;
          const d = gap(angleOf(a), angle);
          if (d < best) {
            best = d;
            target = a;
          }
        }
        if (target < 0) continue;
        const e = entrants[target];
        if (e === undefined) continue;
        bittenAt[target] = t;
        if (roll(rng, mulBp(e.dodgeBp, p.dodgeShareBp) + gear(e, 'sidestepBp'))) {
          show.fx(t, 'splash', { a: target }, true);
          show.say(t, 'swim.slip', { a: target });
          if (roll(rng, gear(e, 'momentumBp') + gear(e, 'riposteBp'))) {
            burst[target] = 2;
            show.fx(t, 'star', { a: target }, true);
            show.say(t, 'swim.burst', { a: target });
          }
          continue;
        }
        stamina[target] =
          (stamina[target] as number) -
          Math.floor((mulBp(p.biteBp, jitter(rng, p.jitterBp)) * BP) / (tol[target] as number));
        show.fx(t, 'bonk', { a: target }, true);
        if ((stamina[target] as number) > 0) {
          show.say(t, 'swim.bite', { a: target });
        } else if (gear(e, 'stubborn') > 0 && !saved[target]) {
          saved[target] = true;
          stamina[target] = 1_500;
          show.fx(t, 'star', { a: target }, true);
          show.say(t, 'swim.stubborn', { a: target });
        } else {
          stamina[target] = 0;
          alive[target] = false;
          outAt[target] = t;
          show.meter(t, target, 0);
          show.out(t, target, 'shark');
          show.state(t, target, 'dizzy');
          show.say(t, 'swim.out', { a: target });
          const here = at(angleOf(target), laneOf[target] as number);
          show.pos(t + 2, target, here.x, SHORE_Y);
          show.state(t + 2, target, 'out');
        }
        show.meter(t, target, Math.max(0, stamina[target] as number));
      }
    }

    for (let a = 0; a < n; a++) {
      if (!swimming(a) && finishedAt[a] !== t) continue;
      // Every other tick (and the finish) is enough for the client to move a swimmer smoothly.
      if (t % 2 === 0 || finishedAt[a] === t) {
        const s = at(angleOf(a), laneOf[a] as number);
        show.pos(t, a, s.x, s.y);
      }
    }
    const lead = bestSwimmer();
    if (lead >= 0 && lead !== leader && t > 10 && finished === 0) {
      if (show.say(t, 'swim.lead', { a: lead })) leader = lead;
    }
    if (finished >= Math.min(p.finishers, n)) break;
    if (!entrants.some((_, a) => swimming(a))) break;
  }

  function bestSwimmer(): number {
    let best = -1;
    for (let a = 0; a < n; a++) {
      if (!swimming(a)) continue;
      if (best < 0 || (progress[a] as number) > (progress[best] as number)) best = a;
    }
    return best;
  }

  const scores = progress.map((v) => Math.floor((v * 100) / TURN));
  const keys = entrants.map((_, a) => {
    const f = finishedAt[a];
    if (f !== null && f !== undefined) return [2, -f, 0];
    const o = outAt[a];
    if (o !== null && o !== undefined) return [0, o, progress[a] as number];
    return [1, progress[a] as number, 0];
  });
  for (let a = 0; a < n; a++) {
    show.score(end + 1, a, Math.floor((progress[a] as number) / TURN));
  }
  const winner = keys.reduce((best, k, a) => (cmp(k, keys[best] as number[]) > 0 ? a : best), 0);
  if (finished === 0 && entrants.every((_, a) => alive[a])) show.closing(end + 1, 'swim.draw');
  else show.closing(end + 1, 'swim.win', { a: winner });
  return { starts, scores, outAt, keys, end };
}

function cmp(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
