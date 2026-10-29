/**
 * Raid measures beyond the best line (panel 4): the margin (how far a boss is from a tipping point), the raid at other
 * widths, and a mixed server weekend (min-maxers, builders and casual players side by side).
 */
import { createSeededRng, int, type Rng } from '@creatures/game';
import {
  combineWeekends,
  raidBench,
  raidMode,
  weekendStats,
  weekendStatsOf,
  type WeekendStats,
} from './bosses';
import { FORM_KNACKS } from './knacks';
import { LEVEL, classicFor, type Pick } from './search';
import { formStats } from './species';
import { legalTalents } from './talents';
import type { BossDef, Placement } from './types';

/** The boss's win rate target at +10% Attack and at +10% HP (a well-prepared team should usually win, but not by a mile). */
export const MARGIN_TARGET = 0.6;

export interface Margin {
  readonly base: number;
  readonly atk10: number;
  readonly hp10: number;
  /** The same three in the primary measure: the share of the boss's HP removed. */
  readonly share: { readonly base: number; readonly atk10: number; readonly hp10: number };
}

/** A line's weekend win rate (and share of HP removed) against the boss, with 10% more Attack, and with 10% more HP (the same seeds each time). */
export function marginOf(boss: BossDef, line: readonly Pick[], runs: number, salt: string): Margin {
  const w = (b: BossDef) => weekendStats(b, line, runs, salt);
  const base = w(boss);
  const atk = w({ ...boss, atk: Math.floor(boss.atk * 1.1) });
  const hp = w({ ...boss, hp: Math.floor(boss.hp * 1.1) });
  return {
    base: base.winRate,
    atk10: atk.winRate,
    hp10: hp.winRate,
    share: { base: base.damageShare, atk10: atk.damageShare, hp10: hp.damageShare },
  };
}

/** The widths (columns, one player each) the raid is measured at, besides the usual four. */
export const RAID_WIDTHS: readonly number[] = [5, 10, 15];

/**
 * How a raid boss's weekend HP grows with the number of players (panel 5): `(players / 4) ^ RAID_HP_EXPONENT`, one
 * exponent for every boss and one smooth curve, with no kink at any width. The boss's Attack does not grow; its area
 * counts do (`perColumns`).
 */
export const RAID_HP_EXPONENT = 0.7;

/**
 * How a raid boss's Attack grows with the number of players (panel 5 fix, tool gap at 10 players): `(players / 4) ^ RAID_ATK_EXPONENT`.
 * A wider raid spreads each hit over more creatures, so with the HP alone a wide line of the same creatures won without its tool;
 * the boss hits harder in a wide raid, and its area counts and anchors grow (`perColumns`) as before.
 */
export const RAID_ATK_EXPONENT = 0.3;

/** The weekend HP of a raid boss for `cols` players, as a multiple of its HP for the usual four. */
export function raidHpFactor(
  boss: BossDef,
  cols: number,
  exponent: number = RAID_HP_EXPONENT,
): number {
  return (cols / boss.cols) ** exponent;
}

/** The boss in an arena of `cols` columns, one player each: the arena is wider and the weekend HP has grown with the players. */
export function wideBoss(
  boss: BossDef,
  cols: number,
  exponent: number = RAID_HP_EXPONENT,
  atkExponent: number = RAID_ATK_EXPONENT,
): BossDef {
  return {
    ...boss,
    cols,
    hp: Math.round(boss.hp * raidHpFactor(boss, cols, exponent)),
    atk: Math.round(boss.atk * (cols / boss.cols) ** atkExponent),
  };
}

/** A raid line (rows of `from` columns) repeated to fill rows of `to` columns: column c of each row is column c % from of it. */
export function tileLine(line: readonly Pick[], from: number, to: number): Pick[] {
  const rows = Math.floor(line.length / from);
  return Array.from({ length: rows * to }, (_, i) => {
    const r = Math.floor(i / to);
    return line[r * from + ((i % to) % from)] as Pick;
  });
}

export interface WidthResult {
  readonly width: number;
  readonly classicWin: number;
  readonly bestWin: number;
  /** The primary measure: the mean share of the boss's HP removed. */
  readonly classicShare: number;
  readonly bestShare: number;
  readonly classicKnockouts: number;
  readonly bestKnockouts: number;
}

