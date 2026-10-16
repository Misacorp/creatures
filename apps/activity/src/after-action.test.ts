import { describe, expect, it } from 'vitest';
import statsCloseLoss from './fixtures/raid-stats-close-loss.json';
import statsCloseWin from './fixtures/raid-stats-close-win.json';
import statsFinale from './fixtures/raid-stats-finale.json';
import statsWiped from './fixtures/raid-stats-wiped.json';
import {
  abilityLine,
  abilitySummary,
  adaptationLines,
  barMax,
  creatureLine,
  headline,
  hpLeftText,
  knockoutLine,
  outcomeLine,
  percentText,
  playerLine,
  reactionLine,
  sharePercent,
  splitVisible,
  thresholdText,
  whoText,
} from './after-action';
import { parseStats } from './raid-api';

const closeWin = parseStats(statsCloseWin);
const closeLoss = parseStats(statsCloseLoss);
const wiped = parseStats(statsWiped);
const finale = parseStats(statsFinale);

describe('headline and outcome', () => {
  it('says "Close one!" when the server says it was close, in a win and a loss', () => {
    expect(headline(closeWin)).toBe('Close one!');
    expect(headline(closeLoss)).toBe('Close one!');
  });

  it('is a plain outcome otherwise', () => {
    expect(headline({ close: false, outcome: 'cleared' })).toBe('Cleared');
    expect(headline({ close: false, outcome: 'missed' })).toBe('Not cleared');
    expect(headline({ close: false, outcome: 'wiped' })).toBe('Not cleared');
    expect(headline(wiped)).toBe('Not cleared');
    expect(headline(finale)).toBe('Not cleared');
  });

  it('describes how the stage ended, with the rounds played', () => {
    expect(outcomeLine(closeWin)).toBe(
      `Phase 1 cleared after ${String(closeWin.rounds)} / 10 rounds: the boss retreated.`,
    );
    expect(outcomeLine(closeLoss)).toBe(
      `Phase 1 not cleared after ${String(closeLoss.rounds)} / 10 rounds.`,
    );
    expect(outcomeLine(finale)).toBe('Finale not cleared after 12 / 12 rounds.');
  });

  it('says when every creature was knocked out, and by which round', () => {
    const last = Math.max(...wiped.knockouts.map((k) => k.round));
    expect(outcomeLine(wiped)).toBe(
      `Phase 1 not cleared. Every creature was knocked out by round ${String(last)}.`,
    );
    expect(outcomeLine({ ...wiped, knockouts: [] })).toBe(
      'Phase 1 not cleared. Every creature was knocked out.',
    );
  });
});

describe('boss HP text', () => {
  it('shows the HP left and its share', () => {
    expect(hpLeftText({ hpEnd: 449, hpMax: 5000, leftBp: 898 })).toBe(
      'Boss HP left: 449 / 5000 (9%)',
    );
  });

  it('never rounds a living boss to 0% or 100%', () => {
    expect(percentText(0, 0)).toBe('0%');
    expect(percentText(40, 12)).toBe('less than 1%');
    expect(percentText(99, 5)).toBe('less than 1%');
    expect(percentText(100, 50)).toBe('1%');
    expect(percentText(9_990, 999)).toBe('99%');
    expect(percentText(10_000, 1000)).toBe('99%');
    expect(percentText(5_000, 500)).toBe('50%');
  });

  it('gives the clear threshold for a phase and nothing for the finale', () => {
    expect(thresholdText(closeWin)).toBe(
      `HP taken off the pool this week: ${String(closeWin.boss.lost)} (${String(closeWin.boss.needed)} needed to clear).`,
    );
    expect(thresholdText(finale)).toBeNull();
  });
});

describe('who and bars', () => {
  it('shows "You" for the caller, the name for others and "Guest" for no owner', () => {
    expect(whoText('Misa', true)).toBe('You');
    expect(whoText('Bob', false)).toBe('Bob');
    expect(whoText(null, false)).toBe('Guest');
  });

  it('computes shares and the bar maximum safely', () => {
    expect(sharePercent(1, 3)).toBe(33);
    expect(sharePercent(2, 3)).toBe(67);
    expect(sharePercent(5, 0)).toBe(0);
    expect(barMax([3, 9, 4])).toBe(9);
    expect(barMax([])).toBe(1);
    expect(barMax([0, 0])).toBe(1);
  });

  it('gives each player a line with damage, share and contribution', () => {
    expect(playerLine({ damage: 1200, contribution: 1500 }, 3500)).toBe(
      '1200 damage (34%), 1500 contribution',
    );
  });

  it('names a creature, its kind when it has a nickname, and its owner', () => {
    expect(
      creatureLine({
        rank: 1,
        name: 'Mossback',
        species: 'mossback',
        owner: 'Eli',
        you: false,
        damage: 2775,
        contribution: 2888,
      }),
    ).toBe('1. Mossback, Eli: 2775 damage, 2888 contribution');
    expect(
      creatureLine({
        rank: 6,
        name: 'Rocky',
        species: 'mossback',
        owner: 'Bob',
        you: true,
        damage: 9,
        contribution: 9,
      }),
    ).toBe('6. Rocky (Mossback), You: 9 damage, 9 contribution');
    expect(
      creatureLine({
        rank: 7,
        name: 'Guest A',
        species: 'mossback',
        owner: null,
        you: false,
        damage: 0,
        contribution: 0,
      }),
    ).toContain('Guest: 0 damage');
  });
});

