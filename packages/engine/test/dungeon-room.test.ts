import { describe, expect, it } from 'vitest';
import {
  RULES,
  content,
  dungeonEvent,
  dungeonKeepsake,
  roomModifier,
  type DungeonFoeDef,
  type KeepsakeDef,
  type RoomModifierDef,
} from '@creatures/game';
import {
  buildRoomInput,
  liveFightRules,
  makeSlot,
  rowMaxHp,
  simulateDungeon,
  simulateDungeonRoom,
  type DungeonRoomSpec,
  type DungeonRunInput,
  type FightSlot,
} from '../src/index';

const species = (id: string) => {
  const s = content.creatures.find((c) => c.id === id);
  if (s === undefined) throw new Error(`no species ${id}`);
  return s;
};

const keepsake = (id: string): KeepsakeDef => {
  const k = dungeonKeepsake(id);
  if (k === undefined) throw new Error(`no keepsake ${id}`);
  return k;
};

const modifier = (id: string): RoomModifierDef => {
  const m = roomModifier(id);
  if (m === undefined) throw new Error(`no modifier ${id}`);
  return m;
};

const NONE: RoomModifierDef = {
  id: 'none',
  name: 'None',
  description: 'Nothing changes.',
  effects: [{ op: 'foe_stat', stat: 'hp', bp: 0 }],
};

const FOE: DungeonFoeDef = {
  id: 'test-foe',
  name: 'Test Foe',
  kind: 'foe',
  element: 'tide',
  baseHp: 300,
  baseAtk: 20,
  gimmicks: [],
  rounds: 6,
  flavor: 'A foe for tests.',
};

function spec(index: number, over: Partial<DungeonRoomSpec> = {}): DungeonRoomSpec {
  return {
    index,
    foe: { ...FOE, id: `foe-${String(index)}` },
    modifier: NONE,
    hp: 300,
    atk: 14,
    ...over,
  };
}

/** A guard (Sproutle), a setter (Splashet) and a payoff (Cindle), as a player's row. */
function team(level = 6): FightSlot[] {
  return [
    makeSlot(species('sproutle'), { id: 'guard', ownerId: 'p1', level, fusionCount: 0 }),
    makeSlot(species('splashet'), { id: 'setter', ownerId: 'p1', level, fusionCount: 0 }),
    makeSlot(species('cindle'), { id: 'payoff', ownerId: 'p1', level, fusionCount: 0 }),
  ];
}

function run(rooms: DungeonRoomSpec[], over: Partial<DungeonRunInput> = {}): DungeonRunInput {
  return {
    team: team(),
    player: 'p1',
    rooms,
    abilities: [],
    luck: { ...RULES.combat.luck },
    ...over,
  };
}

const atkOf = (input: ReturnType<typeof buildRoomInput>, id: string): number =>
  input.row.find((s) => s.id === id)?.stats?.atk ?? 0;
const hpOf = (input: ReturnType<typeof buildRoomInput>, id: string): number =>
  input.row.find((s) => s.id === id)?.stats?.hp ?? 0;

