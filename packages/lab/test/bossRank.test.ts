/**
 * Boss Rank: a lower rank softens the cards, and the unprepared feel it first (part one: the rank ladder, and the
 * tool at the first two bosses; part two is bossRankTool.test.ts). The thresholds are in `src/targets.ts` and the measures in
 * `src/raidRules.ts`, where the boss tuner reads them too.
 */
import { describe, expect, it } from 'vitest';
import {
  CASUAL_KILL_MAX,
  CASUAL_SHARE_MAX,
  CASUAL_SHARE_MIN,
  RANK_CLASSIC_KILL_MAX,
  RANK_CLASSIC_LADDER_SLACK,
  RANK_PREPARED_KILL_MIN,
  RANK_PREPARED_SHARE_MIN,
  RANK_TOOL_SHARE_MIN,
  THORN_TOOL_GAP_POINTS,
} from '../src/targets';
import {
  RAID_BOSS_IDS,
  casualRule,
  classicShareAt,
  raidBossOf,
  rankRule,
  rankToolShare,
  thornToolGain,
} from '../src';

describe('Boss Rank: a lower rank softens the cards, and the unprepared feel it first (Misa, 2026-10-29)', () => {
  it.each(RAID_BOSS_IDS)(
    '%s: at every rank the prepared team kills most weekends and the classic party never kills',
    (id) => {
      for (const rank of ['low', 'mid', 'high'] as const) {
        const r = rankRule(id, rank, raidBossOf(id, { rank }));
        expect(r.preparedKill, `${id} ${rank}`).toBeGreaterThanOrEqual(RANK_PREPARED_KILL_MIN);
        expect(r.preparedShare, `${id} ${rank}`).toBeGreaterThanOrEqual(RANK_PREPARED_SHARE_MIN);
        expect(r.classicKill, `${id} ${rank}`).toBe(RANK_CLASSIC_KILL_MAX);
      }
    },
  );

  it.each(RAID_BOSS_IDS)(
    '%s: the classic party removes no more of the HP at the high rank than at the low rank, and a casual server of ten removes a real share at the low rank',
    (id) => {
      const share = (rank: 'low' | 'high') => classicShareAt(id, raidBossOf(id, { rank }));
      // Storm Sovereign's classic party dies early at every rank (about 45% of the HP whichever rank), so the ladder is flat there.
      expect(share('low') - share('high'), id).toBeGreaterThanOrEqual(-RANK_CLASSIC_LADDER_SLACK);
      const casual = casualRule(id, raidBossOf(id, { rank: 'low' }));
      // Misa asked for about half or more; the lab measures 36% (Thornmother) to 62% (Old Bogback) for ten casual players with no Knack.
      expect(casual.share, id).toBeGreaterThanOrEqual(CASUAL_SHARE_MIN);
      expect(casual.share, id).toBeLessThanOrEqual(CASUAL_SHARE_MAX);
      expect(casual.kill, id).toBeLessThanOrEqual(CASUAL_KILL_MAX);
    },
  );

  it.each(RAID_BOSS_IDS.slice(0, 2))(
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

  it('Thornmother’s answer matters more at the high rank: her bark is thicker and cracks less', () => {
    const gain = (rank: 'low' | 'high') => thornToolGain(rank, raidBossOf('thornmother', { rank }));
    expect(gain('high')).toBeGreaterThan(gain('low') + THORN_TOOL_GAP_POINTS);
  });
});
