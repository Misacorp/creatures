import { RULES, createSeededRng, type Gimmick, type Rng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  describeEvent,
  liveEffects,
  liveFightRules,
  simulateFight,
  buildRoomInput,
  type DodgeRules,
  type DungeonRoomSpec,
  type DungeonRunInput,
  type FightEvent,
  type FightInput,
  type FightOptions,
  type FightResult,
  type FightSlot,
  type SlotMods,
} from '../src/index';
import { DODGE_TAKEN_DICE } from '../src/fight-dodge';
import { TEST_PACK, eventsOf, input, slot } from './helpers';
import { everyRound, rowOf, rulesOf } from './pattern-helpers';

/**
 * Dodge (`combat-rules.md` 14). With no crits, no patterns and no chance lines the dice a fight draws
 * are the Guard dice (one per creature), then (with dodge) the dodge dice, so a scripted RNG decides
 * every dodge roll exactly. A round's script is built by `roundDice`.
 */

const DODGE: DodgeRules = { perSpeedBp: 10, maxBp: 5_000, areaShareBp: 5_000 };
/** The die a roll never beats: no chance below 100% fires on it. */
const MISS = 9_999;

/** An RNG that hands out `values` in order, then `MISS`. */
function scripted(values: readonly number[] = []): Rng {
  let i = 0;
  return {
    nextU32() {
      const v = values[i] ?? MISS;
      i += 1;
      return v;
    },
  };
}

interface RoundScript {
  /** By creature index: the dice for the hits it takes (the Nth hit uses die N). */
  taken?: Readonly<Record<number, readonly number[]>>;
  /** By creature index: the boss's dodge die against its turn hit / its ability strike. */
  turn?: Readonly<Record<number, number>>;
  strike?: Readonly<Record<number, number>>;
  /** By creature index, then die number: the luck dice (only in a fight with a chance line). */
  luck?: Readonly<Record<number, Readonly<Record<number, number>>>>;
}

/** One round's dice, in the order the engine draws them. */
function roundDice(
  n: number,
  fight: { luck?: boolean; effects?: number; patterns?: boolean },
  r: RoundScript = {},
) {
  const out: number[] = [];
  // A boss with a pattern move draws its 40 pattern dice first.
  if (fight.patterns === true) for (let i = 0; i < 40; i++) out.push(0);
  for (let i = 0; i < n; i++) out.push(0); // the Guard dice
  if (fight.luck === true) {
    for (let i = 0; i < n; i++) for (let k = 0; k < 10; k++) out.push(r.luck?.[i]?.[k] ?? MISS);
  }
  for (let i = 0; i < (fight.effects ?? 0); i++) out.push(MISS);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < DODGE_TAKEN_DICE; k++) out.push(r.taken?.[i]?.[k] ?? MISS);
  }
  for (let i = 0; i < n; i++) out.push(r.turn?.[i] ?? MISS);
  for (let i = 0; i < n; i++) out.push(r.strike?.[i] ?? MISS);
  return out;
}

interface Setup {
  rounds?: number;
  bossAtk?: number;
  baseSpd?: number;
  gimmicks?: Gimmick[];
  /** The dodge numbers (default `DODGE`); null: the rules carry none. */
  dodge?: DodgeRules | null;
  extra?: Partial<FightInput>;
  options?: FightOptions;
  rng?: Rng;
}

function play(row: FightSlot[], dice: readonly number[], s: Setup = {}): FightResult {
  const base = input(row);
  const dodge = s.dodge === undefined ? DODGE : s.dodge;
  const inp: FightInput = {
    ...base,
    boss: {
      ...base.boss,
      gimmicks: s.gimmicks ?? [],
      finaleRounds: s.rounds ?? 1,
      ...(s.baseSpd === undefined ? {} : { baseSpd: s.baseSpd }),
    },
    phase: 'finale',
    bossAtk: s.bossAtk ?? 100,
    bossHpPool: { max: 1_000_000_000, current: 1_000_000_000 },
    turnOrderOverride: 'left_to_right',
    rules: rulesOf(dodge === null ? {} : { dodge }),
    ...s.extra,
  };
  return simulateFight(inp, s.rng ?? scripted(dice), { pack: TEST_PACK, ...s.options });
}

const withMods = (id: string, mods: SlotMods, o: Parameters<typeof slot>[1] = {}): FightSlot => ({
  ...slot(id, { atk: 1, spd: 0, ...o }),
  mods,
});

const bossHits = (r: FightResult) => eventsOf(r, 'boss_hit');
const dodgedOf = (r: FightResult) => bossHits(r).map((e) => e.dodged === true);
/** The plain attack's hit on the creature (one creature, no gimmicks). */
const plain = (r: FightResult) => bossHits(r).find((e) => e.source === 'attack');

