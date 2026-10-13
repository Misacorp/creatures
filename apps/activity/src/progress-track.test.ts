import { describe, expect, it } from 'vitest';
import { glyph } from './glyphs';
import { MAX_LABEL, trackNodes, type TrackStep } from './progress-track';

const steps: TrackStep[] = [1, 2, 3, 4, 5].map((n) => ({
  id: n,
  label: `Rank ${String(n)}`,
  unlocks: n === 1 ? [] : [{ icon: 'clock', text: `Thing ${String(n)}` }],
}));

const roles = (index: number): string[] => trackNodes(steps, index).map((n) => n.role);
const labels = (index: number): string[] => trackNodes(steps, index).map((n) => n.label);

describe('trackNodes', () => {
  it('shows the previous, the current and the next step in the middle', () => {
    expect(roles(2)).toEqual(['previous', 'current', 'next']);
    expect(labels(2)).toEqual(['Rank 2', 'Rank 3', 'Rank 4']);
  });

  it('has no previous at the first step', () => {
    expect(roles(0)).toEqual(['current', 'next']);
    expect(labels(0)).toEqual(['Rank 1', 'Rank 2']);
  });

  it('closes with a Max node at the last step and has no next', () => {
    expect(roles(4)).toEqual(['previous', 'current', 'max']);
    const last = trackNodes(steps, 4).at(-1);
    expect(last?.label).toBe(MAX_LABEL);
    expect(last?.unlocks).toEqual([]);
  });

  it('never shows anything past the next step', () => {
    for (let i = 0; i < steps.length; i++) {
      const shown = trackNodes(steps, i).map((n) => n.label);
      expect(shown).not.toContain(`Rank ${String(i + 3)}`);
      expect(shown.length).toBeLessThanOrEqual(3);
    }
  });

  it('clamps the current index and copes with no steps', () => {
    expect(labels(-3)).toEqual(['Rank 1', 'Rank 2']);
    expect(labels(99)).toEqual(['Rank 4', 'Rank 5', MAX_LABEL]);
    expect(labels(1.9)).toEqual(['Rank 1', 'Rank 2', 'Rank 3']);
    expect(trackNodes([], 0)).toEqual([]);
  });

  it('works with a single step', () => {
    expect(trackNodes(steps.slice(0, 1), 0).map((n) => n.role)).toEqual(['current', 'max']);
  });

  it('gives every node a unique key', () => {
    for (let i = 0; i < steps.length; i++) {
      const keys = trackNodes(steps, i).map((n) => n.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('the track fixture', () => {
  it('uses glyph ids that exist (sanity check of the fixture)', () => {
    expect(glyph('clock')).toBeDefined();
  });
});
