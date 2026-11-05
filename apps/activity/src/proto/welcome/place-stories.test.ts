import { describe, expect, it } from 'vitest';
import { PLACES, type PlaceId } from '../valley/valley-art';
import { welcomeOf, type Marker, type Story } from './highlights';
import { DAILY, WEEKLY } from './journey';
import { MAX_STAGE, STAGE_GAP, stageOf, storiesAt, unseenMarkers } from './place-stories';
import { castOf, markerBubbles, welcomeWorld } from './welcome-world';

const cast = castOf(welcomeWorld());

const story = (id: string, actors: Story['scene']['actors'], props: Story['scene']['props']) =>
  ({ id, scene: { place: 'forge', actors, props } }) as unknown as Story;

const marker = (place: PlaceId, stories: Story[] = []): Marker => ({
  place,
  count: 1,
  glyph: 'anvil',
  species: undefined,
  stories,
});

describe('which markers still wait', () => {
  const markers = [marker('forge'), marker('signpost'), marker('house')];

  it('drops the markers of places that were seen, keeping the order of the rest', () => {
    expect(unseenMarkers(markers, []).map((m) => m.place)).toEqual(['forge', 'signpost', 'house']);
    expect(unseenMarkers(markers, ['signpost']).map((m) => m.place)).toEqual(['forge', 'house']);
    expect(unseenMarkers(markers, ['forge', 'signpost', 'house'])).toEqual([]);
  });

  it('is a place’s stories until it was seen, then nothing; a place with no marker has none', () => {
    const told = story('a', [], []);
    const withStory = [marker('forge', [told]), marker('house')];
    expect(storiesAt(withStory, 'forge', [])).toEqual([told]);
    expect(storiesAt(withStory, 'forge', ['forge'])).toEqual([]);
    expect(storiesAt(withStory, 'paddock', [])).toEqual([]);
    expect(storiesAt(withStory, 'house', [])).toEqual([]);
  });

  it('turns into the valley’s bubbles, so a seen place has no bubble in the valley or the places list', () => {
    const welcome = welcomeOf(DAILY, 21, cast);
    const first = welcome.markers[0];
    if (first === undefined) throw new Error('the visit has no marker');
    const before = markerBubbles(unseenMarkers(welcome.markers, []));
    const after = markerBubbles(unseenMarkers(welcome.markers, [first.place]));
    expect(before).toHaveLength(welcome.markers.length);
    expect(after.map((b) => b.place)).not.toContain(first.place);
    expect(after).toHaveLength(before.length - 1);
  });
});

describe('who stands in a place while its stories are told', () => {
  const scout = { kind: 'cast', slot: 0 } as const;
  const smith = { kind: 'cast', slot: 2 } as const;
  const newcomer = { kind: 'species', species: 'cindle' } as const;

  it('puts every creature of every story in one row, once each, in telling order, centred', () => {
    const stage = stageOf([
      story(
        '1',
        [
          { who: newcomer, dx: 8, dy: 8 },
          { who: scout, dx: -26, dy: 6 },
        ],
        [],
      ),
      story(
        '2',
        [
          { who: scout, dx: 0, dy: 8 },
          { who: smith, dx: 0, dy: 8 },
        ],
        [],
      ),
    ]);
    expect(stage.actors.map((a) => a.who)).toEqual([newcomer, scout, smith]);
    expect(stage.actors.map((a) => a.dx)).toEqual([-STAGE_GAP, 0, STAGE_GAP]);
    expect(new Set(stage.actors.map((a) => a.dy)).size).toBe(1);
  });

  it('turns the far half to face the near half, and one creature stands alone, facing the same way', () => {
    const two = stageOf([
      story(
        '1',
        [
          { who: scout, dx: 0, dy: 8 },
          { who: smith, dx: 0, dy: 8 },
        ],
        [],
      ),
    ]);
    expect(two.actors.map((a) => a.flip === true)).toEqual([false, true]);
    const one = stageOf([story('1', [{ who: scout, dx: 0, dy: 8 }], [])]);
    expect(one.actors.map((a) => a.flip === true)).toEqual([false]);
  });

  it('never stands more than a few, so the row fits a phone', () => {
    const many = Array.from({ length: 8 }, (_, slot) => ({
      who: { kind: 'cast', slot } as const,
      dx: 0,
      dy: 8,
    }));
    expect(stageOf([story('1', many, [])]).actors).toHaveLength(MAX_STAGE);
  });

  it('draws each prop once: sparkles over the middle, the sack beside the row', () => {
    const sparkle = { prop: { kind: 'glyph', id: 'sparkle' }, dx: 5, dy: -30, big: true } as const;
    const sack = { prop: { kind: 'sack' }, dx: 18, dy: -4 } as const;
    const stage = stageOf([
      story('1', [{ who: scout, dx: 0, dy: 8 }], [sparkle, sack]),
      story('2', [{ who: smith, dx: 0, dy: 8 }], [sparkle, sack]),
    ]);
    expect(stage.props).toHaveLength(2);
    const [spark, bag] = stage.props;
    expect(spark?.dx).toBe(0);
    expect(spark?.dy).toBeLessThan(0);
    expect(bag?.dx).toBeGreaterThan(STAGE_GAP / 2);
  });

  it('is empty for a place of plain stories with nobody in them', () => {
    expect(stageOf([story('1', [], [])])).toEqual({ actors: [], props: [] });
    expect(stageOf([])).toEqual({ actors: [], props: [] });
  });
});

describe('every place a story can reach', () => {
  it('stays among the places the valley has', () => {
    const ids = PLACES.map((p) => p.id);
    for (const journey of [DAILY, WEEKLY]) {
      for (let i = 0; i < journey.visits.length; i += 1) {
        const w = welcomeOf(journey, i, cast);
        for (const s of [...w.highlights, ...w.rest]) expect(ids).toContain(s.place);
      }
    }
  });
});
