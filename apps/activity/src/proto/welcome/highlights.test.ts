import { describe, expect, it } from 'vitest';
import { DAILY, WEEKLY, type Visit } from './journey';
import {
  MAX_ACTORS,
  MAX_BLURB,
  MAX_HEADLINE,
  MAX_HIGHLIGHTS,
  MAX_PIECES,
  WELCOME_AFTER_HOURS,
  assignCast,
  dateLine,
  findSpecies,
  lineName,
  lineSpecies,
  markersOf,
  moreLabel,
  nameList,
  pickHighlights,
  piecesFor,
  placeOfLevelUp,
  scoutsDestination,
  welcomeFor,
  welcomeOf,
  type Cast,
  type Story,
} from './highlights';
import { PLACES } from '../valley/valley-art';

const SPECIES = [
  'splashet',
  'mistnewt',
  'cindle',
  'sproutle',
  'zipmouse',
  'voltaro',
  'mudlump',
  'squelch',
];
const NAMES = ['Mossback', 'Pip', 'Ember', 'Sprout', 'Nib', 'Dot', 'Fig', 'Wren'];
const CAST: Cast = {
  creatures: NAMES.map((name, i) => ({
    name,
    species: SPECIES[i] ?? 'splashet',
    shiny: false,
    level: 5 + i,
  })),
  pieces: [
    { id: 'p-common', baseId: 'kelp-cap', name: 'Kelp Cap', rarity: 'common', level: 2 },
    { id: 'p-rare', baseId: 'bark-shawl', name: 'Bark Shawl', rarity: 'rare', level: 12 },
    { id: 'p-epic', baseId: 'emberkeepers-crown', name: 'Crown', rarity: 'epic', level: 15 },
    { id: 'p-rare-2', baseId: 'thundercap', name: 'Thundercap', rarity: 'rare', level: 16 },
  ],
  blueprints: ['brine-hood', 'kelp-cap'],
};

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

const kinds = (stories: Story[]): string[] => stories.map((s) => s.kind);

