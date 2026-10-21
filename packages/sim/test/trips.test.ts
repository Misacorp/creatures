import { describe, expect, it } from 'vitest';
import {
  EXPEDITION_LENGTHS,
  RULES,
  createSeededRng,
  expeditionContent,
  explorerRank,
  lengthRules,
  seasonOf,
} from '@creatures/game';
import { DEFAULT_MIX } from '../src/archetypes';
import { runEconomy } from '../src/economy';
import { createPlayer, type SimPlayer } from '../src/state';
import {
  chooseDestination,
  chooseKit,
  chooseLength,
  claimTrips,
  playerRankSum,
  sendTrips,
  slotsOfPlayer,
  type TripContext,
} from '../src/trips';

function place(id: string) {
  const d = expeditionContent.destinations.find((x) => x.id === id);
  if (d === undefined) throw new Error(`no destination ${id}`);
  return d;
}

const CREATURES = ['splashet', 'cindle', 'sproutle', 'zipmouse', 'stormray'];

function player(archetype: 'daily' | 'casual' = 'daily'): SimPlayer {
  const p = createPlayer('p01', 'P', archetype, 1);
  p.joined = true;
  for (const line of CREATURES) {
    p.creatures.push({ id: `p01/${line}`, line, speciesId: line, level: 10, fusionCount: 0 });
  }
  return p;
}

function ctx(hour: number, seed = 'trips', weekIndex = 0): TripContext {
  return {
    hour,
    day: Math.floor(hour / 24),
    weekIndex,
    catches: createSeededRng(`${seed}:catches`),
    talents: createSeededRng(`${seed}:talents`),
    trip: createSeededRng(`${seed}:trip`),
  };
}

/** Gives every creature the XP of a rank. */
function rankAll(p: SimPlayer, rank: number): void {
  const xp = RULES.expeditions.rank.xpForRank[rank - 1] as number;
  for (const c of p.creatures) p.explorerXp[c.id] = xp;
}

describe('expedition slots', () => {
  it('starts with one, opens the second after the finished trips the rules name, then by rank sum', () => {
    const p = player();
    expect(slotsOfPlayer(p)).toBe(1);
    p.stats.trips_finished = RULES.expeditions.slots.secondAfterTrips;
    expect(slotsOfPlayer(p)).toBe(2);
    rankAll(p, 10);
    expect(playerRankSum(p)).toBe(CREATURES.length * 9);
    expect(slotsOfPlayer(p)).toBeGreaterThanOrEqual(2);
  });
});

describe('choosing a trip', () => {
  it('only picks places that are open to the creature (rank, night, Festival)', () => {
    const p = player();
    const creature = p.creatures[0];
    if (creature === undefined) throw new Error('no creature');
    // Weeks of the calendar that are not a Festival, at noon: no Festival Grounds, no night, no rank gates.
    const plain = [0, 1, 2, 3].filter((w) => !seasonOf(w).festival);
    for (let i = 0; i < 80; i++) {
      const dest = chooseDestination(p, creature, {
        hour: 12,
        weekIndex: plain[i % plain.length] as number,
        trip: createSeededRng(`dest-${String(i)}`),
      });
      expect(dest.access.festival, dest.id).not.toBe(true);
      expect(dest.access.night, dest.id).not.toBe(true);
      expect(dest.access.minRank, dest.id).toBeLessThanOrEqual(1);
    }
  });

  it('can pick the night place at night, and the Festival Grounds in a Festival week, with the rank', () => {
    const p = player();
    rankAll(p, 5);
    const creature = p.creatures[0];
    if (creature === undefined) throw new Error('no creature');
    const festivalWeek = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].find((w) => seasonOf(w).festival);
    if (festivalWeek === undefined) throw new Error('no Festival week');
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const night = chooseDestination(p, creature, {
        hour: 22,
        weekIndex: festivalWeek,
        trip: createSeededRng(`night-${String(i)}`),
      });
      seen.add(night.id);
    }
    expect(seen.has('moonlit-reef')).toBe(true);
    expect(seen.has('festival-grounds')).toBe(true);
  });

  it('takes the longest length a casual may, and a 24 hour trip only from the rank that opens it', () => {
    const casual = player('casual');
    expect(chooseLength(casual, 1, 9)).toBe('long');
    const daily = player();
    for (const length of EXPEDITION_LENGTHS) {
      if (length === 'day') continue;
      expect(lengthRules(length).minRank).toBeLessThanOrEqual(1);
    }
    expect(chooseLength(daily, 1, 9)).not.toBe('day');
    expect(chooseLength(casual, lengthRules('day').minRank, 9)).toBe('day');
  });
});

