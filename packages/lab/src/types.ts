import type { Rng } from '@creatures/game';

export type Role = 'setter' | 'payoff' | 'guard' | 'support';

/** One creature in a lab fight. Its slot is (row, col): row 0 is the front. */
export interface Fighter {
  readonly uid: string;
  readonly owner: string;
  readonly formId: string;
  readonly name: string;
  readonly element: string;
  readonly role: Role;
  readonly maxHp: number;
  hp: number;
  readonly atk: number;
  readonly spd: number;
  /** Armour before Knacks (a silenced creature loses its Knack's armour). */
  readonly baseArmour: number;
  readonly knack: string | undefined;
  row: number;
  col: number;
  silencedTurns: number;
  store: number;
  boostBp: number;
  undodgeable: boolean;
  firstInterceptDone: boolean;
  damageDealt: number;
  damageThisRound: number;
  damageLastRound: number;
  /** The boss turn on which it last gained a reaction-fed Store point (at most one per boss turn). */
  lastStoreTurn: number;
}

/** Where the boss aims: an anchor slot, then a shape of slots around it (R2). */
export interface Pattern {
  readonly anchor: 'front' | 'strongest' | 'payoff' | 'random' | 'grudge';
  readonly shape: 'single' | 'line3' | 'row' | 'column' | 'rowEnds' | 'randomRow' | 'all';
  /** For rowEnds: how many from each end of each row. */
  readonly n?: number;
}

export interface BossMove {
  readonly id: string;
  readonly name: string;
  readonly pattern: Pattern;
  readonly powerBp: number;
  /** Due in rounds every, 2 x every, ... (and on boss turn `turn` of that round; default the last). */
  readonly every: number;
  readonly turn?: number;
  /** Silences instead of dealing damage, for this many of the victim's turns. */
  readonly silenceTurns?: number;
  /** A charged move: announced one boss turn ahead (Night Watch, Keep the Heat In read it). */
  readonly charged?: boolean;
}

export interface BossDef {
  readonly id: string;
  readonly name: string;
  readonly element: string;
  readonly hp: number;
  readonly atk: number;
  readonly armour: number;
  readonly spd: number;
  readonly rounds: number;
  /** The arena: rows are variable per boss (R8). The boss takes one turn after each row acts. */
  readonly rows: number;
  readonly cols: number;
  readonly plain: { readonly pattern: Pattern; readonly powerBp: number; readonly hits?: number };
  readonly moves: readonly BossMove[];
  readonly cards: readonly string[];
  readonly mods: BossMods;
}

/** Standing rules a rule card puts on the boss. */
export interface BossMods {
  /** No single creature hit deals more than this (Stone Skin). */
  readonly capPerHit?: number;
  /** After each boss turn, marks without Seal are shed (Clean Scales). */
  readonly shedMarks?: boolean;
  /** The first reaction after each boss turn sends its bonus back at the Payoff (Reflective Hide). */
  readonly reflectFirst?: boolean;
  /** Healing is scaled by this (Wither). */
  readonly healBp?: number;
  /** A mark left by a reaction cannot be cashed until after the next boss turn (Fizzle). */
  readonly fizzle?: boolean;
  /** In a raid weekend, from stage 2 the boss resists the reaction used most so far (Adapts). */
  readonly adapts?: boolean;
}

export interface Placement {
  readonly owner: string;
  readonly formId: string;
  readonly level: number;
  readonly knack?: string;
  readonly row: number;
  readonly col: number;
}

export interface FightOptions {
  readonly rng: Rng;
  /** Carried state from an earlier raid stage (attrition, R14): HP by uid. */
  readonly carryHp?: ReadonlyMap<string, number>;
  readonly bossHp?: number;
  readonly resistReaction?: string;
  readonly log?: boolean;
}

export interface FightEvent {
  readonly round: number;
  readonly turn: number;
  readonly kind: string;
  readonly text: string;
}

export interface FightResult {
  readonly damage: number;
  readonly bossHpLeft: number;
  readonly won: boolean;
  readonly wiped: boolean;
  readonly knockouts: number;
  readonly reactions: number;
  readonly reactionsByMark: Readonly<Record<string, number>>;
  readonly blocked: number;
  readonly dodges: number;
  readonly intercepts: number;
  readonly healed: number;
  readonly hpLeft: ReadonlyMap<string, number>;
  readonly fighters: readonly Fighter[];
  readonly events: readonly FightEvent[];
}
