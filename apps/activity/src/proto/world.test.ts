import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getProto, listProtos, registerProto } from './registry';
import { parseRoute, routeHash } from './route';
import { LAST_STEP, TOUR_STEPS, clampStep } from './tour';
import {
  RAID_TEAM_SIZE,
  TOUR,
  claimJob,
  claimTrip,
  creatureOf,
  elementOf,
  evolve,
  evolvers,
  freeCreatures,
  initialWorld,
  isFree,
  jobsReady,
  needs,
  placeRaid,
  raidTeamIds,
  sendTrip,
  startJob,
  tripsHome,
  tripsOut,
  worldAtStep,
} from './world';

describe('the sample world', () => {
  const world = initialWorld();

  it('is a coherent Saturday morning', () => {
    expect(world.creatures.length).toBeGreaterThanOrEqual(8);
    expect(world.creatures.length).toBeLessThanOrEqual(12);
    expect(new Set(world.creatures.map((c) => c.id)).size).toBe(world.creatures.length);
    expect(new Date(world.now).getUTCDay()).toBe(6);
    expect(tripsHome(world).map((t) => t.id)).toEqual([TOUR.claimTripId]);
    expect(tripsOut(world)).toHaveLength(1);
    expect(world.slots).toEqual({ total: 3, used: 2 });
    expect(jobsReady(world).map((j) => j.id)).toEqual([TOUR.claimJobId]);
    expect(world.jobSlots.used).toBeLessThan(world.jobSlots.total);
    expect(evolvers(world).map((c) => c.id)).toEqual([TOUR.evolveId]);
    expect(world.dungeon.canRun).toBe(true);
    expect(world.raid.party?.row.some((s) => s.creature?.mine === true)).toBe(false);
    expect(world.residents.length).toBeGreaterThan(2);
    expect(world.haul).toBeNull();
    expect(elementOf('cindle')).toBe('ember');
  });

  it('names what needs the player, in the order of the tour', () => {
    expect(needs(world).map((n) => n.kind)).toEqual([
      'trip-home',
      'job-ready',
      'raid',
      'dungeon',
      'evolve',
      'games',
    ]);
  });

  it('has the creatures the tour names, free where the tour needs them free', () => {
    for (const id of [TOUR.send.creatureId, TOUR.job.creatureId, ...TOUR.raidCreatureIds]) {
      expect(isFree(world, creatureOf(world, id))).toBe(true);
    }
    expect(isFree(world, creatureOf(world, 'sample-4'))).toBe(false);
    expect(freeCreatures(world).length).toBeGreaterThan(5);
  });
});

describe('claimTrip', () => {
  it('adds the loot, pays the rank gift and frees the explorer', () => {
    const before = initialWorld();
    const after = claimTrip(before, TOUR.claimTripId);
    expect(after.haul?.loot?.gear).toHaveLength(1);
    expect(after.items).toHaveLength(before.items.length + 1);
    expect(after.blueprints.length).toBeGreaterThan(before.blueprints.length - 1);
    expect(after.parts.scrap).toBeGreaterThan(before.parts.scrap);
    expect(after.balances.bait).toBeGreaterThan(before.balances.bait);
    expect(after.slots.used).toBe(before.slots.used - 1);
    expect(tripsHome(after)).toHaveLength(0);
    expect(isFree(after, creatureOf(after, 'sample-4'))).toBe(true);
    // Pure: the old world is untouched.
    expect(tripsHome(before)).toHaveLength(1);
    expect(before.haul).toBeNull();
  });

  it('refuses a trip that is still out', () => {
    expect(() => claimTrip(initialWorld(), 'proto-trip-out')).toThrow();
  });
});

describe('sendTrip', () => {
  it('sends a free creature, takes the supply and uses a slot', () => {
    const before = claimTrip(initialWorld(), TOUR.claimTripId);
    const after = sendTrip(before, TOUR.send);
    expect(after.slots.used).toBe(before.slots.used + 1);
    expect(after.supplies[TOUR.send.supply]).toBe((before.supplies[TOUR.send.supply] ?? 0) - 1);
    expect(creatureOf(after, TOUR.send.creatureId).away).toBe(true);
    expect(tripsOut(after).some((t) => t.creatureId === TOUR.send.creatureId)).toBe(true);
  });

  it('refuses a busy creature, a full slot list, a closed place and a missing supply', () => {
    const world = initialWorld();
    expect(() => sendTrip(world, { ...TOUR.send, creatureId: 'sample-1' })).toThrow();
    expect(() =>
      sendTrip(sendTrip(world, TOUR.send), { ...TOUR.send, creatureId: 'sample-7' }),
    ).toThrow();
    const free = claimTrip(world, TOUR.claimTripId);
    expect(() => sendTrip(free, { ...TOUR.send, destination: 'moonlit-reef' })).toThrow();
    expect(() => sendTrip(free, { ...TOUR.send, supply: 'lure-great' })).toThrow();
  });
});

describe('claimJob and startJob', () => {
  it('claims the craft into the bag and frees its worker', () => {
    const before = initialWorld();
    const after = claimJob(before, TOUR.claimJobId);
    expect(after.items).toHaveLength(before.items.length + 1);
    expect(after.jobSlots.used).toBe(0);
    expect(jobsReady(after)).toHaveLength(0);
    expect(isFree(after, creatureOf(after, 'sample-6'))).toBe(true);
    expect(() => claimJob(after, TOUR.claimJobId)).toThrow();
  });

  it('starts a three hour craft for scrap with a free creature', () => {
    const claimed = claimJob(initialWorld(), TOUR.claimJobId);
    const after = startJob(claimed, TOUR.job);
    const started = after.jobs[0];
    expect(started?.status).toBe('running');
    expect(started?.endsAt).toBe(after.now + 3 * 3_600_000);
    expect(after.parts.scrap).toBe(claimed.parts.scrap - 6);
    expect(creatureOf(after, TOUR.job.creatureId).busy?.kind).toBe('job');
    expect(() => startJob(after, TOUR.job)).toThrow();
    const full = startJob(after, { ...TOUR.job, creatureId: 'sample-7' });
    expect(() => startJob(full, { ...TOUR.job, creatureId: 'sample-8' })).toThrow();
    expect(() => startJob(claimed, { ...TOUR.job, baseId: 'no-such-base' })).toThrow();
  });
});

