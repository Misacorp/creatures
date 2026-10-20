import { describe, expect, it } from 'vitest';
import {
  RULES,
  content,
  createSeededRng,
  dungeonContent,
  dungeonEvent,
  dungeonKeepsake,
  dungeonMapValid,
  isLandmark,
  itemOf,
  dungeonScrapPerRoom,
  keptOnDefeat,
  nodeLoot,
  streakBonus,
  undercroftOpen,
  type DungeonMap,
  type MapNode,
  type NodeKind,
  type WeatherDay,
  strongAgainst,
  strongOver,
} from '@creatures/game';
import { dungeonBossEnrage } from '@creatures/engine';
import { DEFAULT_MIX } from '../src/archetypes';
import { creaturePower, type OwnedCreature, type SimItem } from '../src/data';
import {
  POLICY,
  buildRunInput,
  chooseCamp,
  chooseOption,
  dayMap,
  elementAdvantage,
  elementBeats,
  keepsakeScore,
  optionKind,
  pickRoute,
  playDungeonDay,
  roomLoot,
  routeScore,
  walkMap,
  wantsDescend,
  wantsHome,
  type DungeonLogEntry,
  type DungeonTeam,
  type RunView,
} from '../src/dungeon';
import { dungeonAnalysis } from '../src/dungeon-analysis';
import type { DungeonSkill } from '../src/profiles';
import { runEconomy } from '../src/economy';
import { clonePlayer, createPlayer, type SimPlayer } from '../src/state';
import { TARGETS } from '../src/targets';
import { applyOverrides } from '../src/tune';

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
    dayMap(seed, day),
    `${seed}:${p.id}:${String(day)}`,
    createSeededRng(`${seed}:loot:${String(day)}`),
  );
}

const healthy: RunView = { avgHp: 1, down: 0 };

/** A map node for the policy's unit tests (the policy reads its kind, its foe and its exits). */
function node(id: string, kind: NodeKind, next: string[] = [], foe = false): MapNode {
  const floor = Number(/^f(\d+)/.exec(id)?.[1] ?? 0);
  const foeId = dungeonContent.foes.find((f) => f.kind === 'foe')?.id;
  return {
    id,
    floor,
    lane: Number(/l(\d+)$/.exec(id)?.[1] ?? 0),
    kind,
    next,
    ...(foe || kind === 'fight' || kind === 'elite'
      ? { foeId: foeId as string, modifierId: 'x' }
      : {}),
  };
}

/** The first run of a fresh daily player (the first day: no streak bonus) that `wanted` accepts, scanning seeds. */
function findRun(
  wanted: (e: DungeonLogEntry) => boolean,
  make: () => SimPlayer,
  options: { tries?: number; wary?: boolean; skill?: 'good' | 'best' | 'random' } = {},
): { entry: DungeonLogEntry; p: SimPlayer; before: { bait: number; essence: number } } {
  for (let day = 0; day < (options.tries ?? 80); day++) {
    const p = make();
    p.dungeon.firstDay = day - 1; // not the first day ever: no retry, one run
    if (options.wary === true) p.dungeon.lostAt = p.dungeon.depth;
    const before = { bait: p.bait, essence: p.essence };
    const [entry] = playDungeonDay(
      p,
      day,
      dayMap('find', day),
      `find:${String(day)}`,
      createSeededRng(`find-loot:${String(day)}`),
      {},
      undefined,
      null,
      options.skill ?? 'good',
    );
    if (entry !== undefined && wanted(entry)) return { entry, p, before };
  }
  throw new Error('no run of that kind in the scan');
}

describe('the day map in the simulator', () => {
  it('is one valid map per server and day, the same for every player, and another on another day', () => {
    const a = dayMap('s', 4);
    expect(dungeonMapValid(a)).toBe(true);
    expect(dayMap('s', 4)).toBe(a);
    expect(dayMap('s', 4)).toEqual(dayMap('s', 4));
    expect(new Set([...Array(12).keys()].map((d) => JSON.stringify(dayMap('s', d)))).size).toBe(12);
    expect(JSON.stringify(dayMap('other', 4))).not.toBe(JSON.stringify(a));
  });
});

