import { describe, expect, it } from 'vitest';
import {
  RULES,
  createSeededRng,
  dungeonContent,
  dungeonPayout,
  streakBonus,
} from '@creatures/game';
import { DEFAULT_MIX } from '../src/archetypes';
import { creaturePower, type OwnedCreature, type SimItem } from '../src/data';
import { buildRun, dayModifiers, playDungeonDay } from '../src/dungeon';
import { dungeonAnalysis } from '../src/dungeon-analysis';
import { runEconomy } from '../src/economy';
import { clonePlayer, createPlayer, type SimPlayer } from '../src/state';
import { TARGETS } from '../src/targets';
import { tinyRun } from './helpers';

function creature(player: string, line: string, level: number): OwnedCreature {
  return { id: `${player}/${line}`, line, speciesId: line, level, fusionCount: 0 };
}

/** A daily player with a payoff, a guard and a setter at one level. */
function player(level: number, id = 'p01'): SimPlayer {
  const p = createPlayer(id, 'P', 'daily', 1);
  p.joined = true;
  p.gear.joinDay = 0;
  p.creatures.push(
    creature(id, 'cindle', level),
    creature(id, 'sproutle', level),
    creature(id, 'splashet', level),
  );
  return p;
}

const DAY_SEED = 'dungeon-sim-test';

function play(p: SimPlayer, day: number, seed = DAY_SEED) {
  return playDungeonDay(
    p,
    day,
    dayModifiers(seed, day),
    `${seed}:${p.id}:${String(day)}`,
    createSeededRng(`${seed}:loot:${String(day)}`),
  );
}

