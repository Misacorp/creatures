/**
 * Best-team search: for a boss with rule cards, find the lines that do the most, so we can see which
 * Knacks stand out, which are never picked, and whether the usual trio still wins everything.
 * It is a seeded random search plus local improvement: good enough to find outliers, not a proof.
 */
import { createSeededRng, int, type Rng } from '@creatures/game';
import { labBoss } from './cards';
import { fight } from './fight';
import { FORM_KNACKS } from './knacks';
import { formStats } from './species';
import type { BossDef, Placement } from './types';

export interface Pick {
  readonly formId: string;
  readonly knack: string;
}

/** The lab's creature pool: every form with Knacks, at level 25 (stage 1 forms stop at their cap). */
export const POOL: readonly Pick[] = Object.entries(FORM_KNACKS).flatMap(([formId, ks]) =>
  ks.map((knack) => ({ formId, knack })),
);
export const LEVEL = 25;

export const CLASSIC_LINE: readonly Pick[] = [
  { formId: 'tidewing', knack: 'soak-through' },
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
    level: LEVEL,
    knack: p.knack,
    row: Math.floor(i / mode.cols),
    col: i % mode.cols,
  }));
}

export interface Score {
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
  let damage = 0,
    knockouts = 0,
    reactions = 0,
    blocked = 0;
  for (let i = 0; i < seeds; i++) {
    const r = fight(boss, toPlacements(line, mode), { rng: createSeededRng(`${salt}:${i}`) });
    damage += r.damage;
    knockouts += r.knockouts;
    reactions += r.reactions;
    blocked += r.blocked;
  }
  return {
    damage: damage / seeds,
    knockouts: knockouts / seeds,
    reactions: reactions / seeds,
    blocked: blocked / seeds,
  };
}

const valid = (line: readonly Pick[], mode: Mode) => {
  const n = new Map<string, number>();
  for (const p of line) n.set(p.formId, (n.get(p.formId) ?? 0) + 1);
  return (
    [...n.values()].every((c) => c <= mode.maxCopies) &&
    line.every((p) => formStats(p.formId, LEVEL).levelCap >= 15)
  );
};

function randomLine(rng: Rng, mode: Mode): Pick[] {
  for (;;) {
    const line = Array.from(
      { length: mode.rows * mode.cols },
      () => POOL[int(rng, POOL.length)] as Pick,
    );
    if (valid(line, mode)) return line;
  }
}

function mutate(rng: Rng, line: readonly Pick[], mode: Mode): Pick[] {
  for (;;) {
    const next = [...line];
    const i = int(rng, next.length);
    if (int(rng, 2) === 0) {
      next[i] = POOL[int(rng, POOL.length)] as Pick;
    } else {
      const j = int(rng, next.length);
      [next[i], next[j]] = [next[j] as Pick, next[i] as Pick];
    }
    if (valid(next, mode)) return next;
  }
}

export interface Ranked {
  readonly line: readonly Pick[];
  readonly score: Score;
}

export function search(
  boss: BossDef,
  mode: Mode,
  opts: { seed: string; starts: number; keep: number; rounds: number; seeds: number },
): Ranked[] {
  const rng = createSeededRng(`search:${opts.seed}`);
  const seen = new Map<string, Ranked>();
  const key = (l: readonly Pick[]) => l.map((p) => `${p.formId}/${p.knack}`).join('|');
  const add = (l: readonly Pick[]) => {
    const k = key(l);
    if (!seen.has(k))
      seen.set(k, { line: l, score: evaluate(boss, l, mode, opts.seeds, `eval:${opts.seed}`) });
  };
  add(classicFor(mode));
  for (let i = 0; i < opts.starts; i++) add(randomLine(rng, mode));
  for (let g = 0; g < opts.rounds; g++) {
    const top = [...seen.values()]
      .sort((a, b) => b.score.damage - a.score.damage)
      .slice(0, opts.keep);
    for (const t of top) for (let m = 0; m < 6; m++) add(mutate(rng, t.line, mode));
  }
  return [...seen.values()].sort((a, b) => b.score.damage - a.score.damage);
}

export function bossFor(mode: Mode, cards: readonly string[]): BossDef {
  return labBoss({ rows: mode.rows, cols: mode.cols, cards, atk: mode.id === 'raid' ? 130 : 110 });
}
