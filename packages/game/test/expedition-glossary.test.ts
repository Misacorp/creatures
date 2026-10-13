import { describe, expect, it } from 'vitest';
import { RULES, destinationDef, expeditionContent, glossaryEntry } from '../src/index';

/** The glossary texts quote numbers; they must say what the rules and the content say. */
describe('the glossary texts that name numbers', () => {
  const text = (id: string): string => (glossaryEntry(id)?.lines ?? []).join(' ');
  const pct = (bp: number): string => `${String(bp / 100)}%`;
  const clock = (hour: number): string => `${String(hour).padStart(2, '0')}:00`;

  it('quotes familiarity, the deeper area and explorer rank as they are', () => {
    const fam = RULES.expeditions.familiarity;
    expect(text('familiarity')).toContain(`${String(fam.tripsForStar1)} finished trips`);
    expect(text('deep-area')).toContain(`${pct(fam.deepChanceBp[1] as number)} with 1 star`);
    expect(text('deep-area')).toContain(`${pct(fam.deepChanceBp[3] as number)} with 3 stars`);
    expect(text('explorer-rank')).toContain(
      `${pct(RULES.expeditions.rank.speedBpPerRank)} shorter`,
    );
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
