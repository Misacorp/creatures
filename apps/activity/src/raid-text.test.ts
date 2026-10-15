import { content } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  gimmickLines,
  gimmickShort,
  gimmickText,
  phaseLine,
  phaseName,
  turnOrderText,
} from './raid-text';

describe('turnOrderText', () => {
  it('explains each order', () => {
    expect(turnOrderText('left_to_right')).toBe('Creatures act from left to right.');
    expect(turnOrderText('right_to_left')).toContain('right to left');
    expect(turnOrderText('speed')).toContain('Speed');
    expect(turnOrderText('something_new')).toContain('set order');
  });
});

describe('gimmicks in plain words', () => {
  it('describes every gimmick of every boss without leaking ids or basis points', () => {
    for (const boss of content.bosses) {
      for (const g of boss.gimmicks) {
        const text = gimmickText(g);
        expect(text.length).toBeGreaterThan(20);
        expect(text).not.toMatch(/\d{4,}/);
        expect(text).toMatch(/^Every/);
      }
    }
  });

  it('writes power as a percentage of attack', () => {
    const undertow = content.bosses.find((b) => b.id === 'tidal-colossus')?.gimmicks[0];
    expect(undertow).toBeDefined();
    if (undertow !== undefined) {
      expect(gimmickText(undertow)).toBe(
        'Every 3 rounds: hits every creature in the front zone for 80% of its attack.',
      );
    }
  });

  it('keeps the server gimmick names and tolerates unknown ids', () => {
    const lines = gimmickLines('tidal-colossus', [
      { id: 'undertow', name: 'Undertow' },
      { id: 'mystery', name: 'Mystery' },
    ]);
    expect(lines[0]?.text).toContain('front zone');
    expect(lines[0]).toMatchObject({
      op: 'hit_zone',
      short: 'Hits the front zone, every 3 rounds',
    });
    expect(lines[1]).toEqual({ id: 'mystery', name: 'Mystery', op: null, short: '', text: '' });
  });

  it('gives every gimmick of every boss a short label that is shorter than its sentence', () => {
    for (const boss of content.bosses) {
      for (const g of boss.gimmicks) {
        const short = gimmickShort(g);
        expect(short.length).toBeGreaterThan(8);
        expect(short.length).toBeLessThan(gimmickText(g).length);
        expect(short).not.toMatch(/\d{4,}/);
      }
    }
  });
});

describe('phaseName', () => {
  it('names the phases', () => {
    expect(phaseName('phase1')).toBe('Phase 1');
    expect(phaseName('finale')).toBe('Finale');
  });
});

describe('phaseLine', () => {
  it('writes the phase as a count for the stage head, and keeps the finale by name', () => {
    expect(phaseLine('phase1')).toBe('Phase 1 / 3');
    expect(phaseLine('phase2')).toBe('Phase 2 / 3');
    expect(phaseLine('finale')).toBe('Finale');
  });
});