describe('keepsakes fold into a room like the modifier does, after it', () => {
  const plain = buildRoomInput(run([spec(0)]), spec(0), null);
  const withKeepsakes = (ids: string[], over: Partial<DungeonRoomSpec> = {}) =>
    buildRoomInput(run([spec(0)]), spec(0, { keepsakes: ids.map(keepsake), ...over }), null);

  it('an Attack keepsake raises the Attack of its element only', () => {
    const input = withKeepsakes(['tide-pearl']);
    // Splashet is Tide: +25%. Cindle (Ember) and Sproutle (Grove) are untouched.
    expect(atkOf(input, 'setter')).toBe(Math.floor((atkOf(plain, 'setter') * 12_500) / 10_000));
    expect(atkOf(input, 'payoff')).toBe(atkOf(plain, 'payoff'));
    expect(atkOf(input, 'guard')).toBe(atkOf(plain, 'guard'));
  });

  it('an HP keepsake raises every creature max HP, and the fight reports it', () => {
    const input = withKeepsakes(['wayfarer-charm']);
    for (const id of ['guard', 'setter', 'payoff']) {
      expect(hpOf(input, id)).toBe(Math.floor((hpOf(plain, id) * 11_200) / 10_000));
      expect(atkOf(input, id)).toBe(Math.floor((atkOf(plain, id) * 11_200) / 10_000));
    }
    const room = spec(0, { keepsakes: [keepsake('wayfarer-charm')] });
    const result = simulateDungeonRoom(run([room]), room, null, 'hp');
    const base = simulateDungeonRoom(run([spec(0)]), spec(0), null, 'hp');
    expect(result.hpMax['setter']).toBeGreaterThan(base.hpMax['setter'] as number);
  });

  it('folds after the modifier: the two changes multiply, each floored', () => {
    const room = spec(0, { modifier: modifier('flooded'), keepsakes: [keepsake('tide-pearl')] });
    const input = buildRoomInput(run([room]), room, null);
    const afterModifier = Math.floor((atkOf(plain, 'setter') * 12_000) / 10_000);
    expect(atkOf(input, 'setter')).toBe(Math.floor((afterModifier * 12_500) / 10_000));
  });

  it('a foe keepsake changes the foe, and a crit keepsake the luck', () => {
    expect(withKeepsakes(['chalk-mark']).bossHpPool.max).toBe(270);
    expect(withKeepsakes(['lullaby-bell']).bossAtk).toBe(12);
    expect(withKeepsakes(['lantern-moth']).luck?.critChanceBp).toBe(
      RULES.combat.luck.critChanceBp + 500,
    );
    // Two keepsakes stack in order.
    const both = withKeepsakes(['chalk-mark', 'wayfarer-charm', 'lantern-moth']);
    expect(both.bossHpPool.max).toBe(270);
    expect(hpOf(both, 'guard')).toBe(Math.floor((hpOf(plain, 'guard') * 11_200) / 10_000));
  });

  it("the Cursed Idol's curse (held like a keepsake) raises the foe's Attack and the damage the team takes", () => {
    const idol = dungeonEvent('cursed-idol')?.options[0]?.effects.find((e) => e.op === 'curse');
    if (idol?.op !== 'curse') throw new Error('no curse in the idol');
    const curse: KeepsakeDef = idol.curse;
    const cursed = buildRoomInput(run([spec(0)]), spec(0, { keepsakes: [curse] }), null);
    expect(cursed.bossAtk).toBe(Math.floor((plain.bossAtk * 12_000) / 10_000));
    const taken = (keepsakes: KeepsakeDef[]): number => {
      const room = spec(0, {
        hp: 100_000,
        atk: 14,
        ...(keepsakes.length > 0 ? { keepsakes } : {}),
      });
      const out = simulateDungeonRoom(run([room]), room, null, 'curse').result;
      return Object.values(out.hpEnd).reduce((a, b) => a + b, 0);
    };
    expect(taken([curse])).toBeLessThan(taken([]));
  });

  it('an Attack keepsake makes the team hit harder in a real fight', () => {
    const big = { hp: 100_000, atk: 14 };
    const dealt = (keepsakes: KeepsakeDef[]): number => {
      const room = spec(0, { ...big, ...(keepsakes.length > 0 ? { keepsakes } : {}) });
      const out = simulateDungeonRoom(run([room]), room, null, 'swing').result;
      return big.hp - out.bossHpEnd;
    };
    expect(dealt([keepsake('wayfarer-charm')])).toBeGreaterThan(dealt([]));
  });

  it('a stored older room (no keepsakes, no elite) replays exactly, and so do empty ones', () => {
    const rooms = [
      spec(0),
      spec(1),
      spec(2, { foe: { ...FOE, id: 'b', kind: 'boss', rounds: 8 } }),
    ];
    const old = simulateDungeon(run(rooms), 'old');
    const fresh = simulateDungeon(
      run(rooms.map((r) => ({ ...r, keepsakes: [], elite: false }))),
      'old',
    );
    expect(JSON.stringify(fresh)).toBe(JSON.stringify(old));
    const stored = JSON.parse(JSON.stringify(run(rooms))) as DungeonRunInput;
    expect(JSON.stringify(simulateDungeon(stored, 'old'))).toBe(JSON.stringify(old));
  });

  it('the elite flag is display only', () => {
    const a = buildRoomInput(run([spec(0)]), spec(0), null);
    const b = buildRoomInput(run([spec(0)]), spec(0, { elite: true }), null);
    expect(b).toEqual(a);
  });
});

