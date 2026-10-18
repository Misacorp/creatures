import { RULES, createSeededRng, type Gimmick, type WeatherSky } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  buildNames,
  buildRoomInput,
  describeEvent,
  firstOfEachRow,
  liveFightRules,
  simulateDungeon,
  simulateFight,
  skyFightFields,
  skyRunFields,
  type DungeonRoomSpec,
  type DungeonRunInput,
  type FightInput,
  type FightSlot,
} from '../src/index';
import { TEST_PACK, eventsOf, input, randomInput, run, slot } from './helpers';
import { rowOf } from './pattern-helpers';

/**
 * The three hooks of the weather that are not a sheet number: Kind Rain (`rainHealBp`), Morning Haze
 * (`skipFirstTurn`) and Bramble Season (`brambleBp`). Absent means exactly the old fight.
 */

const PLAIN: WeatherSky = { rainHealBp: 0, haze: false, brambleBp: 0 };

describe('absent fields: a fight without them is exactly the old fight', () => {
  it('empty, zero and absent hooks replay byte for byte, with and without luck and rules', () => {
    for (let i = 0; i < 12; i++) {
      const base = randomInput(
        `sky-none-${String(i)}`,
        1 + (i % 5),
        i % 2 === 0 ? 'finale' : 'phase1',
      );
      const variants: FightInput[] = [
        base,
        { ...base, rules: liveFightRules(), luck: RULES.combat.luck },
      ];
      for (const v of variants) {
        const expected = JSON.stringify(simulateFight(v, createSeededRng('same')));
        for (const extra of [
          {},
          { skipFirstTurn: [] },
          { rainHealBp: 0, brambleBp: 0 },
          { rainHealBp: 0, brambleBp: 0, skipFirstTurn: [] },
        ] satisfies Partial<FightInput>[]) {
          const out = simulateFight({ ...v, ...extra }, createSeededRng('same'));
          expect(JSON.stringify(out)).toBe(expected);
        }
      }
    }
  });

  it('a plain day adds no field to a fight or a run', () => {
    expect(skyFightFields(PLAIN, rowOf(9))).toEqual({});
    expect(skyRunFields(PLAIN)).toEqual({});
  });

  it("the day's fields appear only when the day has them", () => {
    const row = rowOf(9);
    expect(skyFightFields({ rainHealBp: 200, haze: true, brambleBp: 3_000 }, row)).toEqual({
      rainHealBp: 200,
      skipFirstTurn: ['s0', 's3', 's6'],
      brambleBp: 3_000,
    });
    expect(skyRunFields({ rainHealBp: 250, haze: true, brambleBp: 4_500 })).toEqual({
      rainHealBp: 250,
      hazeLeft: true,
      brambleBp: 4_500,
    });
  });

  it('refuses numbers outside their range and creatures that are not in the row', () => {
    const base = input([slot('a')]);
    const play = (extra: Partial<FightInput>) => () =>
      simulateFight({ ...base, ...extra }, createSeededRng('x'));
    expect(play({ rainHealBp: -1 })).toThrow(/rainHealBp/);
    expect(play({ rainHealBp: 10_001 })).toThrow(/rainHealBp/);
    expect(play({ rainHealBp: 1.5 })).toThrow(/rainHealBp/);
    expect(play({ brambleBp: 10_001 })).toThrow(/brambleBp/);
    expect(play({ skipFirstTurn: ['nobody'] })).toThrow(/nobody/);
  });
});

