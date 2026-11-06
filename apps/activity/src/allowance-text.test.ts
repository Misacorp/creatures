import { RULES, glossary, howToPlay } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { allowanceNotice } from './allowance-text';
import { sayParts } from './resource-count';

describe('allowanceNotice', () => {
  it('says what landed, as plain text', () => {
    // The line has the Bait icon and the number, never the word.
    expect(sayParts(allowanceNotice({ day: '2026-10-20', amount: 25 }) ?? [])).toEqual([
      'Daily allowance: +',
      ['bait', 25],
    ]);
  });

  it('says nothing when the server had nothing new to tell', () => {
    expect(allowanceNotice(null)).toBeNull();
  });
});

describe('the text that explains how Bait is earned', () => {
  const bait = glossary.find((entry) => entry.id === 'bait');
  const text = (bait?.lines ?? []).join(' ');
  const bonuses = RULES.income.leetBonusByCount.filter((n) => n > 0);

  it('names the allowance and the range of the leet bonus from the rules', () => {
    expect(text).toContain(`allowance of ${String(RULES.income.dailyAllowance)} Bait`);
    expect(text).toContain(
      `bonus of ${String(Math.min(...bonuses))} to ${String(Math.max(...bonuses))} Bait`,
    );
  });

  it('no longer says that leets are the only source', () => {
    expect(bait?.short).not.toBe('Currency from leets in Discord.');
    const lines = howToPlay.sections.flatMap((section) => section.lines).join(' ');
    expect(lines).not.toContain('Leets earn Bait.');
    expect(lines).toContain('allowance');
  });
});
