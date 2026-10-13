import { describe, expect, it } from 'vitest';
import { createSeededRng, RULES, trainingCost } from '@creatures/game';
import {
  ARCHETYPES,
  DEFAULT_MIX,
  scaleMix,
  type ArchetypeId,
  type ArchetypeMix,
} from '../src/archetypes';
import { speciesOf } from '../src/data';
import { checkIn, runEconomy, type EconomyResult, type PlayerHistory } from '../src/economy';
import { chooseTrainee } from '../src/policy';
import { createPlayer } from '../src/state';
import { slotsOfPlayer, type TripContext } from '../src/trips';

function only(archetype: ArchetypeId, others: ArchetypeMix = DEFAULT_MIX): ArchetypeMix {
  return { ...others, [archetype]: Math.max(others[archetype], 1) };
}

function historyOf(result: EconomyResult, archetype: ArchetypeId): PlayerHistory[] {
  return result.players.filter((p) => p.archetype === archetype);
}

describe('archetype mix', () => {
  it('scales the default mix to any count and always sums to it', () => {
    expect(scaleMix(10)).toEqual(DEFAULT_MIX);
    for (const n of [1, 2, 3, 5, 7, 10, 15, 23]) {
      const mix = scaleMix(n);
      expect(ARCHETYPES.reduce((s, a) => s + mix[a], 0)).toBe(n);
    }
    expect(scaleMix(15)).toEqual({ casual: 5, daily: 6, top: 3, newcomer: 1 });
    expect(scaleMix(1)).toEqual({ casual: 0, daily: 1, top: 0, newcomer: 0 });
    expect(() => scaleMix(0)).toThrow();
  });
});

describe('archetype policies over 2 weeks', () => {
  const result = runEconomy({
    seed: 'policy',
    weeks: 5,
    mix: DEFAULT_MIX,
    snapshotWeeks: [],
  });

  for (const archetype of ARCHETYPES) {
    it(`${archetype}: no negative balances, expeditions run, training happens`, () => {
      const players = historyOf(result, archetype);
      expect(players.length).toBe(DEFAULT_MIX[archetype]);
      // Two weeks from when the player joined (the newcomer joins in week 4).
      for (const p of players) {
        const weeks = p.weeks.filter((w) => w.week >= p.joinWeek && w.week < p.joinWeek + 2);
        expect(weeks).toHaveLength(2);
        let spentTraining = 0;
        for (const w of weeks) {
          expect(w.bait).toBeGreaterThanOrEqual(0);
          expect(w.baitEarned).toBeGreaterThan(0);
          expect(w.essence).toBeGreaterThanOrEqual(0);
          spentTraining += w.baitSpentTraining;
        }
        // Trips are free: they run whatever the Bait, and supplies are the only expedition spending.
        expect(weeks[1]?.trips ?? 0).toBeGreaterThan(0);
        expect(spentTraining).toBeGreaterThan(0);
        // Expeditions brought new species or fusions beyond the starter.
        expect(weeks[1]?.speciesOwned ?? 0).toBeGreaterThan(1);
        expect(weeks[1]?.maxLevel ?? 0).toBeGreaterThan(1);
      }
    });
  }

  it('daily players leet on 6 days a week, casuals on 2, so dailies earn more Bait', () => {
    const avg = (a: ArchetypeId): number => {
      const ps = historyOf(result, a);
      return (
        ps.reduce((s, p) => s + (p.weeks.find((w) => w.week === 2)?.baitEarned ?? 0), 0) / ps.length
      );
    };
    expect(avg('top')).toBeGreaterThan(avg('daily'));
    expect(avg('daily')).toBeGreaterThan(avg('casual') * 2);
  });

  it('the newcomer has no history before week 4', () => {
    const [newcomer] = historyOf(result, 'newcomer');
    expect(newcomer?.weeks.map((w) => w.week)).toEqual([4, 5]);
  });

  it('every archetype keeps its balance non-negative in a long run too', () => {
    const long = runEconomy({ seed: 'long', weeks: 14, mix: only('newcomer'), snapshotWeeks: [] });
    for (const p of long.players) for (const w of p.weeks) expect(w.bait).toBeGreaterThanOrEqual(0);
  });
});