describe('the dodge chance of a creature', () => {
  // One creature, one plain attack of 100: Speed 100 at 10 bp a point is 1000 bp (10%).
  const hit = (spd: number, die: number, mods: SlotMods = {}) =>
    plain(
      play([withMods('s0', mods, { spd })], roundDice(1, {}, { taken: { 0: [die] } })),
    ) as Extract<FightEvent, { t: 'boss_hit' }>;

  it('is Speed times perSpeedBp: a die under it dodges, a die at it does not', () => {
    expect(hit(100, 999)).toMatchObject({ damage: 0, dodged: true, target: 's0' });
    expect(hit(100, 1_000)).toMatchObject({ damage: 100 });
    expect(hit(100, 1_000).dodged).toBeUndefined();
  });

  it('rounds the Speed part down and adds the flat dodgeBp', () => {
    // 15 Speed is 150 bp; with 300 flat it is 450.
    expect(hit(15, 449, { dodgeBp: 300 }).dodged).toBe(true);
    expect(hit(15, 450, { dodgeBp: 300 }).dodged).toBeUndefined();
  });

  it('is capped at maxBp, however much Speed and flat dodge there is', () => {
    expect(hit(100_000, 4_999, { dodgeBp: 9_000 }).dodged).toBe(true);
    expect(hit(100_000, 5_000, { dodgeBp: 9_000 }).dodged).toBeUndefined();
  });

  it('is zero with no Speed and no flat dodge: even the lowest die takes the hit', () => {
    expect(hit(0, 0).dodged).toBeUndefined();
  });

  it('is lowered by Mired: 5 stacks take 15% off the Speed', () => {
    const mired = (die: number) =>
      plain(
        play(
          [withMods('s0', {}, { spd: 100 })],
          roundDice(1, { effects: 1 }, { taken: { 0: [die] } }),
          {
            extra: { effects: { dice: 1 } },
            options: {
              effectHook: (round, apply) => {
                if (round === 1) apply('s0', 'mired', 50_000);
              },
            },
          },
        ),
      );
    // 100 Speed is 1000 bp, 85 Speed is 850 bp.
    expect(mired(849)?.dodged).toBe(true);
    expect(mired(850)?.dodged).toBeUndefined();
    // The same die against the same Speed without Mired dodges (900 is under 1000).
    expect(hit(100, 900).dodged).toBe(true);
  });
});