describe('placeRaid', () => {
  it('fills the board one creature at a time and reads ready at three', () => {
    let world = initialWorld();
    for (const id of TOUR.raidCreatureIds) world = placeRaid(world, id);
    expect(raidTeamIds(world)).toEqual([...TOUR.raidCreatureIds]);
    expect(world.raid.you.inRoster).toBe(true);
    expect(world.raid.party?.row.filter((s) => s.creature?.mine === true)).toHaveLength(3);
    expect(world.raid.party?.readiness).toBe('likely');
    expect(needs(world).some((n) => n.kind === 'raid')).toBe(false);
    for (const id of TOUR.raidCreatureIds) expect(isFree(world, creatureOf(world, id))).toBe(false);
  });

  it('refuses a busy creature, a fourth and the same one twice', () => {
    const one = placeRaid(initialWorld(), TOUR.raidCreatureIds[0] ?? '');
    expect(() => placeRaid(one, TOUR.raidCreatureIds[0] ?? '')).toThrow();
    expect(() => placeRaid(initialWorld(), 'sample-1')).toThrow();
    let full = initialWorld();
    for (const id of TOUR.raidCreatureIds) full = placeRaid(full, id);
    expect(RAID_TEAM_SIZE).toBe(3);
    expect(() => placeRaid(full, TOUR.send.creatureId)).toThrow();
  });
});

describe('evolve', () => {
  it('turns Cindle into its next form and pays the Essence', () => {
    const before = initialWorld();
    const after = evolve(before, TOUR.evolveId);
    const grown = creatureOf(after, TOUR.evolveId);
    expect(grown.species).toBe('pyrelynx');
    expect(grown.evolution).toBeUndefined();
    expect(after.balances.essence).toBe(before.balances.essence - 20);
    expect(evolvers(after)).toHaveLength(0);
    expect(() => evolve(after, TOUR.evolveId)).toThrow();
  });
});

describe('the tour', () => {
  it('has the steps of the brief, once each', () => {
    expect(TOUR_STEPS.map((s) => s.id)).toEqual([
      'arrive',
      'claim-trip',
      'send-trip',
      'workshop',
      'raid',
      'evolve',
      'peek',
    ]);
    expect(LAST_STEP).toBe(7);
  });

  it('is the same list the screenshot script uses', () => {
    const script = readFileSync('scripts/proto-shoot.mjs', 'utf8');
    const listed = [...script.matchAll(/^\s+\['([a-z-]+)', '([^']+)'\],$/gm)].map((m) => [
      m[1],
      m[2],
    ]);
    expect(listed).toEqual(TOUR_STEPS.map((s) => [s.id, s.title]));
  });

  it('builds every step as a deterministic world', () => {
    for (let step = 1; step <= LAST_STEP; step += 1) {
      expect(worldAtStep(step)).toEqual(worldAtStep(step));
    }
    expect(needs(worldAtStep(1))).toHaveLength(6);
    expect(tripsHome(worldAtStep(3))).toHaveLength(0);
    expect(worldAtStep(7).creatures.some((c) => c.species === 'pyrelynx')).toBe(true);
    expect(needs(worldAtStep(7)).map((n) => n.kind)).toEqual(['dungeon', 'games']);
  });

  it('clamps a step to the tour', () => {
    expect(clampStep(0)).toBe(1);
    expect(clampStep(99)).toBe(LAST_STEP);
    expect(clampStep(Number.NaN)).toBe(1);
    expect(clampStep(4)).toBe(4);
  });
});

describe('the route', () => {
  it('reads the chooser, a prototype and its step', () => {
    expect(parseRoute('')).toEqual({ proto: null, step: 1, bare: false });
    expect(parseRoute('#valley')).toEqual({ proto: 'valley', step: 1, bare: false });
    expect(parseRoute('#party?step=4&bare=1')).toEqual({ proto: 'party', step: 4, bare: true });
    expect(parseRoute('#party?step=abc').step).toBe(1);
    expect(parseRoute('#party?step=40').step).toBe(LAST_STEP);
    expect(parseRoute('#<script>').proto).toBeNull();
  });

  it('writes the hash it reads', () => {
    expect(routeHash({ proto: 'valley', step: 3, bare: false })).toBe('#valley?step=3');
    expect(routeHash({ proto: null, step: 1, bare: false })).toBe('');
    expect(parseRoute(routeHash({ proto: 'party', step: 5, bare: true }))).toEqual({
      proto: 'party',
      step: 5,
      bare: true,
    });
  });
});

describe('the registry', () => {
  it('keeps what a prototype registers, in order', () => {
    const render = () => null;
    registerProto({ id: 'one', title: 'One', steps: [], render });
    registerProto({ id: 'two', title: 'Two', steps: [], render });
    expect(getProto('two')?.title).toBe('Two');
    expect(getProto('none')).toBeUndefined();
    expect(listProtos().map((p) => p.id)).toEqual(['one', 'two']);
  });
});