describe('Kind Rain (rainHealBp)', () => {
  /** A creature of 1000 max HP that starts at `hp`; the boss's plain attack deals 1. */
  const hurtSlot = (
    id: string,
    hp: number,
    extra: Parameters<typeof slot>[1] = {},
    over: Partial<FightSlot> = {},
  ): FightSlot => ({ ...slot(id, { hp: 1_000, atk: 1, ...extra }), hp, ...over });

  it('heals every living creature a share of its max HP at round start, never above its max', () => {
    const r = run([hurtSlot('a', 500), hurtSlot('b', 995), hurtSlot('c', 1_000)], {
      rainHealBp: 200,
    });
    const rain = eventsOf(r, 'sky_heal');
    // 2% of 1000 is 20; b is 5 short of full so it gets 5; c is at full and is not named.
    expect(rain[0]).toEqual({
      t: 'sky_heal',
      round: 1,
      heals: [
        { creature: 'a', amount: 20 },
        { creature: 'b', amount: 5 },
      ],
    });
    for (const e of rain) for (const h of e.heals) expect(h.amount).toBeGreaterThan(0);
    for (const id of ['a', 'b', 'c']) {
      expect(r.hpEnd[id] as number).toBeLessThanOrEqual(r.hpMax[id] as number);
    }
  });

  it('comes after the Supports act and before any creature acts, once a round', () => {
    const r = run([hurtSlot('s', 500, { role: 'support', element: 'grove' }), hurtSlot('t', 500)], {
      rainHealBp: 200,
      rules: liveFightRules(),
    });
    const kinds = r.events.filter((e) => 'round' in e && e.round === 1).map((e) => e.t);
    expect(kinds.indexOf('support_buff')).toBeLessThan(kinds.indexOf('sky_heal'));
    expect(kinds.indexOf('sky_heal')).toBeLessThan(kinds.indexOf('turn'));
    expect(kinds.filter((k) => k === 'sky_heal')).toHaveLength(1);
    // A Mend came first, so the rain gives only what is still missing: never above max HP.
    expect(r.hpEnd['t'] as number).toBeLessThanOrEqual(r.hpMax['t'] as number);
  });

  it('never revives a knocked-out creature', () => {
    const r = run([hurtSlot('down', 0), hurtSlot('up', 500)], { rainHealBp: 500 });
    expect(r.hpEnd['down']).toBe(0);
    for (const e of eventsOf(r, 'sky_heal')) {
      expect(e.heals.some((h) => h.creature === 'down')).toBe(false);
    }
  });

  it("is changed by the creature's own healing line, like a Mend", () => {
    const weak = run(
      [hurtSlot('a', 500, {}, { mods: { healReceivedBp: -2_500 } }), hurtSlot('b', 500)],
      { rainHealBp: 200 },
    );
    expect(eventsOf(weak, 'sky_heal')[0]?.heals).toEqual([
      { creature: 'a', amount: 15 },
      { creature: 'b', amount: 20 },
    ]);
    const strong = run([hurtSlot('a', 500, {}, { mods: { healReceivedBp: 5_000 } })], {
      rainHealBp: 200,
    });
    expect(eventsOf(strong, 'sky_heal')[0]?.heals).toEqual([{ creature: 'a', amount: 30 }]);
  });

  it('draws no die and moves none: the fight is the same but for the healing', () => {
    // Hurt creatures: the same dice, so the same hits.
    const hurtRow = () => [hurtSlot('a', 500), hurtSlot('b', 500)];
    const play = (extra: Partial<FightInput>) =>
      simulateFight(
        input(hurtRow(), { luck: RULES.combat.luck, bossAtk: 30, ...extra }),
        createSeededRng('rain-dice'),
        { pack: TEST_PACK },
      );
    const strip = (r: ReturnType<typeof play>) =>
      r.events.filter((e) => e.t === 'hit').map((e) => [e.round, e.creature, e.damage]);
    expect(strip(play({ rainHealBp: 300 }))).toEqual(strip(play({})));
  });

  it('also rains in enrage rounds', () => {
    const r = run([hurtSlot('a', 500)], {
      rainHealBp: 200,
      phase: 'finale',
      enrage: { rounds: 2, powerBp: 100 },
      bossHpPool: { max: 1_000_000_000, current: 1_000_000_000 },
    });
    const enraged = eventsOf(r, 'enrage').map((e) => e.round);
    expect(enraged.length).toBeGreaterThan(0);
    const rainRounds = eventsOf(r, 'sky_heal').map((e) => e.round);
    expect(rainRounds).toContain(Math.max(...enraged));
  });

  it('is told in plain words', () => {
    const r = run([hurtSlot('a', 500), hurtSlot('b', 500)], { rainHealBp: 200 });
    const names = buildNames(input([hurtSlot('a', 500), hurtSlot('b', 500)]));
    expect(describeEvent(eventsOf(r, 'sky_heal')[0] as never, names)).toBe(
      'Kind Rain mends a (+20 HP) and b (+20 HP).',
    );
  });
});