describe('supplies', () => {
  it('carries nothing without stock: supplies cannot be bought', () => {
    const p = player();
    const dest = place('tidepools');
    expect(chooseKit(p, { length: 'long', dest, stars: 0 })).toEqual([]);
    expect(p.bait).toBeGreaterThanOrEqual(0);
  });

  it('never carries more than the limit or two of a kind, and only what is in stock', () => {
    const p = player();
    for (const def of expeditionContent.supplies) p.supplies[def.id] = 1;
    const dest = place('tidepools');
    const kit = chooseKit(p, { length: 'long', dest, stars: 0 });
    expect(kit.length).toBeGreaterThan(0);
    expect(kit.length).toBeLessThanOrEqual(RULES.expeditions.maxSupplies);
    const kinds = kit.map((id) => expeditionContent.supplies.find((s) => s.id === id)?.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    // Supplies that are not in stock are never carried.
    const few = player();
    few.supplies['lure-great'] = 1;
    const only = chooseKit(few, { length: 'long', dest: place('storm-ridge'), stars: 0 });
    expect(only).toEqual(['lure-great']);
  });

  it('uses supplies from stock and takes them out of it', () => {
    const p = player();
    p.supplies['lure-great'] = 1;
    p.stats.trips_finished = 0;
    sendTrips(p, ctx(9), (idle) => idle);
    const kit = p.expeditions[0]?.kit ?? [];
    for (const id of kit) expect(p.supplies[id], id).toBe(0);
    expect(p.stats.supplies_used).toBe(kit.length);
  });
});

describe('sending and claiming trips', () => {
  it('fills only the free slots, with different explorers, and costs no Bait', () => {
    const p = player();
    p.stats.trips_finished = RULES.expeditions.slots.secondAfterTrips;
    const bait = p.bait;
    sendTrips(p, ctx(9), (idle) => idle);
    expect(p.expeditions).toHaveLength(2);
    expect(new Set(p.expeditions.map((e) => e.explorerId)).size).toBe(2);
    expect(p.bait).toBe(bait);
    // Nothing is free now.
    sendTrips(p, ctx(9), (idle) => idle);
    expect(p.expeditions).toHaveLength(2);
  });

  it('keeps a trip until it ends, then pays catches, XP and familiarity once', () => {
    const p = player();
    sendTrips(p, ctx(9), (idle) => idle);
    const trip = p.expeditions[0];
    if (trip === undefined) throw new Error('no trip');
    const explorer = trip.explorerId;
    claimTrips(p, ctx(trip.endsAtHour - 1));
    expect(p.expeditions).toHaveLength(1);
    expect(p.stats.trips_finished).toBe(0);
    // Claimed at the end (a pushed-on goal may keep it out a little longer: claim far later).
    claimTrips(p, ctx(trip.endsAtHour + 100));
    expect(p.expeditions).toHaveLength(0);
    expect(p.stats.trips_finished + p.stats.trips_failed).toBe(1);
    if (p.stats.trips_finished === 1) {
      expect(p.explorerXp[explorer] ?? 0).toBeGreaterThan(0);
      expect(Object.keys(p.familiarity).length).toBeGreaterThan(0);
    }
    claimTrips(p, ctx(trip.endsAtHour + 200));
    expect(p.stats.trips_finished + p.stats.trips_failed).toBe(1);
  });
});

describe('creature experience from trips', () => {
  /** A trip of `length` that ended long ago, claimed now, with the first-expedition rule out of the way. */
  function claimed(length: 'short' | 'medium' | 'long' | 'day', treat: boolean): SimPlayer {
    const p = player();
    p.firstExpeditionDone = true;
    p.expeditions.push({
      explorerId: 'p01/splashet',
      length,
      destination: 'tidepools',
      kit: [],
      rolls: 1,
      twist: null,
      startHour: 0,
      endsAtHour: 5,
      ...(treat ? { treat: true } : {}),
    });
    // Far past the end, so a pushed-on goal (if one is offered) has run its time too.
    claimTrips(p, ctx(1_000, `exp-${length}-${String(treat)}`));
    return p;
  }

  it('pays the explorer by the length of a finished trip, and a treat doubles it', () => {
    for (const length of EXPEDITION_LENGTHS) {
      const plain = claimed(length, false);
      const treated = claimed(length, true);
      // A risky goal that fails brings nothing home (and so no experience): skip those runs.
      if (plain.stats.trips_finished === 1) {
        expect(plain.stats.exp_trip, length).toBe(RULES.experience.trip[length]);
      }
      if (treated.stats.trips_finished === 1) {
        expect(treated.stats.exp_trip, length).toBe(2 * RULES.experience.trip[length]);
      }
    }
  });

  it('keeps the experience of a trip that is not done yet out of the explorer', () => {
    const p = player();
    p.expeditions.push({
      explorerId: 'p01/splashet',
      length: 'long',
      destination: 'tidepools',
      kit: [],
      rolls: 1,
      twist: null,
      startHour: 0,
      endsAtHour: 12,
    });
    claimTrips(p, ctx(6));
    expect(p.stats.exp_trip).toBe(0);
    expect(p.creatures.find((c) => c.id === 'p01/splashet')?.exp ?? 0).toBe(0);
  });

  it('pays a finished trip by its ticks: XP follows them, and there is no pity', () => {
    const p = player();
    p.firstExpeditionDone = true;
    p.expeditions.push({
      explorerId: 'p01/splashet',
      length: 'short',
      destination: 'tidepools',
      kit: [],
      rolls: 2,
      twist: null,
      startHour: 0,
      endsAtHour: 2,
    });
    claimTrips(p, ctx(1_000, 'ticks'));
    expect(p.stats.trips_finished).toBe(1);
    expect(p.explorerXp['p01/splashet']).toBe(2 * RULES.expeditions.tick.xp);
    expect(p.stats.catch_rolls).toBe(2);
  });
});

describe('trips in the economy', () => {
  const run = (seed: string) => runEconomy({ seed, weeks: 6, mix: DEFAULT_MIX, snapshotWeeks: [] });

  it('is deterministic for a seed', () => {
    const a = run('trips-det');
    const b = run('trips-det');
    const summary = (r: ReturnType<typeof run>) =>
      r.players.map((p) => [p.id, p.weeks.map((w) => [w.rankSum, w.slots, w.trips])]);
    expect(summary(a)).toEqual(summary(b));
  });

  it('opens the second slot on the first day for a daily player and keeps rank sums growing', () => {
    const result = run('trips-slots');
    const dailies = result.players.filter((p) => p.archetype === 'daily');
    expect(dailies.length).toBeGreaterThan(0);
    for (const p of dailies) {
      const day = p.slotDays[0];
      expect(day === null ? 99 : day).toBeLessThanOrEqual(2);
      const sums = p.weeks.map((w) => w.rankSum);
      for (let i = 1; i < sums.length; i++) {
        expect(sums[i] as number).toBeGreaterThanOrEqual(sums[i - 1] as number);
      }
      // Ranks never exceed the table.
      expect(explorerRank(1e9)).toBe(RULES.expeditions.rank.xpForRank.length);
    }
  });
});