describe('the run input in the simulator', () => {
  it("puts the day's Kind Rain, Morning Haze and Bramble Season into the run input, and nothing on a plain day", () => {
    const p = player(12);
    const day = (boon: string, omen: string | null) => ({
      day: '2027-01-13',
      boon,
      omen,
      wild: false,
      boonBp: 12_500,
      omenBp: 15_000,
    });
    const build = (weather: ReturnType<typeof day> | null) =>
      buildRunInput(p, 3, {}, undefined, weather);
    const plain = build(null);
    for (const key of ['rainHealBp', 'hazeLeft', 'brambleBp', 'lingerAllRounds'])
      expect(plain).not.toHaveProperty(key);
    expect(build(day('kind-rain', null)).rainHealBp).toBe(250);
    // Lantern Light lengthens every ability once, from the run, not from a creature's sheet.
    const lantern = build(day('lantern-light', null));
    expect(lantern.lingerAllRounds).toBe(1);
    expect(lantern.team.every((s) => s.mods?.lingerRounds === undefined)).toBe(true);
    expect(build(day('market-day', 'morning-haze')).hazeLeft).toBe(true);
    expect(build(day('market-day', 'bramble-season')).brambleBp).toBe(1_800);
  });

  it('builds the run like the worker: a row of three, the abilities and the gear folded in', () => {
    const p = player(12);
    const run = buildRunInput(p, 3);
    // One row. The starters (Splashet the Tide Setter, Sproutle the Guard, Cindle the Ember Payoff) stand
    // Cindle, Sproutle, Splashet: Cindle marks Scorched and Splashet sets off Steam every round. The role
    // order (setter, Guard, payoff) would never react.
    expect(run.team.map((s) => s.role)).toEqual(['payoff', 'guard', 'setter']);
    expect(run.team.every((s) => s.ownerId === 'p1')).toBe(true);
    // The rooms are played one at a time, each with its own spec.
    expect(run.rooms).toEqual([]);
    // Level 12 is above the ability unlock level: one ability per creature, no basic ability, and
    // none of them has a chosen round (each fires at its default round).
    expect(run.abilities.filter((a) => a.creatureId !== undefined)).toHaveLength(3);
    expect(run.abilities).toHaveLength(3);
    expect(run.abilities.some((a) => a.key === 'p1:basic')).toBe(false);
    expect(run.abilities.every((a) => a.fireAtRound === undefined)).toBe(true);
    // The depth and the boss-room enrage are part of the run input.
    expect(run.depth).toBe(3);
    expect(run.enrage).toEqual(dungeonBossEnrage());
    // A team stood as given keeps its order.
    const asGiven: DungeonTeam = { creatures: [...p.creatures].reverse(), ordered: false };
    expect(buildRunInput(p, 3, {}, asGiven).team.map((s) => s.speciesId)).toEqual([
      'splashet',
      'sproutle',
      'cindle',
    ]);
    // Gear folds into the slots.
    const bare = run.team.find((s) => s.speciesId === 'cindle')?.stats?.atk ?? 0;
    const item: SimItem = {
      ...itemOf('trail-cap', 'common', 2, [{ id: 'attack', tier: 1 }]),
      uid: 1,
    };
    (p.creatures[0] as OwnedCreature).items = { hat: item };
    const geared = buildRunInput(p, 3).team.find((s) => s.speciesId === 'cindle')?.stats?.atk;
    expect(geared).toBeGreaterThan(bare);
  });

  it('carries the Scarf line "Between-room rest" into the run as the worker does, and nothing without it', () => {
    const p = player(12);
    expect(buildRunInput(p, 3).rest).toBeUndefined();
    const scarf: SimItem = {
      ...itemOf('patch-scarf', 'common', 8, [{ id: 'between-room-rest', tier: 2 }]),
      uid: 2,
    };
    const worn = p.creatures[1] as OwnedCreature;
    worn.items = { scarf };
    // Tier III of the line is 4% of max HP, keyed by the creature's id; nobody else rests.
    expect(buildRunInput(p, 3).rest).toEqual({ [worn.id]: 400 });
  });
});

