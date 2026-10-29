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
  /** Hits made unsilenced that got past dodge and armour this fight (First Pounce counts the first). */
  hitsLanded: number;
  /** Catch Breath fired this fight, or earlier in the raid weekend (once per weekend). */
  secondWindDone: boolean;
  /** Hold On (Stubborn) fired this fight, or earlier in the raid weekend (once per weekend). */
  holdOnDone: boolean;
  row: number;
  col: number;
  silencedTurns: number;
  store: number;
  boostBp: number;
  undodgeable: boolean;
  /** The round of the last mark it left by intercepting (Primed by Pain: once a round); 0 for none yet. */
  lastPrimeRound: number;
  damageDealt: number;
  /** Damage its hits dealt to the boss, reactions included, counters not (Element Resistance reads it). */
  hitDamage: number;
  /** The boss turns done when Night Watch last took a Charged hit (it takes the first each boss turn). */
  watchTurn: number;
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
  readonly anchor: 'front' | 'strongest' | 'payoff' | 'random' | 'grudge' | 'back' | 'weakest';
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
   * rowEnds: how many arena slots from each end of each row (an empty slot is skipped). scatter: how many different
   * creatures are hit. chain: how many jumps after the anchor. columns, rows: how many neighbouring columns or rows.
   */
  readonly n?: number;
  /**
   * `n` is for this many columns of the arena and grows with its width: the count is `n x columns / perColumns`,
   * rounded, at least 1 (a scatter of 4 per 4 columns hits 10 creatures in an arena 10 slots wide). Without it `n` is fixed.
   */
  readonly perColumns?: number;
  /** chain: each jump deals this share (bp) of the hit before it. */
  readonly decayBp?: number;
  /**
   * single, line3, cross: how many different creatures the move is aimed at, each by the same anchor rule (the best match,
   * then the next best). With `perColumns` the count grows with the arena's width, so an aimed hit does not thin out in a
   * wide raid. Default 1.
   */
  readonly anchors?: number;
}

/**
 * Strength (Misa, 2026-10-29): every rule card and every boss gate has a strength from 0 to 10000 bp instead of being on or
 * off, so a card *asks* for a tool at low strength and *requires* it at high strength. 10000 is the full card. The number
 * is read by the engine (`fight.ts`) where it says so below; every default is 10000, so a boss without one is unchanged.
 */
export const FULL_STRENGTH_BP = 10_000;

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
  /**
   * The gate's strength (bp, default the boss's `strengthBp`). A silence hits that share of the slots it picks (each target
   * rolls) and lasts that share of its turns (at least one); a one-shot (`oneShotBp`) deals that share of the target's Max HP.
   */
  readonly strengthBp?: number;
  /**
   * A one-shot (Judgement Bolt): instead of Attack x power it deals this share (bp) of the target's Max HP at full strength,
   * `strengthBp` of it at a lower one (a heavy hit). Cuts, cover and armour still come off it.
   */
  readonly oneShotBp?: number;
  /**
   * A Charged (Wind-up) move. Every move whose targets use a roll (a random anchor, scatter, a random row) is announced
   * at round start, Charged or not: its slots are rolled and shown, and it lands on those creatures on its boss turn and
   * never re-aims (a creature knocked out by then is skipped). Being Charged only changes how its hits are dodged and
   * intercepted (full-chance dodge; a Guard takes one only through an effect that says so). A Guard takes a Charged hit only through an effect that says so
   * (Night Watch, Intercept area hits too); a Row Ward, Keep the Heat In and Brace read it.
   */
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

