import { describe, expect, it } from 'vitest';
import { homeAlerts } from '../home-view';
import { HOME_NOW, homeInput } from '../workbench/home-sample';
import {
  CAST_PLACES,
  MAX_ROAMERS,
  castFor,
  fairEntries,
  hasScene,
  type CastInput,
} from './place-cast';
import { placeBubbles } from './place-state';

const ART = { width: 64, height: 54 };
const busy = homeInput('busy', true);
const quiet = homeInput('nothing going on', true);
const ids = (n: number, from = 0) => busy.creatures.slice(from, from + n).map((c) => c.id);

function inputOf(base: typeof busy, extra: Partial<CastInput> = {}): CastInput {
  return {
    ...base,
    dungeonTeam: null,
    waiting: [],
    now: HOME_NOW,
    ...extra,
  };
}
const cast = (place: (typeof CAST_PLACES)[number], base: typeof busy, extra?: Partial<CastInput>) =>
  castFor(place, inputOf(base, extra), ART, placeBubbles(homeAlerts(base), base));

describe('which places have a scene', () => {
  it('five, and not the Signpost or the Forge (phase 5 posts)', () => {
    expect([...CAST_PLACES].sort()).toEqual(['arena', 'cave', 'fair', 'house', 'paddock']);
    expect(hasScene('signpost')).toBe(false);
    expect(hasScene('forge')).toBe(false);
    expect(hasScene('school')).toBe(false);
  });
});

describe('House', () => {
  it('nobody stands by the house, whoever lounges: the living room is gone from the valley', () => {
    const c = cast('house', busy);
    expect(c.stands).toEqual([]);
    expect(c.act).toEqual({ kind: 'calm', line: 'Your journal and numbers are inside' });
  });
});

describe('Cave', () => {
  it('a run waits: the team stands at the mouth and the action is Start the run', () => {
    const c = cast('cave', busy, { dungeonTeam: [ids(1)[0] ?? null, null, ids(1, 2)[0] ?? null] });
    expect(c.stands.map((s) => s.creature.id)).toEqual([ids(1)[0], ids(1, 2)[0]]);
    expect(c.act).toMatchObject({ kind: 'step', label: 'Start the run' });
    // Deterministic: the same input, the same places.
    expect(cast('cave', busy, { dungeonTeam: ids(3) })).toEqual(
      cast('cave', busy, { dungeonTeam: ids(3) }),
    );
  });
  it('quiet: no run waiting and no row set up, the cave is quiet', () => {
    const c = cast('cave', quiet);
    expect(c.stands).toEqual([]);
    expect(c.act).toEqual({ kind: 'calm', line: 'The cave is quiet' });
  });
  it('a set-up row stands there even with no run waiting; gone creatures are skipped', () => {
    const c = cast('cave', quiet, { dungeonTeam: [ids(1)[0] ?? null, 'gone', null] });
    expect(c.stands).toHaveLength(1);
    expect(c.act.kind).toBe('calm');
  });
});

describe('Arena', () => {
  const scene = { boss: { id: 'old-bogback', name: 'Old Bogback' }, party: ids(3) };
  it('the placed party and the boss', () => {
    const c = cast('arena', {
      ...busy,
      raid: { ...(busy.raid ?? { schedule: {} as never }), scene },
    });
    expect(c.stands.map((s) => s.creature.id)).toEqual(ids(3));
    expect(c.boss).toEqual(scene.boss);
    expect(c.act).toMatchObject({ kind: 'step', label: 'Place your creatures' });
  });
  it('before the raid view has loaded: nobody and no boss', () => {
    const c = cast('arena', { ...busy, raid: null, attention: null });
    expect(c.stands).toEqual([]);
    expect(c.boss).toBeNull();
    expect(c.act).toEqual({ kind: 'calm', line: 'The arena waits' });
  });
  it('placed, nothing left to place: a calm line', () => {
    const c = cast('arena', {
      ...quiet,
      raid: { ...(quiet.raid ?? { schedule: {} as never }), scene },
    });
    expect(c.act).toEqual({ kind: 'calm', line: 'Your party is in the arena' });
  });
});

describe('Fairground', () => {
  it('the entered creatures stand in a group for each event', () => {
    const groups = fairEntries(busy.games, busy.creatures);
    const entered = groups.flatMap((g) => g.creatures.map((c) => c.id));
    const c = cast('fair', busy);
    expect(c.stands.map((s) => s.creature.id)).toEqual(entered);
    for (const s of c.stands) expect(s.where).toMatch(/^in /);
  });
  it('nothing loaded: an empty fair', () => {
    const c = cast('fair', { ...busy, games: null });
    expect(c.stands).toEqual([]);
    expect(c.act.kind).toBe('calm');
  });
  it('events still to enter ask for you', () => {
    expect(cast('fair', busy).act).toMatchObject({ kind: 'step', label: 'Enter an event' });
  });
});

describe('Paddock', () => {
  it('the creatures at home roam, the same eight the map draws', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      ...busy.creatures[0],
      away: false,
      busy: null,
      id: `m${String(i)}`,
    }));
    const c = cast('paddock', { ...busy, creatures: many as never });
    expect(c.roamers).toHaveLength(MAX_ROAMERS);
    expect(c.roam).not.toBeNull();
  });
  it('waiting catches stand at the gate and the action chooses for them', () => {
    const waiting = [
      { id: 'a', species: 'cindle', shiny: false },
      { id: 'b', species: 'cindle', shiny: false },
      { id: 'c', species: 'cindle', shiny: false },
    ];
    const c = cast('paddock', { ...busy, pending: 3 }, { waiting });
    expect(c.gate).toHaveLength(2);
    expect(c.act).toMatchObject({ kind: 'step', label: 'Choose for the newcomers' });
  });
  it('nobody home and nobody waiting', () => {
    const c = cast('paddock', { ...busy, creatures: [] });
    expect(c.roamers).toEqual([]);
    expect(c.gate).toEqual([]);
    expect(c.act).toEqual({ kind: 'calm', line: 'Nobody is home' });
  });
});
