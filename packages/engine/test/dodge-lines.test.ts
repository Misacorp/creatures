import { type Gimmick, type Rng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  describeEvent,
  simulateFight,
  type DodgeRules,
  type FightInput,
  type FightResult,
  type FightSlot,
  type SlotMods,
} from '../src/index';
import { DODGE_TAKEN_DICE } from '../src/fight-dodge';
import { TEST_PACK, eventsOf, input, slot } from './helpers';
import { everyRound, rulesOf } from './pattern-helpers';

/**
 * The on-dodge lines Riposte, Momentum and Slipstream (`combat-rules.md` 12). With no crits, no patterns
 * and no chance lines a round draws the Guard dice (one per creature), then the dodge dice, so a scripted
 * RNG decides every dodge exactly (as in `dodge.test.ts`).
 */

const DODGE: DodgeRules = { perSpeedBp: 10, maxBp: 5_000, areaShareBp: 5_000 };
const MISS = 9_999;

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

/** One round's dice: `taken` by creature index, the dice for the hits it takes (0 dodges when it has the points). */
function roundDice(n: number, taken: Readonly<Record<number, readonly number[]>> = {}): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(0); // the Guard dice
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < DODGE_TAKEN_DICE; k++) out.push(taken[i]?.[k] ?? MISS);
  }
  for (let i = 0; i < 2 * n; i++) out.push(MISS); // the boss's own dodge dice
  return out;
}

const withMods = (id: string, mods: SlotMods, o: Parameters<typeof slot>[1] = {}): FightSlot => ({
  ...slot(id, { spd: 0, ...o }),
  mods,
});

function play(
  row: FightSlot[],
  dice: readonly number[],
  o: {
    rounds?: number;
    bossAtk?: number;
    gimmicks?: Gimmick[];
    dodge?: DodgeRules | null;
    extra?: Partial<FightInput>;
  } = {},
): FightResult {
  const base = input(row);
  const dodge = o.dodge === undefined ? DODGE : o.dodge;
  const inp: FightInput = {
    ...base,
    boss: { ...base.boss, gimmicks: o.gimmicks ?? [], finaleRounds: o.rounds ?? 1 },
    phase: 'finale',
    bossAtk: o.bossAtk ?? 100,
    bossHpPool: { max: 1_000_000, current: 1_000_000 },
    turnOrderOverride: 'left_to_right',
    rules: rulesOf(dodge === null ? {} : { dodge }),
    ...o.extra,
  };
  return simulateFight(inp, scripted(dice), { pack: TEST_PACK });
}

const procs = (r: FightResult, kind: string) => eventsOf(r, 'proc').filter((e) => e.kind === kind);
/** An area hit on the front creature every round. */
const frontHit = everyRound({ op: 'hit_zone', zone: 'front', power: 10_000 });

describe('Momentum', () => {
  it('after a dodge, its next turn hit deals more, once', () => {
    const row = [withMods('s0', { dodgeBp: 5_000, momentumBp: 2_000 }, { atk: 1_000 })];
    // Round 1: its first hit taken is dodged (die 0 under 5000). Rounds 2 and 3: nothing dodges.
    const r = play(row, [...roundDice(1, { 0: [0] }), ...roundDice(1), ...roundDice(1)], {
      rounds: 3,
    });
    const moments = procs(r, 'momentum');
    expect(moments).toHaveLength(1);
    expect(moments[0]).toMatchObject({ creature: 's0', amount: 2_000, round: 1 });
    const hits = eventsOf(r, 'hit');
    // The dodge comes in the boss's turn of round 1, so the round 2 hit gets the bonus and no other does.
    expect(hits.map((h) => h.sheetBp ?? 0)).toEqual([0, 2_000, 0]);
    expect(describeEvent(moments[0] as never, { creatures: { s0: 'S0' }, boss: 'Boss' })).toContain(
      'Momentum',
    );
  });

  it('does nothing when the creature is not dodging, or the fight has no dodge', () => {
    const row = [withMods('s0', { dodgeBp: 5_000, momentumBp: 2_000, riposteBp: 3_000 })];
    expect(procs(play(row, roundDice(1)), 'momentum')).toEqual([]);
    // Dodge off in the stored rules: even die 0 cannot dodge, and the lines never fire.
    const off = play(row, roundDice(1, { 0: [0] }), { dodge: null });
    expect(eventsOf(off, 'proc')).toEqual([]);
  });
});