describe('the policy', () => {
  it('knows which elements beat which, from content', () => {
    for (const p of content.elementChart) {
      expect(elementBeats(p.attacker, p.defender)).toBe(p.bp === 15_000);
    }
    const [first] = content.elements;
    if (first === undefined) throw new Error('no elements');
    const [beaten] = strongAgainst(content.elementChart, first.id);
    if (beaten === undefined) throw new Error('nothing beaten');
    expect(elementAdvantage([first.id, first.id, first.id], beaten)).toBe(1);
    expect(elementAdvantage([beaten, beaten], first.id)).toBe(-1);
    expect(elementAdvantage([], first.id)).toBe(0);
  });

  it('prefers the foe the row beats, takes an elite only when healthy and a mystery or cache when hurt', () => {
    const fight = node('f1l0', 'fight');
    const foe = dungeonContent.foes.find((f) => f.kind === 'foe');
    if (foe === undefined) throw new Error('no foe');
    const [strong] = strongOver(content.elementChart, foe.element);
    const [weak] = strongAgainst(content.elementChart, foe.element);
    if (strong === undefined || weak === undefined) throw new Error('no wheel');
    const beats = routeScore(fight, foe.element, [strong, strong, strong], healthy);
    const beaten = routeScore(fight, foe.element, [weak], healthy);
    expect(beats).toBeGreaterThan(routeScore(fight, foe.element, [], healthy));
    expect(beaten).toBeLessThan(routeScore(fight, foe.element, [], healthy));

    const elite = node('f2l0', 'elite');
    expect(routeScore(elite, foe.element, [], { avgHp: 0.9, down: 0 })).toBeGreaterThan(
      routeScore(fight, foe.element, [], healthy),
    );
    // At or below 70%, or with somebody down, the elite is the last choice.
    for (const view of [
      { avgHp: POLICY.eliteHp, down: 0 },
      { avgHp: 0.95, down: 1 },
    ]) {
      expect(routeScore(elite, foe.element, [], view)).toBeLessThan(
        routeScore(fight, foe.element, [], view),
      );
    }
    // Hurt (under 50%): a mystery room or a cache beats a fight; healthy, a fight beats a mystery room.
    const hurt = { avgHp: 0.4, down: 0 };
    for (const kind of ['mystery', 'cache'] as const) {
      const room = node('f2l1', kind);
      expect(routeScore(room, undefined, [], hurt)).toBeGreaterThan(
        routeScore(fight, foe.element, [], hurt),
      );
    }
    expect(routeScore(node('f2l1', 'mystery'), undefined, [], healthy)).toBeLessThan(
      routeScore(fight, foe.element, [], healthy),
    );
  });

  it('picks the route by score, at random for a random player and a floor ahead for the best', () => {
    // Two fights: A leads to a plain fight, B to an elite. They score the same now; only the player who
    // looks ahead (best) prefers B while healthy.
    const map: DungeonMap = {
      floors: 7,
      nodes: [
        node('f0l0', 'fight', ['f1l0', 'f1l1']),
        node('f1l0', 'fight', ['f2l0']),
        node('f1l1', 'fight', ['f2l1']),
        node('f2l0', 'fight'),
        node('f2l1', 'elite'),
      ],
    };
    const rng = createSeededRng('route');
    const row: never[] = [];
    expect(pickRoute(map, 1, ['f1l0', 'f1l1'], healthy, row, 'good', rng)).toBe('f1l0');
    expect(pickRoute(map, 1, ['f1l0', 'f1l1'], healthy, row, 'best', rng)).toBe('f1l1');
    // An elite the player will not enter is not worth a look ahead when they are hurt.
    expect(pickRoute(map, 1, ['f1l0', 'f1l1'], { avgHp: 0.6, down: 1 }, row, 'best', rng)).toBe(
      'f1l0',
    );
    // A random player draws from the stream: the same stream, the same picks, and both rooms come up.
    const picks = (seed: string): string[] => {
      const r = createSeededRng(seed);
      return Array.from({ length: 40 }, () =>
        pickRoute(map, 1, ['f1l0', 'f1l1'], healthy, row, 'random', r),
      );
    };
    expect(picks('r')).toEqual(picks('r'));
    expect(new Set(picks('r'))).toEqual(new Set(['f1l0', 'f1l1']));
  });

  it('takes an event option by health: the costly or gamble one only above 60%, a plain heal when hurt', () => {
    const stones = dungeonEvent('loose-stones'); // Dig (a gamble that can hurt) or Walk on (1 Bait)
    const pool = dungeonEvent('glowing-pool'); // Drink (heal) or Fill a flask (1 Bait)
    const well = dungeonEvent('echoing-well'); // Call down (heal) or Drop in a coin (gamble for a keepsake)
    if (stones === undefined || pool === undefined || well === undefined) {
      throw new Error('no events');
    }
    expect(stones.options.map(optionKind)).toEqual(['risky', 'free']);
    expect(pool.options.map(optionKind)).toEqual(['heal', 'free']);
    expect(well.options.map(optionKind)).toEqual(['heal', 'risky']);
    const at = (avgHp: number): RunView => ({ avgHp, down: 0 });
    expect(chooseOption(stones, at(0.9))).toBe(0);
    expect(chooseOption(stones, at(POLICY.riskyEventHp))).toBe(1);
    expect(chooseOption(stones, at(0.3))).toBe(1);
    expect(chooseOption(pool, at(0.5))).toBe(0);
    expect(chooseOption(pool, at(0.95))).toBe(1);
    expect(chooseOption(well, at(0.5))).toBe(0);
    expect(chooseOption(well, at(0.95))).toBe(1);
    // Whatever it picks is an option of the event, for every event and every health.
    for (const id of [
      'old-shrine',
      'lost-satchel',
      'sleeping-beetle',
      'mossy-bridge',
      'mushroom-ring',
    ]) {
      const event = dungeonEvent(id);
      if (event === undefined) throw new Error(id);
      for (const hp of [0.1, 0.65, 1]) {
        expect([0, 1]).toContain(chooseOption(event, at(hp)));
      }
    }
  });

  it('decides the camp: swap for a fallen creature, rest when hurt, else a keepsake, and home when worn out', () => {
    const rng = createSeededRng('camp');
    const open = { swap: false, keepsake: true };
    expect(chooseCamp({ avgHp: 0.9, down: 1 }, { swap: true, keepsake: true }, 'good', rng)).toBe(
      'swap',
    );
    expect(chooseCamp({ avgHp: 0.59, down: 0 }, open, 'good', rng)).toBe('rest');
    expect(chooseCamp({ avgHp: POLICY.restHp, down: 0 }, open, 'good', rng)).toBe('keepsake');
    expect(chooseCamp(healthy, { swap: false, keepsake: false }, 'good', rng)).toBe('rest');
    // A random player picks among what is open, home included; the same stream gives the same picks.
    const picks = (seed: string) => {
      const r = createSeededRng(seed);
      return Array.from({ length: 60 }, () => chooseCamp(healthy, open, 'random', r));
    };
    expect(picks('c')).toEqual(picks('c'));
    expect(new Set(picks('c'))).toEqual(new Set(['rest', 'keepsake', 'home']));
    // Home: two down, or under 35% (after the choice); a wary player goes with any down or under 75%.
    expect(wantsHome({ avgHp: 0.6, down: 2 }, false)).toBe(true);
    expect(wantsHome({ avgHp: 0.34, down: 0 }, false)).toBe(true);
    expect(wantsHome({ avgHp: 0.6, down: 1 }, false)).toBe(false);
    expect(wantsHome({ avgHp: 0.9, down: 0 }, false)).toBe(false);
    expect(wantsHome({ avgHp: 0.9, down: 1 }, true)).toBe(true);
    expect(wantsHome({ avgHp: 0.7, down: 0 }, true)).toBe(true);
    expect(wantsHome({ avgHp: 0.8, down: 0 }, true)).toBe(false);
  });

  it('scores keepsakes: a flat boost beats a cut, and an element keepsake is worth nothing without it', () => {
    const charm = dungeonKeepsake('wayfarer-charm');
    const moth = dungeonKeepsake('lantern-moth');
    const ember = dungeonKeepsake('warm-ember');
    if (charm === undefined || moth === undefined || ember === undefined) {
      throw new Error('no keepsakes');
    }
    const row = ['tide', 'grove', 'tide'] as const;
    expect(keepsakeScore(charm, row)).toBeGreaterThan(keepsakeScore(moth, row));
    expect(keepsakeScore(ember, row)).toBe(0);
    expect(keepsakeScore(ember, ['ember', 'ember', 'tide'])).toBeGreaterThan(0);
  });
});

