import { describe, expect, it } from 'vitest';
import {
  countText,
  currentSection,
  type ModifierQuery,
  placeCard,
  previewIdFor,
  type RowFacts,
  rowMatches,
  scrollDelta,
} from './hover';

describe('the wiki hover card script', () => {
  it('finds the card of a link to an entry, and none for anything else', () => {
    expect(previewIdFor('#knack-steady-mark')).toBe('tip-knack-steady-mark');
    expect(previewIdFor('#creature-splashet')).toBe('tip-creature-splashet');
    for (const bad of [
      null,
      '',
      '#',
      'https://example.com/#a',
      '/wiki.html#a',
      '#A b',
      '#a"b',
      '#a>',
    ]) {
      expect(previewIdFor(bad), String(bad)).toBeNull();
    }
  });

  const view = { width: 1000, height: 700 };
  const card = { width: 300, height: 120 };

  it('puts the card under the link when there is room', () => {
    const at = placeCard({ left: 200, top: 100, width: 80, height: 20 }, card, view);
    expect(at).toEqual({ left: 200, top: 126, above: false });
  });

  it('flips above the link when there is no room below', () => {
    const at = placeCard({ left: 200, top: 650, width: 80, height: 20 }, card, view);
    expect(at).toEqual({ left: 200, top: 650 - 6 - 120, above: true });
  });

  it('stays below when there is no room above either, and inside the window', () => {
    const at = placeCard({ left: 10, top: 20, width: 80, height: 20 }, card, {
      width: 400,
      height: 150,
    });
    expect(at.above).toBe(false);
    expect(at.top).toBe(22);
    expect(at.top + card.height).toBeLessThanOrEqual(150 - 8);
  });

  it('keeps the card inside the window sideways, at 390 px too', () => {
    const right = placeCard({ left: 950, top: 100, width: 40, height: 20 }, card, view);
    expect(right.left).toBe(1000 - 300 - 8);
    const left = placeCard({ left: -20, top: 100, width: 40, height: 20 }, card, view);
    expect(left.left).toBe(8);
    const phone = placeCard(
      { left: 300, top: 300, width: 60, height: 20 },
      { width: 340, height: 100 },
      { width: 390, height: 800 },
    );
    expect(phone.left).toBe(390 - 340 - 8);
    expect(phone.left + 340).toBeLessThanOrEqual(390);
  });

  describe('the table of contents tracking', () => {
    const marks = [
      { id: 'creatures', top: -900 },
      { id: 'line-a', top: -500 },
      { id: 'line-b', top: 150 },
      { id: 'knacks', top: 1400 },
    ];

    it('picks the last section whose top has reached the line', () => {
      expect(currentSection(marks, 200, false)).toBe('line-b');
      expect(currentSection(marks, 100, false)).toBe('line-a');
      expect(currentSection(marks, 150, false)).toBe('line-b');
      expect(currentSection(marks, 5000, false)).toBe('knacks');
    });

    it('picks nothing before the first section, or when there are none', () => {
      expect(currentSection([{ id: 'creatures', top: 300 }], 200, false)).toBeNull();
      expect(currentSection([], 200, false)).toBeNull();
      expect(currentSection([], 200, true)).toBeNull();
    });

    it('picks the last section at the end of the page, however short it is', () => {
      expect(currentSection(marks, 200, true)).toBe('knacks');
    });
  });

  describe('keeping the current entry in view in the sidebar', () => {
    const box = { top: 16, height: 600 };

    it('does not scroll an entry that is inside', () => {
      expect(scrollDelta({ top: 300, height: 24 }, box)).toBe(0);
    });

    it('scrolls up to an entry above, and down to an entry below, with a margin', () => {
      expect(scrollDelta({ top: -100, height: 24 }, box)).toBe(-100 - 24);
      expect(scrollDelta({ top: 640, height: 24 }, box)).toBe(640 + 24 - (16 + 600 - 8));
    });

    it('never scrolls an entry taller than the box past its top', () => {
      expect(scrollDelta({ top: 100, height: 900 }, box)).toBe(100 - 24);
    });
  });
});

describe('the modifier library search and filters', () => {
  const row: RowFacts = {
    category: 'protection',
    roles: 'guard',
    status: 'game',
    text: "cover a guard's cover for its neighbours grows by these points.",
  };
  const none: ModifierQuery = { search: '', category: '', role: '', status: '' };

  it('shows every row for an empty search and no filter', () => {
    expect(rowMatches(row, none)).toBe(true);
    expect(rowMatches(row, { ...none, search: '   ' })).toBe(true);
  });

  it('matches the search against the text in any case, every word of it', () => {
    expect(rowMatches(row, { ...none, search: 'guard' })).toBe(true);
    expect(rowMatches(row, { ...none, search: '  GUARD  Cover ' })).toBe(true);
    expect(rowMatches(row, { ...none, search: 'neighbours points' })).toBe(true);
    expect(rowMatches(row, { ...none, search: 'guard dodge' })).toBe(false);
    expect(rowMatches(row, { ...none, search: 'support' })).toBe(false);
  });

  it('keeps only the chosen category and status', () => {
    expect(rowMatches(row, { ...none, category: 'protection' })).toBe(true);
    expect(rowMatches(row, { ...none, category: 'damage' })).toBe(false);
    expect(rowMatches(row, { ...none, status: 'game' })).toBe(true);
    expect(rowMatches(row, { ...none, status: 'idea' })).toBe(false);
  });

  it('keeps a row whose roles include the chosen role, not one that merely contains the letters', () => {
    const any: RowFacts = { ...row, roles: 'setter payoff guard support' };
    expect(rowMatches(any, { ...none, role: 'support' })).toBe(true);
    expect(rowMatches(any, { ...none, role: 'guard' })).toBe(true);
    expect(rowMatches(row, { ...none, role: 'guard' })).toBe(true);
    expect(rowMatches(row, { ...none, role: 'setter' })).toBe(false);
    expect(rowMatches(row, { ...none, role: 'guar' })).toBe(false);
  });

  it('combines the search and the filters, all of which must hold', () => {
    const all = { search: 'guard', category: 'protection', role: 'guard', status: 'game' };
    expect(rowMatches(row, all)).toBe(true);
    const misses = [
      { search: 'dodge' },
      { category: 'damage' },
      { role: 'payoff' },
      { status: 'lab' },
    ];
    for (const miss of misses) {
      expect(rowMatches(row, { ...all, ...miss }), JSON.stringify(miss)).toBe(false);
    }
  });

  it('words the count as "shown / total"', () => {
    expect(countText(24, 130)).toBe('24 / 130');
    expect(countText(0, 130)).toBe('0 / 130');
  });
});
