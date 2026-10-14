import { content, RULES } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import raidFestival from './fixtures/raid-festival.json';
import raidReveal from './fixtures/raid-reveal.json';
import { isFestivalSpecies } from './game';
import { parseRaidView } from './raid-api';
import {
  READINESS_LABELS,
  SEASON_WEEKS,
  bestRankText,
  bossRankTrack,
  festivalBanner,
  festivalGrantText,
  festivalTeaser,
  finaleProgress,
  rankChangeText,
  rankLabel,
  readinessMeter,
  seasonPips,
  seasonText,
  seasonWeekText,
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
    expect(seasonText({ index: 1, week: 2 })).toBe('Week 2 / 5 this season');
    expect(seasonText({ index: 1, week: 5 })).toBe('Week 5 / 5: the Festival ends the season');
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
    ).toContain('fusion 1 / 5');
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

describe('the Boss Rank and season row after a finale', () => {
  const win = { before: 3, after: 4, festival: false, serverWon: true };
  const at = { weekId: '2027-W02', season: { index: 595, week: 2 } };

  it('draws the rank track like the depth: this Rank lit, the next one ahead with words, not numbers', () => {
    const track = bossRankTrack(4);
    expect(track.steps.map((s) => s.label)).toEqual(['Rank 4', 'Rank 5']);
    expect(track.current).toBe(0);
    expect(track.steps[0]?.unlocks).toEqual([]);
    const next = track.steps[1]?.unlocks.map((u) => u.text).join(' ') ?? '';
    expect(next).toContain('tougher boss');
    expect(next).not.toMatch(/\d/);
    // The ladder never ends, and a bad rank stays on the ladder.
    expect(bossRankTrack(0).steps[0]?.label).toBe('Rank 1');
  });

  it('shows the rank after the ladder moved (or stayed or eased) and the season week of that week', () => {
    const progress = finaleProgress({ week: '2027-W02', rankChange: win }, at);
    expect(progress?.rank?.steps[0]?.label).toBe('Rank 4');
    expect(progress?.season).toEqual({
      week: 2,
      weeks: 5,
      text: 'Week 2 / 5 this season',
      label: 'Season: Week 2 / 5 this season',
    });
    const eased = finaleProgress(
      { week: '2027-W05', rankChange: { before: 4, after: 3, festival: true, serverWon: true } },
      null,
    );
    expect(eased?.rank?.steps[0]?.label).toBe('Rank 3');
  });

  it('knows a Festival result is the last week of the season without asking the page', () => {
    const festival = finaleProgress(
      { week: '2027-W05', rankChange: { ...win, festival: true } },
      at,
    );
    expect(festival?.season?.week).toBe(5);
    expect(festival?.season?.text).toBe(seasonWeekText(5));
  });

  it('leaves the rank out until the ladder has moved, and the season out when the week is unknown', () => {
    const waiting = finaleProgress({ week: '2027-W02', rankChange: null }, at);
    expect(waiting?.rank).toBeNull();
    expect(waiting?.season?.week).toBe(2);
    // The page is on another week (a result seen later): the season cannot be told, so no pips.
    const later = finaleProgress({ week: '2027-W01', rankChange: win }, at);
    expect(later?.rank).not.toBeNull();
    expect(later?.season).toBeNull();
    expect(finaleProgress({ week: '2027-W01' }, null)).toBeNull();
    expect(
      finaleProgress({ week: '2027-W02', rankChange: undefined }, { ...at, season: null }),
    ).toBeNull();
  });

  it('writes the season week with a slash, and keeps seasonText on the same words', () => {
    expect(seasonWeekText(2)).toBe('Week 2 / 5 this season');
    expect(seasonWeekText(5)).toBe('Week 5 / 5: the Festival ends the season');
    expect(seasonText({ index: 1, week: 4 })).toBe(seasonWeekText(4));
    expect(seasonText(null)).toBeNull();
  });
});