/** What each step of an escalation adds to the boss. Growth adds up in a straight line: step 3 adds three times what step 1 does. */
export interface EscalationGrowth {
  /** Attack, in bp of the boss's own. */
  readonly atkBp?: number;
  /** Dodge chance, in bp, on top of its Speed's. */
  readonly dodgeBp?: number;
  /** Flat armour; a negative step lowers it (Thornmother's bark cracks), never below 0. */
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
 * it stops at `cap` steps, and each step `grow`s the boss (R22, the escalation rules):
 * - Steps apply only at round start, after the round-start Knacks and before the Charged announcements, at most one step
 *   per round, and each is announced in the log first. An optional `phase` adds moves once the feed has reached `atStep`
 *   steps' worth of units: announced at that round start, applied at the next, and Mired does not slow it (a phase is not a step).
 * - Step, phase and the feed's count carry across a raid weekend's stages like the boss's HP; event feeds keep counting
 *   (`rounds` too: the weekend's rounds, not the stage's).
 * - Mired slows it, it does not freeze it: each Mired stack on the boss at round start raises the units the next step
 *   needs by `LAB_RULES.miredSlowsEscalationBp` of `per` (a quarter of a step's units per stack). A step that is due but
 *   not yet through the slowed bar comes in a later round, when the Mired has faded.
 * - Feeds: `reactions` it takes, `hpLost` (units are bp of its full HP, the weekend's shared HP in a raid), `rounds`
 *   passed, `crits` it takes, its `dodges`, creatures it `knockouts`, marks it `shed`.
 */
export interface Escalation {
  readonly name: string;
  readonly feed: EscalationFeed;
  readonly per: number;
  /**
   * `per` is for this many columns of the arena and grows with its width (`per x columns / perColumns`, at least 1): a raid
   * of more players feeds an event feed (reactions, crits, dodges, knockouts, marks shed) faster, so it needs more units per
   * step. Not for `hpLost` and `rounds`, which do not grow with the number of creatures.
   */
  readonly perColumns?: number;
  readonly cap: number;
  readonly grow: EscalationGrowth;
  /** Each step grows the boss by this share (bp, default the boss's `strengthBp`) of what `grow` says. */
  readonly strengthBp?: number;
  readonly phase?: {
    /** The phase starts when the feed has `atStep * per` units (announced a round ahead; Mired does not delay it). */
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
  /**
   * The strength of the boss's rule cards and gates (bp, default 10000 = full): reflection returns this share of the
   * reaction's bonus, Shake It Off clears this share of the Mired, Clean Scales and Fizzle take hold on this share of the
   * marks, Reaction Resistance halves the bonus by this share (a cut of half at full strength), Element Resistance cuts a quarter
   * at full strength and this share of that below it; cards that change a number (armour, Speed, the cap, healing, an
   * added move's power) are built with it (`CardDef.apply`).
   */
  readonly strengthBp?: number;
  /**
   * The level of the players' creatures in a raid weekend against this boss when a pick names none (default `LEVEL`). Boss Rank
   * (Misa, 2026-10-29) stands for a server's whole roster, not only the boss's numbers: an early rank's server has lower-level
   * creatures, so its boss can be clearly softer in HP and Attack than the high rank's without being a walkover.
   */
  readonly rosterLevel?: number;
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
  /** The element the boss resists this fight (Element Resistance: their hits' base damage is `LAB_RULES.adaptElementBp` of itself; counters are not cut). */
  readonly resistElement?: string;
  /** Carried from the earlier stages of a raid weekend: Catch Breath already used (uids of this stage's fighters). */
  readonly carryWindDone?: ReadonlySet<string>;
  /** Carried from the earlier stages of a raid weekend: Stubborn already used (once per weekend; uids of this stage's fighters). */
  readonly carryHoldOnDone?: ReadonlySet<string>;
  /** Carried from the earlier stages of a raid weekend: the boss's escalation (R22). */
  readonly carryEscalation?: {
    readonly step: number;
    readonly phase: boolean;
    /** The phase change was announced and applies at the next round start. */
    readonly phaseNext?: boolean;
    readonly count: number;
  };
  readonly log?: boolean;
}

export interface FightEvent {
  readonly round: number;
  readonly turn: number;
  readonly kind: string;
  readonly text: string;
  /** On an `announce` event of a move: the move's id and the (row, slot) of each creature it will land on (0-based). */
  readonly move?: string;
  readonly slots?: readonly (readonly [number, number])[];
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
  /** True from the round start the phase change was announced until it applies, one round later. */
  readonly phaseNext: boolean;
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
