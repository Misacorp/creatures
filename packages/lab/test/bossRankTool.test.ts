/**
 * Boss Rank, part two: the tool is worth at least ten points of the HP at the high rank, at the last three bosses.
 * Split from bossRank.test.ts so the two files run in parallel.
 */
import { describe, expect, it } from 'vitest';
import {
  BOSS_ANSWERS,
  RAID_BOSS_IDS,
  robustnessOf,
  answerLine,
  raidBossOf,
  withoutTool,
} from '../src';

describe('Boss Rank: a lower rank softens the cards, and the unprepared feel it first (Misa, 2026-10-29)', () => {
  const lineOf = (id: string) => answerLine(BOSS_ANSWERS[id]?.[0]?.line ?? '');

  it.each(RAID_BOSS_IDS.slice(2))(
    '%s: the tool is worth at least ten points of the HP at the high rank, and about ten at the lower ranks, to a team with random talents',
    (id) => {
      const first = BOSS_ANSWERS[id]?.[0];
      const at = (rank: 'low' | 'mid' | 'high') => {
        const b = raidBossOf(id, { rank });
        const line = lineOf(id);
        const w = robustnessOf(b, line, 40, 8, `rank:${id}:${rank}:t`).random.damageShare;
        const n = robustnessOf(
          b,
          withoutTool(line, first?.core ?? []),
          40,
          8,
          `rank:${id}:${rank}:n`,
        ).random.damageShare;
        return w - n;
      };
      expect(at('high'), id).toBeGreaterThanOrEqual(0.1);
      // At the lower ranks the tool still adds about ten points (the lab measures 9 to 25 over 100 weekends; 40 weekends are noisier).
      expect(at('mid'), id).toBeGreaterThanOrEqual(0.08);
      expect(at('low'), id).toBeGreaterThanOrEqual(0.06);
    },
  );
});
