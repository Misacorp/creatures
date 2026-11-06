import { describe, expect, it } from 'vitest';
import { homeAlerts } from '../home-view';
import { HOME_NOW, homeInput } from '../workbench/home-sample';
import { buildingPlace, openPlace, sampleCommons, withCommons } from './commons-sample';
import { castFor, type CastInput } from './place-cast';
import { placeBubbles, placeStates } from './place-state';
import { sampleSeat, sampleValley } from './signpost-sample';
import { isHelping, trayBadge, trayFor, trayStates } from './tray-state';

const ART = { width: 64, height: 54 };
const busy = homeInput('busy', true);
const free = busy.creatures.map((c) => ({ ...c, busy: null, away: false }));
const [a, b] = free;
if (a === undefined || b === undefined) throw new Error('fixture');

function inputOf(visit: ReturnType<typeof sampleValley>): CastInput {
  return {
    ...busy,
    creatures: free,
    dungeonTeam: null,
    dungeonPhase: null,
    waiting: [],
    now: HOME_NOW,
    visit,
  };
}
const cast = (place: 'signpost' | 'forge' | 'paddock', visit: ReturnType<typeof sampleValley>) =>
  castFor(place, inputOf(visit), ART, placeBubbles(homeAlerts(busy), busy));

describe('the scene shows the project (V-COM-6)', () => {
  it('scaffolding stands in steps as the open project fills, none while it builds or waits', () => {
    const at = (fraction: number) =>
      cast(
        'signpost',
        withCommons(
          sampleValley(free, []),
          sampleCommons({
            places: [openPlace('signpost', 2, 900, fraction)],
          }),
        ),
      ).scaffold;
    expect(at(0)).toBe(0);
    expect(at(0.05)).toBeGreaterThan(0);
    expect(at(0.5)).toBeGreaterThan(at(0.2));
    expect(at(0.99)).toBeLessThan(12);
    const building = withCommons(
      sampleValley(free, []),
      sampleCommons({ places: [buildingPlace('signpost', 3, 2, ['Ada'])] }),
    );
    expect(cast('signpost', building).scaffold).toBe(0);
    // Without the commons block (an older answer, or the flag off) nothing changes.
    expect(cast('signpost', sampleValley(free, [])).scaffold).toBe(0);
  });

  it('a creature on a communal seat stands in the place: with the scouts at the Signpost, with the smiths at the Forge', () => {
    const scouts = sampleValley(free, [sampleSeat('s1', 'tidepools', a.id, 10)]);
    const withHelper = withCommons(scouts, sampleCommons(), {
      place: 'signpost',
      creatureId: b.id,
    });
    const stands = cast('signpost', withHelper).stands;
    expect(stands.map((s) => s.creature.id).sort()).toEqual([a.id, b.id].sort());
    expect(stands.find((s) => s.creature.id === b.id)?.where).toBe('helping build the road');
    const forge = withCommons(sampleValley(free, []), sampleCommons(), {
      place: 'forge',
      creatureId: a.id,
    });
    expect(cast('forge', forge).stands.map((s) => s.where)).toEqual(['helping build the Forge']);
  });

  it('a helper at the Paddock stands at the rails and does not wander', () => {
    const visit = withCommons(sampleValley(free, []), sampleCommons(), {
      place: 'paddock',
      creatureId: a.id,
    });
    const paddock = cast('paddock', visit);
    expect(paddock.stands.map((s) => s.creature.id)).toEqual([a.id]);
    expect(paddock.roamers.some((c) => c.id === a.id)).toBe(false);
    expect(cast('paddock', sampleValley(free, [])).roamers.some((c) => c.id === a.id)).toBe(true);
  });
});

describe('the tray and the Places list', () => {
  it('a creature on a communal seat is Helping in the tray, and sorts with the busy ones', () => {
    const visit = withCommons(sampleValley(free, []), sampleCommons(), {
      place: 'forge',
      creatureId: a.id,
    });
    const input = { trips: [], jobs: null, now: 0, ...trayStates(visit) };
    expect(trayBadge(a, input).state).toBe('helping');
    expect(trayBadge(a, input).label).toMatch(/Helping/);
    expect(trayBadge(b, input).state).not.toBe('helping');
    expect(isHelping(a, visit)).toBe(true);
    expect(isHelping(b, visit)).toBe(false);
    expect(trayFor(free, input).at(-1)?.id).not.toBe(b.id);
    expect(trayFor(free, input).findIndex((c) => c.id === a.id)).toBeGreaterThan(
      trayFor(free, input).findIndex((c) => c.id === b.id),
    );
  });

  it('a place that builds says so with its days; an open project and a plain valley add nothing', () => {
    const visit = withCommons(sampleValley(free, []), sampleCommons());
    const lines = placeStates({ ...busy, visit });
    expect(lines.forge).toMatch(/the Forge is being built, 2 days left/);
    expect(lines.signpost).not.toMatch(/built/);
    expect(placeStates({ ...busy, visit: sampleValley(free, []) }).forge).not.toMatch(/built/);
    // The Bonfire's line is its resting count, so a building hearth takes its place.
    const hearth = withCommons(
      sampleValley(free, []),
      sampleCommons({ places: [buildingPlace('bonfire', 2, 3, ['Ada'])] }),
    );
    expect(placeStates({ ...busy, visit: hearth }).bonfire).toBe(
      'the hearth is being built, 3 days left',
    );
  });

  it('no bubble is added for an open project: the map stays as clear as before', () => {
    const visit = withCommons(sampleValley(free, []), sampleCommons());
    const plain = placeBubbles(homeAlerts(busy), { ...busy, visit: sampleValley(free, []) });
    expect(placeBubbles(homeAlerts(busy), { ...busy, visit })).toEqual(plain);
  });
});
