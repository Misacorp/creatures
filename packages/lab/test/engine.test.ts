/**
 * The legal-talent check (R20: the line pool, and the role): content. The engine rules fixed after the fourth design panel (Charged,
 * Guards and Night Watch, row ends, Taunt, anchors, Element Resistance, once-per-weekend Catch Breath, the escalation rules R22, counts
 * per columns) are proved in the engine tests (`packages/engine/test/v2-*.test.ts`).
 */
import { describe, expect, it } from 'vitest';
import {
  BOSS_ANSWERS,
  CLASSIC_LINE,
  TALENTS,
  answerLine,
  assertLegalTalents,
  illegalTalents,
  legalTalents,
} from '../src';

describe('legal talents (R20: the line pool, and the role)', () => {
  it('a creature may carry only talents of its line pool that work for its role', () => {
    // Thornbuck is a Sproutle-line Guard: Brace is in the pool and works for every role; Sharp Claws is not in the pool.
    expect(legalTalents('thornbuck')).toContain('brace');
    expect(legalTalents('thornbuck')).not.toContain('sharp-claws');
    // A pool talent that is idle for the role is not legal: Triage is a Support talent.
    expect(legalTalents('thornbuck')).not.toContain('triage');
    for (const form of ['tidewing', 'tempestray', 'thornbuck', 'sunfawn'])
      for (const t of legalTalents(form)) expect(TALENTS[t]).toBeDefined();
    expect(illegalTalents([{ formId: 'tidewing', talents: ['brace'] }])).toEqual([
      { formId: 'tidewing', talent: 'brace', why: 'not in the splashet pool' },
    ]);
    expect(() =>
      assertLegalTalents([{ formId: 'thornbuck', talents: ['brace'] }], 'x'),
    ).not.toThrow();
    expect(() =>
      assertLegalTalents([{ formId: 'tidewing', talents: ['brace'] }], 'a line'),
    ).toThrow(/a line: illegal talents: tidewing carries brace/);
  });

  it('no written answer or other fixed line carries an illegal talent', () => {
    const bad: string[] = [];
    for (const [boss, answers] of Object.entries(BOSS_ANSWERS))
      for (const a of answers)
        for (const i of illegalTalents(answerLine(a.line)))
          bad.push(`${boss} / ${a.label}: ${i.formId} carries ${i.talent} (${i.why})`);
    for (const i of illegalTalents(CLASSIC_LINE))
      bad.push(`classic line: ${i.formId} carries ${i.talent} (${i.why})`);
    expect(bad).toEqual([]);
  });
});
