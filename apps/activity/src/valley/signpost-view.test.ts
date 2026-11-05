import { describe, expect, it } from 'vitest';
import { NO_ALERTS } from '../tab-alerts';
import { homeInput } from '../workbench/home-sample';
import { castFor } from './place-cast';
import { placeBubbles } from './place-state';
import { sampleSeat, sampleValley } from './signpost-sample';
import {
  destinationRows,
  fitPreview,
  packLine,
  perDayText,
  signpostSystemsLine,
} from './signpost-view';
import { trayBadge, trayStates } from './tray-state';

const base = homeInput('busy', true);
const free = base.creatures.map((c) => ({ ...c, busy: null, away: false }));
const [a, b] = free;
if (a === undefined || b === undefined) throw new Error('fixture');

describe('the Signpost words', () => {
  it('a pack says full, when it fills, or that nobody is posted', () => {
    expect(packLine(sampleSeat('s', 'tidepools', null, 0))).toBe('Nobody posted');
    expect(packLine(sampleSeat('s', 'tidepools', a.id, 72))).toBe('Pack full');
    expect(packLine(sampleSeat('s', 'tidepools', a.id, 24))).toBe('Full in 2 d');
  });

  it('numbers a day brings read short', () => {
    expect(perDayText(0)).toBe('none');
    expect(perDayText(0.04)).toBe('under 0.1');
    expect(perDayText(0.25)).toBe('0.3');
    expect(perDayText(50.6)).toBe('51');
  });

  it('the destinations list the special and open ones first, the closed last', () => {
    const rows = destinationRows(sampleValley(free, []));
    expect(rows[0]?.id).toBe('ember-caves');
    expect(rows.at(-1)).toMatchObject({ id: 'festival-grounds', open: false });
    expect(rows.at(-1)?.closed).toMatch(/Festival/);
  });

  it('the state line: a full pack first, else the scouts out', () => {
    expect(signpostSystemsLine(sampleValley(free, []))).toBe('a free seat waits');
    const one = sampleValley(free, [sampleSeat('s1', 'tidepools', a.id, 10)]);
    expect(signpostSystemsLine(one)).toBe('a scout out');
    const full = sampleValley(free, [sampleSeat('s1', 'tidepools', a.id, 80)]);
    expect(signpostSystemsLine(full)).toBe('a pack is full');
  });

  it('a full pack puts a bubble on the Signpost', () => {
    const full = sampleValley(free, [sampleSeat('s1', 'tidepools', a.id, 80)]);
    const bubbles = placeBubbles(NO_ALERTS, { ...base, visit: full });
    expect(bubbles).toMatchObject([{ place: 'signpost', count: null }]);
    expect(placeBubbles(NO_ALERTS, { ...base, visit: sampleValley(free, []) })).toEqual([]);
  });
});

describe('the fit preview (V-POST-4)', () => {
  it('one arrow and one number: a fit goes up, no fit changes nothing', () => {
    const ember = free.find((c) => c.species === 'cindle');
    if (ember === undefined) throw new Error('fixture has no cindle');
    const visit = sampleValley(free, [sampleSeat('s1', 'ember-caves', null, 0)]);
    const seat = visit.seats[0];
    if (seat === undefined) throw new Error('seat');
    expect(fitPreview(ember, seat, visit, free)).toMatchObject({ arrow: 'up' });
    const other = { ...seat, destination: 'tidepools' };
    expect(fitPreview(ember, other, visit, free)).toMatchObject({ arrow: 'none' });
  });
});

describe('the Signpost scene and the tray with scouts', () => {
  it('scouts stand in the scene, a free seat asks for a scout, a first seat asks to be taken', () => {
    const input = { ...base, creatures: free, dungeonTeam: null, dungeonPhase: null, waiting: [] };
    const art = { width: 64, height: 54 };
    const none = castFor('signpost', { ...input, visit: sampleValley(free, []) }, art, []);
    expect(none.act).toMatchObject({ kind: 'step', label: 'Take your first seat', detail: 'free' });
    const visit = sampleValley(free, [
      sampleSeat('s1', 'tidepools', a.id, 10),
      sampleSeat('s2', 'tidepools', null, 0),
    ]);
    const cast = castFor('signpost', { ...input, visit }, art, []);
    expect(cast.stands.map((s) => s.creature.id)).toEqual([a.id]);
    expect(cast.stands[0]?.where).toMatch(/^scouting at /);
    expect(cast.act).toMatchObject({ kind: 'step', label: 'Post a scout' });
  });

  it('a scouting creature says Scouting in the tray and carries no z', () => {
    const visit = sampleValley(free, [sampleSeat('s1', 'tidepools', a.id, 10)]);
    const input = { trips: [], jobs: null, now: 0, ...trayStates(visit) };
    expect(trayBadge(a, input)).toMatchObject({ state: 'scouting' });
    expect(trayBadge(a, input).label).toMatch(/Scouting at/);
    expect(trayBadge(b, input).state).toBe('resting');
  });
});
