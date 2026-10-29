/** Armour is a species stat (R13, Misa 2026-10-28): every form has some, an evolution never lowers it. */
import { content } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { FORM_ARMOUR, STAT_OVERRIDES, formArmour, formStats } from '../src';

describe('armour per form', () => {
  it('every form has armour above zero, and the table lists no unknown form', () => {
    for (const c of content.creatures) {
      expect(FORM_ARMOUR[c.id], c.id).toBeGreaterThan(0);
      expect(Number.isInteger(FORM_ARMOUR[c.id]), c.id).toBe(true);
    }
    const ids = new Set(content.creatures.map((c) => c.id));
    for (const id of Object.keys(FORM_ARMOUR)) expect(ids.has(id), id).toBe(true);
  });

  it('formStats reads the table at every level, never a role default (the lab overrides apart)', () => {
    for (const c of content.creatures) {
      for (const level of [1, c.levelCap, c.levelCap + 5]) {
        expect(formStats(c.id, level).armour, `${c.id} Lv ${String(level)}`).toBe(
          STAT_OVERRIDES[c.id]?.armour ?? formArmour(c.id),
        );
      }
    }
  });

  it('an evolution never lowers armour, whatever the new role', () => {
    let pairs = 0;
    for (const c of content.creatures) {
      for (const evo of [c.evolvesTo, c.altEvolvesTo]) {
        if (!evo) continue;
        pairs += 1;
        expect(formArmour(evo.species), `${c.id} -> ${evo.species}`).toBeGreaterThanOrEqual(
          formArmour(c.id),
        );
      }
    }
    expect(pairs).toBeGreaterThan(10);
  });

  it('lines that start as Guards lean higher than the rest, and one species clearly has the most', () => {
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const stage1 = content.creatures.filter((c) => c.stage === 1);
    const guards = stage1.filter((c) => c.role === 'guard').map((c) => formArmour(c.id));
    const others = stage1.filter((c) => c.role !== 'guard').map((c) => formArmour(c.id));
    expect(avg(guards)).toBeGreaterThan(avg(others) * 1.5);
    const sorted = Object.entries(FORM_ARMOUR).sort((a, b) => b[1] - a[1]);
    expect(sorted[0]?.[0]).toBe('ancientshell');
    expect((sorted[0]?.[1] ?? 0) - (sorted[1]?.[1] ?? 0)).toBeGreaterThanOrEqual(5);
  });
});
