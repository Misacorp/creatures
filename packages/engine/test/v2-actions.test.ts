/**
 * Combat v2: the live finale's inputs (R18): Rally (every creature's hits, inside the hit-boost cap), Shield Wall (a row's creatures take
 * less, one cut among the others inside the 75% cap, before armour) and Purge (no Element or Reaction Resistance for two rounds). A fight with
 * none plays as before, and an action at round r leaves every event before round r as it was (the prefix property the live replay relies on).
 */
import {
  fightV2,
  startCarry,
  stageV2,
  type BoardEvent,
  type FightEvent,
  type FightResult,
  type FinaleAction,
  type FighterSpec,
  type FightOptions,
  type V2Rules,
} from '@creatures/engine/v2';
import { describe, expect, it } from 'vitest';
import {
  ELEMENTS,
  CHART,
  RULES,
  boardEvents,
  boss,
  by,
  input,
  move,
  scripted,
  seeded,
  spec,
  striker,
} from './v2-helpers';
import type { BossDef } from '@creatures/engine/v2';

const run = (
  b: BossDef,
  fighters: readonly FighterSpec[],
  actions: readonly FinaleAction[] | undefined,
  options: FightOptions = {},
  rules: V2Rules = RULES,
): FightResult =>
  fightV2(
    { ...input(b, fighters, options, { rules }), ...(actions ? { actions } : {}) },
    scripted().rng,
  );

const act = (kind: FinaleAction['kind'], round: number, row?: number): FinaleAction => ({
  round,
  kind,
  by: 'p1',
  ...(row === undefined ? {} : { row }),
});

/** What the creatures' hits on the boss did, round by round. */
const hitsOnBoss = (r: FightResult): number[] =>
  boardEvents(r).flatMap((b) => (b.type === 'hit' && b.to === null ? [b.damage] : []));
/** What the boss's hits did to creatures, in order. */
const hitsOnUs = (r: FightResult): number[] =>
  boardEvents(r).flatMap((b) => (b.type === 'hit' && b.from === null ? [b.damage] : []));

describe('the rules numbers', () => {
  it('Rally, Shield Wall and Purge are numbers of the rules, not literals', () => {
    expect(RULES.rallyBp).toBe(1_000);
    expect(RULES.shieldWallBp).toBe(5_000);
    expect(RULES.purgeRounds).toBe(2);
  });
});

describe('Rally', () => {
  const arena = boss({ rounds: 3, hp: 1_000_000 });

  it('every creature’s hits deal 10% more in its round only', () => {
    const r = run(arena, [spec()], [act('rally', 2)]);
    expect(hitsOnBoss(r)).toEqual([100, 110, 100]);
  });

  it('it follows the rules number', () => {
    const r = run(arena, [spec()], [act('rally', 1)], {}, { ...RULES, rallyBp: 2_500 });
    expect(hitsOnBoss(r)).toEqual([125, 100, 100]);
  });

  it('two Rallies in one round are one', () => {
    const r = run(arena, [spec()], [act('rally', 1), { ...act('rally', 1), by: 'p2' }]);
    expect(hitsOnBoss(r)).toEqual([110, 100, 100]);
  });

  it('it counts inside the hit-boost cap with every other hit boost', () => {
    // First Hit is +145% on its first hit: with the Rally the sum is 155%, and the cap is 150%.
    const fighter = spec({ fx: { firstHitBp: 14_500 } });
    expect(hitsOnBoss(run(arena, [fighter], []))[0]).toBe(245);
    expect(hitsOnBoss(run(arena, [fighter], [act('rally', 1)]))[0]).toBe(250);
    // With a lower boost the Rally adds its full 10%.
    expect(
      hitsOnBoss(run(arena, [spec({ fx: { firstHitBp: 5_000 } })], [act('rally', 1)]))[0],
    ).toBe(160);
  });
});

