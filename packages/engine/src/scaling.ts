import { RULES, rankAtkFactorBp, rankFactorBp, type BossDef } from '@creatures/game';

/**
 * Boss HP and Attack for a fight.
 *
 * HP = baseHp x N^e x rank factor, where N is the number of signed-up players (minimum 1,
 * e = the boss's own `hpExponent` or else `RULES.raid.scaling.hpExponent`) and the rank factor is the Boss Rank ladder (`rankFactorBp`).
 * Attack = baseAtk x the rank's Attack factor (`rankAtkFactorBp`); the head count does not scale
 * Attack. Every signed-up player counts once, whatever their level (see the note on `hpExponent`),
 * and the creatures' levels no longer move the boss at all.
 *
 * `rank` is the rank the boss fights at: the server's rank, or its eased rank in a Festival week
 * (`raidWeekPlan(...).effectiveRank`). It is floored and kept in 1..maxRank. All steps floor to
 * integers; the player factor is floor(Math.pow(N, exponent) x 10000).
 */
export function scaleBoss(
  boss: Pick<BossDef, 'baseHp' | 'baseAtk' | 'hpExponent'>,
  signedUpCount: number,
  rank: number,
): { maxHp: number; atk: number } {
  const n = Math.max(1, Math.floor(signedUpCount));
  const hpExponent = boss.hpExponent ?? RULES.raid.scaling.hpExponent;
  const playerBp = Math.floor(Math.pow(n, hpExponent.num / hpExponent.den) * 10_000);
  // BigInt for the product: a big boss at a high rank must not lose integer precision.
  const forPlayers = BigInt(Math.floor((boss.baseHp * playerBp) / 10_000));
  const maxHp = Number((forPlayers * BigInt(rankFactorBp(rank))) / 10_000n);
  const atk = Math.floor((boss.baseAtk * rankAtkFactorBp(rank)) / 10_000);
  return { maxHp: Math.max(1, maxHp), atk: Math.max(1, atk) };
}
