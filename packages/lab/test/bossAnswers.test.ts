/**
 * The intended answers of the raid bosses: legal rosters, named Knack tools, and every answer's own tool is tested.
 */
import { describe, expect, it } from 'vitest';
import {
  BOSS_ANSWERS,
  KNACKS,
  RAID_BOSS_IDS,
  COMMON_OR_CLASSIC_FORMS,
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
});

describe('every answer names its own tool (panel 5, finding 3)', () => {
  // How much each tool is worth, the answers' kills and shares, the prepared line with random talents and whether every answer beats
  // the classic party are measured, not unit-tested: `report -- --rules` (`ruleCheck.ts`, measures `answers.*` and `robust.*`).
  for (const id of RAID_BOSS_IDS)
    BOSS_ANSWERS[id]?.forEach((a) => {
      it(`${id}: ${a.tool} (${a.label}) names the Knacks or talents that are its tool`, () => {
        expect(a.core?.length, `${id}: ${a.tool} names no tool`).toBeGreaterThan(0);
      });
    });
});
