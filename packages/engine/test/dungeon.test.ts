import { describe, expect, it } from 'vitest';
import {
  RULES,
  content,
  createSeededRng,
  dungeonContent,
  roomModifier,
  type DungeonFoeDef,
  type RoomModifierDef,
} from '@creatures/game';
import {
  buildRoomInput,
  makeSlot,
  roomSeed,
  simulateDungeon,
  simulateFight,
  type DungeonRoomSpec,
  type DungeonRunInput,
  type FightSlot,
} from '../src/index';
import { input, slot } from './helpers';

const species = (id: string) => {
  const s = content.creatures.find((c) => c.id === id);
  if (s === undefined) throw new Error(`no species ${id}`);
  return s;
};

const NONE: RoomModifierDef = {
  id: 'none',
  name: 'None',
  description: 'Nothing changes.',
  effects: [{ op: 'foe_stat', stat: 'hp', bp: 0 }],
};

function foe(over: Partial<DungeonFoeDef> = {}): DungeonFoeDef {
  return {
    id: 'test-foe',
    name: 'Test Foe',
    kind: 'foe',
    element: 'tide',
    baseHp: 300,
    baseAtk: 20,
    turnOrder: 'left_to_right',
    gimmicks: [],
    rounds: 6,
    flavor: 'A foe for tests.',
    ...over,
  };
}

function room(index: number, f: DungeonFoeDef, hp: number, atk: number, m = NONE): DungeonRoomSpec {
  return { index, foe: f, modifier: m, hp, atk };
}

/** A front guard, a middle setter and a back payoff with real species, as a player's row. */
function team(level = 6): FightSlot[] {
  return [
    makeSlot(species('sproutle'), { id: 'guard', ownerId: 'p1', level, fusionCount: 0 }),
    makeSlot(species('splashet'), { id: 'setter', ownerId: 'p1', level, fusionCount: 0 }),
    makeSlot(species('cindle'), { id: 'payoff', ownerId: 'p1', level, fusionCount: 0 }),
  ];
}

function run(rooms: DungeonRoomSpec[], row: FightSlot[] = team()): DungeonRunInput {
  return {
    team: row,
    player: 'p1',
    rooms,
    abilities: [],
    luck: { ...RULES.combat.luck },
  };
}

describe('a starting HP on a fight slot', () => {
  const fight = (row: FightSlot[], bossAtk = 10) =>
    simulateFight(
      input(row, { phase: 'finale', bossAtk, bossHpPool: { max: 10_000, current: 10_000 } }),
      createSeededRng('hp'),
    );

  it('starts the creature there, and reports start, end and maximum HP', () => {
    const hurt: FightSlot = { ...slot('a', { hp: 100, atk: 10 }), hp: 40 };
    const result = fight([hurt]);
    expect(result.hpStart['a']).toBe(40);
    expect(result.hpMax['a']).toBe(100);
    expect(result.hpEnd['a']).toBeLessThan(40);
  });

  it('caps it at the maximum HP, which for a Guard includes the Guard bonus', () => {
    const over: FightSlot = { ...slot('a', { hp: 100 }), hp: 5_000 };
    expect(fight([over]).hpStart['a']).toBe(100);
    const guard: FightSlot = { ...slot('g', { hp: 100, role: 'guard' }), hp: 5_000 };
    const result = fight([guard]);
    expect(result.hpMax['g']).toBe(100 + (100 * RULES.combat.guardHpBp) / 10_000);
    expect(result.hpStart['g']).toBe(result.hpMax['g']);
  });

  it('leaves a creature at 0 knocked out: it never acts and is never hit', () => {
    const down: FightSlot = { ...slot('down', { atk: 500 }), hp: 0 };
    const result = fight([down, slot('up', { atk: 5 })]);
    expect(result.events.filter((e) => 'creature' in e && e.creature === 'down')).toEqual([]);
    expect(result.events.some((e) => e.t === 'boss_hit' && e.target === 'down')).toBe(false);
    expect(result.hpEnd['down']).toBe(0);
    expect(result.perCreature['down']?.damage).toBe(0);
    expect(result.perCreature['down']?.damageTaken).toBe(0);
  });

  it('plays nothing when everybody starts knocked out', () => {
    const result = fight([{ ...slot('a'), hp: 0 }]);
    expect(result.rounds).toBe(0);
    expect(result.events).toEqual([]);
  });

  it('does not change a fight when absent or full', () => {
    const plain = fight([slot('a', { hp: 100 }), slot('b', { hp: 100 })]);
    const full = fight([
      { ...slot('a', { hp: 100 }), hp: 100 },
      { ...slot('b', { hp: 100 }), hp: 100 },
    ]);
    expect(full).toEqual(plain);
  });

  it('refuses a negative or fractional HP', () => {
    for (const hp of [-1, 1.5, Number.NaN]) {
      expect(() => fight([{ ...slot('a'), hp }])).toThrow(/hp/);
    }
  });
});

