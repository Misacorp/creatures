/**
 * The one "Abilities: Auto" chip on the Raid tab. It reads "Auto" while the player has changed
 * nothing, and says briefly what they changed otherwise ("Shield Wall · 1 manual"). Pure.
 */
import { abilityName } from './live';
import type { RaidView } from './raid-api';

interface AbilitiesSummary {
  /** True once the player picked their own basic ability or turned any Auto fire off. */
  customised: boolean;
  /** How many of the abilities they can use (unlocked) wait for them instead of firing by themselves. */
  manual: number;
  /** What follows "Abilities:", for example "Auto" or "Shield Wall · 1 manual". */
  text: string;
}

export function abilitiesSummary(
  you: Pick<RaidView['you'], 'ability' | 'abilities'>,
): AbilitiesSummary {
  const manual = you.abilities.filter((a) => a.unlocked && !a.autoFire).length;
  const picked =
    you.ability !== null && you.ability.chosen ? abilityName(you.ability.abilityId) : null;
  const parts: string[] = [];
  if (picked !== null) parts.push(picked);
  if (manual > 0) parts.push(`${String(manual)} manual`);
  return {
    customised: parts.length > 0,
    manual,
    text: parts.length === 0 ? 'Auto' : parts.join(' · '),
  };
}
