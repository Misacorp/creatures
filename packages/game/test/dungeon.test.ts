import { describe, expect, it } from 'vitest';
import {
  RULES,
  content,
  createSeededRng,
  dungeonContent,
  dungeonFoe,
  dungeonGearOddsBp,
  dungeonPayout,
  dungeonRowOrder,
  dungeonSupplyOddsBp,
  depthFactorBp,
  int,
  isLandmark,
  landmarkBossId,
  loadDungeon,
  roomModifier,
  roomPlanValid,
  rollDayModifiers,
  rollDungeonLoot,
  rollDungeonSupply,
  rollRooms,
  rowReactions,
  rowScore,
  scaledFoe,
  streakBonus,
  supplyDef,
  streakCycleDay,
  type Element,
  type Role,
} from '../src/index';
import foesJson from '../src/content/data/dungeon-foes.json';
import modifiersJson from '../src/content/data/room-modifiers.json';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const rooms = RULES.dungeon.rooms;
const foes = (): Record<string, unknown>[] => clone(foesJson);
const mods = (): Record<string, unknown>[] => clone(modifiersJson);

describe('the dungeon content', () => {
  it('has about 8 normal foes, 4 room bosses and 8 modifiers, and loads', () => {
    expect(dungeonContent.foes.filter((f) => f.kind === 'foe')).toHaveLength(8);
    expect(dungeonContent.foes.filter((f) => f.kind === 'boss')).toHaveLength(4);
    expect(dungeonContent.modifiers).toHaveLength(8);
    expect(() => loadDungeon(foes(), mods(), rooms)).not.toThrow();
  });

  it('gives every element a foe and a room boss, and shows what each one does', () => {
    for (const element of content.elements) {
      expect(
        dungeonContent.foes.some((f) => f.kind === 'foe' && f.element === element.id),
        element.id,
      ).toBe(true);
      expect(
        dungeonContent.foes.some((f) => f.kind === 'boss' && f.element === element.id),
        element.id,
      ).toBe(true);
    }
    // Bosses have more HP than any normal foe; every foe has a flavour line.
    const normalMax = Math.max(
      ...dungeonContent.foes.filter((f) => f.kind === 'foe').map((f) => f.baseHp),
    );
    for (const boss of dungeonContent.foes.filter((f) => f.kind === 'boss')) {
      expect(boss.baseHp).toBeGreaterThan(normalMax);
      expect(boss.rounds).toBeGreaterThan(6);
    }
    for (const f of dungeonContent.foes) expect(f.flavor.length).toBeGreaterThan(10);
  });

  it('has no turn order on any foe and no modifier that changes it: every room goes left to right', () => {
    expect(RULES.dungeon.turnOrder).toBe('left_to_right');
    for (const f of dungeonContent.foes) expect(Object.keys(f), f.id).not.toContain('turnOrder');
    for (const m of dungeonContent.modifiers) {
      for (const e of m.effects) expect(e.op, m.id).not.toBe('turn_order');
    }
  });

  it('retired Fog (it only set the turn order) and has Echoing in the pool instead', () => {
    expect(roomModifier('fog')).toBeUndefined();
    expect(roomModifier('echoing')?.effects).toEqual([
      { op: 'team_stat', stat: 'atk', bp: 5_000, role: 'guard' },
      { op: 'team_stat', stat: 'atk', bp: 5_000, role: 'support' },
    ]);
  });

  it('looks foes and modifiers up by id', () => {
    expect(dungeonFoe('puddle-imp')?.name).toBe('Puddle Imp');
    expect(dungeonFoe('nobody')).toBeUndefined();
    expect(roomModifier('flooded')?.name).toBe('Flooded');
    expect(roomModifier('nothing')).toBeUndefined();
  });

  it('rejects a Boss Rank on a foe move, a signature or a modifier move (raid bosses only)', () => {
    const withRank = (g: unknown): unknown => ({ ...(g as object), fromRank: 4 });
    const firstWith = foes().findIndex((f) => (f.gimmicks as unknown[]).length > 0);
    expect(() =>
      loadDungeon(
        foes().map((f, i) =>
          i === firstWith ? { ...f, gimmicks: (f.gimmicks as unknown[]).map(withRank) } : f,
        ),
        mods(),
        rooms,
      ),
    ).toThrow(/fromRank/);
    const bossIndex = foes().findIndex((f) => f.signature !== undefined);
    expect(() =>
      loadDungeon(
        foes().map((f, i) => (i === bossIndex ? { ...f, signature: withRank(f.signature) } : f)),
        mods(),
        rooms,
      ),
    ).toThrow(/fromRank/);
    const modIndex = mods().findIndex((m) =>
      (m.effects as { op: string }[]).some((e) => e.op === 'foe_gimmick'),
    );
    expect(() =>
      loadDungeon(
        foes(),
        mods().map((m, i) =>
          i === modIndex
            ? {
                ...m,
                effects: (m.effects as { op: string; gimmick?: unknown }[]).map((e) =>
                  e.op === 'foe_gimmick' ? { ...e, gimmick: withRank(e.gimmick) } : e,
                ),
              }
            : m,
        ),
        rooms,
      ),
    ).toThrow(/fromRank/);
  });

  it('rejects unknown keys, bad ids, duplicates and too little content', () => {
    const cases: [string, () => unknown][] = [
      [
        'an unknown foe key',
        () =>
          loadDungeon(
            foes().map((f, i) => (i === 0 ? { ...f, extra: 1 } : f)),
            mods(),
            rooms,
          ),
      ],
      [
        'a foe with 0 rounds',
        () =>
          loadDungeon(
            foes().map((f, i) => (i === 0 ? { ...f, rounds: 0 } : f)),
            mods(),
            rooms,
          ),
      ],
      [
        'a foe with too many rounds',
        () =>
          loadDungeon(
            foes().map((f, i) => (i === 0 ? { ...f, rounds: 13 } : f)),
            mods(),
            rooms,
          ),
      ],
      [
        'a foe id that is not kebab-case',
        () =>
          loadDungeon(
            foes().map((f, i) => (i === 0 ? { ...f, id: 'Bad Id' } : f)),
            mods(),
            rooms,
          ),
      ],
      [
        'an unknown kind',
        () =>
          loadDungeon(
            foes().map((f, i) => (i === 0 ? { ...f, kind: 'king' } : f)),
            mods(),
            rooms,
          ),
      ],
      [
        'a duplicate foe id',
        () =>
          loadDungeon(
            foes().map((f, i) => (i === 1 ? { ...f, id: 'puddle-imp' } : f)),
            mods(),
            rooms,
          ),
      ],
      [
        'an unknown modifier effect',
        () =>
          loadDungeon(
            foes(),
            mods().map((m, i) => (i === 0 ? { ...m, effects: [{ op: 'heal', bp: 1 }] } : m)),
            rooms,
          ),
      ],
      [
        "a turn order on a foe (the order is the dungeon's rule, not content)",
        () =>
          loadDungeon(
            foes().map((f, i) => (i === 0 ? { ...f, turnOrder: 'speed' } : f)),
            mods(),
            rooms,
          ),
      ],
      [
        'a modifier that changes the turn order',
        () =>
          loadDungeon(
            foes(),
            mods().map((m, i) =>
              i === 0 ? { ...m, effects: [{ op: 'turn_order', order: 'left_to_right' }] } : m,
            ),
            rooms,
          ),
      ],
      [
        'a modifier with no effect',
        () =>
          loadDungeon(
            foes(),
            mods().map((m, i) => (i === 0 ? { ...m, effects: [] } : m)),
            rooms,
          ),
      ],
      [
        'the same effect twice',
        () =>
          loadDungeon(
            foes(),
            mods().map((m, i) =>
              i === 0
                ? {
                    ...m,
                    effects: [
                      { op: 'foe_stat', stat: 'hp', bp: 1 },
                      { op: 'foe_stat', stat: 'hp', bp: 2 },
                    ],
                  }
                : m,
            ),
            rooms,
          ),
      ],
      [
        'no room boss',
        () =>
          loadDungeon(
            foes().filter((f) => f['kind'] !== 'boss'),
            mods(),
            rooms,
          ),
      ],
      [
        'too few normal foes',
        () =>
          loadDungeon(
            foes().filter((f) => f['kind'] !== 'foe' || f['id'] === 'puddle-imp'),
            mods(),
            rooms,
          ),
      ],
      ['too few modifiers', () => loadDungeon(foes(), mods().slice(0, rooms - 1), rooms)],
      [
        'a foe gimmick with an unknown op',
        () =>
          loadDungeon(
            foes().map((f, i) =>
              i === 0
                ? { ...f, gimmicks: [{ id: 'x', name: 'X', trigger: { every: 2 }, op: 'nuke' }] }
                : f,
            ),
            mods(),
            rooms,
          ),
      ],
    ];
    for (const [name, load] of cases) expect(load, name).toThrow(/Invalid dungeon/);
  });
});

