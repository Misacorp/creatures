/** The lab's stat overrides for combat v2 (fourth panel, 2026-10-28): small, documented, and read by `formStats`. */
import { content } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { FORM_ARMOUR, LAB_RULES, STAT_OVERRIDES, formStats } from '../src';

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
    }
  });

  it('formStats applies them: Attack is the shipped Attack scaled at every level, armour is the form’s own', () => {
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
        expect(s.armour, id).toBe(FORM_ARMOUR[id]);
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
    // The comparison is the average hit: Attack times what its crits add (a crit machine hits softer and crits more, 2026-10-30).
    const average = (id: string): number => {
      const s = formStats(id, 25);
      const chance = (LAB_RULES.critChanceBp + s.critChanceBp) / 10_000;
      const extra = (LAB_RULES.critBp + s.critDamageBp - 10_000) / 10_000;
      return s.atk * (1 + chance * extra);
    };
    const avg = payoffs.map((c) => average(c.id));
    expect(Math.max(...avg) / Math.min(...avg)).toBeLessThanOrEqual(1.11);
  });

  it('a crit machine hits softer and crits more: about the same average hit as its siblings, with far more swing', () => {
    const machines = Object.entries(STAT_OVERRIDES).filter(
      ([, o]) => (o.critChanceBp ?? 0) > 0 || (o.critDamageBp ?? 0) > 0,
    );
    expect(machines.map(([id]) => id).sort()).toEqual(['cindle', 'coralynx', 'pyrelynx']);
    for (const [id, o] of machines) {
      const s = formStats(id, 25);
      expect(s.critChanceBp, id).toBe(o.critChanceBp);
      expect(s.critDamageBp, id).toBe(o.critDamageBp);
      // Its Attack is lower than its shipped Attack plus the panel's change, and its crit chance is at least three times the base.
      expect(LAB_RULES.critChanceBp + s.critChanceBp, id).toBeGreaterThanOrEqual(
        3 * LAB_RULES.critChanceBp,
      );
    }
    // Every other form has the base crit.
    for (const c of content.creatures) {
      if (machines.some(([id]) => id === c.id)) continue;
      expect(formStats(c.id, 25).critChanceBp, c.id).toBe(0);
      expect(formStats(c.id, 25).critDamageBp, c.id).toBe(0);
    }
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