describe('a run on the map', () => {
  const strongTeam = (): { p: SimPlayer; team: DungeonTeam } => {
    const p = player(15);
    return { p, team: { creatures: p.creatures, ordered: true } };
  };

  it('is deterministic and does not touch a cloned player', () => {
    const { p, team } = strongTeam();
    const snapshot = clonePlayer(p);
    const walk = () =>
      walkMap({
        player: p,
        map: dayMap('walk', 1),
        depth: 3,
        seed: 'walk-seed',
        team,
        skill: 'good',
      });
    expect(walk()).toEqual(walk());
    expect(snapshot.dungeon).toEqual(p.dungeon);
    // Another seed changes the dice.
    expect(
      JSON.stringify(
        walkMap({
          player: p,
          map: dayMap('walk', 1),
          depth: 3,
          seed: 'other',
          team,
          skill: 'good',
        }),
      ),
    ).not.toBe(JSON.stringify(walk()));
  });

  it('clears depth 1 with a strong team: every fight cleared, the whole row stood for them', () => {
    const { p, team } = strongTeam();
    const run = walkMap({
      player: p,
      map: dayMap('walk', 2),
      depth: 1,
      seed: 'clear',
      team,
      skill: 'good',
    });
    expect(run.outcome).toBe('cleared');
    expect(run.fights).toBe(run.fightsCleared);
    expect(run.fights).toBeGreaterThanOrEqual(3);
    expect(run.fights).toBeLessThanOrEqual(RULES.dungeon.floors - 1);
    expect(run.finalRow).toHaveLength(3);
    // Nobody was swapped: each creature has every fight, and the experience is paid on them.
    expect(Object.values(run.fightsBy)).toEqual([run.fights, run.fights, run.fights]);
    const bossNode = dayMap('walk', 2).nodes.find((n) => n.kind === 'boss');
    expect(run.boss.element).toBe(
      dungeonContent.foes.find((f) => f.id === bossNode?.foeId)?.element,
    );
  });

  it('ends a run lost in its first fight with nothing in the pack and no experience', () => {
    const p = player(1);
    const run = walkMap({
      player: p,
      map: dayMap('walk', 3),
      depth: 50,
      seed: 'lost',
      team: { creatures: p.creatures, ordered: true },
      skill: 'good',
    });
    expect(run).toMatchObject({ outcome: 'defeat', fights: 1, fightsCleared: 0, camp: null });
    expect(run.pack).toEqual({ bait: 0, essence: 0, scrap: 0 });
    expect(run.fightsBy).toEqual({});
  });

  it('gives a run the same dice whatever the policy skill reads, and a random player still finishes', () => {
    const { p, team } = strongTeam();
    for (const skill of ['good', 'reasonable', 'best', 'random'] as const) {
      const run = walkMap({
        player: p,
        map: dayMap('walk', 4),
        depth: 2,
        seed: `skill-${skill}`,
        team,
        skill,
      });
      expect(['cleared', 'home', 'defeat']).toContain(run.outcome);
      expect(run.fights).toBeGreaterThanOrEqual(1);
      expect(run.fightsCleared).toBeLessThanOrEqual(run.fights);
    }
  });

  it('can swap a fresh creature in at the camp for a fallen one, which then earns for the fights it stood in', () => {
    const make = (): SimPlayer => {
      const p = player(9);
      p.creatures.push(creature('p01', 'zipmouse', 9), creature('p01', 'stormray', 9));
      return p;
    };
    let swapped: DungeonLogEntry | undefined;
    for (let day = 0; day < 150 && swapped === undefined; day++) {
      const p = make();
      p.dungeon.depth = 8;
      p.dungeon.firstDay = day - 1;
      const [entry] = playDungeonDay(
        p,
        day,
        dayMap('swap', day),
        `swap:${String(day)}`,
        createSeededRng(`swap-loot:${String(day)}`),
      );
      if (entry?.camp === 'swap') swapped = entry;
    }
    if (swapped === undefined) throw new Error('no run swapped in the scan');
    // The creature that left stood in the fights before the camp and is not in the final row; the row is three.
    expect(swapped.finalRow).toHaveLength(3);
    const left = Object.keys(swapped.fightsBy).filter((id) => !swapped?.finalRow.includes(id));
    expect(left).toHaveLength(1);
    expect(swapped.fightsBy[left[0] as string]).toBeLessThanOrEqual(RULES.dungeon.campFloor);
  });
});