describe('depth scaling', () => {
  const d = RULES.dungeon;

  it('starts at the base numbers and adds a step and a curve for every depth above 1, integers only', () => {
    expect(depthFactorBp(1, d.hpStepBp, d.hpCurveBp)).toBe(10_000);
    expect(depthFactorBp(2, d.hpStepBp, d.hpCurveBp)).toBe(10_000 + d.hpStepBp + d.hpCurveBp);
    let previous = 10_000;
    for (let depth = 2; depth <= d.maxScaledDepth; depth++) {
      const n = depth - 1;
      const factor = depthFactorBp(depth, d.hpStepBp, d.hpCurveBp);
      expect(Number.isInteger(factor)).toBe(true);
      expect(factor).toBe(10_000 + d.hpStepBp * n + d.hpCurveBp * n * n);
      expect(factor).toBeGreaterThan(previous);
      previous = factor;
    }
    // With no curve the foes grow in a straight line.
    expect(depthFactorBp(11, 3_000)).toBe(40_000);
    // Depths below 1 and past the cap are clamped.
    expect(depthFactorBp(0, 1_000)).toBe(10_000);
    expect(depthFactorBp(10_000, 1_000, 10)).toBe(depthFactorBp(d.maxScaledDepth, 1_000, 10));
  });

  it('starts gently: the first depths add less than the later ones do', () => {
    const f = (depth: number): number => depthFactorBp(depth, d.hpStepBp, d.hpCurveBp);
    expect(f(3) - f(2)).toBeLessThan(f(12) - f(11));
    // And the second depth is no more than 1.5 times the first: new players can follow it.
    expect(f(2)).toBeLessThanOrEqual(15_000);
  });

  it('scales a foe by the base strength and the depth factors, never below 1', () => {
    const foe = { baseHp: 300, baseAtk: 12 };
    const at = (depth: number) => scaledFoe(foe, depth);
    const hp = (depth: number): number =>
      Math.floor(
        (Math.floor((300 * d.baseHpBp) / 10_000) * depthFactorBp(depth, d.hpStepBp, d.hpCurveBp)) /
          10_000,
      );
    const atk = (depth: number): number =>
      Math.floor(
        (Math.floor((12 * d.baseAtkBp) / 10_000) *
          depthFactorBp(depth, d.atkStepBp, d.atkCurveBp)) /
          10_000,
      );
    for (const depth of [1, 2, 5, 12, 30, 80]) {
      expect(at(depth)).toEqual({ hp: hp(depth), atk: atk(depth) });
    }
    expect(at(1)).toEqual({ hp: Math.floor((300 * d.baseHpBp) / 10_000), atk: 12 });
    expect(scaledFoe({ baseHp: 1, baseAtk: 1 }, 1)).toEqual({ hp: 1, atk: 1 });
    let previous = 0;
    for (let depth = 1; depth <= 30; depth++) {
      const next = at(depth).hp;
      expect(next).toBeGreaterThanOrEqual(previous);
      previous = next;
    }
  });

  it('makes every 7th depth a landmark', () => {
    expect([1, 6, 7, 8, 13, 14, 21].map(isLandmark)).toEqual([
      false,
      false,
      true,
      false,
      false,
      true,
      true,
    ]);
    expect(isLandmark(0)).toBe(false);
    expect(isLandmark(-7)).toBe(false);
    expect(isLandmark(7.5)).toBe(false);
    expect(RULES.dungeon.landmarkEvery).toBe(7);
  });
});

