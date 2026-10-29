/**
 * The intended answers of the raid bosses: legal rosters, named Knack tools, and every answer's own tool is tested.
 */
import { describe, expect, it } from 'vitest';
import {
  BOSS_ANSWERS,
  KNACKS,
  RAID_BOSS_IDS,
  TOOL_DROP_MIN,
  TOOL_SHARE_MIN,
  ROBUST_SHARE,
  COMMON_OR_CLASSIC_FORMS,
  robustnessOf,
  toolCost,
  TALENTS,
  answerLine,
  answerProblems,
  mostCopies,
  raidBossOf,
  raidMode,
  weekendScore,
  weekendStats,
  classicFor,
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
      const b = raidBossOf(id);
      const score = weekendScore(b);
      const classic = score(classicFor(raidMode(b)), 16, `ans:${id}`).score;
      for (const a of BOSS_ANSWERS[id] ?? []) {
        const baseline = a.talent
          ? score(
              classicFor(raidMode(b)).map((p) => ({ ...p, talents: [a.talent as string] })),
              16,
              `ans:${id}`,
            ).score
          : classic;
        expect(score(answerLine(a.line), 16, `ans:${id}`).score, a.label).toBeGreaterThan(baseline);
      }
    },
  );

  it.each(RAID_BOSS_IDS)(
    '%s: a prepared team removes nearly all of the boss’s HP and kills most weekends, and the classic party never kills',
    (id) => {
      const b = raidBossOf(id);
      const classic = weekendStats(b, classicFor(raidMode(b)), 16, `win:${id}`);
      expect(classic.winRate).toBe(0);
      expect(classic.damageShare, id).toBeLessThanOrEqual(0.8);
      // The primary measure (Misa, 2026-10-29) is the share of the HP removed; the kill is the cliff beside it.
      for (const a of BOSS_ANSWERS[id] ?? []) {
        const w = weekendStats(b, answerLine(a.line), 24, `win:${id}`);
        expect(w.damageShare, `${id}: ${a.label}`).toBeGreaterThanOrEqual(0.9);
        expect(w.tiers.t2, `${id}: ${a.label}`).toBeGreaterThanOrEqual(0.6);
      }
      const first = BOSS_ANSWERS[id]?.[0];
      expect(
        weekendStats(b, answerLine(first?.line ?? ''), 24, `win:${id}`).winRate,
        id,
      ).toBeGreaterThanOrEqual(0.6);
    },
  );
});

describe('every answer’s own tool is tested (panel 5, finding 3)', () => {
  for (const id of RAID_BOSS_IDS)
    BOSS_ANSWERS[id]?.forEach((a, k) => {
      const name = `${id}: ${a.tool}`;
      it(`${name} (${a.label}) removes at least ${String(TOOL_SHARE_MIN * 100)} points more of the boss's HP with its tool${k === 0 ? ` and loses ${String(TOOL_DROP_MIN)} points of kill rate without it` : ''}`, () => {
        expect(a.core?.length, `${name} names no tool`).toBeGreaterThan(0);
        const t = toolCost(raidBossOf(id), a, answerLine(a.line), 40, `tool-all:${id}:${a.tool}`);
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
      const first = BOSS_ANSWERS[id]?.[0];
      const r = robustnessOf(raidBossOf(id), answerLine(first?.line ?? ''), 48, 8, `rob:${id}`);
      expect(r.random.damageShare, id).toBeGreaterThanOrEqual(ROBUST_SHARE);
      // Written talents are better than random ones, but by a share of the HP, not by the whole weekend.
      expect(r.written.damageShare - r.random.damageShare, id).toBeLessThanOrEqual(0.2);
    }
  });
});
