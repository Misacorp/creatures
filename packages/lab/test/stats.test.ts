/** The lab's stat overrides for combat v2 (fourth panel, 2026-10-28): small, documented, and read by `formStats`. */
import { content } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { FORM_ARMOUR, STAT_OVERRIDES, formStats } from '../src';

const shipped = (id: string) => content.creatures.find((c) => c.id === id);

describe('lab stat overrides', () => {
  it('the table is small and names real forms with sensible numbers', () => {
    const entries = Object.entries(STAT_OVERRIDES);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.length).toBeLessThanOrEqual(8);
    for (const [id, o] of entries) {
      expect(shipped(id), id).toBeDefined();
      if (o.atkBp !== undefined) {
        expect(o.atkBp, id).toBeGreaterThanOrEqual(5_000);
        expect(o.atkBp, id).toBeLessThanOrEqual(15_000);
      }
      if (o.armour !== undefined) expect(o.armour, id).toBeGreaterThan(0);
    }
  });

  it('formStats applies them: Attack is the shipped Attack scaled at every level, armour replaces the table’s', () => {
    for (const [id, o] of Object.entries(STAT_OVERRIDES)) {
      const c = shipped(id);
      if (!c) continue;
      for (const level of [1, 10, c.levelCap]) {
        const L = Math.min(level, c.levelCap);
        const base = c.baseStats.atk + c.growth.atk * (L - 1);
        const s = formStats(id, level);
        expect(s.atk, `${id} Lv ${String(level)}`).toBe(
          o.atkBp === undefined ? base : Math.floor((base * o.atkBp) / 10_000),
        );
        expect(s.armour, id).toBe(o.armour ?? FORM_ARMOUR[id]);
        // HP and Speed are never touched.
        expect(s.hp).toBe(c.baseStats.hp + c.growth.hp * (L - 1));
        expect(s.spd).toBe(c.baseStats.spd + c.growth.spd * (L - 1));
      }
    }
  });

  it('a form with no override keeps the shipped numbers', () => {
    const c = shipped('tidewing');
    expect(c).toBeDefined();
    if (!c) return;
    const s = formStats('tidewing', c.levelCap);
    expect(s.atk).toBe(c.baseStats.atk + c.growth.atk * (c.levelCap - 1));
    expect(s.armour).toBe(FORM_ARMOUR['tidewing']);
  });

  it('the stage 2 Payoffs, and Gaiadrake, are within about 10% of each other in Attack', () => {
    const payoffs = content.creatures.filter(
      (c) => c.role === 'payoff' && (c.stage === 2 || c.id === 'gaiadrake'),
    );
    expect(payoffs.map((c) => c.id).sort()).toEqual(
      ['bloomback', 'gaiadrake', 'geyserpup', 'pyrelynx', 'tempestray'].sort(),
    );
    const atk = payoffs.map((c) => formStats(c.id, 25).atk);
    expect(Math.max(...atk) / Math.min(...atk)).toBeLessThanOrEqual(1.11);
  });

  it('Ancientshell has its armour or its top Setter HP and Attack, not both: its armour is below the best Guard’s', () => {
    const shell = formStats('ancientshell', 25);
    const guards = content.creatures
      .filter((c) => c.role === 'guard')
      .map((c) => formStats(c.id, 25));
    const best = Math.max(...guards.map((g) => g.armour));
    expect(shell.armour).toBeLessThan(best);
    expect(shell.armour).toBeLessThanOrEqual(34);
    const setters = content.creatures.filter((c) => c.role === 'setter' && c.stage === 2);
    const topHp = Math.max(...setters.map((c) => formStats(c.id, 25).hp));
    expect(shell.hp).toBe(topHp);
  });
});
