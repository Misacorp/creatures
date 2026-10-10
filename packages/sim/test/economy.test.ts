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
import { chooseTrainee, planExpeditions } from '../src/policy';
import { createPlayer } from '../src/state';

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
        let spentExpeditions = 0;
        let spentTraining = 0;
        for (const w of weeks) {
          expect(w.bait).toBeGreaterThanOrEqual(0);
          expect(w.baitEarned).toBeGreaterThan(0);
          expect(w.essence).toBeGreaterThanOrEqual(0);
          spentExpeditions += w.baitSpentExpeditions;
          spentTraining += w.baitSpentTraining;
        }
        expect(spentExpeditions).toBeGreaterThan(0);
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

  it('never overspends and accounts for every Bait spent', () => {
    for (const bait of [0, 9, 10, 29, 60, 150, 400, 5000]) {
      const p = player(bait);
      const rng = createSeededRng(`ci-${bait}`);
      checkIn(p, 1, rng);
      expect(p.bait).toBeGreaterThanOrEqual(0);
      expect(p.week.baitSpentExpeditions + p.week.baitSpentTraining).toBe(bait - p.bait);
      expect(p.expeditions.length).toBeLessThanOrEqual(3);
      const explorers = new Set(p.expeditions.map((e) => e.explorerId));
      expect(explorers.size).toBe(p.expeditions.length);
    }
  });

  it('keeps all 3 slots busy once the player can afford them, and does nothing with no Bait', () => {
    const rich = player(300);
    checkIn(rich, 1, createSeededRng('rich'));
    expect(rich.expeditions).toHaveLength(3);
    const broke = player(0);
    checkIn(broke, 1, createSeededRng('broke'));
    expect(broke.expeditions).toHaveLength(0);
    expect(broke.week.trainings).toBe(0);
  });

  it('claims expeditions, using the first-expedition zipmouse rule and fusing duplicates', () => {
    const p = player(0);
    p.expeditions.push({ explorerId: 'p01/splashet', duration: 'long', supplies: 'basic' });
    checkIn(p, 1, createSeededRng('claim'));
    expect(p.firstExpeditionDone).toBe(true);
    expect(p.creatures.some((c) => c.line === 'zipmouse')).toBe(true);
  });

  it('evolves a level-15 creature when there is enough Essence, keeping fusion count', () => {
    const p = player(0);
    const c = p.creatures[0];
    if (c === undefined) throw new Error('no creature');
    c.level = 15;
    c.fusionCount = 3;
    p.essence = 25;
    checkIn(p, 15, createSeededRng('evolve'));
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
    checkIn(p, 15, createSeededRng('noevolve'));
    expect(c.speciesId).toBe('splashet');
    expect(c.level).toBe(15);
  });
});

describe('policy pieces', () => {
  it('plans nothing when a slot share cannot buy the cheapest option', () => {
    expect(planExpeditions(19, 3, true)).toEqual([]);
    expect(planExpeditions(0, 3, false)).toEqual([]);
  });

  it('buys better supplies with more Bait per slot, within budget', () => {
    const small = planExpeditions(120, 1, true);
    expect(small).toHaveLength(1);
    expect(small[0]?.cost).toBeLessThanOrEqual(60);
    const big = planExpeditions(1000, 1, true);
    expect(big[0]?.supplies).toBe('great');
    expect(big[0]?.duration).toBe('long');
    const all = planExpeditions(100, 3, false);
    expect(all.reduce((s, o) => s + o.cost, 0)).toBeLessThanOrEqual(100);
  });

  it('trains the weakest of the 3 strongest trainable creatures', () => {
    const mk = (line: string, level: number) => ({
      id: `p/${line}`,
      line,
      speciesId: line,
      level,
      fusionCount: 0,
    });
    const creatures = [mk('coralynx', 6), mk('stormray', 4), mk('cindle', 5), mk('splashet', 1)];
    expect(chooseTrainee(creatures)?.line).toBe('stormray');
    // A creature at its stage-1 cap is skipped.
    expect(chooseTrainee([mk('cindle', 15), mk('splashet', 3)])?.line).toBe('splashet');
    expect(chooseTrainee([mk('cindle', 15)])).toBeNull();
  });

  it('uses the game training costs', () => {
    expect(trainingCost(1)).toBe(15);
    expect(RULES.expedition.durations.long.rolls).toBe(3);
    expect(speciesOf('splashet').evolvesTo?.essence).toBe(20);
  });
});
