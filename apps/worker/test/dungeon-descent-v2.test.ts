import { RULES } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { descentBreath } from '../src/dungeon-path';

const u = RULES.dungeon.undercroft;
const hpMax = { a: 100, b: 100 };
const before = { a: 0, b: 40 };

describe('the breath on the way down into the Undercroft', () => {
  it('gets a fallen creature back up on a v1 run', () => {
    const after = descentBreath(before, hpMax, 1);
    expect(after.a).toBe(Math.max(1, Math.floor((100 * u.reviveBp) / 10_000)));
  });

  it('leaves a fallen creature out on a v2 run (R14) and still heals the standing', () => {
    const v1 = descentBreath(before, hpMax, 1);
    const v2 = descentBreath(before, hpMax, 2);
    expect(v2.a).toBe(0);
    expect(v2.b).toBe(v1.b);
    expect(v2.b).toBeGreaterThan(40);
  });
});
