/**
 * The combat v2 rules (docs/design/combat/): a second rules version beside v1, which is not touched. Import it as
 * `@creatures/engine/v2` so its names (`BossDef`, `FightResult`, ...) do not meet v1's, which the package root exports.
 */
export { applyCard, type CardFlag, type CardModNumber, type CardOp } from './cards';
export { withPhase } from './escalation';
export { fightV2 } from './fight';
export { carryKey, stageV2, startCarry } from './stage';
export { resistedElement, weekendV2 } from './weekend';
export {
  ADDITIVE_FIELDS,
  GEAR_FIELDS,
  GEAR_SHARES,
  STAT_FIELDS,
  mergeFx,
  type KnackFx,
} from './effects';
export * from './resolve';
export { previewMoves, type MovePreview } from './preview';
export * from './types';
