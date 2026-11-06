import { TRIALS } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { glyph } from '../glyphs';
import { sampleTrial } from './school-sample';
import {
  BOX_GLYPHS,
  honourName,
  honourTitle,
  nextTrial,
  trialLabel,
  trialNote,
} from './honours-view';

/** The trial or a failed test. */
function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('expected a value');
  return value;
}

describe('the title and the honour', () => {
  it('names the metals, and the title is "Pip, Silver"', () => {
    expect([1, 2, 3].map(honourName)).toEqual(['Bronze', 'Silver', 'Gold']);
    expect(honourName(0)).toBeNull();
    expect(honourTitle('Pip', 2)).toBe('Pip, Silver');
    expect(honourTitle('Pip', 0)).toBe('Pip');
  });
});

describe('the next trial as pips and a list', () => {
  it('is only the next trial: Bronze for a creature with none, with its boxes ticked in order', () => {
    const next = nextTrial(sampleTrial({ ticked: 2 }));
    expect(next?.name).toBe('Bronze');
    expect(next?.level).toBe(10);
    expect(next?.rows.map((r) => r.ticked)).toEqual([true, true, false, false]);
    expect(next?.ticked).toBe(2);
    expect(trialLabel(must(next))).toBe('Bronze trial, 2 of 4 boxes ticked');
  });

  it('moves up with each honour: Silver after Bronze, Gold after Silver, and nothing once Gold is held', () => {
    expect(nextTrial(sampleTrial({ honour: 1 }))?.name).toBe('Silver');
    expect(nextTrial(sampleTrial({ honour: 2 }))?.name).toBe('Gold');
    expect(nextTrial(sampleTrial({ honour: 3 }))).toBeNull();
    expect(nextTrial(undefined)).toBeNull();
  });

  it('says a ready trial graduates at the next ceremony', () => {
    const next = nextTrial(sampleTrial({ ready: true }));
    expect(trialLabel(must(next))).toContain('graduates at the next ceremony');
    expect(trialNote(must(next), 12)).toContain('graduates at the next ceremony');
  });

  it('says the boxes tick from the level for a creature below it, never "locked"', () => {
    const next = must(nextTrial(sampleTrial({ ticked: 0 })));
    expect(trialNote(next, 4)).toBe('The boxes tick from level 10.');
    expect(trialNote(next, 12)).toMatch(/lives its life/);
    expect(trialNote(next, 4)).not.toMatch(/lock|gate|need/i);
  });

  it('has a picture and a line for every box of every trial, and every picture is a real glyph', () => {
    for (const trial of TRIALS) {
      const next = nextTrial({
        honour: (trial.tier - 1) as 0 | 1 | 2,
        tier: trial.tier,
        boxes: trial.boxes.map(() => false),
        ready: false,
      });
      expect(next?.rows).toHaveLength(trial.boxes.length);
      for (const row of next?.rows ?? []) expect(row.label.length).toBeGreaterThan(3);
    }
    for (const id of BOX_GLYPHS) expect(glyph(id), id).toBeDefined();
  });
});