describe('simulateDungeonRoom plays one room', () => {
  const rooms = [spec(0), spec(1), spec(2)];

  it('equals the room of simulateDungeon for the same seed when chained', () => {
    const r = run(rooms);
    const whole = simulateDungeon(r, 'chain');
    let hp: Record<string, number> | null = null;
    for (const [i, room] of rooms.entries()) {
      const played = simulateDungeonRoom(r, room, hp, 'chain');
      expect(played).toEqual(whole.rooms[i]);
      hp = played.result.hpEnd;
      if (!played.cleared) break;
    }
  });

  it('is seeded by the room index, so rooms never share dice and a retry gives the same fight', () => {
    const r = run(rooms);
    const a = simulateDungeonRoom(r, rooms[1] as DungeonRoomSpec, null, 'seed');
    const b = simulateDungeonRoom(r, rooms[1] as DungeonRoomSpec, null, 'seed');
    const c = simulateDungeonRoom(r, rooms[1] as DungeonRoomSpec, null, 'other');
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it('null HP is the first fight: full HP and no between-room rest', () => {
    const r = run(rooms, { rest: { guard: 5_000, setter: 5_000, payoff: 5_000 } });
    const first = simulateDungeonRoom(r, rooms[0] as DungeonRoomSpec, null, 's');
    expect(first.hpStart).toEqual(first.hpMax);
    const rested = simulateDungeonRoom(
      r,
      rooms[1] as DungeonRoomSpec,
      { guard: 10, setter: 10, payoff: 0 },
      's',
    );
    expect(rested.hpStart['guard']).toBeGreaterThan(10);
    expect(rested.hpStart['payoff']).toBe(0);
  });

  it('a creature with no entry in hp (swapped in at the camp) starts at full HP, and is not rested', () => {
    const r = run(rooms, { rest: { guard: 5_000, setter: 5_000, payoff: 5_000 } });
    const room = rooms[1] as DungeonRoomSpec;
    const input = buildRoomInput(r, room, { guard: 20 });
    expect(input.row.find((s) => s.id === 'setter')?.hp).toBeUndefined();
    const out = simulateDungeonRoom(r, room, { guard: 20 }, 's');
    expect(out.hpStart['setter']).toBe(out.hpMax['setter']);
    expect(out.hpStart['payoff']).toBe(out.hpMax['payoff']);
    expect(out.hpStart['guard']).toBeLessThan(out.hpMax['guard'] as number);
    // A leftover entry for a creature that went home is ignored.
    const gone = simulateDungeonRoom(r, room, { guard: 20, home: 5 }, 's');
    expect(Object.keys(gone.hpStart).sort()).toEqual(['guard', 'payoff', 'setter']);
  });

  it('a knocked-out creature (0) stays out', () => {
    const out = simulateDungeonRoom(
      run(rooms),
      rooms[1] as DungeonRoomSpec,
      { guard: 0, setter: 50, payoff: 50 },
      's',
    );
    expect(out.hpStart['guard']).toBe(0);
    expect(out.result.hpEnd['guard']).toBe(0);
  });
});

describe('rowMaxHp is the max HP the fight computes', () => {
  const cases: [string, DungeonRoomSpec, Partial<DungeonRunInput>][] = [
    ['a plain room', spec(0), {}],
    ['a room with team HP keepsakes', spec(0, { keepsakes: [keepsake('wayfarer-charm')] }), {}],
    [
      'a modifier and a keepsake',
      spec(0, { modifier: modifier('echoing'), keepsakes: [keepsake('wayfarer-charm')] }),
      {},
    ],
    [
      'live fight rules',
      spec(0, { keepsakes: [keepsake('wayfarer-charm')] }),
      { rules: liveFightRules() },
    ],
  ];
  for (const [name, room, over] of cases) {
    it(`equals FightResult.hpMax: ${name}`, () => {
      const r = run([room], over);
      const fight = simulateDungeonRoom(r, room, null, 'max');
      expect(rowMaxHp(r, room)).toEqual(fight.hpMax);
    });
  }

  it('includes the Guard bonus and changes with the room', () => {
    const r = run([spec(0)]);
    const plain = rowMaxHp(r, spec(0));
    const charmed = rowMaxHp(r, spec(0, { keepsakes: [keepsake('wayfarer-charm')] }));
    const stats = hpOf(buildRoomInput(r, spec(0), null), 'guard');
    expect(plain['guard']).toBe(Math.floor((stats * (10_000 + RULES.combat.guardHpBp)) / 10_000));
    expect(plain['setter']).toBe(hpOf(buildRoomInput(r, spec(0), null), 'setter'));
    expect(charmed['guard']).toBeGreaterThan(plain['guard'] as number);
  });
});
