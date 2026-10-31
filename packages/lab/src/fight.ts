/**
 * The combat v2 fight in the lab (docs/design/combat/proposals/001-combat-v2.md). The rules themselves live in `@creatures/engine/v2`
 * (phase 2 of docs/design/combat/engine-port.md); this module is the lab's side of that seam: it resolves a placement (form, Knack
 * and talent ids at a level) into the creature the engine takes, with the catalogue's content, and calls the engine with the lab's
 * rules numbers (`LAB_RULES`) and the shipped element chart. `fight` and `weekend` keep their signatures.
 */
import { content } from '@creatures/game';
import { combatV2 } from '@creatures/game/combat-v2';
import { createResolver, fightV2, weekendV2 } from '@creatures/engine/v2';
import { LAB_RULES } from './rules';
import { ELEMENTS, SHIPPED } from './species';
import type { BossDef, FightOptions, FightResult, Placement } from './types';

export { resistedElement } from '@creatures/engine/v2';

/**
 * Placements into the engine's creatures, for the game's combat v2 pack: stats at the level, the Knack's and talents' effects merged,
 * Max HP set. One resolver for the whole lab, so its memos (merged effects, stats by form and level) are worked out once.
 */
const resolver = createResolver(combatV2, SHIPPED);
const { resolve } = resolver;

/** The creatures of a line-up, as a fight takes them: each one's uid is its owner, form and place in the line (`owner:formId:index`). */
export const { placeFighters } = resolver;

/** What the engine reads besides the creatures: the lab's rules numbers, the shipped element chart and the elements' order. */
const world = {
  version: 2,
  rules: LAB_RULES,
  elements: ELEMENTS,
  chart: content.elementChart,
} as const;

/** One fight: the boss, the placed creatures, and the rounds of R8 (the engine's, `fightV2`). */
export function fight(
  boss: BossDef,
  placements: readonly Placement[],
  opts: FightOptions,
): FightResult {
  const { rng, ...options } = opts;
  return fightV2({ ...world, boss, fighters: placeFighters(placements), options }, rng);
}

/**
 * A raid weekend with attrition (R14, the engine's `weekendV2`): the placed creatures and each owner's bench are resolved here, and the
 * engine plays the stages and re-places the team between them.
 */
export function weekend(
  boss: BossDef,
  placements: readonly Placement[],
  bench: readonly Placement[],
  opts: FightOptions & { readonly stages?: number },
): { readonly stages: FightResult[]; readonly won: boolean; readonly replacements: number } {
  const { rng, ...options } = opts;
  return weekendV2(
    { ...world, boss, team: placements.map(resolve), bench: bench.map(resolve), options },
    rng,
  );
}
