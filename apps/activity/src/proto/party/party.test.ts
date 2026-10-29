import { describe, expect, it } from 'vitest';
import { RAID_TEAM_SIZE, TOUR, creatureOf, initialWorld, raidTeamIds, worldAtStep } from '../world';
import { greyOf } from './art';
import { campOrder, creatureBadge, inOrder, pipsLeft } from './camp-state';
import { artScale, campColumns, fitScale, lPath, trailDashes, WIDE_PX } from './layout';
import {
  closeView,
  enterGames,
  goOnTrip,
  pick,
  putDown,
  startCraft,
  tapStation,
} from './party-actions';
import { partyAtStep, type PartyState } from './party-state';
import { STATIONS, placesFor, stationVerdict } from './stations';
import { nextTimers } from './Today';

const HOME = 'sample-4'; // Sproutle: home from Verdant Hollow with loot
const AWAY = 'sample-1'; // Tidewing: out at Ember Caves
const WORKER = 'sample-6'; // Zipmouse: its Kelp Cap is ready
const EVOLVER = TOUR.evolveId; // Cindle
const LOUNGER = 'sample-0'; // Splashet
const FREE = 'sample-5'; // Thornbuck

describe('creatureBadge', () => {
  const start = partyAtStep(1);
  const badge = (id: string) =>
    creatureBadge(start.world, creatureOf(start.world, id), start.lounger, start.caveTeam);

  it('gives each state its own bubble, highest priority first', () => {
    expect(badge(HOME).bubble).toBe('loot');
    expect(badge(WORKER).bubble).toBe('needs');
    expect(badge(EVOLVER).bubble).toBe('evolve');
    expect(badge(AWAY).bubble).toBe('trip');
    expect(badge(FREE).bubble).toBe('free');
  });

  it('says the whole state in words, name and level first', () => {
    expect(badge(HOME).label).toBe('Sproutle, level 7. Home from Verdant Hollow with loot.');
    expect(badge(AWAY).label).toContain('Away at Ember Caves.');
  });

  it('marks the lounger, raiders and the cave team at the feet, at most two', () => {
    expect(badge(LOUNGER).marks).toEqual(['couch']);
    const placed = partyAtStep(6);
    const raider = TOUR.raidCreatureIds[0] ?? '';
    const b = creatureBadge(placed.world, creatureOf(placed.world, raider), raider, [raider]);
    expect(b.marks).toEqual(['couch', 'blade']);
  });

  it('shows the time left of a trip as lit pips', () => {
    expect(badge(AWAY).pips).toBeGreaterThan(0);
    expect(badge(AWAY).pips).toBeLessThanOrEqual(4);
  });
});

describe('pipsLeft', () => {
  it('rounds up while running and is 0 when done', () => {
    expect(pipsLeft(0, 100, 0)).toBe(4);
    expect(pipsLeft(0, 100, 99)).toBe(1);
    expect(pipsLeft(0, 100, 50)).toBe(2);
    expect(pipsLeft(0, 100, 100)).toBe(0);
    expect(pipsLeft(100, 100, 0)).toBe(0);
  });
});

describe('campOrder', () => {
  it('puts what needs you first, then free, lounging, working, away; high level first', () => {
    const world = initialWorld();
    const order = campOrder(world, LOUNGER, []);
    expect(order.slice(0, 3)).toEqual([EVOLVER, WORKER, HOME]);
    expect(order.at(-1)).toBe(AWAY);
    expect(order.at(-2)).toBe(LOUNGER);
    expect(order).toHaveLength(world.creatures.length);
  });

  it('keeps the fixed order and puts unknown creatures last', () => {
    const world = initialWorld();
    const ids = inOrder(world, [FREE]).map((c) => c.id);
    expect(ids[0]).toBe(FREE);
    expect(ids).toHaveLength(world.creatures.length);
  });
});

describe('stationVerdict', () => {
  const start = partyAtStep(1);
  const word = (station: Parameters<typeof stationVerdict>[0], id: string) => {
    const v = stationVerdict(station, id, start);
    return v.ok ? 'ok' : v.word;
  };

  it('lets the road take an explorer home with loot (to open the haul)', () => {
    expect(stationVerdict('road', HOME, start)).toEqual({ ok: true, does: 'open the haul' });
  });

  it('says why in one word', () => {
    expect(word('forge', AWAY)).toBe('Away');
    expect(word('road', WORKER)).toBe('Busy');
    expect(word('house', LOUNGER)).toBe('Here');
    expect(word('lectern', FREE)).toBeNull();
    expect(word('arena', FREE)).toBe('ok');
    expect(word('forge', WORKER)).toBe('ok'); // collect the craft
  });

  it('says Full when the trip slots are taken', () => {
    const full = { ...start, world: { ...start.world, slots: { total: 2, used: 2 } } };
    expect(stationVerdict('road', FREE, full)).toEqual({ ok: false, word: 'Full' });
  });

  it('says Done when the dungeon was run today, and Full for a full raid team', () => {
    const done = {
      ...start,
      world: { ...start.world, dungeon: { ...start.world.dungeon, canRun: false } },
    };
    expect(stationVerdict('cave', FREE, done)).toEqual({ ok: false, word: 'Done' });
    const raided = partyAtStep(6);
    expect(raidTeamIds(raided.world)).toHaveLength(RAID_TEAM_SIZE);
    expect(stationVerdict('arena', FREE, raided)).toEqual({ ok: false, word: 'Full' });
  });

  it('counts the places that can take a creature', () => {
    // Every station but the lectern, which takes no creature.
    expect(placesFor(FREE, start)).toBe(STATIONS.length - 1);
    expect(placesFor(AWAY, start)).toBe(0);
  });
});