describe('reactions, abilities, knockouts, adaptation', () => {
  it('lists reactions, with the reflected ones', () => {
    expect(reactionLine({ name: 'Steam', count: 9, reflected: 0 })).toBe('Steam: 9');
    expect(reactionLine({ name: 'Steam', count: 9, reflected: 2 })).toBe('Steam: 9 (2 reflected)');
    expect(finale.reactions.map(reactionLine)[0]).toMatch(/^[A-Za-z ]+: \d+$/);
  });

  it('gives the round and whether an ability fired by default or by hand', () => {
    expect(
      abilityLine({
        player: 'Bob',
        you: false,
        ability: 'Flare Strike',
        creature: 'Cindle',
        round: 3,
        byDefault: true,
      }),
    ).toBe("Round 3: Bob, Cindle's Flare Strike (default)");
    expect(
      abilityLine({
        player: 'Misa',
        you: true,
        ability: 'Rally',
        creature: null,
        round: 5,
        byDefault: false,
      }),
    ).toBe('Round 5: You, Rally (by hand)');
  });

  it('counts abilities, those by hand and those that never fired', () => {
    expect(abilitySummary({ used: [], unused: 0 })).toBe('0 used, 0 by hand');
    const hand = { player: 'A', you: false, ability: 'Rally', creature: null, round: 2 };
    expect(
      abilitySummary({
        used: [
          { ...hand, byDefault: true },
          { ...hand, byDefault: false },
        ],
        unused: 2,
      }),
    ).toBe('2 used, 1 by hand, 2 did not fire before the fight ended');
    expect(abilitySummary(finale.abilities)).toMatch(/^\d+ used, 0 by hand$/);
  });

  it('lists knockouts with the round and the owner', () => {
    expect(
      knockoutLine({
        creature: 'Stormray',
        species: 'stormray',
        owner: 'Dee',
        you: false,
        round: 7,
      }),
    ).toBe('Round 7: Stormray, Dee');
    expect(knockoutLine({ ...(wiped.knockouts[2] as (typeof wiped.knockouts)[number]) })).toMatch(
      /^Round \d+: \w+, You$/,
    );
  });

  it('says what the boss resisted and whether it was purged', () => {
    expect(adaptationLines(finale.adaptation as NonNullable<typeof finale.adaptation>)).toEqual([
      'Boss counter-move: Element Resistance (resisted Grove, 25%).',
      'Purged in round 2; it applied again from round 6.',
    ]);
    const base = {
      name: 'Reaction Resistance',
      target: 'Steam',
      resistBp: 5000,
      purged: false,
      purgedRound: null,
      restoredRound: null,
    };
    expect(adaptationLines(base)).toEqual([
      'Boss counter-move: Reaction Resistance (resisted Steam, 50%).',
      'Not purged.',
    ]);
    expect(adaptationLines({ ...base, purged: true, purgedRound: 4 })[1]).toBe(
      'Purged in round 4.',
    );
    expect(adaptationLines({ ...base, target: null })[0]).toContain('nothing to resist');
  });

  it('splits a long list into the lines shown and the rest', () => {
    expect(splitVisible([1, 2, 3], 2)).toEqual({ shown: [1, 2], rest: [3] });
    expect(splitVisible([1], 6)).toEqual({ shown: [1], rest: [] });
  });
});

describe('no advice anywhere', () => {
  const ADVICE =
    /\b(try|should|consider|better|instead|improve|next time|you could|recommend|tip)\b/i;
  const everyText = (stats: typeof finale): string[] => [
    headline(stats),
    outcomeLine(stats),
    hpLeftText(stats.boss),
    thresholdText(stats) ?? '',
    abilitySummary(stats.abilities),
    ...stats.players.map((p) => playerLine(p, 100)),
    ...stats.creatures.map(creatureLine),
    ...stats.reactions.map(reactionLine),
    ...stats.abilities.used.map(abilityLine),
    ...stats.knockouts.map(knockoutLine),
    ...(stats.adaptation === null ? [] : adaptationLines(stats.adaptation)),
  ];

  it('states facts only, for every saved fight', () => {
    for (const stats of [closeWin, closeLoss, wiped, finale]) {
      for (const text of everyText(stats)) expect(text).not.toMatch(ADVICE);
    }
  });
});
