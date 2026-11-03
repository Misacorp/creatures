/**
 * The fight's types are the engine's (`@creatures/engine/v2`, phase 2 of docs/design/combat/engine-port.md); the lab re-exports them
 * so its modules keep importing them from here (a `Placement`, a creature by form, Knack and talent ids, is the resolver's). What
 * stays is the lab's own: `FightOptions` with the dice, which the lab's `fight` takes in one object.
 */
import type { Rng } from '@creatures/game';
import type { FightOptions as EngineFightOptions } from '@creatures/engine/v2';

export type { Placement } from '@creatures/engine/v2';

export { ESCALATION_FEEDS, FULL_STRENGTH_BP } from '@creatures/engine/v2';
export type {
  BossDef,
  BossMods,
  BossMove,
  Escalation,
  EscalationFeed,
  EscalationGrowth,
  EscalationState,
  FightEvent,
  FightResult,
  Fighter,
  FighterSpec,
  KillingBlow,
  Pattern,
  Role,
} from '@creatures/engine/v2';

/** The engine's fight options (carried state, damage potential, Determination, the log) and the dice. */
export interface FightOptions extends EngineFightOptions {
  readonly rng: Rng;
}
