import { createSeededRng, type Gimmick, type Rng } from '@creatures/game';
import {
  simulateFight,
  type FightInput,
  type FightResult,
  type FightRules,
  type FightSlot,
} from '../src/index';
import { TEST_PACK, input, slot } from './helpers';

/**
 * An explicit rules table, for tests that pin their own numbers. The Guard is the one of before the
 * armor change (+30% HP, no armor), so older tests keep their numbers; tests of armor set both.
 */
export function rulesOf(partial: Partial<FightRules> = {}): FightRules {
  return {
    coverBp: 4_000,
    maxHitBp: 0,
    guardHpBp: 3_000,
    guardArmorBp: 0,
    supportFx: {},
    ...partial,
  };
}

type SlotOptions = NonNullable<Parameters<typeof slot>[1]>;

/** A row of `n` creatures `s0..s(n-1)` (Attack 1 unless set), with per-slot overrides. */
export function rowOf(
  n: number,
  overrides: Readonly<Record<number, SlotOptions>> = {},
  base: SlotOptions = {},
): FightSlot[] {
  return Array.from({ length: n }, (_, i) =>
    slot(`s${String(i)}`, { atk: 1, spd: 10, ...base, ...overrides[i] }),
  );
}

/** A gimmick that fires every round. */
export function everyRound(
  g: Omit<Extract<Gimmick, { op: 'sweep' }>, 'id' | 'name' | 'trigger'> | Record<string, unknown>,
  id = 'g',
): Gimmick {
  return { id, name: id, trigger: { eachRound: true }, ...g } as Gimmick;
}

/**
 * A finale of `rounds` rounds against a boss with the given gimmicks and Attack 100, left to right
 * (boss Attack 100 makes a power of 10000 deal 100). The boss pool cannot run out.
 */
export function fightWith(
  row: FightSlot[],
  gimmicks: Gimmick[],
  options: {
    rounds?: number;
    rules?: FightRules;
    bossAtk?: number;
    rng?: Rng;
    extra?: Partial<FightInput>;
  } = {},
): FightResult {
  const base = input(row);
  const inp: FightInput = {
    ...base,
    boss: { ...base.boss, gimmicks, finaleRounds: options.rounds ?? 1 },
    phase: 'finale',
    bossAtk: options.bossAtk ?? 100,
    bossHpPool: { max: 1_000_000_000, current: 1_000_000_000 },
    turnOrderOverride: 'left_to_right',
    ...(options.rules === undefined ? {} : { rules: options.rules }),
    ...options.extra,
  };
  return simulateFight(inp, options.rng ?? createSeededRng('pattern-test'), { pack: TEST_PACK });
}

/** The boss hits of the gimmick (not the plain attack), as [round, target, damage]. */
export function gimmickHits(r: FightResult): [number, string, number][] {
  return r.events.flatMap((e) =>
    e.t === 'boss_hit' && e.source === 'gimmick'
      ? [[e.round, e.target, e.damage] as [number, string, number]]
      : [],
  );
}
