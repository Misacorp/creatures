import type { ChargedPattern, Gimmick, Zone } from '@creatures/game';
import { sweepRow } from './gimmick-schedule';
import { ZONES, nearestLivingZone, zoneIndices, zoneOfIndex, zoneSizes } from './zones';

/**
 * Target selection for the boss's attack patterns (docs/design/attack-patterns.md section 2). Pure:
 * no I/O, no fight state of its own. `fight.ts` hands it the row as it stands and the round's dice,
 * gets back a plan (who is hit, with what power, as which kind of hit) and resolves the plan with
 * its own `hurt()`, so a Guard stepping in, cover, Shield Wall, the single-hit cap and crits stay in
 * one place.
 *
 * Every rule picks LIVING creatures only. A plan is made at one moment (the start of the boss's
 * action; for a charged pattern, in part 2, the announcement round) from the creatures standing
 * then. Slots are creature indices (`idx`) in the fight's row.
 *
 * Dice: a plan reads from `dice`, a window of uniform integers in [0, DICE_RANGE) the fight drew at
 * round start. How many it reads depends on the pattern only (a barrage reads one per shell, a
 * random slam or lance one), never on what the plan found, so the number of dice drawn per round is
 * constant.
 */

/** What target selection needs to know about a creature. */
export interface PatternCreature {
  idx: number;
  id: string;
  atk: number;
  role: string;
  alive: boolean;
}

/** The pattern ops with the fields target selection reads: a gimmick, or the `then` of a charge. */
export type PatternSpec =
  Extract<Gimmick, { op: 'sweep' | 'barrage' | 'slam' | 'lance' | 'pincer' }> | ChargedPattern;

export type HitKind = 'aimed' | 'area';

/** One hit of a plan, in the order the hits land. */
export interface PlannedHit {
  /** The creature (`idx`) the hit is aimed at. For an aimed hit a Guard may take it instead. */
  target: number;
  /** Basis points of boss Attack. */
  powerBp: number;
  kind: HitKind;
}

export interface PatternPlan {
  hits: PlannedHit[];
  /** The creatures picked, in hit order, before any Guard steps in (the `gimmick` event). */
  targets: number[];
  /** A sweep: the rows it hits (after the wiped-row fallback). */
  rows?: Zone[];
  /** A lance: the slot position of the lane in its row. */
  lane?: number;
  /** A slam: the share of the hit's damage that splashes on the creatures beside the impact. */
  splashBp?: number;
  /**
   * A chain: every living creature after the first in strength order (`idx`). Jump k goes to the
   * k-th of these that the chain has not hit yet; the fight resolves it (fights with `rules`),
   * because a Guard that stepped in for the first hit is only known then. `hits` keeps the jumps'
   * powers and the creatures as ranked at plan time.
   */
  chain?: { rest: number[] };
}

/** The dice a fight draws per round for patterns, and the window each gimmick reads from. */
export const PATTERN_DICE = 40;
export const DICE_WINDOW = 10;
/** The dice are uniform integers in [0, DICE_RANGE). */
export const DICE_RANGE = 1_000_000;

/** The slice of the round's dice that the gimmick at `gimmickIndex` of the boss reads. */
export function diceWindow(dice: readonly number[], gimmickIndex: number): readonly number[] {
  const start = (gimmickIndex % (PATTERN_DICE / DICE_WINDOW)) * DICE_WINDOW;
  return dice.slice(start, start + DICE_WINDOW);
}

export interface PatternContext {
  creatures: readonly PatternCreature[];
  /** The row's length (the creatures array's length). */
  n: number;
  /** How many times the gimmick has fired up to this round (`firingIndex`); a sweep's walk. */
  firing: number;
  /** This gimmick's dice window (`diceWindow`). */
  dice: readonly number[];
  /**
   * Barrage only: the creatures (`idx`) hit by this gimmick's last volley. They are skipped unless
   * fewer than a volley's count of other creatures live.
   */
  previousVolley?: readonly number[];
  /**
   * Fights with `rules` only: the round's Guard dice, one per slot (`fight.ts`, `guardDice`). When
   * several living Guards could take the same hit, the die of the slot the hit is aimed at picks
   * one (`pickGuardWith`). Absent: the first (left-most) Guard, as before.
   */
  guardDice?: readonly number[];
}