describe('Slipstream', () => {
  it('gives the living neighbour with the most Attack a boost on its next hit', () => {
    const row = [
      withMods('s0', { dodgeBp: 5_000, slipstreamBp: 1_500 }, { atk: 10 }),
      withMods('s1', {}, { atk: 500 }),
      withMods('s2', {}, { atk: 300 }),
    ];
    // A zone hit on the front row is an area hit; s0 dodges it (area chance 2500, under die 0).
    const r = play(row, [...roundDice(3, { 0: [0] }), ...roundDice(3), ...roundDice(3)], {
      rounds: 2,
      gimmicks: [frontHit],
      extra: { guardReach: 'adjacent' },
    });
    const slip = procs(r, 'slipstream');
    expect(slip).toHaveLength(1);
    expect(slip[0]).toMatchObject({ creature: 's0', target: 's1', amount: 1_500 });
    // s1 (the stronger neighbour) carries it on its next hit: the boost shows in that hit's bonus.
    const s1Hits = eventsOf(r, 'hit').filter((h) => h.creature === 's1');
    expect(s1Hits.some((h) => h.bonusBp >= 1_500)).toBe(true);
  });

  it('has nobody to boost when no neighbour stands', () => {
    const row = [withMods('s0', { dodgeBp: 5_000, slipstreamBp: 1_500 })];
    const r = play(row, roundDice(1, { 0: [0] }));
    expect(procs(r, 'slipstream')).toEqual([]);
  });
});

describe('Riposte', () => {
  it('strikes the boss back at once for a share of its Attack, with no mark and no reaction', () => {
    const row = [withMods('s0', { dodgeBp: 5_000, riposteBp: 3_000 }, { atk: 1_000, spd: 0 })];
    const r = play(row, roundDice(1, { 0: [0] }));
    const [riposte] = procs(r, 'riposte');
    expect(riposte).toBeDefined();
    const own = eventsOf(r, 'hit')[0];
    // 30% of 1000 Attack at the chart's matchup (the same one its own hit got).
    expect(riposte?.amount).toBe(Math.floor((300 * (own?.matchupBp ?? 0)) / 10_000));
    expect(riposte?.bossHp).toBe(r.bossHpEnd);
    expect(r.bossHpStart - r.bossHpEnd).toBe((own?.damage ?? 0) + (riposte?.amount ?? 0));
    // It is credited to the creature as damage.
    expect(r.perCreature['s0']?.damage).toBe((own?.damage ?? 0) + (riposte?.amount ?? 0));
    expect(eventsOf(r, 'mark')).toHaveLength(1); // only its own hit's mark
    expect(eventsOf(r, 'reaction')).toEqual([]);
  });

  it('counts down to the phase floor and retreats the boss, with no overkill', () => {
    const row = [withMods('s0', { dodgeBp: 5_000, riposteBp: 100_000 }, { atk: 10 })];
    const r = play(row, roundDice(1, { 0: [0] }), {
      extra: { bossHpPool: { max: 1_000, current: 1_000 }, bossHpFloor: 950 },
    });
    const [riposte] = procs(r, 'riposte');
    expect(riposte?.bossHp).toBe(950);
    expect(r.bossHpEnd).toBe(950);
    expect(eventsOf(r, 'retreat')).toHaveLength(1);
  });

  it('does not fire when the boss is already gone', () => {
    const row = [withMods('s0', { dodgeBp: 5_000, riposteBp: 3_000 }, { atk: 10 })];
    const r = play(row, roundDice(1, { 0: [0] }), {
      extra: { bossHpPool: { max: 1_000, current: 1_000 }, bossHpFloor: 1_000 },
    });
    expect(procs(r, 'riposte')).toEqual([]);
  });
});