describe('which hits roll, and at what chance', () => {
  const sweep = everyRound({ op: 'sweep', rows: ['all'], power: 10_000 }, 'wave');
  /** The sweep is the creature's first hit of the round (die 0), the plain attack its second. */
  const areaHit = (mods: SlotMods, spd: number, die: number) =>
    bossHits(
      play(
        [withMods('s0', mods, { spd })],
        roundDice(1, { patterns: true }, { taken: { 0: [die] } }),
        {
          gimmicks: [sweep],
        },
      ),
    ).find((e) => e.source === 'gimmick') as Extract<FightEvent, { t: 'boss_hit' }>;

  it('area hits roll half the chance (areaShareBp)', () => {
    expect(areaHit({}, 100, 499).dodged).toBe(true);
    expect(areaHit({}, 100, 500).dodged).toBeUndefined();
    expect(areaHit({}, 100, 500)).toMatchObject({ damage: 100 });
  });

  it('area hits add areaDodgeBp in full after the share', () => {
    // 500 from Speed and 200 flat area dodge.
    expect(areaHit({ areaDodgeBp: 200 }, 100, 699).dodged).toBe(true);
    expect(areaHit({ areaDodgeBp: 200 }, 100, 700).dodged).toBeUndefined();
    // Flat dodgeBp is part of the full chance, so area hits halve it with the Speed part.
    expect(areaHit({ dodgeBp: 1_000 }, 100, 999).dodged).toBe(true);
    expect(areaHit({ dodgeBp: 1_000 }, 100, 1_000).dodged).toBeUndefined();
  });

  it('area hits are capped at maxBp too', () => {
    expect(areaHit({ areaDodgeBp: 4_000 }, 100_000, 4_999).dodged).toBe(true);
    expect(areaHit({ areaDodgeBp: 4_000 }, 100_000, 5_000).dodged).toBeUndefined();
  });

  it('a creature takes its dice in the order of the hits it takes', () => {
    // The sweep (die 0) is not dodged, the plain attack (die 1) is: both at 1000 bp for the aimed one.
    const r = play(
      [withMods('s0', {}, { spd: 100 })],
      roundDice(1, { patterns: true }, { taken: { 0: [MISS, 0] } }),
      {
        gimmicks: [sweep],
      },
    );
    expect(dodgedOf(r)).toEqual([false, true]);
  });

  it('uses the last die for every hit past the eighth', () => {
    // Seven hit_zone moves and three plain attacks: ten hits on one creature; dice 0 to 6 miss, die 7 dodges.
    const zones = Array.from({ length: 7 }, (_, i) =>
      everyRound({ op: 'hit_zone', zone: 'middle', power: 10_000 }, `z${String(i)}`),
    );
    const r = play(
      [withMods('s0', { dodgeBp: 5_000 })],
      roundDice(1, {}, { taken: { 0: [MISS, MISS, MISS, MISS, MISS, MISS, MISS, 0] } }),
      { gimmicks: zones, extra: { bossAttacks: 3 } },
    );
    // The hit_zone moves are area hits at the half chance (2500), still well above die 0.
    expect(dodgedOf(r)).toEqual([...Array.from({ length: 7 }, () => false), true, true, true]);
  });

  it('a chain rolls on every jump and a dodge does not stop it', () => {
    const chain = everyRound({ op: 'strike_highest_atk', power: 10_000, jumps: 2 }, 'arc');
    const row = [
      withMods('s0', {}, { spd: 100, atk: 30 }),
      withMods('s1', {}, { spd: 100, atk: 20 }),
      withMods('s2', {}, { spd: 100, atk: 10 }),
    ];
    // First hit (aimed, full 1000): die 999 dodges. Jump 1 (area, 500): die 499 dodges. Jump 2: die 500 lands.
    const r = play(row, roundDice(3, {}, { taken: { 0: [999], 1: [499], 2: [500] } }), {
      gimmicks: [chain],
    });
    const hits = bossHits(r).filter((e) => e.source === 'gimmick');
    expect(hits.map((e) => [e.target, e.dodged === true])).toEqual([
      ['s0', true],
      ['s1', true],
      ['s2', false],
    ]);
    expect(hits[2]?.damage).toBeGreaterThan(0);
  });

  it('a charge landing rolls the full chance, though a sweep is an area hit', () => {
    const charged = {
      id: 'c',
      name: 'c',
      trigger: { every: 2 },
      op: 'charge',
      then: { op: 'sweep', rows: ['middle'], power: 10_000 },
    } as Gimmick;
    const row = [withMods('s0', {}, { spd: 100 })];
    const dice = (die: number) => [
      ...roundDice(1, { patterns: true }),
      ...roundDice(1, { patterns: true }, { taken: { 0: [die] } }),
    ];
    const landing = (die: number) =>
      bossHits(play(row, dice(die), { rounds: 2, gimmicks: [charged] })).find(
        (e) => e.source === 'gimmick',
      );
    // 999 is under the full chance (1000) and over the area chance (500).
    expect(landing(999)?.dodged).toBe(true);
    expect(landing(1_000)?.dodged).toBeUndefined();
    const plainSweep = areaHit({}, 100, 999);
    expect(plainSweep.dodged).toBeUndefined();
  });

  it('an enrage hit rolls the full chance', () => {
    const row = [withMods('s0', {}, { spd: 100 })];
    const dice = (die: number) => [
      ...roundDice(1, {}),
      ...roundDice(1, {}, { taken: { 0: [MISS, die] } }),
    ];
    const enrage = (die: number) =>
      bossHits(play(row, dice(die), { extra: { enrage: { rounds: 1, powerBp: 10_000 } } })).filter(
        (e) => e.source === 'enrage',
      );
    expect(enrage(999).map((e) => e.dodged)).toEqual([true]);
    expect(enrage(1_000).map((e) => e.dodged)).toEqual([undefined]);
  });

  it('a reflected hit is never dodged', () => {
    // s0 (Ember, a Setter) marks; s1 (Tide, a Payoff) sets off Steam and Bramble Season sends half of
    // the bonus back at s1, which has the highest chance and every die at 0.
    const row = [
      withMods('s0', {}, { element: 'ember', role: 'setter', atk: 1 }),
      withMods('s1', {}, { element: 'tide', role: 'payoff', atk: 1_000, spd: 100_000 }),
    ];
    const r = play(row, roundDice(2, {}, { taken: { 1: [0, 0, 0] } }), {
      extra: { brambleBp: 5_000 },
    });
    const reflected = bossHits(r).filter((e) => e.source === 'reflect');
    expect(reflected).toHaveLength(1);
    expect(reflected[0]?.target).toBe('s1');
    expect(reflected[0]?.dodged).toBeUndefined();
    expect(reflected[0]?.damage).toBeGreaterThan(0);
  });

  it('a hit a Guard steps in to take is never dodged, but a hit aimed at the Guard is', () => {
    const slam = everyRound({ op: 'slam', aim: 'left', power: 10_000, splashBp: 5_000 }, 'bolt');
    const row = [
      withMods('s0', {}, { role: 'setter' }),
      withMods('g', {}, { role: 'guard', spd: 100_000 }),
    ];
    // Both of the Guard's first two dice are 0, and its chance is 50%.
    const r = play(row, roundDice(2, { patterns: true }, { taken: { 1: [0, 0, 0] } }), {
      gimmicks: [slam],
    });
    const hits = bossHits(r);
    // The slam aimed at s0 is taken by g (no roll: die 0 is spent on it), the splash hits s0, and the
    // plain attack goes for the Guard (g's second hit: die 1 dodges).
    expect(hits.map((e) => [e.target, e.from, e.dodged === true])).toEqual([
      ['g', 's0', false],
      ['s0', undefined, false],
      ['g', undefined, true],
    ]);
  });

  it('cover does not stop a covered neighbour from dodging', () => {
    const sweep2 = everyRound({ op: 'sweep', rows: ['all'], power: 10_000 }, 'wave');
    const row = [withMods('s0', {}, { spd: 100_000 }), withMods('g', {}, { role: 'guard' })];
    const r = play(row, roundDice(2, { patterns: true }, { taken: { 0: [0] } }), {
      gimmicks: [sweep2],
    });
    const hits = bossHits(r).filter((e) => e.source === 'gimmick');
    expect(hits[0]).toMatchObject({ target: 's0', damage: 0, dodged: true });
    expect(hits[0]?.covered).toBeUndefined();
    // The control: with a missing die the Guard's cover softens the same hit.
    const control = play(row, roundDice(2, { patterns: true }), { gimmicks: [sweep2] });
    expect(bossHits(control).find((e) => e.source === 'gimmick')?.covered?.guard).toBe('g');
  });
});