describe('the day and its rooms', () => {
  it('rolls as many different modifiers as there are rooms, the same for the same seed', () => {
    const a = rollDayModifiers(createSeededRng('day-1'));
    expect(a).toHaveLength(rooms);
    expect(new Set(a).size).toBe(rooms);
    for (const id of a) expect(roomModifier(id)).toBeDefined();
    expect(rollDayModifiers(createSeededRng('day-1'))).toEqual(a);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      for (const id of rollDayModifiers(createSeededRng(`day-${String(i)}`))) seen.add(id);
    }
    expect(seen.size).toBe(dungeonContent.modifiers.length);
  });

  it('fills the rooms with different normal foes and then a room boss, with the day modifiers', () => {
    const modifiers = rollDayModifiers(createSeededRng('mods'));
    for (let i = 0; i < 30; i++) {
      const plan = rollRooms(createSeededRng(`run-${String(i)}`), modifiers, 1);
      expect(plan).toHaveLength(rooms);
      expect(plan.map((p) => p.index)).toEqual([0, 1, 2]);
      expect(plan.map((p) => p.kind)).toEqual(['foe', 'foe', 'boss']);
      expect(new Set(plan.map((p) => p.foeId)).size).toBe(rooms);
      expect(plan.map((p) => p.modifierId)).toEqual(modifiers);
      for (const room of plan) expect(roomPlanValid(room)).toBe(true);
    }
    expect(rollRooms(createSeededRng('same'), modifiers, 3)).toEqual(
      rollRooms(createSeededRng('same'), modifiers, 3),
    );
    const foeSets = new Set<string>();
    for (let i = 0; i < 30; i++) {
      foeSets.add(
        rollRooms(createSeededRng(`vary-${String(i)}`), modifiers, 1)
          .map((p) => p.foeId)
          .join(','),
      );
    }
    expect(foeSets.size).toBeGreaterThan(5);
  });

  it('keeps the draw of every non-landmark day exactly as it was', () => {
    // The rooms as `rollRooms` drew them before landmarks: shuffle the normal foes, then one boss die.
    const legacy = (seed: string, modifiers: readonly string[]): string[] => {
      const rng = createSeededRng(seed);
      const normal = dungeonContent.foes.filter((f) => f.kind === 'foe');
      for (let i = normal.length - 1; i > 0; i--) {
        const j = int(rng, i + 1);
        [normal[i], normal[j]] = [normal[j]!, normal[i]!];
      }
      const bosses = dungeonContent.foes.filter((f) => f.kind === 'boss');
      const boss = bosses[int(rng, bosses.length)]!;
      return [normal[0]!.id, normal[1]!.id, boss.id].slice(0, modifiers.length);
    };
    const modifiers = rollDayModifiers(createSeededRng('mods'));
    for (let i = 0; i < 40; i++) {
      const seed = `legacy-${String(i)}`;
      for (const depth of [1, 2, 6, 8, 13, 15]) {
        expect(isLandmark(depth)).toBe(false);
        expect(rollRooms(createSeededRng(seed), modifiers, depth).map((p) => p.foeId)).toEqual(
          legacy(seed, modifiers),
        );
      }
    }
  });

  it('fixes the room boss of a landmark depth, in content order and round again', () => {
    const bosses = dungeonContent.foes.filter((f) => f.kind === 'boss').map((f) => f.id);
    const every = RULES.dungeon.landmarkEvery;
    const modifiers = rollDayModifiers(createSeededRng('mods'));
    expect(landmarkBossId(every)).toBe(bosses[0]);
    expect(landmarkBossId(2 * every)).toBe(bosses[1]);
    expect(landmarkBossId((bosses.length + 1) * every)).toBe(bosses[0]);
    expect(landmarkBossId(every + 1)).toBeNull();
    expect(landmarkBossId(0)).toBeNull();
    for (let k = 1; k <= bosses.length * 2 + 1; k++) {
      const expected = bosses[(k - 1) % bosses.length];
      expect(landmarkBossId(k * every)).toBe(expected);
      // Whatever the seed, the landmark's boss room is that boss; the other rooms are still drawn.
      for (let i = 0; i < 10; i++) {
        const plan = rollRooms(
          createSeededRng(`lm-${String(k)}-${String(i)}`),
          modifiers,
          k * every,
        );
        expect(plan[rooms - 1]?.foeId).toBe(expected);
        expect(plan.map((p) => p.kind)).toEqual(['foe', 'foe', 'boss']);
        expect(plan.map((p) => p.foeId).slice(0, 2)).toEqual(
          rollRooms(createSeededRng(`lm-${String(k)}-${String(i)}`), modifiers, 1)
            .map((p) => p.foeId)
            .slice(0, 2),
        );
      }
    }
  });

  it('needs a modifier for every room, and notices a plan with an unknown id', () => {
    expect(() => rollRooms(createSeededRng('x'), ['flooded'], 1)).toThrow(RangeError);
    expect(roomPlanValid({ index: 0, kind: 'foe', foeId: 'nobody', modifierId: 'flooded' })).toBe(
      false,
    );
    expect(roomPlanValid({ index: 0, kind: 'foe', foeId: 'puddle-imp', modifierId: 'no' })).toBe(
      false,
    );
  });
});

