import type { Element, SupportFx } from '@creatures/game';
import { liveFightRules, type FightRules, type FightSlot } from '@creatures/engine';

/**
 * Study switches for the Guard and Support rules (docs/design/attack-patterns.md 4.3 and 4.7). They
 * live here, outside the engine, as `neutralGuards` does: a study changes the fight input, never the
 * rules of the engine.
 *
 * The simulator's fights always carry `rules: liveFightRules()` so they match live play; a study
 * changes that copy.
 */
export interface RoleStudy {
  /** Supports lose the Support role: no neighbour buff, no element effect (they fight as payoffs). */
  neutralSupports?: boolean;
  /**
   * Replaces the `supportFx` entry of each named element (an empty object switches that element's
   * effect off), so an effect can be measured apart from which species exist.
   */
  supportFx?: Partial<Record<Element, SupportFx>>;
}

/** The slot of a Support with the Support role taken away (study): it fights as a plain payoff. */
export function neutralSupport(slot: FightSlot): FightSlot {
  return { ...slot, role: 'payoff' };
}

/** The combat rules of a sim fight: the live rules, with the study's per-element overrides. */
export function studyRules(study: RoleStudy = {}): FightRules {
  const live = liveFightRules();
  if (study.supportFx === undefined) return live;
  const supportFx: Partial<Record<Element, SupportFx>> = { ...live.supportFx };
  for (const [element, fx] of Object.entries(study.supportFx) as [Element, SupportFx][]) {
    supportFx[element] = { ...fx };
  }
  return { ...live, supportFx };
}
