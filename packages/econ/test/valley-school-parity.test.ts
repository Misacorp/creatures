/**
 * Parity for the School's shared rules (phase 5 step 9): the lab's band rule, its "would benefit" test and its learning price against
 * the game's (`@creatures/game`, which the server's weekly pick uses). The lab imports them, so a change is one edit; this pins that it
 * stays so, on the lab's own structures (a sparse book by line index, a seeded server).
 */
import {
  VALLEY_RULES,
  benefitCounts,
  learningPrice as gameLearningPrice,
  teacherCandidates,
  wouldBenefit,
} from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { drawTalent, learningPrice } from '../src/school';
import { TALENT_IDS, benefits, poolOf } from '../src/talents';
import type { Player, Server } from '../src/types';
import { createSeededRng } from '@creatures/game';

/** A lab player with a book (a sparse array by line index, as the lab keeps it). */
const playerWith = (books: Record<number, number[]>): Player => {
  const book: Set<number>[] = [];
  for (const [line, talents] of Object.entries(books)) book[Number(line)] = new Set(talents);
  return { book } as unknown as Player;
};

const serverOf = (rule?: 'few' | 'several'): Server =>
  ({
    config: rule === undefined ? {} : { teacherRule: rule },
    teacherRng: createSeededRng('parity'),
  }) as unknown as Server;

/** Server-side players (line name to book) for the same lab players, over the same pools. */
function asGame(players: readonly Player[]) {
  return players.map((p) => ({
    lines: new Map(
      p.book.flatMap((book, line) => [
        [String(line), new Set([...book].map((t) => TALENT_IDS[t] ?? ''))] as const,
      ]),
    ),
  }));
}

describe('the lab and the game agree on the School', () => {
  it('the learning price is the game’s', () => {
    for (let slot = 0; slot <= 3; slot++) {
      expect(learningPrice(VALLEY_RULES, slot)).toBe(gameLearningPrice(VALLEY_RULES, slot));
    }
  });

  it('"would benefit" is the game’s on a sparse book, for every talent', () => {
    const p = playerWith({ 0: [0, 1], 3: [] });
    const pools = Object.fromEntries(
      [0, 3].map((line) => [String(line), poolOf(line).map((t) => TALENT_IDS[t] ?? '')]),
    );
    const lines: ReadonlyMap<string, ReadonlySet<string>> = asGame([p])[0]?.lines ?? new Map();
    TALENT_IDS.forEach((id, t) => {
      expect(benefits(p, t)).toBe(
        wouldBenefit(
          [...lines].map(([line, book]) => ({ pool: pools[line] ?? [], book })),
          id,
        ),
      );
    });
  });

  it('the lab draws from the game’s band-rule candidates', () => {
    // Eight players over a few lines; each owns two lines with an empty book, some with a talent found.
    const players = Array.from({ length: 8 }, (_, n) =>
      playerWith({ [n % 5]: n % 2 === 0 ? [poolOf(n % 5)[0] ?? 0] : [], [(n + 2) % 5]: [] }),
    );
    for (const rule of ['few', 'several'] as const) {
      const counts = TALENT_IDS.map((_, t) => players.filter((p) => benefits(p, t)).length);
      const allowed = teacherCandidates(counts, players.length, rule);
      const gameCounts = benefitCounts(
        TALENT_IDS,
        Object.fromEntries(
          [0, 1, 2, 3, 4].map((l) => [String(l), poolOf(l).map((t) => TALENT_IDS[t] ?? '')]),
        ),
        asGame(players),
      );
      expect(gameCounts).toEqual(counts);
      const server = serverOf(rule);
      for (let i = 0; i < 40; i++) {
        const drawn = drawTalent(server, players);
        if (allowed.length === 0) expect(drawn).toBeNull();
        else expect(allowed).toContain(drawn);
      }
    }
  });
});