describe('Shield Wall', () => {
  /** A boss whose turn hits every creature, twice a round (a turn after each of its two rows). */
  const wave = (over: Partial<BossDef> = {}) =>
    boss({
      rows: 2,
      cols: 1,
      rounds: 2,
      atk: 400,
      plain: { pattern: { anchor: 'front', shape: 'all' }, powerBp: 10_000, hits: 1 },
      ...over,
    });
  const duo = (over0 = {}, over1 = {}) => [
    spec({ name: 'Front', maxHp: 10_000, ...over0 }),
    spec({ name: 'Back', row: 1, maxHp: 10_000, ...over1 }),
  ];
  const taken = (r: FightResult, name: string) => 10_000 - by(r, name).hp;

  it('the chosen row takes half from every hit that round, the other row and the other rounds take the whole', () => {
    const plain = run(wave(), duo(), []);
    const walled = run(wave(), duo(), [act('shieldWall', 1, 0)]);
    // Each round the boss hits twice; round 1 is walled in row 0 only.
    expect(taken(plain, 'Front')).toBe(4 * 400);
    expect(taken(walled, 'Front')).toBe(2 * 200 + 2 * 400);
    expect(taken(walled, 'Back')).toBe(taken(plain, 'Back'));
  });

  it('two rows can be walled in one round, and an action with no row does nothing', () => {
    const both = run(wave(), duo(), [act('shieldWall', 1, 0), act('shieldWall', 1, 1)]);
    expect(taken(both, 'Front')).toBe(2 * 200 + 2 * 400);
    expect(taken(both, 'Back')).toBe(2 * 200 + 2 * 400);
    const none = run(wave(), duo(), [act('shieldWall', 1)]);
    expect(none.fighters.map((f) => f.hp)).toEqual(
      run(wave(), duo(), []).fighters.map((f) => f.hp),
    );
  });

  it('it is one cut among the others, inside the 75% cap, and before armour', () => {
    // 400 aimed at the front row: Front-liner cuts 50% and the creature's own area cut 40%; the Wall's 50% would make 85%, the cap is 75%.
    const fx = { frontCutBp: 5_000, areaCutBp: 4_000 };
    const hit = (actions: FinaleAction[]) =>
      hitsOnUs(run(wave({ rounds: 1 }), duo({ fx }), actions))[0];
    expect(hit([])).toBe(120);
    expect(hit([act('shieldWall', 1, 0)])).toBe(100);
    // Before armour: 400 halved is 200, and 10 armour comes off that (not 195 from taking the armour first).
    expect(
      hitsOnUs(run(wave({ rounds: 1 }), duo({ baseArmour: 10 }), [act('shieldWall', 1, 0)]))[0],
    ).toBe(190);
  });

  it('a Guard’s intercept in the walled row is cut too', () => {
    const arena = striker({ cols: 2, rounds: 1, atk: 400 });
    const team = [
      spec({ name: 'A', maxHp: 10_000 }),
      spec({ name: 'G', role: 'guard', col: 1, maxHp: 10_000 }),
    ];
    const r = run(arena, team, [act('shieldWall', 1, 0)]);
    expect(by(r, 'G').hp).toBe(10_000 - 200);
  });
});

describe('Purge', () => {
  const arena = boss({ rounds: 4, hp: 1_000_000 });

  it('no Element Resistance for the round it is used and the next, then it comes back', () => {
    const resisted = (actions: FinaleAction[]) =>
      hitsOnBoss(run(arena, [spec()], actions, { resistElement: 'tide' }));
    expect(resisted([])).toEqual([75, 75, 75, 75]);
    expect(resisted([act('purge', 2)])).toEqual([75, 100, 100, 75]);
    expect(resisted([act('purge', 4)])).toEqual([75, 75, 75, 100]);
  });

  it('it follows the rules number', () => {
    const r = run(
      arena,
      [spec()],
      [act('purge', 1)],
      { resistElement: 'tide' },
      { ...RULES, purgeRounds: 3 },
    );
    expect(hitsOnBoss(r)).toEqual([100, 100, 100, 75]);
  });

  it('no Reaction Resistance either: the reaction’s bonus is whole again', () => {
    const team = [
      spec({ name: 'S' }),
      spec({ name: 'P', role: 'payoff', element: 'spark', col: 1 }),
    ];
    const cash = (actions: FinaleAction[]) =>
      boardEvents(
        run(boss({ cols: 2, rounds: 3, hp: 1_000_000 }), team, actions, { resistReaction: 'tide' }),
      ).flatMap((b) => (b.type === 'reaction' ? [b.bonus] : []));
    expect(cash([])).toEqual([50, 50, 50]);
    expect(cash([act('purge', 2)])).toEqual([50, 100, 100]);
  });
});

describe('the board shows the actions', () => {
  it('an action is an event at the start of its round, after the round’s own', () => {
    const r = run(boss({ rounds: 2 }), [spec()], [act('shieldWall', 2, 1), act('rally', 2)]);
    const at = r.events.flatMap((e) =>
      e.board?.type === 'action' || e.board?.type === 'round' ? [[e.round, e.board.type]] : [],
    );
    expect(at).toEqual([
      [1, 'round'],
      [2, 'round'],
      [2, 'action'],
      [2, 'action'],
    ]);
    const actions = boardEvents(r).filter(
      (b): b is Extract<BoardEvent, { type: 'action' }> => b.type === 'action',
    );
    expect(actions).toEqual([
      { type: 'action', kind: 'shieldWall', row: 1, by: 'p1' },
      { type: 'action', kind: 'rally', by: 'p1' },
    ]);
  });
});

