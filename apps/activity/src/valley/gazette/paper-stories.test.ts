import { composePaper, emptyLog, type Paper, type PaperLog } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { SAMPLE_STATE } from '../../creature-card-sample';
import { decisionOf, gazetteOfPaper, paperNote } from './paper-stories';

const creatures = SAMPLE_STATE.creatures.slice(0, 4);
const [a, b, c] = creatures;
if (a === undefined || b === undefined || c === undefined) throw new Error('sample creatures');

const item = (id: string, rarity: 'common' | 'rare' | 'epic' = 'rare') => ({
  id,
  baseId: 'kelp-cap',
  rarity,
  level: 4,
});

function paperOf(log: PaperLog, extra: Partial<Paper> = {}): Paper {
  const { headlines, more } = composePaper(log);
  return {
    id: '1',
    at: Date.UTC(2026, 10, 4, 12),
    awayHours: 24,
    headlines,
    more,
    brought: log.brought,
    decision: null,
    ...extra,
  };
}

const RICH: PaperLog = {
  ...emptyLog(),
  newcomers: [{ creatureId: c.id, species: c.species, by: a.id }],
  newcomerCount: 1,
  gear: [{ item: item('g1', 'epic'), by: a.id }],
  gearCount: 3,
  mastery: [{ post: 'scout', creatureId: b.id, step: 2 }],
  forge: { count: 4, byRarity: [3, 1, 0], best: [item('f1')], by: b.id },
  duplicates: 2,
  pages: 1,
  xp: [{ creatureId: a.id, gained: 90, levels: 1 }],
  moment: { creatureId: b.id, turn: 2 },
  brought: { acorns: 120, scrap: 50, shards: 6 },
};

describe('the stories of the server’s paper', () => {
  it('tells at most three, the server’s biggest first, with the rest as "more"', () => {
    const paper = paperOf(RICH);
    const plan = gazetteOfPaper(paper, creatures);
    expect(plan.stories).toHaveLength(3);
    expect(plan.stories.map((s) => s.id)).toEqual(paper.headlines.map((h) => h.kind));
    expect(plan.stories.map((s) => s.weight)).toEqual(
      [...plan.stories.map((s) => s.weight)].sort((x, y) => y - x),
    );
    expect(plan.more).toBe(paper.more);
    expect(plan.more).toBeGreaterThan(0);
  });

  it('words a newcomer with its species and shows it as a find, named creatures in the picture', () => {
    const plan = gazetteOfPaper(paperOf(RICH), creatures);
    const story = plan.stories.find((s) => s.id === 'new-species');
    expect(story?.headline).toMatch(/MOVES IN$/);
    expect(story?.finds).toEqual([
      { kind: 'newcomer', id: c.id, species: c.species, shiny: c.shiny },
    ]);
    expect(story?.scene.place).toBe('paddock');
    expect(story?.scene.actors.length).toBeGreaterThan(0);
  });

  it('shows the pieces as the real things with their own id, rarity and level', () => {
    const only: PaperLog = {
      ...emptyLog(),
      gear: [{ item: item('g1', 'epic'), by: a.id }],
      gearCount: 1,
      forge: { count: 1, byRarity: [0, 1, 0], best: [item('f1')], by: b.id },
    };
    const plan = gazetteOfPaper(paperOf(only), creatures);
    const gear = plan.stories.find((s) => s.id === 'found-gear');
    expect(gear?.headline).toContain('AN EPIC PIECE');
    expect(gear?.finds).toEqual([
      { kind: 'item', id: 'g1', baseId: 'kelp-cap', rarity: 'epic', level: 4 },
    ]);
    expect(plan.stories.find((s) => s.id === 'forge-pieces')?.headline).toContain('A RARE PIECE');
  });

  it('never uses loss wording, whatever the paper holds (V-RET-7)', () => {
    const plan = gazetteOfPaper(paperOf(RICH), creatures);
    const words = [
      ...plan.stories.flatMap((s) => [s.headline, s.blurb]),
      paperNote({ awayHours: 24 }),
      paperNote({ awayHours: 900 }),
    ].join(' ');
    expect(words).not.toMatch(/\b(miss|missed|lost|lose|less|reduced|cost)\b/i);
  });

  it('puts the allowance in as a count badge of Acorns, and it is what comes home', () => {
    const plan = gazetteOfPaper(
      paperOf({
        ...emptyLog(),
        brought: { acorns: 70, scrap: 0, shards: 0 },
        moment: { creatureId: a.id, turn: 0 },
      }),
      creatures,
    );
    const story = plan.stories.find((s) => s.id === 'allowance');
    expect(story?.badges.map((x) => x.amount)).toEqual([70]);
  });

  it('keeps a creature that is gone out of the picture and never invents one', () => {
    const plan = gazetteOfPaper(
      paperOf({ ...emptyLog(), moment: { creatureId: 'gone', turn: 1 }, duplicates: 1 }),
      creatures,
    );
    for (const s of plan.stories) expect(s.scene.actors).toEqual([]);
  });

  it('opens a long absence with the welcome line and a short one without', () => {
    expect(paperNote({ awayHours: 24 })).toBe('Everything your creatures found is already home.');
    expect(paperNote({ awayHours: 200 })).toBe(
      'The valley kept the fire going. Everything your creatures found is already home.',
    );
  });

  it('is the same however long the absence: three stories for a day and for a month', () => {
    const day = gazetteOfPaper(paperOf(RICH), creatures);
    const month = gazetteOfPaper(paperOf(RICH, { awayHours: 24 * 30 }), creatures);
    expect(month.stories.length).toBe(day.stories.length);
  });
});

describe('the paper’s one choice', () => {
  const decision = {
    kind: 'push-on' as const,
    seatId: 's1',
    creatureId: a.id,
    destination: 'ember-caves',
  };

  it('is a line, the trade-off and one button, for a creature the player still has', () => {
    const choice = decisionOf(decision, creatures);
    expect(choice?.seatId).toBe('s1');
    expect(choice?.text).toContain('Ember Caves');
    expect(choice?.label).toBe('Push on');
    expect(choice?.taken).toContain('deep in');
  });

  it('is none without a decision, or for a creature that has left', () => {
    expect(decisionOf(null, creatures)).toBeNull();
    expect(decisionOf({ ...decision, creatureId: 'gone' }, creatures)).toBeNull();
  });
});
