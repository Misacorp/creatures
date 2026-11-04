import { describe, expect, it } from 'vitest';
import type { AwaySource, AwaySummary } from '../../api';
import {
  MAX_ACTORS,
  MAX_STORIES,
  awayGains,
  castOf,
  gazetteDate,
  gazetteOf,
  moreLabel,
  sceneOf,
  type CastMember,
} from './stories';

const source = (kind: AwaySource['kind'], part: Partial<AwaySource> = {}): AwaySource => ({
  kind,
  bait: 0,
  essence: 0,
  items: 0,
  creatures: 0,
  medals: 0,
  xp: 0,
  ...part,
});
const summary = (part: Partial<AwaySummary> = {}): AwaySummary => ({
  sources: [],
  since: 0,
  until: 1,
  tripsWaiting: 0,
  jobsWaiting: 0,
  ...part,
});
const cast: CastMember[] = [
  { name: 'Pip', species: 'splashet', shiny: false, level: 9 },
  { name: 'Moss', species: 'sproutle', shiny: false, level: 5 },
  { name: 'Ash', species: 'cindle', shiny: true, level: 3 },
];

describe('stories from the away notice', () => {
  it('has none, and nothing more, for an empty notice', () => {
    expect(gazetteOf(summary(), cast)).toEqual({ stories: [], more: 0 });
  });

  it('tells one story for one source, with its finds as count badges, and nothing more', () => {
    const plan = gazetteOf(summary({ sources: [source('raid', { essence: 96, items: 2 })] }), cast);
    expect(plan.more).toBe(0);
    expect(plan.stories).toHaveLength(1);
    expect(plan.stories[0]).toMatchObject({ id: 'raid', headline: 'THE RAID PAID OUT' });
    expect(plan.stories[0]?.finds.map((f) => f.key)).toEqual(['essence', 'items']);
    expect(plan.stories[0]?.scene.place).toBe('arena');
  });

  it('skips a source that paid nothing', () => {
    expect(gazetteOf(summary({ sources: [source('games')] }), cast).stories).toEqual([]);
  });

  it('tells trips home and jobs done as stories at their places', () => {
    const plan = gazetteOf(summary({ tripsWaiting: 1, jobsWaiting: 3 }), cast);
    expect(plan.stories.map((s) => [s.id, s.headline, s.scene.place])).toEqual([
      ['trips', '1 TRIP IS HOME', 'signpost'],
      ['jobs', '3 JOBS ARE DONE', 'forge'],
    ]);
  });

  it('ranks a newcomer over a find over a medal over coins, and the daily gift last', () => {
    const plan = gazetteOf(
      summary({
        sources: [
          source('leet', { bait: 47 }),
          source('games', { medals: 2 }),
          source('raid', { essence: 96, items: 1, creatures: 1 }),
        ],
      }),
      cast,
    );
    expect(plan.stories.map((s) => s.id)).toEqual(['raid', 'games', 'leet']);
    expect(plan.stories[0]?.headline).toBe('A NEWCOMER CAME FROM THE RAID');
  });

  it('keeps the biggest three and counts the things of the rest as "N more"', () => {
    const plan = gazetteOf(
      summary({
        sources: [
          source('leet', { bait: 47 }),
          source('raid', { items: 4 }),
          source('games', { medals: 2 }),
        ],
        tripsWaiting: 2,
        jobsWaiting: 1,
      }),
      cast,
    );
    expect(plan.stories).toHaveLength(MAX_STORIES);
    expect(plan.stories.map((s) => s.id)).toEqual(['raid', 'games', 'trips']);
    // Jobs (1) and the daily gift (a coin payout stands for one thing).
    expect(plan.more).toBe(2);
    expect(moreLabel(plan.more)).toBe('...and 2 more things');
  });

  it('says "...and 1 more thing" for one, and "Into the valley" for none', () => {
    expect(moreLabel(1)).toBe('...and 1 more thing');
    expect(moreLabel(0)).toBe('Into the valley');
  });

  it('is the same every time', () => {
    const away = summary({ sources: [source('leet', { bait: 5 }), source('raid', { bait: 5 })] });
    expect(gazetteOf(away, cast)).toEqual(gazetteOf(away, cast));
  });
});

describe('the pictures', () => {
  it('stands creatures a sprite and more apart, back to front by their feet, at most three', () => {
    const scene = sceneOf('arena', [...cast, ...cast]);
    expect(scene.actors).toHaveLength(MAX_ACTORS);
    for (let i = 1; i < scene.actors.length; i += 1) {
      expect(scene.actors[i]?.dy ?? 0).toBeGreaterThanOrEqual(scene.actors[i - 1]?.dy ?? 0);
    }
    for (const a of scene.actors) {
      for (const b of scene.actors) {
        if (a !== b) expect(Math.hypot(a.dx - b.dx, a.dy - b.dy)).toBeGreaterThanOrEqual(16);
      }
    }
  });

  it('has no creatures for an empty roster (the picture is the place alone)', () => {
    expect(sceneOf('forge', []).actors).toEqual([]);
  });

  it('casts the strongest creatures at home', () => {
    const base = { species: 'splashet', shiny: false, nickname: null };
    const roster = [
      { ...base, level: 3, away: false },
      { ...base, level: 9, away: true },
      { ...base, level: 7, away: false, nickname: 'Pip' },
    ] as never;
    expect(castOf(roster).map((c) => [c.name, c.level])).toEqual([
      ['Pip', 7],
      ['splashet', 3],
    ]);
  });
});

describe('what came home', () => {
  it('sums Bait and Essence over the sources, in the purse’s order, and nothing for none', () => {
    expect(
      awayGains(
        summary({
          sources: [
            source('leet', { bait: 47 }),
            source('raid', { bait: 3, essence: 96, items: 1 }),
          ],
        }),
      ),
    ).toEqual([
      { resource: 'bait', amount: 50 },
      { resource: 'essence', amount: 96 },
    ]);
    expect(awayGains(summary({ sources: [source('games', { medals: 2, xp: 9 })] }))).toEqual([]);
  });
});

describe('the date', () => {
  it('is the weekday and day in the guild’s timezone', () => {
    const lateEvening = Date.UTC(2026, 10, 4, 23, 30);
    expect(gazetteDate(lateEvening, 'UTC')).toBe('Wednesday 4 November');
    expect(gazetteDate(lateEvening, 'Europe/Helsinki')).toBe('Thursday 5 November');
  });
});
