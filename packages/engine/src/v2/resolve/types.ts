/**
 * What the resolver reads besides the content pack: the shipped species, raid bosses and dungeon foes, as far as the resolver needs them
 * (structural, so a test hands in three small lists and the game's `content` fits as it is). The combat v2 content itself is the pack
 * (`CombatV2Pack` from `@creatures/game/combat-v2`; a type import only, so the engine does not load the data).
 */
import type { Role } from '../types';

/** A shipped species (`content.creatures`). */
export interface ShippedSpecies {
  readonly id: string;
  readonly name: string;
  readonly element: string;
  readonly role: Role;
  readonly stage: number;
  readonly levelCap: number;
  readonly baseStats: { readonly hp: number; readonly atk: number; readonly spd: number };
  readonly growth: { readonly hp: number; readonly atk: number; readonly spd: number };
}

/** A shipped raid boss (`content.bosses`): the name, element and Speed the combat v2 boss keeps. */
export interface ShippedBoss {
  readonly id: string;
  readonly name: string;
  readonly element: string;
  readonly baseSpd?: number | undefined;
}

/** A shipped dungeon foe (`dungeonContent.foes`): its name, element, round count and the numbers the depth curve scales. */
export interface ShippedFoe {
  readonly id: string;
  readonly name: string;
  readonly element: string;
  readonly baseHp: number;
  readonly baseAtk: number;
  readonly baseSpd?: number | undefined;
  readonly rounds: number;
}

/** The shipped content the resolver reads (each function reads only the parts it names). */
export interface Shipped {
  readonly creatures: readonly ShippedSpecies[];
  readonly bosses: readonly ShippedBoss[];
  readonly foes: readonly ShippedFoe[];
}

/** A creature by form, Knack and talent ids at a level, in a place: what a line-up is made of before it is resolved into the engine's input. */
export interface Placement {
  readonly owner: string;
  readonly formId: string;
  readonly level: number;
  readonly knack?: string;
  readonly talents?: readonly string[];
  readonly row: number;
  readonly col: number;
}