describe('the welcome of every visit of both journeys', () => {
  const all = [DAILY, WEEKLY].flatMap((journey) =>
    journey.visits.map((_, i) => ({ journey, i, welcome: welcomeOf(journey, i, CAST) })),
  );

  it('tells two or three highlights, never more than one of a kind, the biggest first', () => {
    for (const { welcome } of all) {
      const list = welcome.highlights;
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list.length).toBeLessThanOrEqual(MAX_HIGHLIGHTS);
      for (let i = 1; i < list.length; i += 1) {
        expect(list[i - 1]?.weight ?? 0).toBeGreaterThanOrEqual(list[i]?.weight ?? 0);
      }
    }
  });

  it('shows after a gap of hours, which every visit of both journeys has', () => {
    for (const { welcome } of all) expect(welcome.show).toBe(true);
  });

  it('counts what it did not tell as markers: the total of the markers is the "more"', () => {
    for (const { welcome } of all) {
      expect(welcome.markers.reduce((sum, m) => sum + m.count, 0)).toBe(welcome.more);
      const places = welcome.markers.map((m) => m.place);
      expect(new Set(places).size).toBe(places.length);
    }
  });

  it('gives every story a picture with at most three creatures, a short headline and at most one short line', () => {
    for (const { welcome } of all) {
      for (const s of welcome.highlights) {
        expect(s.scene.actors.length).toBeLessThanOrEqual(MAX_ACTORS + 1);
        expect(s.scene.place).toBe(s.place);
        expect(s.headline).toBe(s.headline.toUpperCase());
        expect(s.headline.length).toBeGreaterThan(0);
        expect(s.headline.length, s.headline).toBeLessThanOrEqual(MAX_HEADLINE);
        expect(s.blurb.length, s.blurb).toBeLessThanOrEqual(MAX_BLURB);
        // One line: no second sentence.
        expect(s.blurb.replace(/\.$/, ''), s.blurb).not.toMatch(/[.!?] /);
        for (const a of s.scene.actors) expect(a.who).toBeDefined();
      }
    }
  });

  it('shows what a story is about as a find, never in prose: every find is a piece of the cast’s bag, a blueprint it can sell or a species', () => {
    const ids = CAST.pieces.map((p) => p.id);
    for (const { welcome } of all) {
      for (const s of welcome.highlights) {
        for (const f of s.finds) {
          if (f.kind === 'item') expect(ids).toContain(f.piece.id);
          if (f.kind === 'blueprint') expect(CAST.blueprints).toContain(f.baseId);
          if (f.kind === 'newcomer') expect(lineSpecies(f.species) ?? f.species).toBe(f.species);
          if (f.kind === 'parts') {
            expect(f.parts.length).toBeGreaterThan(0);
            for (const p of f.parts) expect(p.amount).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('is the same story every time', () => {
    for (const { journey, i, welcome } of all) expect(welcomeOf(journey, i, CAST)).toEqual(welcome);
  });

  it('has the weekly player’s Sunday group a week and still tell two or three', () => {
    for (let i = 0; i < WEEKLY.visits.length; i += 1) {
      const w = welcomeOf(WEEKLY, i, CAST);
      expect(w.highlights.length).toBeLessThanOrEqual(3);
      expect(w.more).toBeGreaterThan(0);
    }
  });
});

describe('the highlights of a visit', () => {
  it('picks the best piece, the most notable creature moment and a moment of the valley, one each', () => {
    const w = welcomeFor(
      visit({
        events: [
          'new line: cindle',
          'mastery: anvil 1 reached Master',
          'place level-up: forge reached level 2',
          'visitor: rerolled a epic piece (item level 9.5) for 50 Acorns and 20 scrap: lines [1] became [2] (1 at the top pip)',
        ],
        came: { pieces: { collected: 1, worn: 2, bagged: 0 } },
      }),
      CAST,
      1,
    );
    expect(w.highlights.map((s) => s.id)).toEqual(['new-line', 'reroll', 'place-level']);
    expect(kinds(w.highlights).sort()).toEqual(['creature', 'piece', 'server']);
  });

  it('ranks a new line over a Master, a Master over a graduation, an Expert, a talent and an Apprentice', () => {
    const order: [string, string][] = [
      ['new line: cindle', 'new-line'],
      ['mastery: anvil 1 reached Master', 'mastery-anvil'],
      ['graduation: 2 creatures earned Bronze', 'graduation'],
      ['mastery: scout seat 1 reached Expert', 'mastery-scout'],
      ['school: a creature began learning its talent 1 (30 Acorns, 12 hours)', 'learning'],
      ['mastery: anvil 1 reached Apprentice', 'mastery-anvil'],
    ];
    for (let i = 0; i < order.length; i += 1) {
      const events = order.slice(i).map(([event]) => event);
      const creature = welcomeFor(visit({ events }), CAST, 1).highlights.find(
        (s) => s.kind === 'creature',
      );
      expect(creature?.id, events.join()).toBe(order[i]?.[1]);
    }
  });

  it('ranks a rerolled epic piece over a rare one over what the smith fitted over what was found', () => {
    const reroll = (rarity: string, level: string): string =>
      `visitor: rerolled a ${rarity} piece (item level ${level}) for 50 Acorns and 20 scrap: lines [1] became [2] (1 at the top pip)`;
    const piece = (events: string[], pieces = { collected: 1, worn: 1, bagged: 0 }): string =>
      welcomeFor(visit({ events, came: { pieces } }), CAST, 1).highlights.find(
        (s) => s.kind === 'piece',
      )?.headline ?? '';
    expect(piece([reroll('epic', '9.0'), reroll('rare', '12.0')])).toMatch(/REMAKES/);
    expect(piece([])).toMatch(/AT THE FORGE/);
    expect(piece([], { collected: 2, worn: 0, bagged: 0 })).toMatch(/FINDS GEAR/);
    const weight = (events: string[]): number =>
      welcomeFor(visit({ events }), CAST, 1).highlights.find((s) => s.id === 'reroll')?.weight ?? 0;
    expect(weight([reroll('epic', '9.0'), reroll('rare', '12.0')])).toBeGreaterThan(
      weight([reroll('rare', '9.0')]),
    );
    expect(weight([reroll('rare', '9.0')])).toBeGreaterThan(weight([reroll('common', '9.0')]));
    expect(weight([reroll('common', '9.0')])).toBeGreaterThan(0);
  });

  it('shows a piece of the story’s own rarity as the visitor’s reroll, whatever the day', () => {
    for (const rarity of ['common', 'rare', 'epic']) {
      for (let day = 1; day <= 9; day += 1) {
        const w = welcomeFor(
          visit({
            day,
            events: [
              `visitor: rerolled a ${rarity} piece (item level 9.0) for 50 Acorns and 20 scrap: lines [1] became [2] (1 at the top pip)`,
            ],
          }),
          CAST,
          1,
        );
        const [find] = w.highlights.find((s) => s.id === 'reroll')?.finds ?? [];
        expect(find?.kind).toBe('item');
        if (find?.kind === 'item') expect(find.piece.rarity).toBe(rarity);
      }
    }
  });

  it('shows up to three different pieces for what the smith made and says the total when there are more', () => {
    const smith = (worn: number) =>
      welcomeFor(
        visit({ came: { pieces: { collected: 0, worn, bagged: 0 } } }),
        CAST,
        1,
      ).highlights.find((s) => s.id === 'fitted');
    const three = smith(3);
    expect(three?.finds).toHaveLength(MAX_PIECES);
    expect(three?.blurb).toBe('');
    const ids = three?.finds.flatMap((f) => (f.kind === 'item' ? [f.piece.id] : [])) ?? [];
    expect(new Set(ids).size).toBe(3);
    expect(smith(1)?.finds).toHaveLength(1);
    const many = smith(12);
    expect(many?.finds).toHaveLength(MAX_PIECES);
    expect(many?.blurb).toBe('12 new pieces in all.');
    expect(many?.headline).toBe('EMBER AT THE FORGE');
  });

  it('shows a newcomer as a find, the scouts’ return as parts, and a sold blueprint as a blueprint', () => {
    const w = welcomeFor(
      visit({
        events: [
          'new line: cindle',
          "visitor: bought the week's blueprint (a new one) for 40 Acorns and 5 shards",
        ],
        came: { scrap: 120, shards: { ember: 7, tide: 0 } },
      }),
      CAST,
      1,
    );
    const [newcomer] = w.highlights;
    expect(newcomer?.finds).toEqual([{ kind: 'newcomer', species: 'cindle' }]);
    expect(newcomer?.headline).toBe('CINDLE MOVES IN');
    const sold = w.highlights.find((s) => s.id === 'visitor');
    expect(sold?.finds).toHaveLength(1);
    expect(sold?.finds[0]).toMatchObject({ kind: 'blueprint' });
    expect(sold?.headline).toBe('VISITOR SELLS A BLUEPRINT');
    const scouts = welcomeFor(
      visit({ came: { scrap: 120, shards: { ember: 7, tide: 0 } } }),
      CAST,
      1,
    ).highlights.find((s) => s.id === 'scouts-home');
    expect(scouts?.finds).toEqual([
      {
        kind: 'parts',
        parts: [
          { part: 'scrap', amount: 120 },
          { part: 'ember-shard', amount: 7 },
        ],
      },
    ]);
  });

  it('picks pieces by the day’s turn, the rarity first, and none when the bag has none', () => {
    expect(piecesFor([], 3, 3)).toEqual([]);
    expect(piecesFor(CAST.pieces, 1, 2).map((p) => p.id)).toEqual(['p-rare', 'p-epic']);
    expect(piecesFor(CAST.pieces, 1, 9)).toHaveLength(CAST.pieces.length);
    expect(piecesFor(CAST.pieces, 7, 1, 'epic').map((p) => p.id)).toEqual(['p-epic']);
    expect(piecesFor(CAST.pieces, 0, 1, 'legendary')).toHaveLength(1);
  });

  it('shows the smith’s piece as an item of the cast’s own bag, not as words or a drawing', () => {
    const w = welcomeFor(
      visit({ came: { pieces: { collected: 0, worn: 1, bagged: 0 } } }),
      CAST,
      1,
    );
    const piece = w.highlights.find((s) => s.kind === 'piece');
    expect(piece?.finds).toHaveLength(1);
    expect(piece?.finds[0]).toMatchObject({ kind: 'item' });
    expect(piece?.scene.props).toEqual([]);
    expect(piece?.blurb).toBe('');
  });

  it('is a place level-up, then the visitor, for the valley', () => {
    const level = welcomeFor(
      visit({
        events: [
          'place level-up: bonfire reached level 3',
          'visitor: he is in the valley until the raid finale',
        ],
      }),
      CAST,
      1,
    );
    const server = level.highlights.find((s) => s.kind === 'server');
    expect(server?.id).toBe('place-level');
    expect(server?.place).toBe('paddock');
    expect(server?.headline).toBe('THE BONFIRE GROWS TO LEVEL 3');
    expect(server?.blurb).toBe('');
    const visitor = welcomeFor(
      visit({ events: ['visitor: he is in the valley until the raid finale'] }),
      CAST,
      1,
    );
    expect(visitor.highlights.find((s) => s.kind === 'server')?.id).toBe('visitor');
  });

  it('has one of each kind, and tops a quiet day up with the next best so it is never one line', () => {
    const rich = welcomeFor(
      visit({
        events: ['new line: cindle'],
        came: { pieces: { collected: 0, worn: 1, bagged: 0 } },
      }),
      CAST,
      1,
    );
    expect(new Set(kinds(rich.highlights)).size).toBe(rich.highlights.length);
    const quiet = welcomeFor(visit(), CAST, 1); // only the scouts' return and a small moment
    expect(quiet.highlights.map((s) => s.id)).toEqual(['scouts-home', 'moment']);
  });

  it('closes a quiet day with a resting creature’s small moment, which is never counted as a thing', () => {
    const w = welcomeFor(visit({ came: { acorns: 0, scrap: 0, shards: {} } }), CAST, 1);
    expect(w.highlights.map((s) => s.id)).toEqual(['moment']);
    expect(w.show).toBe(true);
    expect(w.more).toBe(0);
    expect(moreLabel(w.more)).toBe('Into the valley');
  });

  it('groups a week’s newcomers, graduates and masters into one story each, with their count', () => {
    const w = welcomeFor(
      visit({
        events: [
          'new line: cindle',
          'new line: splashet',
          'new line: mistnewt',
          'new line: mudlump',
          'graduation: 2 creatures earned Bronze',
          'graduation: 1 creature earned Bronze',
          'mastery: scout seat 1 reached Expert',
          'mastery: scout seat 2 reached Expert',
        ],
        came: { acorns: 0, scrap: 0, shards: {} },
      }),
      CAST,
      7,
    );
    const first = w.highlights[0];
    expect(first?.id).toBe('new-lines');
    expect(first?.headline).toBe('4 NEWCOMERS ARRIVE');
    expect(first?.blurb).toBe('Cindle, Splashet, Mistnewt and 1 more');
    expect(first?.count).toBe(4);
    expect(first?.scene.actors).toHaveLength(MAX_ACTORS);
    // Only creature news: the next best, the graduates, tops it up; the two Experts wait as things.
    expect(w.highlights.map((h) => h.id)).toEqual(['new-lines', 'graduation']);
    expect(w.more).toBe(2);
  });

  it('names the creatures of a graduation and shows up to three of them', () => {
    const w = welcomeFor(visit({ events: ['graduation: 5 creatures earned Silver'] }), CAST, 1);
    const grad = w.highlights.find((s) => s.id === 'graduation');
    expect(grad?.headline).toBe('5 GRADUATE WITH SILVER');
    expect(grad?.blurb).toBe('Nib, Dot, Fig and 2 more');
    expect(grad?.scene.actors).toHaveLength(3);
  });

  it('keeps a story for what it does not know yet, as the lab wrote it', () => {
    const w = welcomeFor(visit({ events: ['a thing the lab added'] }), CAST, 1);
    expect(w.more + w.highlights.length).toBeGreaterThan(0);
    expect([...w.highlights].some((s) => s.blurb === 'a thing the lab added') || w.more > 0).toBe(
      true,
    );
  });
});

describe('the rest, as "...and N more things" and markers', () => {
  it('counts every untold thing and puts one marker per place with the number waiting', () => {
    const w = welcomeFor(
      visit({
        events: [
          'new line: cindle',
          'mastery: anvil 1 reached Master',
          'visitor: he is in the valley until the raid finale',
        ],
        came: {
          creatures: [{ line: 'mistnewt', count: 2, newLine: false }],
          pieces: { collected: 1, worn: 2, bagged: 1 },
        },
      }),
      CAST,
      1,
    );
    const total = w.markers.reduce((sum, m) => sum + m.count, 0);
    expect(total).toBe(w.more);
    expect(w.more).toBeGreaterThan(0);
    for (const m of w.markers) expect(PLACES.map((p) => p.id)).toContain(m.place);
  });

  it('leaves no markers for flourishes with no count', () => {
    const stories = [{ place: 'paddock', count: 0, species: undefined }] as unknown as Story[];
    expect(markersOf(stories)).toEqual([]);
  });

  it('words the button: singular, plural, and "Into the valley" when nothing waits', () => {
    expect(moreLabel(13)).toBe('...and 13 more things');
    expect(moreLabel(2)).toBe('...and 2 more things');
    expect(moreLabel(1)).toBe('...and 1 more thing');
    expect(moreLabel(0)).toBe('Into the valley');
  });
});

describe('when the popup shows', () => {
  it('shows after three hours away or more, never on a shorter visit', () => {
    expect(WELCOME_AFTER_HOURS).toBe(3);
    expect(welcomeFor(visit(), CAST, 3 / 24).show).toBe(true);
    expect(welcomeFor(visit(), CAST, 2.9 / 24).show).toBe(false);
    expect(welcomeFor(visit(), CAST, 0).show).toBe(false);
    expect(welcomeFor(visit(), CAST, 7).show).toBe(true);
  });
});

describe('who is who and how it reads', () => {
  it('puts two scouts first, then two smiths, then the ones that rest, never a scout like the newcomer', () => {
    expect(assignCast(CAST.creatures, null)).toEqual({
      scouts: [0, 1],
      smiths: [2, 3],
      resting: [4, 5, 6, 7],
    });
    const crew = assignCast(CAST.creatures, 'splashet');
    expect(crew.scouts).toEqual([1, 2]);
    expect(crew.smiths).toEqual([3, 4]);
    expect(crew.resting).toEqual([5, 6, 7, 0]);
    expect(assignCast([CAST.creatures[0] as Cast['creatures'][number]], null)).toEqual({
      scouts: [0, 0],
      smiths: [0, 0],
      resting: [],
    });
  });

  it('keeps the walker-like look-alike out of a newcomer’s picture in every real visit', () => {
    for (const journey of [DAILY, WEEKLY]) {
      for (const v of journey.visits) {
        const find = findSpecies(v);
        if (find === null) continue;
        const w = welcomeFor(v, CAST, 1);
        const story = w.highlights.find((s) => s.id === 'new-line');
        for (const a of story?.scene.actors ?? []) {
          if (a.who.kind === 'cast') expect(CAST.creatures[a.who.slot]?.species).not.toBe(find);
        }
      }
    }
  });

  it('lists names in a sentence, up to three and then the count of the rest', () => {
    expect(nameList([])).toBe('');
    expect(nameList(['A'])).toBe('A');
    expect(nameList(['A', 'B'])).toBe('A and B');
    expect(nameList(['A', 'B', 'C'])).toBe('A, B and C');
    expect(nameList(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C and 2 more');
    expect(nameList(['A', 'B'], 5)).toBe('A, B and 3 more');
  });

  it('names a line from the content, with a fallback for one it does not know', () => {
    expect(lineName('splashet')).toBe('Splashet');
    expect(lineName('new line 16 (common)')).toBe('a new creature');
    expect(lineName('nothing')).toBe('nothing');
    expect(lineSpecies('splashet')).toBe('splashet');
    expect(lineSpecies('new line 16 (common)')).toBeNull();
  });

  it('names where the scouts went after the shards they brought most of', () => {
    expect(scoutsDestination(visit({ came: { shards: { tide: 3, mire: 9 } } }))).toBe(
      'the Sunken Fen',
    );
    expect(scoutsDestination(visit({ came: { shards: {} } }))).toBe('the Tidepools');
  });

  it('stages the bonfire at the Paddock (the valley has none yet) and any real place where it is', () => {
    expect(placeOfLevelUp('bonfire')).toBe('paddock');
    expect(placeOfLevelUp('forge')).toBe('forge');
  });

  it('dates a visit and picks the best of each kind by weight', () => {
    expect(dateLine(visit({ weekday: 'Monday', week: 2, day: 8 }))).toBe('Monday · week 2 · day 8');
    const story = (kind: Story['kind'], weight: number, id: string): Story =>
      ({ id, kind, weight }) as unknown as Story;
    const picked = pickHighlights([
      story('creature', 10, 'a'),
      story('creature', 30, 'b'),
      story('piece', 20, 'c'),
    ]);
    expect(picked.map((s) => s.id)).toEqual(['b', 'c']);
  });
});