/** The classic party and the best line (repeated to fill) on the boss's arena at `width` columns, one player a column. */
export function widthOf(
  boss: BossDef,
  best: readonly Pick[],
  width: number,
  runs: number,
  salt: string,
  exponent: number = RAID_HP_EXPONENT,
  atkExponent: number = RAID_ATK_EXPONENT,
): WidthResult {
  const wide = wideBoss(boss, width, exponent, atkExponent);
  const classic = weekendStats(wide, classicFor(raidMode(wide)), runs, `${salt}:c`);
  const b = weekendStats(wide, tileLine(best, boss.cols, width), runs, `${salt}:b`);
  return {
    width,
    classicWin: classic.winRate,
    bestWin: b.winRate,
    classicShare: classic.damageShare,
    bestShare: b.damageShare,
    classicKnockouts: classic.knockoutsTotal,
    bestKnockouts: b.knockoutsTotal,
  };
}

// ---------- the mixed server weekend ----------

/** At most this many copies of a form in a builder's column. */
export const BUILDER_MAX_COPIES = 2;

/** One column (a player's creatures, front to back) of a raid line of `cols` columns. */
export const columnOf = (line: readonly Pick[], cols: number, col: number): Pick[] =>
  Array.from({ length: Math.floor(line.length / cols) }, (_, r) => line[r * cols + col] as Pick);

/** A column with no more than `max` copies of a form: the extra copies are replaced by the first creature of `spare` that fits. */
export function limitCopies(column: readonly Pick[], max: number, spare: readonly Pick[]): Pick[] {
  const count = new Map<string, number>();
  const out: Pick[] = [];
  const queue = [...spare];
  for (const p of column) {
    if ((count.get(p.formId) ?? 0) < max) {
      count.set(p.formId, (count.get(p.formId) ?? 0) + 1);
      out.push(p);
      continue;
    }
    const i = queue.findIndex((q) => (count.get(q.formId) ?? 0) < max);
    const next = i >= 0 ? (queue.splice(i, 1)[0] as Pick) : p;
    count.set(next.formId, (count.get(next.formId) ?? 0) + 1);
    out.push(next);
  }
  return out;
}

/** How a casual player picks the column: a random Knack each (today's players), or the top creatures by level with no Knack (the default after the migration, P-14). */
export type CasualKind = 'random' | 'top3';

/**
 * A casual player's column: twelve random forms at random levels (8 to 25, capped by the form), `rows` of them in the
 * column, each with a random legal talent. `random`: random forms, each with a random Knack it can equip (or none).
 * `top3` (panel 5): the highest levels of the roster, one creature a row (the top three on a three-row arena), no Knack,
 * since migrated creatures start with none equipped.
 */
export function casualColumn(
  rng: Rng,
  rows: number,
  kind: CasualKind = 'random',
  rosterLevel: number = LEVEL,
): Pick[] {
  const forms = Object.keys(FORM_KNACKS);
  const roster = new Map<string, number>();
  while (roster.size < 12)
    roster.set(forms[int(rng, forms.length)] ?? 'tidewing', 8 + int(rng, 18));
  // A server at an early Boss Rank has a weaker roster: every level is scaled by the rank's roster level over the endgame's.
  const level = (f: string) =>
    Math.max(
      1,
      Math.min(Math.round(((roster.get(f) ?? 1) * rosterLevel) / LEVEL), formStats(f, 30).levelCap),
    );
  const owned = [...roster.keys()];
  const chosen =
    kind === 'top3'
      ? [...owned].sort((a, b) => level(b) - level(a)).slice(0, rows)
      : Array.from(
          { length: rows },
          () => owned.splice(int(rng, owned.length), 1)[0] ?? 'tidewing',
        );
  return chosen.map((form) => {
    const knacks = [...(FORM_KNACKS[form] ?? []), 'none'];
    const talents = legalTalents(form);
    const talent = talents[int(rng, talents.length)];
    return {
      formId: form,
      knack: kind === 'top3' ? 'none' : (knacks[int(rng, knacks.length)] ?? 'none'),
      level: level(form),
      ...(talent ? { talents: [talent] } : {}),
    };
  });
}

/** The kinds of player on a mixed server: min-maxers, builders and casual players. */
export type PlayerKind = 'm' | 'b' | 'c';
export const PLAYER_KINDS: readonly PlayerKind[] = ['m', 'b', 'c'];
export const PLAYER_KIND_NAME: Readonly<Record<PlayerKind, string>> = {
  m: 'min-maxer',
  b: 'builder',
  c: 'casual',
};

