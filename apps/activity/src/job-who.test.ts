import { describe, expect, it } from 'vitest';
import { sampleRoster } from './creature-card-sample';
import { jobWho } from './job-who';

const roster = sampleRoster(6);
const at = (levels: number[]) =>
  roster.map((c, i) => ({ creatureId: c.id, xp: 0, level: levels[i] ?? 1, nextLevelXp: null }));
const hours = (level: number): number => (10 - level) * 3_600_000;
const ids = (list: { creature: { id: string } }[]): string[] => list.map((o) => o.creature.id);
const job = { kind: 'job', id: 'j' } as const;

describe('jobWho: who can do a job', () => {
  it('lists the free creatures at the level best first, busy ones greyed, and folds the rest', () => {
    const creatures = roster.map((c, i) => (i === 1 ? { ...c, busy: job } : c));
    const who = jobWho(creatures, at([3, 5, 4, 1, 2, 3]), hours, 3);
    // Free at the level: s0 (3), s2 (4), s5 (3): best crafter first, ties keep the roster's order.
    expect(ids(who.able)).toEqual(['sample-2', 'sample-0', 'sample-5']);
    expect(who.able.every((o) => o.busy === null)).toBe(true);
    expect(who.able[0]?.durationMs).toBe(hours(4));
    expect(ids(who.busy)).toEqual(['sample-1']);
    expect(who.busy[0]?.busy).toBe('On a job');
    expect(ids(who.tooLow)).toEqual(['sample-4', 'sample-3']);
    expect(who.tooLow.map((o) => o.busy)).toEqual([
      'Needs Crafting level 3',
      'Needs Crafting level 3',
    ]);
    expect(who.summary).toBe('2 more need Crafting level 3');
    expect(who.pick).toBe('sample-2');
    expect(who.blocker).toBeNull();
  });

  it('says "1 more needs" for one, and nothing when nobody is under the level', () => {
    const one = jobWho(roster.slice(0, 2), at([4, 1]), hours, 3);
    expect(one.summary).toBe('1 more needs Crafting level 3');
    const none = jobWho(roster, at([3, 3, 3, 3, 3, 3]), hours, 3);
    expect(none.summary).toBeNull();
    expect(none.tooLow).toEqual([]);
  });

  it('puts a busy creature under the level in the fold, not in the busy list', () => {
    const creatures = roster.map((c, i) => (i === 3 ? { ...c, away: true } : c));
    const who = jobWho(creatures, at([4, 1, 1, 1, 1, 1]), hours, 3);
    expect(ids(who.busy)).toEqual([]);
    expect(ids(who.tooLow)).toContain('sample-3');
    expect(who.tooLow.find((o) => o.creature.id === 'sample-3')?.busy).toBe(
      'Needs Crafting level 3',
    );
  });

  it('has no pick and says why when everyone at the level is busy but a lower one is free (the old silent grey)', () => {
    const creatures = roster.map((c, i) => (i < 2 ? { ...c, busy: job } : c));
    const who = jobWho(creatures, at([5, 4, 1, 1, 1, 1]), hours, 3);
    expect(who.able).toEqual([]);
    expect(who.pick).toBeNull();
    expect(ids(who.busy)).toEqual(['sample-0', 'sample-1']);
    expect(who.blocker).toBe('Nobody free has Crafting level 3.');
    expect(who.summary).toBe('4 more need Crafting level 3');
  });

  it('says the level is needed when nobody has it at all', () => {
    const who = jobWho(roster, at([1, 1, 1, 1, 1, 1]), hours, 3);
    expect(who.blocker).toBe('Needs Crafting level 3.');
    expect(who.summary).toBe('6 need Crafting level 3');
  });

  it('leaves the "no creature" case to the start blocker', () => {
    expect(jobWho([], [], hours, 1).blocker).toBeNull();
  });
});