describe('a day in the simulator', () => {
  it('does nothing for a player with fewer than three creatures', () => {
    const p = player(10);
    p.creatures.pop();
    expect(play(p, 1)).toEqual([]);
    expect(p.dungeon.runs).toBe(0);
    expect(p.bait).toBe(0);
  });

  it('pays a cleared run the way the worker does: the pack, the boss chest, the supply and the depth', () => {
    const { entry, p, before } = findRun(
      (e) => e.outcome === 'cleared',
      () => player(15),
    );
    expect(entry).toMatchObject({ depth: 1, cleared: true, outcome: 'cleared' });
    expect(p.dungeon).toMatchObject({ depth: 2, runs: 1, clears: 1, lostAt: null });
    // A cleared run keeps the whole pack, and the boss's Essence and scrap (and the full clear's Essence) are in it.
    expect(entry.packKept).toEqual(entry.packFound);
    const chest = nodeLoot('boss');
    expect(isLandmark(1)).toBe(false);
    expect(entry.packFound.essence).toBeGreaterThanOrEqual(chest.essence);
    expect(entry.packFound.scrap).toBeGreaterThanOrEqual(chest.scrap);
    expect(p.bait - before.bait).toBe(entry.packFound.bait);
    expect(p.essence - before.essence).toBe(entry.packFound.essence);
    expect(p.gear.parts.scrap).toBeGreaterThanOrEqual(entry.packFound.scrap);
    expect(p.week.dungeonRuns).toBe(1);
    expect(p.week.dungeonClears).toBe(1);
    expect(p.week.dungeonBait).toBe(p.bait - before.bait);
    // The supply of the first fight cleared is dropped once, and a depth 1 supply is basic.
    expect(Object.values(p.supplies).reduce((n, x) => n + x, 0)).toBe(1);
    expect(p.stats.supplies_dungeon).toBe(1);
    for (const id of Object.keys(p.supplies)) expect(id.endsWith('-basic')).toBe(true);
    // The boss is a fight cleared too, so a full clear has more fights than the path's other rooms.
    expect(entry.roomsCleared).toBe(entry.fights);
  });

  it('keeps half the pack rounded up after a defeat, and still drops the supply', () => {
    const { entry, p, before } = findRun(
      (e) => e.outcome === 'defeat' && e.roomsCleared >= 2,
      () => {
        const q = player(9);
        q.dungeon.depth = 12;
        return q;
      },
      { tries: 200 },
    );
    expect(entry.cleared).toBe(false);
    expect(entry.packKept).toEqual(keptOnDefeat(entry.packFound));
    for (const k of ['bait', 'essence', 'scrap'] as const) {
      expect(entry.packKept[k]).toBe(Math.ceil(entry.packFound[k] / 2));
    }
    // Defeat keeps the depth, pays no chest and no full-clear Essence, and records where it was lost.
    expect(p.dungeon).toMatchObject({ depth: 12, clears: 0, lostAt: 12 });
    expect(p.bait - before.bait).toBe(entry.packKept.bait);
    expect(p.essence - before.essence).toBe(entry.packKept.essence);
    expect(Object.values(p.supplies).reduce((n, x) => n + x, 0)).toBe(1);
  });

  it('keeps the whole pack and the depth when the player heads home from the camp', () => {
    const { entry, p, before } = findRun(
      (e) => e.outcome === 'home',
      () => player(12),
      { wary: true, tries: 200 },
    );
    expect(entry).toMatchObject({ cleared: false, outcome: 'home', camp: 'home' });
    expect(entry.packKept).toEqual(entry.packFound);
    expect(p.dungeon.depth).toBe(entry.depth);
    expect(p.dungeon.lostAt).toBeNull();
    expect(p.dungeon.clears).toBe(0);
    expect(p.bait - before.bait).toBe(entry.packFound.bait);
    expect(p.essence - before.essence).toBe(entry.packFound.essence);
    // Home is a finished run: the day counts for the streak, but it is no clear.
    expect(p.dungeon.streak).toBe(1);
    expect(p.week.dungeonClears).toBe(0);
    // Heading home comes only after the camp, so a home run is short: the floors before the camp.
    expect(entry.fights).toBeLessThanOrEqual(RULES.dungeon.campFloor);
  });

  it('lets a first-ever run lost to a defeat be tried once more, and a run that went home or cleared not', () => {
    const p = player(1);
    p.dungeon.depth = 50;
    const runs = play(p, 5);
    expect(runs).toHaveLength(2);
    expect(runs.every((r) => r.outcome === 'defeat')).toBe(true);
    expect(p.dungeon.runs).toBe(2);
    expect(p.dungeon.streak).toBe(1); // one day, counted once
    expect(p.dungeon.firstDay).toBe(5);
    // The next day there is one run only.
    expect(play(p, 6)).toHaveLength(1);
    expect(p.dungeon.streak).toBe(2);
    // A first run that is cleared gets no retry.
    expect(play(player(15, 'p02'), 5)).toHaveLength(1);
    // A first run that heads home gets none either: the retry is for a defeat.
    let homeFirst: SimPlayer | undefined;
    for (let day = 0; day < 200 && homeFirst === undefined; day++) {
      const q = player(12, 'p03');
      q.dungeon.lostAt = q.dungeon.depth; // wary, so the camp sends it home
      const log = playDungeonDay(
        q,
        day,
        dayMap('retry', day),
        `retry:${String(day)}`,
        createSeededRng(`retry-loot:${String(day)}`),
      );
      if (log[0]?.outcome === 'home') {
        expect(log).toHaveLength(1);
        homeFirst = q;
      }
    }
    expect(homeFirst).toBeDefined();
  });

  it('counts days in a row, pays the streak bonus once and starts again after a gap', () => {
    const p = player(15);
    const bonus = streakBonus(3);
    let baitBefore = 0;
    let last: DungeonLogEntry[] = [];
    for (let day = 0; day < 3; day++) {
      baitBefore = p.bait;
      last = play(p, day);
    }
    expect(p.dungeon.streak).toBe(3);
    const entry = last[0] as DungeonLogEntry;
    expect(p.bait - baitBefore).toBe(entry.packKept.bait + (bonus?.bait ?? 0));
    play(p, 6); // missed days 3 to 5
    expect(p.dungeon.streak).toBe(1);
    expect(p.dungeon.depth).toBeGreaterThan(1); // the depth is kept
  });

  it('is deterministic', () => {
    const a = player(14);
    const b = player(14);
    expect(play(a, 2)).toEqual(play(b, 2));
    expect(a.dungeon).toEqual(b.dungeon);
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

  it('pays experience per fight cleared, to the row that stood in it', () => {
    const on = run(true);
    const daily = on.players.find((p) => p.archetype === 'daily');
    // Fights cleared by creatures add up to the experience the sim counted (no treat doubles it here:
    // `exp_dungeon` counts the experience as paid, treats included, so it is at least the plain sum).
    const plain = (daily?.dungeon ?? []).reduce(
      (n, r) =>
        n +
        Object.entries(r.fightsBy).reduce(
          (m, [id, f]) =>
            m +
            RULES.experience.dungeon.perRoom * f +
            (r.fullClearRow.includes(id) ? RULES.experience.dungeon.fullClear : 0),
          0,
        ),
      0,
    );
    expect(plain).toBeGreaterThan(0);
    expect(daily?.tripStats['exp_dungeon'] ?? 0).toBeGreaterThanOrEqual(plain);
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
      'dungeon.dailyHomeRate',
      'dungeon.meanFights',
      'dungeon.eligibleMeanFights',
      'dungeon.dailyEssenceShare',
      'dungeon.dailyGearShareWeek8',
    ]) {
      expect(metrics[key], key).not.toBeNull();
    }
    // The Undercroft's measures exist (a 9-week default server has daily players past depth 8).
    expect(stats.undercroft.eligible).toBeGreaterThan(0);
    expect(stats.undercroft.offered).toBeLessThanOrEqual(stats.undercroft.eligible);
    expect(stats.undercroft.descended).toBeLessThanOrEqual(stats.undercroft.offered);
    expect(stats.undercroft.cleared).toBeLessThanOrEqual(stats.undercroft.descended);
    expect(stats.winRates.daily[0]?.runs).toBeGreaterThan(0);
    expect(stats.depthAfter.daily.length).toBe(9);
    expect(stats.flow.daily.runs).toBeGreaterThan(5);
    expect(stats.gearShareWeek8.without).not.toBeNull();
    // Every run ends cleared, at home or in a defeat.
    const shape = stats.runShape.daily;
    expect(shape.cleared + shape.home + shape.defeat).toBeCloseTo(1, 6);
    expect(shape.fights).toBeGreaterThan(1);
    expect(shape.packKept).toBeLessThanOrEqual(shape.packFound);
  });
});

/** Runs `body` with tuning overrides (as the tune CLI applies them) and puts the shipped numbers back after. */
function withRules<T>(spec: string, body: () => T): T {
  const undo = applyOverrides(spec);
  try {
    return body();
  } finally {
    undo();
  }
}

/** Foes so weak that a level 15 row beats every room: the Undercroft is then a matter of the policy and the rules, not of luck. */
const EASY = 'dungeon.baseHpBp=300,dungeon.baseAtkBp=300';
/** Every chest drops its gear (a landmark's is certain anyway), the main boss's included: off, so only a keeper's counts. */
const KEEPER_GEAR = 'dungeon.undercroft.chest.gearBp=10000,dungeon.fullClear.gearBp=0';

