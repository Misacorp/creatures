/**
 * The prepared line at the margin, at other widths and on a mixed server (panel 4).
 */
import { describe, expect, it } from 'vitest';
import {
  BOSS_ANSWERS,
  RAID_BOSS_IDS,
  RAID_WIDTHS,
  tileLine,
  wideBoss,
  answerLine,
  marginOf,
  mixedServer,
  raidBossOf,
  weekendStats,
  widthOf,
  withoutTool,
} from '../src';

describe('the prepared line at the margin, at other widths and on a mixed server (panel 4)', () => {
  const first = (id: string) => BOSS_ANSWERS[id]?.[0];
  const lineOf = (id: string) => answerLine(first(id)?.line ?? '');

  it.each(RAID_BOSS_IDS)(
    '%s: the prepared line keeps most of its HP share at +10% Attack and at +10% HP',
    (id) => {
      const m = marginOf(raidBossOf(id), lineOf(id), 24, `margin:${id}`);
      expect(m.share.base, id).toBeGreaterThanOrEqual(0.93);
      expect(m.share.atk10, `${id} +10% Attack`).toBeGreaterThanOrEqual(0.8);
      expect(m.share.hp10, `${id} +10% HP`).toBeGreaterThanOrEqual(0.8);
    },
  );

  it.each(RAID_BOSS_IDS)(
    '%s: the prepared line pays for it: creatures lost, or the team left low on HP',
    (id) => {
      const w = weekendStats(raidBossOf(id), lineOf(id), 24, `cost:${id}`);
      expect(w.damageShare, id).toBeGreaterThanOrEqual(0.93);
      // Misa, 2026-10-29: everyone alive but low is also a result, so HP left counts next to knockouts.
      expect(
        w.knockoutsTotal >= 0.5 || w.hpLeftEnd <= 0.6,
        `${id}: ${String(w.knockoutsTotal)} out, ${String(w.hpLeftEnd)} HP left`,
      ).toBe(true);
      expect(w.hpLeftEnd, id).toBeLessThanOrEqual(0.8);
    },
  );

  it.each(RAID_BOSS_IDS)(
    '%s: at 5, 10 and 15 columns the classic party never kills and the prepared line removes nearly all the HP',
    (id) => {
      const b = raidBossOf(id);
      for (const w of RAID_WIDTHS) {
        const r = widthOf(b, lineOf(id), w, 12, `width:${id}`);
        expect(r.classicWin, `${id} at ${String(w)} columns`).toBeLessThanOrEqual(0.1);
        expect(r.classicShare, `${id} at ${String(w)} columns`).toBeLessThanOrEqual(0.9);
        expect(r.bestShare, `${id} at ${String(w)} columns`).toBeGreaterThanOrEqual(0.85);
      }
    },
  );

  it.each(RAID_BOSS_IDS)(
    '%s: the tool gap holds at 10 players: the line repeated to fill still loses clearly without its tool, in HP removed or in kills',
    (id) => {
      const b = raidBossOf(id);
      const a = first(id);
      const wide = wideBoss(b, 10);
      const withT = weekendStats(wide, tileLine(lineOf(id), b.cols, 10), 16, `gap10:${id}`);
      const without = weekendStats(
        wide,
        tileLine(withoutTool(lineOf(id), a?.core ?? []), b.cols, 10),
        16,
        `gap10:${id}`,
      );
      // A line that removes all the HP either way shows its tool in the kills, one that kills no weekend in the HP.
      const share = withT.damageShare - without.damageShare;
      const kills = withT.winRate - without.winRate;
      expect(
        Math.max(share / 0.05, kills / 0.2),
        `${id}: ${String(share)} of the HP, ${String(kills)} of the kills`,
      ).toBeGreaterThanOrEqual(1);
    },
  );

  const mixed = (id: string) =>
    mixedServer(
      raidBossOf(id),
      lineOf(id),
      [lineOf(id)],
      20,
      60,
      `mixed:${id}`,
      first(id)?.core ?? [],
      [first(id)?.core ?? []],
    );

  it.each(RAID_BOSS_IDS)(
    '%s: a mixed server (2 min-maxers, 3 builders, 5 casual players) removes a good share of the HP, does not always win, and feels its losses more than a prepared team',
    (id) => {
      const r = mixed(id);
      expect(r.winRate, id).toBeLessThanOrEqual(0.9);
      expect(r.weekend.damageShare, id).toBeGreaterThanOrEqual(0.4);
      expect(r.weekend.damageShare, id).toBeLessThanOrEqual(0.97);
      // A mixed server feels losses more than a prepared team does.
      const prepared = weekendStats(raidBossOf(id), lineOf(id), 12, `mixed-cost:${id}`);
      expect(r.knockouts, id).toBeGreaterThan(3 * prepared.knockoutsTotal);
    },
  );
});