describe('Morning Haze (skipFirstTurn)', () => {
  it('firstOfEachRow takes the leftmost of each zone that has anyone', () => {
    expect(firstOfEachRow(rowOf(9))).toEqual(['s0', 's3', 's6']);
    expect(firstOfEachRow(rowOf(7))).toEqual(['s0', 's2', 's5']);
    expect(firstOfEachRow(rowOf(3))).toEqual(['s0', 's1', 's2']);
    // A row of one or two is all Middle: one creature.
    expect(firstOfEachRow(rowOf(2))).toEqual(['s0']);
    expect(firstOfEachRow(rowOf(1))).toEqual(['s0']);
    expect(firstOfEachRow([])).toEqual([]);
  });

  it('the named creatures skip their first turn only, with a skip event and no hit', () => {
    const r = run(rowOf(9), { skipFirstTurn: ['s0', 's3', 's6'] });
    const skips = eventsOf(r, 'skip');
    expect(skips.map((e) => [e.round, e.creature, e.reason])).toEqual([
      [1, 's0', 'haze'],
      [1, 's3', 'haze'],
      [1, 's6', 'haze'],
    ]);
    const turnsOf = (id: string) => eventsOf(r, 'turn').filter((e) => e.creature === id);
    expect(turnsOf('s0').map((e) => e.round)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(turnsOf('s1')).toHaveLength(10);
    expect(eventsOf(r, 'hit').filter((e) => e.creature === 's0' && e.round === 1)).toEqual([]);
  });

  it('is spent on the first turn the creature really reaches: a creature that starts down is not skipped later', () => {
    const down: FightSlot = { ...slot('s0', { atk: 1 }), hp: 0 };
    const r = run([down, slot('s1', { atk: 1 })], { skipFirstTurn: ['s0'] });
    expect(eventsOf(r, 'skip')).toEqual([]);
  });

  it('a silenced first turn is the lost turn: the haze does not cost a second one', () => {
    // Silence comes after the turns of round 1, so the order is: round 1 hazed, round 2 silenced.
    // The creature acts again in round 3, and the haze is never spent a second time.
    const silence = {
      id: 'sil',
      name: 'Silence',
      trigger: { eachRound: true },
      op: 'silence_ends',
    } as unknown as Gimmick;
    const r = run([slot('a', { atk: 1 }), slot('b', { atk: 1 }), slot('c', { atk: 1 })], {
      skipFirstTurn: ['a'],
      boss: { ...input([]).boss, gimmicks: [silence] },
    });
    const a = r.events.filter(
      (e) => (e.t === 'skip' || e.t === 'turn') && e.creature === 'a' && e.round <= 3,
    );
    const first = a[0];
    expect(first).toMatchObject({ t: 'skip', round: 1, reason: 'haze' });
    // Whatever the silence does later, "haze" is written exactly once.
    expect(eventsOf(r, 'skip').filter((e) => e.reason === 'haze')).toHaveLength(1);
  });

  it('moves no die: the other creatures hit exactly as they did', () => {
    const row = () => rowOf(6, {}, { atk: 400, hp: 1_000_000 });
    const play = (extra: Partial<FightInput>) =>
      simulateFight(
        input(row(), { luck: RULES.combat.luck, bossAtk: 40, ...extra }),
        createSeededRng('haze-dice'),
        { pack: TEST_PACK },
      );
    const plain = play({});
    const hazy = play({ skipFirstTurn: ['s0', 's3'] });
    const mine = (r: typeof plain, id: string, from = 1) =>
      eventsOf(r, 'hit')
        .filter((e) => e.creature === id && e.round >= from)
        .map((e) => [e.round, e.damage, e.crit === true]);
    for (const id of ['s1', 's2', 's4', 's5']) expect(mine(hazy, id)).toEqual(mine(plain, id));
    // The skipped creatures hit one round fewer, and their later hits come from the same dice.
    expect(mine(hazy, 's0', 2)).toEqual(mine(plain, 's0', 2));
    expect(mine(hazy, 's0')).toHaveLength(mine(plain, 's0').length - 1);
  });

  it('is told in plain words', () => {
    const r = run(rowOf(2), { skipFirstTurn: ['s0'] });
    const names = buildNames(input(rowOf(2)));
    expect(describeEvent(eventsOf(r, 'skip')[0] as never, names)).toBe(
      's0 is lost in the Morning Haze and misses its first turn.',
    );
  });
});

describe('Morning Haze in the dungeon: the left creature only', () => {
  const foe = {
    id: 'test-foe',
    name: 'Test Foe',
    kind: 'foe' as const,
    element: 'tide' as const,
    baseHp: 300,
    baseAtk: 20,
    gimmicks: [],
    rounds: 6,
    flavor: 'A foe for tests.',
  };
  const none = {
    id: 'none',
    name: 'None',
    description: 'Nothing changes.',
    effects: [{ op: 'foe_stat' as const, stat: 'hp' as const, bp: 0 }],
  };
  const rooms: DungeonRoomSpec[] = [0, 1].map((index) => ({
    index,
    foe,
    modifier: none,
    hp: 1,
    atk: 5,
  }));
  const team = (): FightSlot[] => [
    slot('left', { atk: 10 }),
    slot('middle', { atk: 10 }),
    slot('right', { atk: 10 }),
  ];
  const runOf = (extra: Partial<DungeonRunInput> = {}): DungeonRunInput => ({
    team: team(),
    player: 'p1',
    rooms,
    abilities: [],
    luck: { ...RULES.combat.luck },
    ...extra,
  });

  it("hazeLeft puts only team[0] in each room's skipFirstTurn, though a row of three has three zones", () => {
    const room = rooms[0] as DungeonRoomSpec;
    expect(buildRoomInput(runOf({ hazeLeft: true }), room, null).skipFirstTurn).toEqual(['left']);
    expect(buildRoomInput(runOf(), room, null)).not.toHaveProperty('skipFirstTurn');
  });

  it('the left creature skips its first turn in every room, the others never', () => {
    // The foes have 1 HP: whoever acts first in a room kills it, so a skipped left creature means
    // the middle one clears the room, and the haze shows in every room.
    const result = simulateDungeon(runOf({ hazeLeft: true }), 'haze-run');
    expect(result.rooms.length).toBe(2);
    for (const r of result.rooms) {
      const skips = r.result.events.flatMap((e) =>
        e.t === 'skip' ? [[e.round, e.creature, e.reason]] : [],
      );
      expect(skips).toEqual([[1, 'left', 'haze']]);
      expect(r.cleared).toBe(true);
      expect(r.result.events.find((e) => e.t === 'hit')).toMatchObject({ creature: 'middle' });
    }
  });

  it('a run without the field plays exactly as before', () => {
    const plain = JSON.stringify(simulateDungeon(runOf(), 'haze-run'));
    expect(
      JSON.stringify(simulateDungeon(runOf({ rainHealBp: 0, brambleBp: 0 }), 'haze-run')),
    ).toBe(plain);
    const first = simulateDungeon(runOf(), 'haze-run').rooms[0];
    expect(first?.result.events.find((e) => e.t === 'hit')).toMatchObject({ creature: 'left' });
  });

  it('rain and brambles reach every room of a run', () => {
    const room = rooms[0] as DungeonRoomSpec;
    const built = buildRoomInput(runOf({ rainHealBp: 250, brambleBp: 4_500 }), room, null);
    expect(built.rainHealBp).toBe(250);
    expect(built.brambleBp).toBe(4_500);
    expect(buildRoomInput(runOf({ rainHealBp: 0, brambleBp: 0 }), room, null)).not.toHaveProperty(
      'rainHealBp',
    );
  });
});

describe('Bramble Season (brambleBp)', () => {
  // A tide Setter marks, a spark Payoff cashes in: the Backdraft fixture of gimmicks.test.ts.
  const row = (): FightSlot[] => [
    slot('s1', { owner: 'a', element: 'tide', role: 'setter', atk: 100 }),
    slot('p1', { owner: 'b', element: 'spark', role: 'payoff', atk: 100 }),
    slot('s2', { owner: 'c', element: 'tide', role: 'setter', atk: 100 }),
    slot('p2', { owner: 'd', element: 'spark', role: 'payoff', atk: 100 }),
  ];
  const BONUS = 318;
  const back = Math.floor((BONUS * 3_000) / 10_000);

  it('sends a share of the first reaction each round back at the creature that set it off', () => {
    const plain = run(row());
    const r = run(row(), { brambleBp: 3_000 });
    const before = eventsOf(plain, 'reaction').filter((e) => e.round === 1);
    const after = eventsOf(r, 'reaction').filter((e) => e.round === 1);
    expect(before.map((e) => e.bonus)).toEqual([BONUS, BONUS]);
    expect(after[0]).toMatchObject({
      payoff: 'p1',
      reflected: false,
      bonus: BONUS - back,
      bramble: { bp: 3_000, amount: back },
    });
    // Only the first reaction of the round: the second goes through whole.
    expect(after[1]).toMatchObject({ payoff: 'p2', bonus: BONUS, reflected: false });
    expect(after[1]).not.toHaveProperty('bramble');
    // The reflected hit is a boss hit with the reflect source on p1 for exactly that share.
    const hit = eventsOf(r, 'boss_hit').find((e) => e.source === 'reflect');
    expect(hit).toMatchObject({ round: 1, target: 'p1', damage: back });
    // The boss took the plain hit plus the rest of the bonus.
    const p1Hit = eventsOf(r, 'hit').find((h) => h.creature === 'p1' && h.round === 1);
    expect(p1Hit?.damage).toBe(150 + BONUS - back);
  });

  it('works again every round, one reflected hit a round', () => {
    const r = run(row(), { brambleBp: 3_000 });
    for (let round = 1; round <= 10; round++) {
      const reflected = eventsOf(r, 'boss_hit').filter(
        (e) => e.round === round && e.source === 'reflect',
      );
      expect(reflected).toHaveLength(1);
    }
    expect(eventsOf(r, 'reaction').filter((e) => e.bramble !== undefined)).toHaveLength(10);
  });

  it('credits the setup only from the bonus the boss took', () => {
    const plain = run(row());
    const r = run(row(), { brambleBp: 3_000 });
    // s1's setup share is 60% of the bonus the boss took, instead of 60% of 318.
    expect(r.perPlayer['a']?.setupCredit).toBe(10 * Math.floor(((BONUS - back) * 6_000) / 10_000));
    expect(plain.perPlayer['a']?.setupCredit).toBe(10 * Math.floor((BONUS * 6_000) / 10_000));
  });

  it("goes through the taker's steps like any reflected hit: reflectedBp and takenBp", () => {
    const withMods = (mods: NonNullable<FightSlot['mods']>): FightSlot[] => {
      const rows = row();
      rows[1] = { ...(rows[1] as FightSlot), mods };
      return rows;
    };
    const reflected = (rows: FightSlot[]) =>
      eventsOf(run(rows, { brambleBp: 3_000 }), 'boss_hit').find(
        (e) => e.source === 'reflect' && e.round === 1,
      );
    expect(reflected(withMods({}))?.damage).toBe(back);
    expect(reflected(withMods({ reflectedBp: 5_000 }))).toMatchObject({
      damage: Math.floor(back / 2),
      warded: back - Math.floor(back / 2),
    });
    expect(reflected(withMods({ takenBp: 2_000 }))?.damage).toBe(
      Math.floor((back * 8_000) / 10_000),
    );
    // An aimed-only or area-only line does not touch it (a reflected hit has its own shape).
    expect(reflected(withMods({ aimedBp: 5_000, areaBp: 5_000 }))?.damage).toBe(back);
  });

  it('with the combat rules a Guard beside takes it instead, with armor', () => {
    const rules = { ...liveFightRules(), guardArmorBp: 2_500, guardHpBp: 0 };
    const rows: FightSlot[] = [
      slot('s1', { element: 'tide', role: 'setter', atk: 100 }),
      slot('p1', { element: 'spark', role: 'payoff', atk: 100 }),
      slot('g', { element: 'grove', role: 'guard', atk: 1 }),
    ];
    const r = run(rows, { brambleBp: 3_000, rules, guardReach: 'adjacent' });
    const hit = eventsOf(r, 'boss_hit').find((e) => e.source === 'reflect' && e.round === 1);
    const sent = eventsOf(r, 'reaction')[0]?.bramble?.amount ?? 0;
    expect(sent).toBeGreaterThan(0);
    expect(hit).toMatchObject({ target: 'g', from: 'p1' });
    expect(hit?.damage).toBe(sent - Math.floor((sent * 2_500) / 10_000));
  });

  it('a Shield Wall on the row stops it like any hit', () => {
    const rows = [
      slot('s1', { owner: 'a', element: 'tide', role: 'setter', atk: 100 }),
      slot('p1', { owner: 'b', element: 'spark', role: 'payoff', atk: 100 }),
    ];
    const r = run(rows, {
      brambleBp: 3_000,
      phase: 'finale',
      finaleAbilities: [
        {
          playerId: 'a',
          abilityId: 'shield-wall',
          key: 'a:basic',
          fireAtRound: 1,
          params: { zone: 'middle' },
        },
      ],
    });
    const hit = eventsOf(r, 'boss_hit').find((e) => e.source === 'reflect' && e.round === 1);
    expect(hit).toMatchObject({ target: 'p1', damage: 0, shielded: true });
  });

  it("does not stack on Backdraft: a reaction Backdraft reflected whole uses the round's first", () => {
    const reflect: Gimmick = {
      id: 'r',
      name: 'r',
      trigger: { eachRound: true },
      op: 'reflect_first_reaction',
    };
    const r = run(row(), {
      brambleBp: 3_000,
      boss: { ...input([]).boss, gimmicks: [reflect] },
    });
    const first = eventsOf(r, 'reaction').filter((e) => e.round === 1);
    expect(first[0]).toMatchObject({ payoff: 'p1', reflected: true });
    expect(first[0]).not.toHaveProperty('bramble');
    // The second reaction is neither Backdrafted nor Bramble's: it was not the round's first.
    expect(first[1]).toMatchObject({ payoff: 'p2', reflected: false });
    expect(first[1]).not.toHaveProperty('bramble');
    expect(
      eventsOf(r, 'boss_hit').filter((e) => e.source === 'reflect' && e.round === 1),
    ).toHaveLength(1);
  });

  it('draws no die: with luck on, the dice are the same with and without brambles', () => {
    const play = (extra: Partial<FightInput>) =>
      simulateFight(
        input(row(), { luck: RULES.combat.luck, bossAtk: 10, ...extra }),
        createSeededRng('bramble-dice'),
        { pack: TEST_PACK },
      );
    const crits = (r: ReturnType<typeof play>) =>
      eventsOf(r, 'hit').map((e) => [e.round, e.creature, e.crit === true]);
    expect(crits(play({ brambleBp: 3_000 }))).toEqual(crits(play({})));
  });

  it('a full share (10000) sends the whole bonus back, like Backdraft', () => {
    const r = run(row(), { brambleBp: 10_000 });
    const first = eventsOf(r, 'reaction').find((e) => e.round === 1);
    expect(first).toMatchObject({ bonus: 0, bramble: { bp: 10_000, amount: BONUS } });
  });

  it('a reaction too small to send anything back writes no reflected hit', () => {
    const tiny = [
      slot('s1', { owner: 'a', element: 'tide', role: 'setter', atk: 1 }),
      slot('p1', { owner: 'b', element: 'spark', role: 'payoff', atk: 1 }),
    ];
    const r = run(tiny, { brambleBp: 100 });
    expect(eventsOf(r, 'boss_hit').filter((e) => e.source === 'reflect')).toEqual([]);
  });

  it('is told in plain words', () => {
    const r = run(row(), { brambleBp: 3_000 });
    const names = buildNames(input(row()), {}, TEST_PACK);
    const line = describeEvent(eventsOf(r, 'reaction')[0] as never, names);
    expect(line).toContain(`Bramble Season throws ${String(back)} of it (30%) back at p1.`);
  });
});