/** A daily player of three level 15 creatures at `depth`, past their first day (one run, no retry). */
function deepPlayer(depth: number, day: number): SimPlayer {
  const p = player(15);
  p.dungeon.depth = depth;
  p.dungeon.firstDay = day - 1;
  return p;
}

function playOne(
  depth: number,
  day: number,
  skill: DungeonSkill = 'good',
  seed = 'under',
): { entry: DungeonLogEntry; p: SimPlayer; before: { bait: number; essence: number } } {
  const p = deepPlayer(depth, day);
  const before = { bait: p.bait, essence: p.essence };
  const [entry] = playDungeonDay(
    p,
    day,
    dayMap(seed, day),
    `${seed}:${String(day)}`,
    createSeededRng(`${seed}-loot:${String(day)}`),
    {},
    undefined,
    null,
    skill,
  );
  if (entry === undefined) throw new Error('no run');
  return { entry, p, before };
}

describe('the day map with doors', () => {
  it('has a carved door on floor 4 or 5 on about a third of the days, never two, and draws the map the sim always drew otherwise', () => {
    let doors = 0;
    const days = 150;
    for (let day = 0; day < days; day++) {
      const map = dayMap('doors', day);
      expect(dungeonMapValid(map)).toBe(true);
      const found = map.nodes.filter((n) => n.kind === 'door');
      expect(found.length).toBeLessThanOrEqual(1);
      for (const n of found) {
        expect(RULES.dungeon.undercroft.doorFloors).toContain(n.floor);
        // A door holds no foe, no modifier and no event.
        expect(n.foeId).toBeUndefined();
        expect(n.modifierId).toBeUndefined();
        expect(n.eventId).toBeUndefined();
      }
      doors += found.length;
    }
    const share = doors / days;
    expect(share).toBeGreaterThan(RULES.dungeon.undercroft.doorBp / 10_000 - 0.15);
    expect(share).toBeLessThan(RULES.dungeon.undercroft.doorBp / 10_000 + 0.15);
  });

  it('scores a door above a plain fight, so a route that reaches one steps through it', () => {
    const fight = node('f4l0', 'fight');
    const door = node('f4l1', 'door');
    const foe = dungeonContent.foes.find((f) => f.kind === 'foe');
    if (foe === undefined) throw new Error('no foe');
    // Against a foe the row does not beat, and one it is neutral to.
    expect(routeScore(door, undefined, [], healthy)).toBeGreaterThan(
      routeScore(fight, foe.element, [], healthy),
    );
    const map: DungeonMap = {
      floors: 7,
      nodes: [node('f3l1', 'camp', ['f4l0', 'f4l1']), fight, door],
    };
    const rng = createSeededRng('door');
    expect(pickRoute(map, 8, ['f4l0', 'f4l1'], healthy, [], 'good', rng)).toBe('f4l1');
    // A hurt row still takes it: nothing to fear in a door.
    expect(pickRoute(map, 8, ['f4l0', 'f4l1'], { avgHp: 0.3, down: 1 }, [], 'good', rng)).toBe(
      'f4l1',
    );
  });

  it('adds a room to the Undercroft from depth 8 and does nothing below it', () => {
    let stepped = 0;
    for (let day = 0; day < 120 && stepped < 3; day++) {
      const map = dayMap('doors', day);
      if (!map.nodes.some((n) => n.kind === 'door')) continue;
      withRules(EASY, () => {
        const run = (depth: number) =>
          walkMap({
            player: deepPlayer(depth, day),
            map,
            depth,
            seed: `door:${String(day)}`,
            team: { creatures: deepPlayer(depth, day).creatures, ordered: true },
            skill: 'good',
          });
        const deep = run(8);
        if (deep.under.marks.length === 0) return; // the route did not pass the door
        stepped += 1;
        expect(deep.under.marks).toHaveLength(1);
        expect(RULES.dungeon.undercroft.markOdds).toHaveProperty(deep.under.marks[0] as string);
        // The same walk below depth 8: a quiet room, nothing added, no Undercroft offered.
        const shallow = run(3);
        expect(shallow.under.marks).toEqual([]);
        expect(shallow.under.offered).toBe(false);
      });
    }
    expect(stepped).toBeGreaterThanOrEqual(1);
  });
});

describe('the descent', () => {
  const at = (avgHp: number, down = 0): RunView => ({ avgHp, down });
  const plan = (floors: number, camp = false) => ({ floors, camp });
  const rng = createSeededRng('descend');

  it('goes down when healthy after catching its breath: over 50% HP (the fallen are back up)', () => {
    expect(wantsDescend(at(0.9), plan(3), 'good', rng)).toBe(true);
    expect(wantsDescend(at(0.51), plan(3), 'good', rng)).toBe(true);
    expect(wantsDescend(at(0.4), plan(3), 'good', rng)).toBe(false);
    expect(wantsDescend(at(POLICY.descendHp), plan(3), 'good', rng)).toBe(false);
    expect(wantsDescend(at(0.95, 1), plan(3), 'good', rng)).toBe(false);
    expect(wantsDescend(at(0.95, 1), plan(3), 'reasonable', rng)).toBe(false);
    expect(POLICY.descendHp).toBe(0.5);
  });

  it('has the best player want more health for a long level with no camp, and a random one flip a coin', () => {
    const long = plan(POLICY.longFloors);
    expect(wantsDescend(at(0.7), long, 'good', rng)).toBe(true);
    expect(wantsDescend(at(0.7), long, 'best', rng)).toBe(false);
    expect(wantsDescend(at(POLICY.longHp + 0.01), long, 'best', rng)).toBe(true);
    // A camp among the rooms (a door added one) makes it worth the risk again.
    expect(wantsDescend(at(0.7), plan(POLICY.longFloors, true), 'best', rng)).toBe(true);
    expect(wantsDescend(at(0.7), plan(POLICY.longFloors - 1), 'best', rng)).toBe(true);
    // Never when somebody is still down (a revive leaves nobody down, so this is a guard), whatever the level.
    expect(wantsDescend(at(0.99, 1), plan(2), 'best', rng)).toBe(false);
    // Random players: either answer comes up whatever their health, and the same stream gives the same ones.
    const picks = (seed: string) => {
      const r = createSeededRng(seed);
      return Array.from({ length: 40 }, () => wantsDescend(at(0.1, 2), long, 'random', r));
    };
    expect(picks('d')).toEqual(picks('d'));
    expect(new Set(picks('d'))).toEqual(new Set([true, false]));
  });

  it("has no Undercroft below depth 8: the boss ends the run cleared, the chest is the run's own", () => {
    expect(undercroftOpen(7)).toBe(false);
    withRules(EASY, () => {
      for (let day = 0; day < 10; day++) {
        const { entry, p } = playOne(7, day);
        expect(entry.under).toMatchObject({ offered: false, descended: false, entered: 0 });
        expect(entry).toMatchObject({ cleared: true, outcome: 'cleared' });
        expect(p.dungeon.depth).toBe(8);
      }
    });
  });
});

