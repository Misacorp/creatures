import { describe, expect, it } from 'vitest';
import type { PhaseResultView } from './raid-api';
import {
  CLEARED_GLYPH,
  MISSED_GLYPH,
  showFullResults,
  stepMark,
  stepMarks,
  toggleMark,
} from './raid-timeline';

function result(phase: PhaseResultView['phase'], cleared: boolean, essence = 12): PhaseResultView {
  return {
    phase,
    at: 1,
    cleared,
    rounds: 5,
    bossHpMax: 100,
    bossHpStart: 100,
    bossHpEnd: cleared ? 0 : 40,
    damage: 60,
    reactions: 2,
    top: [],
    essence,
    rankChange: null,
    festivalGrant: null,
  };
}

describe('stepMark', () => {
  it('ticks a cleared phase and crosses one that was not cleared, with a short result', () => {
    const win = stepMark(result('phase1', true));
    expect(win.glyph).toBe(CLEARED_GLYPH);
    expect(win.summary).toBe('Phase 1: cleared. You got 12 Essence.');
    const loss = stepMark(result('phase2', false, 0));
    expect(loss.glyph).toBe(MISSED_GLYPH);
    expect(loss.summary).toBe('Phase 2: not cleared. You got 0 Essence.');
    expect(loss.label).toBe('Phase 2: not cleared. Show result.');
  });
});

describe('stepMarks', () => {
  it('has a mark only for the phases that were fought', () => {
    const marks = stepMarks([result('phase1', true)]);
    expect(Object.keys(marks)).toEqual(['phase1']);
    expect(stepMarks([])).toEqual({});
  });
});

describe('showFullResults', () => {
  it('waits for the finale', () => {
    expect(showFullResults([])).toBe(false);
    expect(showFullResults([result('phase1', true), result('phase2', true)])).toBe(false);
    expect(showFullResults([result('phase1', true), result('finale', false)])).toBe(true);
  });
});

describe('toggleMark', () => {
  it('opens a tapped mark, closes it on a second tap and switches between marks', () => {
    expect(toggleMark(null, 'phase1')).toBe('phase1');
    expect(toggleMark('phase1', 'phase1')).toBeNull();
    expect(toggleMark('phase1', 'phase2')).toBe('phase2');
  });
});
