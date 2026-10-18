import type { ItemLine } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import type { GearItem } from '../gear-types';
import { sampleItem } from './bag-sample';
import { diffItems, lineKey, statDelta } from './compare-diff';

/**
 * The inline compare of the picker's item card (the selected item against the worn one): stat rows, lines
 * by id, and what is lost. The numbers are the game's resolved line values, so a tier's step is checked
 * against the line's table in `gear-lines.json` (for example Crit chance is 1, 2, 3, 4, 5 points).
 */

const MINUS = '−';

/** A Hat of the base at the item level, with these rolled lines. */
function hat(rolled: readonly ItemLine[], baseId = 'felt-hat', level = 10): GearItem {
  return sampleItem('x', baseId, 'rare', level, rolled);
}

describe('diffItems: lines on both items', () => {
  it('shows the step between two tiers of the same line, green when higher', () => {
    const diff = diffItems(
      hat([{ id: 'crit-chance', tier: 3 }]),
      hat([{ id: 'crit-chance', tier: 1 }]),
    );
    const change = diff.lines.get('crit-chance:rolled');
    expect(change).toMatchObject({ kind: 'changed', mark: { text: '+2 pt', good: true } });
    expect(change?.kind === 'changed' ? change.mark.spoken : '').toBe('plus 2 pt, better');
    expect(diff.goneLines).toEqual([]);
  });

  it('shows a minus in red when the new tier is lower, in the line unit', () => {
    const diff = diffItems(
      hat([{ id: 'first-pounce', tier: 0 }]),
      hat([{ id: 'first-pounce', tier: 2 }]),
    );
    expect(diff.lines.get('first-pounce:rolled')).toMatchObject({
      kind: 'changed',
      mark: { text: `${MINUS}12%`, good: false },
    });
  });

  it('says nothing for a line with the same value, or a once-only line', () => {
    const rolled = [
      { id: 'first-pounce', tier: 1 },
      { id: 'lingering', tier: 0 },
    ];
    const diff = diffItems(hat(rolled), hat(rolled));
    expect(diff.lines.size).toBe(0);
    expect(diff.goneLines).toEqual([]);
  });

  it('writes a reduction with the sign of the number it shows: a bigger ward is a bigger minus, still better', () => {
    const diff = diffItems(
      hat([{ id: 'aimed-ward', tier: 2 }]),
      hat([{ id: 'aimed-ward', tier: 0 }]),
    );
    expect(diff.lines.get('aimed-ward:rolled')).toMatchObject({
      kind: 'changed',
      mark: { text: `${MINUS}4%`, good: true, spoken: 'minus 4%, better' },
    });
    const weaker = diffItems(
      hat([{ id: 'aimed-ward', tier: 0 }]),
      hat([{ id: 'aimed-ward', tier: 2 }]),
    );
    expect(weaker.lines.get('aimed-ward:rolled')).toMatchObject({
      mark: { text: '+4%', good: false },
    });
  });
});

describe('diffItems: new and lost lines', () => {
  it('marks a line only the new item has as new', () => {
    const diff = diffItems(
      hat([
        { id: 'first-pounce', tier: 1 },
        { id: 'crit-chance', tier: 1 },
      ]),
      hat([{ id: 'first-pounce', tier: 1 }]),
    );
    expect(diff.lines.get('crit-chance:rolled')).toEqual({ kind: 'new' });
    expect(diff.lines.has('first-pounce:rolled')).toBe(false);
    expect(diff.goneLines).toEqual([]);
  });

  it('lists a line only the worn item has as lost, with the text it has now', () => {
    const worn = hat([
      { id: 'first-pounce', tier: 1 },
      { id: 'crit-chance', tier: 2 },
    ]);
    const diff = diffItems(hat([{ id: 'first-pounce', tier: 1 }]), worn);
    const lost = worn.lines.find((l) => l.id === 'crit-chance');
    expect(lost?.text).toBeDefined();
    expect(diff.goneLines).toEqual([{ id: 'crit-chance', source: 'rolled', text: lost?.text }]);
  });

  it('counts lines with a parameter as different lines: Ember Hunter against Tide Hunter', () => {
    const diff = diffItems(
      hat([{ id: 'ember-hunter', tier: 1 }]),
      hat([{ id: 'tide-hunter', tier: 1 }]),
    );
    expect(diff.lines.get('ember-hunter:rolled')).toEqual({ kind: 'new' });
    expect(diff.goneLines.map((l) => l.id)).toEqual(['tide-hunter']);
  });

  it('matches the same element line on both items (Ember Hunter against Ember Hunter)', () => {
    const diff = diffItems(
      hat([{ id: 'ember-hunter', tier: 3 }]),
      hat([{ id: 'ember-hunter', tier: 1 }]),
    );
    expect(diff.lines.get('ember-hunter:rolled')).toMatchObject({ kind: 'changed' });
    expect(diff.goneLines).toEqual([]);
  });
});