describe('the Undercroft in the simulator', () => {
  it("pays a descent the way the worker does: depth + 1, the whole pack at home, and the keeper chest's gear", () => {
    withRules(`${EASY},dungeon.undercroft.crackBp=0,${KEEPER_GEAR}`, () => {
      for (let day = 0; day < 8; day++) {
        const { entry, p, before } = playOne(8, day);
        // The boss fell, the row went down, beat the keeper and the run ended cleared (the level has no crack).
        expect(entry).toMatchObject({ cleared: true, outcome: 'cleared', depth: 8 });
        expect(entry.under).toMatchObject({
          offered: true,
          descended: true,
          entered: 1,
          levels: 1,
        });
        // A path takes one room of each floor (a cache or a mystery room is no fight): at least the first floor's fight and
        // the keeper, at most every floor, the added rooms and the keeper.
        expect(entry.under.fights).toBeGreaterThanOrEqual(2);
        expect(entry.under.fights).toBeLessThanOrEqual(
          RULES.dungeon.undercroft.baseFloors + RULES.dungeon.undercroft.maxMarks + 1,
        );
        expect(entry.mainFights + entry.under.fights).toBe(entry.fights);
        expect(p.dungeon).toMatchObject({ depth: 9, clears: 1, lostAt: null });
        // Cleared keeps the whole pack, which holds the boss chest's and the keeper chest's Essence and scrap.
        expect(entry.packKept).toEqual(entry.packFound);
        expect(entry.packFound.essence).toBeGreaterThanOrEqual(
          nodeLoot('boss').essence + nodeLoot('boss', 1).essence,
        );
        expect(entry.packFound.scrap).toBeGreaterThanOrEqual(
          nodeLoot('boss').scrap + nodeLoot('boss', 1).scrap,
        );
        expect(p.bait - before.bait).toBe(entry.packFound.bait);
        expect(p.essence - before.essence).toBe(entry.packFound.essence);
        // The keeper's chest rolled its gear (certain here); the main chest's gear chance is off.
        expect(p.week.dungeonItems).toBe(1);
        // Everyone in the row at the boss gets the full clear bonus: nobody swapped, so the row is the same.
        expect(entry.fullClearRow).toHaveLength(3);
        expect(new Set(entry.fullClearRow)).toEqual(new Set(entry.finalRow));
      }
    });
  });

  it("puts twice the loot in the pack for the Undercroft's fights, elites and caches, and not for the keeper or an epic fight", () => {
    const u = RULES.dungeon.undercroft;
    expect(roomLoot('fight', 0, null, true)).toEqual(nodeLoot('fight'));
    expect(roomLoot('fight', 1, null, true)).toEqual({
      bait: nodeLoot('fight').bait * u.lootMultiplier,
      essence: nodeLoot('fight').essence * u.lootMultiplier,
      scrap: nodeLoot('fight').scrap * u.lootMultiplier,
    });
    expect(roomLoot('cache', 2, null, false)).toEqual(nodeLoot('cache', 2));
    expect(nodeLoot('cache', 2).bait).toBe(RULES.dungeon.loot.cache.bait * u.lootMultiplier);
    expect(roomLoot('elite', 1, null, true).scrap).toBe(RULES.dungeon.loot.elite.scrap * 2);
    expect(roomLoot('epic', 1, null, true)).toEqual({ ...u.epic.loot });
    expect(roomLoot('boss', 1, null, true)).toEqual({
      bait: 0,
      essence: u.chest.essence,
      scrap: u.chest.scrap,
    });
    // The camp, a door and a mystery room put nothing in it.
    for (const kind of ['camp', 'door', 'mystery'] as const) {
      expect(roomLoot(kind, 1, null, false)).toEqual({ bait: 0, essence: 0, scrap: 0 });
    }
  });

  it("adds Market Day's scrap to the pack, doubled with the fight's in the Undercroft", () => {
    const market: WeatherDay = {
      day: '2026-10-18',
      boon: 'market-day',
      omen: null,
      wild: false,
      boonBp: 10_000,
      omenBp: 0,
    };
    // Market Day pays 1 scrap a fight at base boon strength.
    expect(dungeonScrapPerRoom(market)).toBe(1);
    expect(roomLoot('fight', 0, market, true).scrap).toBe(nodeLoot('fight').scrap + 1);
    expect(roomLoot('fight', 1, market, true).scrap).toBe(
      (nodeLoot('fight').scrap + 1) * RULES.dungeon.undercroft.lootMultiplier,
    );
    // The keeper pays its chest's scrap and Market Day's, not doubled; a cache gets nothing from Market Day.
    expect(roomLoot('boss', 1, market, true).scrap).toBe(RULES.dungeon.undercroft.chest.scrap + 1);
    expect(roomLoot('cache', 0, market, false)).toEqual(nodeLoot('cache'));
  });

  it('goes on down a cracked floor, at most three levels, and every keeper opens its own chest', () => {
    withRules(`${EASY},dungeon.undercroft.crackBp=10000,${KEEPER_GEAR}`, () => {
      for (let day = 0; day < 4; day++) {
        const { entry, p } = playOne(8, day);
        expect(entry.under).toMatchObject({
          descended: true,
          entered: RULES.dungeon.undercroft.maxLevels,
          levels: RULES.dungeon.undercroft.maxLevels,
        });
        // A chest for each keeper: three pieces of gear, the main boss's chance being off.
        expect(p.week.dungeonItems).toBe(RULES.dungeon.undercroft.maxLevels);
        expect(entry).toMatchObject({ cleared: true, outcome: 'cleared' });
        // The deeper levels have their own two floors and keeper: the Undercroft is longer, never endless.
        expect(entry.under.fights).toBeLessThan(30);
      }
    });
  });

  it('keeps the depth and half the pack (rounded up) when the run is lost below the boss', () => {
    // The boss falls easily, the Undercroft's foes are fierce: the row goes down and is lost there.
    withRules(
      `${EASY},dungeon.undercroft.depthBonus=52,dungeon.hpStepBp=40000,dungeon.atkStepBp=40000`,
      () => {
        let lost = 0;
        for (let day = 0; day < 40; day++) {
          const { entry, p, before } = playOne(8, day);
          if (!(entry.under.descended && entry.outcome === 'defeat')) continue;
          lost += 1;
          // The main boss was beaten, so the depth moved and the run counts as a clear of depth 8.
          expect(entry.cleared).toBe(true);
          expect(p.dungeon).toMatchObject({ depth: 9, clears: 1, lostAt: null });
          expect(entry.under.levels).toBe(0);
          expect(entry.packKept).toEqual(keptOnDefeat(entry.packFound));
          for (const k of ['bait', 'essence', 'scrap'] as const) {
            expect(entry.packKept[k]).toBe(Math.ceil(entry.packFound[k] / 2));
          }
          expect(p.bait - before.bait).toBe(entry.packKept.bait);
          expect(p.essence - before.essence).toBe(entry.packKept.essence);
          // The full clear's experience bonus still goes to the row that beat the main boss.
          expect(entry.fullClearRow).toHaveLength(3);
        }
        expect(lost).toBeGreaterThan(5);
      },
    );
  });

  it('keeps the whole pack when a run heads home from an Undercroft camp', () => {
    // A carved door that always adds a camp, a player who picks everything at random: some runs stop at that camp.
    const camp = [
      'dungeon.undercroft.markOdds.fight=0',
      'dungeon.undercroft.markOdds.elite=0',
      'dungeon.undercroft.markOdds.mystery=0',
      'dungeon.undercroft.markOdds.cache=0',
      'dungeon.undercroft.markOdds.epic=0',
      'dungeon.undercroft.markOdds.camp=10000',
    ].join(',');
    withRules(`${EASY},${camp}`, () => {
      let found: ReturnType<typeof playOne> | undefined;
      for (let day = 0; day < 600 && found === undefined; day++) {
        const run = playOne(8, day, 'random');
        if (run.entry.under.camp === 'home') found = run;
      }
      if (found === undefined) throw new Error('no run headed home from an Undercroft camp');
      const { entry, p, before } = found;
      // Heading home after the boss is `cleared` (the depth was won), with the whole pack.
      expect(entry).toMatchObject({ cleared: true, outcome: 'cleared' });
      expect(entry.camp).not.toBe('home'); // the main camp's choice is its own
      expect(entry.under.marks).toContain('camp');
      expect(entry.packKept).toEqual(entry.packFound);
      expect(p.dungeon).toMatchObject({ depth: 9, lostAt: null });
      expect(p.bait - before.bait).toBe(entry.packFound.bait);
      expect(p.essence - before.essence).toBe(entry.packFound.essence);
    });
  });

  it('is deterministic, and every skill finishes the same map', () => {
    withRules(EASY, () => {
      const a = playOne(8, 3, 'best');
      const b = playOne(8, 3, 'best');
      expect(a.entry).toEqual(b.entry);
      for (const skill of ['good', 'reasonable', 'best', 'random'] as const) {
        const { entry } = playOne(8, 5, skill);
        expect(['cleared', 'home', 'defeat']).toContain(entry.outcome);
        expect(entry.under.levels).toBeLessThanOrEqual(entry.under.entered);
        expect(entry.under.entered).toBeLessThanOrEqual(RULES.dungeon.undercroft.maxLevels);
      }
    });
  });
});

