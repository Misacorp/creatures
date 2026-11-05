import {
  VALLEY_ELEMENTS,
  VALLEY_RESOURCES,
  VALLEY_RULES,
  type AwayCurve as ValleyAwayCurve,
  type FindFamily as ValleyFindFamily,
  type KitName as ValleyKitName,
  type ValleyDestination,
  type ValleyElement,
  type ValleyResource,
  type ValleyRules,
} from '@creatures/game';

/**
 * The lab's rules are the valley's accepted numbers, which live in `@creatures/game` (`packages/game/src/valley/rules.ts`, the one
 * source of numbers, phase 5 step 0). The lab reads them as its defaults; the tuner's dials and `--set` work on copies and override
 * them. To change a number, change it there and run `pnpm --filter @creatures/econ report`.
 */
export const ELEMENTS = VALLEY_ELEMENTS;
export type Element = ValleyElement;
export const RESOURCES = VALLEY_RESOURCES;
export type Resource = ValleyResource;
export type KitName = ValleyKitName;
export type FindFamily = ValleyFindFamily;
export type Destination = ValleyDestination;
export const RULES = VALLEY_RULES;
export type Rules = ValleyRules;
export type AwayCurve = ValleyAwayCurve;
