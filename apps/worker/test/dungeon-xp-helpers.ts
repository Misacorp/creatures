import { RULES, dungeonExperience, emptyEarned, type XpBoostPart } from '@creatures/game';

/** The part of a room-history entry the experience reads. */
export interface XpStep {
  node: string;
  kind: string;
  result: string;
  cleared?: boolean;
  /** A fight the Sealed Vault marked: it paid as an epic fight. */
  sealed?: boolean;
  outcome?: string;
}

/**
 * The plain experience (before any treat or weather) a creature earned from the rooms in `history`, worked
 * out from what the log says happened and the rules' amounts: a cleared fight by its kind (an Undercroft
 * boss, whose node id starts with `u`, is a keeper), a cache, and the "gains N experience" lines of mystery
 * rooms. It assumes the creature stood in the row, and standing, for every entry given.
 */
export function baseExperienceOf(history: readonly XpStep[]): number {
  const D = RULES.experience.dungeon;
  let base = 0;
  for (const step of history) {
    if (step.result === 'fight' && step.cleared === true) {
      if (step.sealed === true) base += D.epic;
      else if (step.kind === 'boss') base += step.node.startsWith('u') ? D.keeper : D.boss;
      else if (step.kind === 'elite') base += D.elite;
      else if (step.kind === 'epic') base += D.epic;
      else base += D.fight;
    } else if (step.result === 'cache') {
      base += D.cache;
    } else if (step.result === 'event') {
      for (const m of (step.outcome ?? '').matchAll(/gains (\d+) experience/g)) {
        base += Number(m[1]);
      }
    }
  }
  return base;
}

/** What the run paid for `history` after the given multiplier parts (none: the plain amount). */
export function paidFor(history: readonly XpStep[], parts: readonly XpBoostPart[] = []): number {
  return dungeonExperience({ ...emptyEarned(), base: baseExperienceOf(history) }, parts);
}
