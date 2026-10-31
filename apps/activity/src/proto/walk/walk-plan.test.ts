import { describe, expect, it } from 'vitest';
import { DAILY, WEEKLY, type Visit } from './journey';
import {
  LONG_GAP_DAYS,
  MAX_LINES,
  MAX_PILES,
  MAX_STOPS,
  MIN_STOPS,
  decisionOf,
  lineName,
  lineSpecies,
  pilesOf,
  placeOfLevelUp,
  planOf,
  planWalk,
  scoutsDestination,
  type CastMember,
  type WalkPlan,
} from './walk-plan';

const CAST: CastMember[] = ['Mossback', 'Pip', 'Ember', 'Sprout', 'Nib', 'Dot', 'Fig', 'Wren'].map(
  (name) => ({ name, species: 'splashet', shiny: false }),
);

/** A visit of a quiet Tuesday with only what the test sets. */
function visit(change: Partial<Visit> & { came?: Partial<Visit['cameHome']> } = {}): Visit {
  const { came, ...rest } = change;
  return {
    week: 1,
    day: 2,
    weekday: 'Tuesday',
    hour: 20,
    events: [],
    top5: [],
    ...rest,
    cameHome: {
      acorns: 50,
      scrap: 100,
      shards: { ember: 7 },
      creatures: [],
      pieces: { collected: 0, worn: 0, bagged: 0 },
      ...came,
    },
  };
}

const linesOf = (plan: WalkPlan): string[] => plan.stops.flatMap((s) => s.lines.map((l) => l.text));

describe('the walk of every visit of both journeys', () => {
  const all = [DAILY, WEEKLY].flatMap((journey) =>
    journey.visits.map((_, i) => ({ journey, i, plan: planOf(journey, i, CAST) })),
  );

  it('visits three or four places, never the same one twice', () => {
    for (const { plan } of all) {
      expect(plan.stops.length).toBeGreaterThanOrEqual(MIN_STOPS);
      expect(plan.stops.length).toBeLessThanOrEqual(MAX_STOPS);
      const places = plan.stops.map((s) => s.place);
      expect(new Set(places).size).toBe(places.length);
    }
  });

  it('tells at most three lines and has at most one surprise', () => {
    for (const { plan } of all) {
      expect(linesOf(plan).length).toBeLessThanOrEqual(MAX_LINES);
      expect(
        plan.stops.flatMap((s) => s.lines).filter((l) => l.surprise).length,
      ).toBeLessThanOrEqual(1);
    }
  });

  it('never tells a bare total: every walk has at least one line', () => {
    for (const { plan } of all) expect(linesOf(plan).length).toBeGreaterThan(0);
  });

  it('never says what was lost (no loss meter)', () => {
    for (const { plan } of all) {
      for (const text of [...linesOf(plan), plan.welcome ?? '']) {
        expect(text).not.toMatch(/miss|lost|loss|wasted|away steps|reduced|slower|expired/i);
      }
    }
  });

  it('ends at the decision’s place when there is one, and only on a Monday', () => {
    for (const { journey, i, plan } of all) {
      const v = journey.visits[i];
      expect(plan.decision !== null).toBe(v?.weekday === 'Monday');
      if (plan.decision !== null) expect(plan.stops[plan.stops.length - 1]?.place).toBe('arena');
    }
  });

  it('puts the surprise’s place last but for the decision’s', () => {
    for (const { plan } of all) {
      if (plan.surprise === null) continue;
      const places = plan.stops.map((s) => s.place);
      const at = places.indexOf(plan.surprise.place);
      const after = places.slice(at + 1);
      expect(after.length).toBe(plan.decision === null ? 0 : 1);
    }
  });

  it('opens with a welcome line only after a long absence (the weekly player, not the daily one)', () => {
    for (const { journey, plan } of all) {
      expect(plan.welcome !== null).toBe(journey.id === 'weekly');
    }
    expect(LONG_GAP_DAYS).toBe(3);
  });

  it('is the same plan every time', () => {
    for (const { journey, i, plan } of all) expect(planOf(journey, i, CAST)).toEqual(plan);
  });
});

describe('which places the walk visits', () => {
  it('goes where something happened and fills a quiet day up to three places', () => {
    const plan = planWalk(
      visit({ came: { pieces: { collected: 1, worn: 2, bagged: 0 } } }),
      CAST,
      1,
    );
    const places = plan.stops.map((s) => s.place);
    expect(places).toContain('signpost');
    expect(places).toContain('forge');
    expect(plan.stops.length).toBe(3);
  });

  it('goes west to east, so the camera sweeps once', () => {
    const plan = planWalk(
      visit({ came: { pieces: { collected: 0, worn: 2, bagged: 0 } } }),
      CAST,
      1,
    );
    expect(plan.stops.map((s) => s.place)).toEqual(['paddock', 'forge', 'signpost']);
  });

  it('adds the arena as a fourth stop on a Monday', () => {
    const plan = planWalk(visit({ weekday: 'Monday', day: 8 }), CAST, 1);
    expect(plan.stops.length).toBe(4);
    expect(plan.stops[3]?.place).toBe('arena');
    expect(plan.decision).toEqual({ place: 'arena', text: 'Choose your defenders' });
  });

  it('puts the bonfire at the Paddock and a graduation at the House (the valley has neither yet)', () => {
    expect(placeOfLevelUp('bonfire')).toBe('paddock');
    expect(placeOfLevelUp('forge')).toBe('forge');
    const plan = planWalk(visit({ events: ['graduation: 3 creatures earned Bronze'] }), CAST, 1);
    expect(plan.stops.map((s) => s.place)).toContain('house');
  });
});