describe('a dodged hit is a hit that never happened', () => {
  it('fires nothing that waits for a hit taken, and applies no effect', () => {
    const zone = everyRound(
      {
        op: 'hit_zone',
        zone: 'middle',
        power: 10_000,
        applies: { effect: 'mired', powerBp: 10_000 },
      },
      'blow',
    );
    const row = [
      withMods('s0', { stubborn: 1, lastStandBp: 2_000, dodgeBp: 5_000 }, { hp: 1_000, spd: 0 }),
      withMods('s1', { rallyCryBp: 1_000 }, { hp: 1_000_000 }),
    ];
    // Round 1: s0's two hits (the zone move at the half chance, the plain attack at the full one) are
    // dodged. Round 2: its dice miss, so the same hits land.
    const dice = [
      ...roundDice(2, { effects: 1 }, { taken: { 0: [0, 0] } }),
      ...roundDice(2, { effects: 1 }),
    ];
    const r = play(row, dice, {
      rounds: 2,
      gimmicks: [zone],
      bossAtk: 1_000,
      extra: { effects: { dice: 1 } },
    });
    const inRound = (round: number) => r.events.filter((e) => 'round' in e && e.round === round);
    const first = inRound(1);
    const s0Hits = (round: number) =>
      bossHits(r).filter((e) => e.round === round && e.target === 's0');
    expect(s0Hits(1).map((e) => [e.damage, e.dodged])).toEqual([
      [0, true],
      [0, true],
    ]);
    // Nothing fired for s0 in round 1: no knockout, no proc, no effect on it.
    expect(first.filter((e) => e.t === 'knockout' || e.t === 'proc')).toEqual([]);
    expect(first.filter((e) => e.t === 'effect_apply' && e.target === 's0')).toEqual([]);
    expect(r.perCreature['s0']?.damageTaken).toBeGreaterThan(0); // it took the round 2 hits
    // Round 2: the hits land, and then Stubborn, Last stand, the effect and Rally cry all fire.
    expect(s0Hits(2).every((e) => e.dodged === undefined)).toBe(true);
    const procs = eventsOf(r, 'proc').map((e) => e.kind);
    expect(procs).toContain('stubborn');
    expect(procs).toContain('last_stand');
    expect(procs).toContain('rally_cry');
    expect(
      eventsOf(r, 'effect_apply').filter((e) => e.target === 's0' && e.round === 2),
    ).toHaveLength(1);
    expect(eventsOf(r, 'effect_apply').filter((e) => e.target === 's0' && e.round === 1)).toEqual(
      [],
    );
  });

  it('leaves HP, totals and the knockout alone', () => {
    const r = play(
      [withMods('s0', {}, { hp: 50, spd: 100 })],
      roundDice(1, {}, { taken: { 0: [0] } }),
      {
        bossAtk: 1_000,
      },
    );
    expect(r.hpEnd['s0']).toBe(50);
    expect(r.perCreature['s0']?.damageTaken).toBe(0);
    expect(eventsOf(r, 'knockout')).toEqual([]);
    expect(r.perCreature['s0']?.knockedOutRound).toBeNull();
  });

  it('Sidestep is only rolled when the dodge failed, and its dice stay where they were', () => {
    const sweep = everyRound({ op: 'sweep', rows: ['all'], power: 10_000 }, 'wave');
    const row = [withMods('s0', { sidestepBp: 10_000 }, { spd: 100 })];
    // Sidestep's die for the first area hit (die 6) is 0, so it would always fire.
    const run = (dodgeDie: number) =>
      bossHits(
        play(
          row,
          roundDice(
            1,
            { luck: true, patterns: true },
            { luck: { 0: { 6: 0 } }, taken: { 0: [dodgeDie] } },
          ),
          { gimmicks: [sweep] },
        ),
      ).find((e) => e.source === 'gimmick');
    expect(run(0)).toMatchObject({ dodged: true, damage: 0 });
    expect(run(0)?.sidestep).toBeUndefined();
    expect(run(MISS)).toMatchObject({ sidestep: true, damage: 0 });
    expect(run(MISS)?.dodged).toBeUndefined();
  });
});

