import { RULES } from '@creatures/game';
import type { EnrageRules, FightRules, PhaseId } from './types';

/**
 * The combat rules a live fight is built with today, copied out of `RULES.combat` so the stored
 * input keeps what the fight used (`FightInput.rules`), as `luck` does.
 */
export function liveFightRules(): FightRules {
  const c = RULES.combat;
  return {
    coverBp: c.coverBp,
    maxHitBp: c.maxHitBp,
    guardHpBp: c.guard.hpBp,
    guardArmorBp: c.guard.armorBp,
    supportFx: Object.fromEntries(Object.entries(c.supportFx).map(([k, fx]) => [k, { ...fx }])),
  };
}

/**
 * The boss HP a raid phase cannot go below (`FightInput.bossHpFloor`): the pool's maximum less the
 * phase's `clearAtLossBp`, rounded up so that reaching the floor always means the phase is cleared.
 * 0 for the finale (the boss can fall).
 */
export function phaseFloorHp(poolMax: number, phase: PhaseId): number {
  if (phase === 'finale') return 0;
  const def = RULES.raid.phases.find((p) => p.id === phase);
  if (def === undefined) throw new Error(`unknown phase ${phase}`);
  const lossNeeded = Math.ceil((poolMax * def.clearAtLossBp) / 10_000);
  return Math.max(0, poolMax - lossNeeded);
}

/** The enrage of a raid stage (`FightInput.enrage`): the finale only. */
export function raidEnrage(phase: PhaseId): EnrageRules | undefined {
  if (phase !== 'finale') return undefined;
  return { rounds: RULES.raid.enrage.rounds, powerBp: RULES.raid.enrage.powerBp };
}

/** The enrage of a dungeon boss room (`FightInput.enrage`); undefined when it is switched off. */
export function dungeonBossEnrage(): EnrageRules | undefined {
  const e = RULES.dungeon.enrage;
  return e.enabled ? { rounds: e.rounds, powerBp: e.powerBp } : undefined;
}
