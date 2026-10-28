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
  readonly talents: readonly string[];
  /** The Knack's and the talents' effects together (silence blanks all of it, R12). */
  readonly fxAll: import('./knacks').KnackFx;
  /** Turn hits made this fight (for first-hit effects). */
  /** Hits made unsilenced that got past dodge and armour this fight (First Pounce counts the first). */
  hitsLanded: number;
  /** Catch Breath fired this fight. */
  secondWindDone: boolean;
  /** Hold On fired this fight. */
  holdOnDone: boolean;
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
  lastStoreRound: number;
  /** Hits it has made this fight, for rhythms (Steady Rhythm: every third is a crit). */
  hitsMade: number;
  /** Set when it dodges unsilenced; its next unsilenced hit uses it up (Momentum). */
  momentum: boolean;
  /** A creature beside it was knocked out this fight while it was not silenced (Rally Cry). */
  avenged: boolean;
  /** Marks it has left this fight (Deep Ink: the first starts bigger). */
  marksLeft: number;
  /** Times its Support verb has run (Bright Boost: every second is doubled). */
  verbsUsed: number;
  /** How often each effect's condition held or its trigger fired this fight, by effect field (the report's "holds"). */
  fires: Record<string, number>;
}

/** Where the boss aims: an anchor slot, then a shape of slots around it (R2). */
export interface Pattern {
  readonly anchor:
    | 'front'
    | 'strongest'
    | 'payoff'
    | 'random'
    | 'grudge'
    | 'back'
    | 'weakest';
  readonly shape:
    | 'single'
    | 'line3'
    | 'row'
    | 'column'
    | 'rowEnds'
    | 'randomRow'
    | 'all'
    | 'scatter'
    | 'chain'
    | 'columns'
    | 'rows'
    | 'cross'
    | 'checker';
  /**
   * rowEnds: how many slots from each end of each row. scatter: how many different creatures are
   * hit. chain: how many jumps after the anchor. columns, rows: how many neighbouring columns or rows.
   */
  readonly n?: number;
  /** chain: each jump deals this share (bp) of the hit before it. */
  readonly decayBp?: number;
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

/** What fills an escalation (the boss's Store). */
export const ESCALATION_FEEDS = [
  'reactions',
  'hpLost',
  'rounds',
  'crits',
  'dodges',
  'knockouts',
  'shed',
] as const;
export type EscalationFeed = (typeof ESCALATION_FEEDS)[number];

/** What each step of an escalation adds to the boss (steps multiply: step 3 adds three times). */
export interface EscalationGrowth {
  /** Attack, in bp of the boss's own. */
  readonly atkBp?: number;
  /** Dodge chance, in bp, on top of its Speed's. */
  readonly dodgeBp?: number;
  /** Flat armour. */
  readonly armour?: number;
  /** More plain attacks on each boss turn. */
  readonly hits?: number;
  /** More jumps on every chain move. */
  readonly jumps?: number;
  /** More creatures hit by every scatter move (meteors). */
  readonly targets?: number;
  /** More neighbouring columns or rows on every columns or rows move. */
  readonly area?: number;
}

/**
 * The boss's Store (Misa, 2026-10-28), one rule with data per boss: it fills from a `feed`, every `per` units is a step,
 * it stops at `cap` steps, and each step `grow`s the boss. A step is announced in the log at round start before it
 * applies; an optional `phase` adds moves from a step on. A boss with Mired at round start does not step up that round
 * (Mired freezes it, the answer). Feeds: `reactions` it takes, `hpLost` (units are bp of its full HP, the weekend's shared
 * HP in a raid), `rounds` passed, `crits` it takes, its `dodges`, creatures it `knockouts`, marks it `shed`.
 */
export interface Escalation {
  readonly name: string;
  readonly feed: EscalationFeed;
  readonly per: number;
  readonly cap: number;
  readonly grow: EscalationGrowth;
  readonly phase?: {
    readonly atStep: number;
    readonly name: string;
    readonly moves: readonly BossMove[];
  };
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
  /** The boss's Store, if it has one. */
  readonly escalation?: Escalation;
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
  /** Every this many rounds the boss clears all its debuffs at the end of the round; announced at round start (Shake It Off). */
  readonly shakeEvery?: number;
  /** In a raid weekend, from stage 2 the boss resists the reaction used most so far (Adapts). */
  readonly adapts?: boolean;
  /** In a raid weekend, from stage 2 the boss takes less from the element that dealt the most damage so far (Element Resistance). */
  readonly adaptsElement?: boolean;
}

export interface Placement {
  readonly owner: string;
  readonly formId: string;
  readonly level: number;
  readonly knack?: string;
  readonly talents?: readonly string[];
  readonly row: number;
  readonly col: number;
}

export interface FightOptions {
  readonly rng: Rng;
  /** Carried state from an earlier raid stage (attrition, R14): HP by uid. */
  readonly carryHp?: ReadonlyMap<string, number>;
  readonly bossHp?: number;
  readonly resistReaction?: string;
  /** The element the boss resists this fight (Element Resistance: its creatures' hits deal `LAB_RULES.adaptElementBp` of their damage). */
  readonly resistElement?: string;
  readonly log?: boolean;
}

export interface FightEvent {
  readonly round: number;
  readonly turn: number;
  readonly kind: string;
  readonly text: string;
}

export interface EscalationState {
  readonly name: string;
  readonly feed: EscalationFeed;
  /** Feed units so far this fight (for `hpLost` and `rounds`, the figure it was last read at). */
  readonly count: number;
  readonly step: number;
  readonly cap: number;
  /** The count at which the next step applies, or null at the cap. */
  readonly nextAt: number | null;
  /** True once the phase change has applied. */
  readonly phase: boolean;
}

/** Who defeated the boss (R21 draft): the creature whose hit, counter or Cull took its last HP. */
export interface KillingBlow {
  readonly uid: string;
  readonly owner: string;
  readonly formId: string;
  readonly name: string;
  readonly round: number;
  /** True when Cull, not damage, finished it. */
  readonly culled: boolean;
}

export interface FightResult {
  readonly damage: number;
  readonly bossHpLeft: number;
  readonly won: boolean;
  /** The creature that landed the killing blow (no loot in the lab), or null if the boss lived. */
  readonly killingBlow: KillingBlow | null;
  readonly wiped: boolean;
  readonly knockouts: number;
  readonly reactions: number;
  readonly reactionsByMark: Readonly<Record<string, number>>;
  readonly blocked: number;
  readonly dodges: number;
  readonly intercepts: number;
  readonly healed: number;
  readonly hpLeft: ReadonlyMap<string, number>;
  /** The boss's escalation at the end of the fight: its count, step, and what the next step needs (readable state for the board). */
  readonly escalation: EscalationState | null;
  readonly fighters: readonly Fighter[];
  readonly events: readonly FightEvent[];
}
