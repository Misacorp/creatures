/**
 * Chase (Melon Run): a giant watermelon rolls in from the left and speeds up. Runners advance by
 * Speed against the field (element, role, a little luck) and meet obstacles: a dodge roll hops them,
 * else a stumble costs a tick or two. A caught runner is squashed flat, unless it is small and ducks
 * under the rind (once) or is Stubborn (once). Score = metres run (8 px a metre).
 */
import type { GamesEventOf } from '@creatures/game';
import { between, jitter, mulBp, roll, shuffle } from './math';
import { gear, keyFactor, type KindInput, type KindOutcome } from './common';

type Def = GamesEventOf<'chase'>;

const MELON_Y = 74;
const MELON_R = 16;
const PX_PER_METRE = 8;

export function runChase(input: KindInput<Def>): KindOutcome {
  const { def, entrants, rng, show } = input;
  const p = def.params;
  const n = entrants.length;
  const lanes = shuffle(
    rng,
    entrants.map((_, a) => a),
  );
  const starts: { x: number; y: number }[] = new Array<{ x: number; y: number }>(n);
  const xc = new Array<number>(n).fill(0);
  const startXc = new Array<number>(n).fill(0);
  const yOf = new Array<number>(n).fill(0);
  lanes.forEach((a, lane) => {
    const y = n === 1 ? MELON_Y : 48 + Math.floor((lane * 52) / (n - 1));
    const x = 48 + between(rng, 0, 16);
    starts[a] = { x, y };
    xc[a] = x * 100;
    startXc[a] = x * 100;
    yOf[a] = y;
    show.place(a, x, y);
    show.state(0, a, 'run');
  });
  const speed = keyFactor(def, entrants, 'spd');
  const alive = new Array<boolean>(n).fill(true);
  const outAt: (number | null)[] = new Array<number | null>(n).fill(null);
  const stunned = new Array<number>(n).fill(0);
  const burst = new Array<boolean>(n).fill(false);
  const ducked = new Array<boolean>(n).fill(false);
  const saved = new Array<boolean>(n).fill(false);
  let melon = p.melonStartPx * 100;
  show.prop(0, 'melon', p.melonStartPx, MELON_Y, MELON_R * 2);
  show.say(0, 'chase.start');
  const metres = (a: number): number =>
    Math.max(0, Math.floor(((xc[a] as number) - (startXc[a] as number)) / (100 * PX_PER_METRE)));

  let end = 0;
  let lastSaid = false;
  for (let t = 1; t <= def.maxTicks; t++) {
    end = t;
    melon += p.melonCpx + p.melonAccelCpx * t;
    show.prop(t, 'melon', Math.floor(melon / 100), MELON_Y, MELON_R * 2);
    if (t % 30 === 0) show.say(t, 'chase.faster');

    for (let a = 0; a < n; a++) {
      if (!alive[a]) continue;
      const e = entrants[a];
      if (e === undefined) continue;
      if ((stunned[a] as number) > 0) {
        stunned[a] = (stunned[a] as number) - 1;
        if (stunned[a] === 0) show.state(t, a, 'run');
        continue;
      }
      let mult = jitter(rng, p.jitterBp);
      if (burst[a]) {
        mult = mulBp(mult, p.burstBp);
        burst[a] = false;
      }
      if (roll(rng, p.hopChanceBp)) {
        const hop = p.hopBaseBp + mulBp(e.dodgeBp, p.dodgeShareBp);
        if (roll(rng, hop)) {
          show.fx(t, 'hop', { a });
          if (roll(rng, gear(e, 'momentumBp') + gear(e, 'riposteBp'))) {
            burst[a] = true;
            show.fx(t, 'star', { a }, true);
            show.say(t, 'chase.burst', { a });
          }
        } else if (roll(rng, gear(e, 'sidestepBp'))) {
          show.fx(t, 'hop', { a }, true);
          show.say(t, 'chase.hop', { a });
        } else {
          stunned[a] = between(rng, p.stumbleMinTicks, p.stumbleMaxTicks);
          show.fx(t, 'stumble', { a }, true);
          show.state(t, a, 'dizzy');
          show.say(t, 'chase.stumble', { a });
          continue;
        }
      }
      xc[a] = (xc[a] as number) + mulBp(mulBp(p.runCpx, speed[a] as number), mult);
    }

    // The melon catches up.
    const front = melon + MELON_R * 100;
    for (let a = 0; a < n; a++) {
      if (!alive[a] || (xc[a] as number) > front) continue;
      const e = entrants[a];
      if (e === undefined) continue;
      if (e.stage === 1 && !ducked[a]) {
        ducked[a] = true;
        xc[a] = front + p.aheadPx * 100;
        show.fx(t, 'duck', { a }, true);
        show.say(t, 'chase.duck', { a });
        continue;
      }
      if (gear(e, 'stubborn') > 0 && !saved[a]) {
        saved[a] = true;
        xc[a] = front + p.aheadPx * 100;
        show.fx(t, 'star', { a }, true);
        show.say(t, 'chase.stubborn', { a });
        continue;
      }
      alive[a] = false;
      outAt[a] = t;
      show.pos(t, a, Math.floor((xc[a] as number) / 100), yOf[a] as number);
      show.fx(t, 'squash', { a }, true);
      show.state(t, a, 'flat');
      show.out(t, a, 'squash');
      show.score(t, a, metres(a));
      show.say(t, 'chase.squash', { a });
    }

    const living: number[] = [];
    for (let a = 0; a < n; a++) {
      if (!alive[a]) continue;
      living.push(a);
      // Every other tick is enough for the client to move a runner smoothly.
      if (t % 2 === 0) show.pos(t, a, Math.floor((xc[a] as number) / 100), yOf[a] as number);
      if (t % 10 === 0) show.score(t, a, metres(a));
    }
    if (living.length === 0) break;
    if (!lastSaid && n > 1 && living.length === 1) {
      lastSaid = show.say(t, 'chase.last', { a: living[0] as number });
    } else if (t % 25 === 0 && living.length > 1) {
      const byX = [...living].sort((a, b) => (xc[b] as number) - (xc[a] as number));
      const lead = Math.floor(
        ((xc[byX[0] as number] as number) - (xc[byX[1] as number] as number)) /
          (100 * PX_PER_METRE),
      );
      if (lead >= 2) show.say(t, 'chase.lead', { a: byX[0] as number, n: lead });
    }
  }

  const scores = entrants.map((_, a) => metres(a));
  const keys = entrants.map((_, a) => [(xc[a] as number) - (startXc[a] as number)]);
  for (let a = 0; a < n; a++) {
    show.pos(end, a, Math.floor((xc[a] as number) / 100), yOf[a] as number);
    show.score(end, a, scores[a] as number);
    if (alive[a]) {
      show.state(end + 1, a, 'cheer');
      show.fx(end + 1, 'cheer', { a });
    }
  }
  let best = 0;
  for (let a = 1; a < n; a++) if ((keys[a]?.[0] as number) > (keys[best]?.[0] as number)) best = a;
  if (alive.every((on) => on)) show.closing(end + 1, 'chase.draw');
  else show.closing(end + 1, 'chase.win', { a: best });
  return { starts, scores, outAt, keys, end };
}
