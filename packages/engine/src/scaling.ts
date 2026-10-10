import { RULES, type BossDef } from '@creatures/game';

/**
 * Boss HP and Attack for a fight.
 * HP = baseHp x N^0.9 x level factor; Attack = baseAtk x level factor, where N is the number of
 * signed-up players (minimum 1) and the level factors grow linearly with the average creature
 * level (config: `RULES.raid.scaling`). All steps floor to integers; the player factor is
 * floor(Math.pow(N, exponent) x 10000), see the note on `hpExponent` in the config.
 */
export function scaleBoss(
  boss: Pick<BossDef, 'baseHp' | 'baseAtk'>,
  signedUpCount: number,
  avgLevel: number,
): { maxHp: number; atk: number } {
  const n = Math.max(1, Math.floor(signedUpCount));
  const level = Math.max(1, Math.floor(avgLevel));
  const { hpExponent, hpPerLevelBp, atkPerLevelBp } = RULES.raid.scaling;
  const playerBp = Math.floor(Math.pow(n, hpExponent.num / hpExponent.den) * 10_000);
  const hpLevelBp = 10_000 + hpPerLevelBp * (level - 1);
  const atkLevelBp = 10_000 + atkPerLevelBp * (level - 1);
  const maxHp = Math.floor((Math.floor((boss.baseHp * playerBp) / 10_000) * hpLevelBp) / 10_000);
  const atk = Math.floor((boss.baseAtk * atkLevelBp) / 10_000);
  return { maxHp: Math.max(1, maxHp), atk: Math.max(1, atk) };
}