function living(ctx: PatternContext): PatternCreature[] {
  return ctx.creatures.filter((c) => c.alive);
}

function livingIn(ctx: PatternContext, zone: Zone): PatternCreature[] {
  return zoneIndices(zone, ctx.n)
    .map((i) => ctx.creatures[i] as PatternCreature)
    .filter((c) => c.alive);
}

/** The living creatures, highest Attack first, ties to the lower slot. */
export function byStrength(creatures: readonly PatternCreature[]): PatternCreature[] {
  return creatures.filter((c) => c.alive).sort((a, b) => b.atk - a.atk || a.idx - b.idx);
}

/** The creature a die picks among `list` (uniformly). */
function pickWith<T>(list: readonly T[], die: number): T | undefined {
  return list[Math.floor((die * list.length) / DICE_RANGE)];
}

/**
 * The one rule for choosing among several Guards that could take a hit on slot `slot`: the first
 * without Guard dice, else the slot's die picks one, uniformly. `fight.ts` uses it for every hit.
 */
export function pickGuardWith<T>(
  candidates: readonly T[],
  slot: number,
  guardDice: readonly number[] | undefined,
): T | undefined {
  if (guardDice === undefined || candidates.length < 2) return candidates[0];
  return pickWith(candidates, guardDice[slot] ?? 0);
}

function area(target: number, powerBp: number): PlannedHit {
  return { target, powerBp, kind: 'area' };
}

function planned(
  hits: PlannedHit[],
  extra: Omit<PatternPlan, 'hits' | 'targets'> = {},
): PatternPlan {
  return { hits, targets: hits.map((h) => h.target), ...extra };
}

/**
 * Sweep: every living creature in one row. `rows` is a walk (`sweepRow`): firing n hits
 * `rows[(n - 1) mod length]`; `all` is every row. A named row with nobody standing falls to the
 * nearest row that has someone (as `hit_zone` does); under `all` a wiped row is simply skipped.
 */
export function planSweep(
  ctx: PatternContext,
  spec: { rows: readonly ('front' | 'middle' | 'back' | 'all')[]; power: number },
): PatternPlan {
  const named = sweepRow(spec.rows, ctx.firing);
  const zones: Zone[] =
    named === 'all'
      ? ZONES.filter((z) => livingIn(ctx, z).length > 0)
      : (() => {
          const z = nearestLivingZone(named, (zone) => livingIn(ctx, zone).length > 0);
          return z === undefined ? [] : [z];
        })();
  const hits = zones.flatMap((z) => livingIn(ctx, z).map((c) => area(c.idx, spec.power)));
  return planned(hits, { rows: zones });
}

/**
 * Barrage: `clamp(ceil(living x shareBp / 10000), min, max)` distinct living creatures by a partial
 * Fisher-Yates shuffle driven by the dice: shell i swaps position i with position
 * `i + floor(dice[i] x (m - i) / DICE_RANGE)` of the m candidates (left to right). Creatures hit by
 * the gimmick's last volley are not candidates, unless fewer than the count others live: then all of
 * the others are hit and the rest are drawn from the previous volley's creatures.
 */
