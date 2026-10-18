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
  gimmickDue,
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

  it('raises the Attack of the named roles only', () => {
    const plain = buildRoomInput(base, room(0, foe(), 1_000, 20), null);
    const echoing = buildWith('echoing');
    const atk = (i: typeof plain, id: string) => i.row.find((s) => s.id === id)?.stats?.atk ?? 0;
    // The Sproutle is the Guard: +50%. The Splashet (Setter) and the Cindle (Payoff) are untouched.
    expect(atk(echoing, 'guard')).toBe(Math.floor((atk(plain, 'guard') * 15_000) / 10_000));
    expect(atk(echoing, 'setter')).toBe(atk(plain, 'setter'));
    expect(atk(echoing, 'payoff')).toBe(atk(plain, 'payoff'));
    // A Support gets the same +50% (a row with one in it).
    const withSupport = {
      ...base,
      team: [
        ...base.team.slice(0, 2),
        makeSlot(species('ashmole'), { id: 'support', ownerId: 'p1', level: 6, fusionCount: 0 }),
      ],
    };
    const a = buildRoomInput(withSupport, room(0, foe(), 1_000, 20), null);
    const b = buildRoomInput(withSupport, room(0, foe(), 1_000, 20, roomModifier('echoing')), null);
    expect(atk(b, 'support')).toBe(Math.floor((atk(a, 'support') * 15_000) / 10_000));
  });

  it('changes the foe, the crit luck and the gimmicks, and never the turn order', () => {
    const brittle = buildWith('brittle');
    expect(brittle.bossHpPool.max).toBe(800);
    expect(brittle.bossAtk).toBe(25);
    const dark = buildWith('dark');
    expect(dark.luck?.critChanceBp).toBe(RULES.combat.luck.critChanceBp + 500);
    expect(dark.luck?.critBp).toBe(RULES.combat.luck.critBp);
    const thorns = buildWith('thorns');
    expect(thorns.boss.gimmicks.map((g) => g.op)).toEqual(['reflect_first_reaction']);
    // No modifier overrides the order: every room's fight goes by the dungeon's rule.
    for (const m of dungeonContent.modifiers) {
      const input = buildWith(m.id);
      expect(input.turnOrderOverride, m.id).toBeUndefined();
      expect(input.boss.turnOrder, m.id).toBe(RULES.dungeon.turnOrder);
    }
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

describe('the team stands in one row, left to right', () => {
  const gimmick = (g: Record<string, unknown>) =>
    ({
      id: 'g',
      name: 'G',
      trigger: { eachRound: true },
      ...g,
    }) as DungeonFoeDef['gimmicks'][number];
  const row = (): FightSlot[] => [
    slot('left', { atk: 10, role: 'setter' }),
    slot('mid', { atk: 10, role: 'support' }),
    slot('right', { atk: 10, role: 'payoff' }),
  ];
  const play = (f: DungeonFoeDef, team: FightSlot[] = row(), seed = 'row') =>
    simulateDungeon(run([room(0, f, 100_000, 100)], team), seed).rooms[0]?.result.events ?? [];
  const hits = (events: ReturnType<typeof play>, source: string) =>
    events.flatMap((e) => (e.t === 'boss_hit' && e.source === source ? [e.target] : []));

  it('fights with a Guard that covers its neighbours, and nothing else special', () => {
    const built = buildRoomInput(run([room(0, foe(), 100, 1)]), room(0, foe(), 100, 1), null);
    expect(built.guardReach).toBe('adjacent');
    // The row is the team, in order: position i is team[i].
    expect(built.row.map((s) => s.id)).toEqual(['guard', 'setter', 'payoff']);
  });

  it('copies the run rules into every room, and has none when the run has none', () => {
    const plain = run([room(0, foe(), 100, 1)]);
    expect(buildRoomInput(plain, room(0, foe(), 100, 1), null).rules).toBeUndefined();
    const rules = {
      coverBp: 4_000,
      maxHitBp: 5_000,
      guardHpBp: 0,
      guardArmorBp: 2_500,
      supportFx: { grove: { healBp: 600 } },
    };
    const built = buildRoomInput({ ...plain, rules }, room(0, foe(), 100, 1), null);
    expect(built.rules).toEqual(rules);
  });

  it('a Support in the middle still buffs both neighbours (the row of three has no zone edges)', () => {
    const buffs = play(foe())
      .filter((e) => e.t === 'support_buff' && e.round === 1)
      .map((e) => (e as { target: string }).target);
    expect(buffs).toEqual(['left', 'right']);
  });

  it('a zone gimmick hits the creature at that position', () => {
    const at = (zone: 'front' | 'middle' | 'back') =>
      hits(play(foe({ gimmicks: [gimmick({ op: 'hit_zone', zone, power: 10_000 })] })), 'gimmick');
    expect(new Set(at('front'))).toEqual(new Set(['left']));
    expect(new Set(at('middle'))).toEqual(new Set(['mid']));
    expect(new Set(at('back'))).toEqual(new Set(['right']));
  });

  it('a zone gimmick follows the order the player chose', () => {
    const order = [
      slot('b', { atk: 10, role: 'setter' }),
      slot('c', { atk: 10, role: 'setter' }),
      slot('a', { atk: 10, role: 'setter' }),
    ];
    const f = foe({ gimmicks: [gimmick({ op: 'hit_zone', zone: 'back', power: 10_000 })] });
    expect(new Set(hits(play(f, order), 'gimmick'))).toEqual(new Set(['a']));
    expect(new Set(hits(play(f, [...order].reverse()), 'gimmick'))).toEqual(new Set(['b']));
  });

  it('"both ends" silences the left and the right creature, and never the middle one', () => {
    const events = play(
      foe({ gimmicks: [gimmick({ op: 'silence_ends', scope: 'row', turns: 1 })] }),
    );
    const silenced = new Set(events.flatMap((e) => (e.t === 'silence' ? [e.creature] : [])));
    expect(silenced).toEqual(new Set(['left', 'right']));
  });

  it('the plain attack goes to the left creature first, then on to the next one standing', () => {
    const frail = [
      slot('left', { hp: 1, role: 'setter' }),
      slot('mid', { role: 'setter' }),
      slot('right', { role: 'setter' }),
    ];
    const attacks = hits(play(foe(), frail), 'attack');
    expect(attacks.slice(0, 3)).toEqual(['left', 'mid', 'mid']);
  });

  it('a Guard in the middle takes the plain attack aimed at the left creature', () => {
    const guarded = [
      slot('left', { role: 'setter' }),
      slot('guard', { role: 'guard' }),
      slot('right', { role: 'setter' }),
    ];
    const events = play(foe(), guarded);
    const first = events.find((e) => e.t === 'boss_hit' && e.source === 'attack');
    expect(first).toMatchObject({ target: 'guard', from: 'left' });
  });

  it('the rule is left to right, then the foe', () => {
    expect(RULES.dungeon.turnOrder).toBe('left_to_right');
  });

  it('every dungeon fight goes left to right whatever the foe or the speeds, and the foe acts after the team', () => {
    // Speeds that would give m, r, l if the order were by speed.
    const speeds = [slot('l', { spd: 1 }), slot('m', { spd: 50 }), slot('r', { spd: 20 })];
    const play = (f: DungeonFoeDef, m?: RoomModifierDef) =>
      simulateDungeon(run([room(0, { ...f, rounds: 1 }, 100_000, 1, m)], speeds), 'turns').rooms[0]
        ?.result.events ?? [];
    const turns = (events: ReturnType<typeof play>) =>
      events.flatMap((e) => (e.t === 'turn' ? [e.creature] : []));
    expect(turns(play(foe()))).toEqual(['l', 'm', 'r']);
    // A stored run from before the rule (or content that tries) can carry a turn order on the foe:
    // it is ignored, because the order is the dungeon's rule, not the foe's.
    for (const stale of ['speed', 'right_to_left', 'left_to_right']) {
      const old = { ...foe(), turnOrder: stale } as DungeonFoeDef;
      expect(turns(play(old)), stale).toEqual(['l', 'm', 'r']);
    }
    // The same for every shipped foe and every shipped modifier.
    for (const f of dungeonContent.foes) expect(turns(play(f)), f.id).toEqual(['l', 'm', 'r']);
    for (const m of dungeonContent.modifiers) {
      expect(turns(play(foe(), m)), m.id).toEqual(['l', 'm', 'r']);
    }
    // The foe's own attack comes after the whole team in the log of a round.
    const events = play(foe({ gimmicks: [] }));
    const lastTurn = events.map((e) => e.t).lastIndexOf('turn');
    const foeHit = events.findIndex((e) => e.t === 'boss_hit');
    expect(foeHit).toBeGreaterThan(lastTurn);
  });
});

describe('every shipped foe, room boss and room modifier makes sense on one row of three', () => {
  const tough = (): FightSlot[] =>
    ['left', 'mid', 'right'].map((id, i) => ({
      ...slot(id, { hp: 1_000_000, atk: 1 + i, role: 'setter' }),
      speciesId: 'splashet',
    }));
  const play = (f: DungeonFoeDef, extra: RoomModifierDef = NONE) =>
    simulateDungeon(
      { ...run([room(0, f, 10_000_000, 50, extra)], tough()), abilities: [] },
      `content-${f.id}`,
    ).rooms[0]?.result.events ?? [];
  const POSITION = { front: 'left', middle: 'mid', back: 'right' } as const;

  for (const f of dungeonContent.foes) {
    it(`${f.name}: each gimmick reaches the creatures it names, on the row of three`, () => {
      const events = play({ ...f, rounds: 12 });
      for (const g of f.gimmicks) {
        const rounds = Array.from({ length: 12 }, (_, i) => i + 1).filter((r) => gimmickDue(g, r));
        const fired = events.filter((e) => e.t === 'gimmick' && e.gimmick === g.id);
        // (A reflect gimmick also reports when it is spent, so it is counted at least once a round.)
        if (g.op === 'reflect_first_reaction')
          expect(fired.length).toBeGreaterThanOrEqual(rounds.length);
        else expect(fired, g.id).toHaveLength(rounds.length);
        if (g.op === 'hit_zone') {
          // A zone is one creature here: the one at that place, and only that one.
          const hit = events.filter(
            (e) => e.t === 'boss_hit' && e.source === 'gimmick' && e.target === POSITION[g.zone],
          );
          expect(hit.length, g.id).toBeGreaterThanOrEqual(rounds.length);
        }
        if (g.op === 'silence_ends') {
          const silenced = new Set(events.flatMap((e) => (e.t === 'silence' ? [e.creature] : [])));
          expect(silenced, g.id).toEqual(new Set(['left', 'right']));
        }
      }
    });
  }

  it('the creatures of every foe room act left to right, all three, each round', () => {
    for (const f of dungeonContent.foes) {
      const turns = play({ ...f, gimmicks: [], rounds: 1 }).flatMap((e) =>
        e.t === 'turn' ? [e.creature] : [],
      );
      expect(turns, f.id).toEqual(['left', 'mid', 'right']);
    }
  });

  it('no room modifier targets a zone or a row: they are team-wide or foe-wide folds', () => {
    for (const m of dungeonContent.modifiers) {
      for (const e of m.effects) {
        if (e.op === 'foe_gimmick') {
          expect(['hit_zone'], m.id).not.toContain(e.gimmick.op);
        }
        // A role or element filter is about who a creature is, never where it stands.
        expect(
          Object.keys(e).filter((k) => /zone|row|slot|position/i.test(k)),
          m.id,
        ).toEqual([]);
      }
      // And each one builds and plays on the row.
      const result = simulateDungeon(
        { ...run([room(0, dungeonContent.foes[0] as DungeonFoeDef, 300, 12, m)], tough()) },
        `mod-${m.id}`,
      );
      expect(result.rooms).toHaveLength(1);
    }
  });
});

function gimmickOf(id: string): DungeonFoeDef['gimmicks'][number] {
  return { id, name: id, trigger: { eachRound: true }, op: 'silence_ends', scope: 'row', turns: 1 };
}

describe('the boss room: enrage and the landmark signature', () => {
  const ENRAGE = { rounds: 2, powerBp: 20_000 };
  const signature = {
    id: 'sig',
    name: 'Sig',
    trigger: { every: 2 },
    op: 'charge',
    then: { op: 'pincer', scope: 'row', power: 10_000 },
  } as const;
  const tank = (): FightSlot[] =>
    ['left', 'mid', 'right'].map((id) => ({
      ...slot(id, { atk: 1, hp: 1_000_000 }),
      ownerId: 'p1',
    }));
  const bossFoe = (over: Partial<DungeonFoeDef> = {}) =>
    foe({ id: 'boss-foe', kind: 'boss', rounds: 3, signature, ...over });
  /** A run of one room against a foe nobody can kill, so its rounds run out. */
  const oneRoom = (f: DungeonFoeDef, extra: Partial<DungeonRunInput> = {}): DungeonRunInput => ({
    ...run([room(0, f, 100_000_000, 20)], tank()),
    ...extra,
  });

  it('copies the enrage into the boss room only, and has none when the run has none', () => {
    const boss = room(2, bossFoe(), 100, 1);
    const normal = room(0, foe(), 100, 1);
    expect(buildRoomInput(oneRoom(bossFoe(), { enrage: ENRAGE }), boss, null).enrage).toEqual(
      ENRAGE,
    );
    expect(buildRoomInput(oneRoom(foe(), { enrage: ENRAGE }), normal, null).enrage).toBeUndefined();
    expect(buildRoomInput(oneRoom(bossFoe()), boss, null).enrage).toBeUndefined();
  });

  it('plays enrage rounds in the boss room when its rounds run out, and not in a normal room', () => {
    const inBoss = simulateDungeon(oneRoom(bossFoe(), { enrage: ENRAGE }), 'boss-enrage');
    const result = inBoss.rooms[0]?.result;
    expect(result?.enraged).toBe(true);
    expect(result?.rounds).toBe(3 + ENRAGE.rounds);
    expect(inBoss.cleared).toBe(false);
    // Each enrage round hits all three creatures for 200% of the foe's Attack (20 x 2 = 40).
    const rage = (result?.events ?? []).flatMap((e) =>
      e.t === 'boss_hit' && e.source === 'enrage' ? [e] : [],
    );
    expect(rage).toHaveLength(3 * ENRAGE.rounds);
    // A crit (the live luck rules give the boss a chance) is 50% more.
    for (const h of rage) expect(h.damage).toBe(h.crit === true ? 60 : 40);

    // A normal room keeps today's rule: out of rounds ends it, whatever the run's enrage says.
    const inNormal = simulateDungeon(oneRoom(foe({ rounds: 3 }), { enrage: ENRAGE }), 'normal');
    expect(inNormal.rooms[0]?.result.enraged).toBe(false);
    expect(inNormal.rooms[0]?.result.rounds).toBe(3);
  });

  it('a boss that falls in time, and a run without enrage or depth, play exactly as before', () => {
    const strong = (): FightSlot[] =>
      ['left', 'mid', 'right'].map((id) => ({
        ...slot(id, { atk: 200, hp: 1_000_000 }),
        ownerId: 'p1',
      }));
    const plain = run([room(0, bossFoe(), 300, 20)], strong());
    const withNew: DungeonRunInput = { ...plain, enrage: ENRAGE, depth: 3 };
    const a = simulateDungeon(plain, 'as-before');
    expect(a.cleared).toBe(true);
    expect(simulateDungeon(withNew, 'as-before')).toEqual(a);
    expect(a.rooms[0]?.result.enraged).toBe(false);
    // A stored older run (no new fields) is built and replayed exactly as it was.
    const stored = JSON.parse(JSON.stringify(plain)) as DungeonRunInput;
    expect('enrage' in stored || 'depth' in stored).toBe(false);
    expect(simulateDungeon(stored, 'as-before')).toEqual(a);
    expect(buildRoomInput(stored, stored.rooms[0] as DungeonRoomSpec, null).boss.gimmicks).toEqual(
      [],
    );
  });

  it('gives the room boss its signature at landmark depths only, after its own moves', () => {
    const every = RULES.dungeon.landmarkEvery;
    const boss = room(2, bossFoe(), 100, 1);
    const ids = (depth: number | undefined, b = boss) =>
      buildRoomInput(
        { ...oneRoom(bossFoe()), ...(depth === undefined ? {} : { depth }) },
        b,
        null,
      ).boss.gimmicks.map((g) => g.id);
    expect(ids(every)).toEqual(['sig']);
    expect(ids(2 * every)).toEqual(['sig']);
    for (const depth of [1, 2, every - 1, every + 1, 2 * every + 3]) {
      expect(ids(depth), `depth ${String(depth)}`).toEqual([]);
    }
    expect(ids(undefined)).toEqual([]);
    // After the foe's own gimmicks.
    const withOwn = room(2, bossFoe({ gimmicks: [gimmickOf('own')] }), 100, 1);
    expect(ids(every, withOwn)).toEqual(['own', 'sig']);
    expect(ids(1, withOwn)).toEqual(['own']);
  });

  it("gives the Undercroft keeper's room its signature whatever the depth, and only when asked", () => {
    const keeper: DungeonRoomSpec = { ...room(2, bossFoe(), 100, 1), signature: true };
    const ids = (r: DungeonRoomSpec, depth: number | undefined) =>
      buildRoomInput(
        { ...oneRoom(bossFoe()), ...(depth === undefined ? {} : { depth }) },
        r,
        null,
      ).boss.gimmicks.map((g) => g.id);
    for (const depth of [undefined, 1, 8, 11, RULES.dungeon.landmarkEvery]) {
      expect(ids(keeper, depth), String(depth)).toEqual(['sig']);
    }
    // Once, not twice, at a landmark depth.
    expect(ids(keeper, RULES.dungeon.landmarkEvery)).toEqual(['sig']);
    // A room without the flag is as before; a normal foe never gains one, flag or not.
    expect(ids(room(2, bossFoe(), 100, 1), 8)).toEqual([]);
    const normal: DungeonRoomSpec = { ...room(0, foe({ signature }), 100, 1), signature: true };
    expect(buildRoomInput(oneRoom(foe()), normal, null).boss.gimmicks).toEqual([]);
  });

  it('gives the signature to a room boss only: a normal foe never gains one', () => {
    const normal = room(0, foe({ signature }), 100, 1);
    expect(
      buildRoomInput({ ...oneRoom(foe()), depth: RULES.dungeon.landmarkEvery }, normal, null).boss
        .gimmicks,
    ).toEqual([]);
  });

  it('announces the signature a round ahead on a landmark depth, and not otherwise', () => {
    const every = RULES.dungeon.landmarkEvery;
    const charges = (depth: number) =>
      (simulateDungeon(oneRoom(bossFoe(), { depth }), 'sig').rooms[0]?.result.events ?? []).flatMap(
        (e) => (e.t === 'charge' ? [[e.round, e.landing]] : []),
      );
    // Every 2nd round lands in rounds 2 and 4, but only the landing within the 3 base rounds is
    // announced (and never one in an enrage round).
    expect(charges(every)).toEqual([[1, 2]]);
    expect(charges(every - 1)).toEqual([]);
    const withEnrage = simulateDungeon(oneRoom(bossFoe(), { depth: every, enrage: ENRAGE }), 'sig');
    expect((withEnrage.rooms[0]?.result.events ?? []).filter((e) => e.t === 'charge')).toHaveLength(
      1,
    );
  });

  it('every shipped room boss has a signature, and announces it at the landmark depth', () => {
    for (const f of dungeonContent.foes.filter((x) => x.kind === 'boss')) {
      expect(f.signature, f.id).toBeDefined();
      const result = simulateDungeon(
        oneRoom({ ...f, rounds: 6 }, { depth: RULES.dungeon.landmarkEvery }),
        `shipped-${f.id}`,
      );
      const events = result.rooms[0]?.result.events ?? [];
      const announced = events.filter((e) => e.t === 'charge' && e.gimmick === f.signature?.id);
      expect(announced.length, f.id).toBeGreaterThan(0);
    }
  });
});

describe('between-room rest (a Scarf line)', () => {
  const survivors = (): FightSlot[] =>
    ['left', 'mid', 'right'].map((id) => ({
      ...slot(id, { atk: 5, hp: 1_000 }),
      ownerId: 'p1',
    }));
  const two = (extra: Partial<DungeonRunInput> = {}): DungeonRunInput => ({
    ...run([room(0, foe(), 100, 1), room(1, foe(), 100, 1)], survivors()),
    ...extra,
  });

  it('adds its share of max HP to a standing creature before the next room, never above max', () => {
    const hp = { left: 400, mid: 990, right: 0 };
    const plain = buildRoomInput(two(), two().rooms[1] as DungeonRoomSpec, hp);
    const rested = buildRoomInput(
      two({ rest: { left: 500, mid: 500, right: 500 } }),
      two().rooms[1] as DungeonRoomSpec,
      hp,
    );
    const hpOf = (input: ReturnType<typeof buildRoomInput>, id: string) =>
      input.row.find((s) => s.id === id)?.hp;
    expect(hpOf(plain, 'left')).toBe(400);
    expect(hpOf(rested, 'left')).toBe(450);
    // Never above max HP.
    expect(hpOf(rested, 'mid')).toBe(1_000);
    // A fallen creature stays down.
    expect(hpOf(rested, 'right')).toBe(0);
  });

  it('does nothing in the first room (everyone starts full) and for creatures without a share', () => {
    const first = buildRoomInput(
      two({ rest: { left: 500 } }),
      two().rooms[0] as DungeonRoomSpec,
      null,
    );
    expect(first.row.every((s) => s.hp === undefined)).toBe(true);
    const some = buildRoomInput(two({ rest: { left: 500 } }), two().rooms[1] as DungeonRoomSpec, {
      left: 100,
      mid: 100,
      right: 100,
    });
    expect(some.row.map((s) => s.hp)).toEqual([150, 100, 100]);
  });

  it('a stored run without it replays exactly as before, and a rested team ends with more HP', () => {
    const plain = simulateDungeon(two(), 'rest');
    const stored = JSON.parse(JSON.stringify(two())) as DungeonRunInput;
    expect('rest' in stored).toBe(false);
    expect(simulateDungeon(stored, 'rest')).toEqual(plain);
    const tough = (): FightSlot[] =>
      ['left', 'mid', 'right'].map((id) => ({
        ...slot(id, { atk: 200, hp: 1_000 }),
        ownerId: 'p1',
      }));
    const rooms = [
      room(0, foe(), 1_500, 150),
      room(1, foe(), 1_500, 150),
      room(2, foe(), 1_500, 150),
    ];
    const noRest = simulateDungeon(run(rooms, tough()), 'rest-2');
    const withRest = simulateDungeon(
      { ...run(rooms, tough()), rest: { left: 1_000, mid: 1_000, right: 1_000 } },
      'rest-2',
    );
    const sum = (r: typeof noRest) => Object.values(r.hpEnd).reduce((a, b) => a + b, 0);
    expect(sum(withRest)).toBeGreaterThan(sum(noRest));
  });
});

describe('more boss attacks in a run (the Stormfront)', () => {
  const tough = (): FightSlot[] =>
    ['left', 'mid', 'right'].map((id) => ({
      ...slot(id, { atk: 100, hp: 1_000 }),
      ownerId: 'p1',
    }));
  const one = (extra: Partial<DungeonRunInput> = {}): DungeonRunInput => ({
    ...run([room(0, foe(), 5_000, 40)], tough()),
    ...extra,
  });

  it('puts the count into every room fight, and a count of one or none changes nothing', () => {
    const at = (input: DungeonRunInput) =>
      buildRoomInput(input, input.rooms[0] as DungeonRoomSpec, null);
    expect(at(one()).bossAttacks).toBeUndefined();
    expect(at(one({ bossAttacks: 1 })).bossAttacks).toBeUndefined();
    expect(at(one({ bossAttacks: 2 })).bossAttacks).toBe(2);
    expect(at(one({ bossAttacks: 3 })).bossAttacks).toBe(3);
  });

  it('a stored run without it replays exactly as before, and a stormier room hurts the team more', () => {
    const plain = simulateDungeon(one(), 'storm');
    const stored = JSON.parse(JSON.stringify(one())) as DungeonRunInput;
    expect('bossAttacks' in stored).toBe(false);
    expect(simulateDungeon(stored, 'storm')).toEqual(plain);
    const stormy = simulateDungeon(one({ bossAttacks: 2 }), 'storm');
    const sum = (r: typeof plain) => Object.values(r.hpEnd).reduce((a, b) => a + b, 0);
    expect(sum(stormy)).toBeLessThan(sum(plain));
  });
});

describe("the day's sheet on a dungeon team", () => {
  it("a creature with a day's modifier sheet fights with it in every room (Fair Winds, first hit)", () => {
    const base = (mods?: FightSlot['mods']): DungeonRunInput =>
      run(
        [room(0, foe(), 100_000, 1), room(1, foe(), 100_000, 1)],
        ['a', 'b', 'c'].map((id) => ({
          ...slot(id, { atk: 100, hp: 100_000 }),
          ownerId: 'p1',
          ...(mods === undefined ? {} : { mods }),
        })),
      );
    const damage = (r: ReturnType<typeof simulateDungeon>) =>
      r.rooms.reduce((n, x) => n + (x.result.perPlayer.p1?.damage ?? 0), 0);
    const plain = simulateDungeon(base(), 'sheet');
    const lucky = simulateDungeon(base({ firstHitBp: 5_000 }), 'sheet');
    expect(damage(lucky)).toBeGreaterThan(damage(plain));
  });
});
