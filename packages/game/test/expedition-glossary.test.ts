import { describe, expect, it } from 'vitest';
import { RULES, destinationDef, expeditionContent, glossaryEntry } from '../src/index';

/** The glossary texts that quote numbers must say what the rules and the content say; chances are words. */
describe('the glossary texts of the expeditions', () => {
  const text = (id: string): string => (glossaryEntry(id)?.lines ?? []).join(' ');
  const clock = (hour: number): string => `${String(hour).padStart(2, '0')}:00`;

  it('quotes the trips of the first familiarity star as they are, each star on its own bullet', () => {
    const fam = RULES.expeditions.familiarity;
    const lines = glossaryEntry('familiarity')?.lines ?? [];
    expect(lines.find((l) => l.startsWith('1 star'))).toContain(
      `${String(fam.tripsForStar1)} finished trips`,
    );
    for (const stars of ['1 star', '2 stars', '3 stars']) {
      expect(
        lines.filter((l) => l.includes(stars)),
        stars,
      ).toHaveLength(1);
    }
    // No bullet holds two star counts.
    for (const line of lines) {
      const counts = ['1 star', '2 stars', '3 stars'].filter((c) => line.includes(c));
      expect(counts.length, line).toBeLessThanOrEqual(1);
    }
    expect(glossaryEntry('familiarity')?.short).not.toMatch(/\d/);
  });

  it('keeps chances out of the expedition mechanics: words, never a percentage', () => {
    // Discovery is part of the fun (UX pass 1): how much faster a rank makes trips, the deeper area's
    // odds and the push-on odds are not shown as numbers.
    for (const id of [
      'explorer-rank',
      'familiarity',
      'deep-area',
      'push-on',
      'supplies',
      'goal-safe',
      'goal-risky',
      'milestone',
    ]) {
      const entry = glossaryEntry(id);
      expect(entry, id).toBeDefined();
      const text = [entry?.short ?? '', ...(entry?.lines ?? [])].join(' ');
      expect(text, id).not.toMatch(/%|percent|chance of \d/i);
    }
    const deep = (glossaryEntry('deep-area')?.lines ?? []).join(' ');
    expect(deep).toContain('rarer creatures can turn up');
    const risky = (glossaryEntry('goal-risky')?.lines ?? []).join(' ');
    expect(risky).toContain('Very risky');
  });

  it('quotes the supply crafting hours and levels as they are', () => {
    const hours = expeditionContent.supplies.map((s) => s.blueprint.hours);
    const levels = [...new Set(expeditionContent.supplies.map((s) => s.blueprint.craftingLevel))];
    levels.sort((a, b) => a - b);
    expect(text('job-supply')).toContain(
      `${String(Math.min(...hours))} to ${String(Math.max(...hours))} hours`,
    );
    const last = levels.pop();
    expect(text('job-supply')).toContain(`level ${levels.join(', ')} or ${String(last)}`);
  });

  it('quotes the places gates as they are', () => {
    const reef = destinationDef('moonlit-reef');
    if (reef === undefined) throw new Error('no Moonlit Reef');
    expect(text('destination-moonlit-reef')).toContain(
      `explorer rank ${String(reef.access.minRank)}`,
    );
    expect(text('destination-moonlit-reef')).toContain(
      `${clock(RULES.expeditions.night.fromHour)} to ${clock(RULES.expeditions.night.toHour)}`,
    );
    const crossroads = destinationDef('old-crossroads');
    if (crossroads === undefined) throw new Error('no Old Crossroads');
    expect(text('destination-old-crossroads')).toContain(
      `explorer rank ${String(crossroads.access.minRank)}`,
    );
  });
});