describe('layout math', () => {
  it('picks the art scale by width', () => {
    expect(artScale(390)).toBe(2);
    expect(artScale(360)).toBe(2);
    expect(artScale(WIDE_PX)).toBe(3);
  });

  it('counts the camp columns', () => {
    expect(campColumns(10, 2)).toBe(5);
    expect(campColumns(11, 2)).toBe(6);
    expect(campColumns(0, 2)).toBe(1);
    expect(campColumns(3, 0)).toBe(3);
  });

  it('fits a whole-number scale', () => {
    expect(fitScale(64, 200, 2, 6)).toBe(3);
    expect(fitScale(64, 10, 2, 6)).toBe(2);
    expect(fitScale(10, 1000, 2, 6)).toBe(6);
  });

  it('draws an L-shaped trail along x, then y, on whole pixels', () => {
    expect(lPath({ x: 0, y: 0 }, { x: 6, y: 6 }, 3)).toEqual([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 3 },
      { x: 6, y: 6 },
    ]);
    expect(lPath({ x: 5, y: 5 }, { x: 5, y: -1 }, 3)).toEqual([
      { x: 5, y: 5 },
      { x: 5, y: 2 },
      { x: 5, y: -1 },
    ]);
    expect(trailDashes([{ x: 3, y: 0 }], { x: 0, y: 0 }, 3)).toHaveLength(2);
  });

  it('greys a colour to its lightness', () => {
    expect(greyOf('#000000')).toBe('#00000a');
    expect(greyOf('#ffffff')).toBe('#f9fbff');
    expect(greyOf('not a colour')).toBe('not a colour');
  });
});

describe('partyAtStep', () => {
  it('shows each step’s moment', () => {
    expect(partyAtStep(1).held).toBeNull();
    expect(partyAtStep(2).moment?.kind).toBe('haul');
    expect(partyAtStep(2).world.haul).not.toBeNull();
    expect(partyAtStep(3).open).toBe('road');
    expect(partyAtStep(4).moment?.kind).toBe('crafted');
    expect(raidTeamIds(partyAtStep(5).world)).toHaveLength(2);
    expect(partyAtStep(6).moment?.kind).toBe('evolve');
    expect(partyAtStep(7).ask).toBe('cave');
  });
});

describe('the actions', () => {
  it('picks up, puts down, and opens a station view when nothing is held', () => {
    const s = pick(partyAtStep(1), FREE);
    expect(s.held).toBe(FREE);
    expect(s.said).toMatch(/picked up/);
    expect(putDown(s).held).toBeNull();
    expect(pick(s, FREE).held).toBeNull();
    const view = tapStation(partyAtStep(1), 'arena');
    expect(view.open).toBe('arena');
    expect(closeView(view).open).toBeNull();
  });

  it('sends a trip: tap the creature, the road, a place, Go', () => {
    let s = tapStation(pick(partyAtStep(1), FREE), 'road');
    expect(s.open).toBe('road');
    s = { ...s, road: { destination: 'tidepools', length: 'short', supply: null } };
    s = goOnTrip(s);
    expect(creatureOf(s.world, FREE).away).toBe(true);
    expect(s.held).toBeNull();
  });

  it('collects a craft from the forge and starts a new one', () => {
    let s = tapStation(pick(partyAtStep(1), WORKER), 'forge');
    expect(s.moment?.kind).toBe('crafted');
    s = tapStation(pick(s, FREE), 'forge');
    s = startCraft({ ...s, forgeBase: 'kelp-cap' });
    expect(creatureOf(s.world, FREE).busy?.kind).toBe('job');
  });

  it('target first: an empty arena spot lights the camp until three are placed', () => {
    let s: PartyState = {
      ...partyAtStep(5),
      held: null,
      open: 'arena' as const,
      ask: 'arena' as const,
    };
    s = pick(s, TOUR.raidCreatureIds[2] ?? '');
    expect(raidTeamIds(s.world)).toHaveLength(3);
    expect(s.ask).toBeNull();
  });

  it('a refused tap says why and keeps the creature held', () => {
    const s = tapStation(pick(partyAtStep(1), AWAY), 'forge');
    expect(s.held).toBe(AWAY);
    expect(s.said).toBe('Forge: away.');
  });

  it('enters a Games event', () => {
    const s = partyAtStep(1);
    const event = s.world.games.next.lineup[0]?.id ?? '';
    const done = enterGames({ ...s, held: FREE, fair: { event, entries: {} } });
    expect(done.fair.entries[event]).toEqual([FREE]);
  });
});

describe('nextTimers', () => {
  it('lists the next timers soonest first', () => {
    const timers = nextTimers(worldAtStep(5), 3);
    expect(timers).toHaveLength(3);
    const at = timers.map((t) => t.at);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
});
