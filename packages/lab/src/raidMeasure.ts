/**
 * Raid measures beyond the best line (panel 4): the margin (how far a boss is from a tipping point), the raid at other
 * widths, and a mixed server weekend (min-maxers, builders and casual players side by side).
 */
import { createSeededRng, int, type Rng } from '@creatures/game';
import { RAID_SPECS, raidBench, raidMode, weekendStats, weekendStatsOf } from './bosses';
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
}

/** A line's weekend win rate against the boss, with 10% more Attack, and with 10% more HP (the same seeds each time). */
export function marginOf(boss: BossDef, line: readonly Pick[], runs: number, salt: string): Margin {
  const win = (b: BossDef) => weekendStats(b, line, runs, salt).winRate;
  return {
    base: win(boss),
    atk10: win({ ...boss, atk: Math.floor(boss.atk * 1.1) }),
    hp10: win({ ...boss, hp: Math.floor(boss.hp * 1.1) }),
  };
}

/** The widths (columns, one player each) the raid is measured at, besides the usual four. */
export const RAID_WIDTHS: readonly number[] = [5, 10, 15];

/**
 * How a raid boss's weekend HP grows with the number of players: `(players / 4) ^ e`, where `e` is the boss's own
 * `hpExponent` (shipped bosses have one too: they answer differently to a bigger raid) or 1, a straight line. The boss's
 * Attack does not grow; its area counts do (`perColumns`).
 */
export const hpExponentOf = (boss: BossDef): number =>
  RAID_SPECS.find((s) => s.id === boss.id)?.hpExponent ?? 1;

/** The boss in an arena of `cols` columns, one player each: the arena is wider and the weekend HP has grown with the players. */
export function wideBoss(boss: BossDef, cols: number): BossDef {
  return { ...boss, cols, hp: Math.round(boss.hp * (cols / boss.cols) ** hpExponentOf(boss)) };
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
): WidthResult {
  const wide = wideBoss(boss, width);
  const classic = weekendStats(wide, classicFor(raidMode(wide)), runs, `${salt}:c`);
  const b = weekendStats(wide, tileLine(best, boss.cols, width), runs, `${salt}:b`);
  return {
    width,
    classicWin: classic.winRate,
    bestWin: b.winRate,
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

/**
 * A casual player's column: twelve random forms at random levels (8 to 25, capped by the form), `rows` of them in the
 * column, each with a random Knack it can equip (or none) and a random legal talent.
 */
export function casualColumn(rng: Rng, rows: number): Pick[] {
  const forms = Object.keys(FORM_KNACKS);
  const roster = new Map<string, number>();
  while (roster.size < 12)
    roster.set(forms[int(rng, forms.length)] ?? 'tidewing', 8 + int(rng, 18));
  const owned = [...roster.keys()];
  const column: Pick[] = [];
  for (let r = 0; r < rows; r++) {
    const form = owned.splice(int(rng, owned.length), 1)[0] ?? 'tidewing';
    const knacks = [...(FORM_KNACKS[form] ?? []), 'none'];
    const talents = legalTalents(form);
    const talent = talents[int(rng, talents.length)];
    column.push({
      formId: form,
      knack: knacks[int(rng, knacks.length)] ?? 'none',
      level: Math.min(roster.get(form) ?? 1, formStats(form, 30).levelCap),
      ...(talent ? { talents: [talent] } : {}),
    });
  }
  return column;
}

/** The mixed server: 2 min-maxers, 3 builders and 5 casual players, columns interleaved. */
export const MIXED_ORDER = ['m', 'c', 'b', 'c', 'm', 'c', 'b', 'c', 'b', 'c'] as const;

export interface MixedResult {
  readonly players: number;
  readonly winRate: number;
  readonly knockouts: number;
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

/**
 * A mixed server weekend against `boss`: ten players, one column each. The two min-maxers each bring a column of the best
 * line; the three builders each a column of a written answer (at most two copies of a form); the five casual players a
 * column of random forms, Knacks and talents. Min-maxers and builders have read the boss: they bring the columns that hold
 * the tool (`core` for the best line, `answerCores` for each written answer), the most of it first. Over `draws` different casual rosters (and builder answers), `runs` weekends
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
): MixedResult {
  const rows = boss.rows;
  const per = Math.max(1, Math.floor(runs / draws));
  let wins = 0,
    ko = 0,
    total = 0;
  for (let d = 0; d < draws; d++) {
    const rng = createSeededRng(`mixed:${salt}:${d}`);
    let m = 0,
      b = 0;
    const columns: Pick[][] = MIXED_ORDER.map((kind) => {
      if (kind === 'm')
        return columnOf(
          best,
          boss.cols,
          toolColumns(best, boss.cols, core)[m++ % boss.cols] as number,
        );
      if (kind === 'b') {
        const k = answers.length ? (b + d) % answers.length : -1;
        const a = k >= 0 ? (answers[k] as readonly Pick[]) : best;
        const order = toolColumns(a, boss.cols, answerCores[k] ?? core);
        const col = order[(b++ + d) % boss.cols] as number;
        return limitCopies(columnOf(a, boss.cols, col), BUILDER_MAX_COPIES, a);
      }
      return casualColumn(rng, rows);
    });
    const players = columns.length;
    const placements: Placement[] = columns.flatMap((col, c) =>
      col.map((p, r) => ({
        owner: `p${c + 1}`,
        formId: p.formId,
        level: p.level ?? LEVEL,
        knack: p.knack,
        ...(p.talents ? { talents: p.talents } : {}),
        row: r,
        col: c,
      })),
    );
    const w = weekendStatsOf(
      wideBoss(boss, players),
      placements,
      raidBench(players),
      per,
      `${salt}:${d}`,
    );
    wins += w.winRate * per;
    ko += w.knockoutsTotal * per;
    total += per;
  }
  return { players: MIXED_ORDER.length, winRate: wins / total, knockouts: ko / total };
}
