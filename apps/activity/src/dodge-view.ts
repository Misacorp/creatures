/**
 * The dodge numbers the screens show. The chance is the engine's own rule (`creatureDodgeBp`): the
 * Speed part (`Speed x perSpeedBp`) plus the flat dodge of gear and talents, capped at `maxBp`. The
 * screens show dodge only while `RULES.combat.dodge.enabled` is true; until then the game does not
 * mention it.
 */
import { RULES } from '@creatures/game';

export interface DodgeRules {
  enabled: boolean;
  perSpeedBp: number;
  maxBp: number;
}

/** A fighter's dodge chance in basis points: `min(maxBp, floor(spd x perSpeedBp) + flatBp)`. */
export function dodgeChanceBp(
  spd: number,
  flatBp = 0,
  rules: DodgeRules = RULES.combat.dodge,
): number {
  return Math.max(0, Math.min(rules.maxBp, Math.floor(spd * rules.perSpeedBp) + flatBp));
}

/** "12%", "11.7%", "0%": basis points as a percentage with at most one decimal. */
export function dodgeText(bp: number): string {
  const tenths = Math.floor(bp / 10) / 10;
  return `${String(tenths)}%`;
}

/**
 * The text of a creature's Dodge row ("12%"), or null while dodge is off (the page then shows no
 * Dodge row at all).
 */
export function creatureDodgeText(
  creature: { statsWithGear: { spd: number }; dodgeBp: number },
  rules: DodgeRules = RULES.combat.dodge,
): string | null {
  if (!rules.enabled) return null;
  return dodgeText(dodgeChanceBp(creature.statsWithGear.spd, creature.dodgeBp, rules));
}

/** The text of a foe's Dodge line from its base Speed, or null while dodge is off or it has no Speed. */
export function foeDodgeText(
  baseSpd: number | undefined,
  rules: DodgeRules = RULES.combat.dodge,
): string | null {
  if (!rules.enabled || baseSpd === undefined || baseSpd <= 0) return null;
  return dodgeText(dodgeChanceBp(baseSpd, 0, rules));
}