describe('the story lines', () => {
  it('tells who, what and where', () => {
    const plan = planWalk(
      visit({
        events: ['mastery: anvil 1 reached Master'],
        came: { pieces: { collected: 0, worn: 1, bagged: 0 } },
      }),
      CAST,
      1,
    );
    expect(linesOf(plan)).toContain('Ember became a Master Smith');
    expect(linesOf(plan)).toContain('Mossback is home from the Ember Caves');
    expect(linesOf(plan)).toContain('Ember fitted 1 piece at the Forge');
  });

  it('names the scouts’ destination after the shards they brought most of', () => {
    expect(scoutsDestination(visit({ came: { shards: { tide: 3, mire: 9 } } }))).toBe(
      'the Sunken Fen',
    );
    expect(scoutsDestination(visit({ came: { shards: {} } }))).toBe('the Tidepools');
  });

  it('keeps the three that matter most when more happened', () => {
    const plan = planWalk(
      visit({
        events: [
          'new line: cindle',
          'place level-up: forge reached level 2',
          'graduation: 2 creatures earned Bronze',
          'mastery: scout seat 1 reached Master',
          'visitor: he is in the valley until the raid finale',
        ],
        came: { pieces: { collected: 1, worn: 2, bagged: 0 } },
      }),
      CAST,
      1,
    );
    expect(linesOf(plan)).toHaveLength(3);
    expect(linesOf(plan)).toEqual(
      expect.arrayContaining([
        'A new friend: Cindle',
        'The Forge grew to level 2',
        '2 creatures earned Bronze',
      ]),
    );
    expect(linesOf(plan).join('|')).not.toContain('A visitor came');
  });

  it('groups several mastery steps of one post, and a week’s new lines, into one line each', () => {
    const plan = planWalk(
      visit({
        events: [
          'new line: cindle',
          'new line: splashet',
          'new line: mistnewt',
          'mastery: scout seat 1 reached Apprentice',
          'mastery: scout seat 2 reached Apprentice',
          'mastery: scout seat 1 reached Expert',
        ],
      }),
      CAST,
      7,
    );
    expect(linesOf(plan)).toContain('3 new friends came to the valley');
    // Seat 1 went on to Expert; seat 2 stays an Apprentice behind it, so the post's top step is one scout's.
    expect(linesOf(plan).join('|')).toContain('Mossback became an Expert Scout');
  });

  it('adds up the creatures that came home and tells them in one line', () => {
    const plan = planWalk(
      visit({
        came: {
          creatures: [
            { line: 'mistnewt', count: 1, newLine: false },
            { line: 'zipmouse', count: 2, newLine: false },
          ],
        },
      }),
      CAST,
      1,
    );
    expect(linesOf(plan)).toContain('Mossback brought 3 creatures home');
  });

  it('keeps a line of a kind it does not know yet, as the lab wrote it', () => {
    const plan = planWalk(visit({ events: ['a thing the lab added'] }), CAST, 1);
    expect(linesOf(plan)).toContain('a thing the lab added');
  });

  it('shows a name for a line the content does not know, and the first form of one it does', () => {
    expect(lineName('splashet')).toBe('Splashet');
    expect(lineName('new line 16 (common)')).toBe('a new creature');
    expect(lineName('nothing')).toBe('nothing');
    expect(lineSpecies('splashet')).toBe('splashet');
    expect(lineSpecies('new line 16 (common)')).toBeNull();
  });

  it('tells the surprise last within its place', () => {
    const plan = planWalk(
      visit({
        events: ['new line: cindle'],
        came: { creatures: [{ line: 'cindle', count: 1, newLine: true }] },
      }),
      CAST,
      1,
    );
    const paddock = plan.stops.find((s) => s.place === 'paddock');
    expect(paddock?.lines.map((l) => l.surprise)).toEqual([true]);
    const mixed = planWalk(
      visit({
        events: ['new line: cindle'],
        came: { creatures: [{ line: 'zipmouse', count: 1, newLine: false }] },
      }),
      CAST,
      1,
    );
    const lines = mixed.stops.find((s) => s.place === 'paddock')?.lines ?? [];
    expect(lines.length).toBe(2);
    expect(lines[lines.length - 1]?.surprise).toBe(true);
  });
});