describe('the boss dodges a creature hit', () => {
  /** Boss Speed 100 is 1000 bp; the boss's dice are the creature's turn die and strike die. */
  const bossFight = (row: FightSlot[], dice: readonly number[], s: Setup = {}) =>
    play(row, dice, { baseSpd: 100, ...s });
  const heroes = (r: FightResult) => eventsOf(r, 'hit');

  it('rolls once for each creature turn: damage 0, no credit, no boss damage', () => {
    const r = bossFight(
      [withMods('s0', {}, { atk: 1_000 })],
      roundDice(1, {}, { turn: { 0: 999 } }),
    );
    expect(heroes(r)).toMatchObject([{ creature: 's0', damage: 0, dodged: true, bonusBp: 0 }]);
    expect(r.bossHpEnd).toBe(r.bossHpStart);
    expect(r.perCreature['s0']?.damage).toBe(0);
    expect(r.damageByElement.tide).toBe(0);
    const landed = bossFight(
      [withMods('s0', {}, { atk: 1_000 })],
      roundDice(1, {}, { turn: { 0: 1_000 } }),
    );
    expect(heroes(landed)[0]?.damage).toBeGreaterThan(0);
    expect(heroes(landed)[0]?.dodged).toBeUndefined();
  });

  it('is lowered by Mired on the boss', () => {
    const run = (die: number) =>
      bossFight(
        [withMods('s0', {}, { atk: 1_000 })],
        roundDice(1, { effects: 1 }, { turn: { 0: die } }),
        {
          extra: { effects: { dice: 1 } },
          options: {
            effectHook: (round, apply) => {
              if (round === 1) apply(null, 'mired', 50_000);
            },
          },
        },
      );
    // 100 Speed with 5 stacks of Mired is 85 Speed: 850 bp.
    expect(heroes(run(849))[0]?.dodged).toBe(true);
    expect(heroes(run(850))[0]?.dodged).toBeUndefined();
  });

  it('has no dodge without a baseSpd, and caps it at maxBp', () => {
    const none = play([withMods('s0', {})], roundDice(1, {}, { turn: { 0: 0 } }));
    expect(heroes(none)[0]?.dodged).toBeUndefined();
    const fast = play([withMods('s0', {})], roundDice(1, {}, { turn: { 0: 4_999 } }), {
      baseSpd: 1_000_000,
    });
    expect(heroes(fast)[0]?.dodged).toBe(true);
    const capped = play([withMods('s0', {})], roundDice(1, {}, { turn: { 0: 5_000 } }), {
      baseSpd: 1_000_000,
    });
    expect(heroes(capped)[0]?.dodged).toBeUndefined();
  });

  it('rolls an ability strike on its own die', () => {
    const r = bossFight(
      [withMods('s0', {}, { atk: 1_000 })],
      roundDice(1, {}, { strike: { 0: 0 }, turn: { 0: MISS } }),
      {
        extra: {
          finaleAbilities: [
            {
              playerId: 'p1',
              abilityId: 'test-strike',
              key: 'k',
              creatureId: 's0',
              fireAtRound: 1,
            },
          ],
        },
      },
    );
    expect(heroes(r).map((e) => [e.ability, e.dodged === true])).toEqual([
      ['test-strike', true],
      [undefined, false],
    ]);
  });

  it('gives no Echo for a dodged hit (and one for a hit that lands)', () => {
    const row = [withMods('s0', { echoBp: 10_000 }, { atk: 1_000 })];
    const run = (turn: number) =>
      bossFight(row, roundDice(1, { luck: true }, { luck: { 0: { 1: 0 } }, turn: { 0: turn } }));
    expect(eventsOf(run(0), 'proc').filter((e) => e.kind === 'echo')).toEqual([]);
    expect(eventsOf(run(MISS), 'proc').filter((e) => e.kind === 'echo')).toHaveLength(1);
  });

  describe('marks (setup never misses)', () => {
    const ember = (id: string, o: Parameters<typeof slot>[1] = {}) =>
      withMods(id, {}, { element: 'ember', ...o });

    it('a Setter still leaves its mark when its hit is dodged, and is credited for the setup', () => {
      const row = [
        ember('s0', { role: 'setter', atk: 100 }),
        withMods('s1', {}, { element: 'tide', role: 'payoff', atk: 1_000 }),
      ];
      const r = bossFight(row, roundDice(2, {}, { turn: { 0: 0 } }));
      const events = r.events.filter((e) => e.t === 'hit' || e.t === 'mark' || e.t === 'reaction');
      expect(events.map((e) => e.t)).toEqual(['hit', 'mark', 'hit', 'reaction']);
      expect(events[0]).toMatchObject({ dodged: true, damage: 0, mark: null });
      expect(events[1]).toMatchObject({ creature: 's0', element: 'ember', replaced: null });
      expect(r.perCreature['s0']?.setupCredit).toBeGreaterThan(0);
    });

    it('a Setter whose dodged hit meets another element replaces the mark', () => {
      const row = [
        ember('s0', { role: 'setter' }),
        withMods('s1', {}, { element: 'grove', role: 'setter' }),
      ];
      const r = bossFight(row, roundDice(2, {}, { turn: { 1: 0 } }));
      const marks = eventsOf(r, 'mark');
      expect(marks.map((e) => [e.creature, e.element, e.replaced])).toEqual([
        ['s0', 'ember', null],
        ['s1', 'grove', 'ember'],
      ]);
    });

    it('any other role leaves no mark when its hit is dodged', () => {
      const row = [withMods('s0', {}, { role: 'payoff' })];
      const dodged = bossFight(row, roundDice(1, {}, { turn: { 0: 0 } }));
      expect(eventsOf(dodged, 'mark')).toEqual([]);
      const landed = bossFight(row, roundDice(1, {}));
      expect(eventsOf(landed, 'mark')).toHaveLength(1);
    });

    it('a dodged hit by a non-Setter does not trigger Quick re-mark', () => {
      const row = [
        ember('s0', { role: 'setter' }),
        withMods('s1', { quickRemarkBp: 10_000 }, { element: 'grove', role: 'payoff' }),
      ];
      // Quick re-mark's die (4) is 0 for s1, so a landed hit would swap the mark.
      const run = (turn: number) =>
        bossFight(row, roundDice(2, { luck: true }, { luck: { 1: { 4: 0 } }, turn: { 1: turn } }));
      expect(eventsOf(run(MISS), 'mark').map((e) => e.element)).toEqual(['ember', 'grove']);
      const dodged = run(0);
      expect(eventsOf(dodged, 'mark').map((e) => e.element)).toEqual(['ember']);
      expect(eventsOf(dodged, 'proc').filter((e) => e.kind === 'quick_remark')).toEqual([]);
    });

    it('a dodged hit that would have set off a reaction leaves the mark standing', () => {
      // Round 1: s0 marks Scorched. s1 (Tide) would set off Steam, but its hit is dodged. Round 2: it lands.
      const row = [
        ember('s0', { role: 'setter' }),
        withMods('s1', {}, { element: 'tide', role: 'payoff', atk: 1_000 }),
      ];
      const dice = [...roundDice(2, {}, { turn: { 1: 0 } }), ...roundDice(2, {})];
      const r = bossFight(row, dice, { rounds: 2 });
      const reactions = eventsOf(r, 'reaction');
      expect(reactions.map((e) => e.round)).toEqual([2]);
      expect(eventsOf(r, 'round_start').map((e) => e.mark)).toEqual([null, 'ember']);
    });

    it('a dodged hit spends no boost and no reflect trap', () => {
      const row = [
        ember('s0', { role: 'setter' }),
        withMods('s1', {}, { element: 'tide', role: 'payoff', atk: 1_000 }),
      ];
      const rules = rulesOf({ dodge: DODGE });
      // A Backdraft trap armed every round: the dodged reaction does not spring it.
      const trap = everyRound({ op: 'reflect_first_reaction' }, 'trap');
      const dice = [...roundDice(2, {}, { turn: { 1: 0 } }), ...roundDice(2, {})];
      const r = play(row, dice, { rounds: 2, gimmicks: [trap], baseSpd: 100, extra: { rules } });
      const reactions = eventsOf(r, 'reaction');
      expect(reactions).toHaveLength(1);
      expect(reactions[0]).toMatchObject({ round: 2, reflected: true });
    });
  });
});