describe('the dungeon targets', () => {
  it('has the four targets of the design, the camp choice and the length of a run', () => {
    const byId = new Map(TARGETS.map((t) => [t.id, t]));
    expect(byId.get('dungeon-first-week-clear')).toMatchObject({ comparator: 'min', value: 0.8 });
    expect(byId.get('dungeon-depth-growth')).toMatchObject({ comparator: 'range', value: [1, 2] });
    expect(byId.get('dungeon-essence-share')).toMatchObject({ comparator: 'max', value: 0.4 });
    expect(byId.get('dungeon-gear-share-week8')).toMatchObject({ comparator: 'max', value: 0.2 });
    expect(byId.get('dungeon-home-rate')).toMatchObject({
      comparator: 'range',
      value: [0.1, 0.45],
      metric: 'dungeon.dailyHomeRate',
    });
    expect(byId.get('dungeon-run-fights')).toMatchObject({
      comparator: 'range',
      value: [3, 5.5],
      metric: 'dungeon.meanFights',
    });
    // The Undercroft is a real choice (20 to 80% of the runs that are offered it go down) and runs stay short.
    expect(byId.get('dungeon-descent-rate')).toMatchObject({
      comparator: 'range',
      value: [0.2, 0.8],
      metric: 'dungeon.undercroftDescentRate',
    });
    expect(byId.get('dungeon-eligible-run-fights')).toMatchObject({
      comparator: 'max',
      value: 7,
      metric: 'dungeon.eligibleMeanFights',
    });
  });

  // "Are measured by a run" is in pipeline.test.ts (one shared run).

  it('has foes, events and keepsakes for the maps the model plays', () => {
    expect(dungeonContent.foes.filter((f) => f.kind === 'foe').length).toBeGreaterThanOrEqual(3);
    expect(dungeonEvent('glowing-pool')).toBeDefined();
  });
});
