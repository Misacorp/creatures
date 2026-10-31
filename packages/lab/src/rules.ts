import type { V2Rules } from '@creatures/engine/v2';
import { combatV2 } from '@creatures/game/combat-v2';

/**
 * Starting numbers of the combat v2 draft (docs/design/combat-v2.md): the game's `rules.json`
 * (`packages/game/src/combat-v2/data/`), checked against the engine's `V2Rules` by a type test. Every value is a lab knob
 * for the simulator to move, not a balanced number. Basis points (bp): 10000 is 100%. Each rule is described on
 * `V2Rules` in the engine.
 */
export const LAB_RULES: V2Rules = combatV2.rules;