/** The mixed server of ten: 2 min-maxers, 3 builders and 5 casual players, columns interleaved. */
export const MIXED_ORDER: readonly PlayerKind[] = [
  'm',
  'c',
  'b',
  'c',
  'm',
  'c',
  'b',
  'c',
  'b',
  'c',
];

/**
 * The mixed server at 5, 10 and 15 players (about a fifth min-maxers, three tenths builders, half casual players), columns
 * interleaved so each kind stands spread across the arena.
 */
export const MIXED_ORDERS: Readonly<Record<number, readonly PlayerKind[]>> = {
  5: ['m', 'c', 'b', 'c', 'b'],
  10: MIXED_ORDER,
  15: ['m', 'c', 'b', 'c', 'm', 'c', 'b', 'c', 'b', 'c', 'm', 'c', 'b', 'b', 'c'],
};

export interface MixedResult {
  readonly players: number;
  readonly winRate: number;
  readonly knockouts: number;
  /** The whole measure over every draw: HP left and the share standing per stage and at the weekend's end. */
  readonly weekend: WeekendStats;
  /** Mean knockouts a weekend per player of each kind (who pays for it). */
  readonly knockoutsPerPlayer: Readonly<Record<PlayerKind, number>>;
  /** The win rate of each draw (a draw is one set of casual rosters and builder answers). */
  readonly drawWins: readonly number[];
}

/**
 * The columns of a raid line (`cols` wide), best first for a player who brings the tool: the columns that hold the most
 * creatures built on `core` (Knack ids, or `talent:<id>`) come first, ties to the left. With no `core`, left to right.
 */
export function toolColumns(
  line: readonly Pick[],
  cols: number,
  core: readonly string[],
): number[] {
  const has = (p: Pick) =>
    core.includes(p.knack) || (p.talents ?? []).some((t) => core.includes(`talent:${t}`));
  const score = (c: number) => columnOf(line, cols, c).filter(has).length;
  return Array.from({ length: cols }, (_, c) => c).sort((a, b) => score(b) - score(a) || a - b);
}

export interface MixedOptions {
  /** Players (columns), 5, 10 or 15 (default 10). */
  readonly players?: number;
  /** How the casual players pick their column (default `random`). */
  readonly casual?: CasualKind;
  /** The HP exponent (default the one rule). */
  readonly hpExponent?: number;
  /** The Attack exponent (default the one rule). */
  readonly atkExponent?: number;
  /** The kinds of the players, one a column, instead of the mixed order of `players` (a server of casual players only: `['c', 'c', ...]`). */
  readonly order?: readonly PlayerKind[];
}

/**
 * A mixed server weekend against `boss`: ten players (or 5 or 15), one column each. The min-maxers each bring a column of
 * the best line; the builders each a column of a written answer (at most two copies of a form); the casual players a
 * column of random forms, Knacks and talents (or their top creatures by level with no Knack, `options.casual`). Min-maxers
 * and builders have read the boss: they bring the columns that hold the tool (`core` for the best line, `answerCores` for
 * each written answer), the most of it first. Over `draws` different casual rosters (and builder answers), `runs` weekends
 * in all.
 */