describe('Riposte ends the boss mid-turn', () => {
  const sweepAll = everyRound({ op: 'sweep', rows: ['all'], power: 10_000 });
  /** Three creatures; only s0 hits hard and dodges (the sweep's area chance is 2500, die 0 beats it). */
  const row = () => [
    withMods('s0', { dodgeBp: 5_000, riposteBp: 30_000 }, { atk: 1_000 }),
    withMods('s1', {}, { atk: 1 }),
    withMods('s2', {}, { atk: 1 }),
  ];
  /** s0's dice for the hits it takes: the `hit`th (from 0) is dodged. */
  const dieAt = (hit: number) => Array.from({ length: hit + 1 }, (_, k) => (k === hit ? 0 : MISS));
  /** Dice for `rounds` rounds where only s0's first hit taken in the LAST round is dodged. */
  const diceFor = (rounds: number, dodge: boolean, patterns = false, hit = 0) =>
    Array.from({ length: rounds }, (_, i) => [
      // A pattern move (the sweep) draws its own 40 dice first.
      ...Array.from({ length: patterns ? 40 : 0 }, () => 0),
      ...roundDice(3, dodge && i === rounds - 1 ? { 0: dieAt(hit) } : {}),
    ]).flat();
  /** Damage the creatures deal in `rounds` rounds when nothing is dodged (the boss's pool is then ample). */
  const dealt = (rounds: number, o: Parameters<typeof play>[2] = {}, patterns = false): number => {
    const probe = play(row(), diceFor(rounds, false, patterns), o);
    const end = eventsOf(probe, 'round_end').find((e) => e.round === rounds);
    return 1_000_000 - (end?.bossHp ?? 0);
  };
  const hitsBy = (r: FightResult, source: string) =>
    eventsOf(r, 'boss_hit').filter((h) => h.source === source);

  it('a Riposte that fells the boss stops the sweep and the plain attack (no later hit, so none carries to a next room)', () => {
    const opts = { gimmicks: [sweepAll] };
    const d = dealt(1, opts, true);
    const r = play(row(), diceFor(1, true, true), {
      ...opts,
      extra: { bossHpPool: { max: 1_000_000, current: d + 1 } },
    });
    expect(procs(r, 'riposte')).toHaveLength(1);
    expect(r.bossHpEnd).toBe(0);
    // Only the dodged first hit of the sweep was made: no later hit, no plain attack.
    expect(hitsBy(r, 'gimmick').map((h) => h.target)).toEqual(['s0']);
    expect(hitsBy(r, 'attack')).toEqual([]);
    expect(r.perCreature['s1']?.damageTaken).toBe(0);
    expect(r.perCreature['s2']?.damageTaken).toBe(0);
  });

  it('a Riposte that takes the boss to the phase floor retreats it and stops its turn', () => {
    const opts = { gimmicks: [sweepAll] };
    const d = dealt(1, opts, true);
    const floor = 500_000;
    const r = play(row(), diceFor(1, true, true), {
      ...opts,
      extra: { bossHpPool: { max: 1_000_000, current: d + floor + 1 }, bossHpFloor: floor },
    });
    expect(eventsOf(r, 'retreat')).toHaveLength(1);
    expect(r.bossHpEnd).toBe(floor);
    expect(hitsBy(r, 'gimmick').map((h) => h.target)).toEqual(['s0']);
    expect(hitsBy(r, 'attack')).toEqual([]);
    expect(r.perCreature['s1']?.damageTaken).toBe(0);
    expect(r.perCreature['s2']?.damageTaken).toBe(0);
  });

  it('a second gimmick of the same turn does not fire after the boss fell', () => {
    const second = everyRound({ op: 'hit_zone', zone: 'front', power: 10_000 }, 'second');
    const opts = {
      gimmicks: [everyRound({ op: 'strike_highest_atk', power: 10_000 }, 'first'), second],
    };
    const d = dealt(1, opts);
    const r = play(row(), diceFor(1, true), {
      ...opts,
      extra: { bossHpPool: { max: 1_000_000, current: d + 1 } },
    });
    // The strike on the strongest creature (s0) is dodged and the Riposte fells the boss.
    expect(r.bossHpEnd).toBe(0);
    expect(eventsOf(r, 'gimmick').map((e) => e.gimmick)).toEqual(['first']);
    expect(hitsBy(r, 'attack')).toEqual([]);
  });

  it('an enrage strike stops at the creature whose Riposte felled the boss', () => {
    const extra = { enrage: { rounds: 1, powerBp: 10_000 } };
    const d = dealt(2, { extra });
    // The plain attack is the first hit s0 takes in the enrage round, the enrage strike its second.
    const r = play(row(), diceFor(2, true, false, 1), {
      extra: { ...extra, bossHpPool: { max: 1_000_000, current: d + 1 } },
    });
    expect(eventsOf(r, 'enrage')).toHaveLength(1);
    expect(r.bossHpEnd).toBe(0);
    expect(hitsBy(r, 'enrage').map((h) => h.target)).toEqual(['s0']);
    expect(hitsBy(r, 'attack')).toHaveLength(2); // one in each round
  });

  it('the plain attacks of a boss with several stop at the fall', () => {
    const extra = { bossAttacks: 2 };
    const d = dealt(1, { extra });
    // The plain attack goes to the front creature (s0), which dodges its first hit taken.
    const r = play(row(), diceFor(1, true), {
      extra: { ...extra, bossHpPool: { max: 1_000_000, current: d + 1 } },
    });
    expect(r.bossHpEnd).toBe(0);
    expect(hitsBy(r, 'attack')).toHaveLength(1);
  });

  it('does not change a fight where nothing is dodged', () => {
    const r = play(row(), diceFor(2, false, true), { gimmicks: [sweepAll], rounds: 2 });
    expect(hitsBy(r, 'gimmick')).toHaveLength(6);
    expect(hitsBy(r, 'attack')).toHaveLength(2);
  });
});

describe('the sheet', () => {
  it('rejects a bad number for the three lines', () => {
    const row = (mods: SlotMods) => [withMods('s0', mods)];
    expect(() => play(row({ riposteBp: -1 }), [])).toThrow(/riposteBp/);
    expect(() => play(row({ momentumBp: 1.5 }), [])).toThrow(/momentumBp/);
    expect(() => play(row({ slipstreamBp: 200_000 }), [])).toThrow(/slipstreamBp/);
  });
});