export function planBarrage(
  ctx: PatternContext,
  spec: { shells: { min: number; max: number; shareBp: number }; power: number },
): PatternPlan {
  const alive = living(ctx);
  const { min, max, shareBp } = spec.shells;
  const wanted = Math.min(max, Math.max(min, Math.ceil((alive.length * shareBp) / 10_000)));
  const count = Math.min(wanted, alive.length);
  const previous = new Set(ctx.previousVolley ?? []);
  const others = alive.filter((c) => !previous.has(c.idx));
  const again = alive.filter((c) => previous.has(c.idx));
  const picked: PatternCreature[] = [];
  let die = 0;
  const draw = (pool: PatternCreature[], take: number): void => {
    for (let i = 0; i < take && i < pool.length; i++) {
      const j = i + Math.floor(((ctx.dice[die] ?? 0) * (pool.length - i)) / DICE_RANGE);
      die += 1;
      const a = pool[i] as PatternCreature;
      pool[i] = pool[j] as PatternCreature;
      pool[j] = a;
      picked.push(pool[i] as PatternCreature);
    }
  };
  draw(others, count);
  if (picked.length < count) draw(again, count - picked.length);
  return planned(picked.map((c) => area(c.idx, spec.power)));
}

/**
 * The creature the boss's plain attack goes for: its zone's Guard, else the front-most standing.
 * With several Guards in that zone and `ctx.guardDice`, the die of the front-most creature's slot
 * picks one (the same pick the plain attack makes).
 */
export function frontTarget(ctx: PatternContext): PatternCreature | undefined {
  for (const zone of ZONES) {
    const standing = livingIn(ctx, zone);
    const first = standing[0];
    if (first === undefined) continue;
    return (
      pickGuardWith(
        standing.filter((c) => c.role === 'guard'),
        first.idx,
        ctx.guardDice,
      ) ?? first
    );
  }
  return undefined;
}

/**
 * Slam: one aimed hit, then `splashBp` of its damage on the creatures beside the impact (the fight
 * resolves the splash, because the impact depends on a Guard stepping in). `aim`: `front` as the
 * plain attack picks, `strongest` (highest Attack, ties lower slot), `left` (the left-most living
 * creature), `random` (one die over the living creatures).
 */
export function planSlam(
  ctx: PatternContext,
  spec: { aim: 'front' | 'strongest' | 'left' | 'random'; power: number; splashBp: number },
): PatternPlan {
  let victim: PatternCreature | undefined;
  switch (spec.aim) {
    case 'front':
      victim = frontTarget(ctx);
      break;
    case 'strongest':
      victim = byStrength(ctx.creatures)[0];
      break;
    case 'left':
      victim = living(ctx)[0];
      break;
    case 'random':
      victim = pickWith(living(ctx), ctx.dice[0] ?? 0);
      break;
  }
  const hits: PlannedHit[] =
    victim === undefined ? [] : [{ target: victim.idx, powerBp: spec.power, kind: 'aimed' }];
  return planned(hits, { splashBp: spec.splashBp });
}

/**
 * Lance geometry. The row has `n` slots split into Front, Middle and Back by `zoneSizes`; with
 * `n = 3 x players` the three rows are equal, `n / 3` wide, and a lane is a slot position `l`
 * (0-based, left to right) read in every row: slot `zoneIndices(zone)[l]` of Front, of Middle and
 * of Back. For other lengths the middle row is the widest, so a lane position past the end of a
 * shorter row has nobody there and the lance passes through it.
 *
 * The lane: `strongest` is the position of the highest-Attack living creature in its row; `random`
 * is one die over the lanes that have a living creature in some row (so a lance is never wasted on
 * an empty lane; with a full row this is a die over the row's width).
 *
 * The hits go Front, Middle, Back: the row r (0, 1, 2) takes `power x falloff^r` (an empty or
 * knocked-out slot is passed through: it takes nothing and the next row keeps its own falloff). A
 * living Guard in the lane takes its hit and stops the lance: nobody behind it is hit.
 */
