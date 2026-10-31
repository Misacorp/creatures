/**
 * Content resolution for combat v2 (docs/design/combat/content-as-data.md, section 2): turning content ids into the engine's input.
 * Pure functions that take the content pack (`CombatV2Pack` from `@creatures/game/combat-v2`) and the shipped species, bosses and
 * foes as arguments, so a test builds a tiny pack and the lab and (in phase 4) the worker pass the game's.
 */
export { SUPPORT_SHAPE_FAMILY, createResolver, type FighterPack, type Resolver } from './fighters';
export { formStats, type FormStats } from './forms';
export {
  FOE_COLS,
  FOE_ROWS,
  applyCards,
  foeAt,
  foeStats,
  raidBoss,
  type RaidBossOptions,
} from './bosses';
export type { Placement, Shipped, ShippedBoss, ShippedFoe, ShippedSpecies } from './types';