describe('a fight with no actions plays as before', () => {
  const arena = (): BossDef =>
    boss({
      cols: 3,
      rows: 2,
      rounds: 6,
      hp: 3_000,
      atk: 90,
      moves: [move({ anchor: 'random', shape: 'scatter', n: 2 }, { id: 'meteors', every: 2 })],
      plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 10_000, hits: 1 },
    });
  const team = (): FighterSpec[] => [
    spec({ name: 'A', maxHp: 800, spd: 20 }),
    spec({ name: 'B', col: 1, role: 'payoff', element: 'spark', maxHp: 800 }),
    spec({ name: 'G', col: 2, role: 'guard', maxHp: 800 }),
    spec({ name: 'C', row: 1, maxHp: 800 }),
  ];
  const play = (actions?: readonly FinaleAction[]) =>
    fightV2(
      {
        ...input(arena(), team(), {}, { rules: RULES, elements: ELEMENTS, chart: CHART }),
        ...(actions ? { actions } : {}),
      },
      seeded('actions-none'),
    );

  it('an empty list, no list and actions after the fight ended are all the same fight', () => {
    const base = play();
    expect(play([])).toEqual(base);
    expect(play([act('rally', 99), act('shieldWall', 99, 0), act('purge', 99)])).toEqual(base);
    expect(base.events.length).toBeGreaterThan(20);
  });

  it('an action changes the fight from its round on', () => {
    expect(play([act('rally', 2)]).damage).toBeGreaterThan(play().damage);
  });
});

describe('the prefix property', () => {
  const arena = (): BossDef =>
    boss({
      cols: 3,
      rows: 2,
      rounds: 8,
      hp: 100_000,
      atk: 70,
      critChanceBp: 1_500,
      moves: [
        move({ anchor: 'random', shape: 'scatter', n: 2 }, { id: 'meteors', every: 2 }),
        move({ anchor: 'random', shape: 'randomRow' }, { id: 'sweep', every: 3, charged: true }),
      ],
      plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 10_000, hits: 1 },
      mods: { adaptsElement: true },
    });
  const team = (): FighterSpec[] => [
    spec({ name: 'A', maxHp: 3_000, spd: 20 }),
    spec({ name: 'B', col: 1, role: 'payoff', element: 'spark', maxHp: 3_000 }),
    spec({ name: 'G', col: 2, role: 'guard', maxHp: 3_000 }),
    spec({ name: 'C', row: 1, maxHp: 3_000 }),
    spec({ name: 'H', row: 1, col: 1, role: 'support', maxHp: 3_000 }),
  ];
  const events = (actions: readonly FinaleAction[], seed: string): FightEvent[] =>
    fightV2({ ...input(arena(), team(), { resistElement: 'tide' }), actions }, seeded(seed))
      .events as FightEvent[];

  const kinds = ['rally', 'shieldWall', 'purge'] as const;
  for (const kind of kinds)
    for (const round of [1, 2, 3, 5, 7])
      it(`${kind} at round ${round} leaves every earlier event as it was`, () => {
        for (const seed of ['p1', 'p2', 'p3']) {
          const base = events([], seed);
          const acted = events([act(kind, round, 1)], seed);
          const before = (e: FightEvent) => e.round < round;
          expect(acted.filter(before)).toEqual(base.filter(before));
          // And what comes after is a fight of its own (not asserted to differ for every kind and seed, only to exist).
          expect(acted.at(-1)?.board?.type).toBe('end');
        }
      });

  it('several actions leave the rounds before the first untouched', () => {
    const acts = [act('rally', 4), act('purge', 5), act('shieldWall', 6, 0)];
    const base = events([], 'multi');
    const acted = events(acts, 'multi');
    expect(acted.filter((e) => e.round < 4)).toEqual(base.filter((e) => e.round < 4));
  });

  it('a stage takes the actions too: the same as the fight, and the carry is unchanged by none', () => {
    const stage = (actions?: readonly FinaleAction[]) =>
      stageV2(
        { ...input(arena(), team(), {}, {}), ...(actions ? { actions } : {}) },
        startCarry(arena()),
        seeded('stage-actions'),
      );
    const base = stage();
    expect(stage([])).toEqual(base);
    expect(stage([act('rally', 1)]).result.damage).toBeGreaterThan(base.result.damage);
  });
});