describe('a dungeon run', () => {
  const rooms = (): DungeonRoomSpec[] => [
    room(0, foe(), 250, 12),
    room(1, foe({ id: 'two', name: 'Two' }), 250, 12),
    room(2, foe({ id: 'three', name: 'Three', kind: 'boss', rounds: 8 }), 300, 14),
  ];

  it('carries every creature HP from one room to the next', () => {
    const result = simulateDungeon(run(rooms()), 'carry');
    expect(result.rooms.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < result.rooms.length; i++) {
      expect(result.rooms[i]?.hpStart).toEqual(result.rooms[i - 1]?.result.hpEnd);
    }
    // The first room starts everyone at full HP.
    expect(result.rooms[0]?.hpStart).toEqual(result.rooms[0]?.hpMax);
    // And somebody was actually hurt on the way, so the carry means something.
    const first = result.rooms[0] as NonNullable<(typeof result.rooms)[number]>;
    expect(
      Object.values(first.result.hpEnd).some((hp, k) => hp < Object.values(first.hpMax)[k]!),
    ).toBe(true);
  });

  it('keeps a knocked-out creature out of every later room', () => {
    // A heavy hitter that kills the front guard quickly and a weak team: someone falls in room 1.
    const heavy = foe({ baseAtk: 10, gimmicks: [] });
    const frail: FightSlot[] = [
      { ...slot('a', { owner: 'p1', hp: 30, atk: 60, role: 'setter' }), speciesId: 'splashet' },
      {
        ...slot('b', { owner: 'p1', hp: 100_000, atk: 60, role: 'payoff', element: 'spark' }),
        speciesId: 'cindle',
      },
      {
        ...slot('c', { owner: 'p1', hp: 100_000, atk: 60, role: 'setter' }),
        speciesId: 'splashet',
      },
    ];
    const result = simulateDungeon(
      run([room(0, heavy, 900, 100), room(1, foe(), 200, 5), room(2, foe(), 200, 5)], frail),
      'knockout',
    );
    const first = result.rooms[0];
    expect(first?.result.hpEnd['a']).toBe(0);
    for (const later of result.rooms.slice(1)) {
      expect(later.hpStart['a']).toBe(0);
      expect(later.result.hpEnd['a']).toBe(0);
      expect(later.result.events.some((e) => 'creature' in e && e.creature === 'a')).toBe(false);
    }
    expect(result.rooms.length).toBeGreaterThan(1);
  });

  it('is the same for the same input and seed, and differs for another seed', () => {
    const a = simulateDungeon(run(rooms()), 'seed-one');
    const b = simulateDungeon(run(rooms()), 'seed-one');
    expect(b).toEqual(a);
    const results = ['x1', 'x2', 'x3', 'x4', 'x5', 'x6'].map((s) =>
      JSON.stringify(simulateDungeon(run(rooms()), s).rooms.map((r) => r.result.events)),
    );
    expect(new Set(results).size).toBeGreaterThan(1);
  });

  it('replays exactly from its stored input as JSON', () => {
    const input = run(rooms());
    const result = simulateDungeon(input, 'replay-me');
    const stored = JSON.parse(JSON.stringify(input)) as DungeonRunInput;
    expect(simulateDungeon(stored, 'replay-me')).toEqual(result);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('plays every room from its own seed, and a single room can be replayed alone', () => {
    const input = run(rooms());
    const result = simulateDungeon(input, 'alone');
    const second = result.rooms[1];
    if (second === undefined) throw new Error('the run ended in room 1');
    const again = simulateFight(
      buildRoomInput(input, input.rooms[1] as DungeonRoomSpec, second.hpStart),
      createSeededRng(roomSeed('alone', 1)),
    );
    expect(again).toEqual(second.result);
    expect(roomSeed('s', 0)).not.toBe(roomSeed('s', 1));
  });

  it('stops at the first room that is not cleared, and says how far it got', () => {
    const strong = foe({ baseHp: 1_000_000 });
    const result = simulateDungeon(
      run([room(0, foe(), 100, 1), room(1, strong, 1_000_000, 1), room(2, foe(), 100, 1)]),
      'stop',
    );
    expect(result.rooms.map((r) => r.cleared)).toEqual([true, false]);
    expect(result.roomsCleared).toBe(1);
    expect(result.cleared).toBe(false);
  });

  it('ends when everybody is knocked out', () => {
    const result = simulateDungeon(
      run([room(0, foe({ rounds: 12 }), 1_000_000, 1_000), room(1, foe(), 10, 1)]),
      'wipe',
    );
    expect(result.rooms).toHaveLength(1);
    expect(Object.values(result.hpEnd).every((hp) => hp === 0)).toBe(true);
    expect(result.cleared).toBe(false);
    expect(result.roomsCleared).toBe(0);
  });

  it('clears every room of an easy dungeon', () => {
    const result = simulateDungeon(
      run([room(0, foe(), 20, 1), room(1, foe(), 20, 1), room(2, foe(), 20, 1)]),
      'easy',
    );
    expect(result.cleared).toBe(true);
    expect(result.roomsCleared).toBe(3);
  });

  it('keeps the ability choices for every room, each firing once', () => {
    const abilities = [{ playerId: 'p1', abilityId: 'rally', key: 'p1:basic', fireAtRound: 1 }];
    const result = simulateDungeon(
      { ...run([room(0, foe(), 400, 5), room(1, foe(), 400, 5)]), abilities },
      'abilities',
    );
    for (const r of result.rooms) {
      expect(r.result.events.filter((e) => e.t === 'ability')).toHaveLength(1);
    }
  });
});

describe('room modifiers are plain folds of the room input', () => {
  const modifier = (id: string): RoomModifierDef => {
    const m = roomModifier(id);
    if (m === undefined) throw new Error(`no modifier ${id}`);
    return m;
  };
  const base = run([room(0, foe(), 1_000, 20)]);
  const buildWith = (id: string) =>
    buildRoomInput(base, room(0, foe(), 1_000, 20, modifier(id)), null);

  it('raises the Attack of one element only', () => {
    const plain = buildRoomInput(base, room(0, foe(), 1_000, 20), null);
    const flooded = buildWith('flooded');
    const atk = (i: typeof plain, id: string) => i.row.find((s) => s.id === id)?.stats?.atk ?? 0;
    // The Splashet is Tide: +20%. The Cindle (Ember) and the Sproutle (Grove) are untouched.
    expect(atk(flooded, 'setter')).toBe(Math.floor((atk(plain, 'setter') * 12_000) / 10_000));
    expect(atk(flooded, 'payoff')).toBe(atk(plain, 'payoff'));
    expect(atk(flooded, 'guard')).toBe(atk(plain, 'guard'));
  });

  it('changes the foe, the crit luck, the gimmicks and the turn order', () => {
    const brittle = buildWith('brittle');
    expect(brittle.bossHpPool.max).toBe(800);
    expect(brittle.bossAtk).toBe(25);
    const dark = buildWith('dark');
    expect(dark.luck?.critChanceBp).toBe(RULES.combat.luck.critChanceBp + 500);
    expect(dark.luck?.critBp).toBe(RULES.combat.luck.critBp);
    const thorns = buildWith('thorns');
    expect(thorns.boss.gimmicks.map((g) => g.op)).toEqual(['reflect_first_reaction']);
    const fog = buildWith('fog');
    expect(fog.turnOrderOverride).toBe('left_to_right');
    expect(buildRoomInput(base, room(0, foe(), 1_000, 20), null).turnOrderOverride).toBeUndefined();
  });

  it('never changes the stored run input, and every shipped modifier builds and plays', () => {
    const before = JSON.stringify(base);
    for (const m of dungeonContent.modifiers) {
      const spec = room(0, dungeonContent.foes[0] as DungeonFoeDef, 300, 12, m);
      const result = simulateDungeon({ ...base, rooms: [spec] }, `mod-${m.id}`);
      expect(result.rooms).toHaveLength(1);
    }
    expect(JSON.stringify(base)).toBe(before);
  });

  it('applies the modifier to a carried HP without healing: HP is capped, never raised', () => {
    const carried = { guard: 10, setter: 5, payoff: 1 };
    const mossy: RoomModifierDef = {
      id: 'mossy',
      name: 'Mossy',
      description: 'All creatures have 15% more HP.',
      effects: [{ op: 'team_stat', stat: 'hp', bp: 1_500 }],
    };
    const built = buildRoomInput(base, room(1, foe(), 100, 1, mossy), carried);
    expect(built.row.map((s) => s.hp)).toEqual([10, 5, 1]);
    const result = simulateFight(built, createSeededRng('mossy'));
    expect(result.hpStart['guard']).toBe(10);
    expect(result.hpMax['guard']).toBeGreaterThan(10);
  });
});