export function planLance(
  ctx: PatternContext,
  spec: { lane: 'random' | 'strongest'; power: number; falloffBp: number },
): PatternPlan {
  const rowsIdx = ZONES.map((z) => zoneIndices(z, ctx.n));
  const width = Math.max(...rowsIdx.map((r) => r.length));
  const standingAt = (zoneRow: number, lane: number): PatternCreature | undefined => {
    const idx = rowsIdx[zoneRow]?.[lane];
    const c = idx === undefined ? undefined : ctx.creatures[idx];
    return c?.alive === true ? c : undefined;
  };
  const lanes: number[] = [];
  for (let l = 0; l < width; l++) {
    if (ZONES.some((_, r) => standingAt(r, l) !== undefined)) lanes.push(l);
  }
  let lane: number | undefined;
  if (spec.lane === 'strongest') {
    const top = byStrength(ctx.creatures)[0];
    if (top !== undefined) {
      const row = ZONES.indexOf(zoneOfIndex(top.idx, ctx.n));
      lane = rowsIdx[row]?.indexOf(top.idx);
    }
  } else {
    lane = pickWith(lanes, ctx.dice[0] ?? 0);
  }
  if (lane === undefined) return planned([]);
  const hits: PlannedHit[] = [];
  let power = spec.power;
  for (let r = 0; r < ZONES.length; r++) {
    const c = standingAt(r, lane);
    if (c !== undefined) {
      hits.push(area(c.idx, power));
      if (c.role === 'guard') break;
    }
    power = Math.floor((power * spec.falloffBp) / 10_000);
  }
  return planned(hits, { lane });
}

/**
 * Pincer: the first and the last living creature of every row (`rows`: Front, then Middle, then
 * Back; first before last) or of the whole row (`row`). A one-creature group is hit once. A row with
 * nobody standing has no ends and is skipped.
 */
export function planPincer(
  ctx: PatternContext,
  spec: { scope: 'rows' | 'row'; power: number },
): PatternPlan {
  const groups = spec.scope === 'row' ? [living(ctx)] : ZONES.map((z) => livingIn(ctx, z));
  const hits: PlannedHit[] = [];
  for (const g of groups) {
    const first = g[0];
    const last = g[g.length - 1];
    if (first === undefined || last === undefined) continue;
    hits.push(area(first.idx, spec.power));
    if (last !== first) hits.push(area(last.idx, spec.power));
  }
  return planned(hits);
}

/**
 * Chain (`strike_highest_atk`): the first hit is aimed at the strongest living creature (highest
 * Attack, ties lower slot); jump k (1 to `jumps`) goes to the (k + 1)-th strongest as an area hit at
 * `power x decay^k` (each step floored, in basis points). With `jumps` 0 it is the plain strike on
 * the strongest. The plan lists the creatures as ranked now; with `rules` the fight skips a creature
 * the chain already hit (the Guard that took the first hit) when it plays the jumps (`chain.rest`).
 */
export function planChain(
  ctx: PatternContext,
  spec: { power: number; jumps: number; decayBp: number },
): PatternPlan {
  const ranked = byStrength(ctx.creatures);
  const hits: PlannedHit[] = [];
  const first = ranked[0];
  if (first === undefined) return planned(hits);
  hits.push({ target: first.idx, powerBp: spec.power, kind: 'aimed' });
  let power = spec.power;
  for (let k = 1; k <= spec.jumps; k++) {
    const next = ranked[k];
    if (next === undefined) break;
    power = Math.floor((power * spec.decayBp) / 10_000);
    hits.push(area(next.idx, power));
  }
  return planned(hits, { chain: { rest: ranked.slice(1).map((c) => c.idx) } });
}

/** The default jump decay of a chain (`decayBp` absent), basis points. */
export const DEFAULT_DECAY_BP = 5_500;

/** Plans any of the five patterns (a gimmick, or the `then` of a charge). */
export function planPattern(spec: PatternSpec, ctx: PatternContext): PatternPlan {
  switch (spec.op) {
    case 'sweep':
      return planSweep(ctx, spec);
    case 'barrage':
      return planBarrage(ctx, spec);
    case 'slam':
      return planSlam(ctx, spec);
    case 'lance':
      return planLance(ctx, spec);
    case 'pincer':
      return planPincer(ctx, spec);
  }
}

/** The widest row of a row of `length` slots (a lance's lane count). */
export function laneCount(length: number): number {
  const s = zoneSizes(length);
  return Math.max(s.front, s.middle, s.back);
}
