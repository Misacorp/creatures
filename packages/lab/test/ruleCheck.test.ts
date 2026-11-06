/** The boss rules report (`ruleCheck.ts`): the check on made-up numbers and the plan's shape. The fights themselves are `report -- --rules`. */
import { describe, expect, it } from 'vitest';
import { RAID_BOSS_IDS } from '../src/bosses';
import { validateJobs } from '../src/jobs';
import { planRules, ruleMarkdown, ruleMisses, type RuleJobResult } from '../src/ruleCheck';
import { RULE_TARGETS, TARGET_RANKS } from '../src/targets';

const boss = RAID_BOSS_IDS[0] ?? '';

/** A result whose every measure sits exactly on the bound that every rule of the rank accepts (min, else max). */
function onTheBound(rank: 'low' | 'mid' | 'high'): RuleJobResult {
  const values: Record<string, number> = {};
  for (const t of RULE_TARGETS[rank])
    if (!t.bosses || t.bosses.includes(boss))
      values[t.measure] = t.strictMin ? (t.min ?? 0) + 0.01 : (t.min ?? t.max ?? 0);
  return { boss, rank, values, weekends: 0 };
}

describe('the boss rules report', () => {
  it('lists a rule a value misses, with its bound, and nothing when every value is inside', () => {
    const ok = onTheBound('high');
    expect(ruleMisses([ok]).misses).toEqual([]);
    expect(ruleMisses([ok]).checked).toBeGreaterThan(10);
    const target = RULE_TARGETS.high.find((t) => t.min !== undefined && !t.bosses);
    if (!target) throw new Error('no rule with a minimum');
    const bad: RuleJobResult = {
      ...ok,
      values: { ...ok.values, [target.measure]: (target.min ?? 0) - 0.1 },
    };
    const { misses } = ruleMisses([bad]);
    expect(misses.map((m) => m.measure)).toContain(target.measure);
    expect(ruleMarkdown([bad], false).join('\n')).toContain(
      `MISS ${boss} (high) \`${target.measure}\``,
    );
    expect(ruleMarkdown([ok], false).join('\n')).toContain('all met');
  });

  it('does not check a measure that was not taken', () => {
    expect(ruleMisses([{ boss, rank: 'mid', values: {}, weekends: 0 }])).toEqual({
      checked: 0,
      misses: [],
    });
  });

  it('is one job a boss and rank, with unique ids', () => {
    const plan = planRules({ quick: true });
    expect(plan.jobs).toHaveLength(RAID_BOSS_IDS.length * TARGET_RANKS.length);
    expect(() => validateJobs(plan.jobs)).not.toThrow();
  });
});