describe('rewards', () => {
  const per = RULES.dungeon.perRoom;

  it('has a reward for every room', () => {
    expect(per).toHaveLength(rooms);
  });

  it('pays for each room that was cleared and nothing for the others', () => {
    expect(dungeonPayout(1, 0)).toMatchObject({ bait: 0, essence: 0, scrap: 0, glimmer: 0 });
    const one = dungeonPayout(1, 1);
    expect(one).toMatchObject({
      bait: per[0]?.bait,
      essence: per[0]?.essence,
      scrap: per[0]?.scrap,
    });
    expect(one.fullClear).toBe(false);
    const two = dungeonPayout(1, 2);
    expect(two.bait).toBe((per[0]?.bait ?? 0) + (per[1]?.bait ?? 0));
    expect(two.bossCleared).toBe(false);
  });

  it('adds the full clear, and the landmark extra only for a full clear of a landmark', () => {
    const sum = (key: 'bait' | 'essence' | 'scrap'): number => per.reduce((n, r) => n + r[key], 0);
    const full = dungeonPayout(1, rooms);
    expect(full.fullClear).toBe(true);
    expect(full.bossCleared).toBe(true);
    expect(full.landmark).toBe(false);
    expect(full.bait).toBe(sum('bait'));
    expect(full.essence).toBe(sum('essence') + RULES.dungeon.fullClear.essence);
    expect(full.scrap).toBe(sum('scrap'));
    const landmark = dungeonPayout(7, rooms);
    expect(landmark.landmark).toBe(true);
    expect(landmark.essence).toBe(full.essence + RULES.dungeon.landmark.essence);
    expect(landmark.scrap).toBe(full.scrap + RULES.dungeon.landmark.scrap);
    expect(landmark.glimmer).toBe(RULES.dungeon.landmark.glimmer);
    // A lost landmark pays only its rooms.
    expect(dungeonPayout(7, rooms - 1).landmark).toBe(false);
    expect(dungeonPayout(7, rooms - 1).glimmer).toBe(0);
    // More rooms than exist, or fractions, are clamped.
    expect(dungeonPayout(1, 99)).toEqual(full);
    expect(dungeonPayout(1, 1.9)).toEqual(one());
    function one() {
      return dungeonPayout(1, 1);
    }
  });

  it('pays streak bonuses on the 3rd and 7th day of a 7-day cycle, and counts again after that', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 15, 17].map(streakCycleDay)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 1, 2, 3, 7, 1, 3,
    ]);
    const days = [1, 2, 3, 4, 5, 6, 7, 8, 10, 14].map((s) => streakBonus(s)?.day ?? 0);
    expect(days).toEqual([0, 0, 3, 0, 0, 0, 7, 0, 3, 7]);
    const third = streakBonus(3);
    expect(third).toMatchObject({ bait: RULES.dungeon.streak.bonuses[0]?.bait });
    // The bonus is a copy: changing it never changes the rules.
    if (third !== null) third.bait = 999;
    expect(streakBonus(3)?.bait).toBe(RULES.dungeon.streak.bonuses[0]?.bait);
  });

  it('has gear odds that grow with depth, stop at their caps and add up to 100%', () => {
    for (const landmark of [false, true]) {
      let previousRare = 0;
      for (let depth = 1; depth <= 80; depth++) {
        const odds = dungeonGearOddsBp(depth, landmark);
        expect(odds.rare + odds.epic + odds.common).toBe(10_000);
        expect(odds.common).toBeGreaterThanOrEqual(0);
        expect(odds.rare).toBeGreaterThanOrEqual(previousRare);
        previousRare = odds.rare;
        const caps = RULES.dungeon.gearOdds;
        const bonus = landmark ? caps.landmarkBonusBp : { rare: 0, epic: 0 };
        expect(odds.rare).toBeLessThanOrEqual(caps.maxBp.rare + bonus.rare);
        expect(odds.epic).toBeLessThanOrEqual(caps.maxBp.epic + bonus.epic);
      }
    }
    const base = dungeonGearOddsBp(1, false);
    expect(base.rare).toBe(RULES.dungeon.gearOdds.baseBp.rare);
    expect(dungeonGearOddsBp(1, true).rare).toBeGreaterThan(base.rare);
  });

  it('rolls loot deterministically and in a fixed order', () => {
    const full = { landmark: false, fullClear: true, bossCleared: true, supplies: 0 } as const;
    const a = rollDungeonLoot(createSeededRng('loot'), 3, full, 'ember');
    const b = rollDungeonLoot(createSeededRng('loot'), 3, full, 'ember');
    expect(b).toEqual(a);
    // A run that cleared no boss rolls no shard and no gear, and draws nothing.
    let draws = 0;
    const counting = { nextU32: () => (draws += 1) };
    const none = rollDungeonLoot(
      counting,
      3,
      { landmark: false, fullClear: false, bossCleared: false, supplies: 0 },
      'tide',
    );
    expect(none).toEqual({ parts: {}, gear: [], supplies: [] });
    expect(draws).toBe(0);
  });

  it('always drops gear on a landmark, sometimes on other full clears, and a shard of the boss element', () => {
    const landmark = { landmark: true, fullClear: true, bossCleared: true, supplies: 0 } as const;
    for (let i = 0; i < 40; i++) {
      const loot = rollDungeonLoot(createSeededRng(`lm-${String(i)}`), 7, landmark, 'grove');
      expect(loot.gear).toHaveLength(1);
      expect(Object.keys(loot.parts).every((k) => k === 'grove-shard')).toBe(true);
    }
    let drops = 0;
    let shards = 0;
    const runs = 600;
    for (let i = 0; i < runs; i++) {
      const loot = rollDungeonLoot(
        createSeededRng(`nm-${String(i)}`),
        1,
        { landmark: false, fullClear: true, bossCleared: true, supplies: 0 },
        'spark',
      );
      drops += loot.gear.length;
      shards += loot.parts['spark-shard'] ?? 0;
    }
    expect(drops / runs).toBeGreaterThan(RULES.dungeon.fullClear.gearBp / 10_000 - 0.06);
    expect(drops / runs).toBeLessThan(RULES.dungeon.fullClear.gearBp / 10_000 + 0.06);
    expect(shards / runs).toBeGreaterThan(RULES.dungeon.bossShardBp / 10_000 - 0.08);
    expect(shards / runs).toBeLessThan(RULES.dungeon.bossShardBp / 10_000 + 0.08);
  });
});