describe('the surprise', () => {
  it('is a new line first, then a place level-up, a graduation, a mastery, a rare piece', () => {
    const order: [string, string][] = [
      ['new line: cindle', 'A new friend: Cindle'],
      ['place level-up: forge reached level 2', 'The Forge grew to level 2'],
      ['graduation: 1 creature earned Bronze', '1 creature earned Bronze'],
      ['mastery: anvil 1 reached Master', 'Ember became a Master Smith'],
      ['mastery: anvil 1 reached Expert', 'Ember became an Expert Smith'],
      [
        'visitor: rerolled a epic piece (item level 9.0) for 50 Acorns and 20 scrap: lines [1] became [2] (1 at the top pip)',
        'The visitor made an epic piece better',
      ],
      [
        "visitor: bought the week's blueprint (a new one) for 100 Acorns and 40 shards",
        'The visitor sold a new blueprint',
      ],
    ];
    for (let i = 0; i < order.length; i += 1) {
      // Each one wins against every one after it in the list.
      const events = order.slice(i).map(([event]) => event);
      const plan = planWalk(visit({ events }), CAST, 1);
      expect(plan.surprise?.text).toBe(order[i]?.[1]);
    }
  });

  it('is never more than one, however much is rare', () => {
    const plan = planWalk(
      visit({
        events: [
          'new line: cindle',
          'place level-up: bonfire reached level 2',
          'graduation: 1 creature earned Gold',
        ],
      }),
      CAST,
      1,
    );
    expect(plan.stops.flatMap((s) => s.lines).filter((l) => l.surprise)).toHaveLength(1);
    expect(plan.surprise?.text).toBe('A new friend: Cindle');
  });

  it('is none on a quiet day, which closes with a resting creature’s small moment instead', () => {
    const plan = planWalk(
      visit({ events: [], came: { pieces: { collected: 0, worn: 1, bagged: 0 } } }),
      CAST,
      1,
    );
    expect(plan.surprise).toBeNull();
    const moment = plan.stops.flatMap((s) => s.lines).find((l) => l.place === 'paddock');
    expect(moment?.who).toMatchObject({ kind: 'cast' });
    expect(linesOf(plan)).toHaveLength(3);
  });

  it('is not an Apprentice step (that is news, not a find)', () => {
    const plan = planWalk(visit({ events: ['mastery: anvil 2 reached Apprentice'] }), CAST, 1);
    expect(plan.surprise).toBeNull();
    expect(linesOf(plan)).toContain('Sprout became an Apprentice Smith');
  });
});

describe('the welcome line', () => {
  it('comes after a gap of three days or more, and says nothing of what was missed', () => {
    expect(planWalk(visit(), CAST, 2).welcome).toBeNull();
    expect(planWalk(visit(), CAST, 3).welcome).toBe('The valley kept the fire going.');
    expect(planWalk(visit(), CAST, 30).welcome).toBe('The valley kept the fire going.');
  });

  it('does not make a long absence longer: still three lines and four places at most', () => {
    const plan = planWalk(
      visit({
        weekday: 'Monday',
        events: [
          'new line: cindle',
          'new line: splashet',
          'place level-up: bonfire reached level 2',
          'place level-up: forge reached level 3',
          'graduation: 2 creatures earned Bronze',
          'mastery: scout seat 1 reached Master',
          'mastery: anvil 1 reached Expert',
          'visitor: he is in the valley until the raid finale',
        ],
      }),
      CAST,
      28,
    );
    expect(linesOf(plan).length).toBeLessThanOrEqual(MAX_LINES);
    expect(plan.stops.length).toBeLessThanOrEqual(MAX_STOPS);
  });
});

describe('the piles carried home', () => {
  it('are count badges for Acorns, scrap, shards by element and pieces, rounded', () => {
    const piles = pilesOf(
      visit({
        came: {
          acorns: 56.6,
          scrap: 65.36,
          shards: { spark: 2.84, ember: 6.81 },
          pieces: { collected: 2, worn: 1, bagged: 0 },
        },
      }),
    );
    expect(piles.map((p) => [p.key, p.amount])).toEqual([
      ['acorns', 57],
      ['scrap', 65],
      ['shard-ember', 7],
      ['shard-spark', 3],
      ['pieces', 2],
    ]);
    expect(piles.find((p) => p.key === 'shard-ember')?.icon).toEqual({
      kind: 'part',
      part: 'ember-shard',
    });
  });

  it('leave out what rounds to nothing, and carry at most six', () => {
    const none = pilesOf(
      visit({
        came: {
          acorns: 0.2,
          scrap: 0,
          shards: { tide: 0.3 },
          pieces: { collected: 0, worn: 3, bagged: 0 },
        },
      }),
    );
    expect(none).toEqual([]);
    const many = pilesOf(
      visit({
        came: {
          acorns: 5,
          scrap: 5,
          shards: { tide: 5, ember: 4, grove: 3, spark: 2, mire: 1 },
          pieces: { collected: 4, worn: 0, bagged: 0 },
        },
      }),
    );
    expect(many).toHaveLength(MAX_PILES);
  });
});

describe('the decision', () => {
  it('is raid preparation on a Monday, when the threat is sighted, and nothing else', () => {
    expect(decisionOf(visit({ weekday: 'Monday' }))).toEqual({
      place: 'arena',
      text: 'Choose your defenders',
    });
    for (const day of ['Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
      expect(decisionOf(visit({ weekday: day }))).toBeNull();
    }
  });
});