describe('check-in', () => {
  function player(bait: number) {
    const p = createPlayer('p01', 'P', 'daily', 1);
    p.joined = true;
    p.bait = bait;
    p.creatures.push(
      { id: 'p01/splashet', line: 'splashet', speciesId: 'splashet', level: 1, fusionCount: 0 },
      { id: 'p01/cindle', line: 'cindle', speciesId: 'cindle', level: 1, fusionCount: 0 },
      { id: 'p01/sproutle', line: 'sproutle', speciesId: 'sproutle', level: 1, fusionCount: 0 },
    );
    return p;
  }

  const tripCtx = (hour: number, seed: string): TripContext => ({
    hour,
    day: Math.floor(hour / 24),
    weekIndex: 0,
    catches: createSeededRng(`${seed}:catches`),
    trip: createSeededRng(`${seed}:trip`),
  });

  it('never overspends and accounts for every Bait spent', () => {
    for (const bait of [0, 9, 10, 29, 60, 150, 400, 5000]) {
      const p = player(bait);
      checkIn(p, 1, tripCtx(9, `ci-${String(bait)}`));
      expect(p.bait).toBeGreaterThanOrEqual(0);
      expect(p.week.baitSpentExpeditions + p.week.baitSpentTraining).toBe(bait - p.bait);
      expect(p.expeditions.length).toBeLessThanOrEqual(slotsOfPlayer(p));
      const explorers = new Set(p.expeditions.map((e) => e.explorerId));
      expect(explorers.size).toBe(p.expeditions.length);
    }
  });

  it('sends a trip into the one slot of a new player, with no Bait too (trips are free)', () => {
    const rich = player(300);
    checkIn(rich, 1, tripCtx(9, 'rich'));
    expect(rich.expeditions).toHaveLength(1);
    const broke = player(0);
    checkIn(broke, 1, tripCtx(9, 'broke'));
    expect(broke.expeditions).toHaveLength(1);
    expect(broke.week.trainings).toBe(0);
    expect(broke.week.baitSpentExpeditions).toBe(0);
  });

  it('claims trips, using the first-expedition zipmouse rule and fusing duplicates', () => {
    const p = player(0);
    p.expeditions.push({
      explorerId: 'p01/splashet',
      length: 'long',
      destination: 'old-crossroads',
      kit: [],
      rolls: 1,
      twist: null,
      startHour: 9,
      endsAtHour: 21,
    });
    checkIn(p, 1, tripCtx(9 + 24, 'claim'));
    expect(p.firstExpeditionDone).toBe(true);
    expect(p.creatures.some((c) => c.line === 'zipmouse')).toBe(true);
    expect(p.stats.trips_finished).toBe(1);
    expect(p.explorerXp['p01/splashet']).toBeGreaterThan(0);
  });

  it('evolves a level-15 creature when there is enough Essence, keeping fusion count', () => {
    const p = player(0);
    const c = p.creatures[0];
    if (c === undefined) throw new Error('no creature');
    c.level = 15;
    c.fusionCount = 3;
    p.essence = 25;
    checkIn(p, 15, tripCtx(9, 'evolve'));
    expect(c.speciesId).toBe('tidewing');
    expect(c.fusionCount).toBe(3);
    expect(p.essence).toBe(5);
    expect(p.week.evolutions).toBe(1);
  });

  it('does not evolve without Essence, and then does not train a capped creature', () => {
    const p = player(500);
    const c = p.creatures[0];
    if (c === undefined) throw new Error('no creature');
    c.level = 15;
    p.essence = 19;
    checkIn(p, 15, tripCtx(9, 'noevolve'));
    expect(c.speciesId).toBe('splashet');
    expect(c.level).toBe(15);
  });
});

describe('policy pieces', () => {
  it('pushes the furthest-along creature towards its evolution, else trains the weakest', () => {
    const mk = (line: string, level: number) => ({
      id: `p/${line}`,
      line,
      speciesId: line,
      level,
      fusionCount: 0,
    });
    // Coralynx has no evolution; Stormray and Cindle do. Of those, Cindle is further along.
    const creatures = [mk('coralynx', 6), mk('stormray', 4), mk('cindle', 5), mk('splashet', 1)];
    expect(chooseTrainee(creatures)?.line).toBe('cindle');
    // With no evolution to work towards, the weakest of the strongest three goes first.
    expect(chooseTrainee([mk('coralynx', 10), mk('gaiadrake', 4)])?.line).toBe('gaiadrake');
    // A creature at its stage-1 cap is skipped.
    expect(chooseTrainee([mk('cindle', 15), mk('splashet', 3)])?.line).toBe('splashet');
    expect(chooseTrainee([mk('cindle', 15)])).toBeNull();
  });

  it('uses the game training costs', () => {
    expect(trainingCost(1)).toBe(RULES.training.baseCost + RULES.training.perLevel);
    expect(RULES.expeditions.lengths.long.rolls).toBeGreaterThanOrEqual(1);
    expect(speciesOf('splashet').evolvesTo?.essence).toBe(20);
  });
});