describe('diffItems: a line the base has and the item rolled too', () => {
  // A Crossroads Compass has Trail XP built in, and Trail XP can also be rolled on it.
  const compass = (rolled: readonly ItemLine[]): GearItem =>
    sampleItem('c', 'crossroads-compass', 'rare', 10, rolled);

  it('keeps the base line and the rolled line apart: only the rolled one is new', () => {
    const next = compass([{ id: 'trail-xp', tier: 1 }]);
    const worn = compass([]);
    expect(next.lines.filter((l) => l.id === 'trail-xp').map((l) => l.source)).toEqual([
      'base',
      'rolled',
    ]);
    const diff = diffItems(next, worn);
    expect(diff.lines.get(lineKey({ id: 'trail-xp', source: 'rolled' }))).toEqual({ kind: 'new' });
    expect(diff.lines.has(lineKey({ id: 'trail-xp', source: 'base' }))).toBe(false);
    expect(diff.goneLines).toEqual([]);
  });

  it('lists the lost rolled line once, and the base line is not lost', () => {
    const diff = diffItems(compass([]), compass([{ id: 'trail-xp', tier: 1 }]));
    expect(diff.lines.size).toBe(0);
    expect(diff.goneLines.map((l) => `${l.id}:${l.source}`)).toEqual(['trail-xp:rolled']);
  });

  it('marks the number of each line against its own twin', () => {
    const diff = diffItems(
      compass([{ id: 'trail-xp', tier: 3 }]),
      compass([{ id: 'trail-xp', tier: 1 }]),
    );
    expect(diff.lines.has(lineKey({ id: 'trail-xp', source: 'base' }))).toBe(false);
    expect(diff.lines.get(lineKey({ id: 'trail-xp', source: 'rolled' }))).toMatchObject({
      kind: 'changed',
      mark: { good: true },
    });
  });
});

describe('diffItems: base stats', () => {
  const kelp = hat([], 'kelp-cap', 2);
  const crown = sampleItem('y', 'emberkeepers-crown', 'epic', 15, []);

  it('shows the difference of each stat the two hats share, signed', () => {
    const diff = diffItems(crown, kelp);
    for (const stat of ['atk', 'hp'] as const) {
      const now = crown.stats.find((s) => s.stat === stat)?.value ?? 0;
      const before = kelp.stats.find((s) => s.stat === stat)?.value ?? 0;
      expect(diff.stats.get(stat)).toMatchObject({
        text: statDelta(stat, now - before),
        good: true,
      });
      expect(diff.stats.get(stat)?.text.startsWith('+')).toBe(true);
    }
  });

  it('shows a stat only the new item has as a gain of all of it, in points for crit', () => {
    const diff = diffItems(crown, kelp);
    expect(diff.stats.get('critDamage')).toMatchObject({ text: '+20 pt', good: true });
    expect(diff.goneStats).toEqual([]);
  });

  it('shows a stat only the worn item has as a red row with its words', () => {
    const diff = diffItems(kelp, crown);
    expect(diff.goneStats).toEqual([
      {
        stat: 'critDamage',
        text: `Crit damage ${MINUS}20 pt`,
        spoken: `Lost: Crit damage minus 20 pt`,
      },
    ]);
    expect(diff.stats.get('hp')).toMatchObject({ good: false });
    expect(diff.stats.get('hp')?.text.startsWith(MINUS)).toBe(true);
  });
});

describe('statDelta', () => {
  it('signs a stat change and writes crit in points', () => {
    expect(statDelta('atk', 12)).toBe('+12');
    expect(statDelta('hp', -30)).toBe(`${MINUS}30`);
    expect(statDelta('critChance', 220)).toBe('+2.2 pt');
    expect(statDelta('critDamage', -2000)).toBe(`${MINUS}20 pt`);
  });
});