describe('dodge dice', () => {
  const sevenRounds = { rounds: 7 };
  const team = [
    withMods('s0', {}, { spd: 400, hp: 5_000 }),
    withMods('s1', {}, { spd: 300, hp: 5_000 }),
    withMods('s2', {}, { spd: 200, hp: 5_000 }),
  ];

  /** Counts every draw of the fight. */
  function counting(seed: string): { rng: Rng; calls: () => number } {
    const inner = createSeededRng(seed);
    let n = 0;
    return {
      rng: {
        nextU32() {
          n += 1;
          return inner.nextU32();
        },
      },
      calls: () => n,
    };
  }

  it('are drawn only when the stored rules carry dodge: a fight without dodge draws what it always drew', () => {
    const off = counting('gate');
    play(team, [], { ...sevenRounds, dodge: null, rng: off.rng, bossAtk: 1 });
    // Without dodge the only dice are the Guard dice: one per creature a round.
    expect(off.calls()).toBe(7 * 3);
    const on = counting('gate');
    play(team, [], { ...sevenRounds, rng: on.rng, bossAtk: 1 });
    // Dodge adds, a round, DODGE_TAKEN_DICE per creature plus a turn die and a strike die each.
    expect(on.calls()).toBe(7 * (3 + 3 * (DODGE_TAKEN_DICE + 2)));
  });

  it('never move another die: with nobody able to dodge the whole fight is the same', () => {
    // Crits for everyone and the boss, a barrage (pattern dice), luck dice from a chance line, effect dice.
    const lucky = [
      withMods('s0', { echoBp: 2_000 }, { hp: 20_000 }),
      withMods('s1', {}, { hp: 20_000 }),
      withMods('s2', {}, { hp: 20_000, role: 'guard' }),
    ];
    const barrage = everyRound(
      { op: 'barrage', shells: { min: 1, max: 2, shareBp: 5_000 }, power: 10_000 },
      'rain',
    );
    const extra: Partial<FightInput> = {
      luck: { ...RULES.combat.luck },
      effects: { dice: 4 },
      bossAttacks: 2,
    };
    const run = (dodge: DodgeRules | null) =>
      play(lucky, [], {
        rounds: 6,
        dodge,
        gimmicks: [barrage],
        extra,
        rng: createSeededRng('independent'),
      });
    const without = run(null);
    const withDodge = run(DODGE);
    expect(eventsOf(without, 'hit').some((e) => e.crit === true)).toBe(true);
    // Every die of a round is drawn before its dodge dice, so a round's events are the same with or
    // without dodge. (The dodge dice are in the stream, so the rounds after the first draw from later in it.)
    const firstRound = (r: FightResult) =>
      r.events.slice(0, r.events.findIndex((e) => e.t === 'round_end' && e.round === 1) + 1);
    expect(firstRound(without).length).toBeGreaterThan(10);
    expect(firstRound(withDodge)).toEqual(firstRound(without));
  });

  it('replay: a stored input with its dodge rules plays the same fight again, and without them nobody dodges', () => {
    const fast = [
      withMods('s0', {}, { spd: 100_000, hp: 5_000 }),
      withMods('s1', {}, { spd: 100_000, hp: 5_000 }),
    ];
    const base = input(fast);
    const stored: FightInput = JSON.parse(
      JSON.stringify({
        ...base,
        boss: { ...base.boss, gimmicks: [], baseSpd: 1_000, finaleRounds: 4 },
        phase: 'finale',
        bossAtk: 50,
        rules: rulesOf({ dodge: DODGE }),
      }),
    ) as FightInput;
    const a = simulateFight(stored, createSeededRng('replay'), { pack: TEST_PACK });
    const b = simulateFight(
      JSON.parse(JSON.stringify(stored)) as FightInput,
      createSeededRng('replay'),
      { pack: TEST_PACK },
    );
    expect(b).toEqual(a);
    expect(a.events.some((e) => (e.t === 'boss_hit' || e.t === 'hit') && e.dodged === true)).toBe(
      true,
    );
    // A fight stored before dodge: the same input without it in the rules has no dodge at all.
    const old = { ...stored, rules: rulesOf() };
    const c = simulateFight(old, createSeededRng('replay'), { pack: TEST_PACK });
    expect(c.events.some((e) => (e.t === 'boss_hit' || e.t === 'hit') && e.dodged === true)).toBe(
      false,
    );
  });
});

