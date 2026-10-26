/**
 * Best-team search: for a boss with rule cards, find the lines that do the most, so we can see which
 * Knacks stand out, which are never picked, and whether the usual trio still wins everything.
 * It is a seeded random search plus local improvement, then a re-score of the top lines on fresh
 * seeds (so a lucky line does not win on its search seeds). Good enough to find outliers, not a proof.
 */
import { createSeededRng, int, type Rng } from '@creatures/game';
import { labBoss } from './cards';
import { fight } from './fight';
import { FORM_KNACKS } from './knacks';
import type { BossDef, Placement } from './types';

export interface Pick {
  readonly formId: string;
  /** A Knack id, or 'none'. */
  readonly knack: string;
  readonly level?: number;
  /** Combat talent ids (lab: any number, for measuring one talent at a time). */
  readonly talents?: readonly string[];
}

export const LEVEL = 25;

/** Every form with every Knack it can equip, plus no Knack. */
export function poolOf(forms: readonly string[] = Object.keys(FORM_KNACKS)): Pick[] {
  return forms.flatMap((formId) =>
    [...(FORM_KNACKS[formId] ?? []), 'none'].map((knack) => ({ formId, knack })),
  );
}
export const POOL: readonly Pick[] = poolOf();

export const CLASSIC_LINE: readonly Pick[] = [
  { formId: 'tidewing', knack: 'steady-mark' },
  { formId: 'tempestray', knack: 'detonate' },
  { formId: 'thornbuck', knack: 'wide-reach' },
];

export interface Mode {
  readonly id: 'gauntlet' | 'raid';
  readonly rows: number;
  readonly cols: number;
  /** At most this many copies of a form (one per form in the gauntlet; in a raid, up to one per player). */
  readonly maxCopies: number;
}

export const GAUNTLET: Mode = { id: 'gauntlet', rows: 1, cols: 3, maxCopies: 1 };
export const RAID: Mode = { id: 'raid', rows: 3, cols: 4, maxCopies: 4 };

/** Everyone brings the usual trio, placed in order across the rows. */
export function classicFor(mode: Mode): Pick[] {
  return Array.from({ length: mode.rows * mode.cols }, (_, i) => CLASSIC_LINE[i % 3] as Pick);
}

export function toPlacements(line: readonly Pick[], mode: Mode): Placement[] {
  return line.map((p, i) => ({
    owner: mode.id === 'gauntlet' ? 'p1' : `p${(i % 4) + 1}`,
    formId: p.formId,
    level: p.level ?? LEVEL,
    knack: p.knack,
    ...(p.talents ? { talents: p.talents } : {}),
    row: Math.floor(i / mode.cols),
    col: i % mode.cols,
  }));
}

export interface Score {
  /** Damage, weighted by how many creatures are still standing at the end (half weight for a wipe). */
  readonly score: number;
  readonly damage: number;
  readonly knockouts: number;
  readonly reactions: number;
  readonly blocked: number;
}

export function evaluate(
  boss: BossDef,
  line: readonly Pick[],
  mode: Mode,
  seeds: number,
  salt: string,
): Score {
  let score = 0,
    damage = 0,
    knockouts = 0,
    reactions = 0,
    blocked = 0;
  for (let i = 0; i < seeds; i++) {
    const r = fight(boss, toPlacements(line, mode), { rng: createSeededRng(`${salt}:${i}`) });
    const standing = (line.length - r.knockouts) / line.length;
    score += r.damage * (0.5 + 0.5 * standing);
    damage += r.damage;
    knockouts += r.knockouts;
    reactions += r.reactions;
    blocked += r.blocked;
  }
  return {
    score: score / seeds,
    damage: damage / seeds,
    knockouts: knockouts / seeds,
    reactions: reactions / seeds,
    blocked: blocked / seeds,
  };
}

const valid = (line: readonly Pick[], mode: Mode) => {
  const n = new Map<string, number>();
  for (const p of line) n.set(p.formId, (n.get(p.formId) ?? 0) + 1);
  return [...n.values()].every((c) => c <= mode.maxCopies);
};

function randomLine(rng: Rng, mode: Mode, pool: readonly Pick[]): Pick[] {
  for (;;) {
    const line = Array.from(
      { length: mode.rows * mode.cols },
      () => pool[int(rng, pool.length)] as Pick,
    );
    if (valid(line, mode)) return line;
  }
}

function mutate(rng: Rng, line: readonly Pick[], mode: Mode, pool: readonly Pick[]): Pick[] {
  for (let tries = 0; ; tries++) {
    const next = [...line];
    const i = int(rng, next.length);
    if (int(rng, 2) === 0) {
      next[i] = pool[int(rng, pool.length)] as Pick;
    } else {
      const j = int(rng, next.length);
      [next[i], next[j]] = [next[j] as Pick, next[i] as Pick];
    }
    if (valid(next, mode) || tries > 50) return valid(next, mode) ? next : [...line];
  }
}

export interface Ranked {
  readonly line: readonly Pick[];
  readonly score: Score;
}

export const lineKey = (l: readonly Pick[]) => l.map((p) => `${p.formId}/${p.knack}`).join('|');

export function search(
  boss: BossDef,
  mode: Mode,
  opts: {
    seed: string;
    starts: number;
    keep: number;
    rounds: number;
    seeds: number;
    freshSeeds: number;
    pool?: readonly Pick[];
    include?: readonly (readonly Pick[])[];
  },
): Ranked[] {
  const pool = opts.pool ?? POOL;
  const rng = createSeededRng(`search:${opts.seed}`);
  const seen = new Map<string, Ranked>();
  const add = (l: readonly Pick[]) => {
    const k = lineKey(l);
    if (!seen.has(k))
      seen.set(k, { line: l, score: evaluate(boss, l, mode, opts.seeds, `eval:${opts.seed}`) });
  };
  for (const l of opts.include ?? []) add(l);
  for (let i = 0; i < opts.starts; i++) add(randomLine(rng, mode, pool));
  for (let g = 0; g < opts.rounds; g++) {
    const top = [...seen.values()]
      .sort((a, b) => b.score.score - a.score.score)
      .slice(0, opts.keep);
    for (const t of top) for (let m = 0; m < 6; m++) add(mutate(rng, t.line, mode, pool));
  }
  // Re-score the best lines (and every included line) on fresh seeds, then rank by that.
  const ranked = [...seen.values()].sort((a, b) => b.score.score - a.score.score);
  const includeKeys = new Set((opts.include ?? []).map(lineKey));
  const recheck = ranked.filter((r, i) => i < 20 || includeKeys.has(lineKey(r.line)));
  return recheck
    .map((r) => ({
      line: r.line,
      score: evaluate(boss, r.line, mode, opts.freshSeeds, `fresh:${opts.seed}`),
    }))
    .sort((a, b) => b.score.score - a.score.score);
}

export function bossFor(mode: Mode, cards: readonly string[]): BossDef {
  return labBoss({ rows: mode.rows, cols: mode.cols, cards, atk: mode.id === 'raid' ? 130 : 110 });
}
