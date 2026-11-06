import { content } from '@creatures/game';
import { combatV2 } from '@creatures/game/combat-v2';
import type { Player } from './types';
import { uniform } from './util';

/**
 * The talent books, simplified (docs/design/valley/systems/school.md, V-SCH-10..13). Combat v2's real data is used: 34 talents, and a
 * pool of 7 for each of its 16 lines (`talents.json`; `cull` is in five of them since the owner's trial, 2026-11-03, so the teacher may teach it like any pooled talent). The lab's lines are the content's
 * launch lines, in the order of the content, each with its real pool; the lines of later content drops, which have no pool yet, take the
 * real pools in turn. A find (a new creature, or a duplicate) enters one talent drawn uniformly from the line's pool into the owner's book
 * for that line (the real game rolls by role; the lab does not model roles, golden talents or what a talent does).
 */

/** The ids of the real talents, in the order of the file: an index into this list is a talent in the lab. */
export const TALENT_IDS: readonly string[] = Object.keys(combatV2.talents);

const POOLS = Object.entries(combatV2.pools).map(
  ([line, ids]) => [line, ids.map((id) => TALENT_IDS.indexOf(id))] as const,
);
const LAUNCH_LINES = content.creatures
  .filter((c) => c.stage === 1 && c.catchable)
  .map((c) => c.line);

const POOL_CACHE = new Map<number, readonly number[]>();

/** The talents the lab's line `line` (a species index) can take: its real pool, or one of the real pools in turn for a later drop's line. */
export function poolOf(line: number): readonly number[] {
  let pool = POOL_CACHE.get(line);
  if (!pool) {
    const name = LAUNCH_LINES[line];
    const real = name === undefined ? undefined : POOLS.find(([id]) => id === name);
    pool = (real ?? POOLS[line % POOLS.length])?.[1] ?? [];
    POOL_CACHE.set(line, pool);
  }
  return pool;
}

/** A find of line `line`: one talent from its pool enters the player's book for the line (a talent already in the book adds nothing). */
export function foundTalent(p: Player, line: number): void {
  const pool = poolOf(line);
  const talent = pool[Math.floor(uniform(p.talentRng) * pool.length)];
  if (talent === undefined) return;
  const book = (p.book[line] ??= new Set<number>());
  if (!book.has(talent)) {
    book.add(talent);
    p.bookFinds += 1;
  }
}

/** Whether the talent would benefit the player: a line they own has it in its pool and their book for that line lacks it. */
export function benefits(p: Player, talent: number): boolean {
  return p.book.some((book, line) => !book.has(talent) && poolOf(line).includes(talent));
}
