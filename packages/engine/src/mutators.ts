import type { Element, Rng, Role } from '@creatures/game';
import type { PhaseId } from './types';

/** Read-only snapshot of a creature handed to hooks. Changing it has no effect on the fight. */
export interface CreatureView {
  id: string;
  ownerId: string | null;
  element: Element;
  role: Role;
  position: number;
  hp: number;
  maxHp: number;
  alive: boolean;
}

interface BaseContext {
  readonly phase: PhaseId;
  /** 0 before round 1. */
  readonly round: number;
  readonly bossHp: number;
  readonly bossMaxHp: number;
  readonly mark: Element | null;
  readonly creatures: readonly CreatureView[];
  /** The fight's injected RNG. Drawing from it keeps the fight deterministic for a given seed. */
  readonly rng: Rng;
}

export type FightStartContext = BaseContext;
export type RoundStartContext = BaseContext;
export type RoundEndContext = BaseContext;

export interface BeforeHitContext extends BaseContext {
  readonly creature: CreatureView;
  readonly matchupBp: number;
}

export interface ReactionContext extends BaseContext {
  readonly reaction: string;
  readonly payoff: CreatureView;
  readonly reflected: boolean;
}

export interface KnockoutContext extends BaseContext {
  readonly creature: CreatureView;
}

export interface FightEndContext extends BaseContext {
  readonly cleared: boolean;
}

/**
 * Hooks can only change numbers, through these return values (basis points, integers; anything
 * else is ignored and results are clamped). They cannot touch the fight state, the clock or I/O.
 */
export interface MutatorHooks {
  /** `bossDamageBonusBp`: extra (or less) damage the boss deals for the whole fight. */
  onFightStart(ctx: FightStartContext): { bossDamageBonusBp?: number } | void;
  /** `damageBonusBp`: added to every creature hit this round. */
  onRoundStart(ctx: RoundStartContext): { damageBonusBp?: number } | void;
  /** `damageBonusBp`: added to this hit's damage bonus. */
  onBeforeHit(ctx: BeforeHitContext): { damageBonusBp?: number } | void;
  /** `bonusBp`: added to the reaction's bonus damage multiplier. */
  onReaction(ctx: ReactionContext): { bonusBp?: number } | void;
  onKnockout(ctx: KnockoutContext): void;
  onRoundEnd(ctx: RoundEndContext): void;
  onFightEnd(ctx: FightEndContext): void;
}

/**
 * A named module registered in code and switched on by a content flag (`FightInput.mutators`).
 * Disabled and unknown mutators never run. Enabled ones run in the order of the flag list.
 */
export interface Mutator {
  id: string;
  hooks: Partial<MutatorHooks>;
}

/** Clamp a hook-supplied basis-point delta to a safe integer, or 0 if it is not a number. */
export function sanitizeBp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(-10_000, Math.min(100_000, Math.trunc(value)));
}