describe('supplies from the dungeon', () => {
  const per = RULES.dungeon.perRoom;
  const tiers = RULES.dungeon.supplyTiers;

  it('pays the supplies of the rooms that were cleared, and none for a room that was not', () => {
    expect(dungeonPayout(1, 0).supplies).toBe(0);
    let expected = 0;
    for (let cleared = 1; cleared <= rooms; cleared++) {
      expected += per[cleared - 1]?.supply ?? 0;
      expect(dungeonPayout(1, cleared).supplies, `${String(cleared)} rooms`).toBe(expected);
    }
    // A landmark pays its extra, never an extra supply.
    expect(dungeonPayout(7, rooms).supplies).toBe(dungeonPayout(1, rooms).supplies);
    // The shipped rule (B-011): the first room pays the supply, so a lost run that got past it keeps it.
    expect(dungeonPayout(5, 1).supplies).toBe(1);
    expect(dungeonPayout(5, 0).supplies).toBe(0);
  });

  it('has tier odds that are basic only above the open depths, grow with depth, stop at their caps and add up to 100%', () => {
    let previousGood = 0;
    let previousGreat = 0;
    for (let depth = 1; depth <= 80; depth++) {
      const odds = dungeonSupplyOddsBp(depth);
      expect(odds.basic + odds.good + odds.great, `depth ${String(depth)}`).toBe(10_000);
      expect(odds.basic).toBeGreaterThanOrEqual(0);
      expect(odds.good).toBeGreaterThanOrEqual(depth < tiers.good.fromDepth ? 0 : previousGood);
      expect(odds.great).toBeGreaterThanOrEqual(previousGreat);
      expect(odds.good).toBeLessThanOrEqual(tiers.good.maxBp);
      expect(odds.great).toBeLessThanOrEqual(tiers.great.maxBp);
      if (depth < tiers.good.fromDepth) expect(odds.good).toBe(0);
      if (depth < tiers.great.fromDepth) expect(odds.great).toBe(0);
      previousGood = odds.good;
      previousGreat = odds.great;
    }
    // The first depth is plain basic; a tier opens at its depth with its base odds.
    expect(dungeonSupplyOddsBp(1)).toEqual({ basic: 10_000, good: 0, great: 0 });
    expect(dungeonSupplyOddsBp(tiers.good.fromDepth).good).toBe(tiers.good.baseBp);
    expect(dungeonSupplyOddsBp(tiers.good.fromDepth - 1).good).toBe(0);
    expect(dungeonSupplyOddsBp(tiers.great.fromDepth).great).toBe(tiers.great.baseBp);
    expect(dungeonSupplyOddsBp(tiers.great.fromDepth - 1).great).toBe(0);
    // Deeper really is better: more of the good tiers and less basic.
    expect(dungeonSupplyOddsBp(20).basic).toBeLessThan(dungeonSupplyOddsBp(5).basic);
    expect(dungeonSupplyOddsBp(80)).toEqual({
      basic: 10_000 - tiers.good.maxBp - tiers.great.maxBp,
      good: tiers.good.maxBp,
      great: tiers.great.maxBp,
    });
  });

  it('rolls a supply of the content, in the odds of its depth, with every kind but the lure coming up', () => {
    const kinds = new Set<string>();
    const count = { basic: 0, good: 0, great: 0 };
    const runs = 4_000;
    const depth = 20;
    for (let i = 0; i < runs; i++) {
      const id = rollDungeonSupply(createSeededRng(`supply-${String(i)}`), depth);
      const def = supplyDef(id);
      expect(def, id).toBeDefined();
      if (def === undefined) continue;
      kinds.add(def.kind);
      count[def.tier] += 1;
    }
    // A lure is made from Bait in the Workshop and never dropped.
    expect([...kinds].sort()).toEqual(['lantern', 'map-scrap', 'satchel']);
    const odds = dungeonSupplyOddsBp(depth);
    for (const tier of ['basic', 'good', 'great'] as const) {
      expect(count[tier] / runs, tier).toBeGreaterThan(odds[tier] / 10_000 - 0.04);
      expect(count[tier] / runs, tier).toBeLessThan(odds[tier] / 10_000 + 0.04);
    }
    // Early on only basic ones drop.
    for (let i = 0; i < 100; i++) {
      const id = rollDungeonSupply(createSeededRng(`early-${String(i)}`), 1);
      expect(supplyDef(id)?.tier).toBe('basic');
    }
  });

  it('adds the supplies last, so the gear and shard dice are drawn as they were', () => {
    const full = { landmark: false, fullClear: true, bossCleared: true } as const;
    for (let i = 0; i < 40; i++) {
      const seed = `order-${String(i)}`;
      const without = rollDungeonLoot(createSeededRng(seed), 8, { ...full, supplies: 0 }, 'tide');
      const withSupply = rollDungeonLoot(
        createSeededRng(seed),
        8,
        { ...full, supplies: 2 },
        'tide',
      );
      expect(withSupply.parts).toEqual(without.parts);
      expect(withSupply.gear).toEqual(without.gear);
      expect(without.supplies).toEqual([]);
      expect(withSupply.supplies).toHaveLength(2);
      for (const id of withSupply.supplies) expect(supplyDef(id)).toBeDefined();
    }
  });

  it('draws nothing for a run that paid no supply, and one supply roll (tier, kind) for one', () => {
    let draws = 0;
    const counting = { nextU32: () => (draws += 1) };
    rollDungeonLoot(
      counting,
      3,
      { landmark: false, fullClear: false, bossCleared: false, supplies: 0 },
      'tide',
    );
    expect(draws).toBe(0);
    const id = rollDungeonLoot(
      createSeededRng('one'),
      3,
      { landmark: false, fullClear: false, bossCleared: false, supplies: 1 },
      'tide',
    ).supplies;
    expect(id).toHaveLength(1);
  });
});

