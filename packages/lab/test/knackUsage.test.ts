/** Knack usage read within the form (`knackUsage.ts`). */
import { describe, expect, it } from 'vitest';
import { FORM_KNACKS } from '../src/knacks';
import { formPickCounts, withinFormRatio } from '../src/knackUsage';

describe('within-form ratio', () => {
  it('counts every pick of a form, whatever its Knack', () => {
    const counts = formPickCounts([
      [{ formId: 'tidewing' }, { formId: 'ancientshell' }],
      [{ formId: 'ancientshell' }],
    ]);
    expect(counts.get('ancientshell')).toBe(2);
    expect(counts.get('tidewing')).toBe(1);
    expect(counts.get('fogwyrm')).toBeUndefined();
  });

  it('is 1 for a Knack picked as often as random among its form’s choices, "no Knack" counted as one', () => {
    // Ancientshell has three Knacks and no Knack: four choices, so 8 picks of the form give 2 to each at random.
    expect(FORM_KNACKS['ancientshell']).toHaveLength(3);
    const formPicks = new Map([['ancientshell', 8]]);
    expect(withinFormRatio('living-shelter', 2, formPicks)).toBe(1);
    expect(withinFormRatio('living-shelter', 4, formPicks)).toBe(2);
    expect(withinFormRatio('living-shelter', 0, formPicks)).toBe(0);
  });

  it('does not follow how often the form is picked: a popular form’s Knack reads the same share', () => {
    expect(withinFormRatio('thick-fog', 3, new Map([['fogwyrm', 12]]))).toBe(1);
    expect(withinFormRatio('thick-fog', 30, new Map([['fogwyrm', 120]]))).toBe(1);
  });

  it('adds the choices of every form that can equip the Knack, and is 0 when none of them was picked', () => {
    const shared = Object.entries(FORM_KNACKS)
      .filter(([, ks]) => ks.includes('wide-reach'))
      .map(([f]) => f);
    expect(shared.length).toBeGreaterThan(1);
    expect(withinFormRatio('wide-reach', 5, new Map())).toBe(0);
    const formPicks = new Map(shared.map((f) => [f, 10] as [string, number]));
    const expected = shared.reduce((n, f) => n + 10 / ((FORM_KNACKS[f]?.length ?? 0) + 1), 0);
    expect(withinFormRatio('wide-reach', expected, formPicks)).toBeCloseTo(1, 10);
  });

  it('reads "no Knack" over every form', () => {
    const formPicks = new Map([
      ['ancientshell', 4],
      ['tidewing', 5],
    ]);
    // Random gives each form's "no Knack" a share of 1 over its choices: 4 / 4 + 5 / 5.
    expect(withinFormRatio('none', 2, formPicks)).toBe(1);
  });
});