describe('checks and wiring', () => {
  it('rejects dodge numbers out of range, and a bad sheet', () => {
    const row = [withMods('s0', {})];
    for (const bad of [
      { ...DODGE, perSpeedBp: -1 },
      { ...DODGE, maxBp: 10_001 },
      { ...DODGE, areaShareBp: 1.5 },
    ]) {
      expect(() => play(row, [], { dodge: bad })).toThrow(/rules\.dodge/);
    }
    expect(() => play([withMods('s0', { dodgeBp: 10_001 })], [])).toThrow(/dodgeBp/);
    expect(() => play([withMods('s0', { areaDodgeBp: -1 })], [])).toThrow(/areaDodgeBp/);
  });

  /** Runs `body` with the two switches set, and puts the shipped values back. */
  const withSwitches = (on: boolean, body: () => void): void => {
    const dodge = RULES.combat.dodge as { enabled: boolean };
    const effects = RULES.combat.effects as { enabled: boolean };
    const was = { dodge: dodge.enabled, effects: effects.enabled };
    try {
      dodge.enabled = on;
      effects.enabled = on;
      body();
    } finally {
      dodge.enabled = was.dodge;
      effects.enabled = was.effects;
    }
  };

  it('is on in the shipped rules (the balance pass switched it on)', () => {
    expect(RULES.combat.dodge.enabled).toBe(true);
    expect(RULES.combat.effects.enabled).toBe(true);
  });

  it('is off in the live rules and the live effect dice while the switches are off', () => {
    withSwitches(false, () => {
      expect(liveFightRules().dodge).toBeUndefined();
      expect(liveEffects()).toEqual({});
    });
  });

  it('copies the dodge numbers into the live rules and the effect dice into the input when switched on', () => {
    withSwitches(true, () => {
      expect(liveFightRules().dodge).toEqual({ perSpeedBp: 10, maxBp: 5_000, areaShareBp: 5_000 });
      expect(liveEffects()).toEqual({ effects: { dice: 32 } });
    });
  });

  it('gives a dungeon room its foe`s baseSpd', () => {
    const room: DungeonRoomSpec = {
      index: 0,
      foe: {
        id: 'f',
        name: 'F',
        kind: 'foe',
        element: 'tide',
        baseHp: 300,
        baseAtk: 20,
        baseSpd: 70,
        gimmicks: [],
        rounds: 6,
        flavor: 'x',
      },
      modifier: {
        id: 'none',
        name: 'None',
        description: 'x',
        effects: [{ op: 'foe_stat', stat: 'hp', bp: 0 }],
      },
      hp: 300,
      atk: 14,
    };
    const run: DungeonRunInput = {
      team: rowOf(3),
      player: 'p1',
      rooms: [room],
      abilities: [],
      luck: { ...RULES.combat.luck },
      effects: { dice: 8 },
    };
    const built = buildRoomInput(run, room, null);
    expect(built.boss.baseSpd).toBe(70);
    expect(built.effects).toEqual({ dice: 8 });
    const without = buildRoomInput(
      { ...run },
      { ...room, foe: { ...room.foe, baseSpd: undefined } },
      null,
    );
    expect('baseSpd' in without.boss).toBe(false);
  });
});

