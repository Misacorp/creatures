/**
 * The set-effects measurement (`setMeasure.ts`, run by `scripts/sets.mjs`): a smoke test that it runs and that Deep Tracks shows in the
 * peak mark. The numbers themselves are printed, never asserted.
 */
import { SET_THREE_V2 } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { measure, setBoss, setsReport } from '../src/setMeasure';

describe('the set effects measurement', () => {
  it('lets four wearers stack a mark past x3 and nobody else', () => {
    setBoss(10, 1);
    const team = (wearers: number) => [
      ...[0, 1, 2, 3].map((i) => ({
        form: 'wickat',
        ...(i < wearers ? { gear: SET_THREE_V2['first-footprints']?.fx } : {}),
      })),
      { form: 'geyserpup', knack: 'all-at-once' },
      { form: 'geyserpup', knack: 'all-at-once' },
      { form: 'thornbuck', knack: 'night-watch' },
      { form: 'ashmole', knack: 'wide-warmth' },
    ];
    expect(measure(team(0), 2, 't').peak).toBe(3);
    expect(measure(team(4), 2, 't').peak).toBeGreaterThan(3);
  });

  it('prints a table for every set', () => {
    setBoss(10, 1);
    const text = setsReport(2).join('\n');
    for (const name of [
      'Deep Tracks',
      "Warden's Watch",
      'Hollow Weave',
      'Ridge Copper',
      'Hearth Helpers',
    ])
      expect(text).toContain(name);
  });
});
