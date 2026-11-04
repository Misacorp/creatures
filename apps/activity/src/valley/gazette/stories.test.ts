import { describe, expect, it } from 'vitest';
import type { AwaySource, AwaySummary, Creature } from '../../api';
import { SAMPLE_STATE } from '../../creature-card-sample';
import type { GearItem } from '../../gear-types';
import { sampleGearItem } from '../../workbench/gear-sample';
import {
  MAX_ACTORS,
  MAX_STORIES,
  attribute,
  awayGains,
  foundWhileAway,
  gazetteDate,
  gazetteOf,
  moreLabel,
  sceneOf,
  type AwayWorld,
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
const SINCE = 1_000;
const UNTIL = 2_000;
const summary = (part: Partial<AwaySummary> = {}): AwaySummary => ({
  sources: [],
  since: SINCE,
  until: UNTIL,
  tripsWaiting: 0,
  jobsWaiting: 0,
  ...part,
});

const roster: Creature[] = SAMPLE_STATE.creatures.slice(0, 4);
const at = (c: Creature, caughtAt: number): Creature => ({ ...c, caughtAt });
const piece = (id: string, createdAt: number): GearItem => ({
  ...sampleGearItem({ id, baseId: 'kelp-cap', rarity: 'rare' }),
  createdAt,
});
const world = (part: Partial<AwayWorld> = {}): AwayWorld => ({
  creatures: roster.map((c) => at(c, 0)),
  items: [],
  blueprints: [],
  tray: { trips: [], jobs: [], now: UNTIL },
  games: null,
  raid: null,
  ...part,
});

describe('the finds of the away window', () => {
  it('takes pieces, blueprints and creatures obtained from since to until, newest first, and nothing outside it', () => {
    const [a, b, c] = roster;
    if (a === undefined || b === undefined || c === undefined) throw new Error('roster');
    const found = foundWhileAway(
      summary(),
      world({
        creatures: [at(a, SINCE - 1), at(b, SINCE), at(c, UNTIL + 1)],
        items: [
          piece('old', SINCE - 1),
          piece('first', 1500),
          piece('last', UNTIL),
          piece('after', UNTIL + 1),
        ],
        blueprints: [
          { baseId: 'trail-charm', learnedAt: 1700 },
          { baseId: 'ember-muffler', learnedAt: 5 },
        ],
      }),
    );
    expect(
      found.things.map((f) => (f.kind === 'item' ? f.id : f.kind === 'blueprint' ? f.baseId : '')),
    ).toEqual(['last', 'trail-charm', 'first']);
    expect(found.newcomers.map((f) => (f.kind === 'newcomer' ? f.id : ''))).toEqual([b.id]);
  });

  it('finds nothing before the gear view has loaded', () => {
    expect(foundWhileAway(summary(), world({ items: null, blueprints: null })).things).toEqual([]);
  });
});

describe('who a find belongs to', () => {
  const found = foundWhileAway(
    summary(),
    world({ items: [piece('p1', 1500)], creatures: [at(roster[0] as Creature, 1600)] }),
  );

  it('is the one source that paid that kind, when the counts match', () => {
    const { by, rest } = attribute(
      [source('leet', { bait: 5 }), source('raid', { items: 1, creatures: 1 })],
      found,
    );
    expect(by.get('raid')?.things).toHaveLength(1);
    expect(by.get('raid')?.newcomers).toHaveLength(1);
    expect(rest).toEqual({ things: [], newcomers: [] });
  });

  it('is nobody’s when two sources paid pieces, or the counts differ: it is not guessed', () => {
    const two = attribute(
      [source('raid', { items: 1, creatures: 1 }), source('games', { items: 1 })],
      found,
    );
    expect(two.by.get('raid')?.things ?? []).toEqual([]);
    expect(two.rest.things).toHaveLength(1);
    expect(two.rest.newcomers).toHaveLength(0);
    const differ = attribute([source('raid', { items: 3 })], found);
    expect(differ.rest.things).toHaveLength(1);
    expect(differ.by.size).toBe(0);
  });
});

describe('stories from the away notice', () => {
  it('has none, and nothing more, for an empty notice', () => {
    expect(gazetteOf(summary(), world())).toEqual({ stories: [], more: 0 });
  });

  it('tells the raid’s real piece and newcomer under the raid, named, with currencies as badges', () => {
    const [a] = roster;
    if (a === undefined) throw new Error('roster');
    const plan = gazetteOf(
      summary({ sources: [source('raid', { essence: 96, items: 1, creatures: 1, xp: 240 })] }),
      world({ items: [piece('p1', 1500)], creatures: [at(a, 1600), ...roster.slice(1)] }),
    );
    const [story] = plan.stories;
    expect(plan.stories).toHaveLength(1);
    expect(story?.id).toBe('raid');
    expect(story?.headline).toMatch(/ CAME FROM THE RAID$/);
    expect(story?.headline).not.toContain('A NEWCOMER');
    expect(story?.finds.map((f) => f.kind)).toEqual(['newcomer', 'item']);
    expect(story?.badges.map((b) => b.key)).toEqual(['essence', 'xp']);
  });

  it('is generic only when the newcomer is not known', () => {
    const plan = gazetteOf(summary({ sources: [source('raid', { creatures: 1 })] }), world());
    expect(plan.stories[0]?.headline).toBe('A NEWCOMER CAME FROM THE RAID');
  });

  it('gives finds nobody can be credited with a story of their own, never a guess', () => {
    const plan = gazetteOf(
      summary({ sources: [source('raid', { items: 1 }), source('games', { items: 1 })] }),
      world({ items: [piece('p1', 1500), piece('p2', 1600)] }),
    );
    const found = plan.stories.find((s) => s.id === 'found');
    expect(found?.headline).toBe('FOUND WHILE YOU WERE AWAY');
    expect(found?.finds).toHaveLength(2);
    expect(plan.stories.filter((s) => s.id !== 'found').every((s) => s.finds.length === 0)).toBe(
      true,
    );
  });

  it('says "moves in" for a newcomer found with no source to credit', () => {
    const [a] = roster;
    if (a === undefined) throw new Error('roster');
    const plan = gazetteOf(summary(), world({ creatures: [at(a, 1500)] }));
    expect(plan.stories[0]?.id).toBe('found');
    expect(plan.stories[0]?.headline).toMatch(/ MOVES IN$/);
    expect(plan.stories[0]?.scene.place).toBe('paddock');
    // The newcomer itself is the one creature in its picture.
    expect(plan.stories[0]?.scene.actors).toHaveLength(1);
  });

  it('skips a source that paid nothing', () => {
    expect(gazetteOf(summary({ sources: [source('games')] }), world()).stories).toEqual([]);
  });

  it('tells trips home and jobs done at their places, with the creatures that really are home or done', () => {
    const [a, b] = roster;
    if (a === undefined || b === undefined) throw new Error('roster');
    const plan = gazetteOf(
      summary({ tripsWaiting: 1, jobsWaiting: 3 }),
      world({
        creatures: [
          { ...a, busy: { kind: 'expedition', id: 't1' } } as Creature,
          { ...b, busy: { kind: 'job', id: 'j1' } } as Creature,
        ],
        tray: {
          trips: [{ id: 't1', status: 'active', endsAt: UNTIL - 1, destination: 'tide' } as never],
          jobs: [{ id: 'j1', status: 'ready', endsAt: UNTIL - 1 } as never],
          now: UNTIL,
        },
      }),
    );
    expect(plan.stories.map((s) => [s.id, s.headline, s.scene.place])).toEqual([
      ['trips', '1 TRIP IS HOME', 'signpost'],
      ['jobs', '3 JOBS ARE DONE', 'forge'],
    ]);
    expect(plan.stories[0]?.scene.actors.map((x) => x.member.species)).toEqual([a.species]);
    expect(plan.stories[1]?.scene.actors.map((x) => x.member.species)).toEqual([b.species]);
  });

  it('shows the raid party that really stood in the arena, and no one when it is not known', () => {
    const [a, b] = roster;
    if (a === undefined || b === undefined) throw new Error('roster');
    const away = summary({ sources: [source('raid', { essence: 9 })] });
    const raid = { schedule: {}, scene: { boss: { id: 'x', name: 'X' }, party: [b.id] } } as never;
    expect(
      gazetteOf(away, world({ raid })).stories[0]?.scene.actors.map((x) => x.member.species),
    ).toEqual([b.species]);
    expect(gazetteOf(away, world()).stories[0]?.scene.actors).toEqual([]);
  });

  it('has no creatures in the daily gift’s picture: the client knows of none', () => {
    const plan = gazetteOf(summary({ sources: [source('leet', { bait: 47 })] }), world());
    expect(plan.stories[0]?.scene.actors).toEqual([]);
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
      world(),
    );
    expect(plan.stories.map((s) => s.id)).toEqual(['raid', 'games', 'leet']);
  });

  it('keeps the biggest three and counts the things of the rest as "N more"', () => {
    const plan = gazetteOf(
      summary({
        sources: [
          source('leet', { bait: 47 }),
          source('raid', { essence: 4, items: 4 }),
          source('games', { medals: 2 }),
        ],
        tripsWaiting: 2,
        jobsWaiting: 1,
      }),
      world(),
    );
    expect(plan.stories).toHaveLength(MAX_STORIES);
    expect(plan.stories.map((s) => s.id)).toEqual(['raid', 'games', 'trips']);
    expect(plan.more).toBe(2);
    expect(moreLabel(plan.more)).toBe('...and 2 more things');
  });

  it('says "...and 1 more thing" for one, and "Into the valley" for none', () => {
    expect(moreLabel(1)).toBe('...and 1 more thing');
    expect(moreLabel(0)).toBe('Into the valley');
  });

  it('is the same every time', () => {
    const away = summary({ sources: [source('leet', { bait: 5 }), source('raid', { bait: 5 })] });
    expect(gazetteOf(away, world())).toEqual(gazetteOf(away, world()));
  });
});

describe('the pictures', () => {
  const who: CastMember[] = roster.slice(0, 4).map((c) => ({
    name: c.species,
    species: c.species,
    shiny: false,
    level: c.level,
  }));

  it('stands creatures a sprite and more apart, back to front by their feet, at most three', () => {
    const scene = sceneOf('arena', who);
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

  it('has no creatures for no one (the picture is the place alone)', () => {
    expect(sceneOf('forge', []).actors).toEqual([]);
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
