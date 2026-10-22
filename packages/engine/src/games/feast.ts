/**
 * Feast (Pepper Panic, Berry Bonanza): every round everyone eats a pepper of a drawn heat; the heat
 * over the eater's tolerance (HP against the field, element, role) fills its meter. A crit is a double
 * gulp (two peppers, twice the heat); Echo sneaks an extra one. At a full meter the eater bursts into
 * flames and scorches its neighbours, which can set off a chain. Score = peppers eaten; who lasted
 * longer breaks a tie.
 */
import { pickWeighted, type GamesEventOf } from '@creatures/game';
import { BP, jitter, mulBp, roll, shuffle } from './math';
import {
  decided,
  gear,
  keyFactor,
  seatRows,
  teamsAlive,
  type KindInput,
  type KindOutcome,
} from './common';

type Def = GamesEventOf<'feast'>;

const TABLES = [56, 88] as const;
const FULL = BP;
const PEPPER_ABOVE = 12;

export function runFeast(input: KindInput<Def>): KindOutcome {
  const { def, entrants, rng, show, teamOf, teams } = input;
  const p = def.params;
  const n = entrants.length;
  const order = shuffle(
    rng,
    [...new Set(teamOf)].map((t) => teamOf.flatMap((tt, a) => (tt === t ? [a] : []))),
  ).flat();
  const seats = seatRows(n, TABLES, 24, 18, 144);
  const seatOf: { x: number; y: number; row: number; col: number }[] = new Array<{
    x: number;
    y: number;
    row: number;
    col: number;
  }>(n);
  const at: (number | undefined)[][] = TABLES.map(() => []);
  order.forEach((a, i) => {
    const s = seats[i] as { x: number; y: number; row: number; col: number };
    seatOf[a] = s;
    (at[s.row] as (number | undefined)[])[s.col] = a;
  });
  const beside = (a: number): number[] => {
    const s = seatOf[a] as { row: number; col: number };
    return [at[s.row]?.[s.col - 1], at[s.row]?.[s.col + 1]].filter(
      (b): b is number => b !== undefined,
    );
  };
  const starts = seatOf.map((s) => ({ x: s.x, y: s.y }));
  starts.forEach((s, a) => {
    show.place(a, s.x, s.y);
    show.state(0, a, 'eat');
  });
  const tol = keyFactor(def, entrants, 'hp');
  const meter = new Array<number>(n).fill(0);
  const score = new Array<number>(n).fill(0);
  const alive = new Array<boolean>(n).fill(true);
  const outAt: (number | null)[] = new Array<number | null>(n).fill(null);
  const saved = new Array<boolean>(n).fill(false);
  const tiers = [
    { tier: 0, bp: p.mildBp, weight: p.mildWeight },
    { tier: 1, bp: p.hotBp, weight: p.hotWeight },
    { tier: 2, bp: p.ghostBp, weight: p.ghostWeight },
  ];
  const add = (a: number, bp: number): void => {
    meter[a] = Math.max(0, (meter[a] as number) + Math.floor((bp * BP) / (tol[a] as number)));
  };
  show.say(0, 'feast.start');

  let end = 0;
  let round = 0;
  let duelSaid = false;
  let encore = false;
  for (let t = 1; t <= def.maxTicks; t++) {
    end = t;
    if (t % p.roundTicks !== 0) continue;
    round += 1;
    const ramp = (BP + p.rampBp * round) * (encore ? 2 : 1);
    const ghost = round > 3 && roll(rng, p.ghostRoundBp);
    if (ghost) {
      show.say(t, 'feast.ghost');
      show.moments += 1;
    }
    for (const a of order) {
      if (!alive[a]) continue;
      const e = entrants[a];
      if (e === undefined) continue;
      const pick = ghost ? (tiers[2] as (typeof tiers)[number]) : pickWeighted(rng, tiers);
      const s = seatOf[a] as { x: number; y: number };
      show.prop(t, `pepper:${String(a)}`, s.x, s.y - PEPPER_ABOVE, pick.tier);
      let heat = mulBp(mulBp(pick.bp, ramp), jitter(rng, p.jitterBp));
      let eaten = 1;
      if (roll(rng, mulBp(e.critBp, p.critShareBp))) {
        eaten = 2;
        heat *= 2;
        show.fx(t, 'gulp', { a }, true);
        show.say(t, 'feast.gulp', { a });
      }
      if (roll(rng, mulBp(gear(e, 'echoBp'), p.echoShareBp))) {
        eaten += 1;
        heat += mulBp(p.mildBp, ramp);
        show.fx(t, 'star', { a }, true);
        show.say(t, 'feast.echo', { a });
      }
      add(a, heat);
      score[a] = (score[a] as number) + eaten;
      if (e.element === p.coolElement && p.coolBp > 0) {
        meter[a] = Math.max(0, (meter[a] as number) - p.coolBp);
        if (pick.tier === 2) {
          show.fx(t, 'chill', { a }, true);
          show.say(t, 'feast.cool', { a });
        }
      }
      if (roll(rng, gear(e, 'secondWindBp'))) {
        meter[a] = Math.max(0, (meter[a] as number) - p.secondWindBp);
        show.fx(t, 'heal', { a }, true);
      }
      if (roll(rng, p.burpChanceBp)) {
        show.fx(t, 'burp', { a }, true);
        show.say(t, 'feast.burp', { a });
      }
      show.score(t, a, score[a]);
    }

    // Bursts, and the chains they set off along the table.
    for (;;) {
      const full = order.find((a) => alive[a] && (meter[a] as number) >= FULL);
      if (full === undefined) break;
      const e = entrants[full];
      if (e !== undefined && gear(e, 'stubborn') > 0 && !saved[full]) {
        saved[full] = true;
        meter[full] = p.stubbornBackBp;
        show.fx(t, 'star', { a: full }, true);
        show.say(t, 'feast.stubborn', { a: full });
        continue;
      }
      alive[full] = false;
      outAt[full] = t;
      show.meter(t, full, FULL);
      show.fx(t, 'flame', { a: full }, true);
      show.state(t, full, 'flame');
      show.out(t, full, 'burst');
      show.say(t, 'feast.burst', { a: full });
      show.state(t + 3, full, 'out');
      for (const b of beside(full)) {
        if (!alive[b]) continue;
        const be = entrants[b];
        if (
          be !== undefined &&
          roll(rng, gear(be, 'sidestepBp') + mulBp(be.dodgeBp, p.dodgeShareBp))
        ) {
          show.fx(t, 'duck', { a: b }, true);
          continue;
        }
        add(b, p.scorchBp);
        show.fx(t, 'flame', { a: b });
        show.say(t, 'feast.scorch', { a: full, b });
      }
    }
    for (const a of order) {
      if (!alive[a]) continue;
      show.meter(t, a, meter[a] as number);
      show.state(t, a, (meter[a] as number) >= 6_000 ? 'sweat' : 'eat');
    }
    const living = order.filter((a) => alive[a]);
    if (!duelSaid && n > 2 && living.length === 2 && teamsAlive(alive, teamOf) === 2) {
      duelSaid = show.say(t, 'feast.duel', { a: living[0] as number, b: living[1] as number });
    }
    if (round % 6 === 0 && living.length > 0) {
      const lead = [...living].sort(
        (x, y) => (score[y] as number) - (score[x] as number) || x - y,
      )[0] as number;
      show.say(t, 'feast.lead', { a: lead, n: score[lead] as number });
    }
    // The last team standing eats on, faster and hotter, until it bursts too: outlasting everyone
    // usually means the most peppers.
    if (!alive.some((on) => on)) break;
    if (!encore && decided(alive, teamOf, teams)) {
      encore = true;
      show.sayNext(t, 'feast.encore', { a: living[0] as number });
    }
  }

  const keys = entrants.map((_, a) => [score[a] as number, outAt[a] ?? end + 1]);
  for (let a = 0; a < n; a++) show.score(end, a, score[a] as number);
  return { starts, scores: score, outAt, keys, end };
}