describe('the log', () => {
  it('says who dodges', () => {
    const r = play(
      [withMods('Mudlump', {}, { spd: 100 })],
      roundDice(1, {}, { taken: { 0: [0] }, turn: { 0: 0 } }),
      { baseSpd: 100 },
    );
    const names = { boss: 'Old Bogback', creatures: { Mudlump: 'Mudlump' } };
    const text = r.events.map((e) => describeEvent(e, names));
    expect(text).toContain('Mudlump dodges!');
    expect(text).toContain("Old Bogback dodges Mudlump's hit.");
    const splash: FightEvent = {
      t: 'boss_hit',
      round: 1,
      source: 'gimmick',
      target: 'Mudlump',
      damage: 0,
      dodged: true,
      splash: true,
    };
    expect(describeEvent(splash, names)).toBe('Mudlump dodges the splash.');
    const strike: FightEvent = {
      t: 'hit',
      round: 1,
      creature: 'Mudlump',
      damage: 0,
      matchupBp: 10_000,
      bonusBp: 0,
      mark: null,
      bossHp: 5,
      dodged: true,
      ability: 'flare-strike',
      key: 'k',
    };
    expect(describeEvent(strike, { ...names, abilities: { 'flare-strike': 'Flare Strike' } })).toBe(
      "Old Bogback dodges Mudlump's Flare Strike.",
    );
  });
});
