/** The finale worth measure and the best-ability policy (`finaleWorth.ts`, `habits.ts`). */
import { describe, expect, it } from 'vitest';
import {
  HABIT_SETS,
  HABITS,
  HABITS_BEST_FINALE,
  bestAbilityFor,
  finaleActions,
} from '../src/habits';
import {
  WORTH_SETTINGS,
  planWorth,
  policiesOf,
  runWorthJob,
  worthMarkdown,
} from '../src/finaleWorth';
import { planJourney } from '../src/journey';
import { slotBoss } from '../src/track';

describe('the best finale ability', () => {
  it('purges a boss that resists an element, unless its arena is two rows, else a Shield Wall', () => {
    expect(bestAbilityFor({ mods: { adaptsElement: true }, rows: 3 })).toBe('purge');
    expect(bestAbilityFor({ mods: { adaptsElement: true }, rows: 2 })).toBe('shieldWall');
    expect(bestAbilityFor({ mods: { adapts: true }, rows: 3 })).toBe('shieldWall');
  });

  it('is read from the boss card for the first lap of the track and is never Rally', () => {
    for (let slot = 1; slot <= 5; slot++) expect(bestAbilityFor(slotBoss(slot))).not.toBe('rally');
  });

  it('is what a `best` policy fires, and a fixed wall can name its row', () => {
    const acts = finaleActions(
      [{ kind: 'best' }, { kind: 'fixed', ability: 'shieldWall', row: 2 }, { kind: 'none' }],
      8,
      (i) => `p${i}`,
      'purge',
    );
    expect(acts.map((a) => a.kind)).toEqual(['purge', 'shieldWall']);
    expect(acts[1]?.row).toBe(2);
  });

  it('is a habits set of its own: the daily roles pick, the casual role keeps the default', () => {
    expect(HABIT_SETS[HABITS_BEST_FINALE.id]).toBe(HABITS_BEST_FINALE);
    expect(HABITS_BEST_FINALE.finale.prepared.kind).toBe('best');
    expect(HABITS_BEST_FINALE.finale.casual).toEqual(HABITS.finale.casual);
    expect({ ...HABITS_BEST_FINALE, finale: HABITS.finale, id: HABITS.id }).toEqual(HABITS);
  });
});

describe('finale worth', () => {
  it('gives each setting its policies: one press by the first player, three kinds, a wall per row', () => {
    expect(policiesOf('none', 4, 3).every((p) => p.kind === 'none')).toBe(true);
    expect(policiesOf('rally', 4, 3).map((p) => p.kind)).toEqual(['fixed', 'none', 'none', 'none']);
    expect(policiesOf('allThree', 2, 3).map((p) => p.kind)).toEqual(['fixed', 'fixed']);
    expect(policiesOf('walls', 4, 3).map((p) => p.kind)).toEqual([
      'fixed',
      'fixed',
      'fixed',
      'none',
    ]);
    expect(policiesOf('best', 3, 3).every((p) => p.kind === 'best')).toBe(true);
  });

  it('plays a weekend that ends before the finale the same under every setting, and repeats', () => {
    // Slot 2 of the mixed server never reaches the finale at its week (the report's table), so no action can change it.
    const a = runWorthJob({ server: 'mixed', slot: 2, index: 0, settings: WORTH_SETTINGS });
    expect(a.none?.reached).toBe(false);
    for (const s of WORTH_SETTINGS) expect(a[s]).toEqual(a.none);
    expect(runWorthJob({ server: 'mixed', slot: 2, index: 0, settings: WORTH_SETTINGS })).toEqual(
      a,
    );
  });

  it('assembles a table with a row per slot and a by-boss summary', () => {
    const plan = planWorth({ quick: true, servers: 2, serverIds: ['mixed'], slots: [3, 4] });
    expect(plan.jobs).toHaveLength(4);
    const results = new Map(plan.jobs.map((j) => [j.id, runWorthJob(j.args)] as const));
    const report = plan.assemble(results);
    expect(report.data.cells.map((c) => c.slot)).toEqual([3, 4]);
    const md = worthMarkdown(report.data.cells, 2).join('\n');
    expect(md).toContain('### By boss');
    expect(md).toContain('| 3 | storm-sovereign |');
  });
});

describe('the journey plan with the best finale ability', () => {
  it('leaves the best-ability habits out of the default one-weekend kills and adds them when asked', () => {
    const ids = (habitSets?: string[]) =>
      new Set(
        planJourney({
          quick: true,
          servers: 1,
          compared: [],
          sizes: [],
          ...(habitSets ? { habitSets } : {}),
        }).jobs.map((j) => (j.args as { habits?: string }).habits),
      );
    expect(ids().has(HABITS_BEST_FINALE.id)).toBe(false);
    expect(ids([HABITS.id, HABITS_BEST_FINALE.id]).has(HABITS_BEST_FINALE.id)).toBe(true);
  });
});