describe('the order of a team in the row', () => {
  // One element for everyone: nobody can cash anybody in, so only the roles decide the order.
  const mk = (id: string, role: Role, element: Element = 'tide') => ({ id, role, element });

  it('puts setters and supports left, a Guard in the middle and payoffs right', () => {
    const order = dungeonRowOrder([mk('p', 'payoff'), mk('g', 'guard'), mk('s', 'setter')]);
    expect(order.map((c) => c.id)).toEqual(['s', 'g', 'p']);
    const withSupport = dungeonRowOrder([mk('g', 'guard'), mk('u', 'support'), mk('p', 'payoff')]);
    expect(withSupport.map((c) => c.id)).toEqual(['u', 'g', 'p']);
  });

  it('keeps the order given among creatures that stand in the same place', () => {
    const order = dungeonRowOrder([mk('a', 'setter'), mk('b', 'support'), mk('c', 'setter')]);
    expect(order.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    const guards = dungeonRowOrder([mk('x', 'payoff'), mk('y', 'payoff'), mk('z', 'payoff')]);
    expect(guards.map((c) => c.id)).toEqual(['x', 'y', 'z']);
  });

  it('does not change what it is given, and returns every creature once', () => {
    const input = [mk('p', 'payoff'), mk('g', 'guard'), mk('s', 'setter')];
    const before = JSON.stringify(input);
    const order = dungeonRowOrder(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(new Set(order.map((c) => c.id))).toEqual(new Set(['p', 'g', 's']));
    expect(dungeonRowOrder([])).toEqual([]);
  });
});

describe('the order of a team decides whether reactions happen', () => {
  const species = (id: string) => {
    const found = content.creatures.find((c) => c.id === id);
    if (found === undefined) throw new Error(`no species ${id}`);
    return { id, role: found.role, element: found.element };
  };
  const splashet = species('splashet'); // Tide setter
  const sproutle = species('sproutle'); // Grove guard
  const cindle = species('cindle'); // Ember payoff

  it('scores a row by the reactions the left-to-right marks set off', () => {
    // Soaked is cashed in by Spark, and nobody here has Spark: Tide marks and it stays.
    expect(rowScore([splashet, sproutle, cindle])).toBe(0);
    expect(rowReactions([splashet, sproutle, cindle])).toEqual([]);
    // Cindle marks Scorched and Splashet (Tide) sets off Steam, in every round.
    const reacting = rowReactions([cindle, sproutle, splashet]);
    expect(reacting).toHaveLength(6);
    expect(reacting[0]).toEqual({ round: 1, marker: 0, payoff: 2, reaction: 'steam' });
    expect(new Set(reacting.map((r) => r.round)).size).toBe(6);
  });

  it('follows the engine: a mark stays until a Setter replaces it or its element cashes it in', () => {
    const guard = (element: Element) => ({ role: 'guard' as Role, element });
    const setter = (element: Element) => ({ role: 'setter' as Role, element });
    // A guard's mark is not replaced by another guard, so Ember stays and Tide never gets to mark.
    expect(rowScore([guard('ember'), guard('grove')])).toBe(0);
    // A Setter replaces it: Grove (set by the Setter) is cashed in by Ember, round after round.
    const replaced = rowReactions([guard('ember'), setter('grove')]);
    expect(replaced[0]).toEqual({ round: 2, marker: 1, payoff: 0, reaction: 'wildfire' });
    // The same element never replaces its own mark.
    expect(rowScore([setter('tide'), setter('tide')])).toBe(0);
  });

  it('picks, for the starters, the order that reacts every round, not the old role order', () => {
    // Role order alone (setter, guard, payoff) would be Splashet, Sproutle, Cindle: never a reaction.
    for (const given of [
      [splashet, sproutle, cindle],
      [cindle, splashet, sproutle],
      [sproutle, cindle, splashet],
    ]) {
      const best = dungeonRowOrder(given);
      expect(best.map((c) => c.id)).toEqual(['cindle', 'sproutle', 'splashet']);
      expect(rowScore(best)).toBe(6);
    }
  });

  it('never picks an order that scores less than another order of the same team', () => {
    const pool = content.creatures.slice(0, 14).map((c) => ({
      id: c.id,
      role: c.role,
      element: c.element,
    }));
    const perms = <T>(items: readonly T[]): T[][] =>
      items.length <= 1
        ? [[...items]]
        : items.flatMap((x, i) =>
            perms([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [x, ...rest]),
          );
    for (let a = 0; a < pool.length; a++) {
      for (let b = a + 1; b < pool.length; b++) {
        for (let c = b + 1; c < pool.length; c++) {
          const team = [pool[a], pool[b], pool[c]] as typeof pool;
          const best = rowScore(dungeonRowOrder(team));
          for (const order of perms(team)) expect(rowScore(order)).toBeLessThanOrEqual(best);
        }
      }
    }
  });

  it('falls back to the role order when every order scores the same, and keeps ties as given', () => {
    // No order reacts (all Tide): setter, guard, payoff by role.
    const tide = (id: string, role: Role) => ({ id, role, element: 'tide' as Element });
    const none = dungeonRowOrder([tide('p', 'payoff'), tide('g', 'guard'), tide('s', 'setter')]);
    expect(none.map((c) => c.id)).toEqual(['s', 'g', 'p']);
  });
});