describe('the dungeon in the simulator', () => {
  it('gives every player of the server the same three different modifiers on a day', () => {
    const a = dayModifiers('s', 4);
    expect(a).toHaveLength(RULES.dungeon.rooms);
    expect(new Set(a).size).toBe(RULES.dungeon.rooms);
    expect(dayModifiers('s', 4)).toEqual(a);
    expect(
      new Set([...Array(20).keys()].map((d) => dayModifiers('s', d).join())).size,
    ).toBeGreaterThan(5);
  });

  it('builds the run like the worker: a row of three, the rooms, the abilities and the gear folded in', () => {
    const p = player(12);
    const run = buildRun(p, 3, dayModifiers('s', 1), 'run-seed');
    expect(run.team.map((s) => s.role)).toEqual(['guard', 'setter', 'payoff']); // autoPlace: guard front, payoff back
    expect(run.team.every((s) => s.ownerId === 'p1')).toBe(true);
    expect(run.rooms.map((r) => r.foe.kind)).toEqual(['foe', 'foe', 'boss']);
    expect(run.rooms.map((r) => r.modifier.id)).toEqual(dayModifiers('s', 1));
    // Level 12 is above the ability unlock level: the basic ability and one per creature.
    expect(run.abilities.filter((a) => a.creatureId !== undefined)).toHaveLength(3);
    expect(run.abilities[0]?.key).toBe('p1:basic');
    // The rooms come from the seed: the same one gives the same rooms.
    expect(buildRun(p, 3, dayModifiers('s', 1), 'run-seed').rooms.map((r) => r.foe.id)).toEqual(
      run.rooms.map((r) => r.foe.id),
    );
    // A higher depth is stronger.
    const deeper = buildRun(p, 9, dayModifiers('s', 1), 'run-seed');
    expect(deeper.rooms.every((r, i) => r.hp > (run.rooms[i]?.hp ?? 0))).toBe(true);
    // Gear folds into the slots.
    const bare = run.team.find((s) => s.speciesId === 'cindle')?.stats?.atk ?? 0;
    const item: SimItem = {
      uid: 1,
      baseId: 'trail-charm',
      rarity: 'common',
      level: 2,
      rolls: { primary: 800, secondary: [] },
      enchantId: null,
      improves: 0,
    };
    (p.creatures[0] as OwnedCreature).item = item;
    const geared = buildRun(p, 3, dayModifiers('s', 1), 'run-seed').team.find(
      (s) => s.speciesId === 'cindle',
    )?.stats?.atk;
    expect(geared).toBeGreaterThan(bare);
  });

  it('does nothing for a player with fewer than three creatures', () => {
    const p = player(10);
    p.creatures.pop();
    expect(play(p, 1)).toEqual([]);
    expect(p.dungeon.runs).toBe(0);
    expect(p.bait).toBe(0);
  });

  it('pays a cleared run the way the worker does, moves the depth up and keeps the books', () => {
    const p = player(15);
    // A team at the level cap of its species: depth 1 is cleared.
    const [run] = play(p, 5);
    expect(run).toMatchObject({ depth: 1, cleared: true, roomsCleared: 3, day: 5 });
    expect(p.dungeon).toMatchObject({
      depth: 2,
      streak: 1,
      lastDay: 5,
      firstDay: 5,
      runs: 1,
      clears: 1,
    });
    const payout = dungeonPayout(1, 3);
    expect(p.bait).toBe(payout.bait);
    expect(p.essence).toBe(payout.essence);
    expect(p.week.dungeonRuns).toBe(1);
    expect(p.week.dungeonClears).toBe(1);
    expect(p.week.dungeonBait).toBe(payout.bait);
    expect(p.week.dungeonEssence).toBe(payout.essence);
    expect(p.gear.parts.scrap).toBeGreaterThanOrEqual(payout.scrap);
  });

  it('keeps the depth and pays only the cleared rooms after a loss', () => {
    const p = player(1);
    p.dungeon.depth = 50;
    p.dungeon.firstDay = 0; // not the first day: no retry
    const runs = play(p, 5);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ cleared: false, depth: 50 });
    expect(p.dungeon.depth).toBe(50);
    expect(p.dungeon.clears).toBe(0);
    expect(p.bait).toBe(dungeonPayout(50, runs[0]?.roomsCleared ?? 0).bait);
  });

  it('lets a first-ever lost run be tried once more on the same day, and no more', () => {
    const p = player(1);
    p.dungeon.depth = 50;
    const runs = play(p, 5);
    expect(runs).toHaveLength(2);
    expect(p.dungeon.runs).toBe(2);
    expect(p.dungeon.streak).toBe(1); // one day, counted once
    expect(p.dungeon.firstDay).toBe(5);
    // The next day there is one run only.
    expect(play(p, 6)).toHaveLength(1);
    expect(p.dungeon.streak).toBe(2);
    // And a first run that is cleared gets no retry.
    const q = player(15, 'p02');
    expect(play(q, 5)).toHaveLength(1);
  });

  it('counts days in a row, pays the streak bonus once and starts again after a gap', () => {
    const p = player(15);
    const bonus = streakBonus(3);
    let baitBefore = 0;
    for (let day = 0; day < 3; day++) {
      baitBefore = p.bait;
      play(p, day);
    }
    expect(p.dungeon.streak).toBe(3);
    const third = dungeonPayout(3, 3).bait + (bonus?.bait ?? 0);
    expect(p.bait - baitBefore).toBe(third);
    play(p, 6); // missed days 3 to 5
    expect(p.dungeon.streak).toBe(1);
    expect(p.dungeon.depth).toBeGreaterThan(3); // the depth is kept
  });

  it('is deterministic and does not touch a cloned player', () => {
    const a = player(14);
    const b = player(14);
    const snapshot = clonePlayer(a);
    expect(play(a, 2)).toEqual(play(b, 2));
    expect(a.dungeon).toEqual(b.dungeon);
    expect(snapshot.dungeon.runs).toBe(0);
    expect(creaturePower(a.creatures[0] as OwnedCreature)).toBe(
      creaturePower(b.creatures[0] as OwnedCreature),
    );
  });
});

