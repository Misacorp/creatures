/**
 * Boss Rank, part two: the tool is worth at least ten points of the HP at the high rank, at the last three bosses.
 * Split from bossRank.test.ts so the two files run in parallel.
 */
import { describe, expect, it } from 'vitest';
import { RANK_TOOL_SHARE_MIN } from '../src/targets';
import { RAID_BOSS_IDS, raidBossOf, rankToolShare } from '../src';

describe('Boss Rank: a lower rank softens the cards, and the unprepared feel it first (Misa, 2026-10-29)', () => {
  it.each(RAID_BOSS_IDS.slice(2))(
    '%s: the tool is worth at least ten points of the HP at the high rank, and about ten at the lower ranks, to a team with random talents',
    (id) => {
      const at = (rank: 'low' | 'mid' | 'high') =>
        rankToolShare(id, rank, raidBossOf(id, { rank }));
      expect(at('high'), id).toBeGreaterThanOrEqual(RANK_TOOL_SHARE_MIN.high);
      // At the lower ranks the tool still adds about ten points (the lab measures 9 to 25 over 100 weekends; 40 weekends are noisier).
      expect(at('mid'), id).toBeGreaterThanOrEqual(RANK_TOOL_SHARE_MIN.mid);
      expect(at('low'), id).toBeGreaterThanOrEqual(RANK_TOOL_SHARE_MIN.low);
    },
  );
});
