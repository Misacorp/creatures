/**
 * The intended answers of the raid bosses: legal rosters, named Knack tools, and every answer's own tool is tested.
 */
import { describe, expect, it } from 'vitest';
import {
  ANSWER_CLASSIC_KILL_MAX,
  ANSWER_CLASSIC_SHARE_MAX,
  ANSWER_FIRST_KILL_MIN,
  ANSWER_SHARE_MIN,
  ANSWER_T2_MIN,
  ROBUST_GAP_MAX,
  ROBUST_SHARE,
  TOOL_DROP_MIN,
  TOOL_SHARE_MIN,
} from '../src/targets';
import {
  BOSS_ANSWERS,
  KNACKS,
  RAID_BOSS_IDS,
  COMMON_OR_CLASSIC_FORMS,
  answerToolCost,
  answersBeat,
  answersWin,
  robustRule,
  TALENTS,
  answerLine,
  answerProblems,
  mostCopies,
  raidBossOf,
} from '../src';

describe('the intended answers (P-13)', () => {
  it.each(RAID_BOSS_IDS)(
    '%s has two or more answers on different tools, each a legal full arena of legal rosters',
    (id) => {
      const answers = BOSS_ANSWERS[id] ?? [];
      expect(answers.length).toBeGreaterThanOrEqual(2);
      expect(new Set(answers.map((a) => a.tool)).size).toBeGreaterThanOrEqual(2);
      const b = raidBossOf(id);
      for (const a of answers) {
        const line = answerLine(a.line);
        expect(line, a.label).toHaveLength(b.rows * b.cols);
        // Only Knacks the form can equip and talents from its line's pool that work for its role (panel 4).
        expect(answerProblems(line), a.label).toEqual([]);
        expect(mostCopies(line), a.label).toBeLessThanOrEqual(4);
        for (const p of line)
          for (const t of p.talents ?? []) expect(TALENTS[t], `talent ${t}`).toBeDefined();
      }
      // One answer a table of four can bring: at most two copies of any form.
      expect(answers.some((a) => mostCopies(answerLine(a.line)) <= 2)).toBe(true);
      // An answer built on a Knack, not only on talents.
      expect(
        answers.some((a) => !a.tool.startsWith('talent:') && (a.core ?? []).some((c) => KNACKS[c])),
      ).toBe(true);
    },
  );

  it.each(RAID_BOSS_IDS)(
    '%s: its first answer needs no rare evolved form: only common species and the classic party’s Tempestray (panel 5, finding 10)',
    (id) => {
      const first = BOSS_ANSWERS[id]?.[0];
      expect(first, id).toBeDefined();
      const rare = answerLine(first?.line ?? '').filter(
        (p) => !COMMON_OR_CLASSIC_FORMS.includes(p.formId),
      );
      expect(
        rare.map((p) => p.formId),
        `${id}: ${first?.label ?? ''}`,
      ).toEqual([]);
      expect(mostCopies(answerLine(first?.line ?? ''))).toBeLessThanOrEqual(2);
    },
  );

  it('the answers name their Knack tools, and no tool answers more than two bosses', () => {
    const bosses = new Map<string, Set<string>>();
    for (const [id, answers] of Object.entries(BOSS_ANSWERS))
      for (const a of answers) {
        for (const c of a.core ?? [])
          expect(KNACKS[c] ?? TALENTS[c.replace('talent:', '')], c).toBeDefined();
        bosses.set(a.tool, (bosses.get(a.tool) ?? new Set()).add(id));
      }
    for (const [tool, ids] of bosses) expect(ids.size, tool).toBeLessThanOrEqual(2);
  });

  it.each(RAID_BOSS_IDS)(
    '%s: every intended answer beats the classic party over weekends',
    (id) => {
      // The measure (`answersBeat`, raidRules.ts): each answer's weekend score minus the baseline it has to beat (the bare classic
      // party, or with the answer's talent); the answer beats it when that is above 0.
      for (const a of answersBeat(id, raidBossOf(id))) expect(a.margin, a.label).toBeGreaterThan(0);
    },
  );

  it.each(RAID_BOSS_IDS)(
    '%s: a prepared team removes nearly all of the boss’s HP and kills most weekends, and the classic party never kills',
    (id) => {
      const r = answersWin(id, raidBossOf(id));
      expect(r.classicKill).toBe(ANSWER_CLASSIC_KILL_MAX);
      expect(r.classicShare, id).toBeLessThanOrEqual(ANSWER_CLASSIC_SHARE_MAX);
      // The primary measure (Misa, 2026-10-29) is the share of the HP removed; the kill is the cliff beside it.
      for (const w of r.answers) {
        expect(w.share, `${id}: ${w.label}`).toBeGreaterThanOrEqual(ANSWER_SHARE_MIN);
        expect(w.t2, `${id}: ${w.label}`).toBeGreaterThanOrEqual(ANSWER_T2_MIN);
      }
      expect(r.answers[0]?.kill, id).toBeGreaterThanOrEqual(ANSWER_FIRST_KILL_MIN);
    },
  );
});

describe('every answer’s own tool is tested (panel 5, finding 3)', () => {
  for (const id of RAID_BOSS_IDS)
    BOSS_ANSWERS[id]?.forEach((a, k) => {
      const name = `${id}: ${a.tool}`;
      it(`${name} (${a.label}) removes at least ${String(TOOL_SHARE_MIN * 100)} points more of the boss's HP with its tool${k === 0 ? ` and loses ${String(TOOL_DROP_MIN)} points of kill rate without it` : ''}`, () => {
        expect(a.core?.length, `${name} names no tool`).toBeGreaterThan(0);
        const t = answerToolCost(id, k, raidBossOf(id));
        expect(
          t.shareDrop,
          `${name}: ${String(Math.round(100 * t.shareWith))}% of the HP with, ${String(Math.round(100 * t.shareWithout))}% without`,
        ).toBeGreaterThanOrEqual(TOOL_SHARE_MIN * 100);
        if (k === 0)
          expect(
            t.drop,
            `${name}: kill ${String(Math.round(100 * t.withTool))}% with, ${String(Math.round(100 * t.without))}% without`,
          ).toBeGreaterThanOrEqual(TOOL_DROP_MIN);
      });
    });

  it('the prepared line with random legal talents still removes most of the HP: talents do not decide the weekend (panel 5, finding 4)', () => {
    for (const id of RAID_BOSS_IDS) {
      const r = robustRule(id, raidBossOf(id));
      expect(r.random, id).toBeGreaterThanOrEqual(ROBUST_SHARE);
      // Written talents are better than random ones, but by a share of the HP, not by the whole weekend.
      expect(r.written - r.random, id).toBeLessThanOrEqual(ROBUST_GAP_MAX);
    }
  });
});
