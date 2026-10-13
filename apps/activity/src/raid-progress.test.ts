import { content, RULES } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import raidFestival from './fixtures/raid-festival.json';
import raidReveal from './fixtures/raid-reveal.json';
import { isFestivalSpecies } from './game';
import { parseRaidView } from './raid-api';
import {
  READINESS_HINT,
  READINESS_LABELS,
  SEASON_WEEKS,
  bestRankText,
  festivalBanner,
  festivalGrantText,
  festivalTeaser,
  rankChangeText,
  rankLabel,
  readinessLabel,
  readinessMeter,
  seasonPips,
  seasonText,
} from './raid-progress';

describe('the rank', () => {
  it('is "Rank N", or nothing for a week without one', () => {
    expect(rankLabel(7)).toBe('Rank 7');
    expect(rankLabel(1)).toBe('Rank 1');
    expect(rankLabel(null)).toBeNull();
  });

  it('shows the best rank cleared once there is one', () => {
    expect(bestRankText(5)).toBe('Best rank cleared: Rank 5');
    expect(bestRankText(null)).toBeNull();
  });
});

describe('the season row', () => {
  it('matches the rules: five weeks, the last one a Festival', () => {
    expect(SEASON_WEEKS).toBe(RULES.progression.seasonWeeks);
  });

  it('has five pips with the current week marked, the earlier ones done and the Festival last', () => {
    const pips = seasonPips({ index: 595, week: 3 });
    expect(pips.map((p) => p.state)).toEqual(['done', 'done', 'now', 'ahead', 'ahead']);
    expect(pips.map((p) => p.week)).toEqual([1, 2, 3, 4, 5]);
    expect(pips.map((p) => p.festival)).toEqual([false, false, false, false, true]);
    expect(pips[4]?.label).toBe('Week 5 (Festival)');
    expect(pips[0]?.label).toBe('Week 1');
  });

  it('marks the first and the last week, and says so in words', () => {
    expect(seasonPips({ index: 1, week: 1 }).map((p) => p.state)).toEqual([
      'now',
      'ahead',
      'ahead',
      'ahead',
      'ahead',
    ]);
    expect(seasonPips({ index: 1, week: 5 }).map((p) => p.state)).toEqual([
      'done',
      'done',
      'done',
      'done',
      'now',
    ]);
    expect(seasonText({ index: 1, week: 2 })).toBe('Week 2 of 5 this season');
    expect(seasonText({ index: 1, week: 5 })).toBe('Week 5 of 5: the Festival ends the season');
  });

  it('has no pips for a week without a season', () => {
    expect(seasonPips(null)).toEqual([]);
    expect(seasonText(null)).toBeNull();
  });
});

describe('the readiness band', () => {
  it('is four plain words and a hint, never a number', () => {
    expect(READINESS_LABELS).toEqual({
      long_shot: 'Long shot',
      even: 'Even',
      likely: 'Likely',
      strong: 'Strong',
    });
    for (const label of Object.values(READINESS_LABELS)) expect(label).not.toMatch(/\d|%/);
    expect(READINESS_HINT).toBe('How ready your team looks');
    expect(READINESS_HINT).not.toMatch(/\d|%/);
    expect(readinessLabel('likely')).toBe('Likely');
    expect(readinessLabel(null)).toBeNull();
  });

  it('is a four-step meter that fills with the band, and has none without a band', () => {
    expect(readinessMeter('long_shot')).toEqual({
      band: 'long_shot',
      filled: 1,
      total: 4,
      word: 'Long shot',
    });
    expect(readinessMeter('even')?.filled).toBe(2);
    expect(readinessMeter('likely')?.filled).toBe(3);
    expect(readinessMeter('strong')).toMatchObject({ filled: 4, total: 4, word: 'Strong' });
    expect(readinessMeter(null)).toBeNull();
  });
});

describe('Festival weeks', () => {
  it('has no banner or teaser in a normal week', () => {
    const view = parseRaidView(raidReveal);
    expect(festivalBanner(view)).toBeNull();
    expect(festivalTeaser(view)).toBeNull();
  });

  it('names the creature and the eased boss in a Festival week (real server data)', () => {
    const view = parseRaidView(raidFestival);
    expect(festivalBanner(view)).toBe(
      'The boss is easier and fights as a Rank 3 boss, Essence pays more, and every winner gets Hearthshell.',
    );
    expect(festivalTeaser(view)).toBe(
      'Hearthshell can only be won in a Festival. It is not found on expeditions.',
    );
  });

  it('copes with a missing creature or rank', () => {
    expect(festivalBanner({ festival: true, festivalCreature: null, effectiveRank: null })).toBe(
      'The boss is easier, Essence pays more, and every winner gets a Festival creature.',
    );
    expect(festivalTeaser({ festival: true, festivalCreature: null })).toBeNull();
  });

  it('flags exactly the Festival species of the content', () => {
    const festival = content.creatures.filter((c) => c.festival === true);
    expect(festival.length).toBeGreaterThan(0);
    for (const c of content.creatures) expect(isFestivalSpecies(c.id)).toBe(c.festival === true);
    // Never offered as catchable.
    for (const c of festival) expect(c.catchable).toBe(false);
    expect(isFestivalSpecies('not-a-species')).toBe(false);
  });
});

describe('what a finale did', () => {
  it('says whether the server climbs, stays or eases', () => {
    const change = (before: number, after: number, festival = false) =>
      rankChangeText({ before, after, festival, serverWon: true });
    expect(change(3, 4)).toBe('The server climbs to Rank 4.');
    expect(change(3, 3)).toBe('Rank 3 stays.');
    expect(change(6, 5, true)).toBe('The Festival is over. The server eases to Rank 5.');
    expect(change(1, 1, true)).toBe('Rank 1 stays.');
  });

  it('says what the Festival creature did for the player', () => {
    expect(
      festivalGrantText({ species: 'hearthshell', outcome: 'new', firstOnServer: false }),
    ).toBe('You won Hearthshell! A new level 1 creature for your collection.');
    expect(
      festivalGrantText({
        species: 'hearthshell',
        outcome: 'fused',
        fusionCount: 1,
        firstOnServer: false,
      }),
    ).toContain('fusion 1 of 5');
    expect(
      festivalGrantText({
        species: 'lanternfin',
        outcome: 'converted',
        bait: 90,
        firstOnServer: true,
      }),
    ).toBe('You already had a fully fused Lanternfin: +90 Bait instead.');
  });
});