export function mixedServer(
  boss: BossDef,
  best: readonly Pick[],
  answers: readonly (readonly Pick[])[],
  draws: number,
  runs: number,
  salt: string,
  core: readonly string[] = [],
  answerCores: readonly (readonly string[])[] = [],
  options: MixedOptions = {},
): MixedResult {
  const rows = boss.rows;
  const order = options.order ?? MIXED_ORDERS[options.players ?? 10] ?? MIXED_ORDER;
  const per = Math.max(1, Math.floor(runs / draws));
  const parts: WeekendStats[] = [];
  for (let d = 0; d < draws; d++) {
    const rng = createSeededRng(`mixed:${salt}:${d}`);
    let m = 0,
      b = 0;
    const columns: Pick[][] = order.map((kind) => {
      if (kind === 'm')
        return columnOf(
          best,
          boss.cols,
          toolColumns(best, boss.cols, core)[m++ % boss.cols] as number,
        );
      if (kind === 'b') {
        const k = answers.length ? (b + d) % answers.length : -1;
        const a = k >= 0 ? (answers[k] as readonly Pick[]) : best;
        const tc = toolColumns(a, boss.cols, answerCores[k] ?? core);
        const col = tc[(b++ + d) % boss.cols] as number;
        return limitCopies(columnOf(a, boss.cols, col), BUILDER_MAX_COPIES, a);
      }
      return casualColumn(rng, rows, options.casual ?? 'random', boss.rosterLevel);
    });
    const players = columns.length;
    const placements: Placement[] = columns.flatMap((col, c) =>
      col.map((p, r) => ({
        owner: `p${c + 1}`,
        formId: p.formId,
        level: p.level ?? boss.rosterLevel ?? LEVEL,
        knack: p.knack,
        ...(p.talents ? { talents: p.talents } : {}),
        row: r,
        col: c,
      })),
    );
    parts.push(
      weekendStatsOf(
        wideBoss(boss, players, options.hpExponent, options.atkExponent),
        placements,
        raidBench(players, boss.rosterLevel),
        per,
        `${salt}:${d}`,
      ),
    );
  }
  const weekend = combineWeekends(parts);
  const perPlayer = (kind: PlayerKind): number => {
    const owners = order.flatMap((k, c) => (k === kind ? [`p${c + 1}`] : []));
    return owners.length
      ? owners.reduce((n, o) => n + (weekend.knockoutsByOwner[o] ?? 0), 0) / owners.length
      : 0;
  };
  return {
    players: order.length,
    winRate: weekend.winRate,
    knockouts: weekend.knockoutsTotal,
    weekend,
    knockoutsPerPlayer: { m: perPlayer('m'), b: perPlayer('b'), c: perPlayer('c') },
    drawWins: parts.map((p) => p.winRate),
  };
}

/** A server of ten casual players only: nobody has read the boss. */
export const CASUAL_ORDER: readonly PlayerKind[] = Array.from({ length: 10 }, () => 'c' as const);

/** The draws and seeds of the report's mixed server: 200 draws over 3 seeds (panel 5: one seed of 40 draws was mostly noise). */
export const MIXED_SEEDS = 3;
export const MIXED_DRAWS = 200;

export interface MixedSpread extends MixedResult {
  /** The win rate on each seed's share of the draws, and the standard deviation of the draws' win rates. */
  readonly seedWins: readonly number[];
  readonly drawSd: number;
}

/** The mixed server over several seeds (`draws` in all, split over them), with the spread between seeds and between draws. */
export function mixedSpread(
  boss: BossDef,
  best: readonly Pick[],
  answers: readonly (readonly Pick[])[],
  draws: number,
  seeds: number,
  weekendsPerDraw: number,
  salt: string,
  core: readonly string[] = [],
  answerCores: readonly (readonly string[])[] = [],
  options: MixedOptions = {},
): MixedSpread {
  const parts: MixedResult[] = Array.from({ length: seeds }, (_, k) =>
    mixedServer(
      boss,
      best,
      answers,
      Math.floor(draws / seeds) + (k < draws % seeds ? 1 : 0),
      (Math.floor(draws / seeds) + (k < draws % seeds ? 1 : 0)) * weekendsPerDraw,
      `${salt}:seed${k}`,
      core,
      answerCores,
      options,
    ),
  );
  const weekend = combineWeekends(parts.map((p) => p.weekend));
  const total = parts.reduce((n, p) => n + p.weekend.runs, 0);
  const w = (f: (p: MixedResult) => number) =>
    parts.reduce((n, p) => n + f(p) * p.weekend.runs, 0) / total;
  const drawWins = parts.flatMap((p) => p.drawWins);
  const mean = drawWins.reduce((a, b) => a + b, 0) / Math.max(1, drawWins.length);
  return {
    players: parts[0]?.players ?? 0,
    winRate: weekend.winRate,
    knockouts: weekend.knockoutsTotal,
    weekend,
    knockoutsPerPlayer: {
      m: w((p) => p.knockoutsPerPlayer.m),
      b: w((p) => p.knockoutsPerPlayer.b),
      c: w((p) => p.knockoutsPerPlayer.c),
    },
    drawWins,
    seedWins: parts.map((p) => p.winRate),
    drawSd: Math.sqrt(
      drawWins.reduce((n, x) => n + (x - mean) ** 2, 0) / Math.max(1, drawWins.length),
    ),
  };
}
