/**
 * The prepared line at the margin, at other widths and on a mixed server (panel 4). The thresholds are in `src/targets.ts` and the
 * measures in `src/raidRules.ts`, where the boss tuner reads them too.
 */
import { describe, expect, it } from 'vitest';
import {
  COST_HP_LEFT_LOW,
  COST_HP_LEFT_MAX,
  COST_KNOCKOUTS_MIN,
  COST_SHARE_MIN,
  GAP10_MIN,
  MARGIN_BASE_MIN,
  MARGIN_PLUS10_MIN,
  SERVER_KILL_MAX,
  SERVER_KNOCKOUT_FACTOR,
  SERVER_SHARE_MAX,
  SERVER_SHARE_MIN,
  WIDTH_BEST_SHARE_MIN,
  WIDTH_CLASSIC_KILL_MAX,
  WIDTH_CLASSIC_SHARE_MAX,
} from '../src/targets';
import {
  RAID_BOSS_IDS,
  costRule,
  gap10Rule,
  marginRule,
  raidBossOf,
  serverRule,
  widthRule,
} from '../src';

describe('the prepared line at the margin, at other widths and on a mixed server (panel 4)', () => {
  it.each(RAID_BOSS_IDS)(
    '%s: the prepared line keeps most of its HP share at +10% Attack and at +10% HP',
    (id) => {
      const m = marginRule(id, raidBossOf(id));
      expect(m.share.base, id).toBeGreaterThanOrEqual(MARGIN_BASE_MIN);
      expect(m.share.atk10, `${id} +10% Attack`).toBeGreaterThanOrEqual(MARGIN_PLUS10_MIN);
      expect(m.share.hp10, `${id} +10% HP`).toBeGreaterThanOrEqual(MARGIN_PLUS10_MIN);
    },
  );

  it.each(RAID_BOSS_IDS)(
    '%s: the prepared line pays for it: creatures lost, or the team left low on HP',
    (id) => {
      const w = costRule(id, raidBossOf(id));
      expect(w.damageShare, id).toBeGreaterThanOrEqual(COST_SHARE_MIN);
      // Misa, 2026-10-29: everyone alive but low is also a result, so HP left counts next to knockouts.
      expect(
        w.knockoutsTotal >= COST_KNOCKOUTS_MIN || w.hpLeftEnd <= COST_HP_LEFT_LOW,
        `${id}: ${String(w.knockoutsTotal)} out, ${String(w.hpLeftEnd)} HP left`,
      ).toBe(true);
      expect(w.hpLeftEnd, id).toBeLessThanOrEqual(COST_HP_LEFT_MAX);
    },
  );

  it.each(RAID_BOSS_IDS)(
    '%s: at 5, 10 and 15 columns the classic party never kills and the prepared line removes nearly all the HP',
    (id) => {
      for (const r of widthRule(id, raidBossOf(id))) {
        expect(r.classicWin, `${id} at ${String(r.width)} columns`).toBeLessThanOrEqual(
          WIDTH_CLASSIC_KILL_MAX,
        );
        expect(r.classicShare, `${id} at ${String(r.width)} columns`).toBeLessThanOrEqual(
          WIDTH_CLASSIC_SHARE_MAX,
        );
        expect(r.bestShare, `${id} at ${String(r.width)} columns`).toBeGreaterThanOrEqual(
          WIDTH_BEST_SHARE_MIN,
        );
      }
    },
  );

  it.each(RAID_BOSS_IDS)(
    '%s: the tool gap holds at 10 players: the line repeated to fill still loses clearly without its tool, in HP removed or in kills',
    (id) => {
      // A line that removes all the HP either way shows its tool in the kills, one that kills no weekend in the HP
      // (`gap10Rule`: the larger of the two gaps in units of `GAP10_SHARE_UNIT` and `GAP10_KILL_UNIT`).
      const g = gap10Rule(id, raidBossOf(id));
      expect(
        g.gap,
        `${id}: ${String(g.share)} of the HP, ${String(g.kills)} of the kills`,
      ).toBeGreaterThanOrEqual(GAP10_MIN);
    },
  );

  it.each(RAID_BOSS_IDS)(
    '%s: a mixed server (2 min-maxers, 3 builders, 5 casual players) removes a good share of the HP, does not always win, and feels its losses more than a prepared team',
    (id) => {
      const r = serverRule(id, raidBossOf(id));
      expect(r.kill, id).toBeLessThanOrEqual(SERVER_KILL_MAX);
      expect(r.share, id).toBeGreaterThanOrEqual(SERVER_SHARE_MIN);
      expect(r.share, id).toBeLessThanOrEqual(SERVER_SHARE_MAX);
      // A mixed server feels losses more than a prepared team does.
      expect(r.knockouts, id).toBeGreaterThan(SERVER_KNOCKOUT_FACTOR * r.prepared);
    },
  );
});
