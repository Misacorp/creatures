import { describe, expect, it } from 'vitest';
import { homeAlerts } from '../home-view';
import { NO_ALERTS } from '../tab-alerts';
import { HOME_NOW, homeInput } from '../workbench/home-sample';
import {
  bubbleAt,
  placeBubbles,
  placeFallback,
  placeSpoken,
  placeStates,
  type PlaceInput,
} from './place-state';
import { OPEN_PLACES } from './valley-nav';

const busy = homeInput('busy', true);
const waiting = homeInput('nothing waiting', true);
const quiet = homeInput('nothing going on', true);
const bubblesOf = (i: PlaceInput) => placeBubbles(homeAlerts(i), i);

describe("placeBubbles: today's pips on the places", () => {
  it('a quiet day has no bubble', () => {
    expect(bubblesOf(waiting)).toEqual([]);
    expect(bubblesOf(quiet)).toEqual([]);
    expect(placeBubbles(NO_ALERTS, busy)).toEqual([]);
  });

  it('a busy day: every tab with a pip puts one bubble on its place', () => {
    const bubbles = bubblesOf(busy);
    expect(bubbles.map((b) => b.place).sort()).toEqual([
      'arena',
      'cave',
      'fair',
      'forge',
      'signpost',
    ]);
    expect(bubbleAt(bubbles, 'forge')).toMatchObject({ glyph: 'anvil', count: null });
    expect(bubbleAt(bubbles, 'signpost')).toMatchObject({ glyph: 'compass' });
    expect(bubbleAt(bubbles, 'cave')).toMatchObject({ glyph: 'door' });
    expect(bubbleAt(bubbles, 'arena')).toMatchObject({ glyph: 'blade' });
    expect(bubbleAt(bubbles, 'house')).toBeUndefined();
  });

  it('carries the count where today counts: events to enter, catches', () => {
    expect(bubbleAt(bubblesOf(busy), 'fair')).toMatchObject({
      count: 2,
      spoken: '2 events to enter',
    });
    const catches: PlaceInput = { ...quiet, pending: 3 };
    expect(bubbleAt(bubblesOf(catches), 'paddock')).toMatchObject({
      glyph: 'paw',
      count: 3,
      spoken: '3 catches await your choice',
    });
    const one: PlaceInput = { ...quiet, pending: 1 };
    expect(bubbleAt(bubblesOf(one), 'paddock')).toMatchObject({ count: null });
  });

  it("names what waits in the place's spoken name", () => {
    const forge = bubbleAt(bubblesOf(busy), 'forge');
    expect(placeSpoken('forge', forge)).toBe('Forge, Workshop. a job is ready');
    expect(placeSpoken('forge', undefined)).toBe('Forge, Workshop');
  });
});

describe('placeStates: what happens next', () => {
  it('a busy day', () => {
    expect(placeStates(busy)).toMatchObject({
      cave: 'a run waits',
      fair: '2 events to enter',
      forge: 'a job waits',
      arena: 'creatures to place',
      signpost: 'a trip is home',
      house: 'Journal, Stats',
    });
  });

  it('nothing waiting: the next time on each clock', () => {
    expect(placeStates(waiting)).toMatchObject({
      cave: 'no run waiting',
      fair: 'entries close in 3 h 37 m',
      forge: 'a job done in 4 h 5 m',
      signpost: '2 trips out',
      arena: 'raid today',
    });
  });

  it('nothing going on: calm lines, never "you missed"', () => {
    const lines = placeStates(quiet);
    expect(lines).toMatchObject({
      fair: 'results are in',
      forge: 'no job running',
      arena: "this week's raid is over",
      signpost: 'nobody is out',
    });
    for (const line of Object.values(lines)) expect(line).not.toMatch(/miss/i);
  });

  it('one trip out names the explorer; the raid names its day; the paddock gate its newcomers', () => {
    const [trip] = waiting.trips;
    if (trip === undefined) throw new Error('no trip');
    expect(placeStates({ ...waiting, trips: [trip] }).signpost).toMatch(/ back in \d/);
    const raid = waiting.raid;
    if (raid === null) throw new Error('no raid');
    const hour = 3_600_000;
    const later = {
      ...raid,
      schedule: {
        ...raid.schedule,
        phase1: HOME_NOW + 26 * hour,
        phase2: HOME_NOW + 50 * hour,
        finale: HOME_NOW + 80 * hour,
      },
    };
    expect(placeStates({ ...waiting, raid: later }).arena).toMatch(/^raid [A-Z][a-z]+day$/);
    expect(placeStates({ ...waiting, pending: 1 }).paddock).toBe('a newcomer at the gate');
    expect(placeStates({ ...waiting, pending: 2 }).paddock).toBe('2 newcomers at the gate');
    expect(placeStates({ ...waiting, creatures: [] }).paddock).toBe('none at home');
  });

  it("data that has not loaded leaves the place with its page's name; new places say not open", () => {
    const unknown: PlaceInput = { ...busy, jobs: null, games: null, attention: null, raid: null };
    const lines = placeStates(unknown);
    expect(lines.forge).toBe('Workshop');
    expect(lines.fair).toBe('Valley Games');
    expect(lines.cave).toBe('Dungeon');
    expect(lines.arena).toBe('Raid');
    for (const id of ['bonfire', 'school', 'visitor', 'market'] as const) {
      expect(lines[id]).toBe('not open yet');
      expect(placeFallback(id)).toBe('not open yet');
    }
    for (const id of OPEN_PLACES) expect(lines[id]).not.toBe('');
  });
});
