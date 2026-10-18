import { entryView } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { qualityText } from './gear-view';

/**
 * Misa (2026-10-18): players read a blueprint's marks as its quality, never "well-thumbed". The code keeps
 * the name `marks` (API fields, columns, `marksText`); only the words a player reads changed.
 */
const sources = import.meta.glob<string>(
  ['./*.tsx', './ui/*.tsx', './creature-page/*.tsx', './workbench/**/*.tsx'],
  { query: '?raw', import: 'default', eager: true },
);

describe('blueprint quality wording', () => {
  it('has no "thumbed" in any component the player sees', () => {
    const offenders = Object.entries(sources)
      .filter(([name]) => !name.includes('.test.'))
      .filter(([, source]) => /thumbed/i.test(source))
      .map(([name]) => name);
    expect(offenders).toEqual([]);
  });

  it('explains it in the glossary, in one short line, under its new name', () => {
    const quality = entryView('blueprint-quality');
    expect(quality?.title).toBe('Blueprint quality');
    expect(quality?.lines).toContain(
      "Each point of a blueprint's quality makes its crafts 1% likelier to come out one rarity better, up to 10.",
    );
    expect(entryView('well-thumbed')).toBeUndefined();
  });

  it('writes the count as "Quality 3 / 10", with a slash', () => {
    expect(qualityText(3)).toBe('Quality 3 / 10');
  });
});