describe('the dungeon in the economy', () => {
  const mix = { casual: 1, daily: 1, top: 0, newcomer: 0 } as const;
  const run = (dungeon: boolean) =>
    runEconomy({ seed: 'dungeon-economy', weeks: 4, mix, snapshotWeeks: [], dungeon });

  it('runs every day for dailies and on leet days for casuals, and not at all when switched off', () => {
    const on = run(true);
    const off = run(false);
    expect(off.players.every((p) => p.dungeon.length === 0)).toBe(true);
    const daily = on.players.find((p) => p.archetype === 'daily');
    const casual = on.players.find((p) => p.archetype === 'casual');
    expect(daily?.dungeon.length).toBeGreaterThan(20);
    expect(casual?.dungeon.length).toBeLessThan(daily?.dungeon.length ?? 0);
    // The records carry the depth and what the week paid.
    const last = daily?.weeks.at(-1);
    expect(last?.dungeonDepth).toBeGreaterThan(1);
    expect(daily?.weeks.reduce((n, w) => n + w.dungeonRuns, 0)).toBe(daily?.dungeon.length);
    // The same seed gives the same history.
    expect(JSON.stringify(run(true).players)).toBe(JSON.stringify(on.players));
  });

  it('adds what the dungeon pays to the economy', () => {
    const on = run(true);
    const off = run(false);
    const pay = (r: typeof on) =>
      r.players.flatMap((p) => p.weeks).reduce((n, w) => n + w.dungeonBait + w.dungeonEssence, 0);
    expect(pay(on)).toBeGreaterThan(0);
    expect(pay(off)).toBe(0);
  });

  it('plays the default server without errors and measures every dungeon target', () => {
    const sims = [
      runEconomy({ seed: 'dungeon-default', weeks: 9, mix: DEFAULT_MIX, snapshotWeeks: [] }),
    ];
    const without = [
      runEconomy({
        seed: 'dungeon-default',
        weeks: 9,
        mix: DEFAULT_MIX,
        snapshotWeeks: [],
        dungeon: false,
      }),
    ];
    const { metrics, stats } = dungeonAnalysis(sims, without, 9);
    for (const key of [
      'dungeon.firstWeekDepth1ClearRate',
      'dungeon.dailyDepthGrowthPerWeek',
      'dungeon.dailyEssenceShare',
      'dungeon.dailyGearShareWeek8',
    ]) {
      expect(metrics[key], key).not.toBeNull();
    }
    expect(stats.winRates.daily[0]?.runs).toBeGreaterThan(0);
    expect(stats.depthAfter.daily.length).toBe(9);
    expect(stats.flow.daily.runs).toBeGreaterThan(5);
    expect(stats.gearShareWeek8.without).not.toBeNull();
  });
});

describe('the dungeon targets', () => {
  it('has the three targets of the design and the gear share limit', () => {
    const byId = new Map(TARGETS.map((t) => [t.id, t]));
    expect(byId.get('dungeon-first-week-clear')).toMatchObject({ comparator: 'min', value: 0.8 });
    expect(byId.get('dungeon-depth-growth')).toMatchObject({ comparator: 'range', value: [1, 2] });
    expect(byId.get('dungeon-essence-share')).toMatchObject({ comparator: 'max', value: 0.4 });
    expect(byId.get('dungeon-gear-share-week8')).toMatchObject({ comparator: 'max', value: 0.2 });
  });

  it('are measured by a run, and the report has a dungeon section', () => {
    const out = tinyRun({ weeks: 9 });
    for (const id of [
      'dungeon-first-week-clear',
      'dungeon-depth-growth',
      'dungeon-essence-share',
      'dungeon-gear-share-week8',
    ]) {
      expect(out.evaluation.find((t) => t.id === id)?.status, id).not.toBe('not_measured');
    }
    expect(out.analysis.dungeon.winRates.casual).toHaveLength(24);
  });

  it('has foes and modifiers for the rooms the model plays', () => {
    expect(dungeonContent.foes.length).toBeGreaterThanOrEqual(RULES.dungeon.rooms);
  });
});
